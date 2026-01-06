-- =================================
-- RLSポリシー パフォーマンス修正
-- =================================
-- 問題1: auth.<function>() が各行で再評価される
-- 問題2: employeesテーブルに重複するSELECTポリシー
-- 問題3: audit_logsに重複インデックス
-- =================================

-- =================================
-- 1. employeesテーブルのポリシー修正
-- =================================

-- 既存ポリシーを削除
DROP POLICY IF EXISTS "admin_employees_write" ON public.employees;
DROP POLICY IF EXISTS "public_employees_read" ON public.employees;

-- 新しいポリシーを作成（auth.uid()を(select auth.uid())に変更）
-- 読み取りは全員許可
CREATE POLICY "public_employees_read" ON public.employees
    FOR SELECT USING (true);

-- 書き込み（INSERT, UPDATE, DELETE）は管理者のみ
CREATE POLICY "admin_employees_write" ON public.employees
    FOR INSERT WITH CHECK (
        (select auth.uid()) IS NOT NULL AND 
        EXISTS (
            SELECT 1 FROM public.admin_profiles 
            WHERE id = (select auth.uid()) AND is_active = true
        )
    );

CREATE POLICY "admin_employees_update" ON public.employees
    FOR UPDATE USING (
        (select auth.uid()) IS NOT NULL AND 
        EXISTS (
            SELECT 1 FROM public.admin_profiles 
            WHERE id = (select auth.uid()) AND is_active = true
        )
    );

CREATE POLICY "admin_employees_delete" ON public.employees
    FOR DELETE USING (
        (select auth.uid()) IS NOT NULL AND 
        EXISTS (
            SELECT 1 FROM public.admin_profiles 
            WHERE id = (select auth.uid()) AND is_active = true
        )
    );

-- =================================
-- 2. time_recordsテーブルのポリシー修正
-- =================================

DROP POLICY IF EXISTS "admin_time_records_delete" ON public.time_records;

CREATE POLICY "admin_time_records_delete" ON public.time_records
    FOR DELETE USING (
        (select auth.uid()) IS NOT NULL AND 
        EXISTS (
            SELECT 1 FROM public.admin_profiles 
            WHERE id = (select auth.uid()) AND is_active = true
        )
    );

-- =================================
-- 3. admin_profilesテーブルのポリシー修正
-- =================================

DROP POLICY IF EXISTS "simple_admin_insert" ON public.admin_profiles;
DROP POLICY IF EXISTS "simple_admin_read" ON public.admin_profiles;
DROP POLICY IF EXISTS "simple_admin_update" ON public.admin_profiles;

-- 認証済みユーザーが自分のプロフィールを読み取り可能
CREATE POLICY "admin_read" ON public.admin_profiles
    FOR SELECT USING (
        id = (select auth.uid())
    );

-- 管理者の追加はスーパー管理者のみ
CREATE POLICY "admin_insert" ON public.admin_profiles
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.admin_profiles 
            WHERE id = (select auth.uid()) AND role = 'super_admin' AND is_active = true
        )
    );

-- 管理者の更新は自分自身またはスーパー管理者
CREATE POLICY "admin_update" ON public.admin_profiles
    FOR UPDATE USING (
        id = (select auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.admin_profiles 
            WHERE id = (select auth.uid()) AND role = 'super_admin' AND is_active = true
        )
    );

-- =================================
-- 4. audit_logsテーブルのポリシー修正
-- =================================

DROP POLICY IF EXISTS "simple_audit_logs_insert" ON public.audit_logs;
DROP POLICY IF EXISTS "simple_audit_logs_read" ON public.audit_logs;

-- 監査ログの挿入は認証済みユーザーのみ
CREATE POLICY "audit_logs_insert" ON public.audit_logs
    FOR INSERT WITH CHECK (
        (select auth.uid()) IS NOT NULL
    );

-- 監査ログの読み取りは管理者のみ
CREATE POLICY "audit_logs_read" ON public.audit_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.admin_profiles 
            WHERE id = (select auth.uid()) AND is_active = true
        )
    );

-- =================================
-- 5. 重複インデックスの削除
-- =================================

-- どちらか一つを残す（より明確な名前の方を残す）
DROP INDEX IF EXISTS public.idx_audit_logs_user_date;
-- idx_audit_logs_user_id_created を残す

-- =================================
-- 確認クエリ
-- =================================

-- ポリシー一覧
SELECT 
    schemaname,
    tablename,
    policyname,
    cmd,
    roles
FROM pg_policies 
WHERE schemaname = 'public'
AND tablename IN ('employees', 'time_records', 'admin_profiles', 'audit_logs')
ORDER BY tablename, policyname;

-- インデックス確認
SELECT 
    indexname,
    tablename
FROM pg_indexes 
WHERE schemaname = 'public' 
AND tablename = 'audit_logs';

SELECT '✅ RLSポリシーのパフォーマンス修正完了' as status;
