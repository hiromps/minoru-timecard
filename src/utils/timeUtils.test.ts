/**
 * 時間フォーマッタのテスト
 *
 * 通常ケースに加え、小数時間の丸めで分が60になる境界
 * （例: 7.996h → 「7時間60分」ではなく「8時間」）の繰り上がりを検証する。
 */
import { formatWorkHours, formatWorkHoursForCSV, formatMinutesForCSV } from './timeUtils';

describe('formatWorkHours（○時間○分）', () => {
  test.each([
    { input: 0, expected: '0時間0分' },
    { input: 8.5, expected: '8時間30分' },
    { input: 0.5, expected: '30分' },
    { input: 8, expected: '8時間' },
    { input: 7.99, expected: '7時間59分' }, // round(59.4)=59（繰り上がりなし）
  ])('formatWorkHours($input) = "$expected"', ({ input, expected }) => {
    expect(formatWorkHours(input)).toBe(expected);
  });

  it('丸めで60分になる場合は1時間へ繰り上げる（7.996h → 8時間）', () => {
    // round((7.996-7)*60) = round(59.76) = 60 → 繰り上げて8時間0分
    expect(formatWorkHours(7.996)).toBe('8時間');
  });

  it('1時間未満でも繰り上がる（0.9999h → 1時間）', () => {
    expect(formatWorkHours(0.9999)).toBe('1時間');
  });
});

describe('formatWorkHoursForCSV（○:○○）', () => {
  test.each([
    { input: 0, expected: '0:00' },
    { input: 8.5, expected: '8:30' },
    { input: 0.25, expected: '0:15' },
    { input: 7, expected: '7:00' },
  ])('formatWorkHoursForCSV($input) = "$expected"', ({ input, expected }) => {
    expect(formatWorkHoursForCSV(input)).toBe(expected);
  });

  it('丸めで60分になる場合は1時間へ繰り上げる（7.996h → "8:00"）', () => {
    expect(formatWorkHoursForCSV(7.996)).toBe('8:00');
  });
});

describe('formatMinutesForCSV（分 → ○:○○）', () => {
  test.each([
    { input: 0, expected: '0:00' },
    { input: 5, expected: '0:05' },
    { input: 60, expected: '1:00' },
    { input: 90, expected: '1:30' },
    { input: -10, expected: '0:00' }, // 負値は0扱い
  ])('formatMinutesForCSV($input) = "$expected"', ({ input, expected }) => {
    expect(formatMinutesForCSV(input)).toBe(expected);
  });

  it('小数分の丸めで60分になる場合は1時間へ繰り上げる（119.7分 → "2:00"）', () => {
    expect(formatMinutesForCSV(119.7)).toBe('2:00');
  });
});
