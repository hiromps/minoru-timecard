import React, { useState, useEffect, useCallback } from 'react';
import './TimeClock.css';
import { Employee, TimeRecord } from '../lib/supabase';
import { employeeService, timeRecordService } from '../lib/database';
import { formatWorkHours } from '../utils/timeUtils';
import { localDateTimeToISO, getJSTDate, getJSTTimeString, getJSTYearMonth } from '../utils/dateUtils';

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

// ステータス→絵文字付きラベル変換（本日の状況・勤務記録の両方で使用）
const statusToLabel = (status: string | null | undefined): string => {
  switch (status) {
    case '通常': return '✅ 通常';
    case '遅刻': return '⚠️ 遅刻';
    case '早退': return '🏃 早退';
    case '残業': return '💪 残業';
    case '遅刻・早退': return '⚠️🏃 遅刻・早退';
    case '遅刻・残業': return '⚠️💪 遅刻・残業';
    case '欠勤': return '🤒 欠勤';
    default: return status ?? '';
  }
};

const TimeClock: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [currentTime, setCurrentTime] = useState<string>('');
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
    updateCurrentTime();
    const interval = setInterval(updateCurrentTime, 1000);
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

  const updateCurrentTime = () => {
    const now = new Date();
    setCurrentTime(now.toLocaleString('ja-JP'));
  };

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

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '—';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });
  };

  return (
    <div className="time-clock">
      <div className="clock-header-compact">
        <h2>現在時刻</h2>
        <div className="current-time-compact">{currentTime}</div>
      </div>

      <div className="employee-select-compact">
        <label>社員選択</label>
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
      </div>

      {selectedEmployee && todayRecordError && (
        <div className="today-status-container">
          <div className="today-status-header">
            <h3>{selectedEmployeeName}さんの本日の状況</h3>
          </div>
          <div className="today-status-card">
            <div style={{ textAlign: 'center', color: '#c0392b', padding: '10px' }}>記録の取得に失敗しました</div>
          </div>
        </div>
      )}

      {selectedEmployee && todayRecord && !todayRecordError && (
        <div className="today-status-container">
          <div className="today-status-header">
            <h3>{selectedEmployeeName}さんの本日の状況</h3>
          </div>
          <div className="today-status-card">
            <div className="status-info-row">
              <div className="status-date">
                <span className="date-label">本日</span>
                <span className="date-value">{new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })}</span>
              </div>
              <div className={`status-badge-today status-${statusToClass(todayRecord.status)}`}>
                {statusToLabel(todayRecord.status)}
              </div>
            </div>
            <div className="time-info-row">
              <div className="time-info-item">
                <span className="time-label-compact">🌅 出勤</span>
                <span className="time-value-compact">{formatTime(todayRecord.clock_in_time)}</span>
              </div>
              <div className="time-info-item">
                <span className="time-label-compact">🌙 退勤</span>
                <span className="time-value-compact">{formatTime(todayRecord.clock_out_time)}</span>
              </div>
              {todayRecord.work_hours > 0 && (
                <div className="time-info-item">
                  <span className="time-label-compact">⏰ 勤務時間</span>
                  <span className="time-value-compact hours">{formatWorkHours(todayRecord.work_hours)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedEmployee && (
        <div className="clock-buttons-top">
          <button
            onClick={() => handleClockAction('in')}
            className="btn btn-clock-in"
          >
            出勤
          </button>
          <button
            onClick={() => handleClockAction('out')}
            className="btn btn-clock-out"
          >
            退勤
          </button>
          <button
            onClick={handleAbsenceAction}
            className="btn btn-absence"
          >
            🤒 欠勤
          </button>
        </div>
      )}

      {selectedEmployee && (
        <div className={`employee-calendar-compact ${!showCalendar ? 'collapsed' : ''}`}>
          <div className="calendar-toggle" onClick={toggleCalendar}>
            <h3>{currentYearMonth.year}年{currentYearMonth.month}月の勤務記録</h3>
            <span className={`toggle-icon ${!showCalendar ? 'collapsed' : ''}`}>▼</span>
          </div>
          
          {showCalendar && (
            <div className="records-list-compact">
              {recordsError ? (
                <div className="no-records">記録の取得に失敗しました</div>
              ) : employeeRecords.length === 0 ? (
                <div className="no-records">記録がありません</div>
              ) : (
                employeeRecords.map((record) => (
                  <div key={record.id} className="record-item-compact">
                    <div className="record-header">
                      <div className="record-date">{formatDate(record.record_date)}</div>
                      <div className={`record-status status-${statusToClass(record.status)}`}>
                        {statusToLabel(record.status)}
                      </div>
                    </div>
                    <div className="record-body">
                      <div className="record-time-group">
                        <div className="time-item">
                          <div className="time-label">🌅 出勤</div>
                          <div className="time-value">{formatTime(record.clock_in_time)}</div>
                        </div>
                        <div className="time-item">
                          <div className="time-label">🌙 退勤</div>
                          <div className="time-value">{formatTime(record.clock_out_time)}</div>
                        </div>
                      </div>
                      <div className="record-hours">
                        <div className="hours-label">⏰ 勤務時間</div>
                        <div className="hours-value">{record.clock_out_time ? formatWorkHours(record.work_hours) : '—'}</div>
                      </div>
                    </div>
                  </div>
                ))
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

              <div style={{ margin: '15px 0' }}>
                <label style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                  <input
                    type="radio"
                    name="timeMode"
                    checked={!useSpecifiedTime}
                    onChange={() => setUseSpecifiedTime(false)}
                    style={{ marginRight: '8px' }}
                  />
                  現在時刻で打刻: <strong>{currentTime}</strong>
                </label>

                <label style={{ display: 'flex', alignItems: 'center' }}>
                  <input
                    type="radio"
                    name="timeMode"
                    checked={useSpecifiedTime}
                    onChange={() => setUseSpecifiedTime(true)}
                    style={{ marginRight: '8px' }}
                  />
                  時刻を指定
                </label>
              </div>

              {useSpecifiedTime && (
                <div style={{ margin: '15px 0', paddingLeft: '20px' }}>
                  <div style={{ marginBottom: '10px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>
                      {clockType === 'in' ? '出勤' : '退勤'}時刻:
                    </label>
                    <input
                      type="time"
                      value={specifiedTime}
                      onChange={(e) => setSpecifiedTime(e.target.value)}
                      style={{ padding: '8px', fontSize: '16px', width: '120px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isDirectWork}
                        onChange={(e) => setIsDirectWork(e.target.checked)}
                        style={{ marginRight: '8px' }}
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

              <div style={{ margin: '15px 0' }}>
                <label style={{ display: 'block', marginBottom: '5px' }}>
                  理由（任意）:
                </label>
                <textarea
                  value={absenceReason}
                  onChange={(e) => setAbsenceReason(e.target.value)}
                  placeholder="例: 体調不良のため"
                  rows={3}
                  style={{ width: '100%', padding: '8px', fontSize: '16px', boxSizing: 'border-box' }}
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