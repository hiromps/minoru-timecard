# Supabase マイグレーション（順序付き整理）

このディレクトリは、リポジトリのルートに散在していた Supabase 用 SQL を、
**適用順を明示するためにリネームしてコピー配置**したものです。

> **重要**
> - ここにあるファイルは、ルートの元 SQL を **コピー**したものです。**元ファイルは削除していません**（統合担当が後で移動・整理します）。
> - このプロジェクトには **ベース初期スキーマの原本（`supabase-schema.sql` 相当）がリポジトリに存在しません**。初期テーブル群は Supabase コンソール（SQL Editor）で手動適用されたため、下記マイグレーションは「初期スキーマ適用後の差分」だけを表します。
> - ベーススキーマ全体のベストエフォート復元版は `supabase/schema.sql` を参照してください（推定を含む）。
> - 実際の適用日時・適用順は記録が残っておらず、**下記の順序は依存関係からの推定**です。実 DB との突合は `docs/DATA_MODEL.md` の「本番 Supabase 実 DB との突合検証手順」に従ってください。

## 適用順と各 SQL の目的

| 順 | ファイル名 | 目的（概要） | 冪等性 |
|----|-----------|-------------|--------|
| 0001 | `0001_fix_employee_access_for_public.sql` | `employees` / `time_records` の RLS ポリシーを再定義。社員リストと打刻を**認証なし（public / anon）で読み取り・追加・更新**可能にし、削除は管理者のみに制限。タイムカード打刻を認証レスで動かすための土台。 | ポリシーは `DROP POLICY IF EXISTS` → `CREATE POLICY`。再実行可（ただし `CREATE POLICY` は同名存在時エラーになるため、必ず先頭の DROP と対で適用）。 |
| 0002 | `0002_add_overtime_minutes.sql` | `time_records` に残業時間カラム `overtime_minutes integer NOT NULL DEFAULT 0` を追加。月次集計・CSV 出力で残業を扱うため。 | `ADD COLUMN IF NOT EXISTS` により冪等。既存行は 0 で埋まる。 |
| 0003 | `0003_fix_search_path_security.sql` | Supabase Linter の `function_search_path_mutable` 警告対応。全 RPC/トリガー関数を `SET search_path = public` 付きで再作成（`DROP FUNCTION ... CASCADE` → `CREATE OR REPLACE`）。スキーマ乗っ取り攻撃の緩和。 | `DROP FUNCTION IF EXISTS ... CASCADE` + `CREATE OR REPLACE` で概ね冪等。ただし CASCADE でトリガーも落ちるため、**適用後にトリガーの再作成が別途必要**（後述の注意参照）。 |
| 0004 | `0004_fix_rls_performance.sql` | RLS のパフォーマンス改善。`auth.uid()` を `(select auth.uid())` でラップして行単位再評価を回避、`employees` の重複 SELECT ポリシー整理、`audit_logs` の重複インデックス削除、`admin_profiles` ポリシー整備。 | ポリシーは `DROP ... IF EXISTS` → `CREATE`、`DROP INDEX IF EXISTS`。0001 の後に適用する前提。 |

## 元ファイル対応表

| マイグレーション（本ディレクトリ） | 元ファイル（リポジトリルート） |
|-----------------------------------|-------------------------------|
| `0001_fix_employee_access_for_public.sql` | `fix-employee-access-for-public.sql` |
| `0002_add_overtime_minutes.sql` | `add-overtime-minutes.sql` |
| `0003_fix_search_path_security.sql` | `fix-search-path-security.sql` |
| `0004_fix_rls_performance.sql` | `fix-rls-performance.sql` |

## このディレクトリに含まれない SQL

以下は**診断用（読み取り専用）**であり、スキーマを変更しないためマイグレーションには含めていません。

| ファイル | 用途 |
|---------|------|
| `claudedocs/check_rls.sql` | `time_records` の RLS 有効状態・ポリシー・GRANT を確認する診断クエリ。 |
| `claudedocs/diagnose_status.sql` | ステータス再計算が反映されない不具合の切り分け（列型確認・JST/UTC 保存値の確認・DB 側での正解ステータス算出）。 |

## 注意事項（適用時のリスク）

1. **`correct_time_record` RPC の定義がリポジトリに存在しない。**
   `src/lib/database.ts` が `supabase.rpc('correct_time_record', ...)` を呼び出していますが、この関数を作成する SQL はどのマイグレーションにも含まれていません（コンソールで直接作成されたと推定）。`supabase/schema.sql` にベストエフォートで復元版を記載しています。**必ず実 DB の定義と突合してください。**

2. **0003 の `DROP FUNCTION ... CASCADE` はトリガーも削除する。**
   `update_updated_at_column` / `audit_trigger_function` を CASCADE で落とすと、それらに紐づくトリガー（`update_*_updated_at`、各テーブルの監査トリガー）も同時に削除されます。0003 は関数を再作成しますが**トリガーの再作成 SQL を含みません**。適用後にトリガーが失われている可能性があるため、実 DB でトリガーの存在を確認してください（`supabase/schema.sql` にトリガー定義の復元版あり）。

3. **初期スキーマ（テーブル本体・基本制約）はここに無い。**
   新環境を一から再構築する場合は、まず `supabase/schema.sql` を適用してから 0001〜0004 を順に適用する運用を推奨します（ただし schema.sql は推定を含むため要検証）。
</content>
