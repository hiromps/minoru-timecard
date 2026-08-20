-- 2026-08-20 適用
-- タイムカード画面の「欠勤登録」機能で使う status 値 '欠勤' を
-- time_records_status_check に追加する。
-- 追加前は '欠勤' でのINSERTがCHECK制約違反(23514)で失敗する。
ALTER TABLE public.time_records DROP CONSTRAINT time_records_status_check;
ALTER TABLE public.time_records ADD CONSTRAINT time_records_status_check CHECK (
    status = ANY (ARRAY['通常','遅刻','早退','残業','遅刻・早退','遅刻・残業','設定エラー','欠勤'])
);
