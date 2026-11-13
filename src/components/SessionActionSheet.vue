<script setup lang="ts">
// 课次操作弹层：签到 / 补签 / 请假 / 缺勤 / 调课 / 取消
import { computed, ref } from 'vue'
import { useConfirmStore } from '@/stores/confirm'
import { useDataStore } from '@/stores/data'
import { useToastStore } from '@/stores/toast'
import Sheet from '@/components/Sheet.vue'
import type { ClassSession } from '@/types'
import {
  addDays,
  fmtClock,
  fmtDateTime,
  minutesFromNow,
  sessionEnd,
  sessionStart,
  toISODate,
  weekdayCN,
} from '@/lib/datetime'

const props = defineProps<{ session: ClassSession | null }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const confirmS = useConfirmStore()
const dataS = useDataStore()
const toast = useToastStore()

const show = computed({
  get: () => !!props.session,
  set: (v: boolean) => {
    if (!v) emit('close')
  },
})

const isPast = computed(() =>
  props.session ? sessionEnd(props.session).getTime() < Date.now() : false,
)

const upcoming = computed(() =>
  props.session ? minutesFromNow(sessionStart(props.session)) : Infinity,
)

const record = computed(() =>
  props.session ? dataS.attendanceBySession.get(props.session.id) : null,
)

// ---------- 补签 / 请假原因输入 ----------

const reasonMode = ref<'retro' | 'absent' | 'leave' | null>(null)
const reasonText = ref('')
const submitting = ref(false)

function startReason(mode: 'retro' | 'absent' | 'leave') {
  reasonMode.value = mode
  reasonText.value = ''
}

async function submitReason() {
  if (!props.session || !reasonMode.value) return
  submitting.value = true
  try {
    const mode = reasonMode.value
    await dataS.markAttendance({
      session_id: props.session.id,
      status: mode === 'retro' ? 'present' : mode,
      method: mode === 'retro' ? 'retroactive' : 'manual',
      reason: reasonText.value || null,
    })
    toast.success(mode === 'retro' ? '已补签' : '已记录')
    emit('close')
  } catch (e) {
    toast.error((e as Error).message)
  } finally {
    submitting.value = false
    reasonMode.value = null
  }
}

// ---------- 签到 ----------

async function checkIn() {
  if (!props.session) return
  submitting.value = true
  try {
    await dataS.markAttendance({
      session_id: props.session.id,
      status: 'present',
      method: 'manual',
    })
    toast.success('签到成功 ✓')
    emit('close')
  } catch (e) {
    toast.error((e as Error).message)
  } finally {
    submitting.value = false
  }
}

// ---------- 调课 ----------

const rescheduleDate = ref('')
const rescheduleStart = ref('')
const rescheduleEnd = ref('')

function startReschedule() {
  if (!props.session) return
  const start = sessionStart(props.session)
  rescheduleDate.value = toISODate(addDays(start, 7))
  rescheduleStart.value = fmtClock(props.session.start_time)
  rescheduleEnd.value = fmtClock(props.session.end_time)
  reasonMode.value = null
}

// ---------- 清除记录 ----------
async function clearRecord() {
  if (!props.session) return
  const ok = await confirmS.ask({
    title: '清除这条签到记录？',
    message: '清除后该课次将显示为「未记录」。',
    danger: true,
    confirmText: '清除',
  })
  if (!ok) return
  try {
    await dataS.clearAttendance(props.session.id)
    toast.success('已清除')
    emit('close')
  } catch (e) {
    toast.error((e as Error).message)
  }
}

async function cancelThisSession() {
  if (!props.session) return
  const ok = await confirmS.ask({
    title: '取消这一节课？',
    message: '取消后不再统计，也不推送提醒。',
    danger: true,
    confirmText: '取消本节',
  })
  if (!ok) return
  try {
    await dataS.cancelSession(props.session.id)
    toast.success('已取消本节')
    emit('close')
  } catch (e) {
    toast.error((e as Error).message)
  }
}
</script>

<template>
  <Sheet v-model="show" :title="session ? `${session.date.slice(5).replace('-', '/')} ${weekdayCN(session.date)}` : ''">
    <template v-if="session">
      <!-- ===== 原因输入（补签/缺勤/请假） ===== -->
      <div v-if="reasonMode" style="margin-top: 8px">
        <div style="font-weight: 700; font-size: 16px; margin-bottom: 6px">
          {{ reasonMode === 'retro' ? '补签原因' : reasonMode === 'leave' ? '请假原因' : '缺勤原因' }}
        </div>
        <div class="text-3" style="font-size: 13px; margin-bottom: 12px">
          {{ reasonMode === 'retro' ? '选填，仅家庭内部可见' : '选填' }}
        </div>
        <input v-model="reasonText" class="input" placeholder="如：忘记打卡 / 感冒发烧" style="margin-bottom: 16px" />
        <button class="btn btn-block" :disabled="submitting" @click="submitReason">
          确认{{ reasonMode === 'retro' ? '补签' : reasonMode === 'leave' ? '请假' : '记录缺勤' }}
        </button>
      </div>

      <!-- ===== 调课表单 ===== -->
      <div v-else-if="rescheduleDate" style="margin-top: 8px">
        <div style="font-weight: 700; font-size: 16px; margin-bottom: 12px">调课</div>
        <div class="field">
          <label class="field-label">新日期</label>
          <input v-model="rescheduleDate" class="input" type="date" />
        </div>
        <div class="field">
          <label class="field-label">开始 / 结束时间</label>
          <div style="display: flex; gap: 10px">
            <input v-model="rescheduleStart" class="input" type="time" />
            <input v-model="rescheduleEnd" class="input" type="time" />
          </div>
        </div>
        <button
          class="btn btn-block"
          :disabled="submitting"
          @click="
            (e: Event) => {
              e.preventDefault()
              if (!session) return
              dataS
                .rescheduleSession(session.id, {
                  date: rescheduleDate,
                  start_time: rescheduleStart,
                  end_time: rescheduleEnd,
                })
                .then(() => {
                  toast.success('已调课')
                  emit('close')
                })
                .catch((err: Error) => toast.error(err.message))
            }
          "
        >
          确认调课
        </button>
      </div>

      <!-- ===== 默认操作菜单 ===== -->
      <div v-else style="margin-top: 8px">
        <div
          v-if="record"
          style="background: var(--bg); border-radius: 12px; padding: 12px 14px; margin-bottom: 14px; font-size: 13px; line-height: 1.8"
        >
          <span v-if="record.status === 'present'">
            ✅ {{ record.method === 'retroactive' ? '补签出勤' : '现场签到' }}
          </span>
          <span v-else-if="record.status === 'absent'">❌ 缺勤</span>
          <span v-else>💤 请假</span>
          <template v-if="record.check_in_at"> · 签到时间 {{ fmtDateTime(record.check_in_at) }}</template>
          <template v-if="record.reason"> · {{ record.reason }}</template>
        </div>

        <!-- 现场签到 -->
        <button
          v-if="!record && !isPast && upcoming <= 120 && session.status === 'scheduled'"
          class="btn btn-block"
          :disabled="submitting"
          @click="checkIn"
        >
          签到
        </button>

        <!-- 补签 -->
        <button
          v-if="!record && session.status === 'scheduled'"
          class="btn btn-block"
          :class="{ 'btn-danger': false }"
          :disabled="submitting"
          @click="startReason('retro')"
        >
          补签出勤
        </button>

        <!-- 缺勤 / 请假 -->
        <button
          v-if="!record && session.status === 'scheduled'"
          class="btn btn-block btn-ghost"
          :disabled="submitting"
          @click="startReason('absent')"
        >
          标记缺勤
        </button>
        <button
          v-if="!record && session.status === 'scheduled'"
          class="btn btn-block btn-ghost"
          :disabled="submitting"
          @click="startReason('leave')"
        >
          标记请假
        </button>

        <!-- 调课 -->
        <button
          v-if="session.status === 'scheduled'"
          class="btn btn-block btn-ghost"
          @click="startReschedule"
        >
          调课（改时间）
        </button>

        <!-- 清除记录 -->
        <button
          v-if="record"
          class="btn btn-block btn-danger-soft"
          :disabled="submitting"
          @click="clearRecord"
        >
          清除签到记录
        </button>

        <!-- 取消本节 -->
        <button
          v-if="session.status === 'scheduled'"
          class="btn btn-block btn-ghost"
          @click="cancelThisSession"
        >
          取消本节课
        </button>
        <button
          v-else
          class="btn btn-block btn-ghost"
          @click="
            dataS
              .restoreSession(session.id)
              .then(() => {
                toast.success('已恢复')
                emit('close')
              })
              .catch((e: Error) => toast.error(e.message))
          "
        >
          恢复本节课
        </button>
      </div>
    </template>
  </Sheet>
</template>

<script lang="ts">
export default { name: 'SessionActionSheet' }
</script>
