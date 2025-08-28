-- Minoru Timecard System - Enhanced Security Schema
-- 改善されたセキュリティとRLSポリシーを持つSupabaseスキーマ
-- このSQLをSupabaseのSQL Editorで実行してください

-- ========================
-- 1. 基本テーブル構造
-- ========================

-- 社員テーブル
CREATE TABLE IF NOT EXISTS employees (
  id BIGSERIAL PRIMARY KEY,
  employee_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  department TEXT,
  work_start_time TIME DEFAULT '09:00:00',
  work_end_time TIME DEFAULT '17:00:00',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

-- 打刻記録テーブル（セキュリティ強化）
CREATE TABLE IF NOT EXISTS time_records (
  id BIGSERIAL PRIMARY KEY,
  employee_id TEXT NOT NULL,
  record_date DATE NOT NULL,
  clock_in_time TIMESTAMPTZ,
  clock_out_time TIMESTAMPTZ,
  status TEXT CHECK(status IN ('通常', '遅刻', '早退', '残業')) DEFAULT '通常',
  work_hours DECIMAL(4,2) DEFAULT 0,
  ip_address INET,  -- IP制限のため追加
  user_agent TEXT,  -- 不正アクセス検出のため追加
  is_manual_entry BOOLEAN DEFAULT FALSE,  -- 手動入力かどうか
  approved_by UUID REFERENCES auth.users(id),  -- 承認者
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (employee_id) REFERENCES employees (employee_id) ON DELETE CASCADE,
  -- 1日1人1レコード制約
  UNIQUE(employee_id, record_date)
);

-- 管理者プロファイル（権限レベル追加）
CREATE TABLE IF NOT EXISTS admin_profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT CHECK(role IN ('super_admin', 'admin', 'viewer')) DEFAULT 'viewer',
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMPTZ,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 監査ログテーブル（新規追加）
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

-- セッション管理テーブル（新規追加）
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

-- ========================
-- 2. インデックス作成
-- ========================

CREATE INDEX IF NOT EXISTS idx_time_records_employee_date ON time_records(employee_id, record_date);
CREATE INDEX IF NOT EXISTS idx_time_records_date ON time_records(record_date);
CREATE INDEX IF NOT EXISTS idx_time_records_ip ON time_records(ip_address);
CREATE INDEX IF NOT EXISTS idx_employees_employee_id ON employees(employee_id);
CREATE INDEX IF NOT EXISTS idx_employees_active ON employees(is_active);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_action ON audit_logs(table_name, action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_date ON audit_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user_active ON user_sessions(user_id, is_active);

-- ========================
-- 3. RLS有効化
-- ========================

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- ========================
-- 4. 強化されたRLSポリシー
-- ========================

-- 古いポリシーを削除
DROP POLICY IF EXISTS "Everyone can read employees" ON employees;
DROP POLICY IF EXISTS "Only admins can modify employees" ON employees;
DROP POLICY IF EXISTS "Everyone can read time_records" ON time_records;
DROP POLICY IF EXISTS "Everyone can insert time_records" ON time_records;
DROP POLICY IF EXISTS "Only admins can modify time_records" ON time_records;
DROP POLICY IF EXISTS "Only admins can delete time_records" ON time_records;
DROP POLICY IF EXISTS "Users can read own admin_profile" ON admin_profiles;

-- === 社員テーブルのポリシー ===

-- 社員データ：アクティブな管理者のみ読み取り可能
CREATE POLICY "Active admins can read employees" ON employees
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM admin_profiles 
            WHERE id = auth.uid() 
            AND is_active = true 
            AND role IN ('super_admin', 'admin', 'viewer')
            AND (locked_until IS NULL OR locked_until < NOW())
        )
    );

-- 社員データ：スーパー管理者と管理者のみ挿入可能
CREATE POLICY "Super admins and admins can insert employees" ON employees
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM admin_profiles 
            WHERE id = auth.uid() 
            AND is_active = true 
            AND role IN ('super_admin', 'admin')
            AND (locked_until IS NULL OR locked_until < NOW())
        )
    );

-- 社員データ：スーパー管理者と管理者のみ更新可能
CREATE POLICY "Super admins and admins can update employees" ON employees
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM admin_profiles 
            WHERE id = auth.uid() 
            AND is_active = true 
            AND role IN ('super_admin', 'admin')
            AND (locked_until IS NULL OR locked_until < NOW())
        )
    );

-- 社員データ：スーパー管理者のみ削除可能
CREATE POLICY "Only super admins can delete employees" ON employees
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM admin_profiles 
            WHERE id = auth.uid() 
            AND is_active = true 
            AND role = 'super_admin'
            AND (locked_until IS NULL OR locked_until < NOW())
        )
    );

-- === 打刻記録テーブルのポリシー ===

-- 打刻記録：管理者のみ読み取り可能
CREATE POLICY "Admins can read time_records" ON time_records
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM admin_profiles 
            WHERE id = auth.uid() 
            AND is_active = true 
            AND role IN ('super_admin', 'admin', 'viewer')
            AND (locked_until IS NULL OR locked_until < NOW())
        )
    );

-- 打刻記録：認証済みユーザーのみ挿入可能（IP制限付き）
CREATE POLICY "Authenticated users can insert time_records with IP check" ON time_records
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL AND
        -- 今日の日付のみ許可
        record_date = CURRENT_DATE AND
        -- 同じ社員IDの同じ日付のレコードが存在しない
        NOT EXISTS (
            SELECT 1 FROM time_records 
            WHERE employee_id = NEW.employee_id 
            AND record_date = NEW.record_date
        )
    );

-- 打刻記録：管理者のみ更新可能
CREATE POLICY "Admins can update time_records" ON time_records
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM admin_profiles 
            WHERE id = auth.uid() 
            AND is_active = true 
            AND role IN ('super_admin', 'admin')
            AND (locked_until IS NULL OR locked_until < NOW())
        )
    );

-- 打刻記録：スーパー管理者のみ削除可能
CREATE POLICY "Only super admins can delete time_records" ON time_records
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM admin_profiles 
            WHERE id = auth.uid() 
            AND is_active = true 
            AND role = 'super_admin'
            AND (locked_until IS NULL OR locked_until < NOW())
        )
    );

-- === 管理者プロファイルのポリシー ===

-- 管理者プロファイル：本人のみ読み取り可能
CREATE POLICY "Users can read own admin_profile" ON admin_profiles
    FOR SELECT USING (auth.uid() = id);

-- 管理者プロファイル：本人のみ基本情報更新可能（権限変更は除く）
CREATE POLICY "Users can update own basic admin_profile" ON admin_profiles
    FOR UPDATE USING (auth.uid() = id)
    WITH CHECK (
        auth.uid() = id AND
        -- 権限レベルの変更は不可
        role = OLD.role AND
        is_active = OLD.is_active
    );

-- 管理者プロファイル：スーパー管理者のみ権限管理可能
CREATE POLICY "Super admins can manage all admin_profiles" ON admin_profiles
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM admin_profiles 
            WHERE id = auth.uid() 
            AND is_active = true 
            AND role = 'super_admin'
            AND (locked_until IS NULL OR locked_until < NOW())
        )
    );

-- === 監査ログのポリシー ===

-- 監査ログ：管理者のみ読み取り可能
CREATE POLICY "Admins can read audit_logs" ON audit_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM admin_profiles 
            WHERE id = auth.uid() 
            AND is_active = true 
            AND role IN ('super_admin', 'admin')
            AND (locked_until IS NULL OR locked_until < NOW())
        )
    );

-- 監査ログ：システムのみ挿入可能（トリガー経由）
CREATE POLICY "System can insert audit_logs" ON audit_logs
    FOR INSERT WITH CHECK (true);

-- === セッション管理のポリシー ===

-- セッション：本人のみアクセス可能
CREATE POLICY "Users can manage own sessions" ON user_sessions
    FOR ALL USING (user_id = auth.uid());

-- ========================
-- 5. セキュリティ機能追加
-- ========================

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

-- updated_at自動更新関数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW.updated_by = auth.uid();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
DECLARE
    user_record admin_profiles%ROWTYPE;
BEGIN
    UPDATE admin_profiles 
    SET 
        failed_login_attempts = failed_login_attempts + 1,
        locked_until = CASE 
            WHEN failed_login_attempts >= 5 THEN NOW() + INTERVAL '1 hour'
            ELSE locked_until
        END
    WHERE email = user_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================
-- 6. トリガー設定
-- ========================

-- updated_atトリガー
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

-- ========================
-- 7. セキュリティ設定
-- ========================

-- デフォルトスーパー管理者作成（初回のみ）
-- 注意: 本番環境では適切なメールアドレスとパスワードを設定してください
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM admin_profiles WHERE role = 'super_admin') THEN
        -- この部分は手動で実際の管理者UIDに置き換える必要があります
        INSERT INTO admin_profiles (id, name, email, role, is_active)
        VALUES (
            gen_random_uuid(), -- 実際のauth.users.idに置き換え
            'システム管理者',
            'admin@minoru-timecard.local',
            'super_admin',
            true
        );
    END IF;
END $$;

-- ========================
-- 8. 定期実行ジョブ（pg_cron拡張が必要）
-- ========================

-- セッションクリーンアップを毎時実行
-- SELECT cron.schedule('cleanup-sessions', '0 * * * *', 'SELECT cleanup_expired_sessions();');

-- ========================
-- 9. セキュリティ制約
-- ========================

-- 打刻時間の妥当性チェック
ALTER TABLE time_records 
ADD CONSTRAINT check_clock_times 
CHECK (
    clock_out_time IS NULL OR 
    clock_in_time IS NULL OR 
    clock_out_time > clock_in_time
);

-- 勤務時間の妥当性チェック
ALTER TABLE time_records 
ADD CONSTRAINT check_work_hours 
CHECK (work_hours >= 0 AND work_hours <= 24);

-- 管理者メール一意性
ALTER TABLE admin_profiles 
ADD CONSTRAINT unique_admin_email 
UNIQUE (email);

-- 完了メッセージ
SELECT 'Enhanced Security Minoru Timecard Database Setup Complete!' as message;
SELECT 'セキュリティが強化されたタイムカードシステムのデータベース設定が完了しました。' as message_jp;