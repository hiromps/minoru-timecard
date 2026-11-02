import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TimeRecordManagement from './TimeRecordManagement';
import { getAllTimeRecords, getEmployees, updateTimeRecord, TimeRecordWithEmployee } from '../lib/adminSupabase';

jest.mock('../lib/adminSupabase');

const record: TimeRecordWithEmployee = {
  id: 1, employee_id: '001', employee_name: 'テスト社員', record_date: '2026-11-02',
  clock_in_time: '2026-11-02T00:00:00Z', clock_out_time: '2026-11-02T08:00:00Z',
  work_hours: 7, overtime_minutes: 0, status: '通常', is_manual_entry: false,
  created_at: '2026-11-02T00:00:00Z', updated_at: '2026-11-02T08:00:00Z',
  correction_reason: '前回の修正理由'
};

beforeEach(() => {
  jest.clearAllMocks();
  (getAllTimeRecords as jest.Mock).mockResolvedValue([record]);
  (getEmployees as jest.Mock).mockResolvedValue([]);
  jest.spyOn(window, 'alert').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

it('理由のみを書き換えて保存し、再度開いた画面に保存後の理由を表示する', async () => {
  (updateTimeRecord as jest.Mock).mockImplementation(async (...args) => {
    (getAllTimeRecords as jest.Mock).mockResolvedValue([{ ...record, correction_reason: args[4] }]);
  });
  render(<TimeRecordManagement />);
  await waitFor(() => expect((screen.getByRole('button', { name: '修正' }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: '修正' }));
  const reason = screen.getByPlaceholderText('修正の理由を入力してください');
  expect((reason as HTMLTextAreaElement).value).toBe('前回の修正理由');
  fireEvent.change(reason, { target: { value: '書き換えた修正理由' } });
  fireEvent.click(screen.getByRole('button', { name: '修正実行' }));
  await waitFor(() => expect(screen.queryByPlaceholderText('修正の理由を入力してください')).toBeNull());
  expect(updateTimeRecord).toHaveBeenCalledWith('001', '2026-11-02', '2026-11-02T09:00', '2026-11-02T17:00', '書き換えた修正理由');
  fireEvent.click(screen.getByRole('button', { name: '修正' }));
  expect((screen.getByPlaceholderText('修正の理由を入力してください') as HTMLTextAreaElement).value).toBe('書き換えた修正理由');
});

it('理由の保存に失敗したときは成功通知を出さず入力内容を保持する', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  (updateTimeRecord as jest.Mock).mockRejectedValue(new Error('修正理由の保存に失敗しました'));
  render(<TimeRecordManagement />);
  await waitFor(() => expect((screen.getByRole('button', { name: '修正' }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: '修正' }));
  fireEvent.change(screen.getByPlaceholderText('修正の理由を入力してください'), { target: { value: '再保存する理由' } });
  fireEvent.click(screen.getByRole('button', { name: '修正実行' }));
  await waitFor(() => expect(window.alert).toHaveBeenCalledWith('保存に失敗しました: 修正理由の保存に失敗しました'));
  expect(window.alert).not.toHaveBeenCalledWith('打刻記録を保存しました');
  expect((screen.getByPlaceholderText('修正の理由を入力してください') as HTMLTextAreaElement).value).toBe('再保存する理由');
});
