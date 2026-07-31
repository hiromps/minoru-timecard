/**
 * 表示フォーマット用ユーティリティ（残業時間などの分→日本語表示）
 *
 * 注意（計算ロジックの一本化・2026-06 監査対応）:
 * 勤務時間・残業・ステータスの計算は src/utils/workTimeUtils.ts の
 * calculateWorkTimeAndStatus に一本化されている（本番経路 database.ts /
 * adminSupabase.ts はこれのみを使用）。
 *
 * かつてこのファイルには別系統の calculateAttendance（出勤09:00丸め＋
 * 社員名ハードコードの所定終業表）が存在したが、本番では未使用かつ
 * workTimeUtils と結果が食い違い、テストが緑でも本番の正しさを保証しない
 * 二重実装だったため削除した。所定始業・終業は employees テーブルの
 * work_start_time / work_end_time（DB値）を正とする。
 * （2026-07 監査対応: 本番未使用の timeToMinutes / minutesToTime も削除した）
 *
 * このファイルには UI が利用する純粋なフォーマッタのみを残す。
 */

/**
 * 分を時間表示形式に変換（例: 120 → "2時間0分"）
 * @param minutes 分数
 * @returns 日本語形式の時間文字列
 */
export const minutesToHoursDisplay = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0 && m === 0) return '0分';
  if (h === 0) return `${m}分`;
  if (m === 0) return `${h}時間`;
  return `${h}時間${m}分`;
};
