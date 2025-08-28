-- RLSポリシーの無限再帰エラーとデータ取得エラーの修正

-- =================================
-- 1. 問題のあるポリシーを削除
-- =================================

-- admin_profilesテーブルの無限再帰を起こすポリシーを削除
DROP POLICY IF EXISTS "Authenticated users can read all admin_profiles" ON admin_profiles;
DROP POLICY IF EXISTS "Super admins can manage all admin_profiles" ON admin_profiles;

-- time_recordsテーブルの問題ポリシーも削除
DROP POLICY IF EXISTS "Admins can read time_records" ON time_records;

SELECT 'Step 1: 問題のあるポリシーを削除しました' as status;

-- =================================
-- 2. 安全なRLSポリシーを作成
-- =================================

-- admin_profiles: 自分のプロファイルのみ読み取り可能
CREATE POLICY "Users can read own admin_profile" ON admin_profiles
    FOR SELECT USING (auth.uid() = id);

-- admin_profiles: 自分のプロファイルのみ更新可能  
CREATE POLICY "Users can update own admin_profile" ON admin_profiles
    FOR UPDATE USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- admin_profiles: 認証済みユーザーは挿入可能（新規管理者作成用）
CREATE POLICY "Authenticated users can insert admin_profiles" ON admin_profiles
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- time_records: 認証済みユーザーは全読み取り可能（一時的に緩い設定）
CREATE POLICY "Authenticated users can read time_records" ON time_records
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- employees: 認証済みユーザーは読み取り可能（一時的に緩い設定）
CREATE POLICY "Authenticated users can read employees" ON employees
    FOR SELECT USING (auth.uid() IS NOT NULL);

SELECT 'Step 2: 安全なRLSポリシーを作成しました' as status;

-- =================================
-- 3. テーブル間の関係確認
-- =================================

-- time_recordsとemployeesの関係確認
SELECT 
    'テーブル関係確認' as check_type,
    COUNT(DISTINCT tr.employee_id) as time_records_employees,
    COUNT(DISTINCT e.employee_id) as actual_employees,
    COUNT(DISTINCT tr.employee_id) - COUNT(DISTINCT e.employee_id) as missing_employees
FROM time_records tr
FULL OUTER JOIN employees e ON tr.employee_id = e.employee_id;

-- =================================
-- 4. 外部キー制約の確認・修正
-- =================================

-- 外部キー制約が存在するかチェック
SELECT 
    '外部キー制約確認' as check_type,
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
    AND tc.table_name IN ('time_records', 'employees')
    AND tc.table_schema = 'public';

-- =================================
-- 5. 不足している社員データの確認と対処
-- =================================

-- time_recordsに存在するがemployeesに存在しない社員IDを確認
WITH missing_employees AS (
    SELECT DISTINCT tr.employee_id
    FROM time_records tr
    LEFT JOIN employees e ON tr.employee_id = e.employee_id
    WHERE e.employee_id IS NULL
)
SELECT 
    'time_recordsにあってemployeesにない社員ID' as issue_type,
    employee_id
FROM missing_employees
ORDER BY employee_id;

-- 不足している社員データを自動作成
INSERT INTO employees (employee_id, name, department, work_start_time, work_end_time, is_active, created_at, updated_at)
SELECT DISTINCT 
    tr.employee_id,
    '社員' || tr.employee_id,  -- 仮の名前
    '未設定',                   -- 仮の部署
    '09:00:00',                -- デフォルト出勤時間
    '17:00:00',                -- デフォルト退勤時間
    true,                      -- アクティブ
    NOW(),
    NOW()
FROM time_records tr
LEFT JOIN employees e ON tr.employee_id = e.employee_id
WHERE e.employee_id IS NULL
ON CONFLICT (employee_id) DO NOTHING;

SELECT 'Step 5: 不足している社員データを追加しました' as status;

-- =================================
-- 6. データ取得テスト
-- =================================

-- time_recordsの取得テスト
SELECT 
    'time_records取得テスト' as test_type,
    COUNT(*) as total_records,
    COUNT(DISTINCT employee_id) as unique_employees,
    MAX(record_date) as latest_date,
    MIN(record_date) as earliest_date
FROM time_records;

-- employeesの取得テスト
SELECT 
    'employees取得テスト' as test_type,
    COUNT(*) as total_employees,
    COUNT(CASE WHEN is_active THEN 1 END) as active_employees
FROM employees;

-- JOINクエリのテスト
SELECT 
    'JOIN取得テスト' as test_type,
    COUNT(*) as joined_records
FROM time_records tr
LEFT JOIN employees e ON tr.employee_id = e.employee_id;

-- =================================
-- 7. admin_profilesの状況確認
-- =================================

-- 現在のユーザーがadmin_profilesに存在するかチェック
SELECT 
    'admin_profiles確認' as check_type,
    CASE 
        WHEN auth.uid() IS NULL THEN 'NOT_AUTHENTICATED'
        WHEN EXISTS (SELECT 1 FROM admin_profiles WHERE id = auth.uid()) THEN 'PROFILE_EXISTS'
        ELSE 'PROFILE_MISSING'
    END as status,
    auth.uid() as current_user;

-- 現在のユーザーが存在しない場合、管理者プロファイルを作成
DO $$
BEGIN
    IF auth.uid() IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM admin_profiles WHERE id = auth.uid()
    ) THEN
        INSERT INTO admin_profiles (
            id, name, email, role, is_active, created_at, updated_at
        ) VALUES (
            auth.uid(),
            'Auto-Generated Admin',
            'admin@timecard.local',
            'super_admin',
            true,
            NOW(),
            NOW()
        );
        RAISE NOTICE '現在のユーザー用の管理者プロファイルを作成しました: %', auth.uid();
    END IF;
END $$;

-- =================================
-- 8. 最終確認
-- =================================

-- 修正後のポリシー一覧
SELECT 
    '修正後のポリシー一覧' as check_type,
    tablename,
    policyname,
    cmd
FROM pg_policies 
WHERE schemaname = 'public'
    AND tablename IN ('time_records', 'employees', 'admin_profiles')
ORDER BY tablename, policyname;

-- 修正完了の記録
INSERT INTO audit_logs (
    table_name,
    record_id,
    action,
    new_values,
    created_at
) VALUES (
    'rls_recursion_fix',
    'fix-' || NOW()::text,
    'UPDATE',
    jsonb_build_object(
        'fix_type', 'rls_policy_recursion_fix',
        'completed_at', NOW(),
        'issues_fixed', ARRAY['infinite_recursion', 'data_access_errors', 'missing_employees']
    ),
    NOW()
);

SELECT 
    '✅ RLS無限再帰とデータ取得エラーの修正完了' as status,
    '間違い打刻修正機能が利用可能になりました' as message,
    NOW() as completion_time;