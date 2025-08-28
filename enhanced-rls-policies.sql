-- 間違い打刻修正に対応したRLSポリシーの改善版
-- 既存のポリシーをより柔軟に修正

-- =================================
-- 1. 既存ポリシーの削除
-- =================================

-- 打刻記録の既存ポリシーを削除
DROP POLICY IF EXISTS "Authenticated users can insert time_records with IP check" ON time_records;
DROP POLICY IF EXISTS "Authenticated users can insert time_records" ON time_records;
DROP POLICY IF EXISTS "Admins can modify time_records" ON time_records;
DROP POLICY IF EXISTS "Super admins can delete time_records" ON time_records;

-- =================================
-- 2. 改善されたRLSポリシー
-- =================================

-- 打刻記録：従業員による挿入（制限あり）
CREATE POLICY "Employees can insert daily time_records" ON time_records
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL AND
        record_date = CURRENT_DATE AND
        -- 同じ従業員・同じ日の記録がまだない場合のみ許可
        NOT EXISTS (
            SELECT 1 FROM time_records 
            WHERE employee_id = NEW.employee_id 
            AND record_date = NEW.record_date
        )
    );

-- 打刻記録：管理者による自由な挿入（手動入力用）
CREATE POLICY "Admins can insert time_records freely" ON time_records
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM admin_profiles 
            WHERE id = auth.uid() 
            AND is_active = true 
            AND role IN ('super_admin', 'admin')
            AND (locked_until IS NULL OR locked_until < NOW())
        )
    );

-- 打刻記録：管理者による更新（時刻修正用）
CREATE POLICY "Admins can update time_records" ON time_records
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM admin_profiles 
            WHERE id = auth.uid() 
            AND is_active = true 
            AND role IN ('super_admin', 'admin')
            AND (locked_until IS NULL OR locked_until < NOW())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM admin_profiles 
            WHERE id = auth.uid() 
            AND is_active = true 
            AND role IN ('super_admin', 'admin')
            AND (locked_until IS NULL OR locked_until < NOW())
        )
    );

-- 打刻記録：管理者による削除（間違い修正用）
CREATE POLICY "Admins can delete time_records for corrections" ON time_records
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM admin_profiles 
            WHERE id = auth.uid() 
            AND is_active = true 
            AND role IN ('super_admin', 'admin')
            AND (locked_until IS NULL OR locked_until < NOW())
        )
    );

-- 打刻記録：スーパー管理者による完全削除
CREATE POLICY "Super admins can delete any time_records" ON time_records
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM admin_profiles 
            WHERE id = auth.uid() 
            AND is_active = true 
            AND role = 'super_admin'
            AND (locked_until IS NULL OR locked_until < NOW())
        )
    );

-- =================================
-- 3. 制約の調整
-- =================================

-- 既存のUNIQUE制約を一時的に削除（管理者による修正を可能にするため）
ALTER TABLE time_records DROP CONSTRAINT IF EXISTS time_records_employee_id_record_date_key;

-- より柔軟な制約に変更（同じ日に複数レコードは基本的に不可、ただし管理者修正は例外）
-- 注意：この制約はアプリケーション側で制御し、データベース制約はより緩くする
-- CREATE UNIQUE INDEX time_records_employee_date_unique 
-- ON time_records (employee_id, record_date) 
-- WHERE NOT is_manual_entry;

-- =================================
-- 4. 管理者専用関数の作成
-- =================================

-- 打刻記録の安全な削除（管理者専用）
CREATE OR REPLACE FUNCTION admin_delete_time_record(
    target_employee_id TEXT,
    target_date DATE,
    reason TEXT DEFAULT '管理者による修正'
)
RETURNS BOOLEAN AS $$
DECLARE
    admin_check BOOLEAN;
    deleted_count INTEGER;
BEGIN
    -- 管理者権限チェック
    SELECT EXISTS (
        SELECT 1 FROM admin_profiles 
        WHERE id = auth.uid() 
        AND is_active = true 
        AND role IN ('super_admin', 'admin')
        AND (locked_until IS NULL OR locked_until < NOW())
    ) INTO admin_check;
    
    IF NOT admin_check THEN
        RAISE EXCEPTION '管理者権限が必要です';
    END IF;
    
    -- 記録を削除
    DELETE FROM time_records 
    WHERE employee_id = target_employee_id 
    AND record_date = target_date;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- 監査ログに記録
    INSERT INTO audit_logs (
        table_name,
        record_id,
        action,
        new_values,
        user_id
    ) VALUES (
        'admin_correction',
        target_employee_id || '-' || target_date,
        'DELETE',
        jsonb_build_object(
            'employee_id', target_employee_id,
            'date', target_date,
            'reason', reason,
            'deleted_records', deleted_count,
            'admin_action', true
        ),
        auth.uid()
    );
    
    RETURN deleted_count > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 打刻記録の手動作成（管理者専用）
CREATE OR REPLACE FUNCTION admin_create_time_record(
    target_employee_id TEXT,
    target_date DATE,
    clock_in_time TIMESTAMPTZ DEFAULT NULL,
    clock_out_time TIMESTAMPTZ DEFAULT NULL,
    reason TEXT DEFAULT '管理者による手動入力'
)
RETURNS BIGINT AS $$
DECLARE
    admin_check BOOLEAN;
    new_record_id BIGINT;
    calculated_hours DECIMAL(4,2);
    record_status TEXT;
BEGIN
    -- 管理者権限チェック
    SELECT EXISTS (
        SELECT 1 FROM admin_profiles 
        WHERE id = auth.uid() 
        AND is_active = true 
        AND role IN ('super_admin', 'admin')
        AND (locked_until IS NULL OR locked_until < NOW())
    ) INTO admin_check;
    
    IF NOT admin_check THEN
        RAISE EXCEPTION '管理者権限が必要です';
    END IF;
    
    -- 勤務時間とステータスの計算
    IF clock_in_time IS NOT NULL AND clock_out_time IS NOT NULL THEN
        calculated_hours := EXTRACT(EPOCH FROM (clock_out_time - clock_in_time)) / 3600;
        record_status := CASE 
            WHEN calculated_hours > 8 THEN '残業'
            ELSE '通常'
        END;
    ELSE
        calculated_hours := 0;
        record_status := '通常';
    END IF;
    
    -- 記録を挿入
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
        target_employee_id,
        target_date,
        clock_in_time,
        clock_out_time,
        record_status,
        calculated_hours,
        true,
        auth.uid()
    ) RETURNING id INTO new_record_id;
    
    -- 監査ログに記録
    INSERT INTO audit_logs (
        table_name,
        record_id,
        action,
        new_values,
        user_id
    ) VALUES (
        'admin_correction',
        target_employee_id || '-' || target_date,
        'INSERT',
        jsonb_build_object(
            'employee_id', target_employee_id,
            'date', target_date,
            'clock_in_time', clock_in_time,
            'clock_out_time', clock_out_time,
            'reason', reason,
            'record_id', new_record_id,
            'admin_action', true
        ),
        auth.uid()
    );
    
    RETURN new_record_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =================================
-- 5. 使用例
-- =================================

-- 間違った打刻の削除例
/*
SELECT admin_delete_time_record('001', CURRENT_DATE, '間違って出勤ボタンを押したため削除');
*/

-- 正しい打刻記録の作成例
/*
SELECT admin_create_time_record(
    '001', 
    CURRENT_DATE, 
    '2024-08-28 09:00:00+00'::TIMESTAMPTZ, 
    '2024-08-28 18:00:00+00'::TIMESTAMPTZ,
    '間違い修正による正しい記録の作成'
);
*/

-- 出勤のみの記録作成例（退勤時刻は後で更新）
/*
SELECT admin_create_time_record(
    '001', 
    CURRENT_DATE, 
    '2024-08-28 09:00:00+00'::TIMESTAMPTZ, 
    NULL,
    '正しい出勤時刻での記録作成'
);
*/

-- =================================
-- 6. 権限確認クエリ
-- =================================

-- 現在のユーザーの管理者権限を確認
SELECT 
    '現在のユーザー権限確認' as check_type,
    ap.name,
    ap.email,
    ap.role,
    ap.is_active,
    CASE WHEN ap.locked_until > NOW() THEN 'ロック中' ELSE '正常' END as status,
    CASE 
        WHEN ap.role = 'super_admin' THEN '全権限'
        WHEN ap.role = 'admin' THEN '修正・削除権限'
        WHEN ap.role = 'viewer' THEN '閲覧のみ'
        ELSE '権限なし'
    END as available_permissions
FROM admin_profiles ap
WHERE ap.id = auth.uid();

SELECT 
    'RLSポリシー更新完了' as status,
    '管理者による打刻修正が可能になりました' as message,
    NOW() as updated_at;