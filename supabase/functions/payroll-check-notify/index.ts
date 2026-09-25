// 25日締め給与データの不備（設定エラー／未退勤／平日の打刻漏れ）を検知し、
// 管理者へメール通知する。pg_cron から毎月26日07:00 JSTに呼び出される想定。
// 業務ロジックは src/utils/payrollUtils.ts の validatePayroll に準拠（Deno環境のため個別実装）。

import { createClient } from 'npm:@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'
import {
  buildEmailBody,
  toBase64Lines,
  type EmployeeWorkSummary,
  type Issue,
  type OvertimeRuleType,
} from './email.ts'

const CRON_SHARED_SECRET = Deno.env.get('CRON_SHARED_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const SMTP_HOST = Deno.env.get('SMTP_HOST') ?? ''
const SMTP_PORT = Number(Deno.env.get('SMTP_PORT') ?? '465')
const SMTP_USER = Deno.env.get('SMTP_USER') ?? ''
const SMTP_PASSWORD = Deno.env.get('SMTP_PASSWORD') ?? ''
const SMTP_FROM = Deno.env.get('SMTP_FROM') ?? SMTP_USER
const NOTIFY_EMAILS = (Deno.env.get('PAYROLL_NOTIFY_EMAILS') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

interface EmployeeRow {
  employee_id: string
  name: string
  is_active: boolean | null
  overtime_rule_type: OvertimeRuleType | null
}

interface TimeRecordRow {
  employee_id: string
  record_date: string
  clock_in_time: string | null
  clock_out_time: string | null
  status: string
  work_hours: number | null
  overtime_minutes: number | null
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

// JST基準の「今日」を YYYY-MM-DD で取得（タイムゾーン非依存）
const getJSTDate = (date: Date = new Date()): { year: number; month: number; day: number } => {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000)
  return { year: jst.getUTCFullYear(), month: jst.getUTCMonth() + 1, day: jst.getUTCDate() }
}

// 25日締めの対象期間 [前月26日, 当月25日] を算出する
const getClosingPeriod = (): { startDate: string; endDate: string; label: string } => {
  const today = getJSTDate()
  // 25日締めのチェックは26日以降に実行される想定なので、常に「直近で終わった締め」を対象にする
  let closingYear = today.year
  let closingMonth = today.month
  if (today.day <= 25) {
    closingMonth -= 1
    if (closingMonth < 1) {
      closingMonth = 12
      closingYear -= 1
    }
  }
  const endDate = `${closingYear}-${pad2(closingMonth)}-25`
  let sy = closingYear
  let sm = closingMonth - 1
  if (sm < 1) {
    sm = 12
    sy -= 1
  }
  const startDate = `${sy}-${pad2(sm)}-26`
  const label = `${sy}年${sm}月26日 〜 ${closingYear}年${closingMonth}月25日`
  return { startDate, endDate, label }
}

// [startDate, endDate] の平日（月〜金）の日付一覧（タイムゾーン非依存）
const listWeekdays = (startDate: string, endDate: string): string[] => {
  const [sy, sm, sd] = startDate.split('-').map(Number)
  const [ey, em, ed] = endDate.split('-').map(Number)
  const start = Date.UTC(sy, sm - 1, sd)
  const end = Date.UTC(ey, em - 1, ed)
  const days: string[] = []
  for (let t = start; t <= end; t += 24 * 60 * 60 * 1000) {
    const d = new Date(t)
    const wd = d.getUTCDay()
    if (wd >= 1 && wd <= 5) {
      days.push(`${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`)
    }
  }
  return days
}

const buildIssues = (
  employees: EmployeeRow[],
  records: TimeRecordRow[],
  period: { startDate: string; endDate: string }
): Issue[] => {
  const issues: Issue[] = []
  const nameMap = new Map(employees.map((e) => [e.employee_id, e.name]))
  const activeIds = employees.filter((e) => e.is_active !== false).map((e) => e.employee_id)

  // 設定エラー・未退勤（欠勤/有給は打刻なしが正常なので対象外）
  const recordedDayKeys = new Set<string>()
  for (const r of records) {
    recordedDayKeys.add(`${r.employee_id}__${r.record_date}`)
    const name = nameMap.get(r.employee_id) || r.employee_id
    const isAbsenceOrLeave = r.status === '欠勤' || r.status === '有給'

    if (r.status === '設定エラー') {
      issues.push({
        employee_id: r.employee_id,
        employee_name: name,
        date: r.record_date,
        message: 'ステータスが「設定エラー」です',
      })
    }
    if (!isAbsenceOrLeave && r.clock_in_time && !r.clock_out_time) {
      issues.push({
        employee_id: r.employee_id,
        employee_name: name,
        date: r.record_date,
        message: '退勤打刻がありません（未退勤）',
      })
    }
  }

  // 平日の打刻漏れ（在籍中の社員のみ対象。土日は対象外）
  const weekdays = listWeekdays(period.startDate, period.endDate)
  for (const employeeId of activeIds) {
    const name = nameMap.get(employeeId) || employeeId
    for (const date of weekdays) {
      if (!recordedDayKeys.has(`${employeeId}__${date}`)) {
        issues.push({
          employee_id: employeeId,
          employee_name: name,
          date,
          message: '打刻記録がありません（平日）',
        })
      }
    }
  }

  issues.sort((a, b) => {
    if (a.employee_id !== b.employee_id) return a.employee_id.localeCompare(b.employee_id)
    return a.date.localeCompare(b.date)
  })
  return issues
}

// 社員別の合計勤務時間・合計残業時間を集計する（payrollUtils.ts の EmployeeTotal 集計に準拠）。
// 残業時間はルールごと（standard/grace_15min/hourly/executive）に打刻時点で
// 既に overtime_minutes へ反映済みのため、ここでは単純合算のみ行う（再計算しない）。
const buildWorkSummary = (
  employees: EmployeeRow[],
  records: TimeRecordRow[]
): EmployeeWorkSummary[] => {
  const ruleMap = new Map(employees.map((e) => [e.employee_id, e.overtime_rule_type ?? 'standard']))
  const nameMap = new Map(employees.map((e) => [e.employee_id, e.name]))

  const sorted = [...records].sort((a, b) => {
    if (a.employee_id !== b.employee_id) return a.employee_id.localeCompare(b.employee_id)
    return a.record_date.localeCompare(b.record_date)
  })

  const summaries = new Map<string, EmployeeWorkSummary>()
  const aggregatedDayKeys = new Set<string>()

  const ensure = (employeeId: string): EmployeeWorkSummary => {
    let s = summaries.get(employeeId)
    if (!s) {
      s = {
        employee_id: employeeId,
        employee_name: nameMap.get(employeeId) || employeeId,
        overtime_rule_type: (ruleMap.get(employeeId) as OvertimeRuleType) || 'standard',
        totalWorkMinutes: 0,
        totalOvertimeMinutes: 0,
      }
      summaries.set(employeeId, s)
    }
    return s
  }

  for (const r of sorted) {
    const dayKey = `${r.employee_id}__${r.record_date}`
    const isDuplicateExtra = aggregatedDayKeys.has(dayKey)
    const hasIn = !!r.clock_in_time
    const hasOut = !!r.clock_out_time
    const isPaidLeave = r.status === '有給'
    const s = ensure(r.employee_id)

    if (!isDuplicateExtra && ((hasIn && hasOut) || isPaidLeave)) {
      s.totalWorkMinutes += Math.round((r.work_hours || 0) * 60)
    }
    if (!isDuplicateExtra && hasIn && hasOut && r.status !== '設定エラー') {
      s.totalOvertimeMinutes += r.overtime_minutes || 0
    }
    aggregatedDayKeys.add(dayKey)
  }

  return Array.from(summaries.values()).sort((a, b) => a.employee_id.localeCompare(b.employee_id))
}

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== CRON_SHARED_SECRET || !CRON_SHARED_SECRET) {
    return new Response('unauthorized', { status: 401 })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const period = getClosingPeriod()

    const { data: employees, error: empError } = await supabase
      .from('employees')
      .select('employee_id, name, is_active, overtime_rule_type')
    if (empError) throw empError

    // PostgRESTのデフォルト max_rows=1000 による無言の切り捨てを避けるため、
    // src/lib/adminSupabase.ts の getAllTimeRecords と同じ .range() ページングで全件取得する。
    const TIME_RECORDS_PAGE_SIZE = 1000
    const records: TimeRecordRow[] = []
    for (let from = 0; ; from += TIME_RECORDS_PAGE_SIZE) {
      const { data: page, error: recError } = await supabase
        .from('time_records')
        .select('employee_id, record_date, clock_in_time, clock_out_time, status, work_hours, overtime_minutes')
        .gte('record_date', period.startDate)
        .lte('record_date', period.endDate)
        .order('id')
        .range(from, from + TIME_RECORDS_PAGE_SIZE - 1)
      if (recError) throw recError
      if (!page || page.length === 0) break
      records.push(...page)
      if (page.length < TIME_RECORDS_PAGE_SIZE) break
    }

    const issues = buildIssues(employees ?? [], records, period)
    const workSummary = buildWorkSummary(employees ?? [], records)
    const { subject, text, html } = buildEmailBody(period, issues, workSummary)

    if (NOTIFY_EMAILS.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: 'PAYROLL_NOTIFY_EMAILS not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const client = new SMTPClient({
      connection: {
        hostname: SMTP_HOST,
        port: SMTP_PORT,
        tls: true,
        auth: { username: SMTP_USER, password: SMTP_PASSWORD },
      },
    })

    await client.send({
      from: SMTP_FROM,
      to: NOTIFY_EMAILS,
      subject,
      // テキスト版→HTML版の順に並べる（multipart/alternative は後ろのパートが優先表示される）。
      // エンコードは email.ts の toBase64Lines を参照（quoted-printable の行頭"."欠落を回避）。
      mimeContent: [
        { mimeType: 'text/plain; charset="utf-8"', content: toBase64Lines(text), transferEncoding: 'base64' },
        { mimeType: 'text/html; charset="utf-8"', content: toBase64Lines(html), transferEncoding: 'base64' },
      ],
    })
    // メール送信自体は完了しているため、close時の後始末エラーで
    // レスポンスをok:falseにはしない（Xserver側で観測済みのNOOP起因の500エラー対策）。
    try {
      await client.close()
    } catch (closeErr) {
      console.error('SMTP close error (send already succeeded):', closeErr)
    }

    return new Response(JSON.stringify({ ok: true, issueCount: issues.length, period }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ ok: false, error: String(err?.message ?? err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
