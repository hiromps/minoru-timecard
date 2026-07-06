import React, { useState } from 'react';
import EmployeeManagement from './EmployeeManagement';
import TimeRecordManagement from './TimeRecordManagement';
import MonthlySummary from './MonthlySummary';
import './AdminDashboard.css';
import { getAllTimeRecords, getEmployees } from '../lib/adminSupabase';
import { formatWorkHoursForCSV, formatMinutesForCSV } from '../utils/timeUtils';
import { getJSTDate } from '../utils/dateUtils';
import {
  getClosingPeriod,
  getDefaultClosingMonth,
  shiftClosingMonth,
  validatePayroll,
  buildPayrollCSV,
  PayrollReport,
  EmployeeMaster,
} from '../utils/payrollUtils';

interface AdminDashboardProps {
  admin: any;
  onLogout: () => void;
}

const downloadCSV = (csv: string, filename: string) => {
  const bom = '﻿'; // UTF-8 BOM（Excelで文字化けしないように）
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
};

const AdminDashboard: React.FC<AdminDashboardProps> = ({ admin, onLogout }) => {
  const [activeTab, setActiveTab] = useState<'export' | 'monthly' | 'employees' | 'timerecords'>('export');

  // 給与（25日締め）出力用
  const defaultClosing = getDefaultClosingMonth();
  const [closingYear, setClosingYear] = useState(defaultClosing.year);
  const [closingMonth, setClosingMonth] = useState(defaultClosing.month);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [payrollReport, setPayrollReport] = useState<PayrollReport | null>(null);

  // 任意期間出力用
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const period = getClosingPeriod(closingYear, closingMonth);

  const moveClosingMonth = (delta: number) => {
    const next = shiftClosingMonth(closingYear, closingMonth, delta);
    setClosingYear(next.year);
    setClosingMonth(next.month);
    setPayrollReport(null); // 期間が変わったら前回のレポートを消す
  };

  // 給与データ出力（25日締め・ワンタップ）
  const handlePayrollExport = async () => {
    setPayrollLoading(true);
    try {
      const [records, employees] = await Promise.all([getAllTimeRecords(), getEmployees()]);

      // 対象期間で絞り込み（record_date は YYYY-MM-DD の文字列比較でOK）
      const filtered = records.filter(
        (r) => r.record_date >= period.startDate && r.record_date <= period.endDate
      );

      const employeeMasters: EmployeeMaster[] = (employees || []).map((e: any) => ({
        employee_id: e.employee_id,
        name: e.name,
      }));

      const report = validatePayroll(filtered, employeeMasters, period);
      setPayrollReport(report);

      const csv = buildPayrollCSV(report);
      const fname = `給与データ_${closingYear}年${String(closingMonth).padStart(2, '0')}月締め_${period.startDate}_${period.endDate}.csv`;
      downloadCSV(csv, fname);

      if (report.errorCount > 0) {
        alert(
          `給与データを出力しました。\n\n⚠️ 給与計算に影響する不備が ${report.errorCount} 件あります。\n出力ファイルの「不備一覧」または画面下の不備レポートを確認し、修正後に再出力してください。`
        );
      } else if (report.warningCount > 0) {
        alert(`給与データを出力しました。\n\n注意事項（警告）が ${report.warningCount} 件あります。内容をご確認ください。`);
      } else {
        alert('給与データを出力しました。不備は検出されませんでした。');
      }
    } catch (error) {
      console.error('給与データ出力エラー:', error);
      alert('給与データの出力に失敗しました');
    } finally {
      setPayrollLoading(false);
    }
  };

  // 任意期間での出力（従来機能）
  const handleExport = async () => {
    setLoading(true);
    try {
      const records = await getAllTimeRecords();

      let filteredRecords = records;
      if (startDate) filteredRecords = filteredRecords.filter((r) => r.record_date >= startDate);
      if (endDate) filteredRecords = filteredRecords.filter((r) => r.record_date <= endDate);
      if (employeeId) filteredRecords = filteredRecords.filter((r) => r.employee_id.includes(employeeId));

      const formatTime = (timeString: string | null) => {
        if (!timeString) return '';
        // JST基準（ブラウザのタイムゾーンに依存しない）
        const jst = new Date(new Date(timeString).getTime() + 9 * 60 * 60 * 1000);
        return `${String(jst.getUTCHours()).padStart(2, '0')}:${String(jst.getUTCMinutes()).padStart(2, '0')}`;
      };

      const csvHeader = '日付,社員ID,社員名,出勤時刻,退勤時刻,勤務時間,残業時間,ステータス,修正理由\n';
      const csvContent = filteredRecords
        .map((record) =>
          [
            record.record_date,
            record.employee_id,
            record.employee_name || '',
            formatTime(record.clock_in_time),
            formatTime(record.clock_out_time),
            formatWorkHoursForCSV(record.work_hours || 0),
            formatMinutesForCSV(record.overtime_minutes || 0),
            record.status,
            `"${record.correction_reason || ''}"`,
          ].join(',')
        )
        .join('\n');

      downloadCSV(csvHeader + csvContent, `timecard_records_${getJSTDate()}.csv`);
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
          <span>こんにちは、管理者さん</span>
          <button onClick={onLogout} className="logout-btn">
            ログアウト
          </button>
        </div>
      </div>

      <div className="dashboard-tabs">
        <button className={activeTab === 'export' ? 'tab-btn active' : 'tab-btn'} onClick={() => setActiveTab('export')}>
          データ出力
        </button>
        <button className={activeTab === 'monthly' ? 'tab-btn active' : 'tab-btn'} onClick={() => setActiveTab('monthly')}>
          月次集計
        </button>
        <button className={activeTab === 'employees' ? 'tab-btn active' : 'tab-btn'} onClick={() => setActiveTab('employees')}>
          社員管理
        </button>
        <button className={activeTab === 'timerecords' ? 'tab-btn active' : 'tab-btn'} onClick={() => setActiveTab('timerecords')}>
          打刻記録管理
        </button>
      </div>

      <div className="dashboard-content">
        {activeTab === 'export' && (
          <div className="export-section">
            <h2>データ出力</h2>

            {/* 給与データ（25日締め）ワンタップ出力 */}
            <div className="payroll-card">
              <div className="payroll-card-head">
                <h3>💴 給与データ出力（25日締め）</h3>
                <p className="payroll-desc">毎月25日締め。前月26日〜当月25日の期間で、給与計算用のデータを出力します。</p>
              </div>

              <div className="payroll-period-picker">
                <button className="month-nav-btn" onClick={() => moveClosingMonth(-1)} disabled={payrollLoading} aria-label="前の締め月">
                  ◀
                </button>
                <div className="payroll-period-display">
                  <span className="payroll-closing-label">{closingYear}年{closingMonth}月 締め</span>
                  <span className="payroll-range">{period.label}</span>
                </div>
                <button className="month-nav-btn" onClick={() => moveClosingMonth(1)} disabled={payrollLoading} aria-label="次の締め月">
                  ▶
                </button>
              </div>

              <button className="payroll-export-btn" onClick={handlePayrollExport} disabled={payrollLoading}>
                {payrollLoading ? '出力中...' : '📥 この締め期間で給与データを出力'}
              </button>

              {payrollReport && (
                <div className="payroll-report">
                  <div
                    className={
                      payrollReport.errorCount > 0
                        ? 'payroll-summary has-error'
                        : payrollReport.warningCount > 0
                        ? 'payroll-summary has-warning'
                        : 'payroll-summary ok'
                    }
                  >
                    <strong>
                      対象 {payrollReport.recordCount} 件 ／ エラー {payrollReport.errorCount} 件 ／ 警告 {payrollReport.warningCount} 件
                    </strong>
                    {payrollReport.errorCount > 0 && (
                      <div className="payroll-summary-note">⚠️ 給与計算に影響する不備があります。修正後に再出力してください。</div>
                    )}
                    {payrollReport.errorCount === 0 && payrollReport.warningCount === 0 && (
                      <div className="payroll-summary-note">✅ 不備は検出されませんでした。</div>
                    )}
                  </div>

                  {payrollReport.issues.length > 0 && (
                    <div className="payroll-issues">
                      <h4>不備・要確認一覧</h4>
                      <ul>
                        {[...payrollReport.issues]
                          .sort((a, b) => (a.severity !== b.severity ? (a.severity === 'error' ? -1 : 1) : a.employee_id.localeCompare(b.employee_id)))
                          .map((issue, idx) => (
                            <li key={idx} className={issue.severity === 'error' ? 'issue-error' : 'issue-warning'}>
                              <span className="issue-badge">{issue.severity === 'error' ? 'エラー' : '警告'}</span>
                              <span className="issue-target">
                                {issue.employee_name}（{issue.employee_id}）{issue.date ? ` ${issue.date}` : ''}
                              </span>
                              <span className="issue-msg">{issue.message}</span>
                            </li>
                          ))}
                      </ul>
                      <p className="payroll-issues-hint">
                        修正は「打刻記録管理」タブから行えます。修正後、もう一度この画面で出力し直してください。
                      </p>
                    </div>
                  )}

                  {payrollReport.employeeTotals.length > 0 && (
                    <div className="payroll-totals">
                      <h4>社員別集計</h4>
                      <div className="payroll-totals-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>社員名</th>
                              <th>勤務日数</th>
                              <th>未退勤</th>
                              <th>合計勤務</th>
                              <th>残業</th>
                              <th>不備</th>
                            </tr>
                          </thead>
                          <tbody>
                            {payrollReport.employeeTotals.map((t) => (
                              <tr key={t.employee_id} className={t.issueCount > 0 ? 'row-has-issue' : ''}>
                                <td>{t.employee_name}</td>
                                <td>{t.workDays}日</td>
                                <td>{t.openDays > 0 ? `${t.openDays}日` : '-'}</td>
                                <td>{formatWorkHoursForCSV(t.totalWorkHours)}</td>
                                <td>{formatMinutesForCSV(t.totalOvertimeMinutes)}</td>
                                <td>{t.issueCount > 0 ? `${t.issueCount}件` : '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 任意期間での出力（従来機能） */}
            <div className="advanced-export">
              <button className="advanced-toggle" onClick={() => setShowAdvanced((v) => !v)}>
                {showAdvanced ? '▲ 任意期間で出力（詳細）を閉じる' : '▼ 任意期間で出力（詳細）'}
              </button>

              {showAdvanced && (
                <div className="advanced-body">
                  <div className="export-filters">
                    <div className="filter-group">
                      <label>開始日:</label>
                      <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                    </div>
                    <div className="filter-group">
                      <label>終了日:</label>
                      <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                    </div>
                    <div className="filter-group">
                      <label>社員ID (部分一致):</label>
                      <input type="text" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder="例: 001" />
                    </div>
                  </div>
                  <div className="export-actions">
                    <button onClick={handleExport} disabled={loading} className="export-btn">
                      {loading ? 'エクスポート中...' : 'CSV出力'}
                    </button>
                  </div>
                  <div className="export-info">
                    <ul>
                      <li>CSV形式（UTF-8 BOM付き）／ Excelで正しく表示されます</li>
                      <li>フィルター未指定の場合は全期間・全社員が対象です</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'monthly' && <MonthlySummary />}

        {activeTab === 'employees' && <EmployeeManagement />}

        {activeTab === 'timerecords' && <TimeRecordManagement />}
      </div>
    </div>
  );
};

export default AdminDashboard;
