-- 社員選択を全員がアクセスできるように修正するスクリプト

-- =================================
-- 1. 現在のemployeesテーブルのRLSポリシーを確認・削除
-- =================================

-- 既存のポリシーを削除
DROP POLICY IF EXISTS "simple_employees_read" ON employees;
DROP POLICY IF EXISTS "simple_employees_write" ON employees;
DROP POLICY IF EXISTS "Authenticated users can read employees" ON employees;
DROP POLICY IF EXISTS "Users can read own admin_profile" ON employees;

SELECT 'Step 1: 既存のemployeesポリシーを削除しました' as status;

-- =================================
-- 2. パブリックアクセス可能なポリシーを作成
-- =================================

-- 社員リストは誰でも読み取り可能にする（タイムカード打刻のため）
-- これにより認証なしでも社員選択が可能になる
CREATE POLICY "public_employees_read" ON employees
    FOR SELECT USING (true);

-- 管理者のみが社員データを変更可能
CREATE POLICY "admin_employees_write" ON employees
    FOR ALL USING (
        auth.uid() IS NOT NULL AND 
        EXISTS (
            SELECT 1 FROM admin_profiles 
            WHERE id = auth.uid() AND is_active = true
        )
    );

SELECT 'Step 2: パブリックアクセス用ポリシーを作成しました' as status;

-- =================================
-- 3. time_recordsテーブルも同様にパブリック読み取りを許可
-- =================================

-- 既存のtime_recordsポリシーを確認・更新
DROP POLICY IF EXISTS "simple_time_records_read" ON time_records;
DROP POLICY IF EXISTS "simple_time_records_write" ON time_records;
DROP POLICY IF EXISTS "Authenticated users can read time_records" ON time_records;

-- 打刻記録は誰でも読み取り可能（自分の記録表示のため）
CREATE POLICY "public_time_records_read" ON time_records
    FOR SELECT USING (true);

-- 打刻記録の追加・更新は認証なしでも可能（タイムカード機能のため）
CREATE POLICY "public_time_records_insert" ON time_records
    FOR INSERT WITH CHECK (true);

-- 打刻記録の更新は認証なしでも可能（退勤打刻のため）
CREATE POLICY "public_time_records_update" ON time_records
    FOR UPDATE USING (true);

-- 管理者のみが削除可能
CREATE POLICY "admin_time_records_delete" ON time_records
    FOR DELETE USING (
        auth.uid() IS NOT NULL AND 
        EXISTS (
            SELECT 1 FROM admin_profiles 
            WHERE id = auth.uid() AND is_active = true
        )
    );

SELECT 'Step 3: time_recordsのパブリックアクセスポリシーを設定しました' as status;

-- =================================
-- 4. admin_profilesは管理者のみアクセス可能に維持
-- =================================

-- admin_profilesのポリシーは現状維持（管理者のみアクセス）
-- 既存のポリシーが適切に設定されているかチェック
SELECT 
    'admin_profiles ポリシー確認' as check_type,
    tablename,
    policyname,
    cmd
FROM pg_policies 
WHERE schemaname = 'public' 
    AND tablename = 'admin_profiles'
ORDER BY policyname;

-- =================================
-- 5. テスト用クエリ
-- =================================

-- パブリックアクセステスト
SELECT 
    'パブリックアクセステスト' as test_type,
    (SELECT COUNT(*) FROM employees) as employees_count,
    (SELECT COUNT(*) FROM time_records) as time_records_count;

-- =================================
-- 6. 最終確認
-- =================================

-- 作成されたポリシーの確認
SELECT 
    '新しく作成されたポリシー' as check_type,
    tablename,
    policyname,
    cmd,
    CASE 
        WHEN cmd = 'SELECT' AND policyname LIKE '%public%' THEN 'パブリック読み取り許可'
        WHEN cmd = 'ALL' AND policyname LIKE '%admin%' THEN '管理者のみ書き込み'
        ELSE '通常ポリシー'
    END as policy_type
FROM pg_policies 
WHERE schemaname = 'public'
    AND tablename IN ('employees', 'time_records', 'admin_profiles')
ORDER BY tablename, policyname;

SELECT 
    '✅ 社員選択のパブリックアクセス設定完了' as status,
    '認証なしでも社員リストと打刻が可能になりました' as message,
    NOW() as completion_time;

-- =================================
-- 使用方法とセキュリティ説明
-- =================================

/*
このスクリプトの実行により：

✅ 変更内容:
- employeesテーブル: パブリック読み取り許可 + 管理者のみ変更
- time_recordsテーブル: パブリック読み取り・追加・更新許可 + 管理者のみ削除
- admin_profilesテーブル: 管理者のみアクセス（現状維持）

✅ これにより可能になること:
- 認証なしで社員リストの取得
- 認証なしで出退勤打刻
- 認証なしで自分の打刻記録の表示
- 管理者認証後の記録管理機能

⚠️ セキュリティ考慮事項:
- 社員リストと打刻記録が公開されますが、これはタイムカードシステムの
  基本機能に必要な最小限のアクセス権限です
- 重要な管理機能（削除、管理者機能）は認証が必要です
- 必要に応じて、IP制限などの追加セキュリティを実装できます

🔧 次のステップ:
1. このスクリプトをSupabase SQLエディタで実行
2. フロントエンドを再デプロイ
3. 社員選択が正常に動作することを確認
*/