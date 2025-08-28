-- セキュリティ監視用SQLスクリプト
-- 定期的に実行してシステムの安全性を確認

-- =================================
-- 1. 監査ログの確認
-- =================================

-- 最近の操作履歴（過去24時間）
SELECT 
    '最近の操作履歴（24時間）' as report_type,
    table_name,
    action,
    user_id,
    ip_address,
    created_at
FROM audit_logs 
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC 
LIMIT 50;

-- 異常な操作パターンの検出
SELECT 
    '異常な操作パターン' as report_type,
    user_id,
    COUNT(*) as operation_count,
    array_agg(DISTINCT action) as actions,
    array_agg(DISTINCT table_name) as tables_accessed,
    MIN(created_at) as first_operation,
    MAX(created_at) as last_operation
FROM audit_logs 
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY user_id
HAVING COUNT(*) > 20  -- 1時間に20回以上の操作
ORDER BY operation_count DESC;

-- =================================
-- 2. 失敗ログイン監視
-- =================================

-- ロックされたアカウント
SELECT 
    'ロックされたアカウント' as report_type,
    email,
    name,
    failed_login_attempts,
    locked_until,
    CASE 
        WHEN locked_until > NOW() THEN '現在ロック中'
        ELSE 'ロック解除済み'
    END as lock_status,
    last_login
FROM admin_profiles 
WHERE failed_login_attempts > 0
ORDER BY failed_login_attempts DESC;

-- 失敗試行が多いアカウント
SELECT 
    '要注意アカウント' as report_type,
    email,
    name,
    failed_login_attempts,
    locked_until,
    last_login,
    CASE 
        WHEN failed_login_attempts >= 3 THEN '高リスク'
        WHEN failed_login_attempts >= 1 THEN '中リスク'
        ELSE '正常'
    END as risk_level
FROM admin_profiles 
WHERE failed_login_attempts > 0 OR last_login IS NULL
ORDER BY failed_login_attempts DESC;

-- =================================
-- 3. アクティブセッション監視
-- =================================

-- 現在アクティブなセッション
SELECT 
    'アクティブセッション' as report_type,
    us.user_id,
    ap.email,
    ap.name,
    us.ip_address,
    us.user_agent,
    us.created_at as session_start,
    us.last_activity,
    us.expires_at,
    CASE 
        WHEN us.expires_at < NOW() THEN '期限切れ'
        ELSE '有効'
    END as session_status
FROM user_sessions us
LEFT JOIN admin_profiles ap ON us.user_id = ap.id
WHERE us.is_active = true
ORDER BY us.last_activity DESC;

-- 複数セッションを持つユーザー
SELECT 
    '複数セッションユーザー' as report_type,
    user_id,
    ap.email,
    ap.name,
    COUNT(*) as active_sessions,
    array_agg(DISTINCT ip_address) as ip_addresses,
    MAX(last_activity) as latest_activity
FROM user_sessions us
LEFT JOIN admin_profiles ap ON us.user_id = ap.id
WHERE is_active = true AND expires_at > NOW()
GROUP BY user_id, ap.email, ap.name
HAVING COUNT(*) > 1
ORDER BY active_sessions DESC;

-- =================================
-- 4. データ整合性チェック
-- =================================

-- 重複した打刻記録（制約違反の可能性）
SELECT 
    'データ整合性：重複打刻' as report_type,
    employee_id,
    record_date,
    COUNT(*) as duplicate_count
FROM time_records 
GROUP BY employee_id, record_date
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- 異常な勤務時間
SELECT 
    'データ整合性：異常勤務時間' as report_type,
    employee_id,
    record_date,
    work_hours,
    clock_in_time,
    clock_out_time,
    status
FROM time_records 
WHERE 
    work_hours > 16  -- 16時間以上
    OR work_hours < 0  -- マイナス時間
    OR (clock_out_time IS NOT NULL AND clock_in_time IS NOT NULL AND clock_out_time < clock_in_time)
ORDER BY record_date DESC;

-- =================================
-- 5. システム統計
-- =================================

-- 全体統計
SELECT 
    'システム統計' as report_type,
    'アクティブ管理者数' as metric,
    COUNT(*) as value
FROM admin_profiles 
WHERE is_active = true AND (locked_until IS NULL OR locked_until < NOW())

UNION ALL

SELECT 
    'システム統計' as report_type,
    'アクティブセッション数' as metric,
    COUNT(*) as value
FROM user_sessions 
WHERE is_active = true AND expires_at > NOW()

UNION ALL

SELECT 
    'システム統計' as report_type,
    '今日の打刻記録数' as metric,
    COUNT(*) as value
FROM time_records 
WHERE record_date = CURRENT_DATE

UNION ALL

SELECT 
    'システム統計' as report_type,
    '過去24時間の監査ログ数' as metric,
    COUNT(*) as value
FROM audit_logs 
WHERE created_at > NOW() - INTERVAL '24 hours';

-- =================================
-- 6. パフォーマンス指標
-- =================================

-- データベースサイズ（概算）
SELECT 
    'パフォーマンス指標' as report_type,
    'テーブルサイズ' as metric,
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- 完了メッセージ
SELECT 
    'セキュリティ監視レポート完了' as status,
    NOW() as report_generated_at;