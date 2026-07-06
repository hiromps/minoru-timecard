# ミノルタイムカードシステム

ミノル化学工業株式会社の勤怠打刻システムです。個別の所定勤務時間設定に対応し、ブラウザから直接 Supabase に接続する SPA として動作します。

> UI 表示名は「ミノルタイムカードシステム」です。社内向けの内部利用を前提としています。

## 概要

- 従業員はブラウザで出勤・退勤を打刻します。
- 打刻データは Supabase (PostgreSQL) に保存され、ステータス（遅刻・早退・残業など）は打刻時に自動判定されます。
- 管理者は `/admin` 画面から打刻記録の閲覧・修正、月次集計、社員管理、CSV 出力を行えます。
- 独立した API サーバーは持ちません。フロントエンドの `@supabase/supabase-js` が Supabase と直接通信します。

## 主な機能

- **打刻**: 出勤・退勤の打刻（`/` 画面）
- **直行直帰モード**: 直行直帰の打刻。遅刻・早退・残業の判定を抑止して「通常」扱いにしつつ、労働時間は計上する（出勤時に永続化し、退勤時に再確認）
- **時刻指定打刻・修正**: 管理者が打刻時刻を指定・修正できる UI（打刻記録タブ）
- **ステータス自動判定**: 通常／遅刻／早退／残業／遅刻・早退／遅刻・残業／設定エラー
- **月次集計**: 従業員ごとの月次勤務時間の集計
- **CSV 出力**: 集計・記録の CSV エクスポート（`xlsx` 利用）
- **管理者機能**: 認証（Supabase Auth ／固定アカウント）、RBAC、監査ログ、社員 CRUD

## 技術スタック

- **フロントエンド**: React 18 + TypeScript (Create React App)
- **データ層 / 認証**: Supabase (PostgreSQL + Auth + RLS)、`@supabase/supabase-js` ^2.56
- **ルーティング**: react-router-dom 7
- **ホスティング**: Vercel（静的 SPA 配信）。フォールバックとして Netlify (`public/_redirects`)
- **ランタイム**: Node.js 20.x / npm 10.x

> 旧構成（Express + SQLite のバックエンド）は廃止済みです。詳細は下記「レガシー」を参照してください。

## クイックスタート

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.example` を `.env` にコピーし、Supabase プロジェクトの値を設定します。

```bash
cp .env.example .env
```

最低限、以下の 2 つを設定します（未設定・プレースホルダのままだとデモモードになります）。

```
REACT_APP_SUPABASE_URL=https://<your-project>.supabase.co
REACT_APP_SUPABASE_ANON_KEY=<your-anon-key>
```

環境変数の一覧と挙動は [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) を参照してください。

### 3. 開発サーバーの起動

```bash
npm start
```

- 打刻画面: http://localhost:3000
- 管理画面: http://localhost:3000/admin

### デモモード

`REACT_APP_SUPABASE_URL` / `REACT_APP_SUPABASE_ANON_KEY` が未設定、またはプレースホルダ値（`your-project-url.supabase.co` / `your-anon-key-here`）の場合、アプリは **デモモード** で起動します。この場合 Supabase には接続せず、モッククライアントと組み込みのデモデータ（`src/lib/demoDatabase.ts` / `src/lib/mockData.ts`）で動作します。Supabase の準備なしに画面や打刻の流れを確認できます。

## ビルドとデプロイ

### ビルド

```bash
npm run build
```

`build/` ディレクトリに静的アセットが出力されます。

### デプロイ（Vercel）

`vercel.json` の設定に従います。

- `buildCommand`: `npm run build`
- `outputDirectory`: `build`
- `installCommand`: `npm install --force`
- `rewrites`: 全リクエストを `/index.html` に書き換え（SPA ルーティング）

Vercel のプロジェクト環境変数に `REACT_APP_SUPABASE_URL` / `REACT_APP_SUPABASE_ANON_KEY` を設定してください。Netlify を使う場合は `public/_redirects`（`/* /index.html 200`）が同等の役割を果たします。

詳細な手順は [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) を参照してください。

## ドキュメント索引

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — システム構成・業務ロジックの所在
- [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) — 環境変数リファレンス
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md) — データモデル・テーブルスキーマ
- [docs/SECURITY.md](docs/SECURITY.md) — セキュリティ設計・RLS・権限
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — デプロイ手順
- [docs/OPERATIONS.md](docs/OPERATIONS.md) — 運用手順
- [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md) — 管理者マニュアル
- [docs/USER_GUIDE.md](docs/USER_GUIDE.md) — 利用者マニュアル

## ライセンス

MIT License
