-- Minoru Timecard System - Enhanced Security Schema  
-- セキュリティが強化されたSupabaseスキーマ
-- このSQLをSupabaseのSQL Editorで実行してください

-- 1. 社員テーブル（セキュリティ強化）
CREATE TABLE employees (
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

-- 2. 打刻記録テーブル（セキュリティ強化）
CREATE TABLE time_records (
  id BIGSERIAL PRIMARY KEY,
  employee_id TEXT NOT NULL,
  record_date DATE NOT NULL,
  clock_in_time TIMESTAMPTZ,
  clock_out_time TIMESTAMPTZ,
  status TEXT CHECK(status IN ('通常', '遅刻', '早退', '残業')) DEFAULT '通常',
  work_hours DECIMAL(4,2) DEFAULT 0,
  ip_address INET,
  user_agent TEXT,
  is_manual_entry BOOLEAN DEFAULT FALSE,
  approved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (employee_id) REFERENCES employees (employee_id) ON DELETE CASCADE,
  UNIQUE(employee_id, record_date)
);

-- 3. 管理者プロファイル（権限レベル追加）
CREATE TABLE admin_profiles (
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

-- 4. 監査ログテーブル（新規追加）
CREATE TABLE audit_logs (
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

-- 5. セッション管理テーブル（新規追加）
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  ip_address INET NOT NULL,
  user_agent TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity TIMESTAMPTZ DEFAULT NOW()
);

-- 4. インデックス作成（パフォーマンス向上）
CREATE INDEX idx_time_records_employee_date ON time_records(employee_id, record_date);
CREATE INDEX idx_time_records_date ON time_records(record_date);
CREATE INDEX idx_employees_employee_id ON employees(employee_id);

-- 6. RLS (Row Level Security) 設定
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- 7. 強化されたセキュリティポリシー

-- 社員テーブル：アクティブな管理者のみ読み取り可能
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

-- 社員データ：管理者のみ変更可能
CREATE POLICY "Admins can modify employees" ON employees
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM admin_profiles 
            WHERE id = auth.uid() 
            AND is_active = true 
            AND role IN ('super_admin', 'admin')
            AND (locked_until IS NULL OR locked_until < NOW())
        )
    );

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

-- 打刻記録：認証済みユーザーのみ挿入可能（制限付き）
CREATE POLICY "Authenticated users can insert time_records" ON time_records
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL AND
        record_date = CURRENT_DATE
    );

-- 打刻記録：管理者のみ更新・削除可能
CREATE POLICY "Admins can modify time_records" ON time_records
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM admin_profiles 
            WHERE id = auth.uid() 
            AND is_active = true 
            AND role IN ('super_admin', 'admin')
            AND (locked_until IS NULL OR locked_until < NOW())
        )
    );

CREATE POLICY "Super admins can delete time_records" ON time_records
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM admin_profiles 
            WHERE id = auth.uid() 
            AND is_active = true 
            AND role = 'super_admin'
            AND (locked_until IS NULL OR locked_until < NOW())
        )
    );

-- 管理者プロファイル：本人のみ読み取り可能
CREATE POLICY "Users can read own admin_profile" ON admin_profiles
    FOR SELECT USING (auth.uid() = id);

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

-- セッション：本人のみアクセス可能
CREATE POLICY "Users can manage own sessions" ON user_sessions
    FOR ALL USING (user_id = auth.uid());

-- 7. updated_at自動更新のためのトリガー関数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- 8. トリガー設定
CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON employees
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_time_records_updated_at BEFORE UPDATE ON time_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admin_profiles_updated_at BEFORE UPDATE ON admin_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 9. テストデータ挿入（オプション）
INSERT INTO employees (employee_id, name, department, work_start_time, work_end_time) VALUES
    ('001', '田中太郎', '営業部', '09:00:00', '18:00:00'),
    ('002', '佐藤花子', '総務部', '09:30:00', '17:30:00'),
    ('003', '鈴木次郎', '開発部', '10:00:00', '19:00:00');

-- 実行完了
SELECT 'Minoru Timecard Database Setup Complete!' as message;