# DEPLOYMENT.md — ミノル勤怠 デプロイ手順

ミノル勤怠（CRA React 18 + TypeScript + `@supabase/supabase-js`）を Vercel（主系）／ Netlify（フォールバック）へデプロイする手順。ビルド成果物は静的 SPA で、実行時はブラウザが直接 Supabase に接続する（独自サーバなし）。

- 関連文書: [SECURITY.md](./SECURITY.md)、[OPERATIONS.md](./OPERATIONS.md)、`docs/DATA_MODEL.md`、`docs/ENVIRONMENT.md`。

---

## 1. 前提条件

### 1.1 Supabase プロジェクト
1. Supabase でプロジェクトを作成（Region 推奨: `Northeast Asia (Tokyo)`）。
2. **スキーマ適用**: Supabase SQL Editor で以下を実行する。
   - **新規プロジェクトを一から構築する場合**: まず `supabase/schema.sql`（復元済みの正規スキーマ）を実行する。ただし本ファイルは**推定を含む復元**であり実 DB との一致は未検証（[DATA_MODEL.md](./DATA_MODEL.md)・[SECURITY.md](./SECURITY.md) §4.5）。可能なら既存本番から `pg_dump --schema-only` で取得した DDL を用いるのが最も確実（[OPERATIONS.md](./OPERATIONS.md) §3.3）。
   - 続いて差分パッチを番号順に適用する（`supabase/migrations/` 参照。適用順・目的は `supabase/migrations/README.md`）:
     1. `0001_fix_employee_access_for_public.sql`（キオスク公開 RLS）
     2. `0002_add_overtime_minutes.sql`（残業分カラム）
     3. `0003_fix_search_path_security.sql`（関数の `search_path` 固定）
     4. `0004_fix_rls_performance.sql`（`(select auth.uid())` 化・重複整理）

   > **注意（技術的負債）**: 基盤テーブルの初期 DDL 原本は Git に無く Supabase 上にのみ存在する。`supabase/schema.sql` はその推定復元であり、DR/再構築の信頼性のため本番 DB から `pg_dump --schema-only` を取得して実測値で確定することを強く推奨（[SECURITY.md](./SECURITY.md) §4.5）。
3. **接続情報の取得**: Project Settings → API から `Project URL` と `anon public` キーを控える。`service_role` キーはデプロイに使用しない（[SECURITY.md](./SECURITY.md) §1）。
4. **super_admin の作成**: Auth でユーザーを作成し、その UID で `admin_profiles` に登録。
   ```sql
   INSERT INTO admin_profiles (id, name, email, role, is_active)
   VALUES ('<auth-uid>', 'システム管理者', 'admin@example.com', 'super_admin', true);
   ```
   （簡易認証を使う場合は、初回ログインで `admin@timecard.local` が自動作成される。[SECURITY.md](./SECURITY.md) §2.2）

### 1.2 環境変数
実際に使用する変数（詳細と全一覧は `docs/ENVIRONMENT.md` を参照）。

| 変数 | 必須 | 説明 |
|---|---|---|
| `REACT_APP_SUPABASE_URL` | ○ | Supabase プロジェクト URL |
| `REACT_APP_SUPABASE_ANON_KEY` | ○ | anon 公開鍵（ブラウザ公開前提。RLS で保護）|
| `REACT_APP_PRODUCTION` | ○ | `true` で本番（Supabase 接続）、未設定/`false` でデモモード |
| `REACT_APP_ALLOWED_IPS` | 任意 | 許可 IP（CIDR 可）。※クライアント側チェックの限界は [SECURITY.md](./SECURITY.md) §10.2 |

> **重要**: CRA では `REACT_APP_` プレフィックスの変数はすべてビルド時にバンドルへ埋め込まれ、ブラウザから閲覧可能になる。秘匿情報（`service_role` キー等）を `REACT_APP_*` に置かないこと。

### 1.3 ローカル検証（デプロイ前）
```bash
npm install --force
npm run build          # 本番ビルドが通ることを確認
```

---

## 2. Vercel デプロイ（主系）

### 2.1 `vercel.json`
リポジトリ直下の設定:
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "build",
  "installCommand": "npm install --force",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```
- `installCommand` が `npm install --force` である点に注意（依存の peer 競合を強制解決している）。将来的には依存を整理し `--force` を外すのが望ましい。
- `rewrites` により全パスを `/index.html` に返し、React Router の SPA ルーティングを成立させる。

### 2.2 初回セットアップ
1. Vercel で GitHub リポジトリをインポート。Framework Preset は Create React App（自動検出）。
2. **Environment Variables** に §1.2 の変数を登録。環境（Production / Preview / Development）ごとに設定できる。少なくとも Production に `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY`, `REACT_APP_PRODUCTION=true` を設定。
3. Deploy を実行。

### 2.3 継続的デプロイ
- `main` ブランチへの push → **Production** デプロイ。
- その他ブランチ / PR への push → **Preview** デプロイ（一意の URL が発行される）。本番反映前の動作確認に使う。

### 2.4 ロールバック
- Vercel ダッシュボード → Deployments で過去の正常なデプロイを選び **Promote to Production**（即時切替、再ビルド不要）。
- 環境変数の誤りが原因の場合は、変数を修正後に **Redeploy** が必要（変数はビルド時に埋め込まれるため、再デプロイしないと反映されない）。

### 2.5 公開範囲の保護（推奨）
公開 URL では認証なしで打刻・記録閲覧が可能（[SECURITY.md](./SECURITY.md) §10）。要件に応じて Vercel の **Deployment Protection**（Password Protection / Vercel Authentication）やネットワーク限定配信を併用する。

---

## 3. Netlify デプロイ（フォールバック）

主系が使えない場合の代替。SPA リライトは `public/_redirects` が担う。
```
/*    /index.html   200
```
- Build command: `npm run build`（peer 競合が出る場合は `npm install --force && npm run build`）
- Publish directory: `build`
- 環境変数（Site settings → Environment variables）に §1.2 と同一の値を設定。
- 変更後は再デプロイで反映。

---

## 4. デプロイ後の動作確認チェックリスト

デプロイ URL に対して確認する。

- [ ] トップ画面（`/`）が表示され、社員リストが読み込まれる（`employees` の公開 SELECT が機能）。
- [ ] 出勤打刻 → `time_records` に記録が作成される。
- [ ] 退勤打刻 → 同レコードが更新され、勤務時間・ステータスが算出される。
- [ ] 管理画面（`/admin`）でログインできる（Supabase Auth もしくは簡易認証）。
- [ ] 管理画面で打刻データが一覧表示される。
- [ ] CSV / Excel エクスポートが日本語込みで正しく出力される。
- [ ] 直接 URL（例 `/admin`）にアクセスしても 404 にならない（SPA リライトが機能）。
- [ ] ブラウザのネットワークタブで Supabase への接続先が正しい（本番 URL）ことを確認。
- [ ] コンソールに「デモモード」ログが出ていない（本番接続できている証跡）。

---

## 5. 本番 / デモモードの切替確認

- 切替は `REACT_APP_PRODUCTION` と Supabase 接続情報の有無で決まる（`isDevMode`）。
- **本番モード**: `REACT_APP_PRODUCTION=true` かつ有効な `REACT_APP_SUPABASE_URL` / `REACT_APP_SUPABASE_ANON_KEY` が設定されている。実データが Supabase に保存される。
- **デモモード**: 上記が未設定/`false`。モックデータで動作し、簡易認証は `minoruaki` / `akihiro0324`（デモ用ハードコード。是正予定 — [SECURITY.md](./SECURITY.md) §12）。
- 確認手順:
  1. デプロイ環境の環境変数を確認。
  2. アプリを開きブラウザコンソールを確認。`🔧 [デモ]` 系ログが出ていれば **デモモード**、出ていなければ本番接続。
  3. 実際に打刻して Supabase 側（[OPERATIONS.md](./OPERATIONS.md) §1）にレコードが増えることを確認。

> 本番運用で誤ってデモモードのまま公開すると、打刻が Supabase に保存されず消失する。§4 のチェックで必ず本番接続を確認すること。

---

## 6. トラブルシューティング

| 症状 | 原因の候補 | 対処 |
|---|---|---|
| ビルド失敗（依存競合）| peer dependency 競合 | `installCommand` が `npm install --force` か確認 |
| 本番なのにデモモード | `REACT_APP_PRODUCTION` 未設定 or 接続情報欠落 | 環境変数を設定し **再デプロイ**（変数はビルド時埋め込み）|
| `/admin` 等で 404 | SPA リライト未設定 | Vercel は `vercel.json` の rewrites、Netlify は `_redirects` を確認 |
| 打刻が保存されない | RLS ポリシー欠落 | [OPERATIONS.md](./OPERATIONS.md) §1.7 で確認、`fix-employee-access-for-public.sql` 再適用 |
| 環境変数を変えたのに反映されない | 再ビルドしていない | Redeploy を実行 |
| 鍵ローテーション後に接続不可 | 旧 anon キーが残存 | 新キーで環境変数更新 → 再デプロイ |
