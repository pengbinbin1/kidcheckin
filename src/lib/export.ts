// CSV 导出：签到明细 + 汇总统计
import type { AttendanceRecord, ClassSession, Course, FamilyMember, Student } from '@/types'
import { fmtClock, weekdayCN } from '@/lib/datetime'
import { computeCourseStats } from '@/lib/stats'

export interface ExportScope {
  studentId: string | null // null = 所有孩子
  courseId: string | null // null = 所有课程
  from: string | null // null = 不限开始日期
  to: string | null // null = 不限结束日期
}

/** 筛选出范围内的课次 */
export function filterSessions(
  sessions: ClassSession[],
  courses: Course[],
  scope: ExportScope,
): ClassSession[] {
  return sessions.filter((s) => {
    if (scope.from && s.date < scope.from) return false
    if (scope.to && s.date > scope.to) return false
    const course = courses.find(c => c.id === s.course_id)
    if (!course) return false
    if (scope.courseId && course.id !== scope.courseId) return false
    if (scope.studentId && course.student_id !== scope.studentId) return false
    return true
  })
}

export function attendanceStatusCN(r?: AttendanceRecord | null): string {
  if (!r) return '未记录'
  if (r.status === 'present') return '出勤'
  if (r.status === 'absent') return '缺勤'
  return '请假'
}

function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function buildCSVString(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvEscape).join(',')]
  for (const r of rows) lines.push(r.map(csvEscape).join(','))
  return `\ufeff${lines.join('\r\n')}`
}

export interface ExportData {
  sessions: ClassSession[]
  courses: Course[]
  students: Student[]
  members: FamilyMember[]
  attendanceMap: Map<string, AttendanceRecord>
}

/** 签到明细 CSV */
export function buildDetailCSV(scope: ExportScope, data: ExportData): string {
  const list = filterSessions(data.sessions, data.courses, scope).sort((a, b) =>
    a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time),
  )
  const nick = (uid: string | null | undefined) =>
    data.members.find(m => m.user_id === uid)?.nickname ?? uid ?? ''

  const rows = list.map((s) => {
    const course = data.courses.find(c => c.id === s.course_id)
    const student = data.students.find(x => x.id === course?.student_id)
    const r = data.attendanceMap.get(s.id)
    return [
      s.date,
      weekdayCN(s.date),
      student?.name ?? '',
      course?.name ?? '',
      `${fmtClock(s.start_time)}-${fmtClock(s.end_time)}`,
      s.status === 'cancelled' ? '已取消' : '正常',
      attendanceStatusCN(r),
      r?.check_in_at ? new Date(r.check_in_at).toLocaleString('zh-CN', { hour12: false }) : '',
      r ? (r.method === 'retroactive' ? '补签' : '现场') : '',
      nick(r?.operated_by),
      r?.reason ?? '',
      course?.institution ?? '',
      course?.location ?? '',
    ]
  })

  const headers = [
    '日期', '星期', '孩子', '课程', '上课时间', '课次状态',
    '出勤状态', '签到时间', '签到方式', '操作人', '原因', '机构', '地点',
  ]
  return buildCSVString(headers, rows)
}

/** 汇总统计 CSV（按课程） */
export function buildSummaryCSV(scope: ExportScope, data: ExportData): string {
  const inScope = data.courses.filter((c) => {
    if (scope.courseId && c.id !== scope.courseId) return false
    if (scope.studentId && c.student_id !== scope.studentId) return false
    return true
  })

  const rows = inScope.map((course) => {
    const courseSessions = data.sessions.filter(s => s.course_id === course.id)
    const stats = computeCourseStats(course, courseSessions, data.attendanceMap)
    const student = data.students.find(x => x.id === course.student_id)
    return [
      student?.name ?? '',
      course.name,
      stats.total,
      stats.cancelled,
      stats.attended,
      stats.attendedRetro,
      stats.absent,
      stats.leave,
      stats.unrecorded,
      stats.attendanceRate != null ? `${Math.round(stats.attendanceRate * 100)}%` : '—',
      course.total_sessions ?? '',
      stats.packageUsed,
      course.total_sessions != null ? Math.max(0, course.total_sessions - stats.packageUsed) : '',
      course.institution ?? '',
    ]
  })

  const headers = [
    '孩子', '课程', '总课次', '已取消', '出勤', '其中补签', '缺勤', '请假', '未记录',
    '出勤率', '课时包总量', '课时包已消耗', '课时包剩余', '机构',
  ]
  return buildCSVString(headers, rows)
}

export function csvFileName(base: string): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${base}_${y}${m}${day}.csv`
}

export async function exportCSV(fileName: string, csv: string): Promise<void> {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })

  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
  if (nav.canShare && typeof File !== 'undefined') {
    const file = new File([blob], fileName, { type: 'text/csv;charset=utf-8' })
    if (nav.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] })
        return
      } catch (e) {
        if ((e as DOMException).name === 'AbortError') return
      }
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
