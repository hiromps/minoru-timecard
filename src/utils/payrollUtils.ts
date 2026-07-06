/**
 * 給与計算用ユーティリティ
 *
 * 給与の締め日は毎月25日。したがって給与データの対象期間は
 * 「前月26日 〜 当月25日」となる（例: 7月締め = 6月26日〜7月25日）。
 *
 * 本モジュールは、
 *  - 締め期間の算出（getClosingPeriod / getDefaultClosingMonth / shiftClosingMonth）
 *  - 給与計算のための不備検出（validatePayroll）
 *  - 給与向けCSVの生成（buildPayrollCSV）
 * を提供する。時刻・勤務時間の扱いはブラウザのタイムゾーンに依存しない（JST基準）。
 */

import { TimeRecordWithEmployee } from '../lib/adminSupabase';
import { getJSTDateTimeLocal } from './dateUtils';
import { formatWorkHoursForCSV, formatMinutesForCSV } from './timeUtils';

const pad2 = (n: number): string => String(n).padStart(2, '0');
const WEEKDAY_JP = ['日', '月', '火', '水', '木', '金', '土'];

export interface EmployeeMaster {
  employee_id: string;
  name: string;
}

export interface ClosingPeriod {
  /** 期間開始日（前月26日）YYYY-MM-DD */
  startDate: string;
  /** 期間終了日（当月25日）YYYY-MM-DD */
  endDate: string;
  /** 締め月の年 */
  closingYear: number;
  /** 締め月（25日を含む月, 1-12） */
  closingMonth: number;
  /** 表示用ラベル */
  label: string;
}

/**
 * 締め月（25日を含む月）から給与対象期間 [前月26日, 当月25日] を算出する。
 * @param closingYear 締め月の年
 * @param closingMonth 締め月（1-12）
 */
export const getClosingPeriod = (closingYear: number, closingMonth: number): ClosingPeriod => {
  const endDate = `${closingYear}-${pad2(closingMonth)}-25`;

  // 前月26日
  let sy = closingYear;
  let sm = closingMonth - 1;
  if (sm < 1) {
    sm = 12;
    sy -= 1;
  }
  const startDate = `${sy}-${pad2(sm)}-26`;

  const label = `${sy}年${sm}月26日 〜 ${closingYear}年${closingMonth}月25日`;

  return { startDate, endDate, closingYear, closingMonth, label };
};

/**
 * 既定の締め月を返す。JST基準の今日が25日より後なら当月、25日以前なら前月。
 * （25日締め直後に前回の締め期間を出力する運用を想定）
 */
export const getDefaultClosingMonth = (today: Date = new Date()): { year: number; month: number } => {
  const jst = new Date(today.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth() + 1;
  const d = jst.getUTCDate();

  if (d > 25) {
    return { year: y, month: m };
  }
  let py = y;
  let pm = m - 1;
  if (pm < 1) {
    pm = 12;
    py -= 1;
  }
  return { year: py, month: pm };
};

/** 締め月を delta か月ずらす */
export const shiftClosingMonth = (
  year: number,
  month: number,
  delta: number
): { year: number; month: number } => {
  // 0-basedの月インデックスで計算
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
};

/** 'YYYY-MM-DD' から日本語曜日を返す（タイムゾーン非依存） */
export const getWeekdayJST = (dateStr: string): string => {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return '';
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return WEEKDAY_JP[wd];
};

/** UTCのISO文字列を JST の "HH:MM" に変換（タイムゾーン非依存）。空なら '' */
export const formatClockTimeJST = (iso: string | null): string => {
  const local = getJSTDateTimeLocal(iso); // 'YYYY-MM-DDTHH:MM' or ''
  return local ? local.slice(11) : '';
};

export type IssueSeverity = 'error' | 'warning';

export interface PayrollIssue {
  employee_id: string;
  employee_name: string;
  /** レコード単位の不備は日付、社員単位の不備は '' */
  date: string;
  severity: IssueSeverity;
  message: string;
}

export interface PayrollRow {
  record: TimeRecordWithEmployee;
  weekday: string;
  /** この行に紐づく不備メッセージ */
  issues: string[];
}

export interface EmployeeTotal {
  employee_id: string;
  employee_name: string;
  /** 出勤・退勤がそろった勤務日数 */
  workDays: number;
  /** 未退勤（退勤打刻なし）の日数 */
  openDays: number;
  /** 合計勤務時間（時, 小数） */
  totalWorkHours: number;
  /** 合計残業（分） */
  totalOvertimeMinutes: number;
  lateCount: number;
  earlyLeaveCount: number;
  /** この社員に紐づく不備件数 */
  issueCount: number;
}

export interface PayrollReport {
  period: ClosingPeriod;
  rows: PayrollRow[];
  employeeTotals: EmployeeTotal[];
  issues: PayrollIssue[];
  errorCount: number;
  warningCount: number;
  /** 対象レコード件数 */
  recordCount: number;
}

/**
 * 給与計算のためにレコードを検証し、明細・社員別集計・不備一覧を作成する。
 *
 * @param records 対象期間で絞り込み済みの打刻記録
 * @param employees 社員マスタ（期間内に記録が無い社員の検出に使用）
 * @param period 対象の締め期間
 */
export const validatePayroll = (
  records: TimeRecordWithEmployee[],
  employees: EmployeeMaster[],
  period: ClosingPeriod
): PayrollReport => {
  // 社員ID→氏名（マスタ優先）
  const nameMap = new Map<string, string>();
  employees.forEach((e) => nameMap.set(e.employee_id, e.name));

  // 明細を社員ID・日付昇順に並べる
  const sorted = [...records].sort((a, b) => {
    if (a.employee_id !== b.employee_id) return a.employee_id.localeCompare(b.employee_id);
    return a.record_date.localeCompare(b.record_date);
  });

  // 同一社員・同一日の重複検出用
  const dayCount = new Map<string, number>();
  sorted.forEach((r) => {
    const key = `${r.employee_id}__${r.record_date}`;
    dayCount.set(key, (dayCount.get(key) || 0) + 1);
  });

  const issues: PayrollIssue[] = [];
  const rows: PayrollRow[] = [];

  // 社員別集計の初期化（マスタ社員＋記録に出現した社員）
  const totals = new Map<string, EmployeeTotal>();
  const ensureTotal = (employee_id: string, employee_name: string): EmployeeTotal => {
    let t = totals.get(employee_id);
    if (!t) {
      t = {
        employee_id,
        employee_name,
        workDays: 0,
        openDays: 0,
        totalWorkHours: 0,
        totalOvertimeMinutes: 0,
        lateCount: 0,
        earlyLeaveCount: 0,
        issueCount: 0,
      };
      totals.set(employee_id, t);
    }
    return t;
  };
  // 勤務時間は分で積算し最後に一度だけ丸める（日次丸め誤差の回避）
  const totalMinutesMap = new Map<string, number>();

  for (const record of sorted) {
    const employee_name = record.employee_name || nameMap.get(record.employee_id) || `社員${record.employee_id}`;
    const t = ensureTotal(record.employee_id, employee_name);
    const rowIssues: string[] = [];

    const hasIn = !!record.clock_in_time;
    const hasOut = !!record.clock_out_time;
    const workHours = record.work_hours || 0;

    const addIssue = (severity: IssueSeverity, message: string) => {
      rowIssues.push(message);
      issues.push({
        employee_id: record.employee_id,
        employee_name,
        date: record.record_date,
        severity,
        message,
      });
      t.issueCount += 1;
    };

    // --- 不備検出 ---
    if (!hasIn && !hasOut) {
      addIssue('error', '出勤・退勤ともに打刻がありません');
    } else if (!hasIn && hasOut) {
      addIssue('error', '出勤打刻がありません（勤務時間を正しく計上できません）');
    } else if (hasIn && !hasOut) {
      addIssue('error', '退勤打刻がありません（未退勤・勤務時間を計上できません）');
    }

    if (record.status === '設定エラー') {
      addIssue('error', 'ステータスが「設定エラー」です（勤務時間の再計算・記録の修正が必要）');
    }

    if (hasIn && hasOut && workHours <= 0) {
      addIssue('warning', '勤務時間が0です（打刻内容を確認してください）');
    }

    if (workHours > 16) {
      addIssue('warning', `勤務時間が長すぎます（${workHours.toFixed(1)}時間・打刻漏れの可能性）`);
    }

    if ((dayCount.get(`${record.employee_id}__${record.record_date}`) || 0) > 1) {
      addIssue('warning', '同一日に複数の記録があります（重複の可能性）');
    }

    // --- 集計 ---
    if (hasIn && hasOut) {
      t.workDays += 1;
      totalMinutesMap.set(
        record.employee_id,
        (totalMinutesMap.get(record.employee_id) || 0) + Math.round(workHours * 60)
      );
    } else if (hasIn && !hasOut) {
      t.openDays += 1;
    }
    t.totalOvertimeMinutes += record.overtime_minutes || 0;
    if (record.status.includes('遅刻')) t.lateCount += 1;
    if (record.status.includes('早退')) t.earlyLeaveCount += 1;

    rows.push({ record, weekday: getWeekdayJST(record.record_date), issues: rowIssues });
  }

  // 分→時間の確定
  totals.forEach((t) => {
    const mins = totalMinutesMap.get(t.employee_id) || 0;
    t.totalWorkHours = Math.round((mins / 60) * 100) / 100;
  });

  // マスタに存在するのに期間内に記録が無い社員を検出（欠勤 or 打刻漏れ）
  const seenEmployeeIds = new Set(sorted.map((r) => r.employee_id));
  employees.forEach((e) => {
    if (!seenEmployeeIds.has(e.employee_id)) {
      issues.push({
        employee_id: e.employee_id,
        employee_name: e.name,
        date: '',
        severity: 'warning',
        message: '対象期間内に打刻記録がありません（欠勤または打刻漏れの可能性）',
      });
    }
  });

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;

  // 社員別集計は社員ID順で返す
  const employeeTotals = Array.from(totals.values()).sort((a, b) =>
    a.employee_id.localeCompare(b.employee_id)
  );

  return {
    period,
    rows,
    employeeTotals,
    issues,
    errorCount,
    warningCount,
    recordCount: records.length,
  };
};

/** CSVの1セルをエスケープ（カンマ・改行・引用符対応） */
const csvCell = (value: string | number | null | undefined): string => {
  const s = value == null ? '' : String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

const csvRow = (cells: (string | number | null | undefined)[]): string =>
  cells.map(csvCell).join(',');

/** 勤務時間（時, 小数2桁）— 給与計算での掛け算用 */
const decimalHours = (hours: number): string => (Math.round((hours || 0) * 100) / 100).toFixed(2);

/**
 * 給与向けCSV文字列を生成する（BOMは呼び出し側で付与）。
 * 明細 / 社員別集計 / 不備一覧 の3ブロックを1ファイルに出力する。
 */
export const buildPayrollCSV = (report: PayrollReport): string => {
  const lines: string[] = [];

  lines.push(`■ 給与データ（25日締め）`);
  lines.push(`対象期間,${report.period.label}`);
  lines.push(
    `対象件数,${report.recordCount}件,不備(エラー),${report.errorCount}件,不備(警告),${report.warningCount}件`
  );
  lines.push('');

  // --- 明細 ---
  lines.push('【明細】');
  lines.push(
    csvRow([
      '日付', '曜日', '社員ID', '社員名', '出勤', '退勤',
      '勤務時間', '勤務時間(時)', '残業', '残業(分)',
      'ステータス', '直行直帰', '手動入力', '不備', '修正理由',
    ])
  );
  report.rows.forEach(({ record, weekday, issues }) => {
    lines.push(
      csvRow([
        record.record_date,
        weekday,
        record.employee_id,
        record.employee_name || '',
        formatClockTimeJST(record.clock_in_time),
        formatClockTimeJST(record.clock_out_time),
        formatWorkHoursForCSV(record.work_hours || 0),
        decimalHours(record.work_hours || 0),
        formatMinutesForCSV(record.overtime_minutes || 0),
        record.overtime_minutes || 0,
        record.status,
        record.is_direct_work ? '直行直帰' : '',
        record.is_manual_entry ? '手動' : '',
        issues.join(' / '),
        record.correction_reason || '',
      ])
    );
  });
  lines.push('');

  // --- 社員別集計 ---
  lines.push('【社員別集計】');
  lines.push(
    csvRow([
      '社員ID', '社員名', '勤務日数', '未退勤',
      '合計勤務時間', '合計勤務時間(時)', '合計残業', '合計残業(分)',
      '遅刻', '早退', '不備件数',
    ])
  );
  report.employeeTotals.forEach((t) => {
    lines.push(
      csvRow([
        t.employee_id,
        t.employee_name,
        t.workDays,
        t.openDays,
        formatWorkHoursForCSV(t.totalWorkHours),
        decimalHours(t.totalWorkHours),
        formatMinutesForCSV(t.totalOvertimeMinutes),
        t.totalOvertimeMinutes,
        t.lateCount,
        t.earlyLeaveCount,
        t.issueCount,
      ])
    );
  });
  lines.push('');

  // --- 不備一覧 ---
  lines.push('【不備一覧】給与計算の前に確認・修正してください');
  if (report.issues.length === 0) {
    lines.push('不備はありません');
  } else {
    lines.push(csvRow(['重要度', '社員ID', '社員名', '日付', '内容']));
    // エラーを先に、次に警告
    const ordered = [...report.issues].sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1;
      if (a.employee_id !== b.employee_id) return a.employee_id.localeCompare(b.employee_id);
      return a.date.localeCompare(b.date);
    });
    ordered.forEach((i) => {
      lines.push(
        csvRow([i.severity === 'error' ? 'エラー' : '警告', i.employee_id, i.employee_name, i.date, i.message])
      );
    });
  }

  return lines.join('\n');
};
