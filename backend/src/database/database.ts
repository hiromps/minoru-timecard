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
      status TEXT DEFAULT '通常',
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

// データベースマイグレーション関数
export const migrateDatabase = () => {
  console.log('データベースマイグレーションを開始します...');

  // 既存のtime_recordsテーブルのCHECK制約を更新するため、新しいテーブルを作成して移行
  db.serialize(() => {
    // 1. 新しいテーブルを作成（複合ステータスを含む）
    db.run(`
      CREATE TABLE IF NOT EXISTS time_records_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id TEXT NOT NULL,
        record_date TEXT NOT NULL,
        clock_in_time DATETIME,
        clock_out_time DATETIME,
        status TEXT DEFAULT '通常',
        work_hours REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES employees (employee_id)
      )
    `, (err) => {
      if (err) {
        console.error('新テーブル作成エラー:', err.message);
        return;
      }
      console.log('新しいtime_recordsテーブルを作成しました（動的ステータス対応）');
    });

    // 2. 既存データを新テーブルにコピー
    db.run(`
      INSERT INTO time_records_new
      (id, employee_id, record_date, clock_in_time, clock_out_time, status, work_hours, created_at, updated_at)
      SELECT id, employee_id, record_date, clock_in_time, clock_out_time, status, work_hours, created_at, updated_at
      FROM time_records
    `, (err) => {
      if (err) {
        console.error('データ移行エラー:', err.message);
        return;
      }
      console.log('既存データを新テーブルに移行しました');
    });

    // 3. 古いテーブルを削除
    db.run(`DROP TABLE IF EXISTS time_records`, (err) => {
      if (err) {
        console.error('旧テーブル削除エラー:', err.message);
        return;
      }
      console.log('旧テーブルを削除しました');
    });

    // 4. 新テーブルの名前を変更
    db.run(`ALTER TABLE time_records_new RENAME TO time_records`, (err) => {
      if (err) {
        console.error('テーブル名変更エラー:', err.message);
        return;
      }
      console.log('✅ データベースマイグレーションが完了しました（動的ステータス対応）');
    });
  });
};