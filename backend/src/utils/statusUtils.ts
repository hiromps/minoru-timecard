/**
 * ステータス判定ユーティリティ
 * 出勤・退勤時刻と勤務時間設定から勤務ステータスを判定する共通関数
 */

// ステータス型定義
export type TimeRecordStatus =
  | '通常'
  | '遅刻'
  | '早退'
  | '残業'
  | '遅刻・早退'
  | '遅刻・残業'
  | '設定エラー';

/**
 * 勤務ステータスを判定する
 * @param clockInTime - 出勤時刻（Date）
 * @param clockOutTime - 退勤時刻（Date | null）
 * @param workStartTime - 勤務開始時刻（HH:MM形式）
 * @param workEndTime - 勤務終了時刻（HH:MM形式）
 * @param enableDebugLog - デバッグログを有効にするか（デフォルト: false）
 * @returns 判定されたステータス
 */
export const determineStatus = (
  clockInTime: Date,
  clockOutTime: Date | null,
  workStartTime: string,
  workEndTime: string,
  enableDebugLog: boolean = false
): TimeRecordStatus => {
  const log = enableDebugLog ? console.log : () => {};

  log('=== ステータス判定開始 ===');
  log('clockInTime:', clockInTime);
  log('clockOutTime:', clockOutTime);
  log('workStartTime:', workStartTime);
  log('workEndTime:', workEndTime);

  // Dateオブジェクトの確実な変換
  let actualClockIn: Date;
  if (clockInTime instanceof Date) {
    actualClockIn = clockInTime;
  } else {
    actualClockIn = new Date(clockInTime);
  }

  let actualClockOut: Date | null = null;
  if (clockOutTime) {
    if (clockOutTime instanceof Date) {
      actualClockOut = clockOutTime;
    } else {
      actualClockOut = new Date(clockOutTime);
    }
  }

  // 出勤時刻を分単位に変換
  const clockInHour = actualClockIn.getHours();
  const clockInMinute = actualClockIn.getMinutes();
  const clockInTotalMinutes = clockInHour * 60 + clockInMinute;

  // 勤務開始時間の検証とパース
  if (!workStartTime || !workStartTime.includes(':')) {
    console.error('❌ workStartTime が無効:', workStartTime);
    return '設定エラー';
  }

  const [workStartHour, workStartMinute] = workStartTime.split(':').map(Number);
  if (isNaN(workStartHour) || isNaN(workStartMinute)) {
    console.error('❌ workStartTime パース失敗:', workStartTime);
    return '設定エラー';
  }
  const workStartTotalMinutes = workStartHour * 60 + workStartMinute;

  // 勤務終了時間の検証とパース
  if (!workEndTime || !workEndTime.includes(':')) {
    console.error('❌ workEndTime が無効:', workEndTime);
    return '設定エラー';
  }

  const [workEndHour, workEndMinute] = workEndTime.split(':').map(Number);
  if (isNaN(workEndHour) || isNaN(workEndMinute)) {
    console.error('❌ workEndTime パース失敗:', workEndTime);
    return '設定エラー';
  }
  const workEndTotalMinutes = workEndHour * 60 + workEndMinute;

  // デバッグログ
  log('=== ステータス判定詳細 ===');
  log(`出勤時刻: ${clockInHour}:${clockInMinute.toString().padStart(2, '0')} (${clockInTotalMinutes}分)`);
  log(`設定出勤: ${workStartTime} (${workStartTotalMinutes}分)`);
  log(`設定退勤: ${workEndTime} (${workEndTotalMinutes}分)`);

  // 遅刻判定
  const isLate = clockInTotalMinutes > workStartTotalMinutes;
  let isEarlyLeave = false;
  let isOvertime = false;

  log(`遅刻判定: ${clockInTotalMinutes} > ${workStartTotalMinutes} = ${isLate}`);

  // 退勤時間がある場合の追加判定
  if (actualClockOut) {
    const clockOutHour = actualClockOut.getHours();
    const clockOutMinute = actualClockOut.getMinutes();
    const clockOutTotalMinutes = clockOutHour * 60 + clockOutMinute;

    log(`退勤時刻: ${clockOutHour}:${clockOutMinute.toString().padStart(2, '0')} (${clockOutTotalMinutes}分)`);

    // 早退判定（退勤時刻 < 勤務終了時刻）
    isEarlyLeave = clockOutTotalMinutes < workEndTotalMinutes;
    // 残業判定（退勤時刻 > 勤務終了時刻）
    isOvertime = clockOutTotalMinutes > workEndTotalMinutes;

    log(`早退判定: ${clockOutTotalMinutes} < ${workEndTotalMinutes} = ${isEarlyLeave}`);
    log(`残業判定: ${clockOutTotalMinutes} > ${workEndTotalMinutes} = ${isOvertime}`);
  } else {
    log('退勤時刻: 未退勤');
  }

  // 動的ステータス組み合わせ
  const statusParts: string[] = [];

  // 遅刻ステータス追加
  if (isLate) {
    statusParts.push('遅刻');
    log('✓ 遅刻ステータス追加');
  }

  // 退勤済みの場合のみ退勤関連ステータスを判定
  if (actualClockOut) {
    if (isEarlyLeave) {
      statusParts.push('早退');
      log('✓ 早退ステータス追加');
    } else if (isOvertime) {
      statusParts.push('残業');
      log('✓ 残業ステータス追加');
    }
  }

  // ステータスが複数ある場合は「・」で結合、なければ「通常」
  const finalStatus = (statusParts.length > 0 ? statusParts.join('・') : '通常') as TimeRecordStatus;
  log(`最終ステータス: "${finalStatus}"`);
  log('=========================\n');

  return finalStatus;
};
