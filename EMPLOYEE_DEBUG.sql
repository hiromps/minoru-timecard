-- 社員管理のデバッグ用SQLスクリプト
-- Supabase SQL Editorで実行してください

-- 1. 現在のテーブル状況を確認
SELECT 
  schemaname, 
  tablename, 
  rowsecurity as rls_enabled,
  tableowner
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename = 'employees';

-- 2. employeesテーブルの構造確認
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'employees'
ORDER BY ordinal_position;

-- 3. 現在のRLSポリシー確認
SELECT 
  policyname, 
  permissive, 
  roles, 
  cmd, 
  qual, 
  with_check
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename = 'employees';

-- 4. RLSを一時的に無効化（テスト用）
ALTER TABLE public.employees DISABLE ROW LEVEL SECURITY;

-- 5. 現在のデータ件数確認
SELECT COUNT(*) as employee_count FROM public.employees;

-- 6. 直接INSERTテスト（手動で値を変更してテスト）
-- INSERT INTO public.employees (employee_id, name, department, work_start_time, work_end_time)
-- VALUES ('TEST001', 'テスト太郎', 'テスト部', '09:00:00', '17:00:00');

-- 7. テスト完了後、RLSを再有効化（セキュリティのため）
-- ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- 8. 管理者用のRLSポリシーを作成（必要な場合）
-- CREATE POLICY "管理者は全てのemployeesを操作可能" ON public.employees
-- FOR ALL USING (true);