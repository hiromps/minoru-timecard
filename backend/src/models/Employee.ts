export interface Employee {
  id?: number;
  employee_id: string;
  name: string;
  department?: string;
  work_start_time: string; // "HH:MM" 形式
  work_end_time: string;   // "HH:MM" 形式
  created_at?: string;
  updated_at?: string;
}