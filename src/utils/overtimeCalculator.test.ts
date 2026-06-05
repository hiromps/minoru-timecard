/**
 * 時刻⇔分の変換・表示フォーマッタのテスト
 *
 * 注: 勤務時間・残業・ステータスの計算は workTimeUtils.calculateWorkTimeAndStatus
 * に一本化されたため、本ファイルが扱っていた calculateAttendance（別系統の
 * 二重実装）と社員名ハードコード表は削除済み。計算ロジックのテストは
 * workTimeUtils.test.ts を参照。
 */

import {
    timeToMinutes,
    minutesToTime,
    minutesToHoursDisplay,
} from './overtimeCalculator';

describe('時刻フォーマッタ', () => {
    describe('timeToMinutes', () => {
        test.each([
            { input: '09:00', expected: 540 },
            { input: '15:00', expected: 900 },
            { input: '16:00', expected: 960 },
            { input: '17:00', expected: 1020 },
            { input: '08:30', expected: 510 },
            { input: '18:30', expected: 1110 },
        ])('timeToMinutes("$input") = $expected', ({ input, expected }) => {
            expect(timeToMinutes(input)).toBe(expected);
        });
    });

    describe('minutesToTime', () => {
        test.each([
            { input: 540, expected: '09:00' },
            { input: 900, expected: '15:00' },
            { input: 960, expected: '16:00' },
            { input: 1020, expected: '17:00' },
        ])('minutesToTime($input) = "$expected"', ({ input, expected }) => {
            expect(minutesToTime(input)).toBe(expected);
        });
    });

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
