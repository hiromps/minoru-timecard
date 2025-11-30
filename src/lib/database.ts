import { supabase, Employee, TimeRecord, TimeRecordStatus, isDevMode } from './supabase'
import { demoEmployeeService, demoTimeRecordService } from './demoDatabase'
import { getJSTDate, getJSTMonthRange } from '../utils/dateUtils'

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
    
    // ステータス判定
    const workStartTime = new Date(`${today}T${employee.work_start_time}`)
    const status: TimeRecordStatus = now > workStartTime ? '遅刻' : '通常'

    console.log('📝 出勤データ挿入開始:', {
      employee_id: employeeId,
      record_date: today,
      clock_in_time: currentTime,
      status: status,
      work_hours: 0
    })

    const { data, error } = await supabase
      .from('time_records')
      .insert({
        employee_id: employeeId,
        record_date: today,
        clock_in_time: currentTime,
        status: status,
        work_hours: 0
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

    // 本日の出勤記録を取得
    const { data: todayRecord, error: fetchError } = await supabase
      .from('time_records')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('record_date', today)
      .single()

    if (fetchError || !todayRecord) {
      throw new Error('本日の出勤記録が見つかりません')
    }

    // 勤務時間とステータスを計算
    const clockInTime = new Date(todayRecord.clock_in_time!)
    const clockOutTime = now
    const workHours = Math.round((clockOutTime.getTime() - clockInTime.getTime()) / (1000 * 60 * 60) * 100) / 100

    const workEndTime = new Date(`${today}T${employee.work_end_time}`)
    const isLate = todayRecord.status === '遅刻'
    const isEarlyLeave = now < workEndTime
    const isOvertime = now > workEndTime

    // 複合ステータス対応
    let finalStatus: TimeRecordStatus
    if (isLate && isEarlyLeave) {
      finalStatus = '遅刻・早退'
    } else if (isLate && isOvertime) {
      finalStatus = '遅刻・残業'
    } else if (isEarlyLeave) {
      finalStatus = '早退'
    } else if (isOvertime) {
      finalStatus = '残業'
    } else if (isLate) {
      finalStatus = '遅刻'
    } else {
      finalStatus = '通常'
    }

    console.log('📝 退勤データ更新開始:', {
      id: todayRecord.id,
      clock_out_time: currentTime,
      work_hours: workHours,
      status: finalStatus
    })

    const { data, error } = await supabase
      .from('time_records')
      .update({
        clock_out_time: currentTime,
        work_hours: workHours,
        status: finalStatus
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

    // ステータス判定（直行・直帰モードの場合は通常固定）
    let status: TimeRecordStatus = '通常'
    if (!isDirectWork) {
      const workStartTime = new Date(`${today}T${employee.work_start_time}`)
      status = clockInTime > workStartTime ? '遅刻' : '通常'
    }

    console.log('📝 時刻指定出勤データ挿入開始:', {
      employee_id: employeeId,
      record_date: today,
      clock_in_time: specifiedTime,
      status: status,
      work_hours: 0,
      is_direct_work: isDirectWork
    })

    const { data, error } = await supabase
      .from('time_records')
      .insert({
        employee_id: employeeId,
        record_date: today,
        clock_in_time: specifiedTime,
        status: status,
        work_hours: 0
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

    // 本日の出勤記録を取得
    const { data: todayRecord, error: fetchError } = await supabase
      .from('time_records')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('record_date', today)
      .single()

    if (fetchError || !todayRecord) {
      throw new Error('本日の出勤記録が見つかりません')
    }

    // 勤務時間とステータスを計算
    const clockInTime = new Date(todayRecord.clock_in_time!)
    const workHours = Math.round((clockOutTime.getTime() - clockInTime.getTime()) / (1000 * 60 * 60) * 100) / 100

    // ステータス判定（直行・直帰モードの場合は出勤時のステータスを維持）
    let finalStatus: TimeRecordStatus = todayRecord.status
    if (!isDirectWork) {
      const workEndTime = new Date(`${today}T${employee.work_end_time}`)
      const isLate = todayRecord.status === '遅刻'
      const isEarlyLeave = clockOutTime < workEndTime
      const isOvertime = clockOutTime > workEndTime

      // 複合ステータス対応
      if (isLate && isEarlyLeave) {
        finalStatus = '遅刻・早退'
      } else if (isLate && isOvertime) {
        finalStatus = '遅刻・残業'
      } else if (isEarlyLeave) {
        finalStatus = '早退'
      } else if (isOvertime) {
        finalStatus = '残業'
      } else if (isLate) {
        finalStatus = '遅刻'
      } else {
        finalStatus = '通常'
      }
    }

    console.log('📝 時刻指定退勤データ更新開始:', {
      id: todayRecord.id,
      clock_out_time: specifiedTime,
      work_hours: workHours,
      status: finalStatus
    })

    const { data, error } = await supabase
      .from('time_records')
      .update({
        clock_out_time: specifiedTime,
        work_hours: workHours,
        status: finalStatus
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
    
    const { data, error } = await supabase
      .from('time_records')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('record_date', today)
      .maybeSingle()
    
    if (error) {
      console.error('❌ 本日記録取得エラー:', error)
      throw error
    }
    
    console.log('✅ 本日記録取得結果:', data ? '記録あり' : '記録なし')
    return data || null
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