# ミノルタイムカードシステム - セキュリティガイド

## 🔒 セキュリティ機能

このシステムは社内ネットワーク専用として設計されており、以下のセキュリティ機能を実装しています：

### 1. IP制限による社内ネットワーク限定アクセス

#### 設定方法
`backend/config/allowed-ips.json` ファイルで許可するIPアドレスを設定：

```json
{
  "allowedIPs": [
    "192.168.1.0/24",  // 社内ネットワークのIPレンジ
    "10.0.0.0/8",      // 社内VPNのIPレンジ
    "203.0.113.100"    // 固定IPアドレス（例：管理者PC）
  ]
}
```

#### CIDR記法の例
- `192.168.1.0/24` = 192.168.1.0 ～ 192.168.1.255
- `10.0.0.0/8` = 10.0.0.0 ～ 10.255.255.255
- `172.16.0.0/12` = 172.16.0.0 ～ 172.31.255.255

### 2. 管理者アクセスの追加制限

管理者ページ（/admin）には更に厳格なIP制限が適用されます。

環境変数で設定：
```env
ADMIN_ALLOWED_IPS=192.168.1.100,192.168.1.101
```

### 3. セッション管理とトークン認証

- **セッションタイムアウト**: 8時間後に自動的にログアウト
- **同一社員の複数端末制限**: 1つの社員IDにつき1セッションのみ
- **IPアドレス固定**: セッション作成時のIPアドレスと異なる場合は無効化

### 4. HTTPS通信（本番環境）

#### SSL証明書の設定
```env
HTTPS_ENABLED=true
SSL_KEY_PATH=/path/to/private-key.pem
SSL_CERT_PATH=/path/to/certificate.pem
```

#### 自己署名証明書の作成（テスト用）
```bash
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes
```

### 5. CORS制限

特定のドメインからのみアクセスを許可：
```env
CORS_ORIGIN=https://timecard.company.local
```

## 🚨 重要なセキュリティ設定

### 本番環境への展開前チェックリスト

1. **IP制限の確認**
   - [ ] 社内ネットワークのIPレンジを正しく設定
   - [ ] 外部IPからのアクセスがブロックされることを確認
   - [ ] VPN接続時のIPアドレスも許可リストに追加

2. **管理者パスワードの変更**
   ```typescript
   // backend/src/middleware/auth.ts
   const ADMIN_PASSWORD = 'strong-password-here'; // デフォルトから変更必須
   ```

3. **環境変数の設定**
   ```bash
   cp backend/.env.example backend/.env
   # .envファイルを編集して本番環境の値を設定
   ```

4. **データベースの保護**
   - [ ] データベースファイルのバックアップ設定
   - [ ] ファイルシステムレベルでのアクセス権限設定
   ```bash
   chmod 600 backend/timecard.db
   ```

5. **HTTPS証明書の設定**
   - [ ] 正規のSSL証明書を取得（Let's Encryptなど）
   - [ ] 証明書の自動更新設定

## 🛡️ ネットワーク構成例

### 推奨構成
```
[社内PC] → [ファイアウォール] → [リバースプロキシ(nginx)] → [タイムカードシステム]
   ↓                                    ↓
[社内Wi-Fi]                      [SSL証明書・IP制限]
```

### Nginx設定例
```nginx
server {
    listen 443 ssl;
    server_name timecard.company.local;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # IP制限
    allow 192.168.0.0/16;
    allow 10.0.0.0/8;
    deny all;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
    }

    location /api {
        proxy_pass http://localhost:3001;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
    }
}
```

## 🔍 セキュリティ監査

### ログの確認
システムは以下のアクセスログを記録します：
- IP制限によるアクセス拒否
- 管理者ログイン試行
- セッション作成・削除
- 不正なトークンアクセス

### 定期的な確認事項
1. **週次**
   - アクセスログの異常確認
   - 管理者アクセスの監査

2. **月次**
   - SSL証明書の有効期限確認
   - セキュリティアップデートの適用
   - バックアップの確認

3. **四半期**
   - IPアドレス許可リストの見直し
   - パスワードポリシーの確認
   - セキュリティ設定の総合レビュー

## ⚠️ 注意事項

1. **開発環境での使用**
   - 開発時は`DISABLE_IP_RESTRICTION=true`でIP制限を無効化可能
   - 本番環境では必ず`false`に設定

2. **バックアップ**
   - データベースファイル（`backend/timecard.db`）の定期バックアップ必須
   - 設定ファイルのバックアップも推奨

3. **アップデート**
   - Node.jsとnpmパッケージの定期的なアップデート
   - セキュリティ脆弱性の監視（`npm audit`）

## 📞 トラブルシューティング

### アクセスが拒否される場合
1. クライアントのIPアドレスを確認
2. `allowed-ips.json`に正しく設定されているか確認
3. ファイアウォールやプロキシの設定を確認

### セッションが切れる場合
1. セッションタイムアウト時間を確認（デフォルト8時間）
2. IPアドレスが変わっていないか確認
3. 同一社員IDで複数端末からログインしていないか確認

### SSL証明書エラー
1. 証明書の有効期限を確認
2. 証明書のパスが正しいか確認
3. 証明書の権限設定を確認

## 📚 参考資料

- [Express.jsセキュリティベストプラクティス](https://expressjs.com/en/advanced/best-practice-security.html)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.jsセキュリティチェックリスト](https://blog.risingstack.com/node-js-security-checklist/)