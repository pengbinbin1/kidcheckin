// 日期时间工具：所有「日期」均为本地时区的 YYYY-MM-DD 字符串

export const WEEKDAY_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromISODate(s: string): Date {
  return new Date(`${s}T00:00:00`)
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

/** ISO 周几：1=周一 … 7=周日 */
export function isoWeekday(dateStr: string): number {
  const d = fromISODate(dateStr)
  const js = d.getDay() // 0=周日
  return js === 0 ? 7 : js
}

export function weekdayCN(dateStr: string): string {
  return WEEKDAY_CN[fromISODate(dateStr).getDay()]
}

export function cnDate(dateStr: string): string {
  const d = fromISODate(dateStr)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

export function cnMonth(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月`
}

/** '09:00:00' → '09:00' */
export function fmtClock(t?: string | null): string {
  if (!t) return ''
  return t.slice(0, 5)
}

export function fmtRange(start?: string | null, end?: string | null): string {
  if (!start || !end) return ''
  return `${fmtClock(start)} – ${fmtClock(end)}`
}

/** 课次开始/结束时刻（本地时间） */
export function sessionStart(s: { date: string; start_time: string }): Date {
  return new Date(`${s.date}T${s.start_time.slice(0, 8)}`)
}

export function sessionEnd(s: { date: string; end_time: string }): Date {
  return new Date(`${s.date}T${s.end_time.slice(0, 8)}`)
}

/** 今天/明天/后天/周X … */
export function relLabel(dateStr: string): string {
  const today = new Date()
  const diff = Math.round((fromISODate(dateStr).getTime() - fromISODate(toISODate(today)).getTime()) / 86400000)
  if (diff === 0) return '今天'
  if (diff === 1) return '明天'
  if (diff === 2) return '后天'
  if (diff === -1) return '昨天'
  return weekdayCN(dateStr)
}

export function fmtDateTime(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${mi}`
}

export function fmtBirth(iso?: string | null): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

/** 距离目标时刻的分钟数（负数 = 已过） */
export function minutesFromNow(target: Date): number {
  return Math.round((target.getTime() - Date.now()) / 60000)
}
