-- =================================
-- 機能追加: 残業時間カラム (overtime_minutes)
-- =================================
-- このスクリプトは、time_records テーブルに残業時間（分）を保存する
-- overtime_minutes カラムを追加します。
--
-- 背景: これまで残業ステータス（'残業' 等）は判定されていましたが、
-- 残業時間そのものはどこにも保存されていませんでした。
-- 月次集計・CSV出力で残業時間を扱うため、カラムを追加します。
--
-- 残業時間の定義: 退勤時刻 - 所定退勤時刻(work_end_time)。0以上。
--
-- 非破壊性: NOT NULL DEFAULT 0 のため、既存行は0で埋められ、
-- カラムを指定しない既存のINSERTもエラーになりません。
--
-- 実行方法: Supabase SQL Editorで実行してください
-- =================================

ALTER TABLE public.time_records
  ADD COLUMN IF NOT EXISTS overtime_minutes integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.time_records.overtime_minutes IS '残業時間（分）。退勤時刻 - 所定退勤時刻(work_end_time)。0以上。';

-- 追加結果の確認
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'time_records'
  AND column_name = 'overtime_minutes';

SELECT '✅ overtime_minutes カラム追加完了' as status;
