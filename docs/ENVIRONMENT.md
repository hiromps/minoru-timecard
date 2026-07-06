# 環境変数リファレンス

本システムの環境変数について、**実際にコードで使用される変数**と、**`.env.example` に宣言されているが現状コードでは未使用の変数**を区別して記載します。

すべての変数は Create React App の制約により `REACT_APP_` プレフィックスが必要です。ビルド時にバンドルへ埋め込まれるため、機密情報（サービスロールキー等）は絶対に置かないでください（anon key はブラウザ公開前提の公開鍵です）。

## 実際にコードで使用される変数

| 変数名 | 必須/任意 | 意味 | デフォルト挙動 |
|---|---|---|---|
| `REACT_APP_SUPABASE_URL` | 実質必須 | Supabase プロジェクトの URL。`src/lib/supabase.ts` でクライアント生成に使用。 | 未設定・プレースホルダ（`your-project-url.supabase.co`）だと **デモモード**（`isDevMode = true`）。本番接続には有効値が必須。 |
| `REACT_APP_SUPABASE_ANON_KEY` | 実質必須 | Supabase の anon（公開）キー。`src/lib/supabase.ts` でクライアント生成に使用。 | 未設定・プレースホルダ（`your-anon-key-here`）だと **デモモード**。本番モードで未設定のままだとクライアント生成時にエラーとなる。 |
| `REACT_APP_ALLOWED_IPS` | 任意 | 許可 IP のカンマ区切りリスト。`src/lib/security.ts` で参照（`.split(',')`）。IP 制限を有効化する場合に設定。 | 未設定時は空配列。`.env.example` ではコメントアウトされている。 |

> 「実質必須」= 本番モード（Supabase 接続）で動作させるには必須。未設定でもデモモードとしては起動します。

## `.env.example` に宣言のみで現状未使用の変数

以下は `.env.example` に記載がありますが、現状のコードからは参照されていません。将来の機能拡張向けのプレースホルダとして残っているもので、設定しても挙動は変わりません。

| 変数名 | `.env.example` の記載値 | 備考 |
|---|---|---|
| `REACT_APP_PRODUCTION` | `false` | 本番切替フラグとして宣言されているが未参照。実際の本番/デモ切替は `isDevMode`（Supabase URL/KEY の値）で決まる。 |
| `REACT_APP_MAX_LOGIN_ATTEMPTS` | `5` | ログイン試行上限の宣言のみ。`security.ts` の該当ロジックはコード内定数を使用。 |
| `REACT_APP_LOCKOUT_DURATION` | `3600` | ロックアウト時間の宣言のみ。未参照。 |
| `REACT_APP_SESSION_DURATION` | `28800` | セッション時間の宣言のみ。未参照。 |
| `REACT_APP_AUDIT_LOG_ENABLED` | `true` | 監査ログ機能フラグの宣言のみ。未参照。 |
| `REACT_APP_SESSION_MANAGEMENT_ENABLED` | `true` | セッション管理フラグの宣言のみ。未参照。 |
| `REACT_APP_FAILED_LOGIN_PROTECTION` | `true` | 失敗ログイン保護フラグの宣言のみ。未参照。 |

> セキュリティ関連の実挙動（ロックアウト時間・セッション時間など）は現状 `src/lib/security.ts` のコード内定数で決まります。詳細は [SECURITY.md](SECURITY.md) を参照してください。

## デモモードとの関係

`REACT_APP_SUPABASE_URL` と `REACT_APP_SUPABASE_ANON_KEY` の値が、そのままデモ/本番の切替条件になります。次のいずれかに該当するとデモモード（`isDevMode = true`）です。

- `REACT_APP_SUPABASE_URL` が未設定
- `REACT_APP_SUPABASE_URL` に `placeholder` を含む
- `REACT_APP_SUPABASE_URL` が `your-project-url.supabase.co`
- `REACT_APP_SUPABASE_ANON_KEY` が未設定
- `REACT_APP_SUPABASE_ANON_KEY` が `your-anon-key-here`

本番モードで動かすには、両方に実際の Supabase プロジェクトの値を設定してください。

## ローカル開発での設定

`.env.example` を `.env` にコピーして値を設定します。

```bash
cp .env.example .env
```

```
REACT_APP_SUPABASE_URL=https://<your-project>.supabase.co
REACT_APP_SUPABASE_ANON_KEY=<your-anon-key>
```

`.env` を変更した後は開発サーバー（`npm start`）を再起動してください（CRA は起動時に環境変数を読み込みます）。

## Vercel での環境変数設定

1. Vercel のプロジェクト → **Settings** → **Environment Variables** を開く。
2. 以下を追加する。
   - `REACT_APP_SUPABASE_URL`
   - `REACT_APP_SUPABASE_ANON_KEY`
   - 必要に応じて `REACT_APP_ALLOWED_IPS`
3. 対象環境（Production / Preview / Development）を選択して保存する。
4. 再デプロイして反映する（環境変数はビルド時に埋め込まれるため、変更後は再ビルドが必要）。

## Netlify での環境変数設定

1. Netlify のサイト → **Site settings** → **Environment variables** を開く。
2. 上記と同じ変数を追加する。
3. 再デプロイして反映する。

デプロイ手順の詳細は [DEPLOYMENT.md](DEPLOYMENT.md) を参照してください。
