-- セキュリティメンテナンス用SQLスクリプト
-- 定期的に実行してシステムを清潔に保つ

-- =================================
-- 1. 期限切れセッションのクリーンアップ
-- =================================

-- 期限切れセッションの確認
SELECT 
    'クリーンアップ前確認' as status,
    COUNT(*) as expired_sessions_count
FROM user_sessions 
WHERE expires_at < NOW() AND is_active = true;

-- 期限切れセッションを無効化
UPDATE user_sessions 
SET is_active = false 
WHERE expires_at < NOW() AND is_active = true;

-- 30日以上古いセッションレコードを削除
DELETE FROM user_sessions 
WHERE expires_at < (NOW() - INTERVAL '30 days');

-- クリーンアップ後の確認
SELECT 
    'セッションクリーンアップ完了' as status,
    COUNT(*) as active_sessions_remaining
FROM user_sessions 
WHERE is_active = true;

-- =================================
-- 2. 古い監査ログの削除
-- =================================

-- 削除前の監査ログ数確認
SELECT 
    'ログ削除前確認' as status,
    COUNT(*) as total_audit_logs,
    COUNT(CASE WHEN created_at < NOW() - INTERVAL '6 months' THEN 1 END) as logs_to_delete
FROM audit_logs;

-- 6ヶ月以上前の監査ログを削除
-- 注意: 本番環境では保管期間を企業ポリシーに合わせて調整してください
DELETE FROM audit_logs 
WHERE created_at < NOW() - INTERVAL '6 months';

-- 削除後の確認
SELECT 
    '監査ログクリーンアップ完了' as status,
    COUNT(*) as remaining_audit_logs,
    MIN(created_at) as oldest_log,
    MAX(created_at) as newest_log
FROM audit_logs;

-- =================================
-- 3. ロック状態の自動リセット
-- =================================

-- 期限切れロックの確認
SELECT 
    'ロック解除前確認' as status,
    COUNT(*) as locked_accounts_count
FROM admin_profiles 
WHERE locked_until IS NOT NULL AND locked_until < NOW();

-- 期限切れのロックを解除
UPDATE admin_profiles 
SET 
    failed_login_attempts = 0,
    locked_until = NULL
WHERE locked_until IS NOT NULL AND locked_until < NOW();

-- ロック解除後の確認
SELECT 
    'ロック解除完了' as status,
    email,
    name,
    last_login,
    'ロック解除されました' as action
FROM admin_profiles 
WHERE failed_login_attempts = 0 AND locked_until IS NULL AND last_login < NOW() - INTERVAL '1 hour';

-- =================================
-- 4. データベース統計の更新
-- =================================

-- テーブル統計を更新（PostgreSQLの場合）
ANALYZE employees;
ANALYZE time_records;
ANALYZE admin_profiles;
ANALYZE audit_logs;
ANALYZE user_sessions;

-- =================================
-- 5. セキュリティ設定の確認
-- =================================

-- RLSが有効になっているかチェック
SELECT 
    'RLS確認' as check_type,
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE schemaname = 'public' 
  AND tablename IN ('employees', 'time_records', 'admin_profiles', 'audit_logs', 'user_sessions');

-- ポリシー数の確認
SELECT 
    'ポリシー確認' as check_type,
    schemaname,
    tablename,
    COUNT(*) as policy_count
FROM pg_policies 
WHERE schemaname = 'public'
GROUP BY schemaname, tablename
ORDER BY tablename;

-- =================================
-- 6. 非アクティブユーザーの確認
-- =================================

-- 90日以上ログインしていない管理者
SELECT 
    '非アクティブ管理者' as check_type,
    email,
    name,
    role,
    last_login,
    CASE 
        WHEN last_login IS NULL THEN '未ログイン'
        WHEN last_login < NOW() - INTERVAL '90 days' THEN '90日以上未ログイン'
        WHEN last_login < NOW() - INTERVAL '30 days' THEN '30日以上未ログイン'
        ELSE '正常'
    END as status,
    is_active
FROM admin_profiles 
WHERE 
    (last_login IS NULL OR last_login < NOW() - INTERVAL '30 days')
    AND is_active = true
ORDER BY last_login ASC NULLS FIRST;

-- =================================
-- 7. システムヘルスチェック
-- =================================

-- 基本的なヘルスチェック
SELECT 
    'システムヘルスチェック' as check_type,
    check_name,
    result,
    CASE WHEN result > 0 THEN 'OK' ELSE 'ERROR' END as status
FROM (
    SELECT 'アクティブ管理者数' as check_name, COUNT(*) as result
    FROM admin_profiles WHERE is_active = true
    
    UNION ALL
    
    SELECT 'スーパー管理者数' as check_name, COUNT(*) as result  
    FROM admin_profiles WHERE role = 'super_admin' AND is_active = true
    
    UNION ALL
    
    SELECT '今日の打刻記録数' as check_name, COUNT(*) as result
    FROM time_records WHERE record_date = CURRENT_DATE
    
    UNION ALL
    
    SELECT 'アクティブセッション数' as check_name, COUNT(*) as result
    FROM user_sessions WHERE is_active = true AND expires_at > NOW()
) health_checks;

-- =================================
-- 8. メンテナンス完了報告
-- =================================

SELECT 
    'メンテナンス完了' as status,
    'セキュリティメンテナンスが正常に完了しました' as message,
    NOW() as completion_time;

-- 次回メンテナンス推奨日（1週間後）
SELECT 
    '次回メンテナンス推奨日' as info,
    (NOW() + INTERVAL '7 days')::date as next_maintenance_date;