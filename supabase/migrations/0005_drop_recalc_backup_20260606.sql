-- 2026-07-06 適用
-- 2026-06-06 のステータス再計算時に作られた残置バックアップ表を削除。
-- RLS 無効で匿名（anon）から読み取り可能な状態（Supabase アドバイザ ERROR
-- rls_disabled_in_public）だったため、不要になった当該表を削除して解消する。
DROP TABLE IF EXISTS public._recalc_backup_20260606;
