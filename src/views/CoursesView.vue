<script setup lang="ts">
// 课程列表：按孩子分组
import { computed } from 'vue'
import { useDataStore } from '@/stores/data'
import EmptyState from '@/components/EmptyState.vue'
import { fmtClock } from '@/lib/datetime'
import type { Course, Student } from '@/types'

const dataS = useDataStore()

const grouped = computed(() => {
  const groups: { student: Student; courses: Course[] }[] = []
  for (const student of dataS.students) {
    const courses = dataS.courses
      .filter(c => c.student_id === student.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
    if (courses.length) groups.push({ student, courses })
  }
  return groups
})

function weekdayLabel(weekdays: number[]) {
  return weekdays
    .slice()
    .sort((a, b) => a - b)
    .map(d => '周' + '一二三四五六日'[d - 1])
    .join('、')
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">课程</h1>
        <div class="page-sub">
          {{ dataS.students.length }} 个孩子 · {{ dataS.courses.length }} 门课程
        </div>
      </div>
      <button class="btn" @click="$router.push('/courses/new')">＋ 添加课程</button>
    </div>

    <template v-if="grouped.length">
      <div v-for="g in grouped" :key="g.student.id">
        <div class="section-title">{{ g.student.avatar_emoji }} {{ g.student.name }}</div>
        <div class="stack">
          <div
            v-for="c in g.courses"
            :key="c.id"
            class="card"
            style="cursor: pointer; border-left: 4px solid var(--course-color, #4f7cff)"
            :style="{ '--course-color': c.color }"
            @click="$router.push(`/courses/${c.id}`)"
          >
            <div style="display: flex; align-items: center; justify-content: space-between">
              <span style="font-weight: 700; font-size: 16px">{{ c.name }}</span>
              <span
                class="badge"
                :class="c.status === 'active' ? 'badge-green' : c.status === 'paused' ? 'badge-amber' : 'badge-gray'"
              >
                {{ c.status === 'active' ? '进行中' : c.status === 'paused' ? '已暂停' : '已结束' }}
              </span>
            </div>
            <div class="text-2" style="font-size: 13px; margin-top: 4px">
              {{ weekdayLabel(c.weekdays) }} · {{ fmtClock(c.start_time) }} - {{ fmtClock(c.end_time) }}
            </div>
            <div v-if="c.institution" class="text-3" style="font-size: 12px; margin-top: 2px">
              📍 {{ c.institution }}
            </div>
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <EmptyState emoji="📚" title="还没有课程" sub="点击「添加课程」开始记录">
        <button class="btn" @click="$router.push('/courses/new')">＋ 添加课程</button>
      </EmptyState>
    </template>
  </div>
</template>

<style scoped>
.stack > * + * {
  margin-top: 10px;
}
</style>
