-- Minoru Timecard System - Supabase Schema
-- このSQLをSupabaseのSQL Editorで実行してください

-- 1. 社員テーブル
CREATE TABLE employees (
  id BIGSERIAL PRIMARY KEY,
  employee_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  department TEXT,
  work_start_time TIME DEFAULT '09:00:00',
  work_end_time TIME DEFAULT '17:00:00',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 打刻記録テーブル
CREATE TABLE time_records (
  id BIGSERIAL PRIMARY KEY,
  employee_id TEXT NOT NULL,
  record_date DATE NOT NULL,
  clock_in_time TIMESTAMPTZ,
  clock_out_time TIMESTAMPTZ,
  status TEXT CHECK(status IN ('通常', '遅刻', '早退', '残業')) DEFAULT '通常',
  work_hours DECIMAL(4,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (employee_id) REFERENCES employees (employee_id) ON DELETE CASCADE
);

-- 3. 管理者テーブル（Supabase Authを使用するため簡素化）
CREATE TABLE admin_profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. インデックス作成（パフォーマンス向上）
CREATE INDEX idx_time_records_employee_date ON time_records(employee_id, record_date);
CREATE INDEX idx_time_records_date ON time_records(record_date);
CREATE INDEX idx_employees_employee_id ON employees(employee_id);

-- 5. RLS (Row Level Security) 設定
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_profiles ENABLE ROW LEVEL SECURITY;

-- 6. セキュリティポリシー（全員読み取り可能、管理者のみ書き込み可能）
-- 社員データ：全員読み取り可能
CREATE POLICY "Everyone can read employees" ON employees
    FOR SELECT USING (true);

-- 社員データ：管理者のみ変更可能
CREATE POLICY "Only admins can modify employees" ON employees
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM admin_profiles 
            WHERE id = auth.uid() AND is_active = true
        )
    );

-- 打刻記録：全員読み取り可能
CREATE POLICY "Everyone can read time_records" ON time_records
    FOR SELECT USING (true);

-- 打刻記録：全員書き込み可能（出退勤打刻のため）
CREATE POLICY "Everyone can insert time_records" ON time_records
    FOR INSERT WITH CHECK (true);

-- 打刻記録：管理者のみ更新・削除可能
CREATE POLICY "Only admins can modify time_records" ON time_records
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM admin_profiles 
            WHERE id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "Only admins can delete time_records" ON time_records
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM admin_profiles 
            WHERE id = auth.uid() AND is_active = true
        )
    );

-- 管理者プロファイル：本人のみアクセス可能
CREATE POLICY "Users can read own admin_profile" ON admin_profiles
    FOR SELECT USING (auth.uid() = id);

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