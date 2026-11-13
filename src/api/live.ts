// Supabase live 后端实现
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
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

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? ''

let sb: SupabaseClient | null = null
if (supabaseUrl && supabaseAnonKey) {
  sb = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
}

/** 将 Supabase 错误转成中文提示 */
function friendly(err: { message: string; code?: string } | null): string {
  if (!err) return '操作失败'
  const m = err.message ?? ''
  if (m.includes('Invalid login credentials')) return '邮箱或密码不正确'
  if (m.includes('User already registered')) return '该邮箱已注册，请直接登录'
  if (m.includes('Email not confirmed')) return '请先到邮箱点击确认链接'
  if (err.code === '23505' || m.includes('duplicate key')) return '该课程在这一天已有课次'
  if (err.code === '23503' || m.includes('violates foreign key')) return '存在关联数据，无法删除'
  if (m.includes('Failed to fetch')) return '网络连接失败，请检查网络'
  return m
}

export function createLiveBackend(): Backend {
  if (!sb) throw new Error('Supabase client not initialized')

  return {
    mode: 'live',

    // ---------- 认证 ----------
    async init(): Promise<AppUser | null> {
      const { data } = await sb!.auth.getSession()
      return data.session?.user ? { id: data.session.user.id, email: data.session.user.email } : null
    },

    onAuthStateChange(cb) {
      const { data } = sb!.auth.onAuthStateChange((_event, session) => {
        cb(session?.user ? { id: session.user.id, email: session.user.email } : null)
      })
      return () => data.subscription.unsubscribe()
    },

    async signInWithPassword(email: string, password: string) {
      const { error } = await sb!.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw new Error(friendly(error))
    },

    async signUpWithPassword(email: string, password: string) {
      const { error } = await sb!.auth.signUp({ email: email.trim(), password })
      if (error) throw new Error(friendly(error))
    },

    async signInWithOtp(email: string) {
      const { error } = await sb!.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin },
      })
      if (error) throw new Error(friendly(error))
    },

    async signOut() {
      await sb!.auth.signOut()
    },

    // ---------- 家庭 ----------
    async loadFamilyContext(): Promise<FamilyContext | null> {
      const { data: userData } = await sb!.auth.getUser()
      if (!userData.user) return null

      const { data, error } = await sb!
        .from('family_members')
        .select('*, family:families(*)')
        .eq('user_id', userData.user.id)
        .maybeSingle()

      if (error) throw new Error(friendly(error))
      if (!data) return null

      const { data: members, error: mErr } = await sb!
        .from('family_members')
        .select('*')
        .eq('family_id', data.family_id)
        .order('joined_at')

      if (mErr) throw new Error(friendly(mErr))

      return {
        family: data.family as unknown as Family,
        members: (members ?? []) as unknown as FamilyMember[],
      }
    },

    async createFamily(name: string, nickname: string) {
      const { error } = await sb!.rpc('create_family', {
        p_name: name.trim(),
        p_nickname: nickname.trim(),
      })
      if (error) throw new Error(friendly(error))
    },

    async joinFamily(inviteCode: string, nickname: string) {
      const { error } = await sb!.rpc('join_family', {
        p_invite_code: inviteCode.trim().toUpperCase(),
        p_nickname: nickname.trim(),
      })
      if (error) throw new Error(friendly(error))
    },

    async updateMyNickname(nickname: string) {
      const { error } = await sb!.rpc('update_own_nickname', { p_nickname: nickname.trim() })
      if (error) throw new Error(friendly(error))
    },

    async setMemberRole(memberId: string, role: 'admin' | 'member') {
      const { error } = await sb!.rpc('set_member_role', { p_member_id: memberId, p_role: role })
      if (error) throw new Error(friendly(error))
    },

    async removeMember(memberId: string) {
      const { error } = await sb!.rpc('remove_member', { p_member_id: memberId })
      if (error) throw new Error(friendly(error))
    },

    async leaveFamily() {
      const { error } = await sb!.rpc('leave_family')
      if (error) throw new Error(friendly(error))
    },

    // ---------- 孩子 ----------
    async listStudents(): Promise<Student[]> {
      const { data, error } = await sb!
        .from('students')
        .select('*')
        .order('sort_order')
        .order('created_at')
      if (error) throw new Error(friendly(error))
      return (data ?? []) as unknown as Student[]
    },

    async saveStudent(input: StudentInput & { id?: string }) {
      if (input.id) {
        const { error } = await sb!
          .from('students')
          .update({
            name: input.name.trim(),
            avatar_emoji: input.avatar_emoji,
            birth_date: input.birth_date || null,
          })
          .eq('id', input.id)
        if (error) throw new Error(friendly(error))
      } else {
        const { count, error: cErr } = await sb!
          .from('students')
          .select('id', { count: 'exact', head: true })
        if (cErr) throw new Error(friendly(cErr))

        const { error } = await sb!.from('students').insert({
          name: input.name.trim(),
          avatar_emoji: input.avatar_emoji,
          birth_date: input.birth_date || null,
          sort_order: count ?? 0,
        })
        if (error) throw new Error(friendly(error))
      }
    },

    async deleteStudent(id: string) {
      const { error } = await sb!.from('students').delete().eq('id', id)
      if (error) throw new Error(friendly(error))
    },

    // ---------- 课程 ----------
    async listCourses(): Promise<Course[]> {
      const { data, error } = await sb!.from('courses').select('*').order('created_at')
      if (error) throw new Error(friendly(error))
      return (data ?? []) as unknown as Course[]
    },

    async createCourse(input: CourseInput): Promise<Course> {
      const { data, error } = await sb!
        .from('courses')
        .insert({
          student_id: input.student_id,
          name: input.name.trim(),
          institution: input.institution?.trim() || null,
          location: input.location?.trim() || null,
          weekdays: input.weekdays,
          start_time: input.start_time,
          end_time: input.end_time,
          start_date: input.start_date,
          end_date: input.end_date || null,
          total_sessions: input.total_sessions ?? null,
          reminder_minutes: input.reminder_minutes,
          color: input.color,
        })
        .select()
        .single()

      if (error) throw new Error(friendly(error))

      const { error: genErr } = await sb!.rpc('generate_sessions', { p_course_id: data.id })
      if (genErr) throw new Error(friendly(genErr))

      return data as unknown as Course
    },

    async updateCourse(id: string, input: CourseInput) {
      const { error } = await sb!
        .from('courses')
        .update({
          student_id: input.student_id,
          name: input.name.trim(),
          institution: input.institution?.trim() || null,
          location: input.location?.trim() || null,
          weekdays: input.weekdays,
          start_time: input.start_time,
          end_time: input.end_time,
          start_date: input.start_date,
          end_date: input.end_date || null,
          total_sessions: input.total_sessions ?? null,
          reminder_minutes: input.reminder_minutes,
          color: input.color,
        })
        .eq('id', id)
      if (error) throw new Error(friendly(error))

      // 重新生成未来课次
      const { error: syncErr } = await sb!.rpc('sync_course_sessions', { p_course_id: id })
      if (syncErr) throw new Error(friendly(syncErr))
    },

    async setCourseStatus(id: string, status: CourseStatus) {
      const { error } = await sb!.from('courses').update({ status }).eq('id', id)
      if (error) throw new Error(friendly(error))
      if (status === 'active') {
        const { error: syncErr } = await sb!.rpc('sync_course_sessions', { p_course_id: id })
        if (syncErr) throw new Error(friendly(syncErr))
      }
    },

    async deleteCourse(id: string) {
      const { error } = await sb!.from('courses').delete().eq('id', id)
      if (error) throw new Error(friendly(error))
    },

    // ---------- 课次 ----------
    async listSessions(from: string, to: string): Promise<ClassSession[]> {
      const { data, error } = await sb!
        .from('sessions')
        .select('*')
        .gte('date', from)
        .lte('date', to)
        .order('date', { ascending: true })
      if (error) throw new Error(friendly(error))
      return (data ?? []) as unknown as ClassSession[]
    },

    async addManualSession(input: ManualSessionInput) {
      const { error } = await sb!.from('sessions').insert({
        course_id: input.course_id,
        date: input.date,
        start_time: input.start_time,
        end_time: input.end_time,
        note: input.note?.trim() || null,
        origin: 'manual',
      })
      if (error) throw new Error(friendly(error))
    },

    async rescheduleSession(id: string, input: RescheduleInput) {
      const { error } = await sb!.rpc('reschedule_session', {
        p_session_id: id,
        p_new_date: input.date,
        p_new_start: input.start_time,
        p_new_end: input.end_time,
      })
      if (error) throw new Error(friendly(error))
    },

    async cancelSession(id: string, note?: string) {
      const { error } = await sb!
        .from('sessions')
        .update({ status: 'cancelled', note: note?.trim() || null })
        .eq('id', id)
      if (error) throw new Error(friendly(error))
    },

    async restoreSession(id: string) {
      const { error } = await sb!.from('sessions').update({ status: 'scheduled' }).eq('id', id)
      if (error) throw new Error(friendly(error))
    },

    async deleteSession(id: string) {
      const { error } = await sb!.from('sessions').delete().eq('id', id)
      if (error) throw new Error(friendly(error))
    },

    // ---------- 签到记录 ----------
    async listAttendance(): Promise<AttendanceRecord[]> {
      const { data, error } = await sb!.from('attendance_records').select('*')
      if (error) throw new Error(friendly(error))
      return (data ?? []) as unknown as AttendanceRecord[]
    },

    async markAttendance(input: {
      session_id: string
      status: 'present' | 'absent' | 'leave'
      method: 'manual' | 'retroactive'
      reason?: string | null
    }) {
      const { error } = await sb!.rpc('mark_attendance', {
        p_session_id: input.session_id,
        p_status: input.status,
        p_method: input.method,
        p_reason: input.reason ?? null,
      })
      if (error) throw new Error(friendly(error))
    },

    async clearAttendance(sessionId: string) {
      const { error } = await sb!.rpc('clear_attendance', { p_session_id: sessionId })
      if (error) throw new Error(friendly(error))
    },

    // ---------- 订阅 ----------
    subscribe(cb: () => void) {
      const channel = sb!
        .channel('family-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, () => cb())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, () => cb())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'courses' }, () => cb())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, () => cb())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'family_members' }, () => cb())
        .subscribe()
      return () => {
        sb!.removeChannel(channel)
      }
    },

    // ---------- 提醒 ----------
    getICalUrl(): string {
      return ''
    },

    // ---------- 推送订阅 ----------
    async savePushSubscription(sub: {
      endpoint: string
      keys: { p256dh: string; auth: string }
    }): Promise<void> {
      const { data: userData } = await sb!.auth.getUser()
      if (!userData.user) throw new Error('Not logged in')
      const { data: member } = await sb!
        .from('family_members')
        .select('family_id')
        .eq('user_id', userData.user.id)
        .single()
      if (!member) throw new Error('No family')
      const { error } = await sb!.from('push_subscriptions').upsert(
        {
          user_id: userData.user.id,
          family_id: member.family_id,
          endpoint: sub.endpoint,
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
        },
        { onConflict: 'endpoint' },
      )
      if (error) throw new Error(friendly(error))
    },

    async deletePushSubscription(endpoint: string): Promise<void> {
      const { error } = await sb!.from('push_subscriptions').delete().eq('endpoint', endpoint)
      if (error) throw new Error(friendly(error))
    },

    async listPushSubscriptions(): Promise<
      { endpoint: string; keys: { p256dh: string; auth: string } }[]
    > {
      const { data, error } = await sb!
        .from('push_subscriptions')
        .select('endpoint,p256dh,auth')
      if (error) throw new Error(friendly(error))
      return (data ?? []).map((r: Record<string, string>) => ({
        endpoint: r.endpoint,
        keys: { p256dh: r.p256dh, auth: r.auth },
      }))
    },
  }
}
