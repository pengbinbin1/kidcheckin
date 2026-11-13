<script setup lang="ts">
// 课程详情：统计 + 课次时间线
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { useAuthStore } from '@/stores/auth'
import { useConfirmStore } from '@/stores/confirm'
import { useToastStore } from '@/stores/toast'
import Sheet from '@/components/Sheet.vue'
import { computeCourseStats } from '@/lib/stats'
import { fmtClock, sessionEnd, weekdayCN } from '@/lib/datetime'
import type { ClassSession } from '@/types'

const route = useRoute()
const router = useRouter()
const dataS = useDataStore()
const auth = useAuthStore()
const confirmS = useConfirmStore()
const toast = useToastStore()

const courseId = computed(() => String(route.params.id))
const course = computed(() => dataS.courseById.get(courseId.value))
const student = computed(() =>
  course.value ? dataS.studentById.get(course.value.student_id) : undefined,
)

const sessions = computed(() =>
  dataS.sessions.filter(s => s.course_id === courseId.value),
)

const stats = computed(() =>
  course.value
    ? computeCourseStats(course.value, sessions.value, dataS.attendanceBySession)
    : null,
)

const showMenu = ref(false)
const activeSession = ref<ClassSession | null>(null)

function weekdayLabel(weekdays: number[]) {
  return weekdays
    .slice()
    .sort((a, b) => a - b)
    .map(d => '周' + '一二三四五六日'[d - 1])
    .join('、')
}

const menuItems = computed(() => {
  const items: { label: string; action: () => void; danger?: boolean; disabled?: boolean }[] = []
  if (!course.value) return items

  if (course.value.status === 'active') {
    items.push({ label: '⏸ 暂停课程', action: () => setStatus('paused') })
  } else {
    items.push({ label: '▶ 恢复上课', action: () => setStatus('active') })
  }
  items.push({ label: '🏁 结束课程', action: () => setStatus('finished') })
  if (auth.isAdmin) {
    items.push({ label: '🗑 删除课程', action: deleteCourse, danger: true })
  }
  return items
})

async function setStatus(status: 'active' | 'paused' | 'finished') {
  if (!course.value) return
  await dataS.setCourseStatus(course.value.id, status)
  toast.success('已更新')
  showMenu.value = false
}

async function deleteCourse() {
  if (!course.value) return
  const ok = await confirmS.ask({
    title: '删除课程？',
    message: '将删除该课程的所有课次和签到记录，且不可恢复。',
    danger: true,
    confirmText: '删除',
  })
  if (!ok) return
  try {
    await dataS.deleteCourse(course.value.id)
    toast.success('已删除')
    router.replace('/courses')
  } catch (e) {
    toast.error((e as Error).message)
  }
}
</script>

<template>
  <div v-if="course && stats" class="page">
    <div class="page-header">
      <div style="display: flex; align-items: center; gap: 10px">
        <button class="icon-btn" @click="router.back()">‹</button>
        <h1 class="page-title" style="font-size: 22px">{{ course.name }}</h1>
      </div>
      <button class="icon-btn" @click="showMenu = true">⋯</button>
    </div>

    <!-- 统计卡片 -->
    <div class="card" :style="{ borderTop: `4px solid ${course.color}` }">
      <div style="display: flex; justify-content: space-between; align-items: center">
        <div>
          <span class="badge badge-primary">{{ student?.avatar_emoji }} {{ student?.name }}</span>
        </div>
        <div style="text-align: right">
          <div style="font-size: 28px; font-weight: 800; line-height: 1">
            {{ stats.attendanceRate != null ? Math.round(stats.attendanceRate * 100) + '%' : '—' }}
          </div>
          <div class="text-3" style="font-size: 11px">出勤率</div>
        </div>
      </div>

      <!-- 课时包进度 -->
      <div v-if="course.total_sessions" style="margin-top: 14px">
        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px">
          <span class="text-3">课时包</span>
          <span>
            <b>{{ stats.packageUsed }}</b> / {{ course.total_sessions }} 节
            <span class="text-3">（剩余 {{ stats.packageLeft }}）</span>
          </span>
        </div>
        <div class="progress-track">
          <div
            class="progress-fill"
            :style="{
              width: Math.min(100, (stats.packageUsed / course.total_sessions) * 100) + '%',
              background: course.color,
            }"
          />
        </div>
      </div>

      <!-- 状态统计 -->
      <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px">
        <span class="badge badge-green">✓ 出勤 {{ stats.attended }}</span>
        <span v-if="stats.attendedRetro" class="badge badge-purple">补签 {{ stats.attendedRetro }}</span>
        <span v-if="stats.leave" class="badge badge-amber">请假 {{ stats.leave }}</span>
        <span v-if="stats.absent" class="badge badge-red">缺勤 {{ stats.absent }}</span>
        <span v-if="stats.unrecorded" class="badge badge-gray">未记录 {{ stats.unrecorded }}</span>
      </div>

      <div class="text-3" style="font-size: 12px; margin-top: 10px">
        {{ weekdayLabel(course.weekdays) }} · {{ fmtClock(course.start_time) }} - {{ fmtClock(course.end_time) }}
        <template v-if="course.institution"> · 📍 {{ course.institution }}</template>
      </div>
    </div>

    <!-- 课次列表 -->
    <div class="section-title">课次记录</div>
    <div
      v-for="s in [...sessions].sort((a, b) => b.date.localeCompare(a.date))"
      :key="s.id"
      class="card"
      style="cursor: pointer; padding: 12px 16px"
      @click="activeSession = s"
    >
      <div style="display: flex; justify-content: space-between; align-items: center">
        <div>
          <span style="font-weight: 600; font-size: 15px">
            {{ s.date.slice(5).replace('-', '/') }}
            <span class="text-3" style="font-size: 12px">{{ weekdayCN(s.date) }}</span>
          </span>
          <span class="text-3" style="font-size: 12px; margin-left: 8px">
            {{ fmtClock(s.start_time) }}-{{ fmtClock(s.end_time) }}
          </span>
        </div>
        <div>
          <span v-if="s.status === 'cancelled'" class="badge badge-gray">已取消</span>
          <span
            v-else-if="dataS.attendanceBySession.get(s.id)?.status === 'present'"
            class="badge badge-green"
          >
            ✓
            {{ dataS.attendanceBySession.get(s.id)!.method === 'retroactive' ? '补签' : '已签到' }}
          </span>
          <span
            v-else-if="dataS.attendanceBySession.get(s.id)?.status === 'absent'"
            class="badge badge-red"
          >
            缺勤
          </span>
          <span
            v-else-if="dataS.attendanceBySession.get(s.id)?.status === 'leave'"
            class="badge badge-amber"
          >
            请假
          </span>
          <span
            v-else-if="sessionEnd(s).getTime() < Date.now()"
            class="badge badge-gray"
          >
            未记录
          </span>
        </div>
      </div>
    </div>
  </div>

  <!-- 菜单弹层 -->
  <Sheet v-model="showMenu" title="课程操作">
    <div style="display: flex; flex-direction: column; gap: 10px">
      <button
        v-for="(item, i) in menuItems"
        :key="i"
        class="btn"
        :class="item.danger ? 'btn-danger' : 'btn-ghost'"
        @click="item.action"
      >
        {{ item.label }}
      </button>
    </div>
  </Sheet>

  <SessionActionSheet :session="activeSession" @close="activeSession = null" />
</template>

<script lang="ts">
import SessionActionSheet from '@/components/SessionActionSheet.vue'

export default {
  name: 'CourseDetailView',
  components: { SessionActionSheet },
}
</script>
