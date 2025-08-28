-- セキュリティ強化版へのマイグレーションスクリプト
-- 既存のデータを保護しながら段階的に移行

-- =================================
-- 0. 前準備とバックアップ
-- =================================

-- 現在のテーブル構造を確認
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
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'employees') THEN
        RAISE NOTICE '既存 employees レコード数: %', (SELECT COUNT(*) FROM employees);
    END IF;
    
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'time_records') THEN
        RAISE NOTICE '既存 time_records レコード数: %', (SELECT COUNT(*) FROM time_records);
    END IF;
    
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'admin_profiles') THEN
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
        WHERE table_name = 'employees' AND column_name = 'is_active'
    ) THEN
        ALTER TABLE employees ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
        RAISE NOTICE 'employees.is_active カラムを追加しました';
    END IF;
    
    -- created_byカラムの追加
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'employees' AND column_name = 'created_by'
    ) THEN
        ALTER TABLE employees ADD COLUMN created_by UUID REFERENCES auth.users(id);
        RAISE NOTICE 'employees.created_by カラムを追加しました';
    END IF;
    
    -- updated_byカラムの追加
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'employees' AND column_name = 'updated_by'
    ) THEN
        ALTER TABLE employees ADD COLUMN updated_by UUID REFERENCES auth.users(id);
        RAISE NOTICE 'employees.updated_by カラムを追加しました';
    END IF;
END $$;

-- time_recordsテーブルの拡張
DO $$
BEGIN
    -- ip_addressカラムの追加
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'time_records' AND column_name = 'ip_address'
    ) THEN
        ALTER TABLE time_records ADD COLUMN ip_address INET;
        RAISE NOTICE 'time_records.ip_address カラムを追加しました';
    END IF;
    
    -- user_agentカラムの追加
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'time_records' AND column_name = 'user_agent'
    ) THEN
        ALTER TABLE time_records ADD COLUMN user_agent TEXT;
        RAISE NOTICE 'time_records.user_agent カラムを追加しました';
    END IF;
    
    -- is_manual_entryカラムの追加
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'time_records' AND column_name = 'is_manual_entry'
    ) THEN
        ALTER TABLE time_records ADD COLUMN is_manual_entry BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'time_records.is_manual_entry カラムを追加しました';
    END IF;
    
    -- approved_byカラムの追加
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'time_records' AND column_name = 'approved_by'
    ) THEN
        ALTER TABLE time_records ADD COLUMN approved_by UUID REFERENCES auth.users(id);
        RAISE NOTICE 'time_records.approved_by カラムを追加しました';
    END IF;
END $$;

-- admin_profilesテーブルの拡張
DO $$
BEGIN
    -- emailカラムの追加
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'admin_profiles' AND column_name = 'email'
    ) THEN
        ALTER TABLE admin_profiles ADD COLUMN email TEXT;
        RAISE NOTICE 'admin_profiles.email カラムを追加しました';
    END IF;
    
    -- roleカラムの追加
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'admin_profiles' AND column_name = 'role'
    ) THEN
        ALTER TABLE admin_profiles ADD COLUMN role TEXT CHECK(role IN ('super_admin', 'admin', 'viewer')) DEFAULT 'viewer';
        RAISE NOTICE 'admin_profiles.role カラムを追加しました';
    END IF;
    
    -- last_loginカラムの追加
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'admin_profiles' AND column_name = 'last_login'
    ) THEN
        ALTER TABLE admin_profiles ADD COLUMN last_login TIMESTAMPTZ;
        RAISE NOTICE 'admin_profiles.last_login カラムを追加しました';
    END IF;
    
    -- failed_login_attemptsカラムの追加
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'admin_profiles' AND column_name = 'failed_login_attempts'
    ) THEN
        ALTER TABLE admin_profiles ADD COLUMN failed_login_attempts INTEGER DEFAULT 0;
        RAISE NOTICE 'admin_profiles.failed_login_attempts カラムを追加しました';
    END IF;
    
    -- locked_untilカラムの追加
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'admin_profiles' AND column_name = 'locked_until'
    ) THEN
        ALTER TABLE admin_profiles ADD COLUMN locked_until TIMESTAMPTZ;
        RAISE NOTICE 'admin_profiles.locked_until カラムを追加しました';
    END IF;
END $$;

-- =================================
-- 2. 新しいテーブルの作成
-- =================================

-- audit_logsテーブルの作成
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    action TEXT CHECK(action IN ('INSERT', 'UPDATE', 'DELETE', 'SELECT')) NOT NULL,
    old_values JSONB,
    new_values JSONB,
    user_id UUID REFERENCES auth.users(id),
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- user_sessionsテーブルの作成
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    ip_address INET NOT NULL,
    user_agent TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_activity TIMESTAMPTZ DEFAULT NOW()
);

RAISE NOTICE '新しいテーブル（audit_logs, user_sessions）を作成しました';

-- =================================
-- 3. インデックスの作成
-- =================================

-- 既存インデックスの確認と作成
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
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_sessions_user_active') THEN
        CREATE INDEX idx_sessions_user_active ON user_sessions(user_id, is_active);
        RAISE NOTICE 'インデックス idx_sessions_user_active を作成しました';
    END IF;
END $$;

-- =================================
-- 4. 制約の追加（安全に）
-- =================================

-- データ整合性制約の追加
DO $$
BEGIN
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
    END;
    
    -- admin_profilesのメール一意性
    BEGIN
        ALTER TABLE admin_profiles 
        ADD CONSTRAINT unique_admin_email 
        UNIQUE (email);
        RAISE NOTICE '管理者メール一意性制約を追加しました';
    EXCEPTION 
        WHEN duplicate_object THEN 
            RAISE NOTICE '管理者メール一意性制約は既に存在します';
    END;
END $$;

-- =================================
-- 5. 既存データの移行とデフォルト値設定
-- =================================

-- 既存のadmin_profilesにデフォルト値を設定
DO $$
BEGIN
    -- emailが空のレコードにデフォルトメールを設定
    UPDATE admin_profiles 
    SET email = 'admin-' || id || '@minoru-timecard.local'
    WHERE email IS NULL OR email = '';
    
    -- roleが空のレコードにデフォルト役割を設定
    UPDATE admin_profiles 
    SET role = 'admin'  -- 既存ユーザーはadmin権限
    WHERE role IS NULL;
    
    -- failed_login_attemptsのデフォルト値
    UPDATE admin_profiles 
    SET failed_login_attempts = 0
    WHERE failed_login_attempts IS NULL;
    
    RAISE NOTICE '既存のadmin_profilesにデフォルト値を設定しました';
END $$;

-- 既存のemployeesにデフォルト値を設定
UPDATE employees 
SET is_active = TRUE
WHERE is_active IS NULL;

-- 既存のtime_recordsにデフォルト値を設定
UPDATE time_records 
SET is_manual_entry = FALSE
WHERE is_manual_entry IS NULL;

RAISE NOTICE '既存データにデフォルト値を設定しました';

-- =================================
-- 6. トリガー関数の作成
-- =================================

-- updated_at自動更新関数（既存の場合は置き換え）
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    IF TG_TABLE_NAME IN ('employees', 'time_records') THEN
        NEW.updated_by = auth.uid();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 監査ログ記録用関数
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
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
        auth.uid(),
        inet_client_addr()
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

RAISE NOTICE 'トリガー関数を作成しました';

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

RAISE NOTICE 'トリガーを作成しました';

-- =================================
-- 8. RLSの有効化（段階的）
-- =================================

-- RLSを有効化
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

RAISE NOTICE 'RLSを有効化しました';

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
    'マイグレーション後のデータ件数' as status,
    'employees' as table_name,
    COUNT(*) as record_count
FROM employees
UNION ALL
SELECT 
    'マイグレーション後のデータ件数' as status,
    'time_records' as table_name,
    COUNT(*) as record_count
FROM time_records
UNION ALL
SELECT 
    'マイグレーション後のデータ件数' as status,
    'admin_profiles' as table_name,
    COUNT(*) as record_count
FROM admin_profiles
UNION ALL
SELECT 
    'マイグレーション後のデータ件数' as status,
    'audit_logs' as table_name,
    COUNT(*) as record_count
FROM audit_logs
UNION ALL
SELECT 
    'マイグレーション後のデータ件数' as status,
    'user_sessions' as table_name,
    COUNT(*) as record_count
FROM user_sessions;

-- マイグレーション成功の記録
INSERT INTO audit_logs (
    table_name,
    record_id,
    action,
    new_values
) VALUES (
    'migration',
    'enhanced-security-migration',
    'INSERT',
    jsonb_build_object(
        'migration_type', 'enhanced_security_migration',
        'completed_at', NOW(),
        'status', 'SUCCESS',
        'version', '1.0'
    )
);

SELECT 
    '✅ マイグレーション完了' as status,
    'セキュリティ強化版への移行が正常に完了しました' as message,
    NOW() as completion_time;

-- 次のステップの案内
SELECT 
    '📋 次のステップ' as next_steps,
    '1. enhanced-rls-policies.sql を実行してRLSポリシーを設定してください' as step1,
    '2. スーパー管理者アカウントを作成してください' as step2,
    '3. 既存の管理者に適切な権限を設定してください' as step3;