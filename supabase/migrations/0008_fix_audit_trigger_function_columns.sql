-- 2026-07-06 適用
-- 壊れていた監査トリガー関数の列名を実テーブルに合わせて修正
-- （old_data / new_data -> old_values / new_values、record_id も補完）。
-- ※ トリガーは設置しない（挙動は変えず、将来の監査自動化に備えた関数のみの修正）。
CREATE OR REPLACE FUNCTION public.audit_trigger_function()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    INSERT INTO public.audit_logs (
        table_name, record_id, action, old_values, new_values, user_id, created_at
    )
    VALUES (
        TG_TABLE_NAME,
        CASE WHEN TG_OP = 'DELETE' THEN (OLD.id)::text ELSE (NEW.id)::text END,
        TG_OP,
        CASE WHEN TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN row_to_json(OLD)::jsonb ELSE NULL END,
        CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN row_to_json(NEW)::jsonb ELSE NULL END,
        auth.uid(),
        NOW()
    );
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$function$;
