import { Employee, TimeRecord, isDevMode } from './supabase'

// isDevMode は supabase.ts を唯一の出所とし、後方互換のため再エクスポートする
export { isDevMode }

// 開発環境用のモックデータ
export const mockEmployees: Employee[] = [
  {
    id: 1,
    employee_id: '001',
    name: '田中太郎',
    department: '営業部',
    work_start_time: '09:00:00',
    work_end_time: '18:00:00',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 2,
    employee_id: '002',
    name: '佐藤花子',
    department: '総務部',
    work_start_time: '09:30:00',
    work_end_time: '17:30:00',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 3,
    employee_id: '003',
    name: '鈴木次郎',
    department: '開発部',
    work_start_time: '10:00:00',
    work_end_time: '19:00:00',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
]

export const mockTimeRecords: TimeRecord[] = []