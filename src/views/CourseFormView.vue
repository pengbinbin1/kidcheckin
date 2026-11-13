<script setup lang="ts">
// 课程表单：创建 / 编辑
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { useToastStore } from '@/stores/toast'
import { toISODate } from '@/lib/datetime'
import { COURSE_COLORS } from '@/types'
import type { Course } from '@/types'

const route = useRoute()
const router = useRouter()
const dataS = useDataStore()
const toast = useToastStore()

const courseId = computed(() => (route.name === 'course-edit' ? String(route.params.id) : null))
const isEdit = computed(() => !!courseId.value)

// 表单状态
const studentId = ref('')
const name = ref('')
const institution = ref('')
const location = ref('')
const weekdays = ref<number[]>([])
const startTime = ref('09:00')
const endTime = ref('10:30')
const startDate = ref(toISODate(new Date()))
const endDate = ref('')
const hasPackage = ref(true)
const totalSessions = ref<number | null>(48)
const reminderMinutes = ref(30)
const color = ref(COURSE_COLORS[0])

const loading = ref(false)
const error = ref('')

// 课程名 → 表情符号
const EMOJI_MAP: Record<string, string> = {
  钢琴: '🎹', 游泳: '🏊', 围棋: '♟️', 舞蹈: '💃', 绘画: '🎨', 书法: '🖌️',
  足球: '⚽', 篮球: '🏀', 英语: '🔤', 编程: '💻', 声乐: '🎤', 主持: '🎙️',
  跆拳道: '🥋', 滑冰: '⛸️', 体操: '🤸', 乐高: '🧱', 珠心算: '🧮',
}

const emoji = computed(() => {
  for (const [k, v] of Object.entries(EMOJI_MAP)) {
    if (name.value.includes(k)) return v
  }
  return '📚'
})

const weekdayOptions = [
  { v: 1, label: '一' }, { v: 2, label: '二' }, { v: 3, label: '三' }, { v: 4, label: '四' },
  { v: 5, label: '五' }, { v: 6, label: '六' }, { v: 7, label: '日' },
]

function toggleWeekday(w: number) {
  const idx = weekdays.value.indexOf(w)
  if (idx >= 0) weekdays.value.splice(idx, 1)
  else weekdays.value.push(w)
}

const reminderOptions = [
  { value: 15, label: '提前 15 分钟' },
  { value: 30, label: '提前 30 分钟' },
  { value: 45, label: '提前 45 分钟' },
  { value: 60, label: '提前 1 小时' },
  { value: 120, label: '提前 2 小时' },
]

// 初始化：编辑模式回填
onMounted(() => {
  if (courseId.value) {
    const c = dataS.courses.find(x => x.id === courseId.value)
    if (c) {
      fillFromCourse(c)
    }
  }
})

function fillFromCourse(c: Course) {
  studentId.value = c.student_id
  name.value = c.name
  institution.value = c.institution ?? ''
  location.value = c.location ?? ''
  weekdays.value = [...c.weekdays]
  startTime.value = c.start_time.slice(0, 5)
  endTime.value = c.end_time.slice(0, 5)
  startDate.value = c.start_date
  endDate.value = c.end_date ?? ''
  hasPackage.value = c.total_sessions != null
  totalSessions.value = c.total_sessions
  reminderMinutes.value = c.reminder_minutes
  color.value = c.color
}

async function save() {
  error.value = ''

  if (!studentId.value) {
    error.value = '请选择孩子'
    return
  }
  if (!name.value.trim()) {
    error.value = '请填写课程名称'
    return
  }
  if (!weekdays.value.length) {
    error.value = '请至少选择一个上课日'
    return
  }
  if (endTime.value <= startTime.value) {
    error.value = '结束时间必须晚于开始时间'
    return
  }
  if (!startDate.value) {
    error.value = '请填写开始日期'
    return
  }
  if (endDate.value && endDate.value < startDate.value) {
    error.value = '结束日期不能早于开始日期'
    return
  }

  loading.value = true
  try {
    const input = {
      student_id: studentId.value,
      name: name.value.trim(),
      institution: institution.value.trim(),
      location: location.value.trim(),
      weekdays: [...weekdays.value],
      start_time: `${startTime.value}:00`,
      end_time: `${endTime.value}:00`,
      start_date: startDate.value,
      end_date: endDate.value || null,
      total_sessions: hasPackage.value ? totalSessions.value : null,
      reminder_minutes: reminderMinutes.value,
      color: color.value,
    }

    if (courseId.value) {
      await dataS.updateCourse(courseId.value, input)
    } else {
      await dataS.createCourse(input)
    }

    toast.success('已保存 ✓')
    router.back()
  } catch (e) {
    toast.error((e as Error).message)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">{{ isEdit ? '编辑课程' : '添加课程' }}</h1>
      </div>
      <button class="btn btn-ghost" @click="router.back()">✕ 关闭</button>
    </div>

    <div class="card">
      <!-- 孩子 -->
      <div class="field">
        <label class="field-label">孩子</label>
        <select v-model="studentId" class="select" :disabled="isEdit">
          <option value="" disabled>请选择孩子</option>
          <option v-for="s in dataS.students" :key="s.id" :value="s.id">
            {{ s.avatar_emoji }} {{ s.name }}
          </option>
        </select>
        <div v-if="!dataS.students.length" class="field-error">
          请先在「我的 → 孩子管理」添加孩子
        </div>
      </div>

      <!-- 课程名 -->
      <div class="field">
        <label class="field-label">课程名称</label>
        <div style="display: flex; gap: 10px; align-items: center">
          <span style="font-size: 22px">{{ emoji }}</span>
          <input v-model="name" class="input" placeholder="如：钢琴课" />
        </div>
      </div>

      <!-- 机构 & 地点 -->
      <div class="field">
        <label class="field-label">机构（选填）</label>
        <input v-model="institution" class="input" placeholder="如：汇音艺术中心" />
      </div>
      <div class="field">
        <label class="field-label">上课地点（选填）</label>
        <input v-model="location" class="input" placeholder="如：汇音艺术中心 302 教室" />
      </div>

      <!-- 上课日 -->
      <div class="field">
        <label class="field-label">上课日（可多选）</label>
        <div style="display: flex; gap: 6px; flex-wrap: wrap">
          <button
            v-for="w in weekdayOptions"
            :key="w.v"
            type="button"
            class="chip"
            :class="{ active: weekdays.includes(w.v) }"
            @click="toggleWeekday(w.v)"
          >
            周{{ w.label }}
          </button>
        </div>
      </div>

      <!-- 时间 -->
      <div class="field">
        <label class="field-label">上课时间</label>
        <div style="display: flex; gap: 10px; align-items: center">
          <input v-model="startTime" class="input" type="time" />
          <span class="text-3">至</span>
          <input v-model="endTime" class="input" type="time" />
        </div>
      </div>

      <!-- 日期范围 -->
      <div class="field">
        <label class="field-label">开始日期（可填过去日期以补录历史）</label>
        <input v-model="startDate" class="input" type="date" />
      </div>
      <div class="field">
        <label class="field-label">结束日期（选填，留空为持续上课）</label>
        <input v-model="endDate" class="input" type="date" />
      </div>

      <!-- 课时包 -->
      <div class="field">
        <label class="field-label">按课时包统计</label>
        <div style="display: flex; align-items: center; gap: 10px">
          <input v-model="hasPackage" type="checkbox" style="width: 20px; height: 20px" />
          <template v-if="hasPackage">
            <input
              v-model.number="totalSessions"
              class="input"
              type="number"
              min="1"
              placeholder="48"
              style="width: 100px"
            />
            <span class="text-3">节课</span>
          </template>
        </div>
      </div>

      <!-- 提醒 -->
      <div class="field">
        <label class="field-label">课前提醒</label>
        <select v-model="reminderMinutes" class="select">
          <option v-for="r in reminderOptions" :key="r.value" :value="r.value">{{ r.label }}</option>
        </select>
      </div>

      <!-- 颜色 -->
      <div class="field">
        <label class="field-label">课程颜色</label>
        <div style="display: flex; gap: 10px; flex-wrap: wrap">
          <button
            v-for="c in COURSE_COLORS"
            :key="c"
            type="button"
            :style="{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: c,
              border: color === c ? '3px solid var(--text)' : 'none',
              cursor: 'pointer',
            }"
            @click="color = c"
          />
        </div>
      </div>

      <div v-if="error" class="field-error" style="margin-bottom: 10px">{{ error }}</div>

      <button class="btn btn-block btn-lg" :disabled="loading" @click="save">
        {{ loading ? '保存中…' : '保存课程' }}
      </button>
    </div>
  </div>
</template>
