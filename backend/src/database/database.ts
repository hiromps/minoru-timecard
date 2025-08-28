import sqlite3 from 'sqlite3';
import path from 'path';
import bcrypt from 'bcryptjs';

const dbPath = path.join(__dirname, '../../timecard.db');

export const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('データベース接続エラー:', err.message);
  } else {
    console.log('SQLiteデータベースに接続しました');
  }
});

export const initializeDatabase = () => {
  // 社員テーブル
  db.run(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      department TEXT,
      work_start_time TEXT DEFAULT '09:00',
      work_end_time TEXT DEFAULT '17:00',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 打刻記録テーブル
  db.run(`
    CREATE TABLE IF NOT EXISTS time_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT NOT NULL,
      record_date TEXT NOT NULL,
      clock_in_time DATETIME,
      clock_out_time DATETIME,
      status TEXT CHECK(status IN ('通常', '遅刻', '早退', '残業')) DEFAULT '通常',
      work_hours REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees (employee_id)
    )
  `);

  // 管理者テーブル
  db.run(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // セキュリティのため、デフォルト管理者アカウントの自動作成は無効化
  // 管理者アカウントは手動で作成してください
  console.log('📝 管理者アカウントは手動で作成してください');

  console.log('データベーステーブルを初期化しました');
};