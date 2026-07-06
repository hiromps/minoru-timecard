# CLAUDE.md

このファイルは Claude Code / エージェントが本リポジトリで作業する際のガイドです。

> 重要: 本プロジェクトは以前 Express + SQLite のバックエンドを持つ構成でしたが、その構成は廃止済みです。現在の実態は「ブラウザから直接 Supabase に接続する React SPA」です。以下の記述が現行の正典です。

## プロジェクト概要

- ミノル化学工業株式会社の勤怠打刻システム（UI 表示名「ミノルタイムカードシステム」）。
- 従業員が出勤・退勤を打刻し、遅刻・早退・残業などのステータスを自動判定する。
- 管理者は `/admin` で打刻記録の閲覧・修正、月次集計、社員管理、CSV 出力を行う。
- 独立した API サーバーは存在しない。フロントエンドの `@supabase/supabase-js` が Supabase と直接通信する。

## 技術スタック（実態）

- **フロントエンド**: React 18 + TypeScript (Create React App / react-scripts 5)
- **データ層・認証**: Supabase（PostgreSQL + Auth + RLS）、`@supabase/supabase-js` ^2.56
- **ルーティング**: react-router-dom 7（`/` = 打刻、`/admin` = 管理）
- **ホスティング**: Vercel（静的 SPA）。フォールバックとして Netlify (`public/_redirects`)
- **ランタイム**: Node.js 20.x / npm 10.x

## コマンド

```bash
npm install        # 依存関係のインストール（Vercel では npm install --force）
npm start          # 開発サーバー起動（http://localhost:3000）
npm run build      # 本番ビルド（build/ に出力）
npm test           # テスト（react-scripts test / Jest + RTL）
```

> バックエンドサーバーの起動コマンドは存在しない。`cd backend && npm run dev` のような手順は現行構成には無い（レガシー参照）。

## アーキテクチャ

```
ブラウザ (React SPA)
   └─ @supabase/supabase-js
        └─ Supabase (PostgreSQL + Auth + RLS)
配信: Vercel 静的ホスティング（rewrites で全リクエスト → /index.html）
```

- SPA が Supabase クライアントを生成し、各サービスモジュール経由でデータ操作・認証を行う。
- ルーティングは `src/App.tsx`。`/` は `TimeClock`、`/admin` は `AdminLogin` → `AdminDashboard`。

### データ層の各ファイルの役割

- `src/lib/supabase.ts` — Supabase クライアント生成、`isDevMode` 判定、共有型定義（`Employee` / `TimeRecord` / `TimeRecordStatus`）。デモモードではモッククライアントを返す。
- `src/lib/database.ts` — `employeeService` / `timeRecordService`。打刻・記録取得・月次集計など主要なデータ操作。
- `src/lib/adminSupabase.ts` — 管理・集計系の操作。
- `src/lib/auth.ts` — `authService`（Supabase Auth + `admin_profiles`）と `simpleAuth`（固定アカウント）。
- `src/lib/security.ts` — RBAC・権限・監査ロジック。`REACT_APP_ALLOWED_IPS` を任意で参照。
- `src/lib/demoDatabase.ts` / `src/lib/mockData.ts` — デモモード用のインメモリデータ。

### 主なコンポーネント

- `TimeClock`（`/`）— 打刻画面（直行直帰モードを含む）。
- `AdminLogin` + `AdminDashboard`（`/admin`）— 管理画面。タブ: 出力／月次／社員／打刻記録。
- `EmployeeManagement` — 社員 CRUD。
- `MonthlySummary` — 月次集計表示。
- `TimeRecordManagement` — 打刻記録の修正 UI。

## 業務ロジックの所在（正典）

**`src/utils/workTimeUtils.ts` の `calculateWorkTimeAndStatus` が唯一の信頼できる計算関数**です（打刻・修正・再計算・集計すべてがこれを使う）。ロジックを変更する場合は必ずここを起点にすること。

- ステータス: 通常／遅刻／早退／残業／遅刻・早退／遅刻・残業／設定エラー。
- 遅刻 = 出勤 > 所定始業。早退 = 退勤 < 所定終業。残業 = `overtime_minutes`（= 退勤 − 所定終業、分、0 未満は 0）> 0。
- 休憩控除: 所定昼休憩（JST 12:00〜13:00）と実勤務時間の重なり分のみ控除。
- 直行直帰（`is_direct_work`）: 遅刻・早退・残業の判定を抑止して「通常」扱いにするが、労働時間は計上する。出勤時に永続化し、退勤時に再確認する。
- タイムゾーン（`src/utils/dateUtils.ts`）: `localDateTimeToISO` が壁時計時刻を JST として UTC に変換する（ブラウザのタイムゾーンに依存しない）。UTC 実行環境（Vercel）で発生していた 9 時間ズレの不具合は修正済み。
- 月次集計（`src/lib/database.ts`）: 分単位で積算し、最後に一度だけ丸める。

詳細な業務ロジックの要点は [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) を参照。

## デモモード

`src/lib/supabase.ts` の `isDevMode` が true のとき、Supabase に接続せずモッククライアント + `demoDatabase.ts` で動作する。

`isDevMode` の判定条件（いずれかで true）:

- `REACT_APP_SUPABASE_URL` が未設定
- `REACT_APP_SUPABASE_URL` に `placeholder` を含む、または `your-project-url.supabase.co`
- `REACT_APP_SUPABASE_ANON_KEY` が未設定、または `your-anon-key-here`

## レガシー

`backend/`（Express 4 + SQLite3）は **廃止済み（retired）** で、デプロイ・呼び出しともに行われない。新規作業で `backend/` を触ったり参照したりしないこと。旧ドキュメントは順次 `docs/legacy/` へ移動される。

## 開発上の注意点

- 業務ロジックの重複実装を避ける。時間・ステータス計算は `workTimeUtils.ts` に集約する。
- 日時は必ず `dateUtils.ts` のユーティリティ経由で変換する（`getHours()` 等のローカルゲッターを直接使わない）。
- 環境変数は `REACT_APP_` プレフィックスが必須（CRA の制約）。実使用・未使用の区別は [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) を参照。
- Supabase のテーブルは RLS 有効。スキーマ詳細は [docs/DATA_MODEL.md](docs/DATA_MODEL.md)、セキュリティは [docs/SECURITY.md](docs/SECURITY.md) を参照。

## 関連ドキュメント

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — システム構成・業務ロジックの所在
- [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) — 環境変数リファレンス
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md) — データモデル・スキーマ
- [docs/SECURITY.md](docs/SECURITY.md) — セキュリティ設計
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) / [docs/OPERATIONS.md](docs/OPERATIONS.md) — デプロイ・運用
