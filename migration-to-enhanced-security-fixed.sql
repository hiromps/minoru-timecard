-- セキュリティ強化版へのマイグレーションスクリプト（修正版）
-- 既存のデータを保護しながら段階的に移行
-- Supabase環境に最適化

-- =================================
-- 0. 前準備とバックアップ
-- =================================

SELECT 'マイグレーション開始前の状態確認' as status;

-- 既存テーブルの存在確認
SELECT 
    table_name,
    CASE WHEN table_name IN (
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public'
    ) THEN 'EXISTS' ELSE 'NOT_EXISTS' END as status
FROM (
    VALUES ('employees'), ('time_records'), ('admin_profiles'), ('audit_logs'), ('user_sessions')
) AS expected_tables(table_name);

-- 既存データ件数の確認
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'employees' AND table_schema = 'public') THEN
        RAISE NOTICE '既存 employees レコード数: %', (SELECT COUNT(*) FROM employees);
    END IF;
    
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'time_records' AND table_schema = 'public') THEN
        RAISE NOTICE '既存 time_records レコード数: %', (SELECT COUNT(*) FROM time_records);
    END IF;
    
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'admin_profiles' AND table_schema = 'public') THEN
        RAISE NOTICE '既存 admin_profiles レコード数: %', (SELECT COUNT(*) FROM admin_profiles);
    END IF;
END $$;

-- =================================
-- 1. 新しいテーブルとカラムの追加
-- =================================

-- employeesテーブルの拡張（既存データを保護）
DO $$
BEGIN
    -- is_activeカラムの追加
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'employees' AND column_name = 'is_active' AND table_schema = 'public'
    ) THEN
        ALTER TABLE employees ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
        RAISE NOTICE 'employees.is_active カラムを追加しました';
    END IF;
    
    -- created_byカラムの追加（UUID型、外部キー制約なし）
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'employees' AND column_name = 'created_by' AND table_schema = 'public'
    ) THEN
        ALTER TABLE employees ADD COLUMN created_by UUID;
        RAISE NOTICE 'employees.created_by カラムを追加しました';
    END IF;
    
    -- updated_byカラムの追加
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'employees' AND column_name = 'updated_by' AND table_schema = 'public'
    ) THEN
        ALTER TABLE employees ADD COLUMN updated_by UUID;
        RAISE NOTICE 'employees.updated_by カラムを追加しました';
    END IF;
    
    -- created_atとupdated_atの追加（存在しない場合）
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'employees' AND column_name = 'created_at' AND table_schema = 'public'
    ) THEN
        ALTER TABLE employees ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
        RAISE NOTICE 'employees.created_at カラムを追加しました';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'employees' AND column_name = 'updated_at' AND table_schema = 'public'
    ) THEN
        ALTER TABLE employees ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
        RAISE NOTICE 'employees.updated_at カラムを追加しました';
    END IF;
END $$;

-- time_recordsテーブルの拡張
DO $$
BEGIN
    -- ip_addressカラムの追加
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'time_records' AND column_name = 'ip_address' AND table_schema = 'public'
    ) THEN
        ALTER TABLE time_records ADD COLUMN ip_address INET;
        RAISE NOTICE 'time_records.ip_address カラムを追加しました';
    END IF;
    
    -- user_agentカラムの追加
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'time_records' AND column_name = 'user_agent' AND table_schema = 'public'
    ) THEN
        ALTER TABLE time_records ADD COLUMN user_agent TEXT;
        RAISE NOTICE 'time_records.user_agent カラムを追加しました';
    END IF;
    
    -- is_manual_entryカラムの追加
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'time_records' AND column_name = 'is_manual_entry' AND table_schema = 'public'
    ) THEN
        ALTER TABLE time_records ADD COLUMN is_manual_entry BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'time_records.is_manual_entry カラムを追加しました';
    END IF;
    
    -- approved_byカラムの追加
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'time_records' AND column_name = 'approved_by' AND table_schema = 'public'
    ) THEN
        ALTER TABLE time_records ADD COLUMN approved_by UUID;
        RAISE NOTICE 'time_records.approved_by カラムを追加しました';
    END IF;
    
    -- created_atとupdated_atの追加（存在しない場合）
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'time_records' AND column_name = 'created_at' AND table_schema = 'public'
    ) THEN
        ALTER TABLE time_records ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
        RAISE NOTICE 'time_records.created_at カラムを追加しました';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'time_records' AND column_name = 'updated_at' AND table_schema = 'public'
    ) THEN
        ALTER TABLE time_records ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
        RAISE NOTICE 'time_records.updated_at カラムを追加しました';
    END IF;
END $$;

-- admin_profilesテーブルの拡張
DO $$
BEGIN
    -- emailカラムの追加
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'admin_profiles' AND column_name = 'email' AND table_schema = 'public'
    ) THEN
        ALTER TABLE admin_profiles ADD COLUMN email TEXT;
        RAISE NOTICE 'admin_profiles.email カラムを追加しました';
    END IF;
    
    -- roleカラムの追加
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'admin_profiles' AND column_name = 'role' AND table_schema = 'public'
    ) THEN
        ALTER TABLE admin_profiles ADD COLUMN role TEXT DEFAULT 'viewer';
        RAISE NOTICE 'admin_profiles.role カラムを追加しました';
    END IF;
    
    -- is_activeカラムの追加
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'admin_profiles' AND column_name = 'is_active' AND table_schema = 'public'
    ) THEN
        ALTER TABLE admin_profiles ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
        RAISE NOTICE 'admin_profiles.is_active カラムを追加しました';
    END IF;
    
    -- last_loginカラムの追加
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'admin_profiles' AND column_name = 'last_login' AND table_schema = 'public'
    ) THEN
        ALTER TABLE admin_profiles ADD COLUMN last_login TIMESTAMPTZ;
        RAISE NOTICE 'admin_profiles.last_login カラムを追加しました';
    END IF;
    
    -- failed_login_attemptsカラムの追加
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'admin_profiles' AND column_name = 'failed_login_attempts' AND table_schema = 'public'
    ) THEN
        ALTER TABLE admin_profiles ADD COLUMN failed_login_attempts INTEGER DEFAULT 0;
        RAISE NOTICE 'admin_profiles.failed_login_attempts カラムを追加しました';
    END IF;
    
    -- locked_untilカラムの追加
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'admin_profiles' AND column_name = 'locked_until' AND table_schema = 'public'
    ) THEN
        ALTER TABLE admin_profiles ADD COLUMN locked_until TIMESTAMPTZ;
        RAISE NOTICE 'admin_profiles.locked_until カラムを追加しました';
    END IF;
    
    -- created_atとupdated_atの追加
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'admin_profiles' AND column_name = 'created_at' AND table_schema = 'public'
    ) THEN
        ALTER TABLE admin_profiles ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
        RAISE NOTICE 'admin_profiles.created_at カラムを追加しました';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'admin_profiles' AND column_name = 'updated_at' AND table_schema = 'public'
    ) THEN
        ALTER TABLE admin_profiles ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
        RAISE NOTICE 'admin_profiles.updated_at カラムを追加しました';
    END IF;
END $$;

-- =================================
-- 2. 新しいテーブルの作成
-- =================================

-- audit_logsテーブルの作成
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
            action TEXT CHECK(action IN ('INSERT', 'UPDATE', 'DELETE', 'SELECT')) NOT NULL,
            old_values JSONB,
            new_values JSONB,
            user_id UUID,
            ip_address INET,
            user_agent TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        RAISE NOTICE 'audit_logs テーブルを作成しました';
    END IF;
END $$;

-- user_sessionsテーブルの作成
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'user_sessions' AND table_schema = 'public'
    ) THEN
        CREATE TABLE user_sessions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL,
            ip_address INET NOT NULL,
            user_agent TEXT,
            is_active BOOLEAN DEFAULT TRUE,
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            last_activity TIMESTAMPTZ DEFAULT NOW()
        );
        RAISE NOTICE 'user_sessions テーブルを作成しました';
    END IF;
END $$;

-- =================================
-- 3. インデックスの作成
-- =================================

DO $$
BEGIN
    -- time_records用インデックス
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_time_records_employee_date') THEN
        CREATE INDEX idx_time_records_employee_date ON time_records(employee_id, record_date);
        RAISE NOTICE 'インデックス idx_time_records_employee_date を作成しました';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_time_records_date') THEN
        CREATE INDEX idx_time_records_date ON time_records(record_date);
        RAISE NOTICE 'インデックス idx_time_records_date を作成しました';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_time_records_ip') THEN
        CREATE INDEX idx_time_records_ip ON time_records(ip_address);
        RAISE NOTICE 'インデックス idx_time_records_ip を作成しました';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_employees_employee_id') THEN
        CREATE INDEX idx_employees_employee_id ON employees(employee_id);
        RAISE NOTICE 'インデックス idx_employees_employee_id を作成しました';
    END IF;
    
    -- 新しいカラム用インデックス
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_employees_active') THEN
        CREATE INDEX idx_employees_active ON employees(is_active);
        RAISE NOTICE 'インデックス idx_employees_active を作成しました';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_audit_logs_table_action') THEN
        CREATE INDEX idx_audit_logs_table_action ON audit_logs(table_name, action);
        RAISE NOTICE 'インデックス idx_audit_logs_table_action を作成しました';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_audit_logs_user_date') THEN
        CREATE INDEX idx_audit_logs_user_date ON audit_logs(user_id, created_at);
        RAISE NOTICE 'インデックス idx_audit_logs_user_date を作成しました';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_sessions_user_active') THEN
        CREATE INDEX idx_sessions_user_active ON user_sessions(user_id, is_active);
        RAISE NOTICE 'インデックス idx_sessions_user_active を作成しました';
    END IF;
END $$;

-- =================================
-- 4. 制約の追加（安全に）
-- =================================

DO $$
BEGIN
    -- admin_profilesのrole制約
    BEGIN
        ALTER TABLE admin_profiles 
        ADD CONSTRAINT check_admin_role 
        CHECK (role IN ('super_admin', 'admin', 'viewer'));
        RAISE NOTICE 'admin_profiles role制約を追加しました';
    EXCEPTION 
        WHEN duplicate_object THEN 
            RAISE NOTICE 'admin_profiles role制約は既に存在します';
        WHEN check_violation THEN
            RAISE NOTICE 'admin_profiles role制約違反: 既存データを確認してください';
    END;
    
    -- time_recordsのstatus制約
    BEGIN
        ALTER TABLE time_records 
        ADD CONSTRAINT check_time_record_status 
        CHECK (status IN ('通常', '遅刻', '早退', '残業'));
        RAISE NOTICE 'time_records status制約を追加しました';
    EXCEPTION 
        WHEN duplicate_object THEN 
            RAISE NOTICE 'time_records status制約は既に存在します';
        WHEN check_violation THEN
            RAISE NOTICE 'time_records status制約違反: 既存データを確認してください';
    END;
    
    -- time_recordsの時間妥当性チェック
    BEGIN
        ALTER TABLE time_records 
        ADD CONSTRAINT check_clock_times 
        CHECK (
            clock_out_time IS NULL OR 
            clock_in_time IS NULL OR 
            clock_out_time > clock_in_time
        );
        RAISE NOTICE '時間妥当性制約を追加しました';
    EXCEPTION 
        WHEN duplicate_object THEN 
            RAISE NOTICE '時間妥当性制約は既に存在します';
        WHEN check_violation THEN
            RAISE NOTICE '時間妥当性制約違反: 既存データを確認してください';
    END;
    
    -- 勤務時間の妥当性チェック
    BEGIN
        ALTER TABLE time_records 
        ADD CONSTRAINT check_work_hours 
        CHECK (work_hours >= 0 AND work_hours <= 24);
        RAISE NOTICE '勤務時間妥当性制約を追加しました';
    EXCEPTION 
        WHEN duplicate_object THEN 
            RAISE NOTICE '勤務時間妥当性制約は既に存在します';
        WHEN check_violation THEN
            RAISE NOTICE '勤務時間妥当性制約違反: 既存データを確認してください';
    END;
    
    -- admin_profilesのメール一意性（emailがNULLでない場合のみ）
    BEGIN
        -- 既存の一意性制約を削除
        ALTER TABLE admin_profiles DROP CONSTRAINT IF EXISTS unique_admin_email;
        -- 新しい部分一意性制約を追加（NULLは無視）
        CREATE UNIQUE INDEX unique_admin_email_not_null ON admin_profiles(email) WHERE email IS NOT NULL;
        RAISE NOTICE '管理者メール一意性制約を追加しました';
    EXCEPTION 
        WHEN duplicate_object THEN 
            RAISE NOTICE '管理者メール一意性制約は既に存在します';
        WHEN unique_violation THEN
            RAISE NOTICE '管理者メール重複エラー: 既存データを確認してください';
    END;
END $$;

-- =================================
-- 5. 既存データの移行とデフォルト値設定
-- =================================

DO $$
BEGIN
    -- 既存のadmin_profilesにデフォルト値を設定
    UPDATE admin_profiles 
    SET 
        email = COALESCE(email, 'admin-' || id || '@minoru-timecard.local'),
        role = COALESCE(role, 'admin'),
        is_active = COALESCE(is_active, TRUE),
        failed_login_attempts = COALESCE(failed_login_attempts, 0),
        created_at = COALESCE(created_at, NOW()),
        updated_at = COALESCE(updated_at, NOW())
    WHERE email IS NULL OR role IS NULL OR is_active IS NULL 
       OR failed_login_attempts IS NULL OR created_at IS NULL OR updated_at IS NULL;
    
    RAISE NOTICE '既存のadmin_profilesにデフォルト値を設定しました';
END $$;

-- 既存のemployeesにデフォルト値を設定
UPDATE employees 
SET 
    is_active = COALESCE(is_active, TRUE),
    created_at = COALESCE(created_at, NOW()),
    updated_at = COALESCE(updated_at, NOW())
WHERE is_active IS NULL OR created_at IS NULL OR updated_at IS NULL;

-- 既存のtime_recordsにデフォルト値を設定
UPDATE time_records 
SET 
    is_manual_entry = COALESCE(is_manual_entry, FALSE),
    created_at = COALESCE(created_at, NOW()),
    updated_at = COALESCE(updated_at, NOW())
WHERE is_manual_entry IS NULL OR created_at IS NULL OR updated_at IS NULL;

SELECT 'デフォルト値設定完了' as status;

-- =================================
-- 6. トリガー関数の作成
-- =================================

-- updated_at自動更新関数（修正版）
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    
    -- updated_byカラムが存在する場合のみ設定
    IF TG_TABLE_NAME IN ('employees', 'time_records') THEN
        -- auth.uid()が利用可能な場合のみ設定
        BEGIN
            NEW.updated_by = auth.uid();
        EXCEPTION
            WHEN others THEN
                -- auth.uid()が利用できない場合は設定しない
                NULL;
        END;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 監査ログ記録用関数（修正版）
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
    current_user_id UUID DEFAULT NULL;
    client_ip INET DEFAULT NULL;
BEGIN
    -- ユーザーIDを安全に取得
    BEGIN
        current_user_id := auth.uid();
    EXCEPTION
        WHEN others THEN
            current_user_id := NULL;
    END;
    
    -- クライアントIPを安全に取得（Supabaseでは利用できない可能性）
    BEGIN
        client_ip := inet_client_addr();
    EXCEPTION
        WHEN others THEN
            client_ip := NULL;
    END;
    
    -- 監査ログに記録
    INSERT INTO audit_logs (
        table_name, 
        record_id, 
        action, 
        old_values, 
        new_values, 
        user_id,
        ip_address
    ) VALUES (
        TG_TABLE_NAME,
        COALESCE(NEW.id::text, OLD.id::text),
        TG_OP,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN row_to_json(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) ELSE NULL END,
        current_user_id,
        client_ip
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- セッションクリーンアップ関数
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
    UPDATE user_sessions 
    SET is_active = false 
    WHERE expires_at < NOW() AND is_active = true;
    
    DELETE FROM user_sessions 
    WHERE expires_at < (NOW() - INTERVAL '30 days');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 失敗ログイン処理関数
CREATE OR REPLACE FUNCTION handle_failed_login(user_email TEXT)
RETURNS void AS $$
BEGIN
    UPDATE admin_profiles 
    SET 
        failed_login_attempts = failed_login_attempts + 1,
        locked_until = CASE 
            WHEN failed_login_attempts >= 4 THEN NOW() + INTERVAL '1 hour'
            ELSE locked_until
        END
    WHERE email = user_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT 'トリガー関数作成完了' as status;

-- =================================
-- 7. トリガーの作成
-- =================================

-- 既存トリガーを削除して再作成
DROP TRIGGER IF EXISTS update_employees_updated_at ON employees;
CREATE TRIGGER update_employees_updated_at 
    BEFORE UPDATE ON employees
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_time_records_updated_at ON time_records;
CREATE TRIGGER update_time_records_updated_at 
    BEFORE UPDATE ON time_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_admin_profiles_updated_at ON admin_profiles;
CREATE TRIGGER update_admin_profiles_updated_at 
    BEFORE UPDATE ON admin_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 監査ログトリガー
DROP TRIGGER IF EXISTS employees_audit_trigger ON employees;
CREATE TRIGGER employees_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON employees
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

DROP TRIGGER IF EXISTS time_records_audit_trigger ON time_records;
CREATE TRIGGER time_records_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON time_records
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

DROP TRIGGER IF EXISTS admin_profiles_audit_trigger ON admin_profiles;
CREATE TRIGGER admin_profiles_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON admin_profiles
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

SELECT 'トリガー作成完了' as status;

-- =================================
-- 8. RLSの有効化（段階的）
-- =================================

-- RLSを有効化
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

SELECT 'RLS有効化完了' as status;

-- =================================
-- 9. マイグレーション完了確認
-- =================================

-- テーブル構造の最終確認
SELECT 
    'マイグレーション完了後のテーブル確認' as status,
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name IN ('employees', 'time_records', 'admin_profiles', 'audit_logs', 'user_sessions')
    AND table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- データ件数の確認
SELECT 
    'マイグレーション後のデータ件数' as check_type,
    (SELECT COUNT(*) FROM employees) as employees_count,
    (SELECT COUNT(*) FROM time_records) as time_records_count,
    (SELECT COUNT(*) FROM admin_profiles) as admin_profiles_count,
    (SELECT COUNT(*) FROM audit_logs) as audit_logs_count,
    (SELECT COUNT(*) FROM user_sessions) as user_sessions_count;

-- マイグレーション成功の記録
INSERT INTO audit_logs (
    table_name,
    record_id,
    action,
    new_values,
    user_id
) VALUES (
    'migration',
    'enhanced-security-migration',
    'INSERT',
    jsonb_build_object(
        'migration_type', 'enhanced_security_migration',
        'completed_at', NOW(),
        'status', 'SUCCESS',
        'version', '1.0'
    ),
    NULL
);

-- 完了メッセージ
SELECT 
    '✅ マイグレーション完了' as status,
    'セキュリティ強化版への移行が正常に完了しました' as message,
    NOW() as completion_time;

-- 次のステップの案内
SELECT 
    '📋 次のステップ' as next_steps,
    'enhanced-rls-policies.sql を実行してRLSポリシーを設定してください' as step1,
    'スーパー管理者アカウントを作成してください' as step2,
    '既存の管理者に適切な権限を設定してください' as step3;