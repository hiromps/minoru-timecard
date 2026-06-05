import React, { useState, useEffect, useCallback } from 'react';
import './MonthlySummary.css';
import { getMonthlySummary, MonthlySummaryRow } from '../lib/adminSupabase';
import { formatWorkHours } from '../utils/timeUtils';
import { minutesToHoursDisplay } from '../utils/overtimeCalculator';

const MonthlySummary: React.FC = () => {
  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [rows, setRows] = useState<MonthlySummaryRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMonthlySummary(year, month);
      setRows(data);
    } catch (error) {
      console.error('月次集計取得エラー:', error);
      alert(`月次集計の取得に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // 年の選択肢（前後2年）
  const yearOptions: number[] = [];
  for (let y = now.getFullYear() - 2; y <= now.getFullYear() + 1; y++) {
    yearOptions.push(y);
  }

  return (
    <div className="monthly-summary">
      <div className="summary-header">
        <h2>月次集計</h2>
        <div className="summary-filters">
          <div className="filter-group">
            <label>年:</label>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}年</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>月:</label>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{m}月</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="summary-loading">集計中...</div>
      ) : (
        <div className="summary-table-container">
          <table className="summary-table">
            <thead>
              <tr>
                <th>社員ID</th>
                <th>氏名</th>
                <th>勤務日数</th>
                <th>未退勤</th>
                <th>総労働時間</th>
                <th>残業時間合計</th>
                <th>遅刻回数</th>
                <th>早退回数</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="summary-no-data">該当する記録がありません</td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.employee_id}>
                    <td data-label="社員ID">{row.employee_id}</td>
                    <td data-label="氏名">{row.employee_name}</td>
                    <td data-label="勤務日数">{row.workDays}日</td>
                    <td data-label="未退勤">{row.openDays > 0 ? `⚠️ ${row.openDays}件` : '—'}</td>
                    <td data-label="総労働時間">{formatWorkHours(row.totalWorkHours)}</td>
                    <td data-label="残業時間合計">{minutesToHoursDisplay(row.totalOvertimeMinutes)}</td>
                    <td data-label="遅刻回数">{row.lateCount}回</td>
                    <td data-label="早退回数">{row.earlyLeaveCount}回</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default MonthlySummary;
