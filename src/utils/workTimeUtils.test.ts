import { calculateWorkTimeAndStatus } from './workTimeUtils';

/**
 * 統一計算関数 calculateWorkTimeAndStatus のテスト
 *
 * 仕様（DB基準・JST）:
 * - clockInTime/clockOutTime はUTCの絶対時刻（末尾Zの ISO 文字列）。
 * - workStartTime/workEndTime は「JSTの時刻」、recordDate は「JSTの日付」。
 * - 遅刻: 出勤 > record_date の JST 始業
 * - 早退: 退勤 < record_date の JST 終業
 * - 残業: 退勤 > record_date の JST 終業、残業分 = max(0, round((退勤 - 所定終業)/60000))
 * - 労働時間: 実打刻ベース (退勤 - 出勤)
 *
 * 重要: clock_in/out は必ず末尾Zの絶対時刻で渡し、所定時刻は recordDate(JST) で判定する。
 * これにより実行環境のタイムゾーン(UTC/JST)に関係なく結果が一致する
 * （過去の不具合: 実行環境TZで所定時刻を組み立てて9時間ズレていた）。
 */
describe('calculateWorkTimeAndStatus（JST基準・TZ非依存）', () => {
  describe('実データに基づくケース', () => {
    it('大﨑香奈子: JST16:09退勤・所定09:00-16:00 → 残業10分', () => {
      // clock_in は前日UTC(JST翌日08:53)、record_date は翌日 → 日付跨ぎでも正しく判定
      const r = calculateWorkTimeAndStatus(
        '2026-05-26T23:53:12.883Z', // JST 2026-05-27 08:53
        '2026-05-27T07:09:33.688Z', // JST 2026-05-27 16:09:33
        '09:00:00',
        '16:00:00',
        '2026-05-27'
      );
      expect(r.status).toBe('残業');
      expect(r.overtimeMinutes).toBe(10); // 9分33秒 → round = 10分
    });

    it('押川新一: JST20:56退勤・所定09:00-17:00 → 残業236分', () => {
      const r = calculateWorkTimeAndStatus(
        '2026-05-21T00:00:00.000Z', // JST 09:00 ちょうど出勤
        '2026-05-21T11:56:00.000Z', // JST 20:56 退勤
        '09:00:00',
        '17:00:00',
        '2026-05-21'
      );
      expect(r.status).toBe('残業');
      expect(r.overtimeMinutes).toBe(236); // 17:00 → 20:56 = 236分
    });

    it('所定17:00で17:04退勤は残業4分（旧バグでは「早退」だった）', () => {
      const r = calculateWorkTimeAndStatus(
        '2026-05-21T23:56:00.000Z', // JST 05-22 08:56
        '2026-05-22T08:04:00.000Z', // JST 05-22 17:04
        '09:00:00',
        '17:00:00',
        '2026-05-22'
      );
      expect(r.status).toBe('残業');
      expect(r.overtimeMinutes).toBe(4);
    });
  });

  describe('遅刻・早退・通常', () => {
    it('JST09:00ちょうどは通常・残業0', () => {
      const r = calculateWorkTimeAndStatus(
        '2026-05-27T00:00:00.000Z', // JST 09:00
        '2026-05-27T08:00:00.000Z', // JST 17:00 ちょうど
        '09:00:00',
        '17:00:00',
        '2026-05-27'
      );
      expect(r.status).toBe('通常');
      expect(r.overtimeMinutes).toBe(0);
      expect(r.actualWorkHours).toBe(8);
    });

    it('JST09:30出勤は遅刻', () => {
      const r = calculateWorkTimeAndStatus(
        '2026-05-27T00:30:00.000Z', // JST 09:30
        '2026-05-27T08:00:00.000Z', // JST 17:00
        '09:00:00',
        '17:00:00',
        '2026-05-27'
      );
      expect(r.status).toBe('遅刻');
      expect(r.overtimeMinutes).toBe(0);
    });

    it('JST16:00退勤(所定17:00)は早退・残業0', () => {
      const r = calculateWorkTimeAndStatus(
        '2026-05-27T00:00:00.000Z', // JST 09:00
        '2026-05-27T07:00:00.000Z', // JST 16:00
        '09:00:00',
        '17:00:00',
        '2026-05-27'
      );
      expect(r.status).toBe('早退');
      expect(r.overtimeMinutes).toBe(0);
    });

    it('遅刻かつ残業は遅刻・残業', () => {
      const r = calculateWorkTimeAndStatus(
        '2026-05-27T00:30:00.000Z', // JST 09:30 遅刻
        '2026-05-27T09:00:00.000Z', // JST 18:00 残業
        '09:00:00',
        '17:00:00',
        '2026-05-27'
      );
      expect(r.status).toBe('遅刻・残業');
      expect(r.overtimeMinutes).toBe(60);
    });

    it('遅刻かつ早退は遅刻・早退', () => {
      const r = calculateWorkTimeAndStatus(
        '2026-05-27T00:30:00.000Z', // JST 09:30 遅刻
        '2026-05-27T07:00:00.000Z', // JST 16:00 早退
        '09:00:00',
        '17:00:00',
        '2026-05-27'
      );
      expect(r.status).toBe('遅刻・早退');
      expect(r.overtimeMinutes).toBe(0);
    });
  });

  describe('退勤前（clockOut=null）', () => {
    it('定時内出勤は通常・残業0', () => {
      const r = calculateWorkTimeAndStatus('2026-05-27T00:00:00.000Z', null, '09:00:00', '17:00:00', '2026-05-27');
      expect(r.status).toBe('通常');
      expect(r.overtimeMinutes).toBe(0);
      expect(r.actualWorkHours).toBe(0);
    });

    it('始業後の出勤は遅刻', () => {
      const r = calculateWorkTimeAndStatus('2026-05-27T00:30:00.000Z', null, '09:00:00', '17:00:00', '2026-05-27');
      expect(r.status).toBe('遅刻');
      expect(r.overtimeMinutes).toBe(0);
    });

    it('出勤なし(clockIn=null)は通常・残業0', () => {
      const r = calculateWorkTimeAndStatus(null, null, '09:00:00', '17:00:00', '2026-05-27');
      expect(r.status).toBe('通常');
      expect(r.overtimeMinutes).toBe(0);
    });
  });

  describe('時刻文字列・recordDate省略の互換', () => {
    it('work時刻が "HH:MM" でも "HH:MM:SS" でも同じ結果', () => {
      const a = calculateWorkTimeAndStatus('2026-05-27T00:00:00.000Z', '2026-05-27T09:00:00.000Z', '09:00:00', '17:00:00', '2026-05-27');
      const b = calculateWorkTimeAndStatus('2026-05-27T00:00:00.000Z', '2026-05-27T09:00:00.000Z', '09:00', '17:00', '2026-05-27');
      expect(b.status).toBe(a.status);
      expect(b.overtimeMinutes).toBe(a.overtimeMinutes);
      expect(b.overtimeMinutes).toBe(60); // JST18:00退勤
    });

    it('recordDate省略時はclockInのJST日付で判定（同日内）', () => {
      // JST 09:00出勤・JST 18:00退勤、recordDate省略
      const r = calculateWorkTimeAndStatus('2026-05-27T00:00:00.000Z', '2026-05-27T09:00:00.000Z', '09:00:00', '17:00:00');
      expect(r.status).toBe('残業');
      expect(r.overtimeMinutes).toBe(60);
    });
  });
});
