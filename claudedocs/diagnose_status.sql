-- ============================================================
-- ステータス再計算が効かない原因の診断SQL (v2: JOINキー修正)
-- Supabase SQL Editor で順に実行し、結果を貼り付けてください
-- time_records.employee_id (text "001"...) は employees.employee_id に対応
-- ============================================================

-- 【0】 まず employees の列を確認（JOINキーと型の確認）
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'employees'
ORDER BY ordinal_position;


-- 【1】 列型の確認（最重要）
-- clock_in_time / clock_out_time が timestamptz か timestamp かを見る。
-- "timestamp without time zone" なら、これが原因（保存時にTZ情報が落ちる）。
SELECT column_name, data_type, datetime_precision
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'time_records'
  AND column_name IN ('clock_in_time', 'clock_out_time', 'record_date', 'created_at');


-- 【2】 生の保存値の確認
SELECT
  tr.record_date,
  tr.employee_id,
  e.name AS employee_name,
  tr.clock_in_time                                   AS in_raw,
  tr.clock_out_time                                  AS out_raw,
  tr.clock_in_time  AT TIME ZONE 'UTC'               AS in_as_utc,
  tr.clock_out_time AT TIME ZONE 'UTC'               AS out_as_utc,
  tr.clock_in_time  AT TIME ZONE 'Asia/Tokyo'        AS in_as_jst,
  tr.clock_out_time AT TIME ZONE 'Asia/Tokyo'        AS out_as_jst,
  tr.clock_out_time::text                            AS out_text,
  tr.status                                          AS stored_status,
  tr.overtime_minutes                                AS stored_ot
FROM public.time_records tr
JOIN public.employees e ON e.employee_id = tr.employee_id
WHERE tr.record_date IN ('2026-05-26', '2026-05-27', '2026-05-18')
ORDER BY tr.record_date DESC, tr.employee_id;


-- 【3】 DB側で「正しいロジック」で計算した場合のステータス（答え合わせ）
SELECT
  tr.record_date,
  tr.employee_id,
  e.name AS employee_name,
  (tr.clock_in_time  AT TIME ZONE 'Asia/Tokyo')::time AS in_jst,
  (tr.clock_out_time AT TIME ZONE 'Asia/Tokyo')::time AS out_jst,
  e.work_start_time,
  e.work_end_time,
  tr.status AS stored_status,
  CASE
    WHEN tr.clock_in_time IS NULL THEN '通常'
    WHEN tr.clock_out_time IS NULL THEN
      CASE WHEN (tr.clock_in_time AT TIME ZONE 'Asia/Tokyo')::time > e.work_start_time::time
           THEN '遅刻' ELSE '通常' END
    ELSE
      CASE
        WHEN (tr.clock_in_time  AT TIME ZONE 'Asia/Tokyo')::time > e.work_start_time::time
         AND (tr.clock_out_time AT TIME ZONE 'Asia/Tokyo')::time < e.work_end_time::time THEN '遅刻・早退'
        WHEN (tr.clock_in_time  AT TIME ZONE 'Asia/Tokyo')::time > e.work_start_time::time
         AND (tr.clock_out_time AT TIME ZONE 'Asia/Tokyo')::time > e.work_end_time::time THEN '遅刻・残業'
        WHEN (tr.clock_in_time  AT TIME ZONE 'Asia/Tokyo')::time > e.work_start_time::time THEN '遅刻'
        WHEN (tr.clock_out_time AT TIME ZONE 'Asia/Tokyo')::time < e.work_end_time::time THEN '早退'
        WHEN (tr.clock_out_time AT TIME ZONE 'Asia/Tokyo')::time > e.work_end_time::time THEN '残業'
        ELSE '通常'
      END
  END AS correct_status
FROM public.time_records tr
JOIN public.employees e ON e.employee_id = tr.employee_id
WHERE tr.record_date IN ('2026-05-26', '2026-05-27', '2026-05-18')
ORDER BY tr.record_date DESC, tr.employee_id;


-- 【4】 食い違っている件数の全体集計（規模の把握）
SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (
    WHERE tr.status <> CASE
      WHEN tr.clock_in_time IS NULL THEN '通常'
      WHEN tr.clock_out_time IS NULL THEN
        CASE WHEN (tr.clock_in_time AT TIME ZONE 'Asia/Tokyo')::time > e.work_start_time::time
             THEN '遅刻' ELSE '通常' END
      ELSE
        CASE
          WHEN (tr.clock_in_time  AT TIME ZONE 'Asia/Tokyo')::time > e.work_start_time::time
           AND (tr.clock_out_time AT TIME ZONE 'Asia/Tokyo')::time < e.work_end_time::time THEN '遅刻・早退'
          WHEN (tr.clock_in_time  AT TIME ZONE 'Asia/Tokyo')::time > e.work_start_time::time
           AND (tr.clock_out_time AT TIME ZONE 'Asia/Tokyo')::time > e.work_end_time::time THEN '遅刻・残業'
          WHEN (tr.clock_in_time  AT TIME ZONE 'Asia/Tokyo')::time > e.work_start_time::time THEN '遅刻'
          WHEN (tr.clock_out_time AT TIME ZONE 'Asia/Tokyo')::time < e.work_end_time::time THEN '早退'
          WHEN (tr.clock_out_time AT TIME ZONE 'Asia/Tokyo')::time > e.work_end_time::time THEN '残業'
          ELSE '通常'
        END
    END
  ) AS mismatched_rows
FROM public.time_records tr
JOIN public.employees e ON e.employee_id = tr.employee_id;
