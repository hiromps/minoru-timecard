-- 25日締め給与データの不備（設定エラー／未退勤／平日の打刻漏れ）を
-- 毎月26日07:00 JST（25日22:00 UTC）に自動チェックし、payroll-check-notify
-- Edge Function経由でメール通知するためのcronジョブ。
-- 呼び出し認証用の共有シークレットは vault.secrets に別途登録する
-- （このマイグレーションには秘密情報を含めない）。

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'payroll-check-notify-monthly',
  '0 22 25 * *',
  $$
  select net.http_post(
    url := 'https://pddriyhmkvsklqmtxsro.supabase.co/functions/v1/payroll-check-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'payroll_cron_shared_secret'
        limit 1
      )
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
