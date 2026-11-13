<script setup lang="ts">
// 汇总页：按孩子/课程统计 + 月历视图
import { computed, ref } from 'vue'
import { useDataStore } from '@/stores/data'
import { computeCourseStats } from '@/lib/stats'
import {
  fmtClock,
  toISODate,
  weekdayCN,
} from '@/lib/datetime'
import type { ClassSession } from '@/types'

const dataS = useDataStore()

// 筛选状态
const studentFilter = ref<string | null>(null)
const courseFilter = ref<string | null>(null)

// 月份导航
const monthCursor = ref(new Date())

// 选中日期
const selectedDate = ref(toISODate(new Date()))

// 选中课次（弹操作层）
const activeSession = ref<ClassSession | null>(null)

// 按学生分组的统计数据
const courseStats = computed(() => {
  return dataS.courses
    .filter(c => (!studentFilter.value || c.student_id === studentFilter.value))
    .filter(c => (!courseFilter.value || c.id === courseFilter.value))
    .map(course => {
      const sessions = dataS.sessions.filter(s => s.course_id === course.id)
      const stats = computeCourseStats(course, sessions, dataS.attendanceBySession)
      const student = dataS.studentById.get(course.student_id)
      return { course, stats, student }
    })
})

// 日历网格
const calendarDays = computed(() => {
  const cursor = monthCursor.value
  const firstDay = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()

  // 周一为一周开始
  const startOffset = (firstDay.getDay() + 6) % 7

  const cells: { date: string; day: number; isCurrentMonth: boolean }[] = []
  for (let i = 0; i < startOffset; i++) {
    cells.push({ date: '', day: 0, isCurrentMonth: false })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const date = toISODate(new Date(cursor.getFullYear(), cursor.getMonth(), d))
    cells.push({ date, day: d, isCurrentMonth: true })
  }
  return cells
})

// 某天有哪些课
function sessionsOnDate(date: string) {
  return dataS.sessions.filter(s => s.date === date).sort((a, b) => a.start_time.localeCompare(b.start_time))
}

function prevMonth() {
  monthCursor.value = new Date(monthCursor.value.getFullYear(), monthCursor.value.getMonth() - 1, 1)
}

function nextMonth() {
  monthCursor.value = new Date(monthCursor.value.getFullYear(), monthCursor.value.getMonth() + 1, 1)
}

function isToday(date: string) {
  return date === toISODate(new Date())
}

const showExport = ref(false)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">汇总</h1>
        <div class="page-sub">
          {{ dataS.students.length }} 个孩子 · {{ dataS.courses.length }} 门课程
        </div>
      </div>
      <button class="icon-btn" @click="showExport = true">⬇</button>
    </div>

    <!-- 孩子筛选 -->
    <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px">
      <button
        class="chip"
        :class="{ active: studentFilter === null }"
        @click="studentFilter = null"
      >
        全部孩子
      </button>
      <button
        v-for="s in dataS.students"
        :key="s.id"
        class="chip"
        :class="{ active: studentFilter === s.id }"
        @click="studentFilter = s.id"
      >
        {{ s.avatar_emoji }} {{ s.name }}
      </button>
    </div>

    <!-- 课程统计卡片 -->
    <div v-for="item in courseStats" :key="item.course.id" class="card card-gap">
      <div style="display: flex; justify-content: space-between; align-items: center">
        <div style="font-weight: 700; font-size: 15px">
          <span :style="{ color: item.course.color }">●</span>
          {{ item.course.name }}
          <span class="text-3" style="font-size: 12px">· {{ item.student?.name }}</span>
        </div>
        <div style="text-align: right">
          <div style="font-size: 22px; font-weight: 800; line-height: 1">
            {{ item.stats.attendanceRate != null ? Math.round(item.stats.attendanceRate * 100) + '%' : '—' }}
          </div>
        </div>
      </div>
      <div class="text-3" style="font-size: 12px; margin-top: 6px">
        出勤 {{ item.stats.attended }}（含补签 {{ item.stats.attendedRetro }}）
        · 缺勤 {{ item.stats.absent }} · 请假 {{ item.stats.leave }}
        · 未记录 {{ item.stats.unrecorded }}
      </div>
      <!-- 课时包进度条 -->
      <div v-if="item.course.total_sessions" style="margin-top: 10px">
        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px">
          <span class="text-3">课时包</span>
          <span>
            <b>{{ item.stats.packageUsed }}</b> / {{ item.course.total_sessions }} 节
          </span>
        </div>
        <div class="progress-track">
          <div
            class="progress-fill"
            :style="{
              width: Math.min(100, (item.stats.packageUsed / item.course.total_sessions) * 100) + '%',
              background: item.course.color,
            }"
          />
        </div>
      </div>
    </div>

    <!-- 月历 -->
    <div class="section-title">
      {{ monthCursor.getFullYear() }} 年 {{ monthCursor.getMonth() + 1 }} 月
    </div>
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px">
        <button class="icon-btn" @click="prevMonth">‹</button>
        <div style="font-weight: 700">
          {{ monthCursor.getFullYear() }} 年 {{ monthCursor.getMonth() + 1 }} 月
        </div>
        <button class="icon-btn" @click="nextMonth">›</button>
      </div>

      <!-- 星期头 -->
      <div class="cal-grid" style="margin-bottom: 6px">
        <div v-for="w in ['一', '二', '三', '四', '五', '六', '日']" :key="w" class="text-3" style="text-align: center; font-size: 12px">
          {{ w }}
        </div>
      </div>

      <!-- 日期格 -->
      <div class="cal-grid">
        <div
          v-for="(cell, ci) in calendarDays"
          :key="ci"
          class="cal-cell"
          :class="{
            muted: !cell.isCurrentMonth,
            today: cell.date && isToday(cell.date),
            selected: cell.date === selectedDate,
          }"
          style="font-size: 13px; aspect-ratio: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; border-radius: 8px; padding: 2px"
          @click="cell.date && (selectedDate = cell.date)"
        >
          <span>{{ cell.isCurrentMonth ? cell.day : '' }}</span>
          <span
            v-if="cell.date && sessionsOnDate(cell.date).length"
            style="font-size: 9px; color: var(--primary)"
          >
            {{ sessionsOnDate(cell.date).length }} 节
          </span>
        </div>
      </div>
    </div>

    <!-- 选中日期的课次 -->
    <template v-if="sessionsOnDate(selectedDate).length">
      <div class="section-title">
        {{ selectedDate.slice(5).replace('-', '/') }} {{ weekdayCN(selectedDate) }} 的课程
      </div>
      <div class="card" style="padding: 4px 16px">
        <div
          v-for="s in sessionsOnDate(selectedDate)"
          :key="s.id"
          class="list-item"
          style="cursor: pointer"
          @click="activeSession = s"
        >
          <div style="flex: 1">
            <div style="font-weight: 600; font-size: 14px">
              {{ dataS.courseById.get(s.course_id)?.name }}
            </div>
            <div class="text-3" style="font-size: 12px">
              {{ fmtClock(s.start_time) }} - {{ fmtClock(s.end_time) }}
            </div>
          </div>
          <span v-if="s.status === 'cancelled'" class="badge badge-gray">已取消</span>
          <span
            v-else-if="dataS.attendanceBySession.get(s.id)?.status === 'present'"
            class="badge badge-green"
          >
            ✓
          </span>
        </div>
      </div>
    </template>

    <ExportSheet v-model="showExport" />
    <SessionActionSheet :session="activeSession" @close="activeSession = null" />
  </div>
</template>

<script lang="ts">
import ExportSheet from '@/components/ExportSheet.vue'
import SessionActionSheet from '@/components/SessionActionSheet.vue'

export default {
  name: 'SummaryView',
  components: { ExportSheet, SessionActionSheet },
}
</script>
