-- ============================================================
-- 再計算が反映されない原因の切り分け：RLSポリシー確認
-- Supabase SQL Editor で実行し、結果を貼り付けてください
-- ============================================================

-- 【A】 time_records のRLS有効状態
SELECT relname AS table_name, relrowsecurity AS rls_enabled, relforcerowsecurity AS rls_forced
FROM pg_class
WHERE relname = 'time_records' AND relnamespace = 'public'::regnamespace;


-- 【B】 time_records の全ポリシー（cmd=UPDATE があるか、roles に anon/authenticated が含まれるかが核心）
SELECT
  policyname,
  cmd,                 -- SELECT / INSERT / UPDATE / DELETE / ALL
  roles,               -- {anon} {authenticated} など。ここにアプリのロールが無い/UPDATEが無いと弾かれる
  qual         AS using_expr,        -- USING（対象行の条件）
  with_check   AS with_check_expr    -- WITH CHECK（更新後の行の条件）
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'time_records'
ORDER BY cmd, policyname;


-- 【C】 anon / authenticated ロールへの素のテーブル権限（GRANT）も確認
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'time_records'
  AND grantee IN ('anon', 'authenticated', 'public')
ORDER BY grantee, privilege_type;
