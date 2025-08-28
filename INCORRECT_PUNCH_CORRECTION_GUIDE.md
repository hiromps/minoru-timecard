# 間違い打刻修正ガイド

## 概要

従業員が間違って打刻ボタンを押した場合の修正方法を説明します。現在のRLSポリシーでは1日1人1レコード制約があるため、管理者による修正が必要です。

## 🚨 よくある間違いパターン

### パターン1: 間違って出勤ボタンを押した
- **状況**: 実際の出勤前に誤操作で出勤ボタンを押してしまった
- **問題**: 正しい時刻で再度出勤打刻ができない
- **対処**: 間違った記録を削除して正しい記録を作成

### パターン2: 出勤時刻が間違っている
- **状況**: 正しい出勤時刻と異なる時間で打刻された
- **問題**: 勤怠記録が不正確になる
- **対処**: 時刻のみを修正

### パターン3: 退勤し忘れて翌日に気づいた
- **状況**: 前日に退勤打刻を忘れて記録が不完全
- **問題**: 勤務時間が計算できない
- **対処**: 管理者が退勤時刻を追加

## 🔧 修正手順

### 前提条件
- 管理者権限（Admin または Super Admin）が必要
- Supabase SQL Editor へのアクセス権限

### ステップ1: 現状確認

```sql
-- 今日の打刻記録を確認
SELECT 
    id,
    employee_id,
    record_date,
    clock_in_time,
    clock_out_time,
    status,
    work_hours,
    is_manual_entry,
    created_at
FROM time_records 
WHERE record_date = CURRENT_DATE
ORDER BY employee_id, created_at;
```

### ステップ2: 修正方法の選択

#### 方法A: 削除して再作成（推奨）

**使用場面**: 完全に間違った記録、複数の項目に間違いがある場合

```sql
-- ステップ2-A1: 間違った記録を削除
SELECT admin_delete_time_record('001', CURRENT_DATE, '間違って出勤ボタンを押したため削除');

-- ステップ2-A2: 正しい記録を作成
SELECT admin_create_time_record(
    '001',                                    -- 社員ID
    CURRENT_DATE,                            -- 日付
    '2024-08-28 09:00:00+00'::TIMESTAMPTZ, -- 正しい出勤時刻
    NULL,                                   -- 退勤時刻（未定なのでNULL）
    '間違い修正による正しい記録の作成'
);
```

#### 方法B: 既存レコードを修正

**使用場面**: 時刻のみ間違っている場合

```sql
-- 出勤時刻のみ修正
UPDATE time_records 
SET 
    clock_in_time = '2024-08-28 09:00:00+00'::TIMESTAMPTZ,
    is_manual_entry = true,
    approved_by = auth.uid(),
    updated_at = NOW()
WHERE 
    employee_id = '001' 
    AND record_date = CURRENT_DATE;

-- 退勤時刻と勤務時間を修正
UPDATE time_records 
SET 
    clock_out_time = '2024-08-28 18:00:00+00'::TIMESTAMPTZ,
    work_hours = EXTRACT(EPOCH FROM (clock_out_time - clock_in_time)) / 3600,
    status = CASE 
        WHEN EXTRACT(EPOCH FROM (clock_out_time - clock_in_time)) / 3600 > 8 THEN '残業'
        ELSE '通常'
    END,
    is_manual_entry = true,
    approved_by = auth.uid(),
    updated_at = NOW()
WHERE 
    employee_id = '001' 
    AND record_date = CURRENT_DATE;
```

### ステップ3: 修正結果の確認

```sql
-- 修正後の記録確認
SELECT 
    id,
    employee_id,
    record_date,
    clock_in_time,
    clock_out_time,
    status,
    work_hours,
    is_manual_entry,
    CASE WHEN is_manual_entry THEN '管理者修正済み' ELSE '自動記録' END as entry_type,
    approved_by,
    updated_at
FROM time_records 
WHERE 
    employee_id = '001' 
    AND record_date = CURRENT_DATE;
```

### ステップ4: 従業員への連絡

修正完了後は必ず従業員に連絡してください：

1. 修正した内容の説明
2. 正しい記録になったことの確認
3. 今後の注意事項の伝達

## 📝 具体的な修正例

### 例1: 朝8:30に間違って出勤ボタンを押し、実際の出勤は9:00

```sql
-- 現状確認
SELECT * FROM time_records 
WHERE employee_id = '001' AND record_date = CURRENT_DATE;

-- 間違った記録を削除
SELECT admin_delete_time_record('001', CURRENT_DATE, '実際の出勤時刻より早く押してしまったため');

-- 正しい記録を作成
SELECT admin_create_time_record(
    '001', 
    CURRENT_DATE, 
    CURRENT_DATE + TIME '09:00:00', 
    NULL,
    '正しい出勤時刻での記録作成'
);
```

### 例2: 出勤は正しいが、退勤し忘れた（前日分）

```sql
-- 前日の記録を確認
SELECT * FROM time_records 
WHERE employee_id = '001' AND record_date = CURRENT_DATE - 1;

-- 退勤時刻を追加
UPDATE time_records 
SET 
    clock_out_time = (CURRENT_DATE - 1) + TIME '18:00:00',
    work_hours = 8.0,
    status = '通常',
    is_manual_entry = true,
    approved_by = auth.uid()
WHERE 
    employee_id = '001' 
    AND record_date = CURRENT_DATE - 1;
```

### 例3: 出勤・退勤両方とも間違った時刻

```sql
-- 既存の記録を修正（時刻を正しいものに変更）
UPDATE time_records 
SET 
    clock_in_time = CURRENT_DATE + TIME '09:00:00',
    clock_out_time = CURRENT_DATE + TIME '18:00:00',
    work_hours = 8.0,
    status = '通常',
    is_manual_entry = true,
    approved_by = auth.uid()
WHERE 
    employee_id = '001' 
    AND record_date = CURRENT_DATE;
```

## 🔍 トラブルシューティング

### 権限エラーが発生する場合

```sql
-- 現在のユーザーの権限を確認
SELECT 
    name, email, role, is_active,
    CASE WHEN locked_until > NOW() THEN 'ロック中' ELSE '正常' END as status
FROM admin_profiles 
WHERE id = auth.uid();
```

### 制約エラーが発生する場合

```sql
-- 重複レコードがないか確認
SELECT 
    employee_id, record_date, COUNT(*) as record_count
FROM time_records 
GROUP BY employee_id, record_date
HAVING COUNT(*) > 1;
```

### 関数が存在しない場合

`enhanced-rls-policies.sql` を実行して管理者用関数を作成してください。

## ⚠️ 注意事項

### セキュリティ
- 修正作業は全て監査ログに記録されます
- 修正理由を明確に記載してください
- 不正な修正は検出される可能性があります

### データ整合性
- 修正後は必ず結果を確認してください
- 勤務時間の計算が正しいか確認してください
- ステータス（通常、遅刻、早退、残業）が適切か確認してください

### コミュニケーション
- 修正前に可能であれば従業員に確認を取ってください
- 修正後は必ず従業員に連絡してください
- 修正記録を社内で共有・保管してください

## 📊 修正作業の記録

### 監査ログの確認

```sql
-- 最近の修正作業を確認
SELECT 
    table_name,
    action,
    new_values,
    created_at
FROM audit_logs 
WHERE table_name = 'admin_correction'
ORDER BY created_at DESC
LIMIT 20;
```

### 手動入力記録の確認

```sql
-- 管理者が修正した記録を確認
SELECT 
    employee_id,
    record_date,
    clock_in_time,
    clock_out_time,
    approved_by,
    updated_at
FROM time_records 
WHERE is_manual_entry = true
ORDER BY updated_at DESC;
```

---

この修正機能により、従業員の間違い打刻を適切に修正し、正確な勤怠管理を維持できます。修正作業は慎重に行い、必要に応じて従業員との確認を取りながら実施してください。