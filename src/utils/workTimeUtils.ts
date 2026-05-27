/**
 * 勤務時間とステータス判定のユーティリティ関数
 */

import { TimeRecordStatus } from '../lib/supabase';
import { localDateTimeToISO, getJSTDate } from './dateUtils';

export interface WorkTimeResult {
  actualWorkHours: number;
  status: TimeRecordStatus;
  /** 残業時間（分）。退勤時刻 - 所定退勤時刻(workEndTime)。0以上。退勤なしは0。 */
  overtimeMinutes: number;
}

/**
 * 時刻文字列を "HH:MM" 形式に切り出す
 * 呼び出し側が "HH:MM"（DB値）でも "HH:MM:SS"（mockData）でも受け付けられるようにする
 * @param timeStr "HH:MM" または "HH:MM:SS" 形式の時刻文字列
 * @returns "HH:MM" 形式の時刻文字列
 */
const toHHMM = (timeStr: string): string => timeStr.split(':').slice(0, 2).join(':');

/**
 * 勤務時間とステータスを計算（打刻・修正・再計算・集計の単一の信頼できる計算関数）
 *
 * 重要（タイムゾーン）:
 * - clockInTime/clockOutTime はUTCの絶対時刻（DBのtimestamptz / ISO文字列）。
 * - workStartTime/workEndTime は「JSTの時刻」、recordDate は「JSTの日付」を表す。
 * - 所定時刻は localDateTimeToISO で JST→UTC の絶対時刻に変換してから比較する。
 *   こうしないと、UTC実行環境(Vercel)で new Date("...日付 17:00") がUTCの17:00と
 *   解釈され、JSTの打刻と9時間ズレて全打刻が誤判定される（過去の不具合）。
 *
 * @param clockInTime 出勤時刻 (UTC ISO string)
 * @param clockOutTime 退勤時刻 (UTC ISO string)
 * @param workStartTime 所定始業時刻・JST (例: "09:00:00" または "09:00")
 * @param workEndTime 所定終業時刻・JST (例: "17:00:00" または "17:00")
 * @param recordDate 打刻日・JST ("YYYY-MM-DD")。未指定時は clockIn のJST日付を使用
 * @returns 実労働時間・ステータス・残業時間（分）
 */
export const calculateWorkTimeAndStatus = (
  clockInTime: string | null,
  clockOutTime: string | null,
  workStartTime: string = "09:00:00",
  workEndTime: string = "17:00:00",
  recordDate?: string
): WorkTimeResult => {
  // デフォルト値
  if (!clockInTime) {
    return { actualWorkHours: 0, status: '通常', overtimeMinutes: 0 };
  }

  const clockIn = new Date(clockInTime);
  const clockOut = clockOutTime ? new Date(clockOutTime) : null;

  // 所定時刻が属するJST日付（引数優先、無ければ clockIn のJST日付）を基準に、
  // JSTの所定始業・終業を UTC絶対時刻へ変換する（タイムゾーン非依存）
  const baseDate = recordDate ?? getJSTDate(clockIn);
  const workStart = new Date(localDateTimeToISO(`${baseDate}T${toHHMM(workStartTime)}`));
  const workEnd = new Date(localDateTimeToISO(`${baseDate}T${toHHMM(workEndTime)}`));

  // 遅刻判定：出勤時刻 > 設定された出勤時刻
  const isLate = clockIn > workStart;

  // 退勤していない場合
  if (!clockOut) {
    return {
      actualWorkHours: 0,
      status: isLate ? '遅刻' : '通常',
      overtimeMinutes: 0
    };
  }

  // 実労働時間の計算（出勤から退勤まで・実打刻ベース）
  const actualWorkMinutes = Math.max(0, (clockOut.getTime() - clockIn.getTime()) / (1000 * 60));
  const actualWorkHours = Math.round((actualWorkMinutes / 60) * 100) / 100;

  // 早退判定：退勤時刻 < 設定された退勤時刻
  const isEarlyDeparture = clockOut < workEnd;

  // 残業判定：退勤時刻 > 設定された退勤時刻
  const isOvertime = clockOut > workEnd;

  // 残業時間（分）：退勤時刻 - 所定退勤時刻。マイナスなら0。isOvertime と同じ workEnd から導出。
  const overtimeMinutes = Math.max(0, Math.round((clockOut.getTime() - workEnd.getTime()) / (1000 * 60)));

  // 複合ステータス対応
  if (isLate && isEarlyDeparture) {
    return { actualWorkHours, status: '遅刻・早退', overtimeMinutes };
  } else if (isLate && isOvertime) {
    return { actualWorkHours, status: '遅刻・残業', overtimeMinutes };
  } else if (isLate) {
    return { actualWorkHours, status: '遅刻', overtimeMinutes };
  } else if (isEarlyDeparture) {
    return { actualWorkHours, status: '早退', overtimeMinutes };
  } else if (isOvertime) {
    return { actualWorkHours, status: '残業', overtimeMinutes };
  } else {
    return { actualWorkHours, status: '通常', overtimeMinutes };
  }
};

/**
 * 時刻文字列を今日の日付と結合
 * @param timeString "HH:MM:SS" 形式
 * @param baseDate 基準日（省略時は今日）
 * @returns Date オブジェクト
 */
export const timeStringToDate = (timeString: string, baseDate?: Date): Date => {
  const base = baseDate || new Date();
  const dateString = base.toDateString();
  return new Date(`${dateString} ${timeString}`);
};

/**
 * レガシー関数との互換性のため
 * @deprecated calculateWorkTimeAndStatus を使用してください
 */
export const calculateWorkHours = (startTime: string, endTime: string): number => {
  if (!startTime || !endTime) return 0;
  const start = new Date(startTime);
  const end = new Date(endTime);
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
};