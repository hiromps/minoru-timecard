export interface TimeRecord {
  id?: number;
  employee_id: string;
  record_date: string;     // "YYYY-MM-DD" 形式
  clock_in_time?: string;  // ISO 8601 形式
  clock_out_time?: string; // ISO 8601 形式
  status: '通常' | '遅刻' | '早退' | '残業';
  work_hours: number;
  created_at?: string;
  updated_at?: string;
}