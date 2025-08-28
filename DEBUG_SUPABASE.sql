-- デバッグ用: RLSを一時的に無効化（テスト目的）
-- Supabase SQL Editorで実行してください

-- 1. 現在のRLS状況確認
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('employees', 'time_records', 'admin_profiles');

-- 2. RLSを一時的に無効化
ALTER TABLE public.employees DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_records DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_profiles DISABLE ROW LEVEL SECURITY;

-- 3. テスト用データ確認
SELECT 'employees' as table_name, count(*) as count FROM employees
UNION ALL
SELECT 'time_records' as table_name, count(*) as count FROM time_records
UNION ALL
SELECT 'admin_profiles' as table_name, count(*) as count FROM admin_profiles;

-- 4. 打刻テスト後、再度RLSを有効化（セキュリティのため）
-- ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.time_records ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;