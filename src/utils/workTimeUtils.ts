/**
 * 勤務時間とステータス判定のユーティリティ関数
 */

import { TimeRecordStatus } from '../lib/supabase';

export interface WorkTimeResult {
  actualWorkHours: number;
  status: TimeRecordStatus;
}

/**
 * 勤務時間とステータスを計算
 * @param clockInTime 出勤時刻 (ISO string)
 * @param clockOutTime 退勤時刻 (ISO string)
 * @param workStartTime 労働開始時刻 (例: "09:00:00" または "09:00")
 * @param workEndTime 労働終了時刻 (例: "17:00:00" または "17:00")
 * @returns 実労働時間とステータス
 */
export const calculateWorkTimeAndStatus = (
  clockInTime: string | null,
  clockOutTime: string | null,
  workStartTime: string = "09:00:00",
  workEndTime: string = "17:00:00"
): WorkTimeResult => {
  // デフォルト値
  if (!clockInTime) {
    return { actualWorkHours: 0, status: '通常' };
  }

  const clockIn = new Date(clockInTime);
  const clockOut = clockOutTime ? new Date(clockOutTime) : null;

  // 今日の日付で労働開始・終了時刻を作成
  const today = clockIn.toDateString();
  const workStart = new Date(`${today} ${workStartTime}`);
  const workEnd = new Date(`${today} ${workEndTime}`);

  // 遅刻判定：出勤時刻 > 設定された出勤時刻
  const isLate = clockIn > workStart;

  // 退勤していない場合
  if (!clockOut) {
    return {
      actualWorkHours: 0,
      status: isLate ? '遅刻' : '通常'
    };
  }

  // 実労働時間の計算（出勤から退勤まで）
  const actualWorkMinutes = Math.max(0, (clockOut.getTime() - clockIn.getTime()) / (1000 * 60));
  const actualWorkHours = Math.round((actualWorkMinutes / 60) * 100) / 100;

  // 早退判定：退勤時刻 < 設定された退勤時刻
  const isEarlyDeparture = clockOut < workEnd;

  // 残業判定：退勤時刻 > 設定された退勤時刻
  const isOvertime = clockOut > workEnd;

  // 複合ステータス対応
  if (isLate && isEarlyDeparture) {
    return { actualWorkHours, status: '遅刻・早退' };
  } else if (isLate && isOvertime) {
    return { actualWorkHours, status: '遅刻・残業' };
  } else if (isLate) {
    return { actualWorkHours, status: '遅刻' };
  } else if (isEarlyDeparture) {
    return { actualWorkHours, status: '早退' };
  } else if (isOvertime) {
    return { actualWorkHours, status: '残業' };
  } else {
    return { actualWorkHours, status: '通常' };
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