// 給与締めチェック通知メールの本文（テキスト版・HTML版）を組み立てる。
// HTMLはメールクライアント互換のため、table レイアウト＋インラインスタイルのみで構成する。

export type OvertimeRuleType = 'standard' | 'grace_15min' | 'hourly' | 'executive'

export const OVERTIME_RULE_LABELS: Record<OvertimeRuleType, string> = {
  standard: '通常',
  grace_15min: '特別猶予',
  hourly: 'アルバイト',
  executive: '役員',
}

export interface Issue {
  employee_id: string
  employee_name: string
  date: string
  message: string
}

export interface EmployeeWorkSummary {
  employee_id: string
  employee_name: string
  overtime_rule_type: OvertimeRuleType
  totalWorkMinutes: number
  totalOvertimeMinutes: number
}

export interface ClosingPeriod {
  startDate: string
  endDate: string
  label: string
}

// 分を「H:MM」形式に変換（src/utils/timeUtils.ts の formatMinutesForCSV と同じ丸めルール）
export const formatMinutesAsHM = (minutes: number): string => {
  if (!minutes || minutes <= 0) return '0:00'
  let h = Math.floor(minutes / 60)
  let m = Math.round(minutes % 60)
  if (m === 60) {
    h += 1
    m = 0
  }
  return `${h}:${String(m).padStart(2, '0')}`
}

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

// YYYY-MM-DD → 「9/1(月)」（タイムゾーン非依存）
const formatDateWithWeekday = (date: string): string => {
  const [y, m, d] = date.split('-').map(Number)
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return `${m}/${d}(${WEEKDAY_LABELS[wd]})`
}

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const isOvertimeExempt = (rule: OvertimeRuleType): boolean => rule === 'hourly' || rule === 'executive'

const buildSubject = (period: ClosingPeriod, issues: Issue[]): string =>
  // 件名は必ずASCIIのみにする。denomailer(quotedPrintableEncodeInline)は
  // 長い非ASCII件名を折り返す際にRFC 2047のencoded-word境界をまたいで
  // 改行を挿入してしまうバグがあり、日本語件名は文字化けする（本文は別処理のため問題なし）。
  issues.length > 0
    ? `Minoru Timecard: Payroll check - ${issues.length} issue(s) found (${period.startDate} to ${period.endDate})`
    : `Minoru Timecard: Payroll check - OK (${period.startDate} to ${period.endDate})`

const sumTotals = (workSummary: EmployeeWorkSummary[]): { work: number; overtime: number } =>
  workSummary.reduce(
    (acc, s) => ({ work: acc.work + s.totalWorkMinutes, overtime: acc.overtime + s.totalOvertimeMinutes }),
    { work: 0, overtime: 0 }
  )

const buildText = (period: ClosingPeriod, issues: Issue[], workSummary: EmployeeWorkSummary[]): string => {
  const lines: string[] = []
  lines.push(`対象期間: ${period.label}`)
  lines.push('')
  if (issues.length === 0) {
    lines.push('不備は検出されませんでした。')
  } else {
    lines.push(`不備 ${issues.length} 件を検出しました。給与計算前にご確認ください。`)
    lines.push('')
    for (const i of issues) {
      lines.push(`- [${i.date}] ${i.employee_name}(${i.employee_id}): ${i.message}`)
    }
  }
  lines.push('')
  lines.push(`[勤務集計] 対象期間に打刻記録があった社員（${workSummary.length}名）`)
  if (workSummary.length === 0) {
    lines.push('対象社員がいません。')
  } else {
    for (const s of workSummary) {
      const ruleLabel = OVERTIME_RULE_LABELS[s.overtime_rule_type] || s.overtime_rule_type
      const overtimeText = isOvertimeExempt(s.overtime_rule_type) ? '対象外' : formatMinutesAsHM(s.totalOvertimeMinutes)
      lines.push(
        `- ${s.employee_name}(${s.employee_id}) [${ruleLabel}]: 合計勤務時間 ${formatMinutesAsHM(
          s.totalWorkMinutes
        )} / 残業 ${overtimeText}`
      )
    }
    const totals = sumTotals(workSummary)
    lines.push('')
    lines.push(`合計: 総勤務時間 ${formatMinutesAsHM(totals.work)} / 総残業時間 ${formatMinutesAsHM(totals.overtime)}`)
  }
  lines.push('')
  lines.push('詳細・修正は管理画面の「打刻記録」「出力」タブから行ってください。')
  lines.push('（このメールは自動送信です）')
  return lines.join('\n')
}

// ---- HTML版 ----

const FONT = "'Hiragino Sans','Hiragino Kaku Gothic ProN','Yu Gothic','Meiryo',sans-serif"
const C = {
  bg: '#f3f4f6',
  card: '#ffffff',
  text: '#111827',
  muted: '#6b7280',
  border: '#e5e7eb',
  headerBg: '#1e3a8a',
  headerText: '#ffffff',
  okBg: '#ecfdf5',
  okBorder: '#10b981',
  okText: '#065f46',
  ngBg: '#fef2f2',
  ngBorder: '#ef4444',
  ngText: '#991b1b',
  groupBg: '#f9fafb',
  tagBg: '#eef2ff',
  tagText: '#3730a3',
}

const sectionTitle = (title: string, note = ''): string =>
  `<tr><td style="padding:24px 24px 8px 24px;">
<div style="font-size:16px;font-weight:bold;color:${C.text};">${title}</div>
${note ? `<div style="font-size:12px;color:${C.muted};margin-top:2px;">${note}</div>` : ''}
</td></tr>`

const kpiCell = (label: string, value: string, highlight = false): string =>
  `<td width="25%" style="padding:12px 4px;text-align:center;border:1px solid ${C.border};background:${C.card};">
<div style="font-size:11px;color:${C.muted};">${label}</div>
<div style="font-size:20px;font-weight:bold;color:${highlight ? C.ngText : C.text};margin-top:4px;">${value}</div>
</td>`

const th = (label: string, align: 'left' | 'right' = 'left'): string =>
  `<th style="padding:8px 10px;text-align:${align};font-size:12px;color:${C.muted};font-weight:bold;border-bottom:2px solid ${C.border};background:${C.groupBg};">${label}</th>`

const td = (content: string, align: 'left' | 'right' = 'left', extra = ''): string =>
  `<td style="padding:8px 10px;text-align:${align};font-size:13px;color:${C.text};border-bottom:1px solid ${C.border};${extra}">${content}</td>`

const buildIssuesHtml = (issues: Issue[]): string => {
  if (issues.length === 0) return ''

  // 社員ごとにまとめて表示する（issues は社員ID→日付順にソート済み）
  const groups: { id: string; name: string; items: Issue[] }[] = []
  for (const i of issues) {
    const last = groups[groups.length - 1]
    if (last && last.id === i.employee_id) {
      last.items.push(i)
    } else {
      groups.push({ id: i.employee_id, name: i.employee_name, items: [i] })
    }
  }

  const rows: string[] = []
  for (const g of groups) {
    rows.push(
      `<tr><td colspan="2" style="padding:10px 10px 6px 10px;background:${C.groupBg};border-bottom:1px solid ${C.border};font-size:13px;font-weight:bold;color:${C.text};">
${escapeHtml(g.name)} <span style="font-weight:normal;color:${C.muted};">(${escapeHtml(g.id)})</span>
<span style="display:inline-block;margin-left:6px;padding:1px 8px;border-radius:10px;background:${C.ngBg};color:${C.ngText};font-size:11px;">${g.items.length}件</span>
</td></tr>`
    )
    for (const i of g.items) {
      rows.push(`<tr>${td(formatDateWithWeekday(i.date), 'left', 'white-space:nowrap;width:90px;')}${td(escapeHtml(i.message))}</tr>`)
    }
  }

  return `${sectionTitle('不備の一覧', '社員ごとの内容です。管理画面の「打刻記録」タブで修正してください。')}
<tr><td style="padding:0 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid ${C.border};">
<tr>${th('日付')}${th('内容')}</tr>
${rows.join('\n')}
</table>
</td></tr>`
}

const buildSummaryHtml = (workSummary: EmployeeWorkSummary[]): string => {
  if (workSummary.length === 0) {
    return `${sectionTitle('勤務集計')}
<tr><td style="padding:0 24px;font-size:13px;color:${C.muted};">対象期間に打刻記録があった社員はいません。</td></tr>`
  }

  const totals = sumTotals(workSummary)
  const rows = workSummary.map((s) => {
    const ruleLabel = OVERTIME_RULE_LABELS[s.overtime_rule_type] || s.overtime_rule_type
    const overtime = isOvertimeExempt(s.overtime_rule_type)
      ? `<span style="color:${C.muted};">対象外</span>`
      : formatMinutesAsHM(s.totalOvertimeMinutes)
    return `<tr>${td(
      `${escapeHtml(s.employee_name)}<br><span style="font-size:11px;color:${C.muted};">${escapeHtml(s.employee_id)}</span>`
    )}${td(
      `<span style="display:inline-block;padding:1px 8px;border-radius:10px;background:${C.tagBg};color:${C.tagText};font-size:11px;white-space:nowrap;">${escapeHtml(ruleLabel)}</span>`
    )}${td(formatMinutesAsHM(s.totalWorkMinutes), 'right', 'white-space:nowrap;')}${td(overtime, 'right', 'white-space:nowrap;')}</tr>`
  })

  const totalStyle = `font-weight:bold;background:${C.groupBg};border-top:2px solid ${C.border};white-space:nowrap;`
  return `${sectionTitle('勤務集計', `対象期間に打刻記録があった社員 ${workSummary.length}名`)}
<tr><td style="padding:0 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid ${C.border};">
<tr>${th('社員')}${th('区分')}${th('勤務時間', 'right')}${th('残業', 'right')}</tr>
${rows.join('\n')}
<tr>${td('合計', 'left', totalStyle)}${td('', 'left', totalStyle)}${td(formatMinutesAsHM(totals.work), 'right', totalStyle)}${td(
    formatMinutesAsHM(totals.overtime),
    'right',
    totalStyle
  )}</tr>
</table>
</td></tr>`
}

const buildHtml = (period: ClosingPeriod, issues: Issue[], workSummary: EmployeeWorkSummary[]): string => {
  const totals = sumTotals(workSummary)
  const hasIssues = issues.length > 0

  const banner = hasIssues
    ? `<div style="font-size:15px;font-weight:bold;color:${C.ngText};">不備が ${issues.length} 件あります</div>
<div style="font-size:13px;color:${C.ngText};margin-top:4px;">給与計算の前に確認・修正してください。</div>`
    : `<div style="font-size:15px;font-weight:bold;color:${C.okText};">不備はありません</div>
<div style="font-size:13px;color:${C.okText};margin-top:4px;">このまま給与計算に進めます。</div>`

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>給与締めチェック</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};font-family:${FONT};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;background:${C.card};border-radius:8px;overflow:hidden;border:1px solid ${C.border};">
<tr><td style="padding:20px 24px;background:${C.headerBg};color:${C.headerText};">
<div style="font-size:12px;opacity:0.85;">ミノルタイムカード</div>
<div style="font-size:20px;font-weight:bold;margin-top:2px;">給与締めチェック（25日締め）</div>
<div style="font-size:13px;margin-top:6px;">対象期間：${escapeHtml(period.label)}</div>
</td></tr>
<tr><td style="padding:20px 24px 0 24px;">
<div style="padding:14px 16px;border-left:4px solid ${hasIssues ? C.ngBorder : C.okBorder};background:${hasIssues ? C.ngBg : C.okBg};border-radius:4px;">
${banner}
</div>
</td></tr>
<tr><td style="padding:16px 24px 0 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
<tr>
${kpiCell('不備', `${issues.length}件`, hasIssues)}
${kpiCell('対象社員', `${workSummary.length}名`)}
${kpiCell('総勤務時間', formatMinutesAsHM(totals.work))}
${kpiCell('総残業時間', formatMinutesAsHM(totals.overtime))}
</tr>
</table>
</td></tr>
${buildIssuesHtml(issues)}
${buildSummaryHtml(workSummary)}
<tr><td style="padding:24px;font-size:12px;color:${C.muted};line-height:1.6;">
詳細・修正は管理画面の「打刻記録」「出力」タブから行ってください。<br>
アルバイト・役員の残業は集計の対象外です。<br>
このメールは毎月26日 7:00 に自動送信されています。
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

export const buildEmailBody = (
  period: ClosingPeriod,
  issues: Issue[],
  workSummary: EmployeeWorkSummary[]
): { subject: string; text: string; html: string } => ({
  subject: buildSubject(period, issues),
  text: buildText(period, issues, workSummary),
  html: buildHtml(period, issues, workSummary),
})

// UTF-8文字列をbase64（76文字ごとにCRLF改行）に変換する。
// denomailerのquoted-printableエンコーダはSMTPのドット・スタッフィング（行頭"."の二重化）を
// 行わないため、CSSの小数（0.85 等）が折り返し位置で行頭に来ると"."が欠落してしまう。
// base64 はアルファベットに"."を含まないためこの問題が起きない。
export const toBase64Lines = (s: string): string => {
  const bytes = new TextEncoder().encode(s)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return (btoa(binary).match(/.{1,76}/g) ?? []).join('\r\n')
}
