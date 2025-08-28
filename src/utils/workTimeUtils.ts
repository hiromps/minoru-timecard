/**
 * 勤務時間とステータス判定のユーティリティ関数
 */

export interface WorkTimeResult {
  actualWorkHours: number;
  status: '通常' | '遅刻' | '早退' | '残業' | '遅刻・残業';
}

/**
 * 勤務時間とステータスを計算
 * @param clockInTime 出勤時刻 (ISO string)
 * @param clockOutTime 退勤時刻 (ISO string)
 * @param workStartTime 労働開始時刻 (例: "09:00:00")
 * @param workEndTime 労働終了時刻 (例: "17:00:00")
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

  // 設定値（分単位）
  const EARLY_ARRIVAL_BUFFER = 60; // 1時間前から出勤可能（8:00から）
  const LATE_DEPARTURE_BUFFER = 1; // 1分の退勤猶予時間（17:01から残業）
  const STANDARD_WORK_MINUTES = 8 * 60; // 標準労働時間8時間

  // 出勤判定
  const earliestAllowedArrival = new Date(workStart.getTime() - EARLY_ARRIVAL_BUFFER * 60 * 1000);
  const isLate = clockIn > workStart;

  // 退勤していない場合
  if (!clockOut) {
    return { 
      actualWorkHours: 0, 
      status: isLate ? '遅刻' : '通常'
    };
  }

  // 実際の労働時間計算
  let actualWorkStart = clockIn;
  let actualWorkEnd = clockOut;

  // 早退判定用の猶予時間付き終了時刻
  const workEndWithBuffer = new Date(workEnd.getTime() + LATE_DEPARTURE_BUFFER * 60 * 1000);

  // 実労働時間の計算
  // 労働開始時刻より早く来た場合は、労働開始時刻から計算
  if (clockIn < workStart) {
    actualWorkStart = workStart;
  }

  // 労働時間を分単位で計算
  const actualWorkMinutes = Math.max(0, (actualWorkEnd.getTime() - actualWorkStart.getTime()) / (1000 * 60));
  const actualWorkHours = Math.round((actualWorkMinutes / 60) * 100) / 100;

  // ステータス判定
  const isEarlyDeparture = clockOut < workEnd;
  const isOvertimeByTime = clockOut > workEndWithBuffer; // 退勤時刻による残業判定
  const isOvertimeByHours = actualWorkMinutes > STANDARD_WORK_MINUTES; // 労働時間による残業判定
  const isOvertime = isOvertimeByTime || isOvertimeByHours; // どちらかが該当すれば残業

  if (isLate && isOvertime) {
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