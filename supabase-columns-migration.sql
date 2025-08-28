-- Supabase PostgreSQL用の列追加マイグレーション
-- 間違い打刻修正機能に必要な列を追加

-- =================================
-- 1. time_recordsテーブルの列追加
-- =================================

-- is_manual_entry列の追加（存在しない場合）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'time_records' AND column_name = 'is_manual_entry' AND table_schema = 'public'
    ) THEN
        ALTER TABLE time_records ADD COLUMN is_manual_entry BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'time_records.is_manual_entry カラムを追加しました';
    ELSE
        RAISE NOTICE 'time_records.is_manual_entry カラムは既に存在します';
    END IF;
END $$;

-- approved_by列の追加（存在しない場合）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'time_records' AND column_name = 'approved_by' AND table_schema = 'public'
    ) THEN
        ALTER TABLE time_records ADD COLUMN approved_by UUID;
        RAISE NOTICE 'time_records.approved_by カラムを追加しました';
    ELSE
        RAISE NOTICE 'time_records.approved_by カラムは既に存在します';
    END IF;
END $$;

-- 既存レコードのis_manual_entryをfalseに設定
UPDATE time_records 
SET is_manual_entry = FALSE 
WHERE is_manual_entry IS NULL;

-- =================================
-- 2. audit_logsテーブルの作成（存在しない場合）
-- =================================

-- audit_logsテーブルが既に存在するかチェックしてから作成
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'audit_logs' AND table_schema = 'public'
    ) THEN
        CREATE TABLE audit_logs (
            id BIGSERIAL PRIMARY KEY,
            table_name TEXT NOT NULL,
            record_id TEXT NOT NULL,
            action TEXT NOT NULL,
            old_values JSONB,
            new_values JSONB,
            reason TEXT,
            user_id UUID,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        RAISE NOTICE 'audit_logs テーブルを作成しました';
    ELSE
        RAISE NOTICE 'audit_logs テーブルは既に存在します';
    END IF;
END $$;

-- =================================
-- 3. インデックスの追加
-- =================================

-- audit_logsテーブルにインデックスを追加
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_name ON audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);

-- time_recordsのis_manual_entryにインデックスを追加
CREATE INDEX IF NOT EXISTS idx_time_records_is_manual ON time_records(is_manual_entry);

-- =================================
-- 4. マイグレーション記録
-- =================================

-- マイグレーション完了のログを記録
INSERT INTO audit_logs (
    table_name, 
    record_id, 
    action, 
    reason, 
    new_values,
    created_at
) VALUES (
    'migration', 
    'supabase-columns-migration', 
    'INSERT', 
    'Supabase PostgreSQL列追加マイグレーション完了',
    jsonb_build_object(
        'migration_type', 'column_addition',
        'tables_modified', ARRAY['time_records', 'audit_logs'],
        'columns_added', ARRAY['is_manual_entry', 'approved_by'],
        'completion_time', NOW()
    ),
    NOW()
);

-- 完了メッセージ
SELECT 
    '✅ Supabaseマイグレーション完了' as status,
    '間違い打刻修正機能に必要な列を追加しました' as message,
    NOW() as completion_time;

-- =================================
-- 5. 設定確認
-- =================================

-- 追加された列の確認
SELECT 
    '列追加確認' as check_type,
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name IN ('time_records', 'audit_logs')
    AND column_name IN ('is_manual_entry', 'approved_by', 'reason', 'user_id')
    AND table_schema = 'public'
ORDER BY table_name, column_name;

-- テーブル作成確認
SELECT 
    'テーブル存在確認' as check_type,
    table_name,
    'EXISTS' as status
FROM information_schema.tables 
WHERE table_name IN ('time_records', 'audit_logs', 'employees', 'admin_profiles')
    AND table_schema = 'public'
ORDER BY table_name;