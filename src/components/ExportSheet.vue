<script setup lang="ts">
// 导出弹层：孩子 / 课程 / 时间范围筛选 → 明细或汇总 CSV
import { computed, ref, watch } from 'vue'
import Sheet from '@/components/Sheet.vue'
import { useAuthStore } from '@/stores/auth'
import { useDataStore } from '@/stores/data'
import { useToastStore } from '@/stores/toast'
import {
  buildDetailCSV,
  buildSummaryCSV,
  csvFileName,
  exportCSV,
  filterSessions,
  type ExportScope,
} from '@/lib/export'
import { addDays, toISODate } from '@/lib/datetime'

const props = defineProps<{
  modelValue: boolean
  presetCourseId?: string | null
}>()

const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const auth = useAuthStore()
const dataS = useDataStore()
const toast = useToastStore()

const tab = ref<'detail' | 'summary'>('detail')
const studentId = ref<string | null>(null)
const courseId = ref<string | null>(null)
const range = ref<'1m' | '3m' | '6m' | 'all'>('3m')

// 初始化筛选
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    if (props.presetCourseId) {
      courseId.value = props.presetCourseId
      const c = dataS.courses.find(x => x.id === props.presetCourseId)
      studentId.value = c?.student_id ?? null
    } else {
      courseId.value = null
      studentId.value = null
    }
  },
)

const scope = computed<ExportScope>(() => {
  const now = new Date()
  let from: string | null = null
  if (range.value === '1m') from = toISODate(addDays(now, -30))
  if (range.value === '3m') from = toISODate(addDays(now, -90))
  if (range.value === '6m') from = toISODate(addDays(now, -180))
  return {
    studentId: studentId.value,
    courseId: courseId.value,
    from,
    to: null,
  }
})

const rowCount = computed(
  () => filterSessions(dataS.sessions, dataS.courses, scope.value).length,
)

const filteredCourses = computed(() =>
  dataS.courses.filter(
    (c) => !studentId.value || c.student_id === studentId.value,
  ),
)

const studentOptions = computed(() => {
  const opts = [{ id: null as string | null, label: '全部孩子' }]
  for (const s of dataS.students) {
    opts.push({ id: s.id, label: `${s.avatar_emoji} ${s.name}` })
  }
  return opts
})

const exporting = ref(false)

async function doExport() {
  exporting.value = true
  try {
    const exportData = {
      sessions: dataS.sessions,
      courses: dataS.courses,
      students: dataS.students,
      members: auth.members,
      attendanceMap: dataS.attendanceBySession,
    }
    const csv =
      tab.value === 'detail'
        ? buildDetailCSV(scope.value, exportData)
        : buildSummaryCSV(scope.value, exportData)
    const name =
      tab.value === 'detail' ? csvFileName('签到明细') : csvFileName('课程汇总')
    await exportCSV(name, csv)
    toast.success('已导出')
    emit('update:modelValue', false)
  } catch (e) {
    toast.error((e as Error).message)
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <Sheet
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    title="导出课程签到情况"
  >
    <div style="margin-top: 6px">
      <!-- 导出类型 -->
      <div class="seg">
        <button class="seg-btn" :class="{ active: tab === 'detail' }" @click="tab = 'detail'">
          签到明细
        </button>
        <button class="seg-btn" :class="{ active: tab === 'summary' }" @click="tab = 'summary'">
          汇总统计
        </button>
      </div>

      <!-- 孩子筛选 -->
      <div class="filter-label">孩子</div>
      <div class="chips">
        <button
          v-for="s in studentOptions"
          :key="s.id ?? 'all'"
          class="chip"
          :class="{ active: studentId === s.id }"
          @click="studentId = s.id"
        >
          {{ s.label }}
        </button>
      </div>

      <!-- 课程筛选 -->
      <div class="filter-label">课程</div>
      <div class="chips">
        <button
          class="chip"
          :class="{ active: !courseId }"
          @click="courseId = null"
        >
          全部课程
        </button>
        <button
          v-for="c in filteredCourses"
          :key="c.id"
          class="chip"
          :class="{ active: courseId === c.id }"
          @click="courseId = c.id"
        >
          {{ c.name }}
        </button>
      </div>

      <!-- 时间范围 -->
      <div class="filter-label">时间范围</div>
      <div class="chips">
        <button
          v-for="r in [
            { k: '1m', label: '近 1 个月' },
            { k: '3m', label: '近 3 个月' },
            { k: '6m', label: '近半年' },
            { k: 'all', label: '全部' },
          ]"
          :key="r.k"
          class="chip"
          :class="{ active: range === r.k }"
          @click="range = r.k as typeof range"
        >
          {{ r.label }}
        </button>
      </div>

      <div class="text-3" style="font-size: 12px; margin: 14px 2px 16px">
        将导出 <b style="color: var(--text)">{{ rowCount }}</b> 条课次记录
        <template v-if="tab === 'detail'">（CSV 格式，可用 Excel / Numbers 打开）</template>
        <template v-else>（按课程汇总的统计数据）</template>
      </div>

      <button class="btn btn-block btn-lg" :disabled="exporting || rowCount === 0" @click="doExport">
        {{ exporting ? '正在导出…' : '导出 CSV' }}
      </button>
    </div>
  </Sheet>
</template>

<style scoped>
.seg {
  display: flex;
  background: var(--bg);
  border-radius: 12px;
  padding: 3px;
  margin-bottom: 16px;
}
.seg-btn {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--text-2);
  font-size: 14px;
  font-weight: 600;
  padding: 8px;
  border-radius: 10px;
  cursor: pointer;
}
.seg-btn.active {
  background: var(--card);
  color: var(--text);
  box-shadow: var(--shadow);
}
.filter-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-3);
  margin-bottom: 8px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}
</style>
