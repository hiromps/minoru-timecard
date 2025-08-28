import React, { useState } from 'react';
import EmployeeManagement from './EmployeeManagement';
import './AdminDashboard.css';
import { timeRecordService } from '../lib/database';

interface AdminDashboardProps {
  admin: any;
  onLogout: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ admin, onLogout }) => {
  const [activeTab, setActiveTab] = useState<'export' | 'employees'>('export');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      // 全記録を取得してCSV形式で出力
      const records = await timeRecordService.getAllRecords();
      
      // フィルタリング
      let filteredRecords = records;
      
      if (startDate) {
        filteredRecords = filteredRecords.filter(record => record.record_date >= startDate);
      }
      
      if (endDate) {
        filteredRecords = filteredRecords.filter(record => record.record_date <= endDate);
      }
      
      if (employeeId) {
        filteredRecords = filteredRecords.filter(record => 
          record.employee_id.includes(employeeId)
        );
      }

      // CSVデータ作成
      const csvHeader = '日付,社員ID,社員名,出勤時刻,退勤時刻,勤務時間,ステータス\n';
      const csvContent = filteredRecords.map(record => {
        const formatTime = (timeString: string | null) => {
          if (!timeString) return '';
          return new Date(timeString).toLocaleTimeString('ja-JP', { 
            hour: '2-digit', 
            minute: '2-digit' 
          });
        };

        return [
          record.record_date,
          record.employee_id,
          record.employee_name || '',
          formatTime(record.clock_in_time),
          formatTime(record.clock_out_time),
          record.work_hours || 0,
          record.status
        ].join(',');
      }).join('\n');

      // BOM付きUTF-8でCSVファイルを作成・ダウンロード
      const bom = '\uFEFF'; // UTF-8 BOM
      const csvData = bom + csvHeader + csvContent;
      const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `timecard_records_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      alert('データをエクスポートしました');
    } catch (error) {
      console.error('エクスポートエラー:', error);
      alert('エクスポートに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-dashboard">
      <div className="dashboard-header">
        <h2>管理者ダッシュボード</h2>
        <div className="admin-info">
          <span>こんにちは、{admin?.email || '管理者'}さん</span>
          <button onClick={onLogout} className="logout-btn">
            ログアウト
          </button>
        </div>
      </div>

      <div className="dashboard-tabs">
        <button 
          className={activeTab === 'export' ? 'tab-btn active' : 'tab-btn'}
          onClick={() => setActiveTab('export')}
        >
          データ出力
        </button>
        <button 
          className={activeTab === 'employees' ? 'tab-btn active' : 'tab-btn'}
          onClick={() => setActiveTab('employees')}
        >
          社員管理
        </button>
      </div>

      <div className="dashboard-content">
        {activeTab === 'export' && (
          <div className="export-section">
            <h2>打刻データ出力</h2>
            
            <div className="export-filters">
              <div className="filter-group">
                <label>開始日:</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              
              <div className="filter-group">
                <label>終了日:</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              
              <div className="filter-group">
                <label>社員ID (部分一致):</label>
                <input
                  type="text"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  placeholder="例: 001"
                />
              </div>
            </div>

            <div className="export-actions">
              <button 
                onClick={handleExport}
                disabled={loading}
                className="export-btn"
              >
                {loading ? 'エクスポート中...' : 'CSV出力'}
              </button>
            </div>

            <div className="export-info">
              <h3>出力形式について</h3>
              <ul>
                <li>CSV形式（UTF-8 BOM付き）</li>
                <li>Excel で正しく表示されます</li>
                <li>フィルター条件を指定できます</li>
                <li>全ての打刻記録が対象です</li>
              </ul>
            </div>
          </div>
        )}

        {activeTab === 'employees' && <EmployeeManagement />}
      </div>
    </div>
  );
};

export default AdminDashboard;