-- 2026-09-25 適用
-- time_records に「半日休暇」（時間休で管理する有給）を追加。
--
-- 背景:
-- - 半日休暇の日は実際に出勤・退勤の打刻があり、時間的には早退（または遅刻）になるが、
--   休んだ時間帯は時間休（有給）として給与計算に算入する必要がある。
-- - 時間休は固定の2区分のみ: ①午前休 9:00〜12:00（180分） / ②午後休 13:00〜17:00（240分）。
-- - work_hours は実勤務時間のまま保持し、時間休の分は新カラム paid_leave_minutes に保存する。
--   （'有給' のように work_hours に加算すると、月次集計・再計算が打刻から計算し直した際に
--   時間休分が消える／食い違うため分離する）
-- - 給与計算（src/utils/payrollUtils.ts の validatePayroll）は work_hours + paid_leave_minutes を
--   合計勤務時間に算入する。登録は src/lib/adminSupabase.ts の correctToHalfDayLeave。

ALTER TABLE public.time_records
  DROP CONSTRAINT time_records_status_check;

ALTER TABLE public.time_records
  ADD CONSTRAINT time_records_status_check
  CHECK (status = ANY (ARRAY['通常','遅刻','早退','残業','遅刻・早退','遅刻・残業','設定エラー','欠勤','有給','半日休暇']));

ALTER TABLE public.time_records
  ADD COLUMN IF NOT EXISTS paid_leave_minutes integer NOT NULL DEFAULT 0;

ALTER TABLE public.time_records
  ADD CONSTRAINT time_records_paid_leave_minutes_check
  CHECK (paid_leave_minutes >= 0 AND paid_leave_minutes <= 480);
