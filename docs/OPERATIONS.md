# OPERATIONS.md — ミノル勤怠 運用 Runbook

ミノル勤怠（React SPA + Supabase + Vercel）の日常運用・監視・インシデント対応・保守手順をまとめた実務 Runbook。

- 前提スタック: ブラウザ → Supabase 直結（独自サーバなし）。DB 操作は原則 **Supabase ダッシュボードの SQL Editor** から実施する。
- 関連文書: [SECURITY.md](./SECURITY.md)（設計正典）、[DEPLOYMENT.md](./DEPLOYMENT.md)（デプロイ）、`docs/DATA_MODEL.md`、`docs/ENVIRONMENT.md`。
- 診断 SQL の実体は `claudedocs/check_rls.sql`, `claudedocs/diagnose_status.sql` を参照（本書の SQL はそれらを基に整理したもの）。

> SQL を本番に対して実行する際は、まず SELECT で影響範囲を確認してから UPDATE/DELETE を行うこと。破壊的操作の前に §3 のバックアップ手順で復元ポイントを確保する。

---

## 1. 監視 SQL

Supabase SQL Editor で実行する。定期実行の推奨頻度は §5 の保守カレンダーを参照。

### 1.1 ロック中の管理者アカウント確認
```sql
SELECT email, failed_login_attempts, locked_until, last_login, is_active
FROM admin_profiles
WHERE locked_until IS NOT NULL AND locked_until > NOW()
ORDER BY locked_until DESC;
```

### 1.2 ログイン失敗が発生しているアカウント
```sql
SELECT email, failed_login_attempts, locked_until, last_login
FROM admin_profiles
WHERE failed_login_attempts > 0
ORDER BY failed_login_attempts DESC;
```

### 1.3 監査ログ確認（直近の操作）
```sql
-- 直近 100 件
SELECT created_at, table_name, action, record_id, user_id
FROM audit_logs
ORDER BY created_at DESC
LIMIT 100;
```
```sql
-- 特定テーブルの変更履歴（例: time_records）
SELECT created_at, action, user_id, old_data, new_data
FROM audit_logs
WHERE table_name = 'time_records'
ORDER BY created_at DESC
LIMIT 200;
```
> 監査ログはカラムが 2 系統で書かれている（`old_data/new_data` と `old_values/new_values`）。参照時は両方を確認する（[SECURITY.md](./SECURITY.md) §7）。

### 1.4 異常な操作パターンの検知
```sql
-- 直近 1 時間に 20 回以上操作したユーザー（要調査の目安）
SELECT user_id, COUNT(*) AS ops
FROM audit_logs
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY user_id
HAVING COUNT(*) >= 20
ORDER BY ops DESC;
```

### 1.5 未退勤（退勤打刻欠落）レコード確認
```sql
-- 退勤時刻が入っていない打刻（当日を除く過去分は打刻漏れの可能性）
SELECT tr.record_date, tr.employee_id, e.name AS employee_name,
       tr.clock_in_time, tr.clock_out_time, tr.status
FROM time_records tr
JOIN employees e ON e.employee_id = tr.employee_id
WHERE tr.clock_in_time IS NOT NULL
  AND tr.clock_out_time IS NULL
  AND tr.record_date < CURRENT_DATE
ORDER BY tr.record_date DESC, tr.employee_id;
```

### 1.6 アクティブセッション確認
```sql
SELECT user_id, ip_address, user_agent, created_at, last_activity, expires_at
FROM user_sessions
WHERE is_active = true
ORDER BY last_activity DESC;
```

### 1.7 RLS 状態・ポリシーの確認（`claudedocs/check_rls.sql` 相当）
```sql
-- RLS 有効状態
SELECT relname AS table_name, relrowsecurity AS rls_enabled, relforcerowsecurity AS rls_forced
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN ('employees','time_records','admin_profiles','audit_logs','user_sessions');
```
```sql
-- 対象テーブルのポリシー一覧
SELECT tablename, policyname, cmd, roles, qual AS using_expr, with_check AS with_check_expr
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('employees','time_records','admin_profiles','audit_logs')
ORDER BY tablename, cmd, policyname;
```

### 1.8 ステータス不整合の把握（`claudedocs/diagnose_status.sql` 相当）
保存済み `status` と、勤務時間帯から算出される正しいステータスの食い違い件数を集計する。詳細な行単位比較 SQL は `claudedocs/diagnose_status.sql` を参照。
```sql
SELECT COUNT(*) AS total_rows,
       COUNT(*) FILTER (
         WHERE tr.status <> CASE
           WHEN tr.clock_in_time IS NULL THEN '通常'
           WHEN tr.clock_out_time IS NULL THEN
             CASE WHEN (tr.clock_in_time AT TIME ZONE 'Asia/Tokyo')::time > e.work_start_time::time
                  THEN '遅刻' ELSE '通常' END
           ELSE CASE
             WHEN (tr.clock_in_time AT TIME ZONE 'Asia/Tokyo')::time > e.work_start_time::time
              AND (tr.clock_out_time AT TIME ZONE 'Asia/Tokyo')::time < e.work_end_time::time THEN '遅刻・早退'
             WHEN (tr.clock_in_time AT TIME ZONE 'Asia/Tokyo')::time > e.work_start_time::time
              AND (tr.clock_out_time AT TIME ZONE 'Asia/Tokyo')::time > e.work_end_time::time THEN '遅刻・残業'
             WHEN (tr.clock_in_time AT TIME ZONE 'Asia/Tokyo')::time > e.work_start_time::time THEN '遅刻'
             WHEN (tr.clock_out_time AT TIME ZONE 'Asia/Tokyo')::time < e.work_end_time::time THEN '早退'
             WHEN (tr.clock_out_time AT TIME ZONE 'Asia/Tokyo')::time > e.work_end_time::time THEN '残業'
             ELSE '通常' END
         END
       ) AS mismatched_rows
FROM time_records tr
JOIN employees e ON e.employee_id = tr.employee_id;
```

---

## 2. アカウントロック解除・失敗カウントのリセット

[SECURITY.md](./SECURITY.md) §5 のロックアウト（5 回失敗 / 1 時間）に対する運用手順。

### 2.1 特定アカウントのロック解除
```sql
UPDATE admin_profiles
SET failed_login_attempts = 0, locked_until = NULL
WHERE email = 'admin@timecard.local';   -- 対象メールに置換
```

### 2.2 期限切れロックの一括クリア（安全）
```sql
-- ロック期限が過ぎたものだけリセット（現在ロック中の口座は触らない）
UPDATE admin_profiles
SET failed_login_attempts = 0, locked_until = NULL
WHERE locked_until IS NOT NULL AND locked_until < NOW();
```

### 2.3 緊急時の全解除（最終手段）
```sql
-- 全管理者のロックを解除・有効化。乱用注意。実行前に §1.1 で状況を記録。
UPDATE admin_profiles
SET failed_login_attempts = 0, locked_until = NULL, is_active = true;
```

> 既知課題: 成功ログイン時に `failed_login_attempts` を自動リセットする DB ロジックが無いため、カウントの残留が起きうる。当面は §2.2 の定期実行で吸収する。

---

## 3. バックアップと復旧

### 3.1 Supabase の自動バックアップ / PITR
- Supabase ダッシュボード → **Database → Backups**。
- 日次自動バックアップの有無・保持期間はプランに依存する。**Point-in-Time Recovery（PITR）は有料アドオン**であり、有効化されているか事前に確認すること（無効な場合、任意時点への巻き戻しはできない）。
- 復元はダッシュボードから対象時点を選択して実行。復元はプロジェクト全体に影響するため、実施前に関係者へ周知し、可能なら別プロジェクトへの復元で内容を検証してから切替える。

### 3.2 手動エクスポート（定期・破壊的操作前）
- **アプリからの CSV エクスポート**: 管理画面の CSV / Excel 出力機能で `time_records` を書き出す（日本語エンコーディング対応）。日次〜週次の業務バックアップに利用。
- **`pg_dump`**（論理バックアップ、推奨の完全バックアップ手段）:
  ```bash
  # 接続文字列は Supabase → Project Settings → Database → Connection string から取得
  pg_dump "postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres" \
    --no-owner --no-privileges -Fc -f minoru-timecard_$(date +%Y%m%d).dump
  ```
  復元:
  ```bash
  pg_restore --no-owner --no-privileges -d "postgresql://…/postgres" minoru-timecard_YYYYMMDD.dump
  ```
- **SQL Editor からの CSV**: 任意テーブルを `SELECT` して結果を CSV ダウンロード（小規模・臨時用）。

### 3.3 スキーマのバックアップ（重要）
[SECURITY.md](./SECURITY.md) §4.5 の通り、正規スキーマファイルが Git に未コミットである。**DR 対策として、少なくとも DDL（`pg_dump --schema-only`）を定期取得し、`supabase/schema.sql` として保全**すること。
```bash
pg_dump "postgresql://…/postgres" --schema-only --no-owner --no-privileges -f supabase/schema.sql
```

---

## 4. セッション清掃

```sql
-- 期限切れセッションの無効化 + 30 日超の無効セッション物理削除
SELECT cleanup_expired_sessions();
```
- ブラウザ側 `performSecurityMaintenance()` / `initializeSecurity()` からも `cleanup_expired_sessions` が呼ばれるが、確実性のため運用側でも定期実行する（週次）。

古い監査ログの整理（保持期間 180 日 = 6 ヶ月、`AUDIT_LOG_RETENTION_DAYS`）:
```sql
DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '6 months';
```

---

## 5. 定期保守カレンダー

| 頻度 | 作業 | 参照 |
|---|---|---|
| **日次** | 監査ログの異常確認（§1.3, §1.4）。3 回以上のログイン失敗があれば調査（§1.2）。未退勤レコード確認（§1.5）。| §1 |
| **週次** | セッション清掃 `cleanup_expired_sessions()`（§4）。ロック状況確認と期限切れロックのクリア（§1.1, §2.2）。CSV 手動バックアップ。| §2, §4 |
| **月次** | 古い監査ログ削除（§4）。`pg_dump` 完全バックアップの取得・保管確認（§3.2）。スキーマ DDL 保全（§3.3）。Vercel / npm 依存の更新確認（`npm audit`）。| §3 |
| **四半期** | 権限監査（`admin_profiles` の role/is_active 棚卸し）。RLS ポリシー総点検（§1.7）。公開 URL 運用のリスク受容の再確認（[SECURITY.md](./SECURITY.md) §10）。バックアップからの復元リハーサル。| §1.7, [SECURITY.md](./SECURITY.md) |

---

## 6. インシデント対応（L1–L4）

重大度は旧 `SECURITY_DEPLOYMENT_CHECKLIST.md` の 4 段階を踏襲。

### L1 — 軽微
- **定義**: 通常範囲のログイン失敗、単発の想定内エラー。
- **初動**: §1.2 で失敗状況を確認。閾値内なら経過観察。
- **エスカレーション**: 不要（記録のみ）。

### L2 — 中程度
- **定義**: アカウントロック発生、権限昇格の試行、`UNAUTHORIZED_ACCESS_ATTEMPT` の連続記録。
- **初動**: §1.1 でロック対象を特定。正当な利用者なら §2.1 で解除。不審なら解除せず調査を継続。監査ログ（§1.3）で関連操作を確認。
- **エスカレーション**: 運用責任者へ報告。

### L3 — 重大
- **定義**: 大量データアクセス／更新、想定外の一括変更、システム設定（RLS・関数）の変更痕跡。
- **初動**:
  1. §1.4 で高頻度操作ユーザーを特定。
  2. 影響テーブルの監査ログ（§1.3 の 2 つ目）で変更前後を確認。
  3. 必要に応じ該当 `admin_profiles` を無効化 `UPDATE admin_profiles SET is_active=false WHERE id='…';`。
  4. §3 のバックアップから影響範囲の復旧を検討。
- **エスカレーション**: 運用責任者 + 経営/管理部門へ即時報告。

### L4 — 緊急
- **定義**: 不正アクセスの確証、データ漏えい・改ざんの疑い、公開 URL 経由の第三者操作（[SECURITY.md](./SECURITY.md) §10.1 のリスク顕在化）。
- **初動（封じ込め優先）**:
  1. **アクセス遮断**: Vercel でデプロイを一時停止／保護を有効化、または DNS/公開 URL を停止する。緊急時は Supabase 側で該当テーブルの公開ポリシーを一時的に絞る（例）:
     ```sql
     -- 例: 打刻の匿名 UPDATE を緊急停止（退勤打刻は止まる点に注意）
     ALTER POLICY "public_time_records_update" ON time_records USING (false);
     ```
     ※ 業務停止を伴うため、影響を理解のうえ責任者判断で実施。復旧時に元の `USING (true)` へ戻す。
  2. **証跡保全**: 監査ログ・`user_sessions` を SQL Editor から CSV エクスポート（§1）。
  3. **鍵の再発行**: 漏えいが疑われる場合、Supabase の anon/`service_role` キーをローテーション（Project Settings → API）。ローテーション後は Vercel/Netlify の環境変数を更新し再デプロイ（[DEPLOYMENT.md](./DEPLOYMENT.md)）。
  4. **復旧**: §3 のバックアップ／PITR で健全な状態へ復元。
- **エスカレーション**: 経営層・法務／個人情報保護責任者へ即時報告。必要に応じ外部通報。

> インシデント対応後は事後レビューを行い、恒久対策（[SECURITY.md](./SECURITY.md) §10.2 の緩和策強化、§12 の是正項目）を計画する。

---

## 7. よくある運用トラブル

| 症状 | 確認 | 対処 |
|---|---|---|
| 管理者がログインできない | §1.1 でロック確認 | §2.1 で解除。プロファイル `is_active` 確認 |
| 「デモモード」から切り替わらない | `REACT_APP_SUPABASE_URL` / `ANON_KEY` / `REACT_APP_PRODUCTION` の設定 | 環境変数を修正し再デプロイ（[DEPLOYMENT.md](./DEPLOYMENT.md)）|
| 打刻が保存されない | §1.7 で `time_records` の INSERT/UPDATE ポリシーと anon 権限を確認 | ポリシー欠落なら `fix-employee-access-for-public.sql` を再適用 |
| ステータス表示が実態と食い違う | §1.8 で不整合件数を把握、`claudedocs/diagnose_status.sql` で行単位確認 | 再計算処理を実行。列型（timestamptz/timestamp）も確認 |
| 社員選択に社員が出ない | §1.7 で `employees` の SELECT ポリシー（`public_employees_read`）確認 | ポリシー再適用 |
