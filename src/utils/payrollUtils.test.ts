import {
  getClosingPeriod,
  getDefaultClosingMonth,
  shiftClosingMonth,
  getWeekdayJST,
  validatePayroll,
  buildPayrollCSV,
  EmployeeMaster,
} from './payrollUtils';
import { TimeRecordWithEmployee } from '../lib/adminSupabase';

// テスト用のレコード生成ヘルパー
const rec = (over: Partial<TimeRecordWithEmployee>): TimeRecordWithEmployee => ({
  id: 1,
  employee_id: '001',
  employee_name: '田中太郎',
  record_date: '2026-07-01',
  clock_in_time: '2026-07-01T00:00:00.000Z', // JST 09:00
  clock_out_time: '2026-07-01T08:00:00.000Z', // JST 17:00
  work_hours: 7,
  overtime_minutes: 0,
  status: '通常',
  is_direct_work: false,
  is_manual_entry: false,
  created_at: '',
  updated_at: '',
  ...over,
});

describe('getClosingPeriod（25日締め）', () => {
  it('7月締め = 6月26日〜7月25日', () => {
    const p = getClosingPeriod(2026, 7);
    expect(p.startDate).toBe('2026-06-26');
    expect(p.endDate).toBe('2026-07-25');
  });

  it('1月締めは前年12月26日開始（年跨ぎ）', () => {
    const p = getClosingPeriod(2026, 1);
    expect(p.startDate).toBe('2025-12-26');
    expect(p.endDate).toBe('2026-01-25');
  });
});

describe('getDefaultClosingMonth', () => {
  it('JSTで25日より後なら当月締め', () => {
    // 2026-07-26 21:00 JST
    expect(getDefaultClosingMonth(new Date('2026-07-26T12:00:00Z'))).toEqual({ year: 2026, month: 7 });
  });

  it('JSTで25日以前なら前月締め', () => {
    // 2026-07-10 21:00 JST
    expect(getDefaultClosingMonth(new Date('2026-07-10T12:00:00Z'))).toEqual({ year: 2026, month: 6 });
  });

  it('1月10日は前年12月締め', () => {
    expect(getDefaultClosingMonth(new Date('2026-01-10T12:00:00Z'))).toEqual({ year: 2025, month: 12 });
  });

  describe('JSTちょうど25日の境界（TZ非依存）', () => {
    it('JST 25日 0:00 ちょうど（UTC 24日15:00）は前月締め', () => {
      expect(getDefaultClosingMonth(new Date('2026-07-24T15:00:00Z'))).toEqual({ year: 2026, month: 6 });
    });

    it('JST 25日 23:59（UTC 25日14:59）はまだ前月締め', () => {
      expect(getDefaultClosingMonth(new Date('2026-07-25T14:59:59Z'))).toEqual({ year: 2026, month: 6 });
    });

    it('JST 26日 0:00 ちょうど（UTC 25日15:00）から当月締め', () => {
      expect(getDefaultClosingMonth(new Date('2026-07-25T15:00:00Z'))).toEqual({ year: 2026, month: 7 });
    });
  });
});

describe('shiftClosingMonth', () => {
  it('前後の締め月を正しく移動（年跨ぎ）', () => {
    expect(shiftClosingMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftClosingMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  });
});

describe('getWeekdayJST', () => {
  it('曜日を返す', () => {
    expect(getWeekdayJST('2026-07-01')).toBe('水');
  });
});

describe('validatePayroll（不備検出）', () => {
  const employees: EmployeeMaster[] = [
    { employee_id: '001', name: '田中太郎' },
    { employee_id: '002', name: '佐藤花子' },
  ];
  const period = getClosingPeriod(2026, 7);

  it('退勤打刻なしをエラー検出し、勤務時間に計上しない', () => {
    const report = validatePayroll(
      [rec({ employee_id: '001', clock_out_time: null, work_hours: 0 })],
      [{ employee_id: '001', name: '田中太郎' }],
      period
    );
    expect(report.errorCount).toBe(1);
    const t = report.employeeTotals.find((x) => x.employee_id === '001')!;
    expect(t.workDays).toBe(0);
    expect(t.openDays).toBe(1);
  });

  it('欠勤ステータスは打刻漏れエラーにせず、欠勤日数として集計する', () => {
    const report = validatePayroll(
      [rec({ status: '欠勤', clock_in_time: null, clock_out_time: null, work_hours: 0 })],
      [{ employee_id: '001', name: '田中太郎' }],
      period
    );
    expect(report.errorCount).toBe(0);
    expect(report.warningCount).toBe(0);
    const t = report.employeeTotals.find((x) => x.employee_id === '001')!;
    expect(t.absenceDays).toBe(1);
    expect(t.workDays).toBe(0);
    expect(t.openDays).toBe(0);
  });

  it('出勤打刻なしをエラー検出', () => {
    const report = validatePayroll(
      [rec({ clock_in_time: null })],
      [{ employee_id: '001', name: '田中太郎' }],
      period
    );
    expect(report.errorCount).toBe(1);
  });

  it('設定エラーのステータスを検出', () => {
    const report = validatePayroll(
      [rec({ status: '設定エラー' })],
      [{ employee_id: '001', name: '田中太郎' }],
      period
    );
    expect(report.errorCount).toBe(1);
  });

  it('期間内に記録が無い社員を警告検出', () => {
    // 001 のみ記録、002 は記録なし
    const report = validatePayroll([rec({ employee_id: '001' })], employees, period);
    const noRecord = report.issues.find((i) => i.employee_id === '002');
    expect(noRecord).toBeDefined();
    expect(noRecord!.severity).toBe('warning');
  });

  it('正常な記録は不備0件・勤務時間を集計', () => {
    const report = validatePayroll(
      [rec({ employee_id: '001', work_hours: 7, overtime_minutes: 30 })],
      [{ employee_id: '001', name: '田中太郎' }],
      period
    );
    expect(report.errorCount).toBe(0);
    expect(report.warningCount).toBe(0);
    const t = report.employeeTotals[0];
    expect(t.workDays).toBe(1);
    expect(t.totalWorkHours).toBe(7);
    expect(t.totalOvertimeMinutes).toBe(30);
  });

  it('出勤・退勤ありで勤務時間0は警告', () => {
    const report = validatePayroll(
      [rec({ work_hours: 0 })],
      [{ employee_id: '001', name: '田中太郎' }],
      period
    );
    expect(report.errorCount).toBe(0);
    expect(report.warningCount).toBe(1);
    expect(report.issues[0].message).toContain('勤務時間が0です');
  });

  it('勤務時間16時間超は警告（打刻漏れの可能性）', () => {
    const report = validatePayroll(
      [rec({ work_hours: 17, clock_out_time: '2026-07-01T18:00:00.000Z' })],
      [{ employee_id: '001', name: '田中太郎' }],
      period
    );
    expect(report.warningCount).toBe(1);
    expect(report.issues[0].message).toContain('勤務時間が長すぎます');
  });

  it('同一日重複は全行に警告（文言に集計除外の旨）し、2件目以降を集計から除外', () => {
    const report = validatePayroll(
      [
        rec({ id: 1, record_date: '2026-07-01', work_hours: 7, overtime_minutes: 30 }),
        rec({ id: 2, record_date: '2026-07-01', work_hours: 5, overtime_minutes: 60 }),
      ],
      [{ employee_id: '001', name: '田中太郎' }],
      period
    );
    // 重複警告は両方の行に出る
    const dupIssues = report.issues.filter((i) => i.message.includes('同一日に複数の記録'));
    expect(dupIssues).toHaveLength(2);
    dupIssues.forEach((i) => expect(i.message).toContain('集計から除外'));
    // 集計は1件目のみ（workDays・勤務時間・残業とも2件目を含まない）
    const t = report.employeeTotals.find((x) => x.employee_id === '001')!;
    expect(t.workDays).toBe(1);
    expect(t.totalWorkHours).toBe(7);
    expect(t.totalOvertimeMinutes).toBe(30);
  });

  it('未退勤行の overtime_minutes は合計残業へ加算しない', () => {
    const report = validatePayroll(
      [
        rec({ id: 1, record_date: '2026-07-01', overtime_minutes: 30 }),
        rec({ id: 2, record_date: '2026-07-02', clock_out_time: null, work_hours: 0, overtime_minutes: 45 }),
      ],
      [{ employee_id: '001', name: '田中太郎' }],
      period
    );
    const t = report.employeeTotals.find((x) => x.employee_id === '001')!;
    // 未退勤行（エラー扱い）の45分は混入させない
    expect(t.totalOvertimeMinutes).toBe(30);
    expect(t.openDays).toBe(1);
  });

  it('設定エラー行の overtime_minutes は合計残業へ加算しない', () => {
    const report = validatePayroll(
      [
        rec({ id: 1, record_date: '2026-07-01', overtime_minutes: 30 }),
        rec({ id: 2, record_date: '2026-07-02', status: '設定エラー', work_hours: 0, overtime_minutes: 999 }),
      ],
      [{ employee_id: '001', name: '田中太郎' }],
      period
    );
    expect(report.errorCount).toBe(1); // 設定エラーの検出は維持
    const t = report.employeeTotals.find((x) => x.employee_id === '001')!;
    expect(t.totalOvertimeMinutes).toBe(30);
  });
});

describe('buildPayrollCSV', () => {
  const period = getClosingPeriod(2026, 7);

  it('明細・社員別集計・不備一覧の3ブロックを出力する', () => {
    const report = validatePayroll(
      [
        rec({ employee_id: '001', record_date: '2026-07-01', work_hours: 7 }),
        rec({ id: 2, employee_id: '002', employee_name: '佐藤花子', record_date: '2026-07-02', clock_out_time: null, work_hours: 0 }),
      ],
      [
        { employee_id: '001', name: '田中太郎' },
        { employee_id: '002', name: '佐藤花子' },
      ],
      period
    );
    const csv = buildPayrollCSV(report);

    expect(csv).toContain('【明細】');
    expect(csv).toContain('【社員別集計】');
    expect(csv).toContain('【不備一覧】給与計算の前に確認・修正してください');
    // 対象期間ラベル
    expect(csv).toContain('2026年6月26日 〜 2026年7月25日');
    // 出勤時刻がJST 09:00で出る（UTC 00:00 → JST 09:00、タイムゾーン非依存）
    expect(csv).toContain('09:00');
    // 退勤なしの不備が出力される
    expect(csv).toContain('退勤打刻がありません（未退勤・勤務時間を計上できません）');
  });

  it('不備が無い場合は「不備はありません」を出力', () => {
    const report = validatePayroll(
      [rec({ employee_id: '001', work_hours: 7 })],
      [{ employee_id: '001', name: '田中太郎' }],
      period
    );
    const csv = buildPayrollCSV(report);
    expect(csv).toContain('不備はありません');
  });
});
