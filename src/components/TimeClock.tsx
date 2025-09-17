import React, { useState, useEffect, useCallback } from 'react';
import './TimeClock.css';
import { Employee, TimeRecord } from '../lib/supabase';
import { employeeService, timeRecordService } from '../lib/database';
import { formatWorkHours } from '../utils/timeUtils';

const TimeClock: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [currentTime, setCurrentTime] = useState<string>('');
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [clockType, setClockType] = useState<'in' | 'out'>('in');
  const [employeeRecords, setEmployeeRecords] = useState<TimeRecord[]>([]);
  const [showCalendar, setShowCalendar] = useState<boolean>(false);
  const [currentDate] = useState<Date>(new Date());
  const [todayRecord, setTodayRecord] = useState<TimeRecord | null>(null);

  const fetchEmployeeRecords = useCallback(async (employeeId: string) => {
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;
      const data = await timeRecordService.getEmployeeRecords(employeeId, year, month);
      
      setEmployeeRecords(data);
    } catch (error) {
      console.error('社員の打刻記録取得に失敗しました:', error);
    }
  }, [currentDate]);

  const fetchTodayRecord = useCallback(async (employeeId: string) => {
    try {
      const data = await timeRecordService.getTodayRecord(employeeId);
      setTodayRecord(data);
    } catch (error) {
      console.error('本日の記録取得に失敗しました:', error);
    }
  }, []);

  useEffect(() => {
    fetchEmployees();
    updateCurrentTime();
    const interval = setInterval(updateCurrentTime, 1000);
    return () => clearInterval(interval);
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

  const fetchEmployees = async () => {
    try {
      const data = await employeeService.getAll();
      setEmployees(data);
      console.log('社員データを正常に取得しました:', data.length + '件');
    } catch (error) {
      console.error('社員データの取得に失敗しました:', error);
      alert('社員データの取得に失敗しました。管理者にお問い合わせください。\n' + 
            'エラー: ' + (error as Error).message);
    }
  };

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
    
    setShowConfirmModal(true);
  };

  const confirmClockAction = async () => {
    try {
      if (clockType === 'in') {
        await timeRecordService.clockIn(selectedEmployee);
      } else {
        await timeRecordService.clockOut(selectedEmployee);
      }

      const action = clockType === 'in' ? '出勤' : '退勤';
      alert(`${action}打刻が完了しました`);
      
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
      setShowConfirmModal(false);
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
    return new Date(timeString).toLocaleTimeString('ja-JP', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ja-JP');
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

      {selectedEmployee && todayRecord && (
        <div className="today-status-container">
          <div className="today-status-header">
            <h3>{selectedEmployeeName}さんの本日の状況</h3>
          </div>
          <div className="today-status-card">
            <div className="status-info-row">
              <div className="status-date">
                <span className="date-label">本日</span>
                <span className="date-value">{new Date().toLocaleDateString('ja-JP')}</span>
              </div>
              <div className={`status-badge-today status-${todayRecord.status === '通常' ? 'normal' : todayRecord.status === '遅刻' ? 'late' : todayRecord.status === '早退' ? 'early' : 'overtime'}`}>
                {todayRecord.status === '通常' ? '✅ 通常' : 
                 todayRecord.status === '遅刻' ? '⚠️ 遅刻' : 
                 todayRecord.status === '早退' ? '🏃 早退' : 
                 '💪 残業'}
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

      <div className="clock-buttons-top">
        <button 
          onClick={() => handleClockAction('in')} 
          disabled={!selectedEmployee}
          className="btn btn-clock-in"
        >
          出勤
        </button>
        <button 
          onClick={() => handleClockAction('out')} 
          disabled={!selectedEmployee}
          className="btn btn-clock-out"
        >
          退勤
        </button>
      </div>

      {selectedEmployee && (
        <div className={`employee-calendar-compact ${!showCalendar ? 'collapsed' : ''}`}>
          <div className="calendar-toggle" onClick={toggleCalendar}>
            <h3>{currentDate.getFullYear()}年{currentDate.getMonth() + 1}月の勤務記録</h3>
            <span className={`toggle-icon ${!showCalendar ? 'collapsed' : ''}`}>▼</span>
          </div>
          
          {showCalendar && (
            <div className="records-list-compact">
              {employeeRecords.length === 0 ? (
                <div className="no-records">記録がありません</div>
              ) : (
                employeeRecords.map((record) => (
                  <div key={record.id} className="record-item-compact">
                    <div className="record-header">
                      <div className="record-date">{formatDate(record.record_date)}</div>
                      <div className={`record-status status-${record.status === '通常' ? 'normal' : record.status === '遅刻' ? 'late' : record.status === '早退' ? 'early' : 'overtime'}`}>
                        {record.status === '通常' ? '✅ 通常' : 
                         record.status === '遅刻' ? '⚠️ 遅刻' : 
                         record.status === '早退' ? '🏃 早退' : 
                         '💪 残業'}
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
                        <div className="hours-value">{formatWorkHours(record.work_hours)}</div>
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
                {clockType === 'in' ? '出勤' : '退勤'}打刻確認
                <span className={clockType === 'in' ? 'operation-in' : 'operation-out'}>
                  {clockType === 'in' ? '出勤' : '退勤'}
                </span>
              </h3>
            </div>
            <div className="modal-body">
              <p>
                <strong>{selectedEmployeeName}</strong>さんの<strong>{clockType === 'in' ? '出勤' : '退勤'}</strong>を記録しますか？
              </p>
              <p>時刻: <strong>{currentTime}</strong></p>
            </div>
            <div className="modal-actions">
              <button onClick={() => setShowConfirmModal(false)}>
                キャンセル
              </button>
              <button 
                onClick={confirmClockAction} 
                className={`btn-primary ${clockType === 'in' ? 'btn-confirm-in' : 'btn-confirm-out'}`}
              >
                確認
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimeClock;