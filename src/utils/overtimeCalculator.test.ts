/**
 * 表示フォーマッタのテスト
 *
 * 注: 勤務時間・残業・ステータスの計算は workTimeUtils.calculateWorkTimeAndStatus
 * に一本化されたため、本ファイルが扱っていた calculateAttendance（別系統の
 * 二重実装）と社員名ハードコード表は削除済み。本番未使用だった
 * timeToMinutes / minutesToTime も削除済み。計算ロジックのテストは
 * workTimeUtils.test.ts を参照。
 */

import { minutesToHoursDisplay } from './overtimeCalculator';

describe('時刻フォーマッタ', () => {
    describe('minutesToHoursDisplay', () => {
        test.each([
            { input: 0, expected: '0分' },
            { input: 30, expected: '30分' },
            { input: 60, expected: '1時間' },
            { input: 90, expected: '1時間30分' },
            { input: 480, expected: '8時間' },
        ])('minutesToHoursDisplay($input) = "$expected"', ({ input, expected }) => {
            expect(minutesToHoursDisplay(input)).toBe(expected);
        });
    });
});
