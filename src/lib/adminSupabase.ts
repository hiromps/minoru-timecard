import { supabase } from './supabase';
import { calculateWorkTimeAndStatus } from '../utils/workTimeUtils';

export interface TimeRecordWithEmployee {
  id: number;
  employee_id: string;
  employee_name?: string;
  record_date: string;
  clock_in_time: string | null;
  clock_out_time: string | null;
  work_hours: number;
  status: string;
  is_manual_entry: boolean;
  approved_by?: string;
  created_at: string;
  updated_at: string;
}

// 全打刻記録を取得（管理者用）
export const getAllTimeRecords = async (): Promise<TimeRecordWithEmployee[]> => {
  try {
    console.log('Fetching time records...');
    
    // まず基本的なtime_recordsデータを取得
    const { data: timeRecordsData, error: timeRecordsError } = await supabase
      .from('time_records')
      .select(`
        id,
        employee_id,
        record_date,
        clock_in_time,
        clock_out_time,
        work_hours,
        status,
        is_manual_entry,
        approved_by,
        created_at,
        updated_at
      `)
      .order('record_date', { ascending: false })
      .order('employee_id');

    if (timeRecordsError) {
      console.error('Error fetching time records:', timeRecordsError);
      throw new Error(`打刻記録の取得に失敗しました: ${timeRecordsError.message}`);
    }

    console.log('Time records fetched:', timeRecordsData?.length || 0);

    // 社員データを別途取得
    const { data: employeesData, error: employeesError } = await supabase
      .from('employees')
      .select('employee_id, name');

    if (employeesError) {
      console.warn('Warning: Could not fetch employees data:', employeesError);
    }

    console.log('Employees data fetched:', employeesData?.length || 0);

    // 社員データをマップに変換
    const employeesMap = new Map();
    if (employeesData) {
      employeesData.forEach((emp: any) => {
        employeesMap.set(emp.employee_id, emp.name);
      });
    }

    // データ構造を整形
    const formattedData = timeRecordsData?.map((record: any) => ({
      id: record.id,
      employee_id: record.employee_id,
      employee_name: employeesMap.get(record.employee_id) || `社員${record.employee_id}`,
      record_date: record.record_date,
      clock_in_time: record.clock_in_time,
      clock_out_time: record.clock_out_time,
      work_hours: record.work_hours || 0,
      status: record.status,
      is_manual_entry: record.is_manual_entry || false,
      approved_by: record.approved_by,
      created_at: record.created_at,
      updated_at: record.updated_at
    })) || [];

    console.log('Formatted data ready:', formattedData.length);
    return formattedData;
  } catch (error) {
    console.error('Error in getAllTimeRecords:', error);
    throw error;
  }
};

// 打刻記録を修正（削除して再作成）
export const correctTimeRecordByDeleteAndCreate = async (
  employee_id: string,
  record_date: string,
  clock_in_time: string,
  clock_out_time: string,
  reason: string
): Promise<void> => {
  try {
    // 時間フォーマットを正しいISO形式に変換
    const formatToISO = (datetimeLocal: string): string => {
      if (!datetimeLocal) return '';
      // YYYY-MM-DDTHH:MM形式をISO形式に変換
      return new Date(datetimeLocal).toISOString();
    };

    const formattedClockIn = clock_in_time ? formatToISO(clock_in_time) : null;
    const formattedClockOut = clock_out_time ? formatToISO(clock_out_time) : null;

    // トランザクション的な処理のため、まず削除
    const { error: deleteError } = await supabase
      .from('time_records')
      .delete()
      .eq('employee_id', employee_id)
      .eq('record_date', record_date);

    if (deleteError) {
      console.error('Error deleting record:', deleteError);
      throw new Error('既存レコードの削除に失敗しました');
    }

    // 新しいロジックで勤務時間とステータスを計算
    const workTimeResult = calculateWorkTimeAndStatus(
      formattedClockIn,
      formattedClockOut,
      "09:00:00", // 標準労働開始時刻
      "17:00:00"  // 標準労働終了時刻
    );
    
    const work_hours = workTimeResult.actualWorkHours;
    const status = workTimeResult.status;

    // 新しいレコードを作成
    const { data: newRecord, error: insertError } = await supabase
      .from('time_records')
      .insert({
        employee_id,
        record_date,
        clock_in_time: formattedClockIn,
        clock_out_time: formattedClockOut,
        work_hours,
        status,
        is_manual_entry: true
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting record:', insertError);
      throw new Error('新しいレコードの作成に失敗しました');
    }

    // 監査ログを記録
    await logCorrectionAction(employee_id, record_date, 'DELETE', reason, newRecord?.id);

  } catch (error) {
    console.error('Error in correctTimeRecordByDeleteAndCreate:', error);
    throw error;
  }
};

// 打刻記録を更新
export const updateTimeRecord = async (
  employee_id: string,
  record_date: string,
  clock_in_time: string,
  clock_out_time: string,
  reason: string
): Promise<void> => {
  try {
    // 時間フォーマットを正しいISO形式に変換
    const formatToISO = (datetimeLocal: string): string => {
      if (!datetimeLocal) return '';
      // YYYY-MM-DDTHH:MM形式をISO形式に変換
      return new Date(datetimeLocal).toISOString();
    };

    const formattedClockIn = clock_in_time ? formatToISO(clock_in_time) : null;
    const formattedClockOut = clock_out_time ? formatToISO(clock_out_time) : null;

    // 新しいロジックで勤務時間とステータスを計算
    const workTimeResult = calculateWorkTimeAndStatus(
      formattedClockIn,
      formattedClockOut,
      "09:00:00", // 標準労働開始時刻
      "17:00:00"  // 標準労働終了時刻
    );
    
    const work_hours = workTimeResult.actualWorkHours;
    const status = workTimeResult.status;

    const { data: updatedRecord, error } = await supabase
      .from('time_records')
      .update({
        clock_in_time: formattedClockIn,
        clock_out_time: formattedClockOut,
        work_hours,
        status,
        is_manual_entry: true,
        updated_at: new Date().toISOString()
      })
      .eq('employee_id', employee_id)
      .eq('record_date', record_date)
      .select()
      .single();

    if (error) {
      console.error('Error updating record:', error);
      throw new Error('レコードの更新に失敗しました');
    }

    // 監査ログを記録
    await logCorrectionAction(employee_id, record_date, 'UPDATE', reason, updatedRecord?.id);

  } catch (error) {
    console.error('Error in updateTimeRecord:', error);
    throw error;
  }
};

// 監査ログの記録
const logCorrectionAction = async (
  employee_id: string,
  record_date: string,
  action: string,
  reason: string,
  record_id?: number
): Promise<void> => {
  try {
    // reason列が存在しない場合のフォールバック処理
    const logData: any = {
      table_name: 'time_records',
      record_id: `${employee_id}-${record_date}`,
      action: action,
      new_values: {
        employee_id,
        record_date,
        action,
        reason,
        record_id,
        admin_action: true,
        timestamp: new Date().toISOString()
      }
    };

    // reason列が存在する場合のみ追加
    try {
      // まずreason列ありで試行
      const { error: insertError } = await supabase
        .from('audit_logs')
        .insert({
          ...logData,
          reason
        });

      if (insertError) {
        // reason列が存在しない場合、new_valuesに含めて再試行
        if (insertError.message?.includes('reason') && insertError.message?.includes('does not exist')) {
          console.log('reason列が存在しないため、new_valuesに含めて記録します');
          await supabase
            .from('audit_logs')
            .insert(logData);
        } else {
          throw insertError;
        }
      }
    } catch (retryError) {
      console.error('Error logging correction action:', retryError);
      // 監査ログの失敗は処理を停止させない
    }
  } catch (error) {
    console.error('Error in logCorrectionAction:', error);
  }
};

// 社員一覧を取得
export const getEmployees = async () => {
  try {
    console.log('Fetching employees...');
    
    const { data, error } = await supabase
      .from('employees')
      .select('id, employee_id, name')
      .eq('is_active', true)
      .order('employee_id');

    if (error) {
      console.error('Error fetching employees:', error);
      throw new Error(`社員データの取得に失敗しました: ${error.message}`);
    }

    console.log('Employees fetched successfully:', data?.length || 0);
    return data || [];
  } catch (error) {
    console.error('Error in getEmployees:', error);
    throw error;
  }
};