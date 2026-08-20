-- 2026-08-20 適用
-- time_records.status に '有給'（有給休暇）を追加。
--
-- 背景:
-- - 欠勤（'欠勤'）は無給扱いだが、有給休暇は出勤・退勤の打刻が無くても
--   給与計算上は所定労働時間だけ働いたものとして扱う必要がある。
-- - '有給' の record は '欠勤' と同様に clock_in_time / clock_out_time は null のまま、
--   work_hours に所定労働時間（getScheduledWorkHours）を保存する。
-- - 給与計算（src/utils/payrollUtils.ts の validatePayroll）は '有給' の work_hours を
--   合計勤務時間に算入する。実装は src/lib/adminSupabase.ts の correctToPaidLeave。

ALTER TABLE public.time_records
  DROP CONSTRAINT time_records_status_check;

ALTER TABLE public.time_records
  ADD CONSTRAINT time_records_status_check
  CHECK (status = ANY (ARRAY['通常','遅刻','早退','残業','遅刻・早退','遅刻・残業','設定エラー','欠勤','有給']));
