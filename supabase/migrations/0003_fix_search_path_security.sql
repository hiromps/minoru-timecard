-- =================================
-- セキュリティ修正: 関数のsearch_path設定
-- =================================
-- このスクリプトは、SupabaseのLinterで検出された
-- "function_search_path_mutable" 警告を修正します。
-- 
-- 背景: search_pathが設定されていない関数は、
-- 悪意のあるスキーマを通じて攻撃される可能性があります。
-- 
-- 実行方法: Supabase SQL Editorで実行してください
-- =================================

-- まず既存の関数をすべて削除（戻り値の型が異なる場合のエラーを回避）
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS public.audit_trigger_function() CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_expired_sessions() CASCADE;
DROP FUNCTION IF EXISTS public.handle_failed_login(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.admin_create_time_record(UUID, DATE, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.check_admin_permissions() CASCADE;
DROP FUNCTION IF EXISTS public.is_admin_active() CASCADE;
DROP FUNCTION IF EXISTS public.is_admin_with_write_access() CASCADE;
DROP FUNCTION IF EXISTS public.admin_delete_time_record(UUID) CASCADE;

-- 1. update_updated_at_column - updated_atを自動更新するトリガー関数
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

-- 2. audit_trigger_function - 監査ログ記録用トリガー関数
CREATE OR REPLACE FUNCTION public.audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.audit_logs (
        table_name,
        action,
        old_data,
        new_data,
        user_id,
        created_at
    )
    VALUES (
        TG_TABLE_NAME,
        TG_OP,
        CASE WHEN TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END,
        CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN row_to_json(NEW) ELSE NULL END,
        auth.uid(),
        NOW()
    );
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- 3. cleanup_expired_sessions - 期限切れセッションを削除する関数
CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
    UPDATE public.user_sessions 
    SET is_active = false 
    WHERE expires_at < NOW() AND is_active = true;
    
    DELETE FROM public.user_sessions 
    WHERE is_active = false AND created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- 4. handle_failed_login - ログイン失敗時の処理関数
CREATE OR REPLACE FUNCTION public.handle_failed_login(user_email TEXT)
RETURNS void AS $$
DECLARE
    user_record public.admin_profiles%ROWTYPE;
BEGIN
    UPDATE public.admin_profiles 
    SET 
        failed_login_attempts = failed_login_attempts + 1,
        locked_until = CASE 
            WHEN failed_login_attempts >= 5 THEN NOW() + INTERVAL '1 hour'
            ELSE locked_until
        END
    WHERE email = user_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- 5. admin_create_time_record - 管理者が打刻記録を作成する関数
CREATE OR REPLACE FUNCTION public.admin_create_time_record(
    p_employee_id UUID,
    p_record_date DATE,
    p_clock_in_time TIMESTAMPTZ DEFAULT NULL,
    p_clock_out_time TIMESTAMPTZ DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_record_id UUID;
BEGIN
    -- 権限チェック
    IF NOT public.is_admin_with_write_access() THEN
        RAISE EXCEPTION 'Permission denied: Admin access required';
    END IF;
    
    INSERT INTO public.time_records (
        employee_id,
        record_date,
        clock_in_time,
        clock_out_time,
        notes,
        created_by_admin
    )
    VALUES (
        p_employee_id,
        p_record_date,
        p_clock_in_time,
        p_clock_out_time,
        p_notes,
        true
    )
    RETURNING id INTO v_record_id;
    
    RETURN v_record_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- 6. check_admin_permissions - 管理者権限を確認する関数
CREATE OR REPLACE FUNCTION public.check_admin_permissions()
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.admin_profiles 
        WHERE id = auth.uid() 
        AND is_active = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- 7. is_admin_active - 管理者がアクティブかを確認する関数
CREATE OR REPLACE FUNCTION public.is_admin_active()
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.admin_profiles 
        WHERE id = auth.uid() 
        AND is_active = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- 8. is_admin_with_write_access - 書き込み権限を持つ管理者かを確認する関数
CREATE OR REPLACE FUNCTION public.is_admin_with_write_access()
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.admin_profiles 
        WHERE id = auth.uid() 
        AND is_active = true
        AND role IN ('admin', 'super_admin')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- 9. admin_delete_time_record - 管理者が打刻記録を削除する関数
CREATE OR REPLACE FUNCTION public.admin_delete_time_record(p_record_id UUID)
RETURNS boolean AS $$
BEGIN
    -- 権限チェック
    IF NOT public.is_admin_with_write_access() THEN
        RAISE EXCEPTION 'Permission denied: Admin access required';
    END IF;
    
    DELETE FROM public.time_records WHERE id = p_record_id;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- =================================
-- 確認クエリ
-- =================================
SELECT 
    '✅ search_path修正完了' as status,
    proname as function_name,
    prosecdef as security_definer,
    proconfig as config
FROM pg_proc 
WHERE proname IN (
    'update_updated_at_column',
    'audit_trigger_function',
    'cleanup_expired_sessions',
    'handle_failed_login',
    'admin_create_time_record',
    'check_admin_permissions',
    'is_admin_active',
    'is_admin_with_write_access',
    'admin_delete_time_record'
)
AND pronamespace = 'public'::regnamespace;
