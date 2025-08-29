import React, { useState, useEffect } from 'react';
import './TimeRecordManagement.css';
import { getAllTimeRecords, correctTimeRecordByDeleteAndCreate, updateTimeRecord, getEmployees, TimeRecordWithEmployee, deleteTimeRecord, recalculateAllStatus } from '../lib/adminSupabase';
import { formatWorkHours } from '../utils/timeUtils';

// TimeRecordWithEmployeeを使用するため、ローカル定義は削除

interface Employee {
  id: number;
  employee_id: string;
  name: string;
}

interface CorrectionModalProps {
  record: TimeRecordWithEmployee | null;
  employees: Employee[];
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CorrectionData) => void;
  loading: boolean;
}

interface CorrectionData {
  employee_id: string;
  record_date: string;
  clock_in_time: string;
  clock_out_time: string;
  reason: string;
  action: 'update' | 'delete_and_create';
}

const CorrectionModal: React.FC<CorrectionModalProps> = ({
  record,
  employees,
  isOpen,
  onClose,
  onSubmit,
  loading
}) => {
  const [formData, setFormData] = useState<CorrectionData>({
    employee_id: '',
    record_date: '',
    clock_in_time: '',
    clock_out_time: '',
    reason: '',
    action: 'update'
  });

  // モーダル開閉時のbodyスクロール制御
  useEffect(() => {
    if (isOpen) {
      // モーダル開く時：背景のスクロールを無効化
      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = '17px'; // スクロールバー分の調整
    } else {
      // モーダル閉じる時：背景のスクロールを有効化
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    }

    // クリーンアップ
    return () => {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (record) {
      const formatDateTimeLocal = (dateTimeString: string | null) => {
        if (!dateTimeString) return '';
        const date = new Date(dateTimeString);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
      };

      setFormData({
        employee_id: record.employee_id,
        record_date: record.record_date,
        clock_in_time: formatDateTimeLocal(record.clock_in_time),
        clock_out_time: formatDateTimeLocal(record.clock_out_time),
        reason: '管理者による時刻修正',
        action: 'update'
      });
    }
  }, [record]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h3>打刻記録の修正</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        
        <form onSubmit={handleSubmit} className="correction-form">
          <div className="form-group">
            <label>社員:</label>
            <select
              value={formData.employee_id}
              onChange={(e) => setFormData(prev => ({ ...prev, employee_id: e.target.value }))}
              required
            >
              <option value="">選択してください</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.employee_id}>
                  {emp.employee_id} - {emp.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>日付:</label>
            <input
              type="date"
              value={formData.record_date}
              onChange={(e) => setFormData(prev => ({ ...prev, record_date: e.target.value }))}
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>出勤時刻:</label>
              <input
                type="datetime-local"
                value={formData.clock_in_time}
                onChange={(e) => setFormData(prev => ({ ...prev, clock_in_time: e.target.value }))}
                required
              />
              <small style={{color: '#666', fontSize: '12px', marginTop: '4px', display: 'block'}}>
                ※ 出勤時刻は必須です
              </small>
            </div>
            <div className="form-group">
              <label>退勤時刻:</label>
              <div className="time-input-group">
                <input
                  type="datetime-local"
                  value={formData.clock_out_time}
                  onChange={(e) => setFormData(prev => ({ ...prev, clock_out_time: e.target.value }))}
                  placeholder="未退勤の場合は空のままにしてください"
                />
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, clock_out_time: '' }))}
                  className="clear-time-btn"
                  title="退勤時刻を空にする"
                >
                  空にする
                </button>
              </div>
              <small style={{color: '#666', fontSize: '12px', marginTop: '4px', display: 'block'}}>
                ※ 未退勤の場合は「空にする」ボタンで空欄にできます
              </small>
            </div>
          </div>

          <div className="form-group">
            <label>修正方法:</label>
            <div className="radio-group">
              <label>
                <input
                  type="radio"
                  value="update"
                  checked={formData.action === 'update'}
                  onChange={(e) => setFormData(prev => ({ ...prev, action: e.target.value as 'update' }))}
                />
                既存記録を更新
              </label>
              <label>
                <input
                  type="radio"
                  value="delete_and_create"
                  checked={formData.action === 'delete_and_create'}
                  onChange={(e) => setFormData(prev => ({ ...prev, action: e.target.value as 'delete_and_create' }))}
                />
                削除して再作成（推奨）
              </label>
            </div>
          </div>

          <div className="form-group">
            <label>修正理由:</label>
            <textarea
              value={formData.reason}
              onChange={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))}
              placeholder="修正の理由を入力してください"
              required
              rows={3}
            />
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose} disabled={loading}>
              キャンセル
            </button>
            <button type="submit" className="primary-btn" disabled={loading}>
              {loading ? '処理中...' : '修正実行'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const TimeRecordManagement: React.FC = () => {
  const [timeRecords, setTimeRecords] = useState<TimeRecordWithEmployee[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [correctionModal, setCorrectionModal] = useState({
    isOpen: false,
    record: null as TimeRecordWithEmployee | null
  });
  const [filters, setFilters] = useState({
    date: '', // 初期値は空にして全ての日付を表示
    employeeId: '',
    showManualOnly: false
  });

  // データを取得する関数
  const fetchTimeRecords = async () => {
    console.log('🎯 fetchTimeRecords called - starting to fetch data...');
    setLoading(true);
    try {
      console.log('📞 Calling getAllTimeRecords...');
      const records = await getAllTimeRecords();
      console.log('✅ getAllTimeRecords completed. Records received:', records?.length || 0);
      console.log('📋 Records data:', records);
      setTimeRecords(records);
      console.log('✅ State updated with records');
    } catch (error) {
      console.error('❌ Error fetching time records:', error);
      alert('打刻記録の取得に失敗しました: ' + (error as Error).message);
    } finally {
      setLoading(false);
      console.log('🏁 fetchTimeRecords completed');
    }
  };

  // 社員データを取得する関数
  const fetchEmployees = async () => {
    try {
      const employeesData = await getEmployees();
      setEmployees(employeesData);
    } catch (error) {
      console.error('Error fetching employees:', error);
    }
  };

  useEffect(() => {
    console.log('🚀 TimeRecordManagement component mounted - starting initial data fetch');
    fetchTimeRecords();
    fetchEmployees();
  }, []);

  // フィルタリングされた記録
  const filteredRecords = timeRecords.filter(record => {
    if (filters.date && record.record_date !== filters.date) return false;
    if (filters.employeeId && !record.employee_id.includes(filters.employeeId)) return false;
    if (filters.showManualOnly && !record.is_manual_entry) return false;
    return true;
  });

  // 修正処理
  const handleCorrection = async (data: CorrectionData) => {
    setLoading(true);
    try {
      if (data.action === 'delete_and_create') {
        // 削除してから再作成
        await correctTimeRecordByDeleteAndCreate(
          data.employee_id,
          data.record_date,
          data.clock_in_time,
          data.clock_out_time,
          data.reason
        );
      } else {
        // 既存記録を更新
        await updateTimeRecord(
          data.employee_id,
          data.record_date,
          data.clock_in_time,
          data.clock_out_time,
          data.reason
        );
      }

      alert('打刻記録を修正しました');
      setCorrectionModal({ isOpen: false, record: null });
      fetchTimeRecords(); // データを再取得
    } catch (error: any) {
      console.error('Error correcting record:', error);
      alert(`修正に失敗しました: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 削除処理
  const handleDelete = async (employee_id: string, record_date: string) => {
    if (!window.confirm(`社員ID: ${employee_id} の ${record_date} の打刻記録を削除しますか？\n\nこの操作は取り消せません。`)) {
      return;
    }

    setLoading(true);
    try {
      await deleteTimeRecord(employee_id, record_date);
      alert('打刻記録を削除しました');
      fetchTimeRecords(); // データを再取得
    } catch (error: any) {
      console.error('Error deleting record:', error);
      alert(`削除に失敗しました: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ステータス再計算処理
  const handleRecalculateStatus = async () => {
    if (!window.confirm('全ての打刻記録のステータスを各社員の勤務時間に基づいて再計算します。\n\nこの処理には時間がかかる場合があります。実行しますか？')) {
      return;
    }

    setLoading(true);
    try {
      await recalculateAllStatus();
      alert('ステータスの再計算が完了しました');
      fetchTimeRecords(); // データを再取得
    } catch (error: any) {
      console.error('Error recalculating status:', error);
      alert(`ステータス再計算に失敗しました: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };


  const formatTime = (dateTimeString: string | null) => {
    if (!dateTimeString) return '--:--';
    return new Date(dateTimeString).toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  console.log('🔄 TimeRecordManagement render - timeRecords length:', timeRecords?.length || 0);
  console.log('🔄 TimeRecordManagement render - loading:', loading);
  console.log('🔄 TimeRecordManagement render - filters:', filters);
  console.log('🔄 TimeRecordManagement render - filteredRecords length:', filteredRecords?.length || 0);
  console.log('🔄 Sample record for comparison:', timeRecords[0]);

  return (
    <div className="time-record-management">
      <div className="management-header">
        <h2>打刻記録管理</h2>
        <div className="header-actions">
          <button onClick={handleRecalculateStatus} disabled={loading} className="recalculate-btn">
            {loading ? '処理中...' : 'ステータス再計算'}
          </button>
          <button onClick={fetchTimeRecords} disabled={loading} className="refresh-btn">
            {loading ? '読込中...' : '更新'}
          </button>
        </div>
      </div>

      <div className="filters">
        <div className="filter-group">
          <label>日付:</label>
          <input
            type="date"
            value={filters.date}
            onChange={(e) => setFilters(prev => ({ ...prev, date: e.target.value }))}
          />
        </div>
        <div className="filter-group">
          <label>社員ID:</label>
          <input
            type="text"
            value={filters.employeeId}
            onChange={(e) => setFilters(prev => ({ ...prev, employeeId: e.target.value }))}
            placeholder="社員ID で検索"
          />
        </div>
        <div className="filter-group">
          <label>
            <input
              type="checkbox"
              checked={filters.showManualOnly}
              onChange={(e) => setFilters(prev => ({ ...prev, showManualOnly: e.target.checked }))}
            />
            手動入力のみ表示
          </label>
        </div>
      </div>

      <div className="records-table-container">
        <table className="records-table">
          <thead>
            <tr>
              <th>社員ID / 氏名</th>
              <th>日付</th>
              <th>出勤時刻</th>
              <th>退勤時刻</th>
              <th>勤務時間</th>
              <th>ステータス</th>
              <th>入力種別</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.map(record => (
              <tr key={record.id} className={record.is_manual_entry ? 'manual-entry' : ''}>
                <td>
                  <div className="employee-info">
                    <span className="employee-id">{record.employee_id}</span>
                    <span className="employee-name">{record.employee_name}</span>
                  </div>
                </td>
                <td>{record.record_date}</td>
                <td>{formatTime(record.clock_in_time)}</td>
                <td>{formatTime(record.clock_out_time)}</td>
                <td>{formatWorkHours(record.work_hours)}</td>
                <td>
                  <span className={`status ${record.status}`}>
                    {record.status}
                  </span>
                </td>
                <td>
                  {record.is_manual_entry ? (
                    <span className="manual-badge">手動</span>
                  ) : (
                    <span className="auto-badge">自動</span>
                  )}
                </td>
                <td>
                  <div className="action-buttons">
                    <button
                      className="correct-btn"
                      onClick={() => setCorrectionModal({
                        isOpen: true,
                        record
                      })}
                      disabled={loading}
                    >
                      修正
                    </button>
                    <button
                      className="delete-btn"
                      onClick={() => handleDelete(record.employee_id, record.record_date)}
                      disabled={loading}
                      title="この日の打刻記録を削除"
                    >
                      削除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {filteredRecords.length === 0 && (
          <div className="no-records">
            該当する打刻記録がありません
          </div>
        )}
      </div>

      <div className="management-info">
        <h3>打刻修正について</h3>
        <ul>
          <li><strong>削除して再作成</strong>: 間違った記録を完全に削除して正しい記録を新規作成（推奨）</li>
          <li><strong>既存記録を更新</strong>: 現在の記録の時刻のみを変更</li>
          <li>すべての修正操作は監査ログに記録されます</li>
          <li>手動入力の記録は背景色で区別されます</li>
        </ul>
      </div>

      <CorrectionModal
        record={correctionModal.record}
        employees={employees}
        isOpen={correctionModal.isOpen}
        onClose={() => setCorrectionModal({ isOpen: false, record: null })}
        onSubmit={handleCorrection}
        loading={loading}
      />
    </div>
  );
};

export default TimeRecordManagement;