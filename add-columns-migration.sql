-- SQLite用の列追加マイグレーション
-- 間違い打刻修正機能に必要な列を追加

-- time_recordsテーブルに is_manual_entry 列を追加（存在しない場合）
ALTER TABLE time_records ADD COLUMN is_manual_entry INTEGER DEFAULT 0;

-- time_recordsテーブルに approved_by 列を追加（存在しない場合）  
ALTER TABLE time_records ADD COLUMN approved_by TEXT;

-- 既存レコードの is_manual_entry を 0 (false) に設定
UPDATE time_records SET is_manual_entry = 0 WHERE is_manual_entry IS NULL;

-- audit_logs テーブルを作成（存在しない場合）
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    action TEXT NOT NULL,
    old_values TEXT,
    new_values TEXT,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- マイグレーション完了のログ
INSERT INTO audit_logs (table_name, record_id, action, reason, created_at) 
VALUES ('migration', 'add-columns-migration', 'INSERT', 'SQLite列追加マイグレーション完了', datetime('now'));