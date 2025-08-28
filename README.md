# ミノルタイムカードシステム

個別出勤時間設定に対応したタイムカード管理システムです。

## 主な機能

- **打刻機能**: 出勤・退勤の打刻
- **ステータス自動判定**: 遅刻、早退、残業、通常の自動判定
- **社員管理**: 社員の追加、編集、削除、個別出勤時間設定
- **打刻記録管理**: 打刻履歴の表示とフィルタリング
- **Excel出力**: CSV形式でのデータエクスポート

## 技術スタック

### フロントエンド
- React 18
- TypeScript
- CSS3 (レスポンシブデザイン対応)

### バックエンド
- Node.js
- Express.js
- SQLite3
- TypeScript

## セットアップ

### 1. 依存関係のインストール

```bash
# フロントエンド
npm install

# バックエンド
cd backend
npm install
```

### 2. 開発サーバーの起動

```bash
# バックエンドサーバー起動 (ポート3001)
cd backend
npm run dev

# フロントエンドサーバー起動 (ポート3000)
npm start
```

### 3. アクセス

- フロントエンド: http://localhost:3000
- バックエンドAPI: http://localhost:3001

## 🔒 セキュリティ機能（強化版）

### 権限ベースアクセス制御（RBAC）
- **Super Admin**: 全ての操作（削除も含む）
- **Admin**: データ管理（削除制限あり）
- **Viewer**: 閲覧のみ

### アカウント保護
- **失敗ログイン保護**: 5回失敗で1時間自動ロック
- **セッション管理**: 8時間で自動期限切れ
- **監査ログ**: 全操作の自動記録

### データ整合性
- 1日1人1打刻制限
- 時間妥当性チェック
- 勤務時間範囲制限

### IP制限（オプション）
- `backend/config/allowed-ips.json`で許可IPを設定

## 📋 セキュリティ導入ガイド

詳細な導入手順は以下のドキュメントを参照：
- `ENHANCED_SECURITY_GUIDE.md` - セキュリティ強化ガイド
- `SECURITY_DEPLOYMENT_CHECKLIST.md` - 導入チェックリスト
- `supabase-enhanced-security.sql` - セキュリティ強化SQLスキーマ

## データベース

SQLiteデータベースファイル (`timecard.db`) は `backend` ディレクトリに自動作成されます。
Supabase使用時は`supabase-enhanced-security.sql`でセキュリティ強化されたスキーマを適用してください。

### テーブル構造

#### employees テーブル
- id: 主キー
- employee_id: 社員ID
- name: 氏名
- department: 部署
- work_start_time: 出勤時間
- work_end_time: 退勤時間
- created_at: 作成日時
- updated_at: 更新日時

#### time_records テーブル
- id: 主キー
- employee_id: 社員ID
- record_date: 記録日
- clock_in_time: 出勤時刻
- clock_out_time: 退勤時刻
- status: ステータス（通常、遅刻、早退、残業）
- created_at: 作成日時
- updated_at: 更新日時

## ステータス判定ロジック

- **通常**: 午前9時以内の出勤、または個別設定時間内の出勤
- **遅刻**: 個別設定出勤時間を過ぎた出勤
- **早退**: 17時前の退勤
- **残業**: 8時間を超える勤務

## API エンドポイント

### 社員管理
- GET `/api/employees` - 全社員取得
- POST `/api/employees` - 社員追加
- PUT `/api/employees/:id` - 社員更新
- DELETE `/api/employees/:id` - 社員削除

### 打刻記録
- POST `/api/time-records/clock-in` - 出勤打刻
- POST `/api/time-records/clock-out` - 退勤打刻
- GET `/api/time-records` - 打刻記録取得
- GET `/api/time-records/export` - CSV出力用データ取得

## ライセンス

MIT License
