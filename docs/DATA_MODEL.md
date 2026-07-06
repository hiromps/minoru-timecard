# データモデル定義書（DATA_MODEL.md）

ミノル勤怠（ミノル化学工業株式会社 タイムカード打刻システム）の**データモデルの単一正典**です。
`docs/SECURITY.md`・`docs/ADMIN_GUIDE.md` 等から参照されます。

- **バックエンド**: Supabase Postgres 17.x（`pddriyhmkvsklqmtxsro`）、RLS（行レベルセキュリティ）有効
- **タイムゾーン規約**:
  - `clock_in_time` / `clock_out_time` は **timestamptz（UTC で保存）**
  - `record_date` は **JST の暦日（date）**
  - `work_start_time` / `work_end_time` は **`time` 型（JST の時刻。既定 09:00 / 17:00）**
  - ステータス・残業判定はフロントの `src/utils/workTimeUtils.ts` が JST 基準で算出

---

## ✅ 本書は実測で検証済み（2026-07-06）

**2026-07-06 に本番 Supabase（`pddriyhmkvsklqmtxsro`）を MCP 経由で読み取り、実測値で確定しました。**
検証済みの正規スキーマは `supabase/schema.sql` にあります（テーブル・制約・RLS・関数の実定義を反映）。

本書の一部に「推定」と記載が残っている場合は、以下の**実測で判明した確定事項**が優先されます。

- **`employees`**: `work_start_time` / `work_end_time` は **`time` 型**（"HH:MM" テキストではない）。既定は `09:00:00` / `17:00:00`。加えて **`is_active`(bool, 既定true) / `created_by`(uuid) / `updated_by`(uuid)** 列が実在。`id` は `bigint`（identity）、`employee_id` は `text` UNIQUE。
- **`time_records`**: `employee_id` は **`text`**、FK は `employees(employee_id)` へ **ON DELETE CASCADE**。制約は `check_clock_times`（退勤>出勤）・`check_work_hours`（0〜24）・status の7値CHECK。**`(employee_id, record_date)` の UNIQUE 制約は存在しない**（1日1レコードはアプリ側でのみ担保）。
- **`admin_profiles`**: `role` 既定は `'viewer'`、CHECK は `super_admin/admin/viewer`（`check_admin_role`）。`last_login` 列が実在。
- **`audit_logs`**: 列は **`old_values` / `new_values`（jsonb）**（`old_data` / `new_data` ではない）。他に `record_id`(text) / `action`(CHECK) / `user_id` / `ip_address` / `user_agent` / `reason` / `created_at`。
- **`user_sessions`**: `last_activity` 列が実在。RLS 有効だが**ポリシー未定義**（API 経由アクセス不可・SECURITY DEFINER 関数のみが操作）。
- **トリガー**: 実 DB には**トリガーが1つも設置されていない**（`updated_at` 自動更新も無い）。
- **壊れたデッドコード関数**: `audit_trigger_function`（`old_data/new_data` 参照）、`admin_create_time_record`（`notes/created_by_admin` 参照）は実テーブルと不整合で壊れているが、未使用のため実害なし。詳細は [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) §6・§10。
- **残置バックアップ表 `_recalc_backup_20260606`**（RLS無効・要対応）が存在。[KNOWN_ISSUES.md](./KNOWN_ISSUES.md) §10-3。

> 参考: 差分 SQL は `supabase/migrations/`（`0001`〜`0004`）、フロントの実クエリは `src/lib/*.ts`、診断 SQL は `claudedocs/*.sql`。以降の各節に一部「推定」表記が残っていますが、上記の実測確定事項および `supabase/schema.sql` を正とします。

---

## テーブル関連図（論理）

```
employees ──(employee_id: text 業務キー)──< time_records
                                              │
auth.users ──(id)── admin_profiles            │ 監査トリガー / 明示記録
                       │                       ▼
                       └──(user_id)── user_sessions   audit_logs
```

- `time_records.employee_id`(text) は `employees.employee_id`(text) と論理的に対応（**実 FK 制約の有無は推定**。退職者の孤児レコードが集計コードで考慮されている）。
- `admin_profiles.id`(uuid) は `auth.users.id`（= `auth.uid()`）と一致。

---

## 1. `employees`（社員マスタ）

個別の所定勤務時間を保持する社員マスタ。

| カラム | 型 | NULL | 既定値 | 説明 |
|--------|-----|------|--------|------|
| `id` | bigint（推定: identity/serial） | NOT NULL | 自動 | 主キー。TS では `number` |
| `employee_id` | text | NOT NULL | — | 業務キー（例 `"001"`）。UNIQUE。`time_records` から参照 |
| `name` | text | NOT NULL | — | 氏名 |
| `department` | text | NULL | — | 部署 |
| `work_start_time` | text（推定。time の可能性あり） | NOT NULL | `'09:00'`（推定） | 所定始業（JST "HH:MM"） |
| `work_end_time` | text（推定。time の可能性あり） | NOT NULL | `'17:00'`（推定） | 所定終業（JST "HH:MM"） |
| `created_at` | timestamptz | NOT NULL | `now()` | 作成日時 |
| `updated_at` | timestamptz | NOT NULL | `now()` | 更新日時（トリガーで自動更新・推定） |

- **制約**: `UNIQUE(employee_id)`（推定だが `.eq('employee_id', …).single()` 前提から確度高）
- **索引**: PK、`employee_id` UNIQUE
- **型の注記**: 診断 SQL が `work_start_time::time` と明示キャストしている点から、これらは **text** 格納の可能性が高い（time なら再キャスト不要）。要突合。

### RLS ポリシー（`employees`）
最終状態は `fix-rls-performance.sql`（`auth.uid()` を `(select auth.uid())` でラップ）を正とする。

| ポリシー名 | 操作 | 条件 |
|-----------|------|------|
| `public_employees_read` | SELECT | `true`（anon 含む全員） |
| `admin_employees_write` | INSERT | `(select auth.uid())` が存在し、`admin_profiles` に `is_active=true` の行あり |
| `admin_employees_update` | UPDATE | 同上 |
| `admin_employees_delete` | DELETE | 同上 |

> 補足: `fix-employee-access-for-public.sql` では書き込みが `FOR ALL`（単一 `admin_employees_write`）だったが、`fix-rls-performance.sql` で INSERT/UPDATE/DELETE の 3 ポリシーに分割された。後者が最終状態。

---

## 2. `time_records`（打刻記録）

1 社員・1 日 1 レコード。出退勤とステータス・勤務時間・残業を保持。

| カラム | 型 | NULL | 既定値 | 説明 |
|--------|-----|------|--------|------|
| `id` | bigint（推定） | NOT NULL | 自動 | 主キー。TS では `number` |
| `employee_id` | text | NOT NULL | — | `employees.employee_id` に対応 |
| `record_date` | date | NOT NULL | — | JST の暦日 |
| `clock_in_time` | timestamptz | NULL | — | 出勤（UTC 保存） |
| `clock_out_time` | timestamptz | NULL | — | 退勤（UTC 保存） |
| `status` | text | NOT NULL | `'通常'`（推定） | 下記[ステータス列挙](#ステータス列挙と判定ロジック) |
| `work_hours` | numeric | NOT NULL（推定） | `0`（推定） | 実労働時間（時間）。昼休憩控除後 |
| `overtime_minutes` | integer | **NOT NULL** | **`0`** | 残業（分）。`add-overtime-minutes.sql` で追加 |
| `is_direct_work` | boolean | NOT NULL（推定） | `false`（推定） | 直行直帰。true で遅刻/早退/残業判定を無効化 |
| `is_manual_entry` | boolean（推定） | 推定 | `false`（推定） | 手動入力フラグ。`getAllTimeRecords` が参照 |
| `approved_by` | text または uuid（推定） | NULL | — | 承認者。`getAllTimeRecords` が参照 |
| `notes` | text（推定） | NULL | — | **`admin_create_time_record` RPC のみが参照**。実在は要確認 |
| `created_by_admin` | boolean（推定） | 推定 | `false`（推定） | **同 RPC のみが参照**。実在は要確認 |
| `created_at` | timestamptz | NOT NULL | `now()` | 作成日時 |
| `updated_at` | timestamptz | NOT NULL | `now()` | 更新日時（トリガー自動更新・推定） |

- **CHECK 制約 `check_clock_times`**: `clock_out_time > clock_in_time`（退勤 > 出勤。負の勤務時間を禁止）。`workTimeUtils` の `設定エラー` 判定と整合。
- **UNIQUE（1日1レコード）**: コード上「**部分ユニーク索引**」と表現されている（`clockIn` 前の事前チェックコメント）。`(employee_id, record_date)` に対する UNIQUE 索引。**通常の UNIQUE か部分 UNIQUE かは要突合**。
- **索引（推定）**: `record_date`、`employee_id` に参照系索引がある可能性。

### RLS ポリシー（`time_records`）
打刻の**読み取り・追加・更新は認証なし（anon）でも可能**。削除のみ管理者限定（`fix-employee-access-for-public.sql` + `fix-rls-performance.sql`）。

| ポリシー名 | 操作 | 条件 |
|-----------|------|------|
| `public_time_records_read` | SELECT | `true` |
| `public_time_records_insert` | INSERT | `true`（WITH CHECK） |
| `public_time_records_update` | UPDATE | `true` |
| `admin_time_records_delete` | DELETE | `admin_profiles` に `is_active=true` の行あり |

> セキュリティ上の含意: 打刻データ（出退勤・氏名対応）は anon で読み書き可能。IP 制限等の外周防御が前提の設計。詳細は `docs/SECURITY.md` を参照。

---

## 3. `admin_profiles`（管理者プロファイル）

Supabase Auth（`auth.users`）と連携する管理者情報。`id` = `auth.uid()`。

| カラム | 型 | NULL | 既定値 | 説明 |
|--------|-----|------|--------|------|
| `id` | uuid | NOT NULL | — | 主キー。`auth.users.id` と一致 |
| `name` | text | NULL（推定） | — | 表示名 |
| `email` | text（推定） | 推定 | — | `handle_failed_login` が email で検索するため存在 |
| `role` | text | NOT NULL | `'admin'`（推定） | `'admin'` \| `'super_admin'`（`'viewer'` は `security.ts` のみで言及・推定） |
| `is_active` | boolean | NOT NULL | `true`（推定） | 有効フラグ。RLS/判定関数の要 |
| `failed_login_attempts` | integer | NOT NULL | `0` | ログイン失敗回数 |
| `locked_until` | timestamptz | NULL | — | ロック解除時刻。5 回失敗で `now()+1h` |
| `last_login` | timestamptz（推定） | NULL | — | `security.ts` 型定義に存在。実在は要確認 |
| `created_at` | timestamptz | NOT NULL | `now()` | 作成日時 |
| `updated_at` | timestamptz | NOT NULL | `now()` | 更新日時（推定） |

- **CHECK（推定）**: `role IN ('admin','super_admin','viewer')`。`'viewer'` の実在は要確認（`is_admin_with_write_access` は `('admin','super_admin')` のみ許可）。
- **ロール階層**（`security.ts`）: `super_admin`(3) > `admin`(2) > `viewer`(1)。

### RLS ポリシー（`admin_profiles`）
（`fix-rls-performance.sql` が最終状態）

| ポリシー名 | 操作 | 条件 |
|-----------|------|------|
| `admin_read` | SELECT | `id = (select auth.uid())`（自分のみ） |
| `admin_insert` | INSERT | 呼び出し元が `super_admin` かつ `is_active=true` |
| `admin_update` | UPDATE | 本人 または `super_admin` かつ `is_active=true` |

> DELETE ポリシーは未定義（削除運用なし・推定）。

---

## 4. `audit_logs`（監査ログ）

打刻修正等の監査証跡。**トリガー自動記録**と**フロントの明示記録**の 2 系統が書き込む。

| カラム | 型 | NULL | 既定値 | 説明 |
|--------|-----|------|--------|------|
| `id` | bigint（推定） | NOT NULL | 自動 | 主キー。TS では `number` |
| `table_name` | text | NOT NULL（推定） | — | 対象テーブル名（例 `'time_records'`） |
| `record_id` | text | NULL（推定） | — | 例 `"001-2026-05-27"`（`employee_id-record_date`）等 |
| `action` | text | NOT NULL（推定） | — | `'INSERT'` \| `'UPDATE'` \| `'DELETE'` \| `'SELECT'` |
| `old_data` | jsonb | NULL | — | **トリガー**が使用（`row_to_json(OLD)`） |
| `new_data` | jsonb | NULL | — | **トリガー**が使用（`row_to_json(NEW)`） |
| `old_values` | jsonb（推定） | NULL | — | **フロント**が使用。`old_data` と重複の可能性 |
| `new_values` | jsonb（推定） | NULL | — | **フロント**が使用。修正理由等を格納 |
| `user_id` | uuid | NULL | — | `auth.uid()` |
| `reason` | text | NULL | — | 修正理由。列が無い環境向けに `new_values` へ格納するフォールバックがフロントに存在 |
| `ip_address` | text（推定） | NULL | — | `security.ts` が付与 |
| `user_agent` | text（推定） | NULL | — | 同上 |
| `created_at` | timestamptz | NOT NULL | `now()` | 記録日時 |

- **🔴 重大な要突合ポイント**: `old_data`/`new_data`（トリガー）と `old_values`/`new_values`（フロント）が**併存**している可能性が高い。実 DB の実際のカラム構成を必ず確認すること。`database.ts` は読み取り時に `log.new_values?.reason` を参照するため、少なくとも `new_values` は実在する見込み。
- **索引**: `fix-rls-performance.sql` で重複索引 `idx_audit_logs_user_date` を削除し、`idx_audit_logs_user_id_created`（`user_id, created_at`）を残す方針。

### RLS ポリシー（`audit_logs`）

| ポリシー名 | 操作 | 条件 |
|-----------|------|------|
| `audit_logs_insert` | INSERT | `(select auth.uid()) IS NOT NULL`（認証済みのみ） |
| `audit_logs_read` | SELECT | `admin_profiles` に `is_active=true` の行あり（管理者のみ） |

---

## 5. `user_sessions`（セッション管理）

管理者セッション。8 時間有効・IP 紐付け。`cleanup_expired_sessions` で失効管理。

| カラム | 型 | NULL | 既定値 | 説明 |
|--------|-----|------|--------|------|
| `id` | uuid（推定） | NOT NULL | `gen_random_uuid()`（推定） | 主キー |
| `user_id` | uuid | NOT NULL（推定） | — | `auth.users.id` |
| `ip_address` | text | 推定 | — | クライアント IP |
| `user_agent` | text（推定） | NULL | — | UA 文字列 |
| `is_active` | boolean | NOT NULL | `true`（推定） | 有効フラグ |
| `expires_at` | timestamptz | NOT NULL | — | 失効時刻（作成時 +8h） |
| `last_activity` | timestamptz（推定） | NULL | `now()`（推定） | `security.ts` 型定義に存在 |
| `created_at` | timestamptz | NOT NULL | `now()` | 作成日時 |

- **RLS（推定）**: 実 DB のポリシー名・条件は未確認。本人セッションのみ操作可を仮定して `supabase/schema.sql` に暫定復元。**要突合。**
- **運用**: `createUserSession` は新規作成前に同一 `user_id` の既存セッションを `is_active=false` に更新（実質 1 ユーザー 1 アクティブセッション）。

---

## ステータス列挙と判定ロジック

`status` 列の取り得る値（`src/lib/supabase.ts` の `TimeRecordStatus` 型、`src/utils/workTimeUtils.ts` が算出）。

| ステータス | 条件（JST 基準） |
|-----------|------------------|
| `通常` | 出勤あり・所定内。または出勤のみで遅刻でない |
| `遅刻` | 出勤時刻 > 所定始業（`work_start_time`） |
| `早退` | 退勤時刻 < 所定終業（`work_end_time`） |
| `残業` | 残業分（退勤 − 所定終業、丸め後）> 0 |
| `遅刻・早退` | 遅刻 かつ 早退 |
| `遅刻・残業` | 遅刻 かつ 残業 |
| `設定エラー` | 出勤なしで退勤あり／所定終業 ≤ 所定始業（マスタ設定ミス・夜勤非対応）／退勤 ≤ 出勤（負の勤務時間） |

補足ロジック（`workTimeUtils.ts`）:
- **昼休憩控除**: 所定昼休憩 JST 12:00〜13:00 と実勤務が重なった分のみ `work_hours` から控除。午前のみ・午後のみ勤務では控除しない。
- **残業の基準統一**: 残業ステータスは「丸め後の残業分 > 0」を唯一の基準とする（終業 +1〜29 秒で「残業ステータスなのに残業 0 分」という矛盾を防ぐ）。
- **直行直帰（`is_direct_work=true`）**: 遅刻/早退/残業判定を無効化。出勤時ステータスを維持し残業は 0。ただし `work_hours` は実打刻から計上。再計算（`recalculateAllStatus`）でも同様に上書きしない。
- **優先順位**: `遅刻・早退` → `遅刻・残業` → `遅刻` → `早退` → `残業` → `通常`（早退と残業は排他。早退が優先）。

> 集計での使い方（`getMonthlySummary`）: 遅刻回数は `status` に `'遅刻'` を含む行数、早退回数は `'早退'` を含む行数でカウント（複合ステータスも計上される）。

---

## RPC / 関数一覧

全関数は `SET search_path = public` でハードニング済み（`fix-search-path-security.sql`）。トリガー関数以外の多くは `SECURITY DEFINER`。

| 関数 | 種別 | 引数 | 戻り値 | 用途 | 呼出元 |
|------|------|------|--------|------|--------|
| `correct_time_record` | RPC | `p_employee_id text, p_record_date date, p_clock_in_time timestamptz, p_clock_out_time timestamptz, p_work_hours numeric, p_overtime_minutes int, p_status text, p_is_direct_work bool` | `time_records` 行 | 打刻の**原子的修正**（同日既存を delete → insert を単一 Tx）。insert 失敗時に delete もロールバックし記録消失を防ぐ | `database.ts` `correctTimeRecordByDeleteAndCreate` |
| `admin_create_time_record` | RPC | `p_employee_id uuid, p_record_date date, p_clock_in_time timestamptz, p_clock_out_time timestamptz, p_notes text` | uuid | 管理者による打刻作成。権限チェック後 insert | フロント未使用（⚠️後述の不整合参照） |
| `admin_delete_time_record` | RPC | `p_record_id uuid` | boolean | 管理者による打刻削除。権限チェック後 delete | フロント未使用（削除は直接 `delete` を使用） |
| `handle_failed_login` | RPC | `user_email text` | void | ログイン失敗回数 +1。**5 回以上で `locked_until = now()+1h`** | `security.ts` `handleFailedLogin` |
| `cleanup_expired_sessions` | RPC | なし | void | 失効セッションを `is_active=false` 化 + 30 日以上前の非アクティブを物理削除 | `security.ts` `cleanupExpiredSessions` |
| `check_admin_permissions` | RPC | なし | boolean | `auth.uid()` が有効な管理者か | （補助・推定） |
| `is_admin_active` | RPC | なし | boolean | 同上（active 判定） | RLS/補助 |
| `is_admin_with_write_access` | RPC | なし | boolean | `role IN ('admin','super_admin')` かつ active | `admin_create_time_record` / `admin_delete_time_record` の権限判定 |
| `update_updated_at_column` | トリガー関数 | — | trigger | `NEW.updated_at = NOW()` | 各テーブルの `BEFORE UPDATE` トリガー |
| `audit_trigger_function` | トリガー関数 | — | trigger | `audit_logs` へ `old_data`/`new_data` を記録 | 監査対象テーブルの `AFTER I/U/D` トリガー |

> **`correct_time_record` の定義はリポジトリに存在しない**（コンソールで直接作成と推定）。`supabase/schema.sql` の復元版は `database.ts` の呼び出しから逆算したベストエフォート。**要突合。**

### トリガー（推定）
- `update_employees_updated_at` / `update_time_records_updated_at` / `update_admin_profiles_updated_at`（`BEFORE UPDATE` → `update_updated_at_column`）
- `time_records` への監査トリガー（`AFTER INSERT/UPDATE/DELETE` → `audit_trigger_function`）。**どのテーブルに付与されているかは要確認。**
- ⚠️ `fix-search-path-security.sql` の `DROP FUNCTION ... CASCADE` によりトリガーが**失われた可能性**がある（同 SQL はトリガー再作成を含まない）。実 DB で存在確認すること。

---

## 既知の不整合・推定箇所（要 DB 突合）

| # | 項目 | 内容 | 影響 |
|---|------|------|------|
| 1 | `audit_logs` 列名の二重系統 | トリガーは `old_data`/`new_data`、フロントは `old_values`/`new_values`（+`reason`/`ip_address`/`user_agent`）。両方実在するのか片方だけかが不明 | 監査ログの読み書き整合性。要スキーマ確認 |
| 2 | `correct_time_record` の定義欠落 | リポジトリに SQL なし。復元は推定 | 打刻修正機能の正典が未確定 |
| 3 | `admin_create_time_record` の型不整合 | `p_employee_id UUID` を受け `time_records.employee_id`(text) に挿入。フロント未使用 | 呼び出すと型不整合の恐れ。デッドコードの可能性 |
| 4 | `time_records.notes` / `created_by_admin` | `admin_create_time_record` のみが参照。他コード・他 SQL に痕跡なし | 実在するか不明。存在しなければ同 RPC は失敗する |
| 5 | `time_records` UNIQUE の形態 | 「部分ユニーク索引」との記述。通常 UNIQUE か部分 UNIQUE（条件付き）か不明 | 二重打刻防止の正確な条件 |
| 6 | `work_start_time`/`work_end_time` の型 | text か time か。診断 SQL の `::time` キャストから text 寄り | 保存形式・比較の前提 |
| 7 | `employees.id`・`time_records.id`・`audit_logs.id` の型 | TS は `number`。identity/serial/bigint の別は未確定 | 型定義の厳密化 |
| 8 | FK 制約の有無 | `time_records.employee_id → employees.employee_id`、`admin_profiles.id → auth.users.id`、`user_sessions.user_id` の実 FK は未確認（孤児レコード考慮のコードあり） | 参照整合性・削除挙動 |
| 9 | `admin_profiles.role` の `'viewer'` | `security.ts` のみで言及。CHECK 制約に含まれるか不明 | ロール階層の実効性 |
| 10 | トリガーの実在・付与先 | CASCADE で消えた可能性。監査トリガーの対象テーブルも未確認 | `updated_at` 自動更新・監査記録の動作 |
| 11 | `user_sessions` の RLS | ポリシー内容が未確認 | セッションテーブルのアクセス制御 |

---

## 本番 Supabase 実 DB との突合検証手順

Supabase ダッシュボード → **SQL Editor** で以下を実行し、本書・`supabase/schema.sql` と差分がないか確認する。
プロジェクト参照: `pddriyhmkvsklqmtxsro`。

### 1. テーブル・カラム定義（`\d` 相当）

```sql
-- 全対象テーブルのカラム・型・NULL・既定値
SELECT table_name, ordinal_position, column_name, data_type,
       is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('employees','time_records','admin_profiles','audit_logs','user_sessions')
ORDER BY table_name, ordinal_position;
```

特に確認: `audit_logs` の `old_data/new_data` vs `old_values/new_values`（不整合 #1）、`time_records` の `notes`/`created_by_admin`/`is_manual_entry`/`approved_by`（#4）、`work_start_time/end_time` の型（#6）。

### 2. 制約（PK / UNIQUE / CHECK / FK）

```sql
SELECT tc.table_name, tc.constraint_name, tc.constraint_type,
       cc.check_clause,
       kcu.column_name,
       ccu.table_name  AS foreign_table,
       ccu.column_name AS foreign_column
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.check_constraints cc
       ON cc.constraint_name = tc.constraint_name AND cc.constraint_schema = tc.table_schema
LEFT JOIN information_schema.key_column_usage kcu
       ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
LEFT JOIN information_schema.constraint_column_usage ccu
       ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
WHERE tc.table_schema = 'public'
  AND tc.table_name IN ('employees','time_records','admin_profiles','audit_logs','user_sessions')
ORDER BY tc.table_name, tc.constraint_type;
```

特に確認: `check_clock_times`（#5）、FK の有無（#8）、`admin_profiles_role_check` の許可値（#9）。

### 3. 索引（UNIQUE / 部分索引の条件を含む）

```sql
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('employees','time_records','admin_profiles','audit_logs','user_sessions')
ORDER BY tablename, indexname;
```

`indexdef` に `WHERE` が含まれれば部分索引（#5）。`time_records` の `(employee_id, record_date)` UNIQUE の実形態を確認。

### 4. RLS 有効状態とポリシー（`pg_policies`）

```sql
-- RLS 有効/強制
SELECT relname AS table_name, relrowsecurity AS rls_enabled, relforcerowsecurity AS rls_forced
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN ('employees','time_records','admin_profiles','audit_logs','user_sessions');

-- ポリシー本体（USING / WITH CHECK）
SELECT tablename, policyname, cmd, roles, qual AS using_expr, with_check AS with_check_expr
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('employees','time_records','admin_profiles','audit_logs','user_sessions')
ORDER BY tablename, cmd, policyname;
```

確認: `(select auth.uid())` でラップ済みか（`fix-rls-performance.sql` 反映の有無）、`time_records`/`employees` の public 系ポリシー、`user_sessions` のポリシー内容（#11）。
（`claudedocs/check_rls.sql` に `time_records` 単体の同等クエリあり。）

### 5. 関数・SECURITY DEFINER・search_path

```sql
SELECT proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS args,
       prosecdef AS security_definer,
       proconfig AS config      -- search_path=public が入っているか
FROM pg_proc p
WHERE pronamespace = 'public'::regnamespace
  AND proname IN (
    'correct_time_record','admin_create_time_record','admin_delete_time_record',
    'handle_failed_login','cleanup_expired_sessions','check_admin_permissions',
    'is_admin_active','is_admin_with_write_access',
    'update_updated_at_column','audit_trigger_function'
  )
ORDER BY proname;

-- 定義本体（correct_time_record の実定義を必ず確認: 不整合 #2）
SELECT pg_get_functiondef('public.correct_time_record'::regproc);
```

確認: `correct_time_record` の実引数・本体（#2）、`admin_create_time_record` の引数型（#3）、全関数の `config` に `search_path=public` があるか。

### 6. トリガーの実在・付与先

```sql
SELECT event_object_table AS table_name, trigger_name,
       action_timing, event_manipulation, action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;
```

確認: `update_*_updated_at` と監査トリガーが実在するか（CASCADE で消えていないか・#10）、監査トリガーの対象テーブル。

### 7. ステータス整合（任意・データ検証）

`claudedocs/diagnose_status.sql` を実行し、保存済み `status` と DB 側で再計算した正解ステータスの食い違い件数を確認できる（`work_start_time::time` 等のキャスト前提を含むため、型確認後に使用）。

---

## 変更履歴

- 本書は差分 SQL とフロント実クエリからの**ベストエフォート復元**。実 DB との突合完了後、「推定」表記を確定値へ更新すること。
- 関連: `supabase/schema.sql`（正典 SQL・推定含む）、`supabase/migrations/`（順序付き差分 SQL と適用順）。
</content>
