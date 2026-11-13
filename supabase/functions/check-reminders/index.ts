// Edge Function: check-reminders
// 定时检查即将开始的课次，向家庭成员的已订阅设备推送提醒
// 由 pg_cron 通过 HTTP 触发（见部署指南），也可手动 POST 测试
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')

const supabase = createClient(supabaseUrl, serviceKey)

Deno.serve(async (req: Request) => {
  // 只允许携带 service_role key 的调用（pg_cron 的 net.http_post）
  const authHeader = req.headers.get('authorization') ?? ''
  if (authHeader !== `Bearer ${serviceKey}`) {
    return json({ error: 'unauthorized' }, 401)
  }

  // VAPID 密钥未配置时静默跳过（仍标记已提醒，避免反复检查）
  if (!vapidPublicKey || !vapidPrivateKey) {
    return json({ skipped: 'vapid keys not configured' }, 200)
  }

  webpush.setVapidDetails('mailto:family@kidcheckin.app', vapidPublicKey, vapidPrivateKey)

  // 1) 找出「未来 N 分钟内开始、未发过提醒」的课次
  //    N = 该课程的 reminder_minutes
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const threeDaysLater = new Date(now.getTime() + 3 * 24 * 3600_000)
    .toISOString()
    .slice(0, 10)

  // 拉取未来 3 天内、未提醒过的候选课次（含课程与家庭信息）
  const { data: sessions, error } = await supabase.rpc('find_due_reminders')

  if (error) {
    return json({ error: error.message }, 500)
  }

  let sent = 0
  const results: unknown[] = []

  for (const s of (sessions ?? []) as DueReminder[]) {
    // 2) 该家庭所有推送订阅
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('endpoint,p256dh,auth')
      .eq('family_id', s.family_id)

    const weekday = '周' + '日一二三四五六'[new Date(`${s.sess_date}T00:00:00`).getDay()]
    const lead = s.reminder_minutes
    const title = `⏰ ${s.course_name}${s.student_name ? ' · ' + s.student_name : ''}`
    const body = `${weekday} ${s.sess_date.slice(5).replace('-', '/')} ${s.start_time.slice(0, 5)} 开始` +
      (lead >= 60
        ? `（提前 ${Math.floor(lead / 60)} 小时${lead % 60 ? ' ' + (lead % 60) + ' 分钟' : ''}提醒）`
        : `（提前 ${lead} 分钟提醒）`) +
      (s.location ? `\n📍 ${s.location}` : '')

    let okCount = 0
    let failCount = 0

    for (const sub of (subs ?? []) as PushSubRow[]) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify({
            title,
            body,
            tag: `session-${s.session_id}`,
            url: '/',
          }),
        )
        okCount++
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        // 410/404 = 订阅已失效，删除
        if (status === 404 || status === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        }
        failCount++
      }
    }

    // 3) 标记已提醒（无论是否有订阅设备）
    await supabase
      .from('sessions')
      .update({ reminder_sent_at: now.toISOString() })
      .eq('id', s.session_id)

    sent++
    results.push({ session: s.session_id, date: s.sess_date, pushed: okCount, failed: failCount })
  }

  return json({ checked: (sessions ?? []).length, reminded: sent, results })
})

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
