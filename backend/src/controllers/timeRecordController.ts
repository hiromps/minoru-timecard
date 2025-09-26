import { Request, Response } from 'express';
import { db } from '../database/database';
import { TimeRecord } from '../models/TimeRecord';
import { getJSTDate } from '../utils/dateUtils';

// ステータス判定ロジック（動的組み合わせ版）
const determineStatus = (clockInTime: Date, clockOutTime: Date | null, workStartTime: string, workEndTime: string): string => {
  const clockInHour = clockInTime.getHours();
  const clockInMinute = clockInTime.getMinutes();
  const clockInTotalMinutes = clockInHour * 60 + clockInMinute;

  // 個別出勤時間との比較
  const [workStartHour, workStartMinute] = workStartTime.split(':').map(Number);
  const workStartTotalMinutes = workStartHour * 60 + workStartMinute;

  // 個別退勤時間
  const [workEndHour, workEndMinute] = workEndTime.split(':').map(Number);
  const workEndTotalMinutes = workEndHour * 60 + workEndMinute;

  // 各種判定フラグ
  const isLate = clockInTotalMinutes > workStartTotalMinutes;
  let isEarlyLeave = false;
  let isOvertime = false;

  // 退勤時間がある場合の追加判定
  if (clockOutTime) {
    const clockOutHour = clockOutTime.getHours();
    const clockOutMinute = clockOutTime.getMinutes();
    const clockOutTotalMinutes = clockOutHour * 60 + clockOutMinute;

    // 個別退勤時間との比較
    isEarlyLeave = clockOutTotalMinutes < workEndTotalMinutes;
    isOvertime = clockOutTotalMinutes > workEndTotalMinutes;
  }

  // 動的ステータス組み合わせ
  const statusParts: string[] = [];

  // 優先順位に従ってステータスを追加
  if (isLate) {
    statusParts.push('遅刻');
  }

  if (clockOutTime) { // 退勤済みの場合のみ退勤関連ステータスを判定
    if (isEarlyLeave) {
      statusParts.push('早退');
    } else if (isOvertime) {
      statusParts.push('残業');
    }
  }

  // ステータスが複数ある場合は「・」で結合、なければ「通常」
  if (statusParts.length > 0) {
    return statusParts.join('・');
  }

  return '通常';
};

// 古いレコードをクリーンアップする関数
const cleanupOldRecords = (employee_id: string, record_date: string) => {
  // 30日以前の不完全なレコード（clock_out_timeがnullのもの）を削除
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cleanupDate = getJSTDate(thirtyDaysAgo);

  const cleanupSql = `DELETE FROM time_records
                      WHERE employee_id = ?
                      AND record_date < ?
                      AND clock_out_time IS NULL`;

  db.run(cleanupSql, [employee_id, cleanupDate], (err) => {
    if (err) {
      console.log('クリーンアップエラー:', err.message);
    } else {
      console.log(`古い不完全レコードをクリーンアップしました: ${employee_id}`);
    }
  });
};

// 出勤打刻
export const clockIn = (req: Request, res: Response) => {
  const { employee_id } = req.body;
  const now = new Date();
  // 0時基準で日付を決定（JST）
  const today = getJSTDate(now);

  // 古いレコードのクリーンアップを実行
  cleanupOldRecords(employee_id, today);

  // 社員の勤務時間を取得
  db.get('SELECT work_start_time, work_end_time FROM employees WHERE employee_id = ?', [employee_id], (err, employee: any) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }

    if (!employee) {
      res.status(404).json({ error: '社員が見つかりません' });
      return;
    }

    // 既存レコードの確認
    db.get('SELECT * FROM time_records WHERE employee_id = ? AND record_date = ?', [employee_id, today], (err, existingRecord: any) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }

      const status = determineStatus(now, null, employee.work_start_time, employee.work_end_time);

      let sql: string;
      let params: any[];

      if (existingRecord) {
        // 既存レコードがある場合は出勤時刻のみ更新（退勤データは保持）
        sql = `UPDATE time_records
               SET clock_in_time = ?, status = ?, updated_at = CURRENT_TIMESTAMP
               WHERE employee_id = ? AND record_date = ?`;
        params = [now.toISOString(), status, employee_id, today];
      } else {
        // 新規レコード作成
        sql = `INSERT INTO time_records (employee_id, record_date, clock_in_time, status)
               VALUES (?, ?, ?, ?)`;
        params = [employee_id, today, now.toISOString(), status];
      }

      db.run(sql, params, function(err) {
        if (err) {
          res.status(400).json({ error: err.message });
          return;
        }
        res.json({
          message: '出勤打刻が完了しました',
          status,
          time: now.toISOString()
        });
      });
    });
  });
};

// 退勤打刻
export const clockOut = (req: Request, res: Response) => {
  const { employee_id } = req.body;
  const now = new Date();
  // 0時基準で日付を決定（JST）
  const today = getJSTDate(now);
  
  // 今日の出勤記録を取得
  db.get('SELECT * FROM time_records WHERE employee_id = ? AND record_date = ?', [employee_id, today], (err, record: any) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (!record || !record.clock_in_time) {
      res.status(400).json({ error: '出勤記録が見つかりません' });
      return;
    }
    
    // 日付文字列を確実にDateオブジェクトに変換
    let clockInTime: Date;
    if (typeof record.clock_in_time === 'string') {
      // ISO文字列の場合はそのまま変換
      clockInTime = new Date(record.clock_in_time);
      // 変換に失敗した場合の処理
      if (isNaN(clockInTime.getTime())) {
        res.status(400).json({ error: '出勤時刻の形式が不正です' });
        return;
      }
    } else {
      clockInTime = new Date(record.clock_in_time);
    }
    
    // 勤務時間を分単位で計算してから時間に変換（精度向上）
    const workMinutes = Math.round((now.getTime() - clockInTime.getTime()) / (1000 * 60));
    const workHours = workMinutes / 60;
    
    // デバッグ用ログ（本番環境では削除）
    console.log(`Employee: ${employee_id}, Clock In: ${clockInTime.toISOString()}, Clock Out: ${now.toISOString()}, Work Minutes: ${workMinutes}, Work Hours: ${workHours}`);
    
    // 社員の勤務時間を取得してステータス再判定
    db.get('SELECT work_start_time, work_end_time FROM employees WHERE employee_id = ?', [employee_id], (err, employee: any) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      const status = determineStatus(clockInTime, now, employee.work_start_time, employee.work_end_time);
      
      const sql = `UPDATE time_records SET clock_out_time = ?, work_hours = ?, status = ?, updated_at = CURRENT_TIMESTAMP 
                   WHERE employee_id = ? AND record_date = ?`;
      
      db.run(sql, [now.toISOString(), workHours, status, employee_id, today], function(err) {
        if (err) {
          res.status(400).json({ error: err.message });
          return;
        }
        res.json({ 
          message: '退勤打刻が完了しました',
          status,
          workHours: Math.round(workHours * 100) / 100,
          time: now.toISOString()
        });
      });
    });
  });
};

// 全打刻記録取得
export const getTimeRecords = (req: Request, res: Response) => {
  const sql = `SELECT tr.*, e.name as employee_name 
               FROM time_records tr 
               JOIN employees e ON tr.employee_id = e.employee_id 
               ORDER BY tr.record_date DESC, e.employee_id ASC`;
  
  db.all(sql, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
};

// 特定社員の打刻記録取得
export const getEmployeeTimeRecords = (req: Request, res: Response) => {
  const { employee_id } = req.params;
  const { year, month } = req.query;
  
  let sql = `SELECT tr.*, e.name as employee_name 
             FROM time_records tr 
             JOIN employees e ON tr.employee_id = e.employee_id 
             WHERE tr.employee_id = ?`;
  
  const params: any[] = [employee_id];
  
  // 年月指定がある場合はフィルタリング
  if (year && month) {
    sql += ` AND strftime('%Y', tr.record_date) = ? AND strftime('%m', tr.record_date) = ?`;
    params.push(year.toString(), month.toString().padStart(2, '0'));
  }
  
  sql += ` ORDER BY tr.record_date DESC`;
  
  db.all(sql, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
};

// CSV出力用データ取得
export const getTimeRecordsForExport = (req: Request, res: Response) => {
  const sql = `SELECT 
                 e.employee_id as '社員ID',
                 e.name as '社員名',
                 e.department as '部署',
                 tr.record_date as '日付',
                 tr.clock_in_time as '出勤時刻',
                 tr.clock_out_time as '退勤時刻',
                 tr.work_hours as '勤務時間',
                 tr.status as 'ステータス'
               FROM time_records tr 
               JOIN employees e ON tr.employee_id = e.employee_id 
               ORDER BY tr.record_date DESC, e.employee_id ASC`;
  
  db.all(sql, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
};

// 今日の特定社員の記録取得（最新のもの）
export const getTodayRecord = (req: Request, res: Response) => {
  const { employee_id } = req.params;
  // 0時基準で日付を決定（JST）
  const now = new Date();
  const today = getJSTDate(now);
  
  const sql = `SELECT tr.*, e.name as employee_name 
               FROM time_records tr 
               JOIN employees e ON tr.employee_id = e.employee_id 
               WHERE tr.employee_id = ? AND tr.record_date = ?
               ORDER BY tr.id DESC 
               LIMIT 1`;
  
  db.get(sql, [employee_id, today], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(row || null);
  });
};

// 打刻記録削除
export const deleteTimeRecord = (req: Request, res: Response) => {
  const { employee_id, record_date } = req.params;
  
  // まず該当レコードの存在確認
  db.get('SELECT * FROM time_records WHERE employee_id = ? AND record_date = ?', 
    [employee_id, record_date], (err, record: any) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (!record) {
      res.status(404).json({ error: '指定された打刻記録が見つかりません' });
      return;
    }
    
    // レコード削除実行
    const sql = `DELETE FROM time_records WHERE employee_id = ? AND record_date = ?`;
    
    db.run(sql, [employee_id, record_date], function(err) {
      if (err) {
        res.status(400).json({ error: err.message });
        return;
      }
      
      if (this.changes === 0) {
        res.status(404).json({ error: '削除対象の記録が見つかりません' });
        return;
      }
      
      res.json({ 
        message: '打刻記録を削除しました',
        deleted_count: this.changes,
        employee_id,
        record_date
      });
    });
  });
};