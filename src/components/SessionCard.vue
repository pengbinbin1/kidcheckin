<script setup lang="ts">
import { computed } from 'vue'
import type { AttendanceRecord, ClassSession, Course, Student } from '@/types'
import { fmtClock, weekdayCN, minutesFromNow, sessionStart, sessionEnd } from '@/lib/datetime'

const props = defineProps<{
  session: ClassSession
  course: Course
  student?: Student
  record?: AttendanceRecord | null
  showDate?: boolean
}>()

const isToday = computed(() => props.session.date === new Date().toISOString().slice(0, 10))
const isPast = computed(() => sessionEnd(props.session).getTime() < Date.now())
const upcomingMinutes = computed(() => minutesFromNow(sessionStart(props.session)))

const canCheckIn = computed(() => {
  if (props.session.status !== 'scheduled') return false
  if (props.record) return false
  // 已结束的课次需补签（弹层内处理），进行中或 2 小时内开始的课可现场签到
  if (isPast.value) return false
  return upcomingMinutes.value <= 120
})

const statusBadge = computed(() => {
  const s = props.session
  if (s.status === 'cancelled') return { text: '已取消', cls: 'badge-gray' }
  if (props.record) {
    if (props.record.status === 'present') {
      return props.record.method === 'retroactive'
        ? { text: '补签', cls: 'badge-purple' }
        : { text: '已签到', cls: 'badge-green' }
    }
    if (props.record.status === 'absent') return { text: '缺勤', cls: 'badge-red' }
    if (props.record.status === 'leave') return { text: '请假', cls: 'badge-amber' }
  }
  if (isPast.value) return { text: '未记录', cls: 'badge-amber' }
  if (isToday.value) return { text: '今天', cls: 'badge-primary' }
  return null
})

const emoji = computed(() => {
  const map: Record<string, string> = {
    钢琴: '🎹', 游泳: '🏊', 围棋: '♟️', 舞蹈: '💃', 绘画: '🎨', 书法: '🖌️',
    足球: '⚽', 篮球: '🏀', 英语: '🔤', 编程: '💻', 声乐: '🎤', 主持: '🎙️',
    跆拳道: '🥋', 滑冰: '⛸️', 体操: '🤸', 乐高: '🧱', 珠心算: '🧮',
  }
  for (const [k, v] of Object.entries(map)) {
    if (props.course.name.includes(k)) return v
  }
  return '📚'
})
</script>

<template>
  <div
    class="session-card"
    :class="{
      cancelled: session.status === 'cancelled',
      past: isPast && !record,
    }"
    :style="{ '--course-color': course.color }"
  >
    <div class="sc-main">
      <div class="sc-title-row">
        <span class="sc-emoji">{{ emoji }}</span>
        <span class="sc-course">{{ course.name }}</span>
        <span v-if="statusBadge" class="badge" :class="statusBadge.cls">{{ statusBadge.text }}</span>
      </div>
      <div class="sc-info">
        <span v-if="student">{{ student.avatar_emoji }} {{ student.name }}</span>
        <span v-if="showDate || !isToday">{{ session.date.slice(5).replace('-', '/') }} {{ weekdayCN(session.date) }}</span>
        <span>{{ fmtClock(session.start_time) }} – {{ fmtClock(session.end_time) }}</span>
      </div>
      <div v-if="course.location || course.institution" class="sc-location">
        📍 {{ course.location || course.institution }}
      </div>
    </div>
    <div class="sc-action">
      <slot name="action">
        <button v-if="canCheckIn" class="btn btn-sm" @click.stop="$emit('checkin', session)">
          签到
        </button>
      </slot>
    </div>
  </div>
</template>

<script lang="ts">
export default { name: 'SessionCard' }
</script>

<style scoped>
.session-card {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--card);
  border: 1px solid var(--card-border);
  border-left: 4px solid var(--course-color);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 14px 16px;
  cursor: pointer;
  transition: transform 0.1s;
}

.session-card:active { transform: scale(0.98); }
.session-card.cancelled { opacity: 0.55; }
.session-card.cancelled .sc-course { text-decoration: line-through; }

.sc-main { flex: 1; min-width: 0; }
.sc-title-row { display: flex; align-items: center; gap: 8px; }
.sc-emoji { font-size: 20px; }
.sc-course { font-weight: 700; font-size: 16px; }
.sc-info { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 13px; color: var(--text-2); margin-top: 3px; }
.sc-location { font-size: 12px; color: var(--text-3); margin-top: 3px; }
.sc-action { flex-shrink: 0; }
</style>
