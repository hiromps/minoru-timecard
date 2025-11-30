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
 * ローカル日時をISO形式に変換（日本時間として扱う）
 * 入力を常に日本時間（JST = UTC+9）として解釈し、UTCに変換する
 * @param {string} datetimeLocal - YYYY-MM-DDTHH:MM形式の文字列
 * @returns {string} ISO形式の日時文字列（UTC）
 */
export const localDateTimeToISO = (datetimeLocal: string): string => {
  if (!datetimeLocal) return '';

  // 入力文字列を直接パースして、常にJSTとして扱う
  // 形式: "YYYY-MM-DDTHH:MM" または "YYYY-MM-DD HH:MM"
  const normalized = datetimeLocal.replace(' ', 'T');
  const [datePart, timePart] = normalized.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = (timePart || '00:00').split(':').map(Number);

  // JST時刻からUTCを計算（JSTはUTC+9）
  // Date.UTC()はタイムゾーンに依存しないUTCタイムスタンプを返す
  // JSTからUTCに変換するため、9時間分のミリ秒を引く
  const utcTimestamp = Date.UTC(year, month - 1, day, hours, minutes, 0, 0) - (9 * 60 * 60 * 1000);
  return new Date(utcTimestamp).toISOString();
};