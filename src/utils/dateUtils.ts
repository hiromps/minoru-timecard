/**
 * 日付処理のユーティリティ関数
 * 日本時間（JST）での正確な日付処理を提供
 */

/**
 * 現在の日本時間での日付を取得（YYYY-MM-DD形式）
 * @returns {string} 日本時間での今日の日付
 */
export const getJSTDate = (date: Date = new Date()): string => {
  const jstOffset = 9 * 60; // JST is UTC+9
  const jstDate = new Date(date.getTime() + jstOffset * 60 * 1000);
  const year = jstDate.getUTCFullYear();
  const month = String(jstDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(jstDate.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * 日本時間での月の開始日と終了日を取得
 * @param {number} year - 年
 * @param {number} month - 月（1-12）
 * @returns {object} 開始日と終了日
 */
export const getJSTMonthRange = (year: number, month: number): { startDate: string; endDate: string } => {
  // 月の開始日（1日）
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  
  // 月の終了日（月末日）
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  
  return { startDate, endDate };
};

/**
 * ISO文字列から日本時間の日付部分を取得
 * @param {string} isoString - ISO形式の日時文字列
 * @returns {string} 日本時間での日付（YYYY-MM-DD）
 */
export const getJSTDateFromISO = (isoString: string): string => {
  const date = new Date(isoString);
  return getJSTDate(date);
};

/**
 * ローカル日時をISO形式に変換（日本時間考慮）
 * @param {string} datetimeLocal - YYYY-MM-DDTHH:MM形式の文字列
 * @returns {string} ISO形式の日時文字列
 */
export const localDateTimeToISO = (datetimeLocal: string): string => {
  if (!datetimeLocal) return '';
  // 日本時間として扱い、UTCに変換
  const localDate = new Date(datetimeLocal);
  // ブラウザのタイムゾーンが日本時間でない場合の調整
  const jstOffset = 9 * 60; // JST is UTC+9
  const tzOffset = localDate.getTimezoneOffset(); // ブラウザのタイムゾーンオフセット（分）
  const diffMinutes = jstOffset * 60 + tzOffset; // JSTとの差分
  
  // 差分を適用してISO文字列を返す
  const adjustedDate = new Date(localDate.getTime() - diffMinutes * 60 * 1000);
  return adjustedDate.toISOString();
};