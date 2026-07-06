# SECURITY.md — ミノル勤怠 セキュリティ正典

ミノル化学工業株式会社 タイムカード打刻システム（以下「ミノル勤怠」）のセキュリティ設計・実装・運用に関する統合正典。

- 対象スタック: CRA（React 18 + TypeScript）+ `@supabase/supabase-js`、Vercel 静的 SPA 配信（Netlify `_redirects` フォールバック）。**独自のバックエンドサーバは存在せず、ブラウザが直接 Supabase に接続する**構成。
- この文書は、旧 `ENHANCED_SECURITY_GUIDE.md` / `SECURITY_IMPLEMENTATION_SUMMARY.md` / `SECURITY_GUIDE.md` / `SECURITY_DEPLOYMENT_CHECKLIST.md` の内容を統合し、実装（`src/lib/security.ts`, `src/lib/auth.ts`, `fix-*.sql`）と突き合わせて更新したもの。
- 関連文書: [OPERATIONS.md](./OPERATIONS.md)（運用 Runbook）、[DEPLOYMENT.md](./DEPLOYMENT.md)（デプロイ手順）、`docs/DATA_MODEL.md`（データモデル）、`docs/ENVIRONMENT.md`（環境変数）。

> **重要な但し書き**: 本システムは「誇張なく事実ベース」で記述する。「100% 安全」「完全に保護」といった表現は用いない。後述の「公開 RLS のトレードオフ」で、キオスク公開設計に伴う残存リスクを明示する。

---

## 1. アーキテクチャとセキュリティ境界

```
[ブラウザ (React SPA)]
   │  HTTPS
   │  @supabase/supabase-js（anon キーを保持）
   ▼
[Supabase]
   ├─ Auth（管理者ログイン）
   ├─ PostgREST（RLS で保護されたテーブル API）
   └─ PostgreSQL（RLS ポリシー・関数・トリガーで防御）
```

- セキュリティ境界の中心は **PostgreSQL 側の Row Level Security（RLS）と SECURITY DEFINER 関数**にある。ブラウザ側の権限チェック（`requirePermission` 等）は UX とフェイルファストのための補助であり、**最終的なアクセス制御は必ず DB 側で行われる**。
- anon キーはブラウザに配布される公開鍵であり、秘匿情報ではない。実効的な保護は RLS が担う（後述 §7）。
- `service_role` キーはあらゆる RLS を無視できる特権鍵であり、**フロントエンドやリポジトリに絶対に含めない**。

---

## 2. 認証（Authentication）

認証は 2 系統が併存する。いずれも最終的に Supabase Auth のセッションに帰着する。

### 2.1 Supabase Auth（メール + パスワード）
- 実装: `src/lib/auth.ts` の `authService`。
- `adminSignIn(email, password)` で `supabase.auth.signInWithPassword` を実行し、成功後に `admin_profiles`（`id = auth.uid()`）を照合。`is_active = false` の場合はサインアウトさせて拒否する。
- `admin_profiles` に該当プロファイルが無い、または無効化されている認証ユーザーは管理機能を利用できない。

### 2.2 簡易認証（simpleAuth・固定アカウント）
- 実装: `src/lib/auth.ts` の `simpleAuth`。従来運用との互換のための簡易ログイン。
- ユーザー名は `minoruaki` 固定。内部的には**固定メールアドレス `admin@timecard.local`** で Supabase Auth にログインする。
- 当該アカウントが未作成の場合（`Invalid login credentials`）、`createSimpleAdmin(password)` が初回ログイン時に Auth ユーザーと `admin_profiles` を作成する（初回入力パスワードがそのアカウントのパスワードになる）。
- ログイン前に既存セッションを `signOut()` でクリアしてから試行する。

### 2.3 管理者プロファイル（`admin_profiles`）
Supabase Auth ユーザーと 1:1 で対応する管理者メタデータ。

| カラム | 意味 |
|---|---|
| `id` | `auth.uid()`（Auth ユーザー ID と一致）|
| `name` | 表示名 |
| `email` | メール |
| `role` | `super_admin` / `admin` / `viewer` |
| `is_active` | 有効フラグ（false は即時失効）|
| `last_login` | 最終ログイン |
| `failed_login_attempts` | 連続ログイン失敗回数 |
| `locked_until` | ロック解除時刻（NULL または過去なら未ロック）|

---

## 3. 権限モデル（RBAC）

### 3.1 ロール階層
`src/lib/security.ts` の `hasPermission` が数値階層で判定する。

| ロール | レベル | 想定権限 |
|---|---|---|
| `super_admin` | 3 | 全操作（管理者の追加、削除操作を含む）|
| `admin` | 2 | 社員管理・打刻データ管理（一部削除は制限）|
| `viewer` | 1 | 閲覧のみ |

判定は「`userLevel >= requiredLevel`」。未認証・プロファイル無しは 0（全拒否）。

### 3.2 ブラウザ側の権限チェック
- `requirePermission(requiredRole)` → `SecurityMiddleware.requirePermission` を経由。
- 権限は `getCurrentUserRole()`（`admin_profiles` を参照、`is_active` かつ `locked_until` 未満のみ有効）で取得。
- **権限キャッシュ**: `SecurityMiddleware` は取得したロールを **5 分間**キャッシュ（`ROLE_CACHE_DURATION = 5 * 60 * 1000`）。権限失効の反映に最大 5 分の遅延がありうる。ログアウト時等は `clearRoleCache()` で明示的に破棄する。
- 権限不足時は `logSecurityEvent('UNAUTHORIZED_ACCESS_ATTEMPT', …)` を記録してから例外を投げる。

> 注意: ブラウザ側チェックはあくまで補助。改ざん可能なクライアントを信頼せず、DB 側 RLS（§4）が本丸である。

---

## 4. RLS（Row Level Security）モデル

現行ポリシーは `fix-employee-access-for-public.sql`（キオスク公開設計）を基点に、`fix-rls-performance.sql` で `auth.uid()` を `(select auth.uid())` に置換し行単位再評価を回避する形へ更新済み。

### 4.1 `employees`（社員）
- **SELECT: 全公開**（`public_employees_read` = `USING (true)`）。認証なしで社員リスト取得可能（打刻画面の社員選択に必要）。
- **INSERT / UPDATE / DELETE: 管理者のみ**（`admin_employees_write` / `admin_employees_update` / `admin_employees_delete`）。条件は `(select auth.uid()) IS NOT NULL AND EXISTS(admin_profiles WHERE id=(select auth.uid()) AND is_active)`。

### 4.2 `time_records`（打刻記録）
- **SELECT: 全公開**（`public_time_records_read`）。
- **INSERT: 全公開**（`public_time_records_insert` = `WITH CHECK (true)`）。認証なしで出勤打刻が可能。
- **UPDATE: 全公開**（`public_time_records_update` = `USING (true)`）。認証なしで退勤打刻が可能。
- **DELETE: 管理者のみ**（`admin_time_records_delete`）。

### 4.3 `admin_profiles`（管理者）
- **SELECT: 自分の行のみ**（`admin_read` = `id = (select auth.uid())`）。
- **INSERT: super_admin のみ**（`admin_insert`）。
- **UPDATE: 本人 または super_admin**（`admin_update`）。

### 4.4 `audit_logs`（監査ログ）
- **INSERT: 認証済みユーザーのみ**（`audit_logs_insert` = `(select auth.uid()) IS NOT NULL`）。
- **SELECT: 管理者のみ**（`audit_logs_read`）。

### 4.5 適用順序（SQL スクリプト）
本整備で、リポジトリ直下に散在していた SQL を `supabase/` 配下へ集約した。現在の正典は以下である。

- `supabase/schema.sql` — 全テーブル・制約・索引・RLS・主要関数/トリガーを**ベストエフォートで復元した正規スキーマ**（冪等）。ただし基盤 DDL の原本が存在しないため**推定を含む**。必ず本番 Supabase の実 DB と突合すること（[DATA_MODEL.md](./DATA_MODEL.md) の突合手順）。
- `supabase/migrations/` — 実際に適用されてきた差分パッチを順序付きで保管。
  1. `0001_fix_employee_access_for_public.sql` — キオスク公開 RLS への切替。
  2. `0002_add_overtime_minutes.sql` — 残業分カラム追加。
  3. `0003_fix_search_path_security.sql` — 全関数へ `SET search_path = public` を付与（§6）。
  4. `0004_fix_rls_performance.sql` — `(select auth.uid())` 化・重複ポリシー/インデックス整理。
  - 適用順・元ファイル対応・注意点は `supabase/migrations/README.md` を参照。

> **残存する技術的負債**: 基盤テーブルの初期 DDL 原本（歴史的に `supabase-schema.sql` / `supabase-enhanced-security.sql` と呼ばれた）は Git に無く、Supabase 上にのみ存在する。`supabase/schema.sql` はそれを推定復元したものであり、実 DB との一致は未検証である。DR/再構築の信頼性のため、本番 DB から `pg_dump --schema-only` を取得して `supabase/schema.sql` を実測値で確定することを推奨する。詳細は [DEPLOYMENT.md](./DEPLOYMENT.md) を参照。

---

## 5. ログイン失敗ロックアウト

- 実装: DB 関数 `handle_failed_login(user_email TEXT)`（`fix-search-path-security.sql`）+ ブラウザ側 `handleFailedLogin(email)`（`src/lib/security.ts`）。
- 挙動: `failed_login_attempts` をインクリメントし、**5 回以上で `locked_until = NOW() + INTERVAL '1 hour'`**（1 時間ロック）。
- 権限取得側（`getCurrentUserRole`）は `locked_until` が未来の場合、ロック中とみなして権限を返さない。
- 設定値は `src/lib/security.ts` の `SECURITY_CONFIG` にも定義（`MAX_LOGIN_ATTEMPTS = 5`, `LOCKOUT_DURATION = 60*60*1000ms`）。
- ロック解除・監視手順は [OPERATIONS.md](./OPERATIONS.md) を参照。

> 制約: 失敗カウントの増分は成功ログイン時にリセットするロジックが DB 関数側に無いため、リセットは運用（SQL）で行う前提。実装改善の候補（[OPERATIONS.md](./OPERATIONS.md) の既知課題）。

---

## 6. SECURITY DEFINER 関数と `search_path`

`fix-search-path-security.sql` により、以下の関数はすべて `SET search_path = public` を明示している（Supabase Linter の `function_search_path_mutable` 警告への対応。悪意あるスキーマ経由の関数乗っ取りを防ぐ）。

| 関数 | 用途 | SECURITY DEFINER |
|---|---|---|
| `update_updated_at_column()` | `updated_at` 自動更新トリガー | 無 |
| `audit_trigger_function()` | 監査ログ記録トリガー | 有 |
| `cleanup_expired_sessions()` | 期限切れセッション整理 | 有 |
| `handle_failed_login(text)` | ログイン失敗処理 | 有 |
| `admin_create_time_record(...)` | 管理者による打刻作成 | 有 |
| `check_admin_permissions()` | 管理者判定 | 有 |
| `is_admin_active()` | 有効管理者判定 | 有 |
| `is_admin_with_write_access()` | 書込権限管理者判定（admin/super_admin）| 有 |
| `admin_delete_time_record(uuid)` | 管理者による打刻削除 | 有 |

`admin_create_time_record` / `admin_delete_time_record` は内部で `is_admin_with_write_access()` を検査し、権限不足時は `RAISE EXCEPTION` する。

---

## 7. 監査ログ（`audit_logs`）

- 目的: テーブル変更の追跡。`audit_trigger_function()` が INSERT/UPDATE/DELETE 時に記録。
- 想定スキーマ（正典）: `table_name`, `record_id`, `action`, `old_data`, `new_data`, `user_id`, `reason`, `created_at`。
- `user_id` はトリガー実行時の `auth.uid()`。

> **実装上の不整合（要是正）**: 現行コードでは記録経路が 2 系統あり、カラムの使い方が揃っていない。
> - トリガー `audit_trigger_function()` は `old_data` / `new_data` / `user_id` に書き込む（`record_id`・`ip_address` は書かない）。
> - `src/lib/security.ts` の `logSecurityEvent` は `record_id` / `new_values` / `ip_address` / `user_agent` に書き込む。
>
> `old_data/new_data` と `old_values/new_values` が混在しており、監査ログのカラム定義を一本化する是正が望ましい。監査目的で参照する際は両系統の列を確認すること（[OPERATIONS.md](./OPERATIONS.md) の監査 SQL 参照）。

---

## 8. データ整合性制約

打刻データの品質を DB 制約で担保する。

- **1 日 1 レコード**: `UNIQUE(employee_id, record_date)`。
- **時刻の妥当性**: `CHECK (clock_out_time > clock_in_time)`。
- **勤務時間の範囲**: `CHECK (work_hours >= 0 AND work_hours <= 24)`。

RLS で書込が公開されていても（§4.2）、これらの制約により不正な値の投入は DB レベルで弾かれる。

---

## 9. セッション管理

- `user_sessions` テーブルでアクティブセッションを追跡（`user_id`, `ip_address`, `user_agent`, `is_active`, `expires_at`, `created_at`, `last_activity`）。
- `createUserSession()`（`src/lib/security.ts`）は既存セッションを無効化してから新規作成。有効期限は 8 時間（`SESSION_DURATION = 8*60*60*1000ms`）。
- `cleanup_expired_sessions()` で期限切れを無効化し、30 日以上前の無効セッションを物理削除。定期実行手順は [OPERATIONS.md](./OPERATIONS.md)。

> 補足: `ip_address` はブラウザから確実に取得できないため、`getClientIP()` は現状 `'0.0.0.0'` を返すプレースホルダ。IP による厳密なセッション拘束は現行では実効していない（改善候補）。

---

## 10. 【最重要】公開 RLS のトレードオフ（キオスク公開設計）

### 10.1 何が起きるか
現行の RLS（§4）は、**打刻キオスク端末で認証なしに打刻できる**ことを設計意図としている。その結果、以下が **認証なし（anon キーのみ）** で可能になる。

- `employees` の **全社員リスト取得**（氏名・社員番号・勤務時間帯など SELECT 可能な列）。
- `time_records` への **打刻 INSERT（出勤）** と **UPDATE（退勤）**。
- `time_records` の **全打刻記録の閲覧（SELECT）**。

これは社内のキオスク端末で使う限りは妥当だが、**Vercel の公開 URL は原則インターネット全体からアクセス可能**であるため、URL を知る第三者も同じ操作を実行できる。すなわち:

- 第三者による社員情報・勤怠記録の閲覧（情報漏えい）。
- 第三者による偽の打刻・既存打刻の改ざん（データ汚染）。

DELETE と管理機能は認証必須なので保護されるが、上記の READ/INSERT/UPDATE は設計上開放されている。**これは実装バグではなく、キオスク運用のための意図的な設計トレードオフである**点を明確にしておく。

### 10.2 緩和策（多層防御）
公開 URL 運用のリスクを下げるための選択肢。要件に応じて組み合わせる。

1. **ネットワーク限定配信**: 社内 LAN / VPN からのみ到達可能なネットワーク境界に配置する（最も効果的。キオスク運用の本来の前提）。
2. **Vercel Deployment Protection / アクセス保護**: Vercel の Password Protection や Vercel Authentication（SSO）で公開 URL 自体にアクセスゲートを設ける（Pro 以上のプラン機能）。
3. **IP 制限**: `REACT_APP_ALLOWED_IPS`（`SECURITY_CONFIG.ALLOWED_IPS`）による許可リスト。
   - **限界を明記**: 現行の `checkIPAllowed` はブラウザ側の簡易チェックであり、`getClientIP()` がプレースホルダ（`0.0.0.0`）を返すため、**現状は実効的なアクセス遮断になっていない**。ネットワーク層（リバースプロキシ / WAF / Vercel）での IP 制限を併用しない限り、クライアント側 JS の制限は回避可能である。
4. **URL の非公開運用**: 公開 URL を限定共有し、検索エンジンにインデックスさせない（`robots.txt` / `noindex`）。補助的措置であり単独では不十分。
5. **列の最小化**: `employees` の公開 SELECT で露出する列を必要最小限にする（ビュー化・列レベルの絞り込み）。
6. **将来的な設計変更**: キオスク端末を認証済みデバイス扱いにし、anon の書込を廃止する（RLS を認証必須へ戻す）。これは打刻 UX に影響するため要件確認のうえ判断。

### 10.3 リスク受容の記録
公開 URL でキオスク公開設計を採用する場合は、上記 10.1 の残存リスクを運用責任者が認識・受容していることを記録に残すこと（変更管理・監査の観点）。

---

## 11. 旧モデル（歴史的資料）

CLAUDE.md や旧 `SECURITY_GUIDE.md` / `NETWORK_SETUP.md` / `ADMIN_SETUP.md` が記述する以下のモデルは **廃止（retired）** であり、現行構成には適用されない。歴史的経緯の参照用としてのみ残す。

- 独自の **Node.js + Express + SQLite** バックエンド（`backend/timecard.db`）。
- `backend/config/allowed-ips.json` による Express ミドルウェアでの IP 制限（`ipRestriction.ts`）。
- `backend/src/middleware/auth.ts` のパスワード（`admin123` 等）。
- SQLite の `admins` テーブル + bcrypt によるローカル認証。
- Nginx リバースプロキシ / 自己署名証明書 / `DISABLE_IP_RESTRICTION` などの LAN 前提設定。

現行は **ブラウザ → Supabase 直結**であり、Express 層は存在しない。旧文書中の IP 制限・CORS・SSL 設定は Supabase / Vercel 側の機能に置き換えられている。

---

## 12. 既知のコード側セキュリティ課題（是正予定）

本システムのコードには以下の是正候補がある（詳細は別途 KNOWN_ISSUES 文書で管理）。SECURITY 観点で関係するもの:

1. **デモ認証情報のハードコード**: `src/lib/auth.ts` の `simpleAuth`（`minoruaki` / `akihiro0324`）および `src/lib/security.ts` のデモ用モックが平文で埋め込まれている。デモモード限定とはいえリポジトリに残さない方針での除去が望ましい。
2. **Supabase URL のフォールバック**: 接続情報のハードコードされたフォールバックがある場合は除去し、環境変数必須とする。
3. **localStorage への平文トークン保存**: デモモードで `adminToken` を平文保存している。廃止・見直しの対象。
4. **監査ログのカラム不整合**（§7）。
5. **クライアント側 IP 制限の実効性欠如**（§10.2）。

---

## 13. セキュリティ チェックリスト（デプロイ前）

- [ ] `service_role` キーがリポジトリ・フロントエンド・環境変数（`REACT_APP_*` は全てブラウザに露出する点に注意）に含まれていない。
- [ ] `REACT_APP_SUPABASE_ANON_KEY` は anon 鍵であることを確認（`service_role` ではない）。
- [ ] `fix-search-path-security.sql` 適用済み（全関数に `search_path = public`）。
- [ ] `fix-rls-performance.sql` 適用済み（`(select auth.uid())` 化）。
- [ ] RLS が全対象テーブルで有効（`SELECT relrowsecurity FROM pg_class …`）。
- [ ] super_admin アカウントが 1 つ以上存在し、`is_active = true`。
- [ ] 公開 URL 運用の場合、§10.2 の緩和策のうち少なくとも 1 つを適用し、残存リスクを受容・記録済み。
- [ ] 監査ログ・ロックアウトの監視手順（[OPERATIONS.md](./OPERATIONS.md)）が整備済み。
