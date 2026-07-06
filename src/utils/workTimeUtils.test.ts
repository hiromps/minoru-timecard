import { calculateWorkTimeAndStatus, applyDirectWorkOverride } from './workTimeUtils';

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
      expect(r.actualWorkHours).toBe(7); // 9-17時=8h、昼休憩12-13時を控除して7h
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

  describe('昼休憩(12:00-13:00)の控除', () => {
    it('9:00-17:00 は休憩1h控除で実労働7h', () => {
      const r = calculateWorkTimeAndStatus(
        '2026-05-27T00:00:00.000Z', // JST 09:00
        '2026-05-27T08:00:00.000Z', // JST 17:00
        '09:00:00', '17:00:00', '2026-05-27'
      );
      expect(r.actualWorkHours).toBe(7);
    });

    it('午前のみ勤務 9:00-12:00 は休憩と重ならず3h', () => {
      const r = calculateWorkTimeAndStatus(
        '2026-05-27T00:00:00.000Z', // JST 09:00
        '2026-05-27T03:00:00.000Z', // JST 12:00 ちょうど
        '09:00:00', '17:00:00', '2026-05-27'
      );
      expect(r.actualWorkHours).toBe(3);
    });

    it('午後のみ勤務 13:00-17:00 は休憩と重ならず4h', () => {
      const r = calculateWorkTimeAndStatus(
        '2026-05-27T04:00:00.000Z', // JST 13:00 ちょうど
        '2026-05-27T08:00:00.000Z', // JST 17:00
        '09:00:00', '17:00:00', '2026-05-27'
      );
      expect(r.actualWorkHours).toBe(4);
    });

    it('11:30-12:30 は休憩と30分だけ重なり実労働0.5h', () => {
      const r = calculateWorkTimeAndStatus(
        '2026-05-27T02:30:00.000Z', // JST 11:30
        '2026-05-27T03:30:00.000Z', // JST 12:30
        '09:00:00', '17:00:00', '2026-05-27'
      );
      // gross 60分 - 重なり30分 = 30分 = 0.5h
      expect(r.actualWorkHours).toBe(0.5);
    });
  });

  describe('不正データ・設定ミスの検出（設定エラー）', () => {
    it('退勤 <= 出勤（負の勤務時間）は設定エラー', () => {
      const r = calculateWorkTimeAndStatus(
        '2026-05-27T08:00:00.000Z', // JST 17:00 出勤
        '2026-05-27T00:00:00.000Z', // JST 09:00 退勤（出勤より前）
        '09:00:00',
        '17:00:00',
        '2026-05-27'
      );
      expect(r.status).toBe('設定エラー');
      expect(r.actualWorkHours).toBe(0);
      expect(r.overtimeMinutes).toBe(0);
    });

    it('出勤なしで退勤ありは設定エラー', () => {
      const r = calculateWorkTimeAndStatus(
        null,
        '2026-05-27T08:00:00.000Z',
        '09:00:00',
        '17:00:00',
        '2026-05-27'
      );
      expect(r.status).toBe('設定エラー');
    });

    it('所定終業 <= 所定始業（社員設定ミス）は設定エラー', () => {
      const r = calculateWorkTimeAndStatus(
        '2026-05-27T00:00:00.000Z',
        '2026-05-27T08:00:00.000Z',
        '17:00:00', // 始業17:00
        '08:00:00', // 終業08:00（始業より前=設定ミス）
        '2026-05-27'
      );
      expect(r.status).toBe('設定エラー');
      expect(r.overtimeMinutes).toBe(0);
    });
  });

  describe('残業ステータスと残業分の整合（丸め境界）', () => {
    it('所定終業+20秒（丸めで0分）は残業にならず通常', () => {
      const r = calculateWorkTimeAndStatus(
        '2026-05-27T00:00:00.000Z', // JST 09:00
        '2026-05-27T08:00:20.000Z', // JST 17:00:20（所定+20秒）
        '09:00:00',
        '17:00:00',
        '2026-05-27'
      );
      // round(20秒)=0分 → 残業0、ステータスも残業にしない（矛盾レコード防止）
      expect(r.overtimeMinutes).toBe(0);
      expect(r.status).toBe('通常');
    });

    it('所定終業+40秒（丸めで1分）は残業1分', () => {
      const r = calculateWorkTimeAndStatus(
        '2026-05-27T00:00:00.000Z',
        '2026-05-27T08:00:40.000Z', // JST 17:00:40
        '09:00:00',
        '17:00:00',
        '2026-05-27'
      );
      expect(r.overtimeMinutes).toBe(1);
      expect(r.status).toBe('残業');
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

  describe('applyDirectWorkOverride（直行直帰）', () => {
    it('直行直帰でない場合は結果をそのまま返す', () => {
      const r = { actualWorkHours: 7, status: '遅刻' as const, overtimeMinutes: 30 };
      expect(applyDirectWorkOverride(r, false)).toEqual(r);
    });

    it('直行直帰なら遅刻を通常に、残業を0にする（労働時間は維持）', () => {
      const r = { actualWorkHours: 7, status: '遅刻・残業' as const, overtimeMinutes: 30 };
      const out = applyDirectWorkOverride(r, true);
      expect(out.status).toBe('通常');
      expect(out.overtimeMinutes).toBe(0);
      expect(out.actualWorkHours).toBe(7);
    });

    it('直行直帰でも「設定エラー」はそのまま表面化させる', () => {
      const r = { actualWorkHours: 0, status: '設定エラー' as const, overtimeMinutes: 0 };
      expect(applyDirectWorkOverride(r, true).status).toBe('設定エラー');
    });

    it('遅刻の記録でも直行直帰なら通常扱い（実打刻から計算→上書き）', () => {
      // JST 10:00出勤（遅刻）・JST 19:00退勤（残業）
      const base = calculateWorkTimeAndStatus(
        '2026-05-27T01:00:00.000Z',
        '2026-05-27T10:00:00.000Z',
        '09:00:00',
        '17:00:00',
        '2026-05-27'
      );
      expect(base.status).toBe('遅刻・残業');
      const out = applyDirectWorkOverride(base, true);
      expect(out.status).toBe('通常');
      expect(out.overtimeMinutes).toBe(0);
      // 労働時間は計上される（>0）
      expect(out.actualWorkHours).toBeGreaterThan(0);
    });
  });
});
