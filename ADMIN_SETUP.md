# 管理者アカウント設定ガイド

## セキュリティ更新について

セキュリティ強化のため、デフォルト管理者アカウントの自動作成を無効化しました。
管理者アカウントは手動で作成する必要があります。

## 管理者アカウントの作成方法

### 方法1: 作成スクリプトを使用（推奨）

```bash
# プロジェクトルートディレクトリで実行
node create-admin-user.js
```

対話式でアカウント情報を入力してください：
- ユーザー名
- パスワード（8文字以上推奨）
- 表示名

### 方法2: SQLite直接操作

```sql
-- パスワードハッシュを生成（Node.jsで）
const bcrypt = require('bcrypt');
const hash = bcrypt.hashSync('your-secure-password', 12);

-- SQLiteで実行
INSERT INTO admins (username, password_hash, name) 
VALUES ('your-username', 'generated-hash', 'Display Name');
```

## セキュリティベストプラクティス

### 推奨パスワード要件
- 最低8文字以上
- 大文字・小文字・数字・記号を含む
- 辞書に載っていない文字列
- 他のサービスと同じパスワードは使用しない

### 推奨ユーザー名
- 推測しにくい名前
- 'admin', 'administrator', 'root' などの一般的な名前は避ける
- 個人名や会社名の直接使用は避ける

## トラブルシューティング

### データベースファイルが見つからない場合
```bash
# バックエンドサーバーを一度起動してデータベースを初期化
cd backend
npm run dev
```

### 既存アカウントのパスワード変更
```sql
-- 新しいハッシュを生成してから
UPDATE admins 
SET password_hash = 'new-hash' 
WHERE username = 'existing-username';
```

## セキュリティ注意事項

⚠️ **重要**: 
- 作成したアカウント情報は安全に保管してください
- パスワードをプレーンテキストで保存しないでください  
- 定期的にパスワードを変更することを推奨します
- 不要になったアカウントは削除してください