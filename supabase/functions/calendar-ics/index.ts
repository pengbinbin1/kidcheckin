// Edge Function: calendar-ics
// 生成 ICS 日历订阅源，供 iPhone「日历」App 订阅
// 用法：GET /functions/v1/calendar-ics?token=<ics_token>
//      或 GET /functions/v1/calendar-ics?family=<invite_code>
import { createClient } from 'npm:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, serviceKey)

// 缓存 5 分钟（同 token 多次请求）
const cache = new Map<string, { body: string; expires: number }>()

Deno.serve(async (req: Request) => {
  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  const familyCode = url.searchParams.get('family')
  const key = token ?? familyCode ?? ''

  // 缓存命中
  const cached = cache.get(key)
  if (cached && cached.expires > Date.now()) {
    return icsResponse(cached.body)
  }

  // 查家庭
  let family: FamilyRow | null = null
  if (token) {
    const { data } = await supabase
      .from('families')
      .select('*')
      .eq('ics_token', token)
      .maybeSingle()
    family = data as FamilyRow
  } else if (familyCode) {
    const { data } = await supabase
      .from('families')
      .select('*')
      .eq('invite_code', familyCode)
      .maybeSingle()
    family = data as FamilyRow
  }

  if (!family) {
    return new Response('invalid token', { status: 404 })
  }

  // 拉取该家庭未来 8 周内 + 过去 1 周的课次
  const now = new Date()
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 3600_000)
    .toISOString()
    .slice(0, 10)
  const eightWeeksLater = new Date(now.getTime() + 56 * 24 * 3600_000)
    .toISOString()
    .slice(0, 10)

  const { data: sessions, error } = await supabase.rpc('get_family_calendar', {
    p_family_id: family.id,
    p_from: oneWeekAgo,
    p_to: eightWeeksLater,
  })

  if (error) {
    return new Response(error.message, { status: 500 })
  }

  const ics = buildICS(family, (sessions ?? []) as CalendarRow[])

  // 缓存 5 分钟
  cache.set(key, { body: ics, expires: Date.now() + 300_000 })

  return icsResponse(ics)
})

function icsResponse(body: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="schedule.ics"',
      'Cache-Control': 'public, max-age=300',
    },
  })
}

function fmtDateTime(dateStr: string, timeStr: string): string {
  return `${dateStr.replaceAll('-', '')}T${timeStr.slice(0, 8).replaceAll(':', '')}`
}

function buildICS(family: FamilyRow, sessions: CalendarRow[]): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//KidCheckin//Interest Class Schedule//CN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${family.name} · 兴趣班课程表`,
    'X-WR-TIMEZONE:Asia/Shanghai',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
  ]

  for (const s of sessions) {
    if (s.status === 'cancelled') {
      // 已取消的课次：仍然输出事件但标记 STATUS:CANCELLED，
      // 已订阅的日历会自动移除
      continue
    }

    const summary = s.course_name + (s.student_name ? ` · ${s.student_name}` : '')
    const desc = []
    if (s.institution) desc.push(`机构：${s.institution}`)
    if (s.location) desc.push(`地点：${s.location}`)
    if (s.note) desc.push(`备注：${s.note}`)

    const alarmTrigger = -(s.reminder_minutes ?? 30)

    lines.push(
      'BEGIN:VEVENT',
      `UID:${s.session_id}@kidcheckin`,
      `DTSTAMP:${fmtDateTime(
        new Date().toISOString().slice(0, 10),
        new Date().toTimeString().slice(0, 8),
      )}`,
      `DTSTART;TZID=Asia/Shanghai:${fmtDateTime(s.sess_date, s.start_time)}`,
      `DTEND;TZID=Asia/Shanghai:${fmtDateTime(s.sess_date, s.end_time)}`,
      `SUMMARY:${summary}`,
      ...(s.location ? [`LOCATION:${s.location}`] : []),
      ...(desc.length ? [`DESCRIPTION:${desc.join('\\n')}`] : []),
      'BEGIN:VALARM',
      `TRIGGER:${alarmTrigger >= 0 ? '-' : ''}PT${Math.abs(alarmTrigger)}M`,
      'ACTION:DISPLAY',
      `DESCRIPTION:${summary}`,
      'END:VALARM',
      'END:VEVENT',
    )
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}
