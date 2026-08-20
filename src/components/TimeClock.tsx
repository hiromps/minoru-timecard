import React, { useState, useEffect, useCallback } from 'react';
import { ClockCircle, ChevronDown, Calendar, Login, Logout, UserAdd, Edit } from 'reicon-react';
import './TimeClock.css';
import { Employee, TimeRecord } from '../lib/supabase';
import { employeeService, timeRecordService } from '../lib/database';
import { formatWorkHours } from '../utils/timeUtils';
import {
  localDateTimeToISO,
  getJSTDate,
  getJSTTimeString,
  getJSTYearMonth,
  getJSTTimeParts,
  getJSTFullDateLabel,
} from '../utils/dateUtils';

// ステータス→表示用CSSクラス変換（本日の状況・勤務記録の両方で使用）
const statusToClass = (status: string | null | undefined): string => {
  if (status === '通常') return 'normal';
  if (status === '欠勤') return 'absence';
  const s = status ?? '';
  if (s.includes('遅刻')) return 'late';
  if (s.includes('早退')) return 'early';
  if (s.includes('残業')) return 'overtime';
  return 'normal';
};

// ステータス→表示ラベル変換（本日の状況・勤務記録の両方で使用）
const statusToLabel = (status: string | null | undefined): string => {
  switch (status) {
    case '通常': return '通常';
    case '遅刻': return '遅刻';
    case '早退': return '早退';
    case '残業': return '残業';
    case '遅刻・早退': return '遅刻・早退';
    case '遅刻・残業': return '遅刻・残業';
    case '欠勤': return '欠勤';
    default: return status ?? '';
  }
};

// 本日の状況カード用の表示ステータス（出勤中は退勤前であることを最優先で示す）
const getTodayDisplayStatus = (record: TimeRecord | null): { label: string; className: string } => {
  if (!record) return { label: '', className: 'normal' };
  if (record.clock_in_time && !record.clock_out_time) {
    return { label: '出勤中', className: 'working' };
  }
  return { label: statusToLabel(record.status), className: statusToClass(record.status) };
};

// 欠勤・休暇理由のクイック選択プリセット
const ABSENCE_REASON_PRESETS = ['体調不良', '有給休暇', '家庭都合', '慶弔休暇'] as const;

const TimeClock: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [now, setNow] = useState<Date>(new Date());
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [clockType, setClockType] = useState<'in' | 'out'>('in');
  const [employeeRecords, setEmployeeRecords] = useState<TimeRecord[]>([]);
  const [specifiedTime, setSpecifiedTime] = useState<string>('');
  const [isDirectWork, setIsDirectWork] = useState<boolean>(false);
  const [useSpecifiedTime, setUseSpecifiedTime] = useState<boolean>(false);
  const [showCalendar, setShowCalendar] = useState<boolean>(false);
  // 年月はJST基準で取得（ローカルゲッターは月境界でズレるため使わない）
  const [currentYearMonth] = useState<{ year: number; month: number }>(() => getJSTYearMonth());
  const [todayRecord, setTodayRecord] = useState<TimeRecord | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [recordsError, setRecordsError] = useState<boolean>(false);
  const [todayRecordError, setTodayRecordError] = useState<boolean>(false);
  const [showAbsenceModal, setShowAbsenceModal] = useState<boolean>(false);
  const [absenceReason, setAbsenceReason] = useState<string>('');

  const fetchEmployeeRecords = useCallback(async (employeeId: string) => {
    try {
      const { year, month } = currentYearMonth;
      const data = await timeRecordService.getEmployeeRecords(employeeId, year, month);

      setEmployeeRecords(data);
      setRecordsError(false);
    } catch (error) {
      console.error('社員の打刻記録取得に失敗しました:', error);
      setRecordsError(true);
    }
  }, [currentYearMonth]);

  const fetchTodayRecord = useCallback(async (employeeId: string) => {
    try {
      const data = await timeRecordService.getTodayRecord(employeeId);
      setTodayRecord(data);
      setTodayRecordError(false);
    } catch (error) {
      console.error('本日の記録取得に失敗しました:', error);
      setTodayRecordError(true);
    }
  }, []);

  useEffect(() => {
    // アンマウント後のsetStateを防ぐためのフラグ
    let ignore = false;
    const fetchEmployees = async () => {
      try {
        const data = await employeeService.getAll();
        if (ignore) return;
        setEmployees(data);
        console.log('社員データを正常に取得しました:', data.length + '件');
      } catch (error) {
        console.error('社員データの取得に失敗しました:', error);
        if (!ignore) {
          alert('社員データの取得に失敗しました。管理者にお問い合わせください。\n' +
                'エラー: ' + (error as Error).message);
        }
      }
    };
    fetchEmployees();

    const tick = () => setNow(new Date());
    tick();
    const interval = setInterval(tick, 1000);
    return () => {
      ignore = true;
      clearInterval(interval);
    };
  }, []);

  // 社員が変更された時にカレンダーが開いている場合は自動で更新
  useEffect(() => {
    if (selectedEmployee && showCalendar) {
      fetchEmployeeRecords(selectedEmployee);
    }
    // 社員が変更された時は今日の記録も更新
    if (selectedEmployee) {
      fetchTodayRecord(selectedEmployee);
    }
  }, [selectedEmployee, showCalendar, fetchEmployeeRecords, fetchTodayRecord]);

  const handleClockAction = async (type: 'in' | 'out') => {
    if (!selectedEmployee) {
      alert('社員を選択してください');
      return;
    }
    setClockType(type);

    // 退勤打刻の場合、最新の本日記録を取得
    if (type === 'out') {
      await fetchTodayRecord(selectedEmployee);
    }

    // デフォルト値を設定（JST基準。ブラウザのタイムゾーンに依存しない）
    setSpecifiedTime(getJSTTimeString()); // HH:MM形式
    setUseSpecifiedTime(false);
    setIsDirectWork(false);

    setShowConfirmModal(true);
  };

  const confirmClockAction = async () => {
    // 二重送信防止：処理中は何もしない
    if (isSubmitting) return;

    // 時刻未入力バリデーション（モーダルは閉じずに再入力を促す）
    if (useSpecifiedTime && !specifiedTime) {
      alert('時刻を入力してください');
      return;
    }

    setIsSubmitting(true);
    try {
      if (useSpecifiedTime) {
        // 時刻指定の場合
        // 指定時刻をISO形式に変換（タイムゾーンを考慮）
        // 重要: 日付はJST基準で取得する。new Date().toISOString() はUTC日付を返すため、
        // JSTの午前0時〜9時台では前日にズレ、退勤時刻が出勤時刻より前の絶対時刻になり、
        // DB制約 check_clock_times (退勤 > 出勤) 違反で退勤できない不具合が発生していた。
        const today = getJSTDate(); // YYYY-MM-DD（JST）
        const datetimeLocal = `${today}T${specifiedTime}`; // YYYY-MM-DDTHH:MM
        const isoTime = localDateTimeToISO(datetimeLocal);

        if (clockType === 'in') {
          await timeRecordService.clockInWithTime(selectedEmployee, isoTime, isDirectWork);
        } else {
          await timeRecordService.clockOutWithTime(selectedEmployee, isoTime, isDirectWork);
        }

        const action = clockType === 'in' ? '出勤' : '退勤';
        const modeText = isDirectWork ? '（直行・直帰）' : '';
        alert(`${action}打刻が完了しました${modeText}`);
      } else {
        // 通常打刻の場合
        if (clockType === 'in') {
          await timeRecordService.clockIn(selectedEmployee);
        } else {
          await timeRecordService.clockOut(selectedEmployee);
        }

        const action = clockType === 'in' ? '出勤' : '退勤';
        alert(`${action}打刻が完了しました`);
      }

      // 打刻成功後、記録を更新
      if (selectedEmployee && showCalendar) {
        await fetchEmployeeRecords(selectedEmployee);
      }

      // 今日の記録も更新
      if (selectedEmployee) {
        await fetchTodayRecord(selectedEmployee);
      }

      // 社員選択をリセット
      setSelectedEmployee('');
      setTodayRecord(null);
    } catch (error) {
      console.error('打刻に失敗しました:', error);
      alert(`打刻に失敗しました: ${error instanceof Error ? error.message : 'エラーが発生しました'}`);
    } finally {
      setIsSubmitting(false);
      setShowConfirmModal(false);
      setUseSpecifiedTime(false);
      setIsDirectWork(false);
    }
  };


  const handleAbsenceAction = () => {
    if (!selectedEmployee) {
      alert('社員を選択してください');
      return;
    }
    setAbsenceReason('');
    setShowAbsenceModal(true);
  };

  // クイック理由チップ：理由を反映した状態で確認モーダルを開く（即時登録はしない）
  const handleAbsencePreset = (preset: string) => {
    if (!selectedEmployee) {
      alert('社員を選択してください');
      return;
    }
    setAbsenceReason(preset);
    setShowAbsenceModal(true);
  };

  const confirmAbsenceAction = async () => {
    // 二重送信防止：処理中は何もしない
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      await timeRecordService.markAbsence(selectedEmployee, absenceReason);
      alert('本日の欠勤を記録しました');

      if (selectedEmployee && showCalendar) {
        await fetchEmployeeRecords(selectedEmployee);
      }
      if (selectedEmployee) {
        await fetchTodayRecord(selectedEmployee);
      }

      setSelectedEmployee('');
      setTodayRecord(null);
    } catch (error) {
      console.error('欠勤登録に失敗しました:', error);
      alert(`欠勤登録に失敗しました: ${error instanceof Error ? error.message : 'エラーが発生しました'}`);
    } finally {
      setIsSubmitting(false);
      setShowAbsenceModal(false);
      setAbsenceReason('');
    }
  };

  const selectedEmployeeName = employees.find(emp => emp.employee_id === selectedEmployee)?.name || '';

  const handleEmployeeChange = (employeeId: string) => {
    setSelectedEmployee(employeeId);
    if (!employeeId) {
      setTodayRecord(null);
    }
    // fetchTodayRecord will be called by useEffect when selectedEmployee changes
  };

  const toggleCalendar = () => {
    setShowCalendar(!showCalendar);
    if (!showCalendar && selectedEmployee) {
      fetchEmployeeRecords(selectedEmployee);
    }
  };


  const formatTime = (timeString: string | null) => {
    if (!timeString) return '--:--';
    const d = new Date(timeString);
    if (isNaN(d.getTime())) return '--:--';
    return d.toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Tokyo' // ブラウザのタイムゾーンに依存しない
    });
  };

  // 勤務記録一覧用：YYYY/MM/DD（曜）形式（JST基準）
  const formatDateWithWeekday = (dateString: string | null) => {
    if (!dateString) return '—';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '—';
    const datePart = d.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'Asia/Tokyo',
    });
    const weekday = d.toLocaleDateString('ja-JP', { weekday: 'short', timeZone: 'Asia/Tokyo' });
    return `${datePart}（${weekday}）`;
  };

  const { hours, minutes, seconds } = getJSTTimeParts(now);
  const todayDisplayStatus = getTodayDisplayStatus(todayRecord);

  return (
    <div className="time-clock">
      <div className="tc-row tc-row-clock-employee">
        <div className="clock-header-compact">
          <div className="card-header-row">
            <ClockCircle size={18} className="card-header-icon" />
            <h2>現在時刻</h2>
          </div>
          <div className="current-date-compact">{getJSTFullDateLabel(now)}</div>
          <div className="current-time-split">
            <span className="time-part"><span className="time-num">{hours}</span><span className="time-unit">時</span></span>
            <span className="time-part"><span className="time-num">{minutes}</span><span className="time-unit">分</span></span>
            <span className="time-part"><span className="time-num">{seconds}</span><span className="time-unit">秒</span></span>
          </div>
        </div>

        <div className="employee-select-compact">
          <label>社員選択</label>
          <div className="select-wrapper">
            <select
              value={selectedEmployee}
              onChange={(e) => handleEmployeeChange(e.target.value)}
            >
              <option value="">社員を選択してください</option>
              {employees.map((employee) => (
                <option key={employee.employee_id} value={employee.employee_id}>
                  {employee.employee_id} - {employee.name}
                </option>
              ))}
            </select>
            <ChevronDown size={18} className="select-chevron" />
          </div>
        </div>
      </div>

      {selectedEmployee && (
        <div className="tc-row tc-row-status-buttons-absence">
          {todayRecordError && (
            <div className="today-status-container">
              <div className="today-status-header">
                <Calendar size={18} className="card-header-icon" />
                <h3>本日の状況</h3>
              </div>
              <div className="today-status-card">
                <div className="today-status-error">記録の取得に失敗しました</div>
              </div>
            </div>
          )}

          {todayRecord && !todayRecordError && (
            <div className="today-status-container">
              <div className="today-status-header">
                <Calendar size={18} className="card-header-icon" />
                <h3>本日の状況</h3>
              </div>
              <div className="today-status-card">
                <div className="status-row">
                  <span className="status-row-label">本日の日付</span>
                  <span className="status-row-value">{getJSTFullDateLabel(now)}</span>
                </div>
                <div className="status-row">
                  <span className="status-row-label">ステータス</span>
                  <span className={`status-row-value status-text-${todayDisplayStatus.className}`}>
                    {todayDisplayStatus.label}
                  </span>
                </div>
                <div className="status-row">
                  <span className="status-row-label">出勤時間</span>
                  <span className="status-row-value">{formatTime(todayRecord.clock_in_time)}</span>
                </div>
                <div className="status-row">
                  <span className="status-row-label">退勤時間</span>
                  <span className="status-row-value">{formatTime(todayRecord.clock_out_time)}</span>
                </div>
                {todayRecord.work_hours > 0 && (
                  <div className="status-row">
                    <span className="status-row-label">勤務時間</span>
                    <span className="status-row-value status-row-value-hours">{formatWorkHours(todayRecord.work_hours)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="clock-buttons-top">
            <button
              onClick={() => handleClockAction('in')}
              className="btn btn-clock-in"
              disabled={isSubmitting}
            >
              <Login size={22} />
              <span>出勤</span>
            </button>
            <button
              onClick={() => handleClockAction('out')}
              className="btn btn-clock-out"
              disabled={isSubmitting}
            >
              <Logout size={22} />
              <span>退勤</span>
            </button>
          </div>

          <div className="absence-card">
            <div className="card-header-row">
              <UserAdd size={18} className="card-header-icon" />
              <h3>休暇・欠勤理由を登録</h3>
            </div>
            <p className="absence-card-desc">欠勤や休暇の場合は、理由を選択して登録してください。</p>
            <div className="absence-reason-chips">
              {ABSENCE_REASON_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className="absence-chip"
                  onClick={() => handleAbsencePreset(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>
            <button type="button" className="btn-absence-register" onClick={handleAbsenceAction}>
              <Edit size={18} />
              <span>休暇・欠勤理由を登録</span>
            </button>
          </div>
        </div>
      )}

      {selectedEmployee && (
        <div className={`employee-calendar-compact ${!showCalendar ? 'collapsed' : ''}`}>
          <div className="calendar-toggle" onClick={toggleCalendar}>
            <div className="card-header-row">
              <Calendar size={18} className="card-header-icon" />
              <h3>{currentYearMonth.year}年{currentYearMonth.month}月の勤務記録</h3>
            </div>
            <ChevronDown size={18} className={`toggle-icon ${!showCalendar ? 'collapsed' : ''}`} />
          </div>

          {showCalendar && (
            <div className="records-list-compact">
              {recordsError ? (
                <div className="no-records">記録の取得に失敗しました</div>
              ) : employeeRecords.length === 0 ? (
                <div className="no-records">記録がありません</div>
              ) : (
                employeeRecords.map((record) => {
                  const cls = statusToClass(record.status);
                  const isAbsence = record.status === '欠勤';
                  return (
                    <div key={record.id} className="record-row">
                      <span className="record-row-date">{formatDateWithWeekday(record.record_date)}</span>
                      {isAbsence ? (
                        <span className={`record-row-status status-text-${cls}`}>{statusToLabel(record.status)}</span>
                      ) : (
                        <span className="record-row-times">
                          出勤 {formatTime(record.clock_in_time)} / 退勤 {formatTime(record.clock_out_time)}
                          {cls !== 'normal' && (
                            <span className={`record-row-status-inline status-text-${cls}`}>
                              ・{statusToLabel(record.status)}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {showConfirmModal && (
        <div className="modal-overlay">
          <div className={`modal ${clockType === 'in' ? 'modal-clock-in' : 'modal-clock-out'}`}>
            <div className={`modal-header ${clockType === 'in' ? 'modal-header-clock-in' : 'modal-header-clock-out'}`}>
              <h3>
                {clockType === 'in' ? '出勤' : '退勤'}打刻
                <span className={clockType === 'in' ? 'operation-in' : 'operation-out'}>
                  {clockType === 'in' ? '出勤' : '退勤'}
                </span>
              </h3>
            </div>
            <div className="modal-body">
              <p>
                <strong>{selectedEmployeeName}</strong>さんの<strong>{clockType === 'in' ? '出勤' : '退勤'}</strong>を記録します
              </p>

              <div className="modal-field-group">
                <label className="modal-radio-label">
                  <input
                    type="radio"
                    name="timeMode"
                    checked={!useSpecifiedTime}
                    onChange={() => setUseSpecifiedTime(false)}
                    className="modal-check-input"
                  />
                  現在時刻で打刻: <strong>{getJSTTimeString(now)}</strong>
                </label>

                <label className="modal-radio-label modal-radio-label-last">
                  <input
                    type="radio"
                    name="timeMode"
                    checked={useSpecifiedTime}
                    onChange={() => setUseSpecifiedTime(true)}
                    className="modal-check-input"
                  />
                  時刻を指定
                </label>
              </div>

              {useSpecifiedTime && (
                <div className="modal-field-subgroup">
                  <div className="modal-field-row">
                    <label className="modal-field-label">
                      {clockType === 'in' ? '出勤' : '退勤'}時刻:
                    </label>
                    <input
                      type="time"
                      value={specifiedTime}
                      onChange={(e) => setSpecifiedTime(e.target.value)}
                      className="modal-time-input"
                    />
                  </div>
                  <div>
                    <label className="modal-radio-label">
                      <input
                        type="checkbox"
                        checked={isDirectWork}
                        onChange={(e) => setIsDirectWork(e.target.checked)}
                        className="modal-check-input"
                      />
                      直行・直帰モード（遅刻・早退判定を無効化）
                    </label>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button onClick={() => setShowConfirmModal(false)}>
                キャンセル
              </button>
              <button
                onClick={confirmClockAction}
                disabled={isSubmitting}
                className={`btn-primary ${clockType === 'in' ? 'btn-confirm-in' : 'btn-confirm-out'}`}
              >
                {isSubmitting ? '処理中...' : '確認'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAbsenceModal && (
        <div className="modal-overlay">
          <div className="modal modal-absence">
            <div className="modal-header modal-header-absence">
              <h3>
                欠勤登録
                <span className="operation-absence">欠勤</span>
              </h3>
            </div>
            <div className="modal-body">
              <p>
                <strong>{selectedEmployeeName}</strong>さんの本日を<strong>欠勤</strong>として記録します
              </p>

              <div className="modal-field-group">
                <label className="modal-field-label">
                  理由（任意）:
                </label>
                <textarea
                  value={absenceReason}
                  onChange={(e) => setAbsenceReason(e.target.value)}
                  placeholder="例: 体調不良のため"
                  rows={3}
                  className="modal-textarea"
                />
              </div>
            </div>
            <div className="modal-actions">
              <button onClick={() => setShowAbsenceModal(false)}>
                キャンセル
              </button>
              <button
                onClick={confirmAbsenceAction}
                disabled={isSubmitting}
                className="btn-primary btn-confirm-absence"
              >
                {isSubmitting ? '処理中...' : '確認'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimeClock;
