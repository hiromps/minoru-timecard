/**
 * 日付ユーティリティ（JST基準・タイムゾーン非依存）のテスト
 *
 * すべて固定の Date / ISO文字列（末尾Z = UTC絶対時刻）を渡して検証する。
 * 実行環境のタイムゾーン（UTCのCI / JSTのローカル）に関係なく同じ結果になること
 * を保証するのが目的（過去の不具合: ローカルゲッター使用でJST以外の環境がズレた）。
 */
import {
  getJSTDate,
  getJSTTimeString,
  getJSTYearMonth,
  getJSTDateTimeLocal,
  localDateTimeToISO,
} from './dateUtils';

describe('localDateTimeToISO（JST壁時計 → UTC ISO）', () => {
  it('JST 09:00 は UTC 00:00 になる', () => {
    expect(localDateTimeToISO('2026-07-01T09:00')).toBe('2026-07-01T00:00:00.000Z');
  });

  it('スペース区切り "YYYY-MM-DD HH:MM" も受け付ける', () => {
    expect(localDateTimeToISO('2026-07-01 09:00')).toBe('2026-07-01T00:00:00.000Z');
  });

  it('JST深夜0時台はUTCでは前日になる（日跨ぎ）', () => {
    // JST 2026-07-01 00:30 = UTC 2026-06-30 15:30
    expect(localDateTimeToISO('2026-07-01T00:30')).toBe('2026-06-30T15:30:00.000Z');
  });

  it('時刻なし（日付のみ）は 00:00 JST として扱う', () => {
    expect(localDateTimeToISO('2026-07-01')).toBe('2026-06-30T15:00:00.000Z');
  });

  it('年跨ぎ: JST 元日 00:00 は UTC 前年大晦日 15:00', () => {
    expect(localDateTimeToISO('2026-01-01T00:00')).toBe('2025-12-31T15:00:00.000Z');
  });

  it('空文字は空文字を返す', () => {
    expect(localDateTimeToISO('')).toBe('');
  });
});

describe('getJSTDateTimeLocal（UTC ISO → JST壁時計）', () => {
  it('UTC 00:00 は JST 09:00 になる', () => {
    expect(getJSTDateTimeLocal('2026-07-01T00:00:00.000Z')).toBe('2026-07-01T09:00');
  });

  it('UTC前日15:30以降はJSTでは翌日0時台（日跨ぎ）', () => {
    expect(getJSTDateTimeLocal('2026-06-30T15:30:00.000Z')).toBe('2026-07-01T00:30');
  });

  it('null・空文字は空文字を返す', () => {
    expect(getJSTDateTimeLocal(null)).toBe('');
    expect(getJSTDateTimeLocal('')).toBe('');
  });

  it('不正な日付文字列は空文字を返す', () => {
    expect(getJSTDateTimeLocal('not-a-date')).toBe('');
  });
});

describe('localDateTimeToISO ⇄ getJSTDateTimeLocal の往復変換', () => {
  it('UTC ISO → JST壁時計 → UTC ISO が一致する（秒以下は0前提）', () => {
    const iso = '2026-05-26T23:53:00.000Z'; // JST 2026-05-27 08:53
    const local = getJSTDateTimeLocal(iso);
    expect(local).toBe('2026-05-27T08:53');
    expect(localDateTimeToISO(local)).toBe(iso);
  });

  it('JST壁時計 → UTC ISO → JST壁時計 が一致する（年末・深夜境界）', () => {
    const local = '2026-12-31T23:59';
    const iso = localDateTimeToISO(local);
    expect(iso).toBe('2026-12-31T14:59:00.000Z');
    expect(getJSTDateTimeLocal(iso)).toBe(local);
  });
});

describe('getJSTDate（JSTの日付 YYYY-MM-DD）', () => {
  it('JST 23:59:59（UTC 14:59:59）はまだ当日', () => {
    expect(getJSTDate(new Date('2026-07-01T14:59:59Z'))).toBe('2026-07-01');
  });

  it('JST 0:00（UTC 15:00）ちょうどから翌日になる', () => {
    expect(getJSTDate(new Date('2026-07-01T15:00:00Z'))).toBe('2026-07-02');
  });

  it('UTC 00:00 は JST 09:00 で同日', () => {
    expect(getJSTDate(new Date('2026-07-01T00:00:00Z'))).toBe('2026-07-01');
  });
});

describe('getJSTTimeString（JSTの HH:MM）', () => {
  it('UTC 00:05 は JST 09:05', () => {
    expect(getJSTTimeString(new Date('2026-07-01T00:05:00Z'))).toBe('09:05');
  });

  it('UTC 15:00 は JST 翌日 00:00（ゼロ埋め）', () => {
    expect(getJSTTimeString(new Date('2026-06-30T15:00:00Z'))).toBe('00:00');
  });

  it('UTC 14:59 は JST 23:59', () => {
    expect(getJSTTimeString(new Date('2026-07-01T14:59:00Z'))).toBe('23:59');
  });
});

describe('getJSTYearMonth（JST基準の年月）', () => {
  it('UTC 6月30日15:00 は JST 7月1日 → 7月扱い（月境界）', () => {
    expect(getJSTYearMonth(new Date('2026-06-30T15:00:00Z'))).toEqual({ year: 2026, month: 7 });
  });

  it('UTC 大晦日14:59 は JST 大晦日23:59 → 12月扱い', () => {
    expect(getJSTYearMonth(new Date('2025-12-31T14:59:00Z'))).toEqual({ year: 2025, month: 12 });
  });

  it('UTC 大晦日15:00 は JST 元日 → 翌年1月扱い（年境界）', () => {
    expect(getJSTYearMonth(new Date('2025-12-31T15:00:00Z'))).toEqual({ year: 2026, month: 1 });
  });
});
