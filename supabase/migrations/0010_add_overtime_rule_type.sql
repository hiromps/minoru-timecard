-- 2026-08-20 適用
-- 残業ルール区分（employees.overtime_rule_type）と長時間勤務フラグ（time_records.is_extended_hours）を追加。
--
-- 背景:
-- - 押川彰宏・六條 直樹の2名は所定終業(17:00)後15分までは残業扱いにせず、
--   16分目以降は猶予15分を差し引いて残業を計上する特別ルール（grace_15min）を適用する。
-- - アルバイトは残業代を計上しない（hourly）。所定終業を1時間超えたら
--   長時間勤務フラグ(is_extended_hours)のみ記録する（給与計算には影響しない）。
-- - それ以外の社員は従来どおり（standard）。
--
-- 計算ロジック本体は src/utils/workTimeUtils.ts の calculateWorkTimeAndStatus に実装済み。
-- 既存の correct_time_record RPC は変更しない（本番の実定義が未確定なため）。
-- is_extended_hours は RPC 経由の修正では作成後に別 UPDATE で反映する
-- （src/lib/adminSupabase.ts の correctTimeRecordByDeleteAndCreate を参照）。

ALTER TABLE public.employees
  ADD COLUMN overtime_rule_type text NOT NULL DEFAULT 'standard';

ALTER TABLE public.employees
  ADD CONSTRAINT check_overtime_rule_type
  CHECK (overtime_rule_type = ANY (ARRAY['standard', 'grace_15min', 'hourly']));

ALTER TABLE public.time_records
  ADD COLUMN is_extended_hours boolean NOT NULL DEFAULT false;

-- 押川彰宏・六條 直樹の2名を特別猶予ルールに設定
UPDATE public.employees
SET overtime_rule_type = 'grace_15min'
WHERE name IN ('押川彰宏', '六條 直樹');
