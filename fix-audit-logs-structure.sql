-- audit_logsテーブル構造の確認と修正

-- =================================
-- 1. 現在のaudit_logsテーブル構造確認
-- =================================

-- 現在の列構成を確認
SELECT 
    '現在のaudit_logsテーブル構造' as check_type,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'audit_logs' 
    AND table_schema = 'public'
ORDER BY ordinal_position;

-- =================================
-- 2. reason列の追加（存在しない場合）
-- =================================

-- reason列を追加
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'audit_logs' 
        AND column_name = 'reason' 
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE audit_logs ADD COLUMN reason TEXT;
        RAISE NOTICE 'audit_logs.reason カラムを追加しました';
    ELSE
        RAISE NOTICE 'audit_logs.reason カラムは既に存在します';
    END IF;
END $$;

-- user_id列の追加（存在しない場合）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'audit_logs' 
        AND column_name = 'user_id' 
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE audit_logs ADD COLUMN user_id UUID;
        RAISE NOTICE 'audit_logs.user_id カラムを追加しました';
    ELSE
        RAISE NOTICE 'audit_logs.user_id カラムは既に存在します';
    END IF;
END $$;

-- ip_address列の追加（存在しない場合）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'audit_logs' 
        AND column_name = 'ip_address' 
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE audit_logs ADD COLUMN ip_address INET;
        RAISE NOTICE 'audit_logs.ip_address カラムを追加しました';
    ELSE
        RAISE NOTICE 'audit_logs.ip_address カラムは既に存在します';
    END IF;
END $$;

-- user_agent列の追加（存在しない場合）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'audit_logs' 
        AND column_name = 'user_agent' 
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE audit_logs ADD COLUMN user_agent TEXT;
        RAISE NOTICE 'audit_logs.user_agent カラムを追加しました';
    ELSE
        RAISE NOTICE 'audit_logs.user_agent カラムは既に存在します';
    END IF;
END $$;

-- =================================
-- 3. 修正後の構造確認
-- =================================

-- 修正後の列構成を確認
SELECT 
    '修正後のaudit_logsテーブル構造' as check_type,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'audit_logs' 
    AND table_schema = 'public'
ORDER BY ordinal_position;

-- =================================
-- 4. インデックスの追加
-- =================================

-- reasonとuser_idにインデックスを追加
CREATE INDEX IF NOT EXISTS idx_audit_logs_reason ON audit_logs(reason);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id_created ON audit_logs(user_id, created_at);

-- =================================
-- 5. 修正記録
-- =================================

-- 修正作業のログを記録
INSERT INTO audit_logs (
    table_name,
    record_id,
    action,
    new_values,
    reason,
    created_at
) VALUES (
    'audit_logs_structure_fix',
    'fix-' || NOW()::text,
    'UPDATE',
    jsonb_build_object(
        'fix_type', 'add_missing_columns',
        'columns_added', ARRAY['reason', 'user_id', 'ip_address', 'user_agent'],
        'completed_at', NOW()
    ),
    'audit_logsテーブルに不足していた列を追加',
    NOW()
);

SELECT 
    '✅ audit_logsテーブル修正完了' as status,
    'reason, user_id, ip_address, user_agentカラムを追加しました' as message,
    NOW() as completion_time;