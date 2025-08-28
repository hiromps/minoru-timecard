import { Request, Response } from 'express';
import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = path.join(__dirname, '../../timecard.db');

// 全打刻記録の取得（管理者用）
export const getAllTimeRecords = (req: Request, res: Response) => {
  const db = new sqlite3.Database(dbPath);
  
  const query = `
    SELECT 
      tr.id,
      tr.employee_id,
      e.name as employee_name,
      tr.record_date,
      tr.clock_in_time,
      tr.clock_out_time,
      tr.work_hours,
      tr.status,
      tr.is_manual_entry,
      tr.approved_by,
      tr.created_at,
      tr.updated_at
    FROM time_records tr
    LEFT JOIN employees e ON tr.employee_id = e.employee_id
    ORDER BY tr.record_date DESC, tr.employee_id
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Error fetching all time records:', err);
      res.status(500).json({ error: 'データベースエラーが発生しました' });
      return;
    }
    
    res.json(rows);
  });

  db.close();
};

// 打刻記録の修正（管理者用）
export const correctTimeRecord = (req: Request, res: Response) => {
  const { action, employee_id, record_date, clock_in_time, clock_out_time, reason } = req.body;
  
  if (!employee_id || !record_date || !reason) {
    res.status(400).json({ error: '必須パラメータが不足しています' });
    return;
  }

  const db = new sqlite3.Database(dbPath);

  if (action === 'delete_and_create') {
    // 既存レコードを削除してから新規作成
    handleDeleteAndCreate(db, employee_id, record_date, clock_in_time, clock_out_time, reason, res);
  } else if (action === 'update') {
    // 既存レコードを更新
    handleUpdate(db, employee_id, record_date, clock_in_time, clock_out_time, reason, res);
  } else {
    res.status(400).json({ error: '無効なアクションです' });
    db.close();
    return;
  }
};

// 削除して再作成の処理
const handleDeleteAndCreate = (
  db: sqlite3.Database, 
  employee_id: string, 
  record_date: string, 
  clock_in_time: string, 
  clock_out_time: string, 
  reason: string, 
  res: Response
) => {
  db.serialize(() => {
    // トランザクション開始
    db.run('BEGIN TRANSACTION');

    // 既存レコードを削除
    db.run(
      'DELETE FROM time_records WHERE employee_id = ? AND record_date = ?',
      [employee_id, record_date],
      function(deleteErr) {
        if (deleteErr) {
          console.error('Error deleting time record:', deleteErr);
          db.run('ROLLBACK');
          res.status(500).json({ error: 'レコードの削除に失敗しました' });
          db.close();
          return;
        }

        // 勤務時間とステータスを計算
        let work_hours = 0;
        let status = '通常';
        
        if (clock_in_time && clock_out_time) {
          const clockIn = new Date(clock_in_time);
          const clockOut = new Date(clock_out_time);
          work_hours = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60); // 時間単位
          
          if (work_hours > 8) {
            status = '残業';
          }
        }

        // 新しいレコードを作成
        db.run(
          `INSERT INTO time_records 
           (employee_id, record_date, clock_in_time, clock_out_time, work_hours, status, is_manual_entry, created_at, updated_at) 
           VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
          [employee_id, record_date, clock_in_time || null, clock_out_time || null, work_hours, status],
          function(insertErr) {
            if (insertErr) {
              console.error('Error creating new time record:', insertErr);
              db.run('ROLLBACK');
              res.status(500).json({ error: '新しいレコードの作成に失敗しました' });
              db.close();
              return;
            }

            // 監査ログを記録
            logCorrectionAction(db, employee_id, record_date, 'delete_and_create', reason, () => {
              db.run('COMMIT');
              res.json({ 
                message: '打刻記録を修正しました（削除・再作成）',
                record_id: this.lastID 
              });
              db.close();
            });
          }
        );
      }
    );
  });
};

// 既存レコード更新の処理
const handleUpdate = (
  db: sqlite3.Database, 
  employee_id: string, 
  record_date: string, 
  clock_in_time: string, 
  clock_out_time: string, 
  reason: string, 
  res: Response
) => {
  db.serialize(() => {
    // 勤務時間とステータスを計算
    let work_hours = 0;
    let status = '通常';
    
    if (clock_in_time && clock_out_time) {
      const clockIn = new Date(clock_in_time);
      const clockOut = new Date(clock_out_time);
      work_hours = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60);
      
      if (work_hours > 8) {
        status = '残業';
      }
    }

    // レコードを更新
    db.run(
      `UPDATE time_records 
       SET clock_in_time = ?, clock_out_time = ?, work_hours = ?, status = ?, 
           is_manual_entry = 1, updated_at = datetime('now')
       WHERE employee_id = ? AND record_date = ?`,
      [clock_in_time || null, clock_out_time || null, work_hours, status, employee_id, record_date],
      function(updateErr) {
        if (updateErr) {
          console.error('Error updating time record:', updateErr);
          res.status(500).json({ error: 'レコードの更新に失敗しました' });
          db.close();
          return;
        }

        if (this.changes === 0) {
          res.status(404).json({ error: '対象のレコードが見つかりません' });
          db.close();
          return;
        }

        // 監査ログを記録
        logCorrectionAction(db, employee_id, record_date, 'update', reason, () => {
          res.json({ 
            message: '打刻記録を更新しました',
            changes: this.changes 
          });
          db.close();
        });
      }
    );
  });
};

// 監査ログの記録
const logCorrectionAction = (
  db: sqlite3.Database, 
  employee_id: string, 
  record_date: string, 
  action: string, 
  reason: string, 
  callback: () => void
) => {
  // 監査ログテーブルが存在しない場合は作成
  db.run(
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      action TEXT NOT NULL,
      old_values TEXT,
      new_values TEXT,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    (createErr) => {
      if (createErr) {
        console.error('Error creating audit_logs table:', createErr);
      }

      // 監査ログにエントリを追加
      db.run(
        `INSERT INTO audit_logs (table_name, record_id, action, reason, created_at) 
         VALUES ('time_records', ?, ?, ?, datetime('now'))`,
        [`${employee_id}-${record_date}`, action, reason],
        (logErr) => {
          if (logErr) {
            console.error('Error logging correction action:', logErr);
          }
          callback();
        }
      );
    }
  );
};

// 管理者権限チェック（簡易版）
export const requireAdmin = (req: Request, res: Response, next: any) => {
  // 実際の実装では、セッションやJWTトークンから管理者権限を確認
  // 現在は簡易的にすべてのリクエストを許可
  next();
};

// 打刻記録の削除（管理者用）
export const deleteTimeRecord = (req: Request, res: Response) => {
  const { employee_id, record_date, reason } = req.body;
  
  if (!employee_id || !record_date || !reason) {
    res.status(400).json({ error: '必須パラメータが不足しています' });
    return;
  }

  const db = new sqlite3.Database(dbPath);

  db.run(
    'DELETE FROM time_records WHERE employee_id = ? AND record_date = ?',
    [employee_id, record_date],
    function(err) {
      if (err) {
        console.error('Error deleting time record:', err);
        res.status(500).json({ error: 'レコードの削除に失敗しました' });
        db.close();
        return;
      }

      if (this.changes === 0) {
        res.status(404).json({ error: '対象のレコードが見つかりません' });
        db.close();
        return;
      }

      // 監査ログを記録
      logCorrectionAction(db, employee_id, record_date, 'delete', reason, () => {
        res.json({ 
          message: '打刻記録を削除しました',
          deleted_count: this.changes 
        });
        db.close();
      });
    }
  );
};