-- 間違い打刻修正用SQLスクリプト
-- 管理者が従業員の間違った打刻を修正するためのスクリプト

-- =================================
-- 1. 間違い打刻の確認と修正
-- =================================

-- 今日の打刻記録を確認
SELECT 
    '今日の打刻記録確認' as action,
    id,
    employee_id,
    record_date,
    clock_in_time,
    clock_out_time,
    status,
    work_hours,
    is_manual_entry,
    created_at
FROM time_records 
WHERE record_date = CURRENT_DATE
ORDER BY employee_id, created_at;

-- =================================
-- 2. 管理者による打刻記録の削除
-- =================================

-- 特定の打刻記録を削除（管理者のみ実行可能）
-- 使用例：間違って押した出勤打刻を削除する場合
/*
DELETE FROM time_records 
WHERE 
    employee_id = '001' 
    AND record_date = CURRENT_DATE
    AND id = 123;  -- 削除したいレコードのIDを指定
*/

-- 従業員の今日の全打刻記録を削除（緊急時のみ）
/*
DELETE FROM time_records 
WHERE 
    employee_id = '001' 
    AND record_date = CURRENT_DATE;
*/

-- =================================
-- 3. 正しい打刻記録の再作成
-- =================================

-- 新しい正しい打刻記録を挿入
-- 使用例：削除後に正しい記録を管理者が手動で作成
/*
INSERT INTO time_records (
    employee_id,
    record_date,
    clock_in_time,
    clock_out_time,
    status,
    work_hours,
    is_manual_entry,
    approved_by
) VALUES (
    '001',                          -- 社員ID
    CURRENT_DATE,                   -- 今日
    '2024-08-28 09:00:00+00',      -- 正しい出勤時刻
    '2024-08-28 18:00:00+00',      -- 正しい退勤時刻（NULLでも可）
    '通常',                         -- ステータス
    8.0,                           -- 勤務時間
    true,                          -- 手動入力フラグ
    auth.uid()                     -- 承認者（現在のユーザー）
);
*/

-- =================================
-- 4. 既存レコードの修正
-- =================================

-- 出勤時間のみ修正（退勤前の場合）
/*
UPDATE time_records 
SET 
    clock_in_time = '2024-08-28 09:00:00+00',  -- 正しい出勤時刻
    is_manual_entry = true,
    approved_by = auth.uid()
WHERE 
    employee_id = '001' 
    AND record_date = CURRENT_DATE;
*/

-- 退勤時間のみ修正
/*
UPDATE time_records 
SET 
    clock_out_time = '2024-08-28 18:00:00+00', -- 正しい退勤時刻
    work_hours = EXTRACT(EPOCH FROM (clock_out_time - clock_in_time)) / 3600,
    status = CASE 
        WHEN EXTRACT(EPOCH FROM (clock_out_time - clock_in_time)) / 3600 > 8 THEN '残業'
        ELSE '通常'
    END,
    is_manual_entry = true,
    approved_by = auth.uid()
WHERE 
    employee_id = '001' 
    AND record_date = CURRENT_DATE;
*/

-- =================================
-- 5. 一般的な間違いパターンの修正例
-- =================================

-- パターン1: 間違って出勤ボタンを押した後の修正
-- ステップ1: 間違った記録を削除
/*
DELETE FROM time_records 
WHERE 
    employee_id = '001' 
    AND record_date = CURRENT_DATE
    AND clock_out_time IS NULL  -- 退勤していない記録
    AND created_at > NOW() - INTERVAL '1 hour';  -- 1時間以内の記録
*/

-- ステップ2: 正しい出勤時刻で再作成
/*
INSERT INTO time_records (
    employee_id,
    record_date,
    clock_in_time,
    is_manual_entry,
    approved_by
) VALUES (
    '001',
    CURRENT_DATE,
    '2024-08-28 09:00:00+00',  -- 正しい出勤時刻
    true,
    auth.uid()
);
*/

-- パターン2: 出勤・退勤時刻両方とも間違った場合
/*
UPDATE time_records 
SET 
    clock_in_time = '2024-08-28 09:00:00+00',   -- 正しい出勤時刻
    clock_out_time = '2024-08-28 18:00:00+00',  -- 正しい退勤時刻
    work_hours = 8.0,
    status = '通常',
    is_manual_entry = true,
    approved_by = auth.uid()
WHERE 
    employee_id = '001' 
    AND record_date = CURRENT_DATE;
*/

-- =================================
-- 6. 修正の確認
-- =================================

-- 修正後の記録を確認
SELECT 
    '修正後の確認' as action,
    id,
    employee_id,
    record_date,
    clock_in_time,
    clock_out_time,
    status,
    work_hours,
    is_manual_entry,
    CASE WHEN is_manual_entry THEN '管理者修正済み' ELSE '自動記録' END as entry_type,
    approved_by,
    created_at,
    updated_at
FROM time_records 
WHERE 
    employee_id = '001'  -- 修正した社員ID
    AND record_date = CURRENT_DATE
ORDER BY updated_at DESC;

-- =================================
-- 7. 修正履歴の記録
-- =================================

-- 修正作業を監査ログに記録（自動的に記録されますが、追加の記録も可能）
/*
INSERT INTO audit_logs (
    table_name,
    record_id,
    action,
    new_values,
    user_id
) VALUES (
    'manual_correction',
    '001-' || CURRENT_DATE,
    'UPDATE',
    jsonb_build_object(
        'employee_id', '001',
        'date', CURRENT_DATE,
        'correction_type', '間違い打刻修正',
        'corrected_by', 'admin',
        'timestamp', NOW()
    ),
    auth.uid()
);
*/

-- 完了メッセージ
SELECT 
    '間違い打刻修正作業完了' as status,
    '修正内容が監査ログに記録されました' as note,
    NOW() as completion_time;

-- =================================
-- 使用方法ガイド
-- =================================

/*
【間違い打刻修正の手順】

1. 間違いの確認
   - 上記の「今日の打刻記録確認」クエリを実行
   - 間違った記録のIDと内容を確認

2. 修正方法の選択
   - 削除して再作成：完全に間違った記録の場合
   - 既存レコード修正：時刻のみ間違った場合

3. 修正の実行
   - 該当するパターンのSQLのコメントアウトを解除
   - 実際の値に置き換えて実行

4. 修正の確認
   - 「修正後の確認」クエリで結果を確認
   - is_manual_entryがtrueになっていることを確認

5. 従業員への連絡
   - 修正したことを従業員に連絡
   - 今後の注意事項を伝達

注意事項：
- このスクリプトは管理者権限が必要です
- 修正は慎重に行い、バックアップを取ることを推奨します
- 全ての修正は監査ログに自動記録されます
*/