# アーキテクチャ

ミノルタイムカードシステムの構成と、業務ロジックの所在をまとめます。データモデルの詳細は [DATA_MODEL.md](DATA_MODEL.md)、セキュリティは [SECURITY.md](SECURITY.md)、デプロイ・運用は [DEPLOYMENT.md](DEPLOYMENT.md) / [OPERATIONS.md](OPERATIONS.md) を参照してください。

## 全体構成

本システムは独立した API サーバーを持たず、ブラウザ上の React SPA が `@supabase/supabase-js` を通じて Supabase に直接アクセスします。

```
┌─────────────────────────────────────────────┐
│ ブラウザ                                     │
│  React 18 SPA (Create React App)             │
│   ├─ /       打刻画面 (TimeClock)            │
│   └─ /admin  管理画面 (AdminLogin→Dashboard) │
│        │                                     │
│        └─ @supabase/supabase-js (^2.56)      │
└────────┼─────────────────────────────────────┘
         │ HTTPS
         ▼
┌─────────────────────────────────────────────┐
│ Supabase                                     │
│   ├─ PostgreSQL（RLS 有効）                  │
│   ├─ Auth（管理者認証）                      │
│   └─ Row Level Security（アクセス制御）      │
└─────────────────────────────────────────────┘

配信:
  Vercel（静的 SPA ホスティング）
    vercel.json: build → build/, installCommand=npm install --force,
    rewrites で全リクエスト → /index.html
  フォールバック: Netlify（public/_redirects: /* /index.html 200）
```

- クライアント生成・型定義・デモ判定は `src/lib/supabase.ts` に集約されています。
- データ操作は `src/lib/database.ts`（`employeeService` / `timeRecordService`）と `src/lib/adminSupabase.ts`（管理・集計）に分かれます。
- 認証は `src/lib/auth.ts`（`authService` = Supabase Auth + `admin_profiles`、`simpleAuth` = 固定アカウント）。
- 権限・監査・RBAC は `src/lib/security.ts`。

## デモモード（isDevMode）

`src/lib/supabase.ts` の `isDevMode` により、Supabase へ接続する本番モードと、モッククライアント + インメモリデータで動作するデモモードを切り替えます。

`isDevMode` は次のいずれかに該当すると **true（デモモード）** になります。

- `REACT_APP_SUPABASE_URL` が未設定
- `REACT_APP_SUPABASE_URL` に `placeholder` を含む
- `REACT_APP_SUPABASE_URL` が `your-project-url.supabase.co`
- `REACT_APP_SUPABASE_ANON_KEY` が未設定
- `REACT_APP_SUPABASE_ANON_KEY` が `your-anon-key-here`

デモモードでは `createMockSupabaseClient()` が返され、実際の Supabase クライアントは初期化されません。データは `src/lib/demoDatabase.ts` と `src/lib/mockData.ts` から供給されます。Supabase の準備なしに画面遷移や打刻の流れを確認する用途に使えます。

環境変数の詳細は [ENVIRONMENT.md](ENVIRONMENT.md) を参照してください。

## 業務ロジックの所在と要点

時間・ステータス計算の**唯一の信頼できる実装は `src/utils/workTimeUtils.ts` の `calculateWorkTimeAndStatus`** です。打刻・修正・再計算・月次集計はすべてこの関数を経由します。ロジック変更時はここを起点にしてください。

### ステータス判定

判定されるステータス: `通常` / `遅刻` / `早退` / `残業` / `遅刻・早退` / `遅刻・残業` / `設定エラー`。

- **遅刻**: 出勤時刻 > 所定始業時刻
- **早退**: 退勤時刻 < 所定終業時刻
- **残業**: `overtime_minutes`（= 退勤時刻 − 所定終業時刻、分単位、0 未満は 0）が 0 より大きい
- **設定エラー**: 出勤なしで退勤あり、退勤 ≤ 出勤、所定終業 ≤ 所定始業 などの不正データ・設定ミス

残業ステータスの基準は「丸め後の `overtime_minutes` > 0」に統一されています。厳密比較（退勤 > 終業）を使うと、終業直後の数秒で「残業ステータスなのに残業 0 分」という矛盾レコードが生じるためです。

### 休憩控除

所定昼休憩は JST 12:00〜13:00 の固定です。実勤務時間帯と休憩時間帯の**重なった分のみ**を控除します（午前のみ・午後のみ勤務など休憩を跨がない場合は控除なし）。

### 直行直帰（is_direct_work）

直行直帰モードで打刻された記録（`is_direct_work = true`）は、遅刻・早退・残業の判定を抑止して「通常」扱いにします。ただし労働時間は通常どおり計上します。このフラグは出勤打刻時に永続化され、退勤打刻時に再確認されます。

### タイムゾーン

日時変換は `src/utils/dateUtils.ts` に集約されています。所定始業・終業は「JST の時刻」、打刻値は「UTC の絶対時刻（timestamptz / ISO 文字列）」として扱い、`localDateTimeToISO` が壁時計時刻を JST として UTC に変換します。この変換はブラウザのタイムゾーンに依存しません。

過去に、UTC 実行環境（Vercel）で `new Date("日付 17:00")` が UTC の 17:00 と解釈され、JST の打刻と 9 時間ズレて全打刻が誤判定される不具合がありましたが、修正済みです。ローカルタイムゲッター（`getHours()` 等）を直接使わないでください。

### 月次集計

月次集計（`src/lib/database.ts`）は、勤務時間を**分単位で積算し、最後に一度だけ丸め**ます。レコードごとに丸めてから合計する方式との差異（丸め誤差の累積）を避けるためです。

## ディレクトリ構成（抜粋）

```
minoru-timecard/
├─ public/
│  └─ _redirects            # Netlify 用 SPA リダイレクト
├─ src/
│  ├─ App.tsx               # ルーティング（/ と /admin）
│  ├─ components/           # TimeClock, AdminLogin, AdminDashboard,
│  │                        #   EmployeeManagement, MonthlySummary,
│  │                        #   TimeRecordManagement など
│  ├─ lib/
│  │  ├─ supabase.ts        # クライアント生成・isDevMode・型定義
│  │  ├─ database.ts        # employeeService / timeRecordService / 月次集計
│  │  ├─ adminSupabase.ts   # 管理・集計
│  │  ├─ auth.ts            # authService / simpleAuth
│  │  ├─ security.ts        # RBAC・権限・監査
│  │  ├─ demoDatabase.ts    # デモ用インメモリデータ
│  │  └─ mockData.ts        # デモ用モックデータ
│  └─ utils/
│     ├─ workTimeUtils.ts   # 業務ロジックの正典（計算・ステータス判定）
│     └─ dateUtils.ts       # JST/UTC 変換ユーティリティ
├─ vercel.json              # Vercel ビルド・配信設定
├─ backend/                 # レガシー（廃止済み・下記参照）
└─ docs/                    # ドキュメント
```

## レガシー backend/ の位置づけ

`backend/`（Express 4 + SQLite3）は**廃止済み（retired）**です。現行のデプロイ・実行経路からは呼び出されず、本番環境に独自 API サーバー・SQLite・`localhost:3001` は存在しません。新規作業では参照・変更しないでください。旧ドキュメントは順次 `docs/legacy/` へ移動されます。
