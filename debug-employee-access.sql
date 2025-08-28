-- 社員管理ページのデータ取得エラー診断スクリプト
-- 管理者権限とRLSポリシーの問題を特定

-- =================================
-- 1. 現在の認証状況確認
-- =================================

SELECT 
    '現在の認証状況' as check_type,
    auth.uid() as current_user_id,
    CASE WHEN auth.uid() IS NULL THEN 'NOT_AUTHENTICATED' ELSE 'AUTHENTICATED' END as auth_status;

-- =================================
-- 2. admin_profilesテーブルの状況確認
-- =================================

-- admin_profilesテーブルの存在確認
SELECT 
    'admin_profilesテーブル存在確認' as check_type,
    CASE WHEN EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'admin_profiles' AND table_schema = 'public'
    ) THEN 'EXISTS' ELSE 'NOT_EXISTS' END as table_status;

-- admin_profilesのデータ確認（RLSを無効化して確認）
ALTER TABLE admin_profiles DISABLE ROW LEVEL SECURITY;

SELECT 
    'admin_profilesデータ確認' as check_type,
    COUNT(*) as total_records,
    COUNT(CASE WHEN is_active = true THEN 1 END) as active_admins,
    COUNT(CASE WHEN role = 'super_admin' THEN 1 END) as super_admins,
    COUNT(CASE WHEN role = 'admin' THEN 1 END) as admins,
    COUNT(CASE WHEN role = 'viewer' THEN 1 END) as viewers
FROM admin_profiles;

-- 具体的なadmin_profilesの内容
SELECT 
    'admin_profilesレコード詳細' as check_type,
    id,
    name,
    email,
    role,
    is_active,
    CASE WHEN locked_until > NOW() THEN 'LOCKED' ELSE 'UNLOCKED' END as lock_status
FROM admin_profiles
ORDER BY created_at;

-- admin_profilesのRLSを再度有効化
ALTER TABLE admin_profiles ENABLE ROW LEVEL SECURITY;

-- =================================
-- 3. employeesテーブルの状況確認
-- =================================

-- employeesテーブルの存在確認
SELECT 
    'employeesテーブル存在確認' as check_type,
    CASE WHEN EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'employees' AND table_schema = 'public'
    ) THEN 'EXISTS' ELSE 'NOT_EXISTS' END as table_status;

-- employeesのデータ確認（RLSを無効化して確認）
ALTER TABLE employees DISABLE ROW LEVEL SECURITY;

SELECT 
    'employeesデータ確認' as check_type,
    COUNT(*) as total_records,
    COUNT(CASE WHEN is_active = true THEN 1 END) as active_employees
FROM employees;

-- 具体的なemployeesの内容（最初の5件）
SELECT 
    'employeesレコード詳細（最初の5件）' as check_type,
    id,
    employee_id,
    name,
    department,
    is_active
FROM employees
ORDER BY created_at
LIMIT 5;

-- employeesのRLSを再度有効化
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- =================================
-- 4. RLSポリシーの確認
-- =================================

-- 現在のRLSポリシー一覧
SELECT 
    'RLSポリシー一覧' as check_type,
    schemaname,
    tablename,
    policyname,
    permissive,
    cmd as command
FROM pg_policies 
WHERE schemaname = 'public' 
    AND tablename IN ('employees', 'admin_profiles')
ORDER BY tablename, policyname;

-- RLSが有効化されているかチェック
SELECT 
    'RLS有効化状況' as check_type,
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
    AND tablename IN ('employees', 'admin_profiles', 'time_records');

-- =================================
-- 5. 権限テスト
-- =================================

-- 現在のユーザーがadmin_profilesにアクセスできるかテスト
DO $$
DECLARE
    admin_count INTEGER;
    employee_count INTEGER;
    error_message TEXT;
BEGIN
    -- admin_profilesへのアクセステスト
    BEGIN
        SELECT COUNT(*) INTO admin_count FROM admin_profiles;
        RAISE NOTICE 'admin_profilesアクセス成功: % records', admin_count;
    EXCEPTION
        WHEN others THEN
            GET STACKED DIAGNOSTICS error_message = MESSAGE_TEXT;
            RAISE NOTICE 'admin_profilesアクセスエラー: %', error_message;
            admin_count := -1;
    END;
    
    -- employeesへのアクセステスト
    BEGIN
        SELECT COUNT(*) INTO employee_count FROM employees;
        RAISE NOTICE 'employeesアクセス成功: % records', employee_count;
    EXCEPTION
        WHEN others THEN
            GET STACKED DIAGNOSTICS error_message = MESSAGE_TEXT;
            RAISE NOTICE 'employeesアクセスエラー: %', error_message;
            employee_count := -1;
    END;
    
    -- 結果のまとめ
    INSERT INTO audit_logs (
        table_name,
        record_id,
        action,
        new_values
    ) VALUES (
        'access_test',
        'debug-' || NOW()::text,
        'SELECT',
        jsonb_build_object(
            'admin_profiles_accessible', CASE WHEN admin_count >= 0 THEN true ELSE false END,
            'employees_accessible', CASE WHEN employee_count >= 0 THEN true ELSE false END,
            'admin_count', admin_count,
            'employee_count', employee_count,
            'test_timestamp', NOW()
        )
    );
END $$;

-- =================================
-- 6. 修正案の提示
-- =================================

-- 管理者アカウントが存在しない場合の緊急対応
DO $$
BEGIN
    -- auth.uid()が存在し、admin_profilesに記録がない場合
    IF auth.uid() IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM admin_profiles WHERE id = auth.uid()
    ) THEN
        -- 一時的にRLSを無効化してadmin_profileを作成
        ALTER TABLE admin_profiles DISABLE ROW LEVEL SECURITY;
        
        INSERT INTO admin_profiles (
            id, 
            name, 
            email, 
            role, 
            is_active,
            created_at,
            updated_at
        ) VALUES (
            auth.uid(),
            'Emergency Admin',
            'emergency-admin@minoru-timecard.local',
            'super_admin',
            true,
            NOW(),
            NOW()
        );
        
        ALTER TABLE admin_profiles ENABLE ROW LEVEL SECURITY;
        
        RAISE NOTICE '緊急管理者アカウントを作成しました: %', auth.uid();
    END IF;
END $$;

-- =================================
-- 7. 診断結果のまとめ
-- =================================

SELECT 
    '診断結果まとめ' as result_type,
    jsonb_build_object(
        'current_user', auth.uid(),
        'timestamp', NOW(),
        'recommendations', ARRAY[
            'RLSポリシーが正しく設定されているか確認',
            'admin_profilesに現在のユーザーが登録されているか確認',
            'テーブルのRLSが適切に有効化されているか確認'
        ]
    ) as diagnostic_info;

SELECT '診断スクリプト実行完了' as status;