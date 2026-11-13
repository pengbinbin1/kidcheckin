<script setup lang="ts">
// 今日 + 未来 7 天课次列表
import { computed, ref } from 'vue'
import { useDataStore } from '@/stores/data'
import { useToastStore } from '@/stores/toast'
import SessionCard from '@/components/SessionCard.vue'
import SessionActionSheet from '@/components/SessionActionSheet.vue'
import EmptyState from '@/components/EmptyState.vue'
import { addDays, fmtClock, toISODate, weekdayCN } from '@/lib/datetime'
import type { ClassSession } from '@/types'

const dataS = useDataStore()
const toast = useToastStore()
const activeSession = ref<ClassSession | null>(null)

const todayStr = toISODate(new Date())
const weekEndStr = toISODate(addDays(new Date(), 7))

const todaySessions = computed(() =>
  dataS.sessions
    .filter(s => s.date === todayStr)
    .sort((a, b) => a.start_time.localeCompare(b.start_time)),
)

const upcomingSessions = computed(() =>
  dataS.sessions
    .filter(s => s.date > todayStr && s.date <= weekEndStr)
    .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time)),
)

function courseOf(s: ClassSession) {
  return dataS.courseById.get(s.course_id)
}

function studentOf(s: ClassSession) {
  const c = courseOf(s)
  return c ? dataS.studentById.get(c.student_id) : undefined
}

async function quickCheckIn(s: ClassSession) {
  try {
    await dataS.markAttendance({ session_id: s.id, status: 'present', method: 'manual' })
    toast.success('签到成功 ✓')
  } catch (e) {
    toast.error((e as Error).message)
  }
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">今天</h1>
        <div class="page-sub">
          {{ new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }) }}
        </div>
      </div>
    </div>

    <!-- 今日课程 -->
    <template v-if="todaySessions.length">
      <div class="section-title">今日课程</div>
      <div class="stack">
        <div v-for="s in todaySessions" :key="s.id" @click="activeSession = s">
          <SessionCard
            :session="s"
            :course="courseOf(s)!"
            :student="studentOf(s)"
            :record="dataS.attendanceBySession.get(s.id)"
            @checkin="quickCheckIn"
          />
        </div>
      </div>
    </template>

    <template v-else>
      <EmptyState emoji="🎈" title="今天没有课" sub="好好休息一天！" />
    </template>

    <!-- 未来 7 天 -->
    <template v-if="upcomingSessions.length">
      <div class="section-title">未来 7 天</div>
      <div class="card" style="padding: 4px 16px">
        <div
          v-for="s in upcomingSessions"
          :key="s.id"
          class="list-item"
          style="cursor: pointer"
          @click="activeSession = s"
        >
          <div style="width: 64px; flex-shrink: 0">
            <div style="font-size: 15px; font-weight: 600">
              {{ s.date.slice(5).replace('-', '/') }}
            </div>
            <div class="text-3" style="font-size: 12px">{{ weekdayCN(s.date) }}</div>
          </div>
          <div style="flex: 1; min-width: 0">
            <div style="font-weight: 600; font-size: 14px">
              {{ courseOf(s)?.name }}
              <span class="text-3" style="font-weight: 400">· {{ studentOf(s)?.name }}</span>
            </div>
            <div class="text-3" style="font-size: 12px">
              {{ fmtClock(s.start_time) }} - {{ fmtClock(s.end_time) }}
            </div>
          </div>
          <span v-if="s.status === 'cancelled'" class="badge badge-gray">已取消</span>
          <span
            v-else-if="dataS.attendanceBySession.get(s.id)"
            class="badge"
            :class="
              dataS.attendanceBySession.get(s.id)!.status === 'present'
                ? 'badge-green'
                : 'badge-amber'
            "
          >
            {{ dataS.attendanceBySession.get(s.id)!.status === 'present' ? '已签' : '请假' }}
          </span>
        </div>
      </div>
    </template>

    <SessionActionSheet :session="activeSession" @close="activeSession = null" />
  </div>
</template>

<style scoped>
.stack > * + * {
  margin-top: 10px;
}
</style>
