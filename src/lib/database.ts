import { supabase, Employee, TimeRecord, TimeRecordStatus, isDevMode } from './supabase'
import { demoEmployeeService, demoTimeRecordService } from './demoDatabase'
import { getJSTDate, getJSTMonthRange } from '../utils/dateUtils'
import { calculateWorkTimeAndStatus } from '../utils/workTimeUtils'

/**
 * 退勤対象の出勤レコードを取得する（本番Supabase経路用）。
 *
 * 1) まず退勤打刻日のJST日付（today）のレコードを探す。
 * 2) 見つからなければ、日跨ぎ深夜勤務に対応するため、当該社員の
 *    未退勤(clock_out_time IS NULL)レコードのうち最新の出勤を対象にする。
 *
 * .single() は0行/複数行で例外になり、通信障害等のインフラエラーまで
 * 「記録なし」に潰してしまうため使わない。重複行が万一存在しても、
 * 未退勤を優先しつつ最新の出勤を選ぶことで全機能停止を避ける。
 *
 * @returns 対象レコード。見つからなければ null。インフラエラー時は throw。
 */
async function findOpenRecordForClockOut(
  employeeId: string,
  today: string
): Promise<TimeRecord | null> {
  // 1) 退勤日のレコード（複数行に耐えるため配列で受ける）
  const { data: sameDay, error: sameDayError } = await supabase
    .from('time_records')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('record_date', today)
    .order('clock_in_time', { ascending: false })
  if (sameDayError) {
    console.error('❌ 本日記録取得エラー:', sameDayError)
    throw new Error('本日の出勤記録の取得に失敗しました: ' + sameDayError.message)
  }
  if (sameDay && sameDay.length > 0) {
    // 未退勤があればそれを、無ければ最新の出勤を返す
    const open = sameDay.find((r: TimeRecord) => !r.clock_out_time)
    return open ?? sameDay[0]
  }

  // 2) 日跨ぎ勤務: 当該社員の最新の未退勤レコードにフォールバック
  const { data: openRecords, error: openError } = await supabase
    .from('time_records')
    .select('*')
    .eq('employee_id', employeeId)
    .is('clock_out_time', null)
    .order('clock_in_time', { ascending: false })
    .limit(1)
  if (openError) {
    console.error('❌ 未退勤記録取得エラー:', openError)
    throw new Error('出勤記録の取得に失敗しました: ' + openError.message)
  }
  return openRecords && openRecords.length > 0 ? openRecords[0] : null
}

// 社員関連の操作
export const employeeService = {
  // 全社員取得
  async getAll(): Promise<Employee[]> {
    if (isDevMode) {
      return demoEmployeeService.getAll()
    }

    console.log('🔍 Supabaseから社員データを取得中...')

    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .order('employee_id')

    if (error) {
      console.error('社員データ取得エラー:', error)
      console.error('エラーの詳細:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      })
      throw new Error(`社員データの取得に失敗しました: ${error.message}`)
    }

    console.log('✅ 社員データ取得成功:', data?.length || 0, '件')
    return data || []
  },

  // 社員追加
  async create(employee: Omit<Employee, 'id' | 'created_at' | 'updated_at'>): Promise<Employee> {
    console.log('👤 社員作成開始:', { employee, isDevMode })

    if (isDevMode) {
      console.log('🔧 デモモードで社員作成処理')
      return demoEmployeeService.create(employee)
    }

    console.log('🏭 本番モードで社員作成処理')
    console.log('📝 作成データ:', employee)

    const { data, error } = await supabase
      .from('employees')
      .insert(employee)
      .select()
      .single()

    if (error) {
      console.error('❌ 社員作成エラー:', error)
      console.error('❌ エラー詳細:', JSON.stringify(error, null, 2))
      throw error
    }

    console.log('✅ 社員作成成功:', data)
    return data
  },

  // 社員更新
  async update(id: number, employee: Partial<Employee>): Promise<Employee> {
    console.log('👤 社員更新開始:', { id, employee, isDevMode })

    if (isDevMode) {
      console.log('🔧 デモモードで社員更新処理')
      return demoEmployeeService.update(id, employee)
    }

    console.log('🏭 本番モードで社員更新処理')
    console.log('📝 更新データ:', employee)

    const { data, error } = await supabase
      .from('employees')
      .update(employee)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('❌ 社員更新エラー:', error)
      console.error('❌ エラー詳細:', JSON.stringify(error, null, 2))
      throw error
    }

    console.log('✅ 社員更新成功:', data)
    return data
  },

  // 社員削除
  async delete(id: number): Promise<void> {
    if (isDevMode) {
      return demoEmployeeService.delete(id)
    }

    const { error } = await supabase
      .from('employees')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('社員削除エラー:', error)
      throw error
    }
  },

  // 社員IDで検索
  async findByEmployeeId(employeeId: string): Promise<Employee | null> {
    if (isDevMode) {
      return demoEmployeeService.findByEmployeeId(employeeId)
    }

    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('employee_id', employeeId)
      .single()

    if (error && error.code !== 'PGRST116') { // NOT FOUND以外のエラー
      console.error('社員検索エラー:', error)
      throw error
    }

    return data || null
  }
}

// 打刻記録関連の操作
export const timeRecordService = {
  // 出勤打刻
  async clockIn(employeeId: string): Promise<TimeRecord> {
    console.log('⏰ 出勤打刻開始:', { employeeId, isDevMode })

    if (isDevMode) {
      console.log('🔧 デモモードで出勤打刻処理')
      return demoTimeRecordService.clockIn(employeeId)
    }

    console.log('🏭 本番モードで出勤打刻処理')

    const employee = await employeeService.findByEmployeeId(employeeId)
    if (!employee) {
      throw new Error('社員が見つかりません')
    }

    const now = new Date()
    const today = getJSTDate(now)
    const currentTime = now.toISOString()

    // 二重出勤の事前チェック。DBの部分ユニーク索引違反による不可解な
    // 「打刻に失敗しました」ではなく、明確なメッセージで弾く。
    const { data: existing, error: existingError } = await supabase
      .from('time_records')
      .select('id')
      .eq('employee_id', employeeId)
      .eq('record_date', today)
      .maybeSingle()
    if (existingError) {
      console.error('❌ 既存記録確認エラー:', existingError)
      throw new Error('出勤記録の確認に失敗しました: ' + existingError.message)
    }
    if (existing) {
      throw new Error('本日は既に出勤打刻済みです')
    }

    // ステータス判定（統一関数を使用・退勤前なので clockOut=null）
    const { status } = calculateWorkTimeAndStatus(
      currentTime,
      null,
      employee.work_start_time,
      employee.work_end_time,
      today
    )

    console.log('📝 出勤データ挿入開始:', {
      employee_id: employeeId,
      record_date: today,
      clock_in_time: currentTime,
      status: status,
      work_hours: 0,
      overtime_minutes: 0
    })

    const { data, error } = await supabase
      .from('time_records')
      .insert({
        employee_id: employeeId,
        record_date: today,
        clock_in_time: currentTime,
        status: status,
        work_hours: 0,
        overtime_minutes: 0
      })
      .select()
      .single()

    if (error) {
      console.error('❌ 出勤打刻エラー:', error)
      console.error('❌ エラー詳細:', JSON.stringify(error, null, 2))
      throw error
    }

    console.log('✅ 出勤打刻成功:', data)
    return data
  },

  // 退勤打刻
  async clockOut(employeeId: string): Promise<TimeRecord> {
    console.log('🌙 退勤打刻開始:', { employeeId, isDevMode })

    if (isDevMode) {
      console.log('🔧 デモモードで退勤打刻処理')
      return demoTimeRecordService.clockOut(employeeId)
    }

    console.log('🏭 本番モードで退勤打刻処理')

    const employee = await employeeService.findByEmployeeId(employeeId)
    if (!employee) {
      throw new Error('社員が見つかりません')
    }

    const now = new Date()
    const today = getJSTDate(now)
    const currentTime = now.toISOString()

    // 退勤対象の出勤記録を取得する（日跨ぎ勤務・重複行に耐性を持たせる）。
    // .single() は0行/複数行でerrorになり、通信障害等のインフラエラーまで
    // 「記録なし」に潰れていたため使わない。
    const todayRecord = await findOpenRecordForClockOut(employeeId, today)
    if (!todayRecord) {
      throw new Error('本日の出勤記録が見つかりません')
    }

    // 勤務時間・ステータス・残業時間を計算（統一関数を使用・DBの勤務時間基準）
    const { actualWorkHours: workHours, status: finalStatus, overtimeMinutes } = calculateWorkTimeAndStatus(
      todayRecord.clock_in_time,
      currentTime,
      employee.work_start_time,
      employee.work_end_time,
      todayRecord.record_date
    )

    console.log('📝 退勤データ更新開始:', {
      id: todayRecord.id,
      clock_out_time: currentTime,
      work_hours: workHours,
      status: finalStatus,
      overtime_minutes: overtimeMinutes
    })

    const { data, error } = await supabase
      .from('time_records')
      .update({
        clock_out_time: currentTime,
        work_hours: workHours,
        status: finalStatus,
        overtime_minutes: overtimeMinutes
      })
      .eq('id', todayRecord.id)
      .select()
      .single()

    if (error) {
      console.error('❌ 退勤打刻エラー:', error)
      console.error('❌ エラー詳細:', JSON.stringify(error, null, 2))
      throw error
    }

    console.log('✅ 退勤打刻成功:', data)
    return data
  },

  // 時刻指定出勤打刻
  async clockInWithTime(employeeId: string, specifiedTime: string, isDirectWork: boolean = false): Promise<TimeRecord> {
    console.log('⏰ 時刻指定出勤打刻開始:', { employeeId, specifiedTime, isDirectWork, isDevMode })

    if (isDevMode) {
      console.log('🔧 デモモードで時刻指定出勤打刻処理')
      return demoTimeRecordService.clockInWithTime(employeeId, specifiedTime, isDirectWork)
    }

    console.log('🏭 本番モードで時刻指定出勤打刻処理')

    const employee = await employeeService.findByEmployeeId(employeeId)
    if (!employee) {
      throw new Error('社員が見つかりません')
    }

    const clockInTime = new Date(specifiedTime)
    const today = getJSTDate(clockInTime)

    // 二重出勤の事前チェック（部分ユニーク索引違反の不可解なエラーを防ぐ）
    const { data: existing, error: existingError } = await supabase
      .from('time_records')
      .select('id')
      .eq('employee_id', employeeId)
      .eq('record_date', today)
      .maybeSingle()
    if (existingError) {
      console.error('❌ 既存記録確認エラー:', existingError)
      throw new Error('出勤記録の確認に失敗しました: ' + existingError.message)
    }
    if (existing) {
      throw new Error('該当日は既に出勤打刻済みです')
    }

    // ステータス判定（直行・直帰モードの場合は通常固定、それ以外は統一関数で判定）
    let status: TimeRecordStatus = '通常'
    if (!isDirectWork) {
      status = calculateWorkTimeAndStatus(
        specifiedTime,
        null,
        employee.work_start_time,
        employee.work_end_time,
        today
      ).status
    }

    console.log('📝 時刻指定出勤データ挿入開始:', {
      employee_id: employeeId,
      record_date: today,
      clock_in_time: specifiedTime,
      status: status,
      work_hours: 0,
      overtime_minutes: 0,
      is_direct_work: isDirectWork
    })

    const { data, error } = await supabase
      .from('time_records')
      .insert({
        employee_id: employeeId,
        record_date: today,
        clock_in_time: specifiedTime,
        status: status,
        work_hours: 0,
        overtime_minutes: 0,
        is_direct_work: isDirectWork
      })
      .select()
      .single()

    if (error) {
      console.error('❌ 時刻指定出勤打刻エラー:', error)
      console.error('❌ エラー詳細:', JSON.stringify(error, null, 2))
      throw error
    }

    console.log('✅ 時刻指定出勤打刻成功:', data)
    return data
  },

  // 時刻指定退勤打刻
  async clockOutWithTime(employeeId: string, specifiedTime: string, isDirectWork: boolean = false): Promise<TimeRecord> {
    console.log('🌙 時刻指定退勤打刻開始:', { employeeId, specifiedTime, isDirectWork, isDevMode })

    if (isDevMode) {
      console.log('🔧 デモモードで時刻指定退勤打刻処理')
      return demoTimeRecordService.clockOutWithTime(employeeId, specifiedTime, isDirectWork)
    }

    console.log('🏭 本番モードで時刻指定退勤打刻処理')

    const employee = await employeeService.findByEmployeeId(employeeId)
    if (!employee) {
      throw new Error('社員が見つかりません')
    }

    const clockOutTime = new Date(specifiedTime)
    const today = getJSTDate(clockOutTime)

    // 退勤対象の出勤記録を取得する（日跨ぎ勤務・重複行に耐性を持たせる）。
    const todayRecord = await findOpenRecordForClockOut(employeeId, today)
    if (!todayRecord) {
      throw new Error('本日の出勤記録が見つかりません')
    }

    // 勤務時間・ステータス・残業時間を計算（統一関数を使用）
    const calc = calculateWorkTimeAndStatus(
      todayRecord.clock_in_time,
      specifiedTime,
      employee.work_start_time,
      employee.work_end_time,
      todayRecord.record_date
    )
    const workHours = calc.actualWorkHours

    // 直行・直帰判定は退勤時の引数だけでなく、出勤時にDB保存されたフラグも見る。
    // 直行直帰なら出勤時ステータスを維持し残業は計上しない（勤務時間は計上）。
    const directWork = isDirectWork || todayRecord.is_direct_work === true
    let finalStatus: TimeRecordStatus = todayRecord.status
    let overtimeMinutes = 0
    if (!directWork) {
      finalStatus = calc.status
      overtimeMinutes = calc.overtimeMinutes
    }

    console.log('📝 時刻指定退勤データ更新開始:', {
      id: todayRecord.id,
      clock_out_time: specifiedTime,
      work_hours: workHours,
      status: finalStatus,
      overtime_minutes: overtimeMinutes,
      is_direct_work: directWork
    })

    const { data, error } = await supabase
      .from('time_records')
      .update({
        clock_out_time: specifiedTime,
        work_hours: workHours,
        status: finalStatus,
        overtime_minutes: overtimeMinutes,
        is_direct_work: directWork
      })
      .eq('id', todayRecord.id)
      .select()
      .single()

    if (error) {
      console.error('❌ 時刻指定退勤打刻エラー:', error)
      console.error('❌ エラー詳細:', JSON.stringify(error, null, 2))
      throw error
    }

    console.log('✅ 時刻指定退勤打刻成功:', data)
    return data
  },

  // 本日の記録取得
  async getTodayRecord(employeeId: string): Promise<TimeRecord | null> {
    if (isDevMode) {
      return demoTimeRecordService.getTodayRecord(employeeId)
    }

    const today = getJSTDate()
    console.log('📅 本日記録取得中:', { employeeId, today })

    // 重複行が万一存在しても .maybeSingle() の例外で本日状況表示が壊れない
    // よう、配列で受けて未退勤優先・最新の出勤を返す。
    const { data, error } = await supabase
      .from('time_records')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('record_date', today)
      .order('clock_in_time', { ascending: false })

    if (error) {
      console.error('❌ 本日記録取得エラー:', error)
      throw error
    }

    if (!data || data.length === 0) {
      console.log('✅ 本日記録取得結果: 記録なし')
      return null
    }
    const open = data.find((r: TimeRecord) => !r.clock_out_time)
    console.log('✅ 本日記録取得結果: 記録あり')
    return open ?? data[0]
  },

  // 社員の打刻記録取得
  async getEmployeeRecords(employeeId: string, year?: number, month?: number): Promise<TimeRecord[]> {
    if (isDevMode) {
      return demoTimeRecordService.getEmployeeRecords(employeeId, year, month)
    }

    let query = supabase
      .from('time_records')
      .select('*')
      .eq('employee_id', employeeId)
      .order('record_date', { ascending: false })

    if (year && month) {
      const { startDate, endDate } = getJSTMonthRange(year, month)
      query = query.gte('record_date', startDate).lte('record_date', endDate)
    }

    const { data, error } = await query

    if (error) {
      console.error('社員記録取得エラー:', error)
      throw error
    }

    return data || []
  },

  // 全記録取得（管理者用）
  async getAllRecords(): Promise<(TimeRecord & { employee_name?: string })[]> {
    if (isDevMode) {
      return demoTimeRecordService.getAllRecords()
    }

    const { data: records, error: recordsError } = await supabase
      .from('time_records')
      .select('*')
      .order('record_date', { ascending: false })

    if (recordsError) {
      console.error('全記録取得エラー:', recordsError)
      throw recordsError
    }

    // 社員情報を取得
    const { data: employees, error: employeesError } = await supabase
      .from('employees')
      .select('employee_id, name')

    if (employeesError) {
      console.error('社員情報取得エラー:', employeesError)
      throw employeesError
    }

    // データを結合
    return (records || []).map((record: TimeRecord) => {
      const employee = employees?.find((emp: any) => emp.employee_id === record.employee_id)
      return {
        ...record,
        employee_name: employee?.name || record.employee_id
      }
    })
  }
}