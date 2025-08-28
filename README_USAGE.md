# ミノルタイムカードシステム 使用ガイド

## システム概要
社内専用のタイムカード管理システムです。社員の出退勤管理、個別出勤時間設定、打刻記録のエクスポートなどの機能を提供します。

## 機能一覧

### 1. 打刻機能
- **出勤打刻**: 社員IDを入力して出勤時刻を記録
- **退勤打刻**: 社員IDを入力して退勤時刻を記録
- **自動ステータス判定**: 
  - 通常勤務
  - 遅刻（個別設定された出勤時間を過ぎた場合）
  - 早退（個別設定された退勤時間より早い場合）
  - 残業（個別設定された退勤時間を超えた場合）

### 2. 管理機能（管理者用）
- **社員管理**:
  - 社員の登録・編集・削除
  - 個別出勤時間の設定（デフォルト: 09:00〜18:00）
  - 部署設定
- **打刻記録管理**:
  - 全社員の打刻記録を一覧表示
  - 日付・社員IDでのフィルタリング
  - ステータス別の色分け表示

### 3. データエクスポート機能
- **Excel形式**: 打刻記録を.xlsx形式でダウンロード
- **CSV形式**: 打刻記録を.csv形式でダウンロード（日本語対応）
- **フィルタリング**: 期間・社員IDを指定してエクスポート可能

## システムの起動方法

### バックエンドサーバー（ポート3001）
```bash
cd backend
npm install
npm run dev  # 開発環境
# または
npm run build && npm start  # 本番環境
```

### フロントエンドサーバー（ポート3000）
```bash
npm install
npm start    # 開発環境
# または
npm run build  # 本番ビルド
```

## 使い方

### 社員として使用する場合
1. http://localhost:3000 にアクセス
2. 社員IDを入力
3. 「出勤」または「退勤」ボタンをクリック
4. 打刻完了メッセージが表示されます

### 管理者として使用する場合
1. http://localhost:3000/admin にアクセス
2. 管理者パスワードを入力（デフォルト: admin123）
3. 管理画面から以下の操作が可能:
   - 社員の追加・編集・削除
   - 打刻記録の閲覧
   - データのエクスポート

## API エンドポイント

### 社員管理
- `GET /api/employees` - 全社員リスト取得
- `POST /api/employees` - 社員追加
- `PUT /api/employees/:id` - 社員情報更新
- `DELETE /api/employees/:id` - 社員削除

### 打刻記録
- `POST /api/time-records/clock-in` - 出勤打刻
- `POST /api/time-records/clock-out` - 退勤打刻
- `GET /api/time-records` - 打刻記録取得
- `GET /api/time-records/export/excel` - Excel形式でエクスポート
- `GET /api/time-records/export/csv` - CSV形式でエクスポート

### 管理者認証
- `POST /api/admin/login` - 管理者ログイン

## データベース構造

### employeesテーブル
- employee_id: 社員ID（主キー）
- name: 氏名
- department: 部署
- start_time: 個別出勤時間（デフォルト: 09:00）
- end_time: 個別退勤時間（デフォルト: 18:00）
- created_at: 登録日時

### time_recordsテーブル
- id: レコードID（主キー）
- employee_id: 社員ID（外部キー）
- record_date: 日付
- clock_in_time: 出勤時刻
- clock_out_time: 退勤時刻
- status: ステータス（通常/遅刻/早退/残業）
- work_hours: 勤務時間
- created_at: 作成日時

## セキュリティ設定

### 管理者パスワードの変更
backend/src/middleware/auth.ts ファイル内の `ADMIN_PASSWORD` を変更してください:
```typescript
const ADMIN_PASSWORD = 'your-secure-password';
```

### CORS設定
backend/src/server.ts で許可するオリジンを設定できます:
```typescript
app.use(cors({
  origin: 'http://localhost:3000', // 本番環境では適切なドメインに変更
  credentials: true
}));
```

## トラブルシューティング

### ポート競合エラー
```bash
# ポート3000/3001が既に使用されている場合
# Windowsの場合
netstat -ano | findstr :3000
taskkill /PID <PID番号> /F

# Mac/Linuxの場合
lsof -i :3000
kill -9 <PID番号>
```

### データベースエラー
```bash
# データベースファイルを削除して再作成
cd backend
rm timecard.db
npm run dev  # 自動的に新しいDBが作成されます
```

### ビルドエラー
```bash
# node_modulesを削除して再インストール
rm -rf node_modules package-lock.json
npm install
```

## 本番環境への展開

### ビルド
```bash
# フロントエンド
npm run build
# buildフォルダが生成されます

# バックエンド
cd backend
npm run build
# distフォルダが生成されます
```

### 環境変数設定
本番環境では以下の環境変数を設定してください:
- `NODE_ENV=production`
- `PORT=3001` (バックエンド用)
- `DATABASE_URL` (SQLiteファイルのパス)

### デプロイ例（PM2使用）
```bash
# PM2のインストール
npm install -g pm2

# バックエンドの起動
cd backend
pm2 start dist/server.js --name timecard-backend

# フロントエンドは静的ファイルとしてNginxなどで配信
```

## サポート
問題が発生した場合は、以下を確認してください:
1. Node.jsのバージョン（推奨: v14以上）
2. npmのバージョン（推奨: v6以上）
3. ポート3000と3001が利用可能か
4. backend/timecard.db ファイルの書き込み権限