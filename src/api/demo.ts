// 演示模式后端：未配置 Supabase 环境变量时启用
// 数据保存在 localStorage，可完整体验签到、补签、汇总、导出等流程
import type {
  AppUser,
  AttendanceRecord,
  ClassSession,
  Course,
  CourseInput,
  CourseStatus,
  Family,
  FamilyMember,
  Student,
} from '@/types'
import type {
  Backend,
  FamilyContext,
  ManualSessionInput,
  RescheduleInput,
  StudentInput,
} from './types'
import { addDays, fromISODate, sessionEnd, sessionStart, toISODate } from '@/lib/datetime'

const LS_KEY = 'kidcheckin-demo-v1'

interface DemoDB {
  user: AppUser
  family: Family
  members: FamilyMember[]
  students: Student[]
  courses: Course[]
  sessions: ClassSession[]
  attendance: AttendanceRecord[]
  nextId: number
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function uid(db: DemoDB, prefix: string): string {
  return `${prefix}-${db.nextId++}`
}

/** 生成演示数据（相对“今天”动态生成，保证任何日期打开都有内容） */
function seed(): DemoDB {
  const now = new Date()
  const iso = (d: Date) => toISODate(d)
  const nowIso = iso(now)

  const family: Family = {
    id: 'fam-demo',
    name: '我们的家',
    invite_code: 'DEMO01',
    ics_token: 'demo-ics-token',
    timezone: 'Asia/Shanghai',
    created_at: nowIso,
  }

  const members: FamilyMember[] = [
    {
      id: 'mem-1',
      family_id: 'fam-demo',
      user_id: 'u-demo-admin',
      role: 'admin',
      nickname: '爸爸',
      joined_at: nowIso,
    },
    {
      id: 'mem-2',
      family_id: 'fam-demo',
      user_id: 'u-demo-mom',
      role: 'member',
      nickname: '妈妈',
      joined_at: nowIso,
    },
  ]

  const students: Student[] = [
    { id: 'stu-1', family_id: 'fam-demo', name: '小明', avatar_emoji: '👦', birth_date: '2017-06-15', sort_order: 0, created_at: nowIso },
    { id: 'stu-2', family_id: 'fam-demo', name: '小红', avatar_emoji: '👧', birth_date: '2019-09-20', sort_order: 1, created_at: nowIso },
  ]

  const courses: Course[] = [
    {
      id: 'crs-1', family_id: 'fam-demo', student_id: 'stu-1', name: '钢琴课',
      institution: '汇音艺术中心', location: '汇音艺术中心 302 教室',
      weekdays: [6], start_time: '09:00:00', end_time: '10:30:00',
      start_date: iso(addDays(now, -90)), end_date: null,
      total_sessions: 48, reminder_minutes: 30, status: 'active', color: '#4f7cff', created_at: nowIso,
    },
    {
      id: 'crs-2', family_id: 'fam-demo', student_id: 'stu-1', name: '游泳课',
      institution: '市体育中心', location: '市体育中心 B1 游泳馆',
      weekdays: [7], start_time: '16:00:00', end_time: '17:00:00',
      start_date: iso(addDays(now, -150)), end_date: null,
      total_sessions: null, reminder_minutes: 60, status: 'active', color: '#22b573', created_at: nowIso,
    },
    {
      id: 'crs-3', family_id: 'fam-demo', student_id: 'stu-2', name: '围棋课',
      institution: '弈智围棋教室', location: '弈智围棋教室 2 楼',
      weekdays: [3], start_time: '18:30:00', end_time: '20:00:00',
      start_date: iso(addDays(now, -60)), end_date: null,
      total_sessions: 24, reminder_minutes: 30, status: 'active', color: '#f5a623', created_at: nowIso,
    },
    {
      id: 'crs-4', family_id: 'fam-demo', student_id: 'stu-2', name: '舞蹈课',
      institution: '小天鹅舞蹈中心', location: '小天鹅舞蹈中心 4 楼',
      weekdays: [6], start_time: '14:00:00', end_time: '15:30:00',
      start_date: iso(addDays(now, -120)), end_date: null,
      total_sessions: 40, reminder_minutes: 45, status: 'active', color: '#e85d9e', created_at: nowIso,
    },
  ]

  // 生成课次（含 2 节停课的节假日示例）
  const sessions: ClassSession[] = []
  for (const c of courses) {
    for (let d = fromISODate(c.start_date); toISODate(d) <= toISODate(addDays(now, 42)); d = addDays(d, 1)) {
      const date = toISODate(d)
      const wd = ((d.getDay() + 6) % 7) + 1
      if (!c.weekdays.includes(wd)) continue
      sessions.push({
        id: `ses-${c.id}-${date.replaceAll('-', '')}`,
        course_id: c.id,
        date,
        start_time: c.start_time,
        end_time: c.end_time,
        status: 'scheduled',
        note: null,
        reminder_sent_at: null,
        origin: 'schedule',
        created_at: nowIso,
      })
    }
  }

  // 为已结束的课次生成签到记录
  const attendance: AttendanceRecord[] = []
  const retroReasons = ['上周忘记打卡', '当天忘了点签到', '手机没电，事后补录']
  const leaveReasons = ['感冒发烧请假', '学校活动请假']
  for (const s of sessions) {
    if (sessionEnd(s).getTime() > Date.now()) continue
    const h = hash(s.id) % 100
    const operator = hash(s.id + 'op') % 2 === 0 ? 'u-demo-admin' : 'u-demo-mom'
    const mk = (status: AttendanceRecord['status'], method: AttendanceRecord['method'], reason: string | null): AttendanceRecord => ({
      id: `att-${s.id}`,
      session_id: s.id,
      student_id: courses.find(c => c.id === s.course_id)!.student_id,
      status,
      check_in_at: status === 'present'
        ? new Date(sessionStart(s).getTime() - (5 + (hash(s.id) % 15)) * 60000).toISOString()
        : null,
      method,
      operated_by: operator,
      reason,
      created_at: nowIso,
    })

    // 最近 10 天内约 1/3 不记录（便于体验补签）
    const daysAgo = Math.round((Date.now() - sessionEnd(s).getTime()) / 86400000)
    const skip = daysAgo <= 10 && hash(s.id + 'skip') % 3 === 0

    if (skip) continue
    if (h < 60) attendance.push(mk('present', 'manual', null))
    else if (h < 72) attendance.push(mk('present', 'retroactive', retroReasons[h % retroReasons.length]))
    else if (h < 80) attendance.push(mk('absent', 'manual', null))
    else if (h < 88) attendance.push(mk('leave', 'manual', leaveReasons[h % leaveReasons.length]))
    // 其余：未记录
  }

  return {
    user: { id: 'u-demo-admin', email: 'demo@kidcheckin.local' },
    family, members, students, courses, sessions, attendance,
    nextId: 1000,
  }
}

function loadDB(): DemoDB {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw) as DemoDB
  } catch { /* ignore */ }
  const db = seed()
  persist(db)
  return db
}

function persist(db: DemoDB) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(db))
  } catch { /* ignore */ }
}

export function resetDemoData() {
  localStorage.removeItem(LS_KEY)
  location.reload()
}

export function createDemoBackend(): Backend {
  const db = loadDB()
  const me = () => db.user.id
  const isAdmin = () => db.members.some(m => m.user_id === me() && m.role === 'admin')
  const findSession = (id: string) => db.sessions.find(s => s.id === id)

  const assertCanModifyCourse = (course: Course) => {
    if (!isAdmin()) throw new Error('仅家庭管理员可管理课程')
    if (course.family_id !== db.family.id) throw new Error('无权操作')
  }

  const save = () => persist(db)

  /** 与后端 RPC 相同的业务规则 */
  function doMarkAttendance(input: {
    session_id: string
    status: 'present' | 'absent' | 'leave'
    method: 'manual' | 'retroactive'
    reason?: string | null
  }) {
    const s = findSession(input.session_id)
    if (!s) throw new Error('课次不存在')
    if (s.status === 'cancelled') throw new Error('该课次已取消，无法记录出勤')

    if (input.method === 'retroactive' && !isAdmin()) {
      throw new Error('补签仅家长（管理员）可操作')
    }

    let checkInAt: string | null = null
    if (input.status === 'present') {
      if (input.method === 'manual') {
        const start = sessionStart(s).getTime()
        const now = Date.now()
        if (now < start - 2 * 3600_000 || now > start + 6 * 3600_000) {
          throw new Error('已超出可签到时间范围，请使用补签（需家长权限）')
        }
        checkInAt = new Date().toISOString()
      } else {
        checkInAt = new Date(sessionStart(s).getTime()).toISOString()
      }
    }

    const existing = db.attendance.find(a => a.session_id === s.id)
    const course = db.courses.find(c => c.id === s.course_id)!
    const base = {
      session_id: s.id,
      student_id: course.student_id,
      status: input.status,
      check_in_at: checkInAt,
      method: input.method,
      operated_by: me(),
      reason: input.reason?.trim() ? input.reason.trim().slice(0, 200) : null,
    }
    if (existing) Object.assign(existing, base)
    else db.attendance.push({ id: uid(db, 'att'), created_at: new Date().toISOString(), ...base })
    save()
  }

  return {
    mode: 'demo',

    async init() {
      return db.user
    },

    onAuthStateChange() {
      return () => {}
    },

    async signInWithPassword() { /* demo：已登录 */ },
    async signUpWithPassword() { /* demo：已登录 */ },
    async signInWithOtp() { /* demo：已登录 */ },
    async signOut() { /* demo：保持登录 */ },

    async loadFamilyContext(): Promise<FamilyContext> {
      return { family: db.family, members: db.members }
    },

    async createFamily() { throw new Error('演示模式不支持创建家庭，请配置 Supabase') },
    async joinFamily() { throw new Error('演示模式不支持加入家庭，请配置 Supabase') },

    async updateMyNickname(nickname: string) {
      const m = db.members.find(x => x.user_id === me())
      if (m) m.nickname = nickname.trim()
      save()
    },

    async setMemberRole(memberId: string, role: 'admin' | 'member') {
      const target = db.members.find(m => m.id === memberId)
      if (!target) throw new Error('成员不存在')
      if (!isAdmin()) throw new Error('仅家庭管理员可调整角色')
      const admins = db.members.filter(m => m.role === 'admin')
      if (target.role === 'admin' && role === 'member' && admins.length <= 1) {
        throw new Error('家庭至少需要保留一位管理员')
      }
      target.role = role
      save()
    },

    async removeMember(memberId: string) {
      if (!isAdmin()) throw new Error('仅家庭管理员可移除成员')
      const idx = db.members.findIndex(m => m.id === memberId)
      if (idx < 0) throw new Error('成员不存在')
      db.members.splice(idx, 1)
      save()
    },

    async leaveFamily() { /* demo：不支持 */ },

    async listStudents() {
      return [...db.students].sort((a, b) => a.sort_order - b.sort_order)
    },

    async saveStudent(input: StudentInput & { id?: string }) {
      if (input.id) {
        const st = db.students.find(x => x.id === input.id)
        if (!st) throw new Error('孩子不存在')
        st.name = input.name.trim()
        st.avatar_emoji = input.avatar_emoji
        st.birth_date = input.birth_date || null
      } else {
        db.students.push({
          id: uid(db, 'stu'),
          family_id: db.family.id,
          name: input.name.trim(),
          avatar_emoji: input.avatar_emoji,
          birth_date: input.birth_date || null,
          sort_order: db.students.length,
          created_at: new Date().toISOString(),
        })
      }
      save()
    },

    async deleteStudent(id: string) {
      const hasCourse = db.courses.some(c => c.student_id === id)
      if (hasCourse) throw new Error('该孩子名下还有课程，请先删除或转移课程')
      db.students = db.students.filter(s => s.id !== id)
      save()
    },

    async listCourses() {
      return [...db.courses].sort((a, b) => a.created_at.localeCompare(b.created_at))
    },

    async createCourse(input: CourseInput): Promise<Course> {
      const course: Course = {
        id: uid(db, 'crs'),
        family_id: db.family.id,
        student_id: input.student_id,
        name: input.name.trim(),
        institution: input.institution?.trim() || null,
        location: input.location?.trim() || null,
        weekdays: [...input.weekdays].sort(),
        start_time: input.start_time,
        end_time: input.end_time,
        start_date: input.start_date,
        end_date: input.end_date || null,
        total_sessions: input.total_sessions ?? null,
        reminder_minutes: input.reminder_minutes,
        status: 'active',
        color: input.color,
        created_at: new Date().toISOString(),
      }
      db.courses.push(course)
      // 生成课次
      for (let d = fromISODate(course.start_date); toISODate(d) <= toISODate(addDays(new Date(), 42)); d = addDays(d, 1)) {
        const date = toISODate(d)
        const wd = ((d.getDay() + 6) % 7) + 1
        if (!course.weekdays.includes(wd)) continue
        if (db.sessions.some(s => s.course_id === course.id && s.date === date)) continue
        db.sessions.push({
          id: `ses-${course.id}-${date.replaceAll('-', '')}`,
          course_id: course.id,
          date,
          start_time: course.start_time,
          end_time: course.end_time,
          status: 'scheduled',
          note: null,
          reminder_sent_at: null,
          origin: 'schedule',
          created_at: new Date().toISOString(),
        })
      }
      save()
      return course
    },

    async updateCourse(id: string, input: CourseInput) {
      const course = db.courses.find(c => c.id === id)
      if (!course) throw new Error('课程不存在')
      assertCanModifyCourse(course)
      Object.assign(course, {
        student_id: input.student_id,
        name: input.name.trim(),
        institution: input.institution?.trim() || null,
        location: input.location?.trim() || null,
        weekdays: [...input.weekdays].sort(),
        start_time: input.start_time,
        end_time: input.end_time,
        start_date: input.start_date,
        end_date: input.end_date || null,
        total_sessions: input.total_sessions ?? null,
        reminder_minutes: input.reminder_minutes,
        color: input.color,
      })
      // 重新生成未来课次：删除无记录的未来课次后重排
      db.sessions = db.sessions.filter(s => {
        if (s.course_id !== id) return true
        if (s.date < toISODate(new Date())) return true
        return false
      })
      for (let d = fromISODate(course.start_date); toISODate(d) <= toISODate(addDays(new Date(), 42)); d = addDays(d, 1)) {
        const date = toISODate(d)
        if (date < toISODate(new Date())) continue
        const wd = ((d.getDay() + 6) % 7) + 1
        if (!course.weekdays.includes(wd)) continue
        if (db.sessions.some(s => s.course_id === course.id && s.date === date)) continue
        db.sessions.push({
          id: `ses-${course.id}-${date.replaceAll('-', '')}`,
          course_id: course.id,
          date,
          start_time: course.start_time,
          end_time: course.end_time,
          status: 'scheduled',
          note: null,
          reminder_sent_at: null,
          origin: 'schedule',
          created_at: new Date().toISOString(),
        })
      }
      save()
    },

    async setCourseStatus(id: string, status: CourseStatus) {
      const course = db.courses.find(c => c.id === id)
      if (!course) throw new Error('课程不存在')
      course.status = status
      save()
    },

    async deleteCourse(id: string) {
      const course = db.courses.find(c => c.id === id)
      if (!course) throw new Error('课程不存在')
      assertCanModifyCourse(course)
      db.courses = db.courses.filter(c => c.id !== id)
      db.sessions = db.sessions.filter(s => s.course_id !== id)
      db.attendance = db.attendance.filter(a => !db.sessions.some(s => s.id === a.session_id) || true)
      // attendance 里的 session 已被删掉，直接按 course 对应 session 清理
      db.attendance = db.attendance.filter(a => {
        return db.sessions.some(s => s.id === a.session_id)
      })
      save()
    },

    async listSessions(from: string, to: string) {
      return db.sessions
        .filter(s => s.date >= from && s.date <= to)
        .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time))
    },

    async addManualSession(input: ManualSessionInput) {
      const course = db.courses.find(c => c.id === input.course_id)
      if (!course) throw new Error('课程不存在')
      assertCanModifyCourse(course)
      if (db.sessions.some(s => s.course_id === input.course_id && s.date === input.date)) {
        throw new Error('该课程在这一天已有课次')
      }
      db.sessions.push({
        id: uid(db, 'ses'),
        course_id: input.course_id,
        date: input.date,
        start_time: input.start_time,
        end_time: input.end_time,
        status: 'scheduled',
        note: input.note?.trim() || null,
        reminder_sent_at: null,
        origin: 'manual',
        created_at: new Date().toISOString(),
      })
      save()
    },

    async rescheduleSession(id: string, input: RescheduleInput) {
      const s = findSession(id)
      if (!s) throw new Error('课次不存在')
      if (db.sessions.some(x => x.course_id === s.course_id && x.date === input.date && x.id !== id)) {
        throw new Error('目标日期该课程已有课次')
      }
      s.status = 'cancelled'
      s.note = `调课至 ${input.date.slice(5).replace('-', '/')} ${input.start_time.slice(0, 5)}`
      db.sessions.push({
        id: uid(db, 'ses'),
        course_id: s.course_id,
        date: input.date,
        start_time: input.start_time,
        end_time: input.end_time,
        status: 'scheduled',
        note: '调课课次',
        reminder_sent_at: null,
        origin: 'manual',
        created_at: new Date().toISOString(),
      })
      save()
    },

    async cancelSession(id: string, note?: string) {
      const s = findSession(id)
      if (!s) throw new Error('课次不存在')
      s.status = 'cancelled'
      s.note = note?.trim() || null
      save()
    },

    async restoreSession(id: string) {
      const s = findSession(id)
      if (!s) throw new Error('课次不存在')
      s.status = 'scheduled'
      save()
    },

    async deleteSession(id: string) {
      const s = findSession(id)
      if (!s) throw new Error('课次不存在')
      db.attendance = db.attendance.filter(a => a.session_id !== id)
      db.sessions = db.sessions.filter(x => x.id !== id)
      save()
    },

    async listAttendance() {
      return [...db.attendance]
    },

    async markAttendance(input: {
      session_id: string
      status: 'present' | 'absent' | 'leave'
      method: 'manual' | 'retroactive'
      reason?: string | null
    }) {
      doMarkAttendance(input)
    },

    async clearAttendance(sessionId: string) {
      const rec = db.attendance.find(a => a.session_id === sessionId)
      if (!rec) return
      if (rec.operated_by !== me() && !isAdmin()) {
        throw new Error('仅记录创建者或家庭管理员可删除')
      }
      db.attendance = db.attendance.filter(a => a.session_id !== sessionId)
      save()
    },

    subscribe(_cb: () => void) {
      return () => {}
    },

    getICalUrl() {
      return ''
    },

    // ---------- 推送订阅（演示模式不支持） ----------
    async savePushSubscription(_sub: {
      endpoint: string
      keys: { p256dh: string; auth: string }
    }): Promise<void> {
      // demo mode: no-op
    },

    async deletePushSubscription(_endpoint: string): Promise<void> {
      // demo mode: no-op
    },

    async listPushSubscriptions(): Promise<
      { endpoint: string; keys: { p256dh: string; auth: string } }[]
    > {
      return []
    },
  }
}
