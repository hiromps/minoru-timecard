import { supabase, isDevMode } from './supabase';
import { calculateWorkTimeAndStatus, applyDirectWorkOverride } from '../utils/workTimeUtils';
import { getJSTMonthRange, localDateTimeToISO } from '../utils/dateUtils';
import { demoTimeRecordService, demoEmployeeService } from './demoDatabase';

export interface TimeRecordWithEmployee {
  id: number;
  employee_id: string;
  employee_name?: string;
  record_date: string;
  clock_in_time: string | null;
  clock_out_time: string | null;
  work_hours: number;
  overtime_minutes: number;
  status: string;
  is_direct_work?: boolean;
  is_manual_entry: boolean;
  approved_by?: string;
  created_at: string;
  updated_at: string;
  correction_reason?: string;
  correction_history?: any[];
}

// 月次集計の1行（社員ごと）
export interface MonthlySummaryRow {
  employee_id: string;
  employee_name: string;
  /** 勤務日数（出勤・退勤がそろった完了日のみ） */
  workDays: number;
  /** 未退勤（退勤打刻忘れ）の件数。可視化用。 */
  openDays: number;
  totalWorkHours: number;
  totalOvertimeMinutes: number;
  lateCount: number;
  earlyLeaveCount: number;
  /** 社員マスタに存在しない（退職等）社員の記録か */
  isOrphan: boolean;
}

// 全打刻記録を取得（管理者用）
export const getAllTimeRecords = async (): Promise<TimeRecordWithEmployee[]> => {
  try {
    console.log('🔍 Fetching time records from Supabase...');

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
        overtime_minutes,
        status,
        is_direct_work,
        is_manual_entry,
        approved_by,
        created_at,
        updated_at
      `)
      .order('record_date', { ascending: false })
      .order('employee_id');

    if (timeRecordsError) {
      console.error('❌ Error fetching time records:', timeRecordsError);
      throw new Error(`打刻記録の取得に失敗しました: ${timeRecordsError.message}`);
    }

    console.log('✅ Time records fetched from Supabase:', timeRecordsData?.length || 0);

    // 社員データを別途取得
    const { data: employeesData, error: employeesError } = await supabase
      .from('employees')
      .select('employee_id, name');

    if (employeesError) {
      console.warn('⚠️ Warning: Could not fetch employees data:', employeesError);
    }

    console.log('✅ Employees data fetched:', employeesData?.length || 0);

    // 監査ログを取得
    const auditLogs = await getAuditLogs();
    console.log('✅ Audit logs fetched:', auditLogs?.length || 0);

    // 社員データをマップに変換
    const employeesMap = new Map();
    if (employeesData) {
      employeesData.forEach((emp: any) => {
        employeesMap.set(emp.employee_id, emp.name);
      });
    }

    // 監査ログをマップに変換（record_id別に最新の修正理由を取得）
    const auditLogsMap = new Map();
    auditLogs?.forEach((log: any) => {
      const recordKey = log.record_id;
      if (recordKey && log.new_values?.reason) {
        if (!auditLogsMap.has(recordKey) || new Date(log.created_at) > new Date(auditLogsMap.get(recordKey).created_at)) {
          auditLogsMap.set(recordKey, {
            reason: log.new_values.reason,
            created_at: log.created_at,
            action: log.action
          });
        }
      }
    });

    // データ構造を整形
    const formattedData = timeRecordsData?.map((record: any) => {
      const recordKey = `${record.employee_id}-${record.record_date}`;
      const auditInfo = auditLogsMap.get(recordKey);

      return {
        id: record.id,
        employee_id: record.employee_id,
        employee_name: employeesMap.get(record.employee_id) || `社員${record.employee_id}`,
        record_date: record.record_date,
        clock_in_time: record.clock_in_time,
        clock_out_time: record.clock_out_time,
        work_hours: record.work_hours || 0,
        overtime_minutes: record.overtime_minutes || 0,
        status: record.status,
        is_direct_work: record.is_direct_work ?? false,
        is_manual_entry: record.is_manual_entry ?? false,
        approved_by: record.approved_by,
        created_at: record.created_at,
        updated_at: record.updated_at,
        correction_reason: auditInfo?.reason || null,
        correction_history: auditInfo ? [auditInfo] : []
      };
    }) || [];

    console.log('✅ Formatted data ready:', formattedData.length);
    return formattedData;
  } catch (error) {
    console.error('❌ Error in getAllTimeRecords:', error);
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
    // datetime-local（JSTとして入力された時刻）をUTCのISO形式に変換
    // localDateTimeToISO はブラウザのTZに依存せず常にJSTとして解釈する
    const formattedClockIn = clock_in_time ? localDateTimeToISO(clock_in_time) : null;
    const formattedClockOut = clock_out_time ? localDateTimeToISO(clock_out_time) : null;

    // 計算は「削除より前」に行う。失敗してもデータを壊さない。
    // 社員の個別勤務時間を取得
    const { data: employeeData, error: employeeError } = await supabase
      .from('employees')
      .select('work_start_time, work_end_time')
      .eq('employee_id', employee_id)
      .single();

    if (employeeError) {
      console.error('Error fetching employee work times:', employeeError);
      throw new Error('社員の勤務時間情報の取得に失敗しました');
    }

    // 既存記録の直行直帰フラグを引き継ぐ（修正で直行直帰を勝手に解除しない）。
    // 削除→再作成でフラグが失われると、直行直帰なのに遅刻/早退/残業が誤付与される。
    const { data: existingRecord } = await supabase
      .from('time_records')
      .select('is_direct_work')
      .eq('employee_id', employee_id)
      .eq('record_date', record_date)
      .maybeSingle();
    const isDirectWork = existingRecord?.is_direct_work === true;

    // 社員の個別勤務時間を使用してステータスを計算（record_date基準でJST判定）。
    // 直行直帰なら遅刻/早退/残業を無効化し「通常」扱い・残業0（労働時間は計上）。
    const workTimeResult = applyDirectWorkOverride(
      calculateWorkTimeAndStatus(
        formattedClockIn,
        formattedClockOut,
        employeeData.work_start_time,
        employeeData.work_end_time,
        record_date
      ),
      isDirectWork
    );

    const work_hours = workTimeResult.actualWorkHours;
    const status = workTimeResult.status;
    const overtime_minutes = workTimeResult.overtimeMinutes;

    console.log(`📊 Employee ${employee_id} work time: ${employeeData.work_start_time}-${employeeData.work_end_time}, Status: ${status}, Overtime: ${overtime_minutes}分, 直行直帰: ${isDirectWork}`);

    // 削除→作成を単一トランザクションのRPCで実行する。
    // 従来は delete と insert が別呼び出しで、insert が制約違反等で失敗すると
    // 削除済みのその日の記録が消失していた。RPC なら insert 失敗時に delete も
    // 自動ロールバックされ、記録消失を防げる。
    const { data: newRecord, error: rpcError } = await supabase.rpc('correct_time_record', {
      p_employee_id: employee_id,
      p_record_date: record_date,
      p_clock_in_time: formattedClockIn,
      p_clock_out_time: formattedClockOut,
      p_work_hours: work_hours,
      p_overtime_minutes: overtime_minutes,
      p_status: status,
      p_is_direct_work: isDirectWork
    });

    if (rpcError) {
      console.error('Error correcting record (RPC):', rpcError);
      throw new Error('打刻記録の修正に失敗しました: ' + rpcError.message);
    }

    // 監査ログを記録
    await logCorrectionAction(employee_id, record_date, 'DELETE', reason, (newRecord as any)?.id);

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
    // datetime-local（JSTとして入力された時刻）をUTCのISO形式に変換
    // localDateTimeToISO はブラウザのTZに依存せず常にJSTとして解釈する
    const formattedClockIn = clock_in_time ? localDateTimeToISO(clock_in_time) : null;
    const formattedClockOut = clock_out_time ? localDateTimeToISO(clock_out_time) : null;

    // 社員の個別勤務時間を取得
    const { data: employeeData, error: employeeError } = await supabase
      .from('employees')
      .select('work_start_time, work_end_time')
      .eq('employee_id', employee_id)
      .single();

    if (employeeError) {
      console.error('Error fetching employee work times:', employeeError);
      throw new Error('社員の勤務時間情報の取得に失敗しました');
    }

    // 既存記録の直行直帰フラグを取得（更新でも直行直帰の扱いを維持する）。
    const { data: existingRecord } = await supabase
      .from('time_records')
      .select('is_direct_work')
      .eq('employee_id', employee_id)
      .eq('record_date', record_date)
      .maybeSingle();
    const isDirectWork = existingRecord?.is_direct_work === true;

    // 社員の個別勤務時間を使用してステータスを計算（record_date基準でJST判定）。
    // 直行直帰なら遅刻/早退/残業を無効化し「通常」扱い・残業0（労働時間は計上）。
    const workTimeResult = applyDirectWorkOverride(
      calculateWorkTimeAndStatus(
        formattedClockIn,
        formattedClockOut,
        employeeData.work_start_time,
        employeeData.work_end_time,
        record_date
      ),
      isDirectWork
    );

    const work_hours = workTimeResult.actualWorkHours;
    const status = workTimeResult.status;
    const overtime_minutes = workTimeResult.overtimeMinutes;

    console.log(`📊 Employee ${employee_id} work time: ${employeeData.work_start_time}-${employeeData.work_end_time}, Status: ${status}, Overtime: ${overtime_minutes}分, 直行直帰: ${isDirectWork}`);

    const { data: updatedRecord, error } = await supabase
      .from('time_records')
      .update({
        clock_in_time: formattedClockIn,
        clock_out_time: formattedClockOut,
        work_hours,
        overtime_minutes,
        status,
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
    console.log('🔍 Fetching employees from Supabase...');

    const { data, error } = await supabase
      .from('employees')
      .select('id, employee_id, name')
      .order('employee_id');

    if (error) {
      console.error('❌ Error fetching employees:', error);
      throw new Error(`社員データの取得に失敗しました: ${error.message}`);
    }

    console.log('✅ Employees fetched successfully:', data?.length || 0);
    return data || [];
  } catch (error) {
    console.error('❌ Error in getEmployees:', error);
    throw error;
  }
};

// 全打刻記録のステータスを再計算
export const recalculateAllStatus = async (): Promise<void> => {
  try {
    console.log('🔄 Recalculating all time record statuses...');

    // 全ての打刻記録を取得（record_date はステータス判定のJST基準日に使用）
    const { data: records, error: recordsError } = await supabase
      .from('time_records')
      .select('id, employee_id, record_date, clock_in_time, clock_out_time, status, is_direct_work');

    if (recordsError) {
      console.error('Error fetching time records:', recordsError);
      throw new Error('打刻記録の取得に失敗しました');
    }

    // 全ての社員の勤務時間を取得
    const { data: employees, error: employeesError } = await supabase
      .from('employees')
      .select('employee_id, work_start_time, work_end_time');

    if (employeesError) {
      console.error('Error fetching employees:', employeesError);
      throw new Error('社員データの取得に失敗しました');
    }

    // 社員データをマップに変換
    const employeeMap = new Map();
    employees?.forEach((emp: any) => {
      employeeMap.set(emp.employee_id, {
        work_start_time: emp.work_start_time,
        work_end_time: emp.work_end_time
      });
    });

    // 各記録のステータスを再計算
    let updatedCount = 0;
    for (const record of records || []) {
      const employee = employeeMap.get(record.employee_id);
      if (!employee) continue;

      // 直行・直帰の記録は遅刻/早退/残業判定を無効化し「通常」扱い・残業0とする
      // （勤務時間は再計算値）。全経路で共通のヘルパーを用いて統一する。
      const workTimeResult = applyDirectWorkOverride(
        calculateWorkTimeAndStatus(
          record.clock_in_time,
          record.clock_out_time,
          employee.work_start_time,
          employee.work_end_time,
          record.record_date
        ),
        record.is_direct_work === true
      );

      // ステータス・勤務時間・残業時間を再計算して更新
      const { error: updateError } = await supabase
        .from('time_records')
        .update({
          status: workTimeResult.status,
          work_hours: workTimeResult.actualWorkHours,
          overtime_minutes: workTimeResult.overtimeMinutes,
          updated_at: new Date().toISOString()
        })
        .eq('id', record.id);

      if (updateError) {
        console.error(`Error updating record ${record.id}:`, updateError);
      } else {
        updatedCount++;
      }
    }

    console.log(`✅ Status recalculation completed. Updated ${updatedCount} records.`);
  } catch (error) {
    console.error('❌ Error in recalculateAllStatus:', error);
    throw error;
  }
};

// 打刻記録を削除（Supabase使用）
export const deleteTimeRecord = async (employee_id: string, record_date: string): Promise<void> => {
  try {
    console.log('🗑️ Deleting time record from Supabase:', { employee_id, record_date });

    const { error } = await supabase
      .from('time_records')
      .delete()
      .eq('employee_id', employee_id)
      .eq('record_date', record_date);

    if (error) {
      console.error('❌ Error deleting time record:', error);
      throw new Error(`打刻記録の削除に失敗しました: ${error.message}`);
    }

    console.log('✅ Time record deleted successfully from Supabase');
  } catch (error) {
    console.error('❌ Error in deleteTimeRecord:', error);
    throw error;
  }
};

// 監査ログを取得（修正理由を含む）
export const getAuditLogs = async (): Promise<any[]> => {
  try {
    console.log('🔍 Fetching audit logs from Supabase...');

    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('table_name', 'time_records')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching audit logs:', error);
      throw new Error(`監査ログの取得に失敗しました: ${error.message}`);
    }

    console.log('✅ Audit logs fetched successfully:', data?.length || 0);
    return data || [];
  } catch (error) {
    console.error('❌ Error in getAuditLogs:', error);
    throw error;
  }
};

// 指定年月の打刻記録を社員ごとに集計
// 勤務日数=出勤打刻ありの日、総労働=work_hours合計、残業=overtime_minutes合計、
// 遅刻=statusに'遅刻'を含む、早退=statusに'早退'を含む
export const getMonthlySummary = async (year: number, month: number): Promise<MonthlySummaryRow[]> => {
  try {
    console.log('📊 月次集計を取得中...', { year, month });

    const { startDate, endDate } = getJSTMonthRange(year, month);

    // 社員一覧と当月の打刻記録を取得（デモ/本番で分岐）
    let employees: { employee_id: string; name: string }[] = [];
    let records: {
      employee_id: string;
      clock_in_time: string | null;
      clock_out_time: string | null;
      work_hours: number | null;
      overtime_minutes: number | null;
      status: string;
    }[] = [];

    if (isDevMode) {
      console.log('🔧 デモモードで月次集計処理');
      const demoEmployees = await demoEmployeeService.getAll();
      employees = demoEmployees.map(emp => ({ employee_id: emp.employee_id, name: emp.name }));

      const allRecords = await demoTimeRecordService.getAllRecords();
      records = allRecords
        .filter(r => r.record_date >= startDate && r.record_date <= endDate)
        .map(r => ({
          employee_id: r.employee_id,
          clock_in_time: r.clock_in_time,
          clock_out_time: r.clock_out_time,
          work_hours: r.work_hours,
          overtime_minutes: r.overtime_minutes,
          status: r.status
        }));
    } else {
      const { data: employeesData, error: employeesError } = await supabase
        .from('employees')
        .select('employee_id, name')
        .order('employee_id');

      if (employeesError) {
        console.error('❌ Error fetching employees:', employeesError);
        throw new Error(`社員データの取得に失敗しました: ${employeesError.message}`);
      }
      employees = employeesData || [];

      const { data: recordsData, error: recordsError } = await supabase
        .from('time_records')
        .select('employee_id, clock_in_time, clock_out_time, work_hours, overtime_minutes, status')
        .gte('record_date', startDate)
        .lte('record_date', endDate);

      if (recordsError) {
        console.error('❌ Error fetching time records:', recordsError);
        throw new Error(`打刻記録の取得に失敗しました: ${recordsError.message}`);
      }
      records = recordsData || [];
    }

    // 社員ID単位で集計用マップを初期化（打刻のない社員も0行として表示）
    const summaryMap = new Map<string, MonthlySummaryRow>();
    employees.forEach(emp => {
      summaryMap.set(emp.employee_id, {
        employee_id: emp.employee_id,
        employee_name: emp.name,
        workDays: 0,
        openDays: 0,
        totalWorkHours: 0,
        totalOvertimeMinutes: 0,
        lateCount: 0,
        earlyLeaveCount: 0,
        isOrphan: false
      });
    });

    // 総労働時間は日次の丸め済み work_hours を合算すると丸め誤差が累積するため、
    // 出退勤がそろう日は実打刻から「分」で積算し、最後に時間へ変換して一度だけ丸める。
    const totalWorkMinutesMap = new Map<string, number>();

    // 打刻記録を集計
    records.forEach(record => {
      let row = summaryMap.get(record.employee_id);
      if (!row) {
        // 社員マスタに存在しない記録（退職者等）もフォールバックで集計しつつ明示。
        row = {
          employee_id: record.employee_id,
          employee_name: `(退職者) ${record.employee_id}`,
          workDays: 0,
          openDays: 0,
          totalWorkHours: 0,
          totalOvertimeMinutes: 0,
          lateCount: 0,
          earlyLeaveCount: 0,
          isOrphan: true
        };
        summaryMap.set(record.employee_id, row);
      }

      const hasIn = !!record.clock_in_time;
      const hasOut = !!record.clock_out_time;

      if (hasIn && hasOut) {
        // 完了日のみ勤務日数に計上
        row.workDays += 1;
        // 実打刻から分単位で積算（丸め誤差を避ける）
        const inMs = new Date(record.clock_in_time as string).getTime();
        const outMs = new Date(record.clock_out_time as string).getTime();
        const prev = totalWorkMinutesMap.get(record.employee_id) || 0;
        if (!isNaN(inMs) && !isNaN(outMs) && outMs > inMs) {
          totalWorkMinutesMap.set(record.employee_id, prev + (outMs - inMs) / (1000 * 60));
        } else {
          // 不正打刻はフォールバックで保存済み work_hours を分換算
          totalWorkMinutesMap.set(record.employee_id, prev + (record.work_hours || 0) * 60);
        }
      } else if (hasIn && !hasOut) {
        // 退勤忘れ（未退勤）。勤務日数には数えず、件数だけ可視化する。
        row.openDays += 1;
      }

      row.totalOvertimeMinutes += record.overtime_minutes || 0;
      if (record.status && record.status.includes('遅刻')) {
        row.lateCount += 1;
      }
      if (record.status && record.status.includes('早退')) {
        row.earlyLeaveCount += 1;
      }
    });

    // 分の積算を時間へ変換し、最後に一度だけ丸めて配列化
    const result = Array.from(summaryMap.values())
      .map(row => ({
        ...row,
        totalWorkHours: Math.round(((totalWorkMinutesMap.get(row.employee_id) || 0) / 60) * 100) / 100
      }))
      .sort((a, b) => a.employee_id.localeCompare(b.employee_id));

    console.log('✅ 月次集計完了:', result.length, '名分');
    return result;
  } catch (error) {
    console.error('❌ Error in getMonthlySummary:', error);
    throw error;
  }
};