/**
 * 残業判定ロジックのテスト
 */

import {
    timeToMinutes,
    minutesToTime,
    minutesToHoursDisplay,
    getRegularEndMinutes,
    calculateAttendance,
} from './overtimeCalculator';

describe('残業判定ロジック', () => {
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

    describe('getRegularEndMinutes - 社員別所定退勤時刻', () => {
        test('大﨑 香奈子 → 16:00 (960分)', () => {
            expect(getRegularEndMinutes('大﨑 香奈子')).toBe(960);
        });

        test('小齊平 千明 → 15:00 (900分)', () => {
            expect(getRegularEndMinutes('小齊平 千明')).toBe(900);
        });

        test('その他の社員 → 17:00 (1020分)', () => {
            expect(getRegularEndMinutes('田中 太郎')).toBe(1020);
            expect(getRegularEndMinutes('山田 花子')).toBe(1020);
        });
    });

    describe('calculateAttendance - 残業判定', () => {
        test('大﨑 香奈子: 08:30-16:30 → 残業30分', () => {
            const result = calculateAttendance('大﨑 香奈子', '08:30', '16:30');
            expect(result.workStartTime).toBe('09:00');
            expect(result.regularEndTime).toBe('16:00');
            expect(result.workMinutes).toBe(450);
            expect(result.overtimeMinutes).toBe(30);
        });

        test('大﨑 香奈子: 09:00-16:00 → 残業なし', () => {
            const result = calculateAttendance('大﨑 香奈子', '09:00', '16:00');
            expect(result.workStartTime).toBe('09:00');
            expect(result.regularEndTime).toBe('16:00');
            expect(result.workMinutes).toBe(420);
            expect(result.overtimeMinutes).toBe(0);
        });

        test('小齊平 千明: 08:00-17:00 → 残業120分', () => {
            const result = calculateAttendance('小齊平 千明', '08:00', '17:00');
            expect(result.workStartTime).toBe('09:00');
            expect(result.regularEndTime).toBe('15:00');
            expect(result.workMinutes).toBe(480);
            expect(result.overtimeMinutes).toBe(120);
        });

        test('小齊平 千明: 09:00-15:00 → 残業なし', () => {
            const result = calculateAttendance('小齊平 千明', '09:00', '15:00');
            expect(result.workStartTime).toBe('09:00');
            expect(result.regularEndTime).toBe('15:00');
            expect(result.workMinutes).toBe(360);
            expect(result.overtimeMinutes).toBe(0);
        });

        test('その他社員: 08:45-18:30 → 残業90分', () => {
            const result = calculateAttendance('田中 太郎', '08:45', '18:30');
            expect(result.workStartTime).toBe('09:00');
            expect(result.regularEndTime).toBe('17:00');
            expect(result.workMinutes).toBe(570);
            expect(result.overtimeMinutes).toBe(90);
        });

        test('その他社員: 09:00-17:00 → 残業なし', () => {
            const result = calculateAttendance('山田 花子', '09:00', '17:00');
            expect(result.workStartTime).toBe('09:00');
            expect(result.regularEndTime).toBe('17:00');
            expect(result.workMinutes).toBe(480);
            expect(result.overtimeMinutes).toBe(0);
        });

        test('早出テスト: 07:00出勤でも09:00扱い', () => {
            const result = calculateAttendance('鈴木 一郎', '07:00', '17:00');
            expect(result.workStartMinutes).toBe(540); // 09:00
            expect(result.workStartTime).toBe('09:00');
            expect(result.workMinutes).toBe(480);
            expect(result.overtimeMinutes).toBe(0);
        });

        test('早退テスト: 所定前退勤は残業なし', () => {
            const result = calculateAttendance('佐藤 次郎', '09:00', '16:00');
            expect(result.workStartTime).toBe('09:00');
            expect(result.regularEndTime).toBe('17:00');
            expect(result.workMinutes).toBe(420);
            expect(result.overtimeMinutes).toBe(0);
        });
    });
});
