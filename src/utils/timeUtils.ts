/**
 * 時間関連のユーティリティ関数
 */

/**
 * 小数点時間を「○時間○分」形式に変換
 * @param hours 小数点形式の時間 (例: 8.5 = 8時間30分)
 * @returns 「○時間○分」形式の文字列
 */
export const formatWorkHours = (hours: number): string => {
  if (hours === 0) return '0時間0分';
  
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  
  if (h === 0) return `${m}分`;
  if (m === 0) return `${h}時間`;
  return `${h}時間${m}分`;
};

/**
 * 小数点時間を「○:○○」形式に変換（CSV出力用）
 * @param hours 小数点形式の時間 (例: 8.5 = 8:30)
 * @returns 「○:○○」形式の文字列
 */
export const formatWorkHoursForCSV = (hours: number): string => {
  if (hours === 0) return '0:00';
  
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  
  return `${h}:${m.toString().padStart(2, '0')}`;
};

/**
 * 時刻文字列から時間数を計算
 * @param startTime 開始時刻 (ISO string)
 * @param endTime 終了時刻 (ISO string)
 * @returns 時間数（小数点形式）
 */
export const calculateWorkHours = (startTime: string, endTime: string): number => {
  if (!startTime || !endTime) return 0;
  
  const start = new Date(startTime);
  const end = new Date(endTime);
  
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
};