/**
 * バックエンド用の日付処理ユーティリティ
 * 日本時間（JST）での正確な日付処理を提供
 */

/**
 * JSTでの日付を取得（YYYY-MM-DD形式）
 * @param {Date} date - 日付オブジェクト（デフォルトは現在時刻）
 * @returns {string} JST日付文字列
 */
export const getJSTDate = (date: Date = new Date()): string => {
  const jstOffset = 9 * 60 * 60 * 1000; // JST is UTC+9 in milliseconds
  const jstDate = new Date(date.getTime() + jstOffset);
  const year = jstDate.getUTCFullYear();
  const month = String(jstDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(jstDate.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};