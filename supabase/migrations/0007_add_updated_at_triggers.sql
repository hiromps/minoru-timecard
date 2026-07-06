-- 2026-07-06 適用
-- updated_at をレコード更新時に自動反映するトリガーを設置。
-- 既存の update_updated_at_column() 関数を利用（実 DB にはトリガーが未設置だった）。
DROP TRIGGER IF EXISTS trg_employees_updated_at ON public.employees;
CREATE TRIGGER trg_employees_updated_at BEFORE UPDATE ON public.employees
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_time_records_updated_at ON public.time_records;
CREATE TRIGGER trg_time_records_updated_at BEFORE UPDATE ON public.time_records
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_admin_profiles_updated_at ON public.admin_profiles;
CREATE TRIGGER trg_admin_profiles_updated_at BEFORE UPDATE ON public.admin_profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
