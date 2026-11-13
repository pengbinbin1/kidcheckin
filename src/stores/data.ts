// 课程 / 课次 / 签到数据 store
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type {
  AttendanceRecord,
  ClassSession,
  Course,
  CourseInput,
  CourseStatus,
  Student,
} from '@/types'
import type { ManualSessionInput, RescheduleInput, StudentInput } from '@/api/types'
import { getBackend } from '@/api'
import { addDays, toISODate } from '@/lib/datetime'

export const useDataStore = defineStore('data', () => {
  const students = ref<Student[]>([])
  const courses = ref<Course[]>([])
  const sessions = ref<ClassSession[]>([])
  const attendance = ref<AttendanceRecord[]>([])
  const loading = ref(false)
  const loadedOnce = ref(false)

  const courseById = computed(() => new Map(courses.value.map(c => [c.id, c])))
  const studentById = computed(() => new Map(students.value.map(s => [s.id, s])))
  const attendanceBySession = computed(
    () => new Map(attendance.value.map(a => [a.session_id, a])),
  )

  /** 已结束但未记录的课次（待补记提醒） */
  const recentUnrecorded = computed(() => {
    const now = Date.now()
    return sessions.value
      .filter(
        s =>
          s.status === 'scheduled' &&
          new Date(`${s.date}T${s.end_time}`).getTime() <= now &&
          new Date(`${s.date}T${s.end_time}`).getTime() >= now - 14 * 86400_000 &&
          !attendanceBySession.value.has(s.id),
      )
      .sort((a, b) => b.date.localeCompare(a.date))
  })

  async function refresh(opts: { silent?: boolean } = {}) {
    if (!opts.silent) {
      loading.value = true
    }
    try {
      const backend = await getBackend()
      const from = toISODate(addDays(new Date(), -120))
      const to = toISODate(addDays(new Date(), 60))
      const [sts, crs, ses, att] = await Promise.all([
        backend.listStudents(),
        backend.listCourses(),
        backend.listSessions(from, to),
        backend.listAttendance(),
      ])
      students.value = sts
      courses.value = crs
      sessions.value = ses
      attendance.value = att
      loadedOnce.value = true
    } finally {
      if (!opts.silent) loading.value = false
    }
  }

  async function bootstrap() {
    await refresh()
    const backend = await getBackend()
    if (backend.mode === 'live') {
      backend.subscribe(() => {
        void refresh({ silent: true })
      })
    }
  }

  // ---------- 孩子管理 ----------

  async function saveStudent(input: StudentInput & { id?: string }) {
    const backend = await getBackend()
    await backend.saveStudent(input)
    await refresh({ silent: true })
  }

  async function deleteStudent(id: string) {
    const backend = await getBackend()
    await backend.deleteStudent(id)
    await refresh({ silent: true })
  }

  // ---------- 课程管理 ----------

  async function createCourse(input: CourseInput) {
    const backend = await getBackend()
    await backend.createCourse(input)
    await refresh({ silent: true })
  }

  async function updateCourse(id: string, input: CourseInput) {
    const backend = await getBackend()
    await backend.updateCourse(id, input)
    await refresh({ silent: true })
  }

  async function setCourseStatus(id: string, status: CourseStatus) {
    const backend = await getBackend()
    await backend.setCourseStatus(id, status)
    await refresh({ silent: true })
  }

  async function deleteCourse(id: string) {
    const backend = await getBackend()
    await backend.deleteCourse(id)
    await refresh({ silent: true })
  }

  // ---------- 课次管理 ----------

  async function addManualSession(input: ManualSessionInput) {
    const backend = await getBackend()
    await backend.addManualSession(input)
    await refresh({ silent: true })
  }

  async function rescheduleSession(id: string, input: RescheduleInput) {
    const backend = await getBackend()
    await backend.rescheduleSession(id, input)
    await refresh({ silent: true })
  }

  async function cancelSession(id: string, note?: string) {
    const backend = await getBackend()
    await backend.cancelSession(id, note)
    await refresh({ silent: true })
  }

  async function restoreSession(id: string) {
    const backend = await getBackend()
    await backend.restoreSession(id)
    await refresh({ silent: true })
  }

  async function deleteSession(id: string) {
    const backend = await getBackend()
    await backend.deleteSession(id)
    await refresh({ silent: true })
  }

  // ---------- 签到记录 ----------

  async function markAttendance(input: {
    session_id: string
    status: 'present' | 'absent' | 'leave'
    method: 'manual' | 'retroactive'
    reason?: string | null
  }) {
    const backend = await getBackend()
    await backend.markAttendance(input)
    await refresh({ silent: true })
  }

  async function clearAttendance(sessionId: string) {
    const backend = await getBackend()
    await backend.clearAttendance(sessionId)
    await refresh({ silent: true })
  }

  return {
    students,
    courses,
    sessions,
    attendance,
    loading,
    loadedOnce,
    courseById,
    studentById,
    attendanceBySession,
    recentUnrecorded,
    refresh,
    bootstrap,
    saveStudent,
    deleteStudent,
    createCourse,
    updateCourse,
    setCourseStatus,
    deleteCourse,
    addManualSession,
    rescheduleSession,
    cancelSession,
    restoreSession,
    deleteSession,
    markAttendance,
    clearAttendance,
  }
})
