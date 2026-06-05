import React, { useState, useEffect } from 'react';
import './EmployeeManagement.css';
import { Employee } from '../lib/supabase';
import { employeeService } from '../lib/database';

const EmployeeManagement: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [formData, setFormData] = useState<Omit<Employee, 'id' | 'created_at' | 'updated_at'>>({
    employee_id: '',
    name: '',
    department: '',
    work_start_time: '09:00:00',
    work_end_time: '17:00:00'
  });

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    try {
      const data = await employeeService.getAll();
      setEmployees(data);
    } catch (error) {
      console.error('社員データの取得に失敗しました:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('🎯 フォーム送信開始:', formData);

    // 所定終業 > 所定始業 を検証。逆転設定は勤怠判定が破綻し '設定エラー' を
    // 生むため、保存前に弾く（現状は夜勤=日跨ぎ勤務は非対応）。
    if (formData.work_start_time && formData.work_end_time &&
        formData.work_end_time <= formData.work_start_time) {
      alert('退勤時間は出勤時間より後にしてください');
      return;
    }

    try {
      if (editingEmployee) {
        // 更新
        console.log('📝 社員更新処理開始:', editingEmployee.id);
        const result = await employeeService.update(editingEmployee.id, formData);
        console.log('✅ 社員更新完了:', result);
        alert('社員情報を更新しました');
      } else {
        // 新規作成
        console.log('🆕 社員作成処理開始');
        const result = await employeeService.create(formData);
        console.log('✅ 社員作成完了:', result);
        alert('社員を追加しました');
      }
      
      console.log('🔄 社員一覧を再取得中...');
      await fetchEmployees();
      closeModal();
    } catch (error) {
      console.error('❌ 社員情報の保存に失敗しました:', error);
      console.error('❌ エラーの詳細:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : 'No stack trace',
        error: error
      });
      alert(`エラー: ${error instanceof Error ? error.message : '保存に失敗しました'}`);
    }
  };

  const handleEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    setFormData({
      employee_id: employee.employee_id,
      name: employee.name,
      department: employee.department || '',
      work_start_time: employee.work_start_time,
      work_end_time: employee.work_end_time
    });
    setShowModal(true);
  };

  const handleDelete = async (id: number, name: string) => {
    if (window.confirm(`${name}さんを削除しますか？関連する打刻記録も削除されます。`)) {
      try {
        await employeeService.delete(id);
        alert('社員を削除しました');
        await fetchEmployees();
      } catch (error) {
        console.error('社員の削除に失敗しました:', error);
        alert(`削除に失敗しました: ${error instanceof Error ? error.message : 'エラーが発生しました'}`);
      }
    }
  };

  const openModal = () => {
    setEditingEmployee(null);
    setFormData({
      employee_id: '',
      name: '',
      department: '',
      work_start_time: '09:00:00',
      work_end_time: '17:00:00'
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingEmployee(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const formatTime = (timeString: string) => {
    // "HH:MM:SS" を "HH:MM" に変換
    return timeString.substring(0, 5);
  };

  return (
    <div className="employee-management">
      <div className="header">
        <h2>社員管理</h2>
        <button onClick={openModal} className="btn btn-primary">
          新規社員追加
        </button>
      </div>

      <div className="employee-list">
        <table>
          <thead>
            <tr>
              <th>社員ID</th>
              <th>氏名</th>
              <th>部署</th>
              <th>勤務時間</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => (
              <tr key={employee.id}>
                <td data-label="社員ID">{employee.employee_id}</td>
                <td data-label="氏名">{employee.name}</td>
                <td data-label="部署">{employee.department || '-'}</td>
                <td data-label="勤務時間">
                  {formatTime(employee.work_start_time)} - {formatTime(employee.work_end_time)}
                </td>
                <td data-label="操作">
                  <div className="action-buttons">
                    <button 
                      onClick={() => handleEdit(employee)}
                      className="btn btn-secondary"
                    >
                      ✏️ 編集
                    </button>
                    <button 
                      onClick={() => handleDelete(employee.id, employee.name)}
                      className="btn btn-danger"
                    >
                      🗑️ 削除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {employees.length === 0 && (
              <tr>
                <td colSpan={5} className="no-data">
                  社員データがありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>{editingEmployee ? '社員情報編集' : '新規社員追加'}</h3>
              <button type="button" onClick={closeModal} className="close-btn">
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>社員ID:</label>
                <input
                  type="text"
                  name="employee_id"
                  value={formData.employee_id}
                  onChange={handleInputChange}
                  required
                  placeholder="例: 001"
                />
              </div>

              <div className="form-group">
                <label>氏名:</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                  placeholder="例: 田中太郎"
                />
              </div>

              <div className="form-group">
                <label>部署:</label>
                <input
                  type="text"
                  name="department"
                  value={formData.department || ''}
                  onChange={handleInputChange}
                  required
                  placeholder="例: 営業部"
                />
              </div>

              <div className="form-group">
                <label>出勤時間:</label>
                <input
                  type="time"
                  name="work_start_time"
                  value={formatTime(formData.work_start_time)}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    work_start_time: e.target.value + ':00'
                  }))}
                  required
                />
              </div>

              <div className="form-group">
                <label>退勤時間:</label>
                <input
                  type="time"
                  name="work_end_time"
                  value={formatTime(formData.work_end_time)}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    work_end_time: e.target.value + ':00'
                  }))}
                  required
                />
              </div>

              <div className="form-actions">
                <button type="submit" className="btn btn-primary">
                  {editingEmployee ? '更新' : '追加'}
                </button>
                <button type="button" onClick={closeModal} className="btn btn-secondary">
                  キャンセル
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeManagement;