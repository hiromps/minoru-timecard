-- スーパー管理者セットアップスクリプト
-- このスクリプトを実行する前に、Supabase AuthでユーザーIDを確認してください

-- 1. 現在のauth.usersからUIDを取得（参考用）
-- ⚠️ 注意：実際のUIDを確認してから以下を実行してください
SELECT 
    'auth_users_check' as info,
    id as user_id,
    email,
    created_at
FROM auth.users 
ORDER BY created_at DESC 
LIMIT 5;

-- 2. スーパー管理者を追加
-- ⚠️ 重要：'your-actual-auth-uid-here'を実際のUIDに置き換えてください
/*
INSERT INTO admin_profiles (id, name, email, role, is_active)
VALUES (
    'your-actual-auth-uid-here',  -- ← ここを実際のauth.users.idに置き換え
    'システム管理者',
    'admin@minoru-timecard.local',
    'super_admin',
    true
);
*/

-- 3. 管理者追加後の確認
SELECT 
    'admin_profiles_check' as info,
    id,
    name,
    email,
    role,
    is_active,
    failed_login_attempts,
    locked_until,
    created_at
FROM admin_profiles
ORDER BY created_at DESC;

-- 4. 権限テスト用の追加管理者（オプション）
/*
-- 一般管理者の例
INSERT INTO admin_profiles (id, name, email, role, is_active)
VALUES (
    'another-auth-uid-here',  -- 別のユーザーID
    '一般管理者',
    'manager@minoru-timecard.local',
    'admin',
    true
);

-- 閲覧者の例
INSERT INTO admin_profiles (id, name, email, role, is_active)
VALUES (
    'viewer-auth-uid-here',  -- 別のユーザーID
    '閲覧担当者',
    'viewer@minoru-timecard.local',
    'viewer',
    true
);
*/

-- 完了確認
SELECT 
    'setup_complete' as status,
    'スーパー管理者セットアップ完了' as message,
    NOW() as timestamp;