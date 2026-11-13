// 出勤统计：所有比率分母仅含「已记录」课次，未记录单独展示
import type { AttendanceRecord, ClassSession, Course, FamilyMember } from '@/types'
import { sessionEnd } from '@/lib/datetime'

export interface CourseStats {
  total: number // 已排课次（不含取消）
  cancelled: number
  held: number // 已上（结束时刻已过且未取消）
  upcoming: number
  attended: number // 出勤（含补签）
  attendedManual: number // 现场签到
  attendedRetro: number // 补签出勤
  absent: number
  leave: number
  unrecorded: number // 已结束但无记录
  attendanceRate: number | null
  packageTotal: number | null
  packageUsed: number
  packageLeft: number | null
}

export function computeCourseStats(
  course: Course,
  sessions: ClassSession[],
  attendanceBySession: Map<string, AttendanceRecord>,
  now = new Date(),
): CourseStats {
  const mine = sessions.filter(s => s.course_id === course.id)
  const stats: CourseStats = {
    total: 0, cancelled: 0, held: 0, upcoming: 0,
    attended: 0, attendedManual: 0, attendedRetro: 0,
    absent: 0, leave: 0, unrecorded: 0,
    attendanceRate: null,
    packageTotal: course.total_sessions,
    packageUsed: 0, packageLeft: course.total_sessions,
  }

  for (const s of mine) {
    if (s.status === 'cancelled') {
      stats.cancelled++
      continue
    }
    stats.total++
    const ended = sessionEnd(s).getTime() <= now.getTime()
    const record = attendanceBySession.get(s.id)
    if (ended) {
      stats.held++
      if (!record) {
        stats.unrecorded++
      } else if (record.status === 'present') {
        stats.attended++
        if (record.method === 'retroactive') stats.attendedRetro++
        else stats.attendedManual++
      } else if (record.status === 'absent') {
        stats.absent++
      } else {
        stats.leave++
      }
    } else {
      stats.upcoming++
    }
  }

  const recorded = stats.attended + stats.absent + stats.leave
  if (recorded > 0) stats.attendanceRate = stats.attended / recorded

  // 课时包：请假不计入消耗
  stats.packageUsed = mine.filter(s => {
    if (s.status === 'cancelled') return false
    if (sessionEnd(s).getTime() > now.getTime()) return false
    const r = attendanceBySession.get(s.id)
    return !(r && r.status === 'leave')
  }).length

  if (course.total_sessions != null) {
    stats.packageLeft = Math.max(0, course.total_sessions - stats.packageUsed)
  } else {
    stats.packageLeft = null
  }

  return stats
}

export function operatorName(operatedBy: string | null, members: FamilyMember[]): string {
  if (!operatedBy) return '—'
  return members.find(m => m.user_id === operatedBy)?.nickname ?? '家人'
}
