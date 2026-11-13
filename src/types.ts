// 全局领域类型（与 supabase/migrations/0001_init.sql 中的表结构一一对应）

export type Role = 'admin' | 'member'
export type CourseStatus = 'active' | 'paused' | 'finished'
export type SessionStatus = 'scheduled' | 'cancelled'
export type SessionOrigin = 'schedule' | 'manual'
export type AttendanceStatus = 'present' | 'absent' | 'leave'
export type AttendanceMethod = 'manual' | 'retroactive'

export interface AppUser {
  id: string
  email?: string
}

export interface Family {
  id: string
  name: string
  invite_code: string
  ics_token: string
  timezone: string
  created_at: string
}

export interface FamilyMember {
  id: string
  family_id: string
  user_id: string
  role: Role
  nickname: string
  joined_at: string
}

export interface Student {
  id: string
  family_id: string
  name: string
  avatar_emoji: string
  birth_date: string | null
  sort_order: number
  created_at: string
}

export interface Course {
  id: string
  family_id: string
  student_id: string
  name: string
  institution: string | null
  location: string | null
  weekdays: number[] // ISO: 1=周一 … 7=周日
  start_time: string // 'HH:MM:SS'
  end_time: string
  start_date: string
  end_date: string | null
  total_sessions: number | null
  reminder_minutes: number
  status: CourseStatus
  color: string
  created_at: string
}

export interface ClassSession {
  id: string
  course_id: string
  date: string
  start_time: string
  end_time: string
  status: SessionStatus
  note: string | null
  reminder_sent_at: string | null
  origin: SessionOrigin
  created_at: string
}

export interface AttendanceRecord {
  id: string
  session_id: string
  student_id: string
  status: AttendanceStatus
  check_in_at: string | null
  method: AttendanceMethod
  operated_by: string | null
  reason: string | null
  created_at: string
}

// 供导出/统计使用的家庭上下文
export interface FamilyContext {
  family: Family
  members: FamilyMember[]
}

export interface CourseInput {
  student_id: string
  name: string
  institution: string | null
  location: string | null
  weekdays: number[]
  start_time: string
  end_time: string
  start_date: string
  end_date: string | null
  total_sessions: number | null
  reminder_minutes: number
  color: string
}

export const COURSE_COLORS = ['#4f7cff', '#22b573', '#f5a623', '#e85d9e', '#7a5af8', '#00b8d9', '#ff6b4a', '#8d9aa8']

export const COURSE_EMOJIS = ['🎹', '🏊', '🎨', '⚽', '♟️', '💃', '🥁', '🎤', '📚', '🤸']

export const REMINDER_OPTIONS = [
  { value: 15, label: '提前 15 分钟' },
  { value: 30, label: '提前 30 分钟' },
  { value: 45, label: '提前 45 分钟' },
  { value: 60, label: '提前 1 小时' },
  { value: 120, label: '提前 2 小时' },
  { value: 1440, label: '提前 1 天' },
]
