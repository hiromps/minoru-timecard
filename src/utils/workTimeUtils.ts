/**
 * 勤務時間とステータス判定のユーティリティ関数
 */

import { TimeRecordStatus, OvertimeRuleType } from '../lib/supabase';
import { localDateTimeToISO, getJSTDate } from './dateUtils';

export interface WorkTimeResult {
  actualWorkHours: number;
  status: TimeRecordStatus;
  /** 残業時間（分）。退勤時刻 - 所定退勤時刻(workEndTime)を残業ルール区分に応じて調整した値。0以上。退勤なしは0。 */
  overtimeMinutes: number;
  /** アルバイト(hourly)が所定終業を大きく超えて勤務した場合の長時間勤務フラグ。残業代（overtimeMinutes）とは独立。 */
  isExtendedHours: boolean;
}

/**
 * 時刻文字列を "HH:MM" 形式に切り出す
 * 呼び出し側が "HH:MM"（DB値）でも "HH:MM:SS"（mockData）でも受け付けられるようにする
 * @param timeStr "HH:MM" または "HH:MM:SS" 形式の時刻文字列
 * @returns "HH:MM" 形式の時刻文字列
 */
const toHHMM = (timeStr: string): string => timeStr.split(':').slice(0, 2).join(':');

/** 所定昼休憩（JST 12:00〜13:00）。実勤務時間と重なった分のみ控除する。 */
const BREAK_START_HHMM = '12:00';
const BREAK_END_HHMM = '13:00';

/**
 * 残業ルール区分ごとの調整定数。
 * - GRACE_PERIOD_MINUTES: grace_15min ルールの猶予分。所定終業後この分数までは残業扱いにせず、
 *   16分目以降は猶予分を差し引いた分を残業として計上する（例: 所定終業+2時間なら 120-15=105分）。
 * - EXTENDED_HOURS_THRESHOLD_MINUTES: hourly ルールで「特別に長時間勤務」フラグを立てる閾値。
 *   所定終業からこの分数を超えた場合にフラグを立てる（残業代の計上とは無関係）。
 */
const GRACE_PERIOD_MINUTES = 15;
const EXTENDED_HOURS_THRESHOLD_MINUTES = 60;

/**
 * 勤務時間帯 [workIn, workOut) と昼休憩 [breakStart, breakEnd) の
 * 重なり分（分）を返す。重ならなければ0。
 * 例: 9:00-17:00 は休憩と60分重なる→60分控除。午前だけ(9:00-12:00)は0分。
 */
const overlapBreakMinutes = (
  clockIn: Date,
  clockOut: Date,
  baseDate: string
): number => {
  const breakStart = new Date(localDateTimeToISO(`${baseDate}T${BREAK_START_HHMM}`));
  const breakEnd = new Date(localDateTimeToISO(`${baseDate}T${BREAK_END_HHMM}`));
  const start = Math.max(clockIn.getTime(), breakStart.getTime());
  const end = Math.min(clockOut.getTime(), breakEnd.getTime());
  const overlapMs = end - start;
  return overlapMs > 0 ? overlapMs / (1000 * 60) : 0;
};

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
 * @param overtimeRuleType 残業ルール区分（社員マスタ由来）。未指定は standard。
 *   - standard: 所定終業を過ぎた分がそのまま残業
 *   - grace_15min: 所定終業後15分までは残業扱いにせず、16分目以降は猶予分(15分)を差し引いて計上
 *   - hourly: 残業は常に0分。所定終業を{@link EXTENDED_HOURS_THRESHOLD_MINUTES}分超えたら isExtendedHours を立てる
 * @returns 実労働時間・ステータス・残業時間（分）・長時間勤務フラグ
 */
export const calculateWorkTimeAndStatus = (
  clockInTime: string | null,
  clockOutTime: string | null,
  workStartTime: string = "09:00:00",
  workEndTime: string = "17:00:00",
  recordDate?: string,
  overtimeRuleType: OvertimeRuleType = 'standard'
): WorkTimeResult => {
  // 出勤打刻が無い場合。退勤だけ存在するのは不正データなので '設定エラー'。
  if (!clockInTime) {
    if (clockOutTime) {
      console.warn('⚠️ 不正データ: 出勤なしで退勤あり', { clockInTime, clockOutTime });
      return { actualWorkHours: 0, status: '設定エラー', overtimeMinutes: 0, isExtendedHours: false };
    }
    return { actualWorkHours: 0, status: '通常', overtimeMinutes: 0, isExtendedHours: false };
  }

  const clockIn = new Date(clockInTime);
  const clockOut = clockOutTime ? new Date(clockOutTime) : null;

  // 所定時刻が属するJST日付（引数優先、無ければ clockIn のJST日付）を基準に、
  // JSTの所定始業・終業を UTC絶対時刻へ変換する（タイムゾーン非依存）
  const baseDate = recordDate ?? getJSTDate(clockIn);
  const workStart = new Date(localDateTimeToISO(`${baseDate}T${toHHMM(workStartTime)}`));
  const workEnd = new Date(localDateTimeToISO(`${baseDate}T${toHHMM(workEndTime)}`));

  // 所定終業 <= 所定始業 は設定ミス（夜勤は現状非対応）。誤判定を黙って生成せず
  // '設定エラー' を返す。社員マスタの work_start_time/work_end_time の入力ミス検出。
  if (workEnd.getTime() <= workStart.getTime()) {
    console.warn('⚠️ 設定ミス: 所定終業 <= 所定始業', { workStartTime, workEndTime, baseDate });
    return { actualWorkHours: 0, status: '設定エラー', overtimeMinutes: 0, isExtendedHours: false };
  }

  // 遅刻判定：出勤時刻 > 設定された出勤時刻
  const isLate = clockIn > workStart;

  // 退勤していない場合
  if (!clockOut) {
    return {
      actualWorkHours: 0,
      status: isLate ? '遅刻' : '通常',
      overtimeMinutes: 0,
      isExtendedHours: false
    };
  }

  // 退勤 <= 出勤 は不正データ（負の勤務時間）。黙って0扱い・通常判定せず
  // '設定エラー' を返す。DB制約 check_clock_times とも整合。
  if (clockOut.getTime() <= clockIn.getTime()) {
    console.warn('⚠️ 不正データ: 退勤 <= 出勤', { clockInTime, clockOutTime });
    return { actualWorkHours: 0, status: '設定エラー', overtimeMinutes: 0, isExtendedHours: false };
  }

  // 実労働時間の計算（出勤から退勤まで・実打刻ベース）。
  // 所定昼休憩(JST 12:00〜13:00)と重なった分のみ控除する。
  // 午前のみ・午後のみ勤務など休憩を跨がない場合は控除されない。
  const grossWorkMinutes = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60);
  const breakMinutes = overlapBreakMinutes(clockIn, clockOut, baseDate);
  const actualWorkMinutes = Math.max(0, grossWorkMinutes - breakMinutes);
  const actualWorkHours = Math.round((actualWorkMinutes / 60) * 100) / 100;

  // 残業時間（分）の生値：退勤時刻 - 所定退勤時刻。マイナスなら0。
  const rawOvertimeMinutes = Math.max(0, Math.round((clockOut.getTime() - workEnd.getTime()) / (1000 * 60)));

  // 残業ルール区分に応じて実際の残業分・長時間勤務フラグを決定する。
  let overtimeMinutes: number;
  let isExtendedHours = false;
  if (overtimeRuleType === 'grace_15min') {
    // 所定終業後 GRACE_PERIOD_MINUTES 分までは残業扱いにしない（ステータスも通常のまま）。
    // 16分目以降は猶予分を差し引いた分を残業として計上する
    // （例: 所定終業+2時間なら 120 - 15 = 105分 = 1時間45分）。
    overtimeMinutes = rawOvertimeMinutes > GRACE_PERIOD_MINUTES
      ? rawOvertimeMinutes - GRACE_PERIOD_MINUTES
      : 0;
  } else if (overtimeRuleType === 'hourly') {
    // アルバイトは残業代を計上しない。所定終業を大きく超えた場合のみ
    // 長時間勤務フラグを立てる（給与計算はせず記録のみ）。
    overtimeMinutes = 0;
    isExtendedHours = rawOvertimeMinutes > EXTENDED_HOURS_THRESHOLD_MINUTES;
  } else {
    overtimeMinutes = rawOvertimeMinutes;
  }

  // 早退判定：退勤時刻 < 設定された退勤時刻
  const isEarlyDeparture = clockOut < workEnd;

  // 残業判定は overtimeMinutes（ルール適用後）と同一基準にする。
  // 厳密比較(clockOut > workEnd)だと終業+1〜29秒で「残業ステータスなのに残業0分」
  // という矛盾レコードが生じるため、ルール適用後の分数>0 を残業の唯一の基準とする。
  const isOvertime = overtimeMinutes > 0;

  // 複合ステータス対応
  if (isLate && isEarlyDeparture) {
    return { actualWorkHours, status: '遅刻・早退', overtimeMinutes, isExtendedHours };
  } else if (isLate && isOvertime) {
    return { actualWorkHours, status: '遅刻・残業', overtimeMinutes, isExtendedHours };
  } else if (isLate) {
    return { actualWorkHours, status: '遅刻', overtimeMinutes, isExtendedHours };
  } else if (isEarlyDeparture) {
    return { actualWorkHours, status: '早退', overtimeMinutes, isExtendedHours };
  } else if (isOvertime) {
    return { actualWorkHours, status: '残業', overtimeMinutes, isExtendedHours };
  } else {
    return { actualWorkHours, status: '通常', overtimeMinutes, isExtendedHours };
  }
};

/**
 * 直行・直帰の仕様を勤務時間結果に適用する。
 *
 * 直行直帰の記録は遅刻・早退・残業の判定を無効化し「通常」扱いとするが、
 * 労働時間（actualWorkHours）はそのまま計上する。ただし不正データ
 * （'設定エラー'）は隠さずそのまま表面化させる。
 *
 * この関数を打刻・修正・再計算の全経路で使うことで、直行直帰の扱いを統一する。
 *
 * @param result calculateWorkTimeAndStatus の結果
 * @param isDirectWork 直行直帰フラグ
 */
export const applyDirectWorkOverride = (
  result: WorkTimeResult,
  isDirectWork: boolean
): WorkTimeResult => {
  if (!isDirectWork) return result;
  if (result.status === '設定エラー') return result;
  return { actualWorkHours: result.actualWorkHours, status: '通常', overtimeMinutes: 0, isExtendedHours: false };
};