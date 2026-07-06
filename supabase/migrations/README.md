# Supabase マイグレーション（順序付き整理）

このディレクトリは、本プロジェクトの Supabase に適用されてきた差分 SQL を、
適用順を明示して保管したものです。

> **重要**
> - `0001`〜`0004` は、元々リポジトリのルートに散在していた差分 SQL を適用順にリネームして集約したものです（ルートの元ファイルは統合作業で本ディレクトリへ移動済み）。
> - `0005`〜`0008` は、2026-07-06 に MCP 経由で本番 DB を実測・整備した際に**実際に適用した**マイグレーションです。
> - ベーススキーマ全体（テーブル本体・制約・RLS・関数）は `supabase/schema.sql` にあります。これは 2026-07-06 に**実 DB を読み取って確定した検証済みスキーマ**です（新環境構築時は schema.sql → 0001〜0008 の順が基本ですが、schema.sql は 0002/0005〜0008 の結果も織り込んだ現状スナップショットのため、新規構築では schema.sql のみで最新状態になります）。

## 適用順と各 SQL の目的

| 順 | ファイル名 | 目的（概要） |
|----|-----------|-------------|
| 0001 | `0001_fix_employee_access_for_public.sql` | `employees` / `time_records` の RLS を再定義。社員リストと打刻を**認証なし（public/anon）で読み取り・追加・更新**可能にし、削除は管理者のみに制限（キオスク設計）。 |
| 0002 | `0002_add_overtime_minutes.sql` | `time_records` に `overtime_minutes integer NOT NULL DEFAULT 0` を追加。 |
| 0003 | `0003_fix_search_path_security.sql` | 全 RPC/トリガー関数を `SET search_path = public` 付きで再作成（Linter 警告対応）。 |
| 0004 | `0004_fix_rls_performance.sql` | `auth.uid()` を `(select auth.uid())` でラップ、重複ポリシー/インデックス整理。 |
| 0005 | `0005_drop_recalc_backup_20260606.sql` | 残置バックアップ表 `_recalc_backup_20260606`（RLS 無効の公開状態・アドバイザ ERROR）を削除。 |
| 0006 | `0006_drop_broken_admin_time_record_functions.sql` | 壊れた未使用のデッド関数 `admin_create_time_record` / `admin_delete_time_record`（各2オーバーロード）を削除。 |
| 0007 | `0007_add_updated_at_triggers.sql` | `employees` / `time_records` / `admin_profiles` に `updated_at` 自動更新トリガーを設置。 |
| 0008 | `0008_fix_audit_trigger_function_columns.sql` | `audit_trigger_function` の列名を `old_values` / `new_values` に修正（トリガーは未設置）。 |

## 元ファイル対応表（0001〜0004）

| マイグレーション | 元ファイル（旧・リポジトリルート） |
|-----------------|-------------------------------|
| `0001_fix_employee_access_for_public.sql` | `fix-employee-access-for-public.sql` |
| `0002_add_overtime_minutes.sql` | `add-overtime-minutes.sql` |
| `0003_fix_search_path_security.sql` | `fix-search-path-security.sql` |
| `0004_fix_rls_performance.sql` | `fix-rls-performance.sql` |

## このディレクトリに含まれない SQL

以下は**診断用（読み取り専用）**であり、スキーマを変更しないためマイグレーションには含めていません。

| ファイル | 用途 |
|---------|------|
| `claudedocs/check_rls.sql` | `time_records` の RLS 有効状態・ポリシー・GRANT を確認する診断クエリ。 |
| `claudedocs/diagnose_status.sql` | ステータス再計算の切り分け（列型・JST/UTC 保存値・DB 側での正解ステータス算出）。 |

## Supabase 側のマイグレーション履歴について

Supabase の `supabase_migrations.schema_migrations` に記録されている履歴（`list_migrations`）は、
コンソール／MCP 経由で適用したものだけです（2026-07-06 時点で `add_config_error_to_status_check` /
`add_is_direct_work_column` / `add_correct_time_record_rpc` の 3 件＋本整備の 0005〜0008 相当）。
`0001`〜`0004` は当時 SQL Editor で直接適用されたため履歴には現れませんが、実 DB には反映済みです。

## 補足

- 打刻修正は `correct_time_record`（原子的 delete+insert の RPC）を使用します。定義は `supabase/schema.sql` に検証済みで記載。
- `0003` の `DROP FUNCTION ... CASCADE` は歴史的にトリガーを落とした可能性がありますが、現行では `0007` で `updated_at` トリガーを明示設置済みです。監査トリガーは意図的に未設置です（[docs/KNOWN_ISSUES.md](../../docs/KNOWN_ISSUES.md) §6・§10）。
