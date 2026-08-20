-- 2026-08-20 適用
-- employees.overtime_rule_type に 'executive'（役員）区分を追加。
--
-- 背景:
-- - 役員は残業代を計上しないシンプルなルールを適用する。hourly（アルバイト）と異なり
--   長時間勤務フラグ(is_extended_hours)の記録も行わない。
-- - 計算ロジックは src/utils/workTimeUtils.ts の calculateWorkTimeAndStatus に実装済み。

ALTER TABLE public.employees
  DROP CONSTRAINT check_overtime_rule_type;

ALTER TABLE public.employees
  ADD CONSTRAINT check_overtime_rule_type
  CHECK (overtime_rule_type = ANY (ARRAY['standard', 'grace_15min', 'hourly', 'executive']));
