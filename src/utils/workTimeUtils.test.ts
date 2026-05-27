import { calculateWorkTimeAndStatus } from './workTimeUtils';

/**
 * 統一計算関数 calculateWorkTimeAndStatus のテスト
 *
 * 仕様（DBの work_start_time / work_end_time 基準）:
 * - 遅刻: 出勤時刻 > work_start_time
 * - 早退: 退勤時刻 < work_end_time
 * - 残業: 退勤時刻 > work_end_time
 * - 残業時間（分）: max(0, 退勤時刻 - work_end_time)
 * - 労働時間: 実打刻ベース (退勤 - 出勤)
 *
 * ※ 時刻は同一ローカル日付内で組み立てる前提のため、
 *    "YYYY-MM-DDTHH:MM:SS"（タイムゾーン指定なし=ローカル）で渡す。
 */
describe('calculateWorkTimeAndStatus', () => {
  const baseDate = '2026-05-27';
  const at = (hhmm: string) => `${baseDate}T${hhmm}:00`;

  describe('退勤前（clockOut=null）', () => {
    it('定時内出勤は通常・残業0', () => {
      const r = calculateWorkTimeAndStatus(at('09:00'), null, '09:00', '17:00');
      expect(r.status).toBe('通常');
      expect(r.overtimeMinutes).toBe(0);
      expect(r.actualWorkHours).toBe(0);
    });

    it('始業後の出勤は遅刻・残業0', () => {
      const r = calculateWorkTimeAndStatus(at('09:30'), null, '09:00', '17:00');
      expect(r.status).toBe('遅刻');
      expect(r.overtimeMinutes).toBe(0);
    });

    it('出勤なし(clockIn=null)は通常・残業0', () => {
      const r = calculateWorkTimeAndStatus(null, null, '09:00', '17:00');
      expect(r.status).toBe('通常');
      expect(r.overtimeMinutes).toBe(0);
      expect(r.actualWorkHours).toBe(0);
    });
  });

  describe('通常勤務', () => {
    it('定時ぴったりは通常・残業0', () => {
      const r = calculateWorkTimeAndStatus(at('09:00'), at('17:00'), '09:00', '17:00');
      expect(r.status).toBe('通常');
      expect(r.overtimeMinutes).toBe(0);
      expect(r.actualWorkHours).toBe(8);
    });
  });

  describe('残業', () => {
    it('所定退勤を超えると残業・残業分を計上', () => {
      const r = calculateWorkTimeAndStatus(at('09:00'), at('19:30'), '09:00', '17:00');
      expect(r.status).toBe('残業');
      expect(r.overtimeMinutes).toBe(150); // 17:00 → 19:30 = 150分
      expect(r.actualWorkHours).toBe(10.5);
    });

    it('遅刻かつ残業は遅刻・残業', () => {
      const r = calculateWorkTimeAndStatus(at('09:30'), at('18:00'), '09:00', '17:00');
      expect(r.status).toBe('遅刻・残業');
      expect(r.overtimeMinutes).toBe(60);
    });
  });

  describe('早退', () => {
    it('所定退勤より前の退勤は早退・残業0', () => {
      const r = calculateWorkTimeAndStatus(at('09:00'), at('16:00'), '09:00', '17:00');
      expect(r.status).toBe('早退');
      expect(r.overtimeMinutes).toBe(0);
    });

    it('遅刻かつ早退は遅刻・早退', () => {
      const r = calculateWorkTimeAndStatus(at('09:30'), at('16:00'), '09:00', '17:00');
      expect(r.status).toBe('遅刻・早退');
      expect(r.overtimeMinutes).toBe(0);
    });
  });

  describe('社員別の所定勤務時間（DB基準）', () => {
    it('所定退勤16:00の社員は16:00退勤で通常・残業0', () => {
      const r = calculateWorkTimeAndStatus(at('09:00'), at('16:00'), '09:00', '16:00');
      expect(r.status).toBe('通常');
      expect(r.overtimeMinutes).toBe(0);
    });

    it('所定退勤16:00の社員は17:00退勤で残業60分', () => {
      const r = calculateWorkTimeAndStatus(at('09:00'), at('17:00'), '09:00', '16:00');
      expect(r.status).toBe('残業');
      expect(r.overtimeMinutes).toBe(60);
    });
  });

  describe('時刻文字列の秒補正', () => {
    it('"HH:MM"でも"HH:MM:SS"でも同じ結果', () => {
      const withSeconds = calculateWorkTimeAndStatus(at('09:00'), at('18:00'), '09:00:00', '17:00:00');
      const withoutSeconds = calculateWorkTimeAndStatus(at('09:00'), at('18:00'), '09:00', '17:00');
      expect(withoutSeconds.status).toBe(withSeconds.status);
      expect(withoutSeconds.overtimeMinutes).toBe(withSeconds.overtimeMinutes);
      expect(withoutSeconds.overtimeMinutes).toBe(60);
    });
  });
});
