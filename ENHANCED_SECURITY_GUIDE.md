# タイムカードシステム セキュリティ強化ガイド

## 概要

このガイドでは、Supabaseのタイムカードシステムのセキュリティを大幅に強化するRLSポリシーと追加機能について説明します。

## 🔒 セキュリティ強化項目

### 1. 権限ベースアクセス制御（RBAC）

#### 管理者権限レベル
- **Super Admin**: 全ての操作が可能
- **Admin**: 社員管理、打刻データ管理が可能（削除は一部制限）  
- **Viewer**: データの閲覧のみ可能

#### 実装されたポリシー
```sql
-- 例：社員データ削除はスーパー管理者のみ
CREATE POLICY "Only super admins can delete employees" ON employees
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM admin_profiles 
                WHERE id = auth.uid() AND role = 'super_admin')
    );
```

### 2. IP制限とセッション管理

#### 新しいテーブル
- `user_sessions`: アクティブなセッションを管理
- `audit_logs`: 全ての操作を記録

#### セキュリティ機能
- IP アドレス記録
- User-Agent 記録
- セッションの自動期限切れ
- 不正アクセスの検出

### 3. 失敗ログイン保護

#### アカウントロック機能
- 5回の失敗で1時間アカウントロック
- 失敗回数のカウンター
- ロック状態の自動解除

```sql
CREATE OR REPLACE FUNCTION handle_failed_login(user_email TEXT)
RETURNS void AS $$
DECLARE
    user_record admin_profiles%ROWTYPE;
BEGIN
    UPDATE admin_profiles 
    SET 
        failed_login_attempts = failed_login_attempts + 1,
        locked_until = CASE 
            WHEN failed_login_attempts >= 5 THEN NOW() + INTERVAL '1 hour'
            ELSE locked_until
        END
    WHERE email = user_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 4. 監査ログ

#### 記録される情報
- テーブル名
- 操作タイプ（INSERT, UPDATE, DELETE, SELECT）
- 変更前後の値
- 実行ユーザー
- IP アドレス
- タイムスタンプ

#### 自動記録
全ての重要テーブルで自動的に監査ログが記録されます。

### 5. データ整合性制約

#### 追加された制約
```sql
-- 1日1人1レコード制約
UNIQUE(employee_id, record_date)

-- 時間の妥当性チェック
CHECK (clock_out_time > clock_in_time)

-- 勤務時間の範囲チェック
CHECK (work_hours >= 0 AND work_hours <= 24)
```

## 🚀 導入手順

### ステップ1: データバックアップ
```sql
-- 既存データのバックアップ
SELECT * FROM employees;
SELECT * FROM time_records;
SELECT * FROM admin_profiles;
```

### ステップ2: 新しいスキーマ適用
1. SupabaseのSQL Editorを開く
2. `supabase-enhanced-security.sql` の内容をコピー&ペースト  
3. 実行ボタンをクリック

### ステップ3: スーパー管理者設定
1. Supabase Auth でユーザーを作成
2. そのユーザーのUIDを確認
3. 手動でadmin_profilesに挿入：

```sql
INSERT INTO admin_profiles (id, name, email, role, is_active)
VALUES (
    'あなたのauth-uid-ここ',
    'システム管理者',
    'admin@yourdomain.com',
    'super_admin',
    true
);
```

### ステップ4: アプリケーション側の対応

#### 新しい環境変数（必要に応じて）
```env
# IP制限設定
REACT_APP_ALLOWED_IPS=192.168.1.0/24,10.0.0.0/8
REACT_APP_MAX_LOGIN_ATTEMPTS=5
REACT_APP_LOCKOUT_DURATION=3600
```

## 📊 セキュリティ監視

### 監査ログの確認
```sql
-- 最近の操作履歴
SELECT 
    table_name,
    action,
    user_id,
    ip_address,
    created_at
FROM audit_logs 
ORDER BY created_at DESC 
LIMIT 100;

-- 失敗ログインの監視
SELECT 
    email,
    failed_login_attempts,
    locked_until,
    last_login
FROM admin_profiles 
WHERE failed_login_attempts > 0;
```

### アクティブセッション確認
```sql
-- アクティブなセッション
SELECT 
    user_id,
    ip_address,
    user_agent,
    created_at,
    last_activity
FROM user_sessions 
WHERE is_active = true;
```

## ⚠️ 注意事項

### 1. 既存データの影響
- 新しいポリシーは既存データにも適用されます
- 管理者権限がない既存ユーザーはアクセスできなくなります

### 2. アプリケーション側の修正が必要
- 認証フローの更新
- エラーハンドリングの強化
- 権限チェック機能の追加

### 3. パフォーマンスへの影響
- RLSポリシーによりクエリが複雑になります
- インデックスを適切に設定済みですが、大量データでは要注意

## 🔧 メンテナンス

### 定期的な実行推奨
```sql
-- 期限切れセッションのクリーンアップ
SELECT cleanup_expired_sessions();

-- 古い監査ログの削除（6ヶ月以上前）
DELETE FROM audit_logs 
WHERE created_at < NOW() - INTERVAL '6 months';

-- ロック状態の確認とリセット
UPDATE admin_profiles 
SET 
    failed_login_attempts = 0,
    locked_until = NULL
WHERE locked_until < NOW();
```

## 📈 パフォーマンス最適化

### 追加されたインデックス
```sql
CREATE INDEX idx_time_records_ip ON time_records(ip_address);
CREATE INDEX idx_employees_active ON employees(is_active);
CREATE INDEX idx_audit_logs_table_action ON audit_logs(table_name, action);
CREATE INDEX idx_sessions_user_active ON user_sessions(user_id, is_active);
```

## 🚨 緊急時の対応

### 管理者がロックアウトされた場合
```sql
-- 緊急時：全ての管理者のロックを解除
UPDATE admin_profiles 
SET 
    failed_login_attempts = 0,
    locked_until = NULL,
    is_active = true;
```

### RLSポリシーを一時的に無効化
```sql
-- 緊急時のみ使用
ALTER TABLE employees DISABLE ROW LEVEL SECURITY;
-- 問題解決後は必ず有効化
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
```

## 📋 チェックリスト

導入前に確認すべき項目：

- [ ] 現在のデータをバックアップ済み
- [ ] スーパー管理者アカウントの準備完了
- [ ] アプリケーション側のコード修正計画策定
- [ ] テスト環境での動作確認完了
- [ ] 監視・メンテナンス体制の確立

---

このセキュリティ強化により、タイムカードシステムの安全性が大幅に向上します。導入時は十分なテストを行い、段階的に適用することをお勧めします。