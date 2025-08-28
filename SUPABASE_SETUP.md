# Supabase設定ガイド

## 1. Supabaseアカウント作成とプロジェクト作成

### ステップ1: Supabaseアカウント作成
1. https://supabase.com にアクセス
2. 「Start your project」をクリック
3. GitHubアカウントでサインアップ（推奨）

### ステップ2: 新しいプロジェクト作成
1. 「New Project」をクリック
2. プロジェクト情報を入力：
   - **Name**: `minoru-timecard`
   - **Database Password**: 強力なパスワードを生成（保存しておく）
   - **Region**: `Northeast Asia (Tokyo)` （推奨）
3. 「Create new project」をクリック
4. プロジェクト作成完了まで1-2分待機

## 2. データベース設定

### ステップ3: SQL Editorでスキーマ作成
1. 左メニューから「SQL Editor」を選択
2. 「New query」をクリック
3. `supabase-schema.sql` ファイルの内容をすべてコピー＆ペースト
4. 「Run」ボタンをクリック
5. 成功メッセージが表示されることを確認

## 3. 環境変数設定

### ステップ4: Supabase接続情報取得
1. 左メニューから「Settings」→ 「API」を選択
2. 以下の値をコピー：
   - **Project URL** (例: `https://abcdefgh.supabase.co`)
   - **anon public** key （長い文字列）

### ステップ5: 環境変数ファイル作成
1. プロジェクトルートに `.env` ファイルを作成
2. 以下の内容を記述（実際の値に置き換える）：

```env
# Supabase Configuration
REACT_APP_SUPABASE_URL=https://your-project-id.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-actual-anon-key-here
REACT_APP_PRODUCTION=true
```

### ステップ6: アプリケーション再起動
```bash
# 開発サーバーを停止（Ctrl+C）
# 再度起動
npm start
```

## 4. 管理者アカウント作成

### ステップ7: 初回管理者登録
1. http://localhost:3000/admin にアクセス
2. パスワード: `admin123` を入力
3. 「ログイン」をクリック
4. 初回ログイン時に自動的に管理者アカウントが作成されます

## 5. 動作確認

### ステップ8: 機能テスト
1. **社員管理**: 「社員管理」タブで新しい社員を追加
2. **打刻機能**: メイン画面（/）で追加した社員で出勤・退勤を試す
3. **データ出力**: 管理画面でCSVエクスポートを試す

## トラブルシューティング

### よくある問題と解決方法

#### 1. 「デモモード」から切り替わらない
- `.env` ファイルが正しい場所にあるか確認
- `REACT_APP_PRODUCTION=true` が設定されているか確認
- npm start を再起動

#### 2. データベース接続エラー
- Project URLが正しいか確認（httpsから始まる）
- anon keyが正しくコピーされているか確認
- Supabaseプロジェクトが有効になっているか確認

#### 3. 管理者ログインができない
- ブラウザのコンソールでエラーメッセージを確認
- `admin_profiles` テーブルが正しく作成されているか確認

## 完了確認

すべて設定完了後、以下が動作することを確認：
- [x] 管理者ログイン（admin123）
- [x] 社員の追加・編集・削除
- [x] 社員による出勤・退勤打刻
- [x] 打刻データのCSV出力
- [x] データがSupabaseに保存される

設定完了後はデモモードではなく、実際のSupabaseデータベースを使用します。