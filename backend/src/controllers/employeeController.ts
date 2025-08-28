import { Request, Response } from 'express';
import { db } from '../database/database';
import { Employee } from '../models/Employee';

// 全社員取得
export const getAllEmployees = (req: Request, res: Response) => {
  db.all('SELECT * FROM employees ORDER BY employee_id ASC', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
};

// 社員追加
export const createEmployee = (req: Request, res: Response) => {
  const { employee_id, name, department, work_start_time, work_end_time }: Employee = req.body;
  
  const sql = `INSERT INTO employees (employee_id, name, department, work_start_time, work_end_time) 
               VALUES (?, ?, ?, ?, ?)`;
  
  db.run(sql, [employee_id, name, department || '', work_start_time || '09:00', work_end_time || '17:00'], function(err) {
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.json({ id: this.lastID, message: '社員が追加されました' });
  });
};

// 社員更新
export const updateEmployee = (req: Request, res: Response) => {
  const { id } = req.params;
  const { employee_id, name, department, work_start_time, work_end_time }: Employee = req.body;
  
  const sql = `UPDATE employees SET employee_id = ?, name = ?, department = ?, work_start_time = ?, work_end_time = ?, updated_at = CURRENT_TIMESTAMP 
               WHERE id = ?`;
  
  db.run(sql, [employee_id, name, department, work_start_time, work_end_time, id], function(err) {
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.json({ message: '社員情報が更新されました' });
  });
};

// 社員削除
export const deleteEmployee = (req: Request, res: Response) => {
  const { id } = req.params;
  
  db.run('DELETE FROM employees WHERE id = ?', [id], function(err) {
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.json({ message: '社員が削除されました' });
  });
};