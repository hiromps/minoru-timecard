/**
 * 残業判定ロジック
 * 
 * 業務仕様に基づく就業規則対応の残業計算
 * このファイルの仕様は確定仕様であり、変更禁止
 */

// 始業時刻（固定）
const START_TIME_HOUR = 9;
const START_TIME_MINUTE = 0;
const START_TIME_MINUTES = START_TIME_HOUR * 60 + START_TIME_MINUTE; // 540分

// 社員別所定退勤時刻（確定）
const EMPLOYEE_REGULAR_END_TIMES: Record<string, number> = {
  '大﨑 香奈子': 16 * 60,  // 16:00 = 960分
  '小齊平 千明': 15 * 60,  // 15:00 = 900分
};
const DEFAULT_REGULAR_END_MINUTES = 17 * 60; // 17:00 = 1020分

/**
 * 勤怠計算結果
 */
export interface AttendanceResult {
  /** 計算用出勤時刻（分） */
  workStartMinutes: number;
  /** 計算用出勤時刻（HH:mm形式） */
  workStartTime: string;
  /** 社員別所定退勤時刻（分） */
  regularEndMinutes: number;
  /** 社員別所定退勤時刻（HH:mm形式） */
  regularEndTime: string;
  /** 実労働分 */
  workMinutes: number;
  /** 実労働時間（HH:mm形式） */
  workTimeFormatted: string;
  /** 残業分 */
  overtimeMinutes: number;
  /** 残業時間（HH:mm形式） */
  overtimeFormatted: string;
}

/**
 * HH:mm形式の時刻を分に変換
 * @param timeStr HH:mm形式の時刻文字列
 * @returns 分単位の時刻（0:00 = 0）
 */
export const timeToMinutes = (timeStr: string): number => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};

/**
 * 分を HH:mm形式に変換
 * @param minutes 分単位の時刻
 * @returns HH:mm形式の文字列
 */
export const minutesToTime = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

/**
 * 分を時間表示形式に変換（例: 120 → "2時間0分"）
 * @param minutes 分数
 * @returns 日本語形式の時間文字列
 */
export const minutesToHoursDisplay = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0 && m === 0) return '0分';
  if (h === 0) return `${m}分`;
  if (m === 0) return `${h}時間`;
  return `${h}時間${m}分`;
};

/**
 * 社員別の所定退勤時刻を取得
 * @param employeeName 社員名
 * @returns 所定退勤時刻（分）
 */
export const getRegularEndMinutes = (employeeName: string): number => {
  return EMPLOYEE_REGULAR_END_TIMES[employeeName] ?? DEFAULT_REGULAR_END_MINUTES;
};

/**
 * 勤怠計算（残業判定含む）
 * 
 * 仕様:
 * - 始業時刻は 9:00 固定
 * - 出勤打刻が 9:00 より前の場合でも、計算上は 9:00 扱いとする
 * - 残業分 = max(0, 実退勤分 − 社員別所定退勤分)
 * - 実労働分 = 実退勤分 − 計算用出勤分
 * 
 * @param employeeName 社員名
 * @param clockIn 出勤時刻（HH:mm形式）
 * @param clockOut 退勤時刻（HH:mm形式）
 * @returns 勤怠計算結果
 */
export const calculateAttendance = (
  employeeName: string,
  clockIn: string,
  clockOut: string
): AttendanceResult => {
  // 出勤時刻を分に変換
  const clockInMinutes = timeToMinutes(clockIn);
  // 退勤時刻を分に変換
  const clockOutMinutes = timeToMinutes(clockOut);

  // 計算用出勤時刻 = max(実出勤時刻, 09:00)
  const workStartMinutes = Math.max(clockInMinutes, START_TIME_MINUTES);

  // 社員別所定退勤時刻
  const regularEndMinutes = getRegularEndMinutes(employeeName);

  // 実労働分 = 実退勤分 − 計算用出勤分
  const workMinutes = clockOutMinutes - workStartMinutes;

  // 残業分 = max(0, 実退勤分 − 社員別所定退勤分)
  const overtimeMinutes = Math.max(0, clockOutMinutes - regularEndMinutes);

  return {
    workStartMinutes,
    workStartTime: minutesToTime(workStartMinutes),
    regularEndMinutes,
    regularEndTime: minutesToTime(regularEndMinutes),
    workMinutes,
    workTimeFormatted: minutesToHoursDisplay(workMinutes),
    overtimeMinutes,
    overtimeFormatted: minutesToHoursDisplay(overtimeMinutes),
  };
};

/**
 * ISO形式の日時文字列からHH:mm形式の時刻を抽出
 * @param isoString ISO形式の日時文字列
 * @returns HH:mm形式の時刻
 */
export const extractTimeFromISO = (isoString: string): string => {
  const date = new Date(isoString);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

/**
 * 日時オブジェクトからHH:mm形式の時刻を抽出
 * @param date Dateオブジェクト
 * @returns HH:mm形式の時刻
 */
export const extractTimeFromDate = (date: Date): string => {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};
