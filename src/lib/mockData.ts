import { Employee, TimeRecord } from './supabase'

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

// デモモード判定（環境変数に基づく）
export const isDevMode = !process.env.REACT_APP_SUPABASE_URL || 
  process.env.REACT_APP_SUPABASE_URL.includes('placeholder') ||
  process.env.REACT_APP_SUPABASE_URL === 'your-project-url.supabase.co' ||
  !process.env.REACT_APP_SUPABASE_ANON_KEY ||
  process.env.REACT_APP_SUPABASE_ANON_KEY === 'your-anon-key-here'