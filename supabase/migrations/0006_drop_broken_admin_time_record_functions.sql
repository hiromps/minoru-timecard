-- 2026-07-06 適用
-- 実テーブルと不整合で壊れており、かつフロントエンド未使用のデッドコード関数を削除。
-- 打刻修正は correct_time_record（正規 RPC）を使用するため影響なし。
--   * admin_create_time_record: 存在しない列 notes / created_by_admin を参照
--   * admin_delete_time_record: id(bigint) を uuid と比較 / employee_id(text) を uuid と比較で型不一致
DROP FUNCTION IF EXISTS public.admin_create_time_record(uuid, date, timestamptz, timestamptz, text);
DROP FUNCTION IF EXISTS public.admin_create_time_record(text, date, timestamptz, timestamptz, text);
DROP FUNCTION IF EXISTS public.admin_delete_time_record(uuid);
DROP FUNCTION IF EXISTS public.admin_delete_time_record(text, date, text);
