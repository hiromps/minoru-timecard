-- 緊急時対応SQLスクリプト
-- ⚠️ 警告：このスクリプトは緊急時のみ使用してください
-- 本番環境で実行する前に十分な検証を行ってください

-- =================================
-- 1. 管理者ロックアウト緊急解除
-- =================================

-- 現在のロック状況を確認
SELECT 
    '緊急解除前の状況確認' as status,
    email,
    name,
    failed_login_attempts,
    locked_until,
    CASE 
        WHEN locked_until > NOW() THEN 'ロック中'
        WHEN failed_login_attempts > 0 THEN '失敗記録あり'
        ELSE '正常'
    END as current_status
FROM admin_profiles 
ORDER BY failed_login_attempts DESC;

-- 🚨 緊急時：全管理者のロック解除
-- 注意：このコマンドは慎重に使用してください
/*
UPDATE admin_profiles 
SET 
    failed_login_attempts = 0,
    locked_until = NULL,
    is_active = true
WHERE role IN ('super_admin', 'admin');
*/

-- 解除後の確認
SELECT 
    '緊急解除後の確認' as status,
    email,
    name,
    role,
    failed_login_attempts,
    locked_until,
    is_active,
    '緊急解除済み' as action
FROM admin_profiles 
WHERE role IN ('super_admin', 'admin')
ORDER BY role, email;

-- =================================
-- 2. RLSポリシーの緊急無効化/有効化
-- =================================

-- 現在のRLS状況を確認
SELECT 
    'RLS状況確認' as status,
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE schemaname = 'public' 
  AND tablename IN ('employees', 'time_records', 'admin_profiles', 'audit_logs', 'user_sessions');

-- 🚨 緊急時：RLSポリシーの一時的無効化
-- 注意：セキュリティが無効になります。問題解決後は必ず再有効化してください
/*
ALTER TABLE employees DISABLE ROW LEVEL SECURITY;
ALTER TABLE time_records DISABLE ROW LEVEL SECURITY;  
ALTER TABLE admin_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions DISABLE ROW LEVEL SECURITY;
*/

-- 🔒 問題解決後：RLSポリシーの再有効化
-- 必ず問題解決後に実行してください
/*
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
*/

-- =================================
-- 3. 緊急時スーパー管理者作成
-- =================================

-- 🚨 緊急時：新しいスーパー管理者を作成
-- auth.usersにユーザーが存在することを前提とします
/*
INSERT INTO admin_profiles (id, name, email, role, is_active)
VALUES (
    'emergency-admin-uid',  -- 実際のauth.users.idに置き換え
    '緊急管理者',
    'emergency-admin@minoru-timecard.local',
    'super_admin',
    true
) ON CONFLICT (id) DO UPDATE SET
    role = 'super_admin',
    is_active = true,
    failed_login_attempts = 0,
    locked_until = NULL;
*/

-- =================================
-- 4. セッションの強制クリア
-- =================================

-- 全セッションの強制終了（緊急時のみ）
/*
UPDATE user_sessions SET is_active = false;
*/

-- セッションクリア後の確認
SELECT 
    'セッション状況確認' as status,
    COUNT(*) as total_sessions,
    COUNT(CASE WHEN is_active = true THEN 1 END) as active_sessions,
    COUNT(CASE WHEN expires_at < NOW() THEN 1 END) as expired_sessions
FROM user_sessions;

-- =================================
-- 5. 監査ログの緊急確認
-- =================================

-- 最近の重要な操作を確認
SELECT 
    '重要操作ログ' as log_type,
    table_name,
    action,
    user_id,
    ip_address,
    created_at,
    new_values::text as operation_details
FROM audit_logs 
WHERE 
    created_at > NOW() - INTERVAL '24 hours'
    AND action IN ('DELETE', 'UPDATE')
    AND table_name IN ('admin_profiles', 'employees')
ORDER BY created_at DESC
LIMIT 50;

-- 異常なアクセスパターンの検出
SELECT 
    '異常アクセス検出' as log_type,
    user_id,
    ip_address,
    COUNT(*) as operation_count,
    array_agg(DISTINCT action) as actions_performed,
    MIN(created_at) as first_operation,
    MAX(created_at) as last_operation
FROM audit_logs 
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY user_id, ip_address
HAVING COUNT(*) > 10
ORDER BY operation_count DESC;

-- =================================
-- 6. データ整合性の緊急修復
-- =================================

-- 重複レコードの確認と修正
SELECT 
    'データ整合性チェック' as check_type,
    employee_id,
    record_date,
    COUNT(*) as duplicate_count,
    array_agg(id) as record_ids
FROM time_records 
GROUP BY employee_id, record_date
HAVING COUNT(*) > 1;

-- 🔧 重複レコードの修正（最新のもの以外を削除）
-- 注意：実行前にデータのバックアップを取ってください
/*
WITH duplicates AS (
    SELECT 
        id,
        ROW_NUMBER() OVER (PARTITION BY employee_id, record_date ORDER BY created_at DESC) as rn
    FROM time_records
)
DELETE FROM time_records 
WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
);
*/

-- =================================
-- 7. 緊急時診断レポート
-- =================================

-- システム状態の総合診断
SELECT 
    '緊急診断レポート' as report_type,
    diagnostic_item,
    current_value,
    status,
    recommendation
FROM (
    -- 管理者アカウント状況
    SELECT 
        'アクティブ管理者数' as diagnostic_item,
        COUNT(*)::text as current_value,
        CASE WHEN COUNT(*) > 0 THEN 'OK' ELSE 'CRITICAL' END as status,
        CASE WHEN COUNT(*) = 0 THEN '緊急管理者を作成してください' ELSE 'OK' END as recommendation
    FROM admin_profiles WHERE is_active = true
    
    UNION ALL
    
    -- スーパー管理者状況
    SELECT 
        'アクティブスーパー管理者数' as diagnostic_item,
        COUNT(*)::text as current_value,
        CASE WHEN COUNT(*) > 0 THEN 'OK' ELSE 'CRITICAL' END as status,
        CASE WHEN COUNT(*) = 0 THEN '緊急スーパー管理者を作成してください' ELSE 'OK' END as recommendation
    FROM admin_profiles WHERE role = 'super_admin' AND is_active = true
    
    UNION ALL
    
    -- ロック状況
    SELECT 
        'ロック中アカウント数' as diagnostic_item,
        COUNT(*)::text as current_value,
        CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'WARNING' END as status,
        CASE WHEN COUNT(*) > 0 THEN 'ロック解除を検討してください' ELSE 'OK' END as recommendation
    FROM admin_profiles WHERE locked_until > NOW()
    
    UNION ALL
    
    -- セッション状況
    SELECT 
        'アクティブセッション数' as diagnostic_item,
        COUNT(*)::text as current_value,
        'INFO' as status,
        'セッション数を確認してください' as recommendation
    FROM user_sessions WHERE is_active = true AND expires_at > NOW()
) diagnostics;

-- =================================
-- 8. 緊急対応完了記録
-- =================================

-- 緊急対応の記録を監査ログに残す
INSERT INTO audit_logs (
    table_name, 
    record_id, 
    action, 
    new_values,
    ip_address,
    user_agent
) VALUES (
    'emergency_response',
    'system',
    'INSERT',
    jsonb_build_object(
        'action', 'emergency_recovery_script_executed',
        'timestamp', NOW(),
        'description', '緊急時対応スクリプトが実行されました'
    ),
    inet_client_addr(),
    'Emergency Recovery Script'
);

-- 完了メッセージ
SELECT 
    '緊急対応スクリプト実行完了' as status,
    '必要に応じて個別のコマンドのコメントアウトを解除して実行してください' as instruction,
    NOW() as execution_time;