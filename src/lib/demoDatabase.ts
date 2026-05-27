import { Employee, TimeRecord, TimeRecordStatus } from './supabase'
import { mockEmployees, mockTimeRecords } from './mockData'
import { getJSTDate } from '../utils/dateUtils'
import { calculateWorkTimeAndStatus } from '../utils/workTimeUtils'

// デモ環境用のデータベースサービス
export const demoEmployeeService = {
  async getAll(): Promise<Employee[]> {
    console.log('🔧 デモモード: 社員データを取得中')
    return [...mockEmployees]
  },

  async create(employee: Omit<Employee, 'id' | 'created_at' | 'updated_at'>): Promise<Employee> {
    const newEmployee: Employee = {
      id: Date.now(),
      employee_id: employee.employee_id,
      name: employee.name,
      department: employee.department,
      work_start_time: employee.work_start_time,
      work_end_time: employee.work_end_time,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
    mockEmployees.push(newEmployee)
    console.log('🔧 デモモード: 社員を追加しました', newEmployee.name)
    return newEmployee
  },

  async update(id: number, employee: Partial<Employee>): Promise<Employee> {
    const index = mockEmployees.findIndex(emp => emp.id === id)
    if (index === -1) throw new Error('社員が見つかりません')

    const updatedEmployee: Employee = {
      ...mockEmployees[index],
      ...(employee.employee_id !== undefined && { employee_id: employee.employee_id }),
      ...(employee.name !== undefined && { name: employee.name }),
      ...(employee.department !== undefined && { department: employee.department }),
      ...(employee.work_start_time !== undefined && { work_start_time: employee.work_start_time }),
      ...(employee.work_end_time !== undefined && { work_end_time: employee.work_end_time }),
      updated_at: new Date().toISOString()
    }

    mockEmployees[index] = updatedEmployee
    console.log('🔧 デモモード: 社員情報を更新しました', updatedEmployee.name)
    return updatedEmployee
  },

  async delete(id: number): Promise<void> {
    const index = mockEmployees.findIndex(emp => emp.id === id)
    if (index === -1) throw new Error('社員が見つかりません')

    console.log('🔧 デモモード: 社員を削除しました', mockEmployees[index].name)
    mockEmployees.splice(index, 1)
  },

  async findByEmployeeId(employeeId: string): Promise<Employee | null> {
    return mockEmployees.find(emp => emp.employee_id === employeeId) || null
  }
}

export const demoTimeRecordService = {
  async clockIn(employeeId: string): Promise<TimeRecord> {
    const today = getJSTDate()
    const now = new Date().toISOString()

    // 既存の記録をチェック
    const existingIndex = mockTimeRecords.findIndex(
      record => record.employee_id === employeeId && record.record_date === today
    )

    if (existingIndex !== -1 && mockTimeRecords[existingIndex].clock_in_time) {
      throw new Error('本日は既に出勤打刻済みです')
    }

    const employee = mockEmployees.find(emp => emp.employee_id === employeeId)
    if (!employee) {
      throw new Error('社員が見つかりません')
    }

    // ステータス判定（統一関数を使用・退勤前なので clockOut=null）
    const { status } = calculateWorkTimeAndStatus(
      now,
      null,
      employee.work_start_time,
      employee.work_end_time
    )

    const newRecord: TimeRecord = {
      id: Date.now(),
      employee_id: employeeId,
      record_date: today,
      clock_in_time: now,
      clock_out_time: null,
      status,
      work_hours: 0,
      overtime_minutes: 0,
      created_at: now,
      updated_at: now
    }

    if (existingIndex !== -1) {
      mockTimeRecords[existingIndex] = { ...mockTimeRecords[existingIndex], ...newRecord }
    } else {
      mockTimeRecords.push(newRecord)
    }

    console.log('🔧 デモモード: 出勤打刻しました', employee.name)
    return newRecord
  },

  async clockOut(employeeId: string): Promise<TimeRecord> {
    const today = getJSTDate()
    const now = new Date().toISOString()

    const existingIndex = mockTimeRecords.findIndex(
      record => record.employee_id === employeeId && record.record_date === today
    )

    if (existingIndex === -1 || !mockTimeRecords[existingIndex].clock_in_time) {
      throw new Error('出勤打刻が見つかりません')
    }

    if (mockTimeRecords[existingIndex].clock_out_time) {
      throw new Error('本日は既に退勤打刻済みです')
    }

    const employee = mockEmployees.find(emp => emp.employee_id === employeeId)
    if (!employee) {
      throw new Error('社員が見つかりません')
    }

    // 勤務時間・ステータス・残業時間を計算（統一関数を使用・DBの勤務時間基準）
    const { actualWorkHours, status, overtimeMinutes } = calculateWorkTimeAndStatus(
      mockTimeRecords[existingIndex].clock_in_time,
      now,
      employee.work_start_time,
      employee.work_end_time
    )

    mockTimeRecords[existingIndex] = {
      ...mockTimeRecords[existingIndex],
      clock_out_time: now,
      work_hours: actualWorkHours,
      status,
      overtime_minutes: overtimeMinutes,
      updated_at: now
    }

    console.log('🔧 デモモード: 退勤打刻しました', employee.name)
    return mockTimeRecords[existingIndex]
  },

  async clockInWithTime(employeeId: string, specifiedTime: string, isDirectWork: boolean = false): Promise<TimeRecord> {
    const clockInTime = new Date(specifiedTime)
    const today = getJSTDate(clockInTime)

    // 既存の記録をチェック
    const existingIndex = mockTimeRecords.findIndex(
      record => record.employee_id === employeeId && record.record_date === today
    )

    if (existingIndex !== -1 && mockTimeRecords[existingIndex].clock_in_time) {
      throw new Error('本日は既に出勤打刻済みです')
    }

    const employee = mockEmployees.find(emp => emp.employee_id === employeeId)
    if (!employee) {
      throw new Error('社員が見つかりません')
    }

    // ステータス判定（直行・直帰モードの場合は通常固定、それ以外は統一関数で判定）
    let status: TimeRecordStatus = '通常'
    if (!isDirectWork) {
      status = calculateWorkTimeAndStatus(
        specifiedTime,
        null,
        employee.work_start_time,
        employee.work_end_time
      ).status
    }

    const newRecord: TimeRecord = {
      id: Date.now(),
      employee_id: employeeId,
      record_date: today,
      clock_in_time: specifiedTime,
      clock_out_time: null,
      status,
      work_hours: 0,
      overtime_minutes: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    if (existingIndex !== -1) {
      mockTimeRecords[existingIndex] = { ...mockTimeRecords[existingIndex], ...newRecord }
    } else {
      mockTimeRecords.push(newRecord)
    }

    console.log('🔧 デモモード: 時刻指定出勤打刻しました', employee.name, isDirectWork ? '(直行)' : '')
    return newRecord
  },

  async clockOutWithTime(employeeId: string, specifiedTime: string, isDirectWork: boolean = false): Promise<TimeRecord> {
    const clockOutTime = new Date(specifiedTime)
    const today = getJSTDate(clockOutTime)

    const existingIndex = mockTimeRecords.findIndex(
      record => record.employee_id === employeeId && record.record_date === today
    )

    if (existingIndex === -1 || !mockTimeRecords[existingIndex].clock_in_time) {
      throw new Error('出勤打刻が見つかりません')
    }

    if (mockTimeRecords[existingIndex].clock_out_time) {
      throw new Error('本日は既に退勤打刻済みです')
    }

    const employee = mockEmployees.find(emp => emp.employee_id === employeeId)
    if (!employee) {
      throw new Error('社員が見つかりません')
    }

    // 勤務時間・ステータス・残業時間を計算（統一関数を使用）
    const calc = calculateWorkTimeAndStatus(
      mockTimeRecords[existingIndex].clock_in_time,
      specifiedTime,
      employee.work_start_time,
      employee.work_end_time
    )

    // 直行・直帰モードの場合は出勤時のステータスを維持し残業は計上しない
    let status: TimeRecordStatus = mockTimeRecords[existingIndex].status
    let overtimeMinutes = 0
    if (!isDirectWork) {
      status = calc.status
      overtimeMinutes = calc.overtimeMinutes
    }

    mockTimeRecords[existingIndex] = {
      ...mockTimeRecords[existingIndex],
      clock_out_time: specifiedTime,
      work_hours: calc.actualWorkHours,
      status,
      overtime_minutes: overtimeMinutes,
      updated_at: new Date().toISOString()
    }

    console.log('🔧 デモモード: 時刻指定退勤打刻しました', employee.name, isDirectWork ? '(直帰)' : '')
    return mockTimeRecords[existingIndex]
  },

  async getTodayRecord(employeeId: string): Promise<TimeRecord | null> {
    const today = getJSTDate()
    return mockTimeRecords.find(
      record => record.employee_id === employeeId && record.record_date === today
    ) || null
  },

  async getEmployeeRecords(employeeId: string, year?: number, month?: number): Promise<TimeRecord[]> {
    let records = mockTimeRecords.filter(record => record.employee_id === employeeId)

    if (year && month) {
      const startDate = `${year}-${month.toString().padStart(2, '0')}-01`
      const lastDay = new Date(year, month, 0).getDate()
      const endDate = `${year}-${month.toString().padStart(2, '0')}-${lastDay.toString().padStart(2, '0')}`
      records = records.filter(record => record.record_date >= startDate && record.record_date <= endDate)
    }

    return records.sort((a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime())
  },

  async getAllRecords(): Promise<(TimeRecord & { employee_name?: string })[]> {
    return mockTimeRecords.map(record => {
      const employee = mockEmployees.find(emp => emp.employee_id === record.employee_id)
      return {
        ...record,
        employee_name: employee?.name
      }
    }).sort((a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime())
  }
}