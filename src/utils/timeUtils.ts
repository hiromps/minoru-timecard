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

  let h = Math.floor(hours);
  let m = Math.round((hours - h) * 60);
  // 端数の丸めで60分になった場合は1時間へ繰り上げる（例: 7.996h → 「7時間60分」ではなく「8時間」）
  if (m === 60) {
    h += 1;
    m = 0;
  }

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

  let h = Math.floor(hours);
  let m = Math.round((hours - h) * 60);
  // 端数の丸めで60分になった場合は1時間へ繰り上げる（例: 7.996h → 「7:60」ではなく「8:00」）
  if (m === 60) {
    h += 1;
    m = 0;
  }

  return `${h}:${m.toString().padStart(2, '0')}`;
};

/**
 * 分を「○:○○」形式に変換（CSV出力用・残業時間など）
 * @param minutes 分数 (例: 90 = 1:30)
 * @returns 「○:○○」形式の文字列
 */
export const formatMinutesForCSV = (minutes: number): string => {
  if (!minutes || minutes <= 0) return '0:00';

  let h = Math.floor(minutes / 60);
  let m = Math.round(minutes % 60);
  // 分が小数の場合、丸めで60分になったら1時間へ繰り上げる（例: 119.7分 → 「1:60」ではなく「2:00」）
  if (m === 60) {
    h += 1;
    m = 0;
  }

  return `${h}:${m.toString().padStart(2, '0')}`;
};