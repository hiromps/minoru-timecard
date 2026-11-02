import { getAllTimeRecords, logCorrectionAction } from './adminSupabase';
import { supabase } from './supabase';

jest.mock('./supabase', () => ({ supabase: { from: jest.fn() }, isDevMode: false }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

it('変更した理由を社員・日付に紐付けて保存する', async () => {
  const insert = jest.fn().mockResolvedValue({ error: null });
  (supabase.from as jest.Mock).mockReturnValue({ insert });
  await logCorrectionAction('001', '2026-11-02', 'UPDATE', '新しい理由', 10);
  expect(insert).toHaveBeenCalledWith(expect.objectContaining({
    record_id: '001-2026-11-02', reason: '新しい理由',
    new_values: expect.objectContaining({ reason: '新しい理由', record_id: 10 })
  }));
});

it.each([
  { code: 'PGRST204', message: "Could not find the 'reason' column of 'audit_logs' in the schema cache" },
  { code: '42703', message: 'column reason does not exist' }
])('reason列がない場合もnew_valuesに理由を保存する: $code', async (error) => {
  const insert = jest.fn().mockResolvedValueOnce({ error }).mockResolvedValueOnce({ error: null });
  (supabase.from as jest.Mock).mockReturnValue({ insert });
  await logCorrectionAction('001', '2026-11-02', 'UPDATE', '新しい理由');
  expect(insert).toHaveBeenCalledTimes(2);
  const retry = insert.mock.calls[1][0];
  expect(retry).not.toHaveProperty('reason');
  expect(retry.new_values.reason).toBe('新しい理由');
});

it.each([false, true])('保存失敗を呼び出し元に通知する（再試行: %s）', async (retry) => {
  const insert = jest.fn();
  if (retry) insert.mockResolvedValueOnce({ error: { code: 'PGRST204', message: 'reason column missing' } });
  insert.mockResolvedValue({ error: { message: 'permission denied' } });
  (supabase.from as jest.Mock).mockReturnValue({ insert });
  await expect(logCorrectionAction('001', '2026-11-02', 'UPDATE', '新しい理由'))
    .rejects.toThrow('修正理由の保存に失敗しました');
});

it('再取得時は最新の理由を返し、reason列のみの旧ログにも対応する', async () => {
  const logs = [
    { id: 3, record_id: '001-2026-11-02', created_at: '2026-11-02T09:00:00Z', new_values: { reason: '最新の理由' } },
    { id: 2, record_id: '001-2026-11-02', created_at: '2026-11-02T09:00:00Z', new_values: { reason: '同時刻の古い理由' } },
    { id: 1, record_id: '002-2026-11-02', created_at: '2026-11-02T08:00:00Z', reason: '旧形式の理由' }
  ];
  const auditQuery: any = { select: jest.fn(), eq: jest.fn(), order: jest.fn() };
  auditQuery.select.mockReturnValue(auditQuery);
  auditQuery.eq.mockReturnValue(auditQuery);
  auditQuery.order.mockReturnValueOnce(auditQuery).mockResolvedValueOnce({ data: logs, error: null });
  const recordsQuery: any = { select: jest.fn(), order: jest.fn(), range: jest.fn() };
  recordsQuery.select.mockReturnValue(recordsQuery);
  recordsQuery.order.mockReturnValue(recordsQuery);
  recordsQuery.range.mockResolvedValue({ data: ['001', '002'].map(employee_id => ({ id: employee_id, employee_id, record_date: '2026-11-02' })), error: null });
  (supabase.from as jest.Mock).mockImplementation(table => {
    if (table === 'time_records') return recordsQuery;
    if (table === 'audit_logs') return auditQuery;
    return { select: jest.fn().mockResolvedValue({ data: [], error: null }) };
  });
  const records = await getAllTimeRecords();
  expect(records.map(record => record.correction_reason)).toEqual(['最新の理由', '旧形式の理由']);
  expect(auditQuery.order).toHaveBeenLastCalledWith('id', { ascending: false });
});
