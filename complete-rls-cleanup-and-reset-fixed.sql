-- 完全なRLSポリシークリーンアップと再設定（型キャスト修正版）

-- =================================
-- 1. 既存ポリシーの完全削除
-- =================================

-- 動的に全ポリシーを削除する関数
DO $$
DECLARE
    policy_record RECORD;
BEGIN
    -- admin_profilesテーブルのすべてのポリシーを削除
    FOR policy_record IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'admin_profiles'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON admin_profiles', policy_record.policyname);
        RAISE NOTICE 'admin_profiles ポリシー削除: %', policy_record.policyname;
    END LOOP;
    
    -- time_recordsテーブルのすべてのポリシーを削除
    FOR policy_record IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'time_records'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON time_records', policy_record.policyname);
        RAISE NOTICE 'time_records ポリシー削除: %', policy_record.policyname;
    END LOOP;
    
    -- employeesテーブルのすべてのポリシーを削除
    FOR policy_record IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'employees'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON employees', policy_record.policyname);
        RAISE NOTICE 'employees ポリシー削除: %', policy_record.policyname;
    END LOOP;
    
    -- audit_logsテーブルのすべてのポリシーを削除
    FOR policy_record IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'audit_logs'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON audit_logs', policy_record.policyname);
        RAISE NOTICE 'audit_logs ポリシー削除: %', policy_record.policyname;
    END LOOP;
    
    -- user_sessionsテーブルのすべてのポリシーを削除（存在する場合）
    FOR policy_record IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'user_sessions'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON user_sessions', policy_record.policyname);
        RAISE NOTICE 'user_sessions ポリシー削除: %', policy_record.policyname;
    END LOOP;
END $$;

-- 削除確認
SELECT 
    'ポリシー削除確認' as check_type,
    COALESCE(tablename, '削除済み') as table_name,
    COUNT(*) as remaining_policies
FROM pg_policies 
WHERE schemaname = 'public' 
    AND tablename IN ('admin_profiles', 'time_records', 'employees', 'audit_logs', 'user_sessions')
GROUP BY tablename
ORDER BY tablename;

SELECT 'すべてのポリシーを削除しました' as status;

-- =================================
-- 2. 一時的にRLSを無効化（データ確認のため）
-- =================================

ALTER TABLE admin_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE time_records DISABLE ROW LEVEL SECURITY;
ALTER TABLE employees DISABLE ROW LEVEL SECURITY;

-- audit_logsテーブルが存在する場合のみ無効化
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'audit_logs' AND table_schema = 'public') THEN
        ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;
        RAISE NOTICE 'audit_logs RLSを無効化しました';
    END IF;
END $$;

SELECT 'RLSを一時的に無効化しました' as status;

-- =================================
-- 3. テーブル構造の確認
-- =================================

-- employeesテーブルの構造確認
SELECT 
    'employeesテーブル構造確認' as check_type,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'employees' 
    AND table_schema = 'public'
ORDER BY ordinal_position;

-- =================================
-- 4. データ整合性の確認と修正
-- =================================

-- 現在のユーザーの管理者プロファイルを確認・作成
DO $$
BEGIN
    IF auth.uid() IS NOT NULL THEN
        -- 管理者プロファイルが存在しない場合は作成
        INSERT INTO admin_profiles (
            id, name, email, role, is_active, created_at, updated_at
        ) 
        SELECT 
            auth.uid(),
            'System Administrator',
            'admin@timecard.system',
            'super_admin',
            true,
            NOW(),
            NOW()
        WHERE NOT EXISTS (
            SELECT 1 FROM admin_profiles WHERE id = auth.uid()
        );
        
        IF FOUND THEN
            RAISE NOTICE '管理者プロファイルを作成しました: %', auth.uid();
        ELSE
            RAISE NOTICE '管理者プロファイルは既に存在します: %', auth.uid();
        END IF;
    ELSE
        RAISE NOTICE '認証されていないため、管理者プロファイルを作成できません';
    END IF;
END $$;

-- 不足している社員データを補完（型キャスト修正版）
INSERT INTO employees (
    employee_id, 
    name, 
    department, 
    work_start_time, 
    work_end_time, 
    is_active, 
    created_at, 
    updated_at
)
SELECT DISTINCT 
    tr.employee_id,
    'Employee ' || tr.employee_id,
    'Default Department',
    TIME '09:00:00',  -- TIME型に明示的キャスト
    TIME '17:00:00',  -- TIME型に明示的キャスト
    true,
    NOW(),
    NOW()
FROM time_records tr
WHERE NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.employee_id = tr.employee_id
)
ON CONFLICT (employee_id) DO NOTHING;

SELECT '不足している社員データを補完しました' as status;

-- =================================
-- 5. 簡素化されたRLSポリシーを作成
-- =================================

-- RLSを再有効化
ALTER TABLE admin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- audit_logsテーブルが存在する場合のみ有効化
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'audit_logs' AND table_schema = 'public') THEN
        ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
        RAISE NOTICE 'audit_logs RLSを有効化しました';
    END IF;
END $$;

-- === admin_profiles: 最小限のポリシー ===
CREATE POLICY "simple_admin_read" ON admin_profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "simple_admin_update" ON admin_profiles
    FOR UPDATE USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "simple_admin_insert" ON admin_profiles
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- === employees: 認証済みユーザー全員がアクセス可能 ===
CREATE POLICY "simple_employees_read" ON employees
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "simple_employees_write" ON employees
    FOR ALL USING (auth.uid() IS NOT NULL);

-- === time_records: 認証済みユーザー全員がアクセス可能 ===
CREATE POLICY "simple_time_records_read" ON time_records
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "simple_time_records_write" ON time_records
    FOR ALL USING (auth.uid() IS NOT NULL);

-- === audit_logs: 存在する場合のみポリシー作成 ===
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'audit_logs' AND table_schema = 'public') THEN
        EXECUTE 'CREATE POLICY "simple_audit_logs_read" ON audit_logs FOR SELECT USING (auth.uid() IS NOT NULL)';
        EXECUTE 'CREATE POLICY "simple_audit_logs_insert" ON audit_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL)';
        RAISE NOTICE 'audit_logs用ポリシーを作成しました';
    END IF;
END $$;

SELECT 'シンプルなRLSポリシーを作成しました' as status;

-- =================================
-- 6. データアクセステスト
-- =================================

-- 各テーブルへのアクセステスト
SELECT 
    'データアクセステスト結果' as test_type,
    (SELECT COUNT(*) FROM admin_profiles) as admin_profiles_count,
    (SELECT COUNT(*) FROM employees) as employees_count,
    (SELECT COUNT(*) FROM time_records) as time_records_count,
    (SELECT CASE WHEN EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'audit_logs') 
          THEN (SELECT COUNT(*) FROM audit_logs)::text 
          ELSE 'Table not exists' END) as audit_logs_status;

-- JOIN テストでエラーが発生しないか確認
SELECT 
    'JOINテスト' as test_type,
    COUNT(*) as joined_records
FROM time_records tr
LEFT JOIN employees e ON tr.employee_id = e.employee_id
LIMIT 1;

-- =================================
-- 7. 管理者権限確認
-- =================================

-- 現在のユーザーの管理者権限確認
SELECT 
    'Current User Admin Check' as check_type,
    auth.uid() as user_id,
    CASE 
        WHEN auth.uid() IS NULL THEN 'NOT_AUTHENTICATED'
        WHEN EXISTS (SELECT 1 FROM admin_profiles WHERE id = auth.uid()) THEN 'ADMIN_PROFILE_EXISTS'
        ELSE 'NO_ADMIN_PROFILE'
    END as admin_status;

-- 管理者プロファイルの詳細
SELECT 
    'Admin Profile Details' as info_type,
    name,
    email,
    role,
    is_active
FROM admin_profiles
WHERE id = auth.uid();

-- =================================
-- 8. audit_logsテーブルの作成（存在しない場合）
-- =================================

-- audit_logsテーブルが存在しない場合は作成
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'audit_logs' AND table_schema = 'public') THEN
        CREATE TABLE audit_logs (
            id BIGSERIAL PRIMARY KEY,
            table_name TEXT NOT NULL,
            record_id TEXT NOT NULL,
            action TEXT NOT NULL,
            old_values JSONB,
            new_values JSONB,
            reason TEXT,
            user_id UUID,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        
        -- RLSを有効化
        ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
        
        -- ポリシーを作成
        CREATE POLICY "simple_audit_logs_read" ON audit_logs FOR SELECT USING (auth.uid() IS NOT NULL);
        CREATE POLICY "simple_audit_logs_insert" ON audit_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
        
        RAISE NOTICE 'audit_logsテーブルを作成しました';
    ELSE
        RAISE NOTICE 'audit_logsテーブルは既に存在します';
    END IF;
END $$;

-- =================================
-- 9. 完了記録
-- =================================

-- 完了ログの記録
INSERT INTO audit_logs (
    table_name,
    record_id,
    action,
    new_values,
    created_at
) VALUES (
    'complete_rls_cleanup',
    'cleanup-' || NOW()::text,
    'UPDATE',
    jsonb_build_object(
        'action', 'complete_rls_policy_reset_fixed',
        'policies_removed', 'all_existing',
        'policies_created', 'simplified_set',
        'type_casting_fixed', true,
        'completed_at', NOW()
    ),
    NOW()
);

-- =================================
-- 10. 最終確認
-- =================================

-- 作成されたポリシーの確認
SELECT 
    '新しく作成されたポリシー' as check_type,
    tablename,
    policyname,
    cmd,
    permissive
FROM pg_policies 
WHERE schemaname = 'public'
    AND tablename IN ('admin_profiles', 'time_records', 'employees', 'audit_logs')
ORDER BY tablename, policyname;

-- データ型の確認
SELECT 
    'employeesテーブル時間列確認' as check_type,
    column_name,
    data_type
FROM information_schema.columns 
WHERE table_name = 'employees' 
    AND column_name IN ('work_start_time', 'work_end_time')
    AND table_schema = 'public';

SELECT 
    '✅ 完全なRLSクリーンアップと再設定完了（型修正版）' as status,
    '間違い打刻修正機能の準備が完了しました' as message,
    NOW() as completion_time;

-- =================================
-- 使用方法とトラブルシューティング
-- =================================

/*
このスクリプトの実行により：

✅ 修正された問題:
- RLSポリシーの重複エラー
- 無限再帰エラー  
- データアクセスエラー
- TIME型とTEXT型のミスマッチエラー
- admin_profiles の不整合

✅ 新しい状態:
- シンプルで安全なRLSポリシー
- 認証済みユーザーによる完全なデータアクセス
- 管理者プロファイルの自動作成
- 不足社員データの自動補完（適切な型キャスト付き）
- audit_logsテーブルの自動作成

⚠️ セキュリティについて:
現在のポリシーは機能性を重視したシンプルな設定です。
より厳密なセキュリティが必要な場合は、
後で段階的に制限を追加できます。

🔧 次のステップ:
1. フロントエンドを再起動
2. 打刻記録管理画面にアクセス
3. データが正常に表示されることを確認
4. 修正機能をテスト
*/