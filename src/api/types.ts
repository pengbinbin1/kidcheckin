// 后端接口：live 实现（Supabase）与 demo 实现（本地演示数据）共用
import type {
  AppUser,
  AttendanceRecord,
  AttendanceStatus,
  AttendanceMethod,
  ClassSession,
  Course,
  CourseInput,
  CourseStatus,
  Family,
  FamilyMember,
  Student,
} from '@/types'

export interface FamilyContext {
  family: Family
  members: FamilyMember[]
}

export interface ManualSessionInput {
  course_id: string
  date: string
  start_time: string
  end_time: string
  note?: string | null
}

export interface RescheduleInput {
  date: string
  start_time: string
  end_time: string
}

export interface StudentInput {
  name: string
  avatar_emoji: string
  birth_date?: string | null
}

export interface Backend {
  readonly mode: 'live' | 'demo'

  // ---- 认证 ----
  init(): Promise<AppUser | null>
  onAuthStateChange(cb: (user: AppUser | null) => void): () => void
  signInWithPassword(email: string, password: string): Promise<void>
  signUpWithPassword(email: string, password: string): Promise<void>
  signInWithOtp(email: string): Promise<void>
  signOut(): Promise<void>

  // ---- 家庭 ----
  loadFamilyContext(): Promise<FamilyContext | null>
  createFamily(name: string, nickname: string): Promise<void>
  joinFamily(inviteCode: string, nickname: string): Promise<void>
  updateMyNickname(nickname: string): Promise<void>
  setMemberRole(memberId: string, role: 'admin' | 'member'): Promise<void>
  removeMember(memberId: string): Promise<void>
  leaveFamily(): Promise<void>

  // ---- 孩子 ----
  listStudents(): Promise<Student[]>
  saveStudent(input: StudentInput & { id?: string }): Promise<void>
  deleteStudent(id: string): Promise<void>

  // ---- 课程 ----
  listCourses(): Promise<Course[]>
  createCourse(input: CourseInput): Promise<Course>
  updateCourse(id: string, input: CourseInput): Promise<void>
  setCourseStatus(id: string, status: CourseStatus): Promise<void>
  deleteCourse(id: string): Promise<void>

  // ---- 课次 ----
  listSessions(from: string, to: string): Promise<ClassSession[]>
  addManualSession(input: ManualSessionInput): Promise<void>
  rescheduleSession(id: string, input: RescheduleInput): Promise<void>
  cancelSession(id: string, note?: string): Promise<void>
  restoreSession(id: string): Promise<void>
  deleteSession(id: string): Promise<void>

  // ---- 签到记录 ----
  listAttendance(): Promise<AttendanceRecord[]>
  markAttendance(input: {
    session_id: string
    status: AttendanceStatus
    method: AttendanceMethod
    reason?: string | null
  }): Promise<void>
  clearAttendance(sessionId: string): Promise<void>

  // ---- 推送订阅 ----
  savePushSubscription(sub: {
    endpoint: string
    keys: { p256dh: string; auth: string }
  }): Promise<void>
  deletePushSubscription(endpoint: string): Promise<void>
  listPushSubscriptions(): Promise<{ endpoint: string; keys: { p256dh: string; auth: string } }[]>

  // ---- 变更订阅（多用户实时刷新） ----
  subscribe(cb: () => void): () => void

  // ---- 提醒 ----
  getICalUrl(): string
}
