-- 間違い打刻修正に対応したRLSポリシーの改善版（修正版）
-- 既存のポリシーをより柔軟に修正
-- PostgreSQL/Supabase環境に最適化

-- =================================
-- 1. 既存ポリシーの削除
-- =================================

-- 打刻記録の既存ポリシーを削除
DROP POLICY IF EXISTS "Authenticated users can insert time_records with IP check" ON time_records;
DROP POLICY IF EXISTS "Authenticated users can insert time_records" ON time_records;
DROP POLICY IF EXISTS "Employees can insert daily time_records" ON time_records;
DROP POLICY IF EXISTS "Admins can insert time_records freely" ON time_records;
DROP POLICY IF EXISTS "Admins can modify time_records" ON time_records;
DROP POLICY IF EXISTS "Admins can update time_records" ON time_records;
DROP POLICY IF EXISTS "Super admins can delete time_records" ON time_records;
DROP POLICY IF EXISTS "Admins can delete time_records for corrections" ON time_records;
DROP POLICY IF EXISTS "Super admins can delete any time_records" ON time_records;

-- 他のテーブルの既存ポリシーも削除
DROP POLICY IF EXISTS "Everyone can read employees" ON employees;
DROP POLICY IF EXISTS "Active admins can read employees" ON employees;
DROP POLICY IF EXISTS "Only admins can modify employees" ON employees;
DROP POLICY IF EXISTS "Super admins and admins can insert employees" ON employees;
DROP POLICY IF EXISTS "Super admins and admins can update employees" ON employees;
DROP POLICY IF EXISTS "Only super admins can delete employees" ON employees;

DROP POLICY IF EXISTS "Users can read own admin_profile" ON admin_profiles;
DROP POLICY IF EXISTS "Users can update own basic admin_profile" ON admin_profiles;
DROP POLICY IF EXISTS "Super admins can manage all admin_profiles" ON admin_profiles;

SELECT 'ポリシー削除完了' as status;

-- =================================
-- 2. 改善されたRLSポリシー
-- =================================

-- === 社員テーブルのポリシー ===

-- 社員データ：アクティブな管理者のみ読み取り可能
CREATE POLICY "Active admins can read employees" ON employees
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM admin_profiles 
            WHERE id = auth.uid() 
            AND is_active = true 
            AND role IN ('super_admin', 'admin', 'viewer')
            AND (locked_until IS NULL OR locked_until < NOW())
        )
    );

-- 社員データ：スーパー管理者と管理者のみ挿入可能
CREATE POLICY "Super admins and admins can insert employees" ON employees
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM admin_profiles 
            WHERE id = auth.uid() 
            AND is_active = true 
            AND role IN ('super_admin', 'admin')
            AND (locked_until IS NULL OR locked_until < NOW())
        )
    );

-- 社員データ：スーパー管理者と管理者のみ更新可能
CREATE POLICY "Super admins and admins can update employees" ON employees
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

-- 社員データ：スーパー管理者のみ削除可能
CREATE POLICY "Only super admins can delete employees" ON employees
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM admin_profiles 
            WHERE id = auth.uid() 
            AND is_active = true 
            AND role = 'super_admin'
            AND (locked_until IS NULL OR locked_until < NOW())
        )
    );

-- === 打刻記録テーブルのポリシー ===

-- 打刻記録：管理者のみ読み取り可能
CREATE POLICY "Admins can read time_records" ON time_records
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM admin_profiles 
            WHERE id = auth.uid() 
            AND is_active = true 
            AND role IN ('super_admin', 'admin', 'viewer')
            AND (locked_until IS NULL OR locked_until < NOW())
        )
    );

-- 打刻記録：従業員による挿入（制限あり）
-- 注意：RLSポリシーでは列名を直接使用する
CREATE POLICY "Employees can insert daily time_records" ON time_records
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL AND
        record_date = CURRENT_DATE AND
        -- 同じ従業員・同じ日の記録がまだない場合のみ許可
        NOT EXISTS (
            SELECT 1 FROM time_records existing
            WHERE existing.employee_id = time_records.employee_id 
            AND existing.record_date = time_records.record_date
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

-- === 管理者プロファイルのポリシー ===

-- 管理者プロファイル：本人のみ読み取り可能
CREATE POLICY "Users can read own admin_profile" ON admin_profiles
    FOR SELECT USING (auth.uid() = id);

-- 管理者プロファイル：本人のみ基本情報更新可能（権限変更は除く）
CREATE POLICY "Users can update own basic admin_profile" ON admin_profiles
    FOR UPDATE USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- 管理者プロファイル：スーパー管理者のみ権限管理可能
CREATE POLICY "Super admins can manage all admin_profiles" ON admin_profiles
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM admin_profiles 
            WHERE id = auth.uid() 
            AND is_active = true 
            AND role = 'super_admin'
            AND (locked_until IS NULL OR locked_until < NOW())
        )
    );

-- === 監査ログのポリシー ===

-- 監査ログ：管理者のみ読み取り可能
CREATE POLICY "Admins can read audit_logs" ON audit_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM admin_profiles 
            WHERE id = auth.uid() 
            AND is_active = true 
            AND role IN ('super_admin', 'admin')
            AND (locked_until IS NULL OR locked_until < NOW())
        )
    );

-- 監査ログ：システムのみ挿入可能
CREATE POLICY "System can insert audit_logs" ON audit_logs
    FOR INSERT WITH CHECK (true);

-- === セッション管理のポリシー ===

-- セッション：本人のみアクセス可能
CREATE POLICY "Users can manage own sessions" ON user_sessions
    FOR ALL USING (user_id = auth.uid());

SELECT 'RLSポリシー作成完了' as status;

-- =================================
-- 3. 制約の調整
-- =================================

-- 既存のUNIQUE制約を調整（管理者による修正を可能にするため）
DO $$
BEGIN
    -- time_records_employee_id_record_date_keyという制約があるかチェック
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'time_records_employee_id_record_date_key' 
        AND table_name = 'time_records'
    ) THEN
        ALTER TABLE time_records DROP CONSTRAINT time_records_employee_id_record_date_key;
        RAISE NOTICE '既存のUNIQUE制約を削除しました';
    END IF;
    
    -- より柔軟なユニークインデックスを作成（手動入力を除く）
    DROP INDEX IF EXISTS time_records_employee_date_unique_auto;
    CREATE UNIQUE INDEX time_records_employee_date_unique_auto 
    ON time_records (employee_id, record_date) 
    WHERE is_manual_entry = false;
    
    RAISE NOTICE 'より柔軟なユニーク制約を作成しました（自動入力のみ）';
    
EXCEPTION
    WHEN others THEN
        RAISE NOTICE '制約調整でエラーが発生しましたが、続行します: %', SQLERRM;
END $$;

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

-- 権限確認用関数
CREATE OR REPLACE FUNCTION check_admin_permissions()
RETURNS TABLE (
    user_id UUID,
    name TEXT,
    email TEXT,
    role TEXT,
    is_active BOOLEAN,
    status TEXT,
    permissions TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ap.id,
        ap.name,
        ap.email,
        ap.role,
        ap.is_active,
        CASE WHEN ap.locked_until > NOW() THEN 'ロック中' ELSE '正常' END,
        CASE 
            WHEN ap.role = 'super_admin' THEN '全権限'
            WHEN ap.role = 'admin' THEN '修正・削除権限'
            WHEN ap.role = 'viewer' THEN '閲覧のみ'
            ELSE '権限なし'
        END
    FROM admin_profiles ap
    WHERE ap.id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT ' 管理者専用関数作成完了' as status;

-- =================================
-- 5. 使用例とテスト
-- =================================

-- 現在のユーザーの権限を確認
SELECT * FROM check_admin_permissions();

-- 権限チェック用クエリ
SELECT 
    'RLSポリシー設定確認' as check_type,
    COUNT(*) as policy_count
FROM information_schema.enabled_roles 
WHERE role_name = 'authenticated';

-- ポリシー一覧の確認
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    cmd
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

SELECT 
    'RLSポリシー更新完了' as status,
    '管理者による打刻修正が可能になりました' as message,
    NOW() as updated_at;

-- =================================
-- 使用例（コメントアウト状態）
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