-- データバックアップ用SQLスクリプト
-- セキュリティ強化導入前に既存データをバックアップ

-- 1. 社員データのバックアップ
SELECT 'employees_backup' as table_name;
SELECT * FROM employees ORDER BY id;

-- 2. 打刻記録のバックアップ
SELECT 'time_records_backup' as table_name;
SELECT * FROM time_records ORDER BY created_at DESC;

-- 3. 管理者プロファイルのバックアップ
SELECT 'admin_profiles_backup' as table_name;
SELECT * FROM admin_profiles ORDER BY created_at;

-- バックアップ完了確認
SELECT 
    'データバックアップ完了' as message,
    NOW() as backup_timestamp;

-- 既存データ統計
SELECT 
    'employees' as table_name,
    COUNT(*) as record_count
FROM employees
UNION ALL
SELECT 
    'time_records' as table_name,
    COUNT(*) as record_count  
FROM time_records
UNION ALL
SELECT 
    'admin_profiles' as table_name,
    COUNT(*) as record_count
FROM admin_profiles;