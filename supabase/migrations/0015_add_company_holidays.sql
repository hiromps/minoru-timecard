-- 2026-09-28 適用（SQL Editor で手動実行）
-- 会社休日カレンダー（company_holidays）を追加し、2026年分を登録する。
--
-- 出典: 総務の「2026ミノル化学カレンダー.xlsx」
--   （赤字 = 会社休日 / 赤丸 = 国民の祝日 / 青丸 = 8月有給）
--   2026年: 年間出勤日数 237日 / 休日 128日（= 土日 104日 + 本テーブルの平日休日 24日）
--
-- 方針:
-- - 土日は常に休日としてコード側で判定する（本テーブルには登録しない）。
-- - 本テーブルには「平日（月〜金）の休日」のみを登録する。
-- - kind: national = 国民の祝日 / company = 会社独自の休日（年末年始・夏季休暇）
--         planned_leave = 計画有給（全社一斉の有給取得日）
-- - 利用箇所: Edge Function payroll-check-notify の「出勤日の打刻漏れ」検出で休日を除外する。
-- - 翌年以降は、会社カレンダー確定後に同じ形式で INSERT を追加する。

CREATE TABLE IF NOT EXISTS public.company_holidays (
    holiday_date date PRIMARY KEY,
    name text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('national', 'company', 'planned_leave')),
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_holidays ENABLE ROW LEVEL SECURITY;

-- 公開読み取り（打刻画面・管理画面から参照可能）/ 書き込みは管理者のみ
CREATE POLICY "public_company_holidays_read" ON public.company_holidays
    FOR SELECT USING (true);
CREATE POLICY "admin_company_holidays_write" ON public.company_holidays
    FOR ALL USING (
        (select auth.uid()) IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.admin_profiles
            WHERE id = (select auth.uid()) AND is_active = true
        )
    ) WITH CHECK (
        (select auth.uid()) IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.admin_profiles
            WHERE id = (select auth.uid()) AND is_active = true
        )
    );

INSERT INTO public.company_holidays (holiday_date, name, kind) VALUES
    ('2026-01-01', '元日', 'national'),
    ('2026-01-02', '年始休暇', 'company'),
    ('2026-01-12', '成人の日', 'national'),
    ('2026-02-11', '建国記念の日', 'national'),
    ('2026-02-23', '天皇誕生日', 'national'),
    ('2026-03-20', '春分の日', 'national'),
    ('2026-04-29', '昭和の日', 'national'),
    ('2026-05-04', 'みどりの日', 'national'),
    ('2026-05-05', 'こどもの日', 'national'),
    ('2026-05-06', '振替休日', 'national'),
    ('2026-07-20', '海の日', 'national'),
    ('2026-08-11', '山の日', 'national'),
    ('2026-08-12', '夏季休暇（計画有給）', 'planned_leave'),
    ('2026-08-13', '夏季休暇', 'company'),
    ('2026-08-14', '夏季休暇', 'company'),
    ('2026-09-21', '敬老の日', 'national'),
    ('2026-09-22', '国民の休日', 'national'),
    ('2026-09-23', '秋分の日', 'national'),
    ('2026-10-12', 'スポーツの日', 'national'),
    ('2026-11-03', '文化の日', 'national'),
    ('2026-11-23', '勤労感謝の日', 'national'),
    ('2026-12-29', '年末休暇', 'company'),
    ('2026-12-30', '年末休暇', 'company'),
    ('2026-12-31', '年末休暇', 'company')
ON CONFLICT (holiday_date) DO NOTHING;
