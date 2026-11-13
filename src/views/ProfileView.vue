<script setup lang="ts">
// 我的：家庭管理、提醒设置、孩子管理
import { computed, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useDataStore } from '@/stores/data'
import { useToastStore } from '@/stores/toast'
import Sheet from '@/components/Sheet.vue'
import { pushEnabled, requestPush } from '@/lib/push'

const auth = useAuthStore()
const dataS = useDataStore()
const toast = useToastStore()

const myRole = computed(() => (auth.isAdmin ? '管理员' : '成员'))

// 家庭信息
const showInvite = ref(false)

function copy(text: string, label: string) {
  navigator.clipboard
    ?.writeText(text)
    .then(() => toast.success(`${label}已复制`))
    .catch(() => toast.error('复制失败'))
}

// 孩子管理
const showStudentSheet = ref(false)
const studentForm = ref({ name: '', avatar_emoji: '🧒' })

async function saveStudent() {
  if (!studentForm.value.name.trim()) {
    toast.error('请填写孩子姓名')
    return
  }
  try {
    await dataS.saveStudent({
      name: studentForm.value.name,
      avatar_emoji: studentForm.value.avatar_emoji,
    })
    toast.success('已添加 ✓')
    showStudentSheet.value = false
  } catch (e) {
    toast.error((e as Error).message)
  }
}

// 推送
const pushOn = ref(pushEnabled())

async function togglePush() {
  if (pushOn.value) {
    pushOn.value = false
    return
  }
  const ok = await requestPush()
  if (ok) {
    pushOn.value = true
    toast.success('已开启推送提醒 ✓')
  } else {
    toast.error('开启失败，请检查系统通知权限')
  }
}

// 退出登录
const showSignOut = ref(false)

async function signOut() {
  await auth.signOut()
  window.location.href = '/login'
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1 class="page-title">我的</h1>
    </div>

    <!-- 账号卡片 -->
    <div class="card" style="display: flex; align-items: center; gap: 14px">
      <div class="avatar" style="background: var(--primary)">
        {{ auth.myMember?.nickname?.slice(0, 1) ?? '👨' }}
      </div>
      <div style="flex: 1">
        <div style="font-weight: 700; font-size: 16px">
          {{ auth.myMember?.nickname }}
          <span class="badge badge-primary" style="margin-left: 6px">{{ myRole }}</span>
        </div>
        <div class="text-3" style="font-size: 13px">{{ auth.user?.email }}</div>
      </div>
    </div>

    <!-- 家庭 -->
    <template v-if="auth.family">
      <div class="section-title">家庭 · {{ auth.family.name }}</div>
      <div class="card">
        <!-- 邀请码 -->
        <div style="display: flex; align-items: center; justify-content: space-between">
          <div>
            <div class="text-3" style="font-size: 12px">家庭邀请码</div>
            <div style="font-size: 22px; font-weight: 800; letter-spacing: 3px">
              {{ auth.family.invite_code }}
            </div>
          </div>
          <button
            class="btn btn-sm"
            @click="copy(auth.family!.invite_code, '邀请码')"
          >
            复制
          </button>
        </div>

        <div class="text-3" style="font-size: 12px; margin-top: 8px">
          家人注册后在「加入家庭」中输入邀请码即可加入，一起记录签到情况。
        </div>

        <div class="divider" />

        <!-- 成员列表 -->
        <div
          v-for="m in auth.members"
          :key="m.id"
          class="list-item"
          style="padding: 10px 0"
        >
          <div class="avatar" style="width: 34px; height: 34px; font-size: 14px; background: var(--primary-weak); color: var(--primary)">
            {{ m.nickname.slice(0, 1) }}
          </div>
          <div style="flex: 1">
            <span style="font-weight: 600">{{ m.nickname }}</span>
            <span
              class="badge"
              :class="m.role === 'admin' ? 'badge-primary' : 'badge-gray'"
              style="margin-left: 8px"
            >
              {{ m.role === 'admin' ? '管理员' : '成员' }}
            </span>
          </div>
          <button
            v-if="auth.isAdmin && m.user_id !== auth.user?.id"
            class="btn btn-sm btn-ghost"
            @click="
              auth
                .setMemberRole(m.id, m.role === 'admin' ? 'member' : 'admin')
                .then(() => toast.success('已更新'))
                .catch((e: Error) => toast.error(e.message))
            "
          >
            {{ m.role === 'admin' ? '设为成员' : '设为管理员' }}
          </button>
        </div>
      </div>
    </template>

    <!-- 提醒设置 -->
    <div class="section-title">提醒设置</div>
    <div class="card">
      <div class="list-item" style="padding: 12px 0">
        <div style="flex: 1">
          <div style="font-weight: 600">推送通知</div>
          <div class="text-3" style="font-size: 12px">
            课前提醒推送到手机（需开启系统通知权限）
          </div>
        </div>
        <button
          class="btn btn-sm"
          :class="{ 'btn-ghost': pushOn }"
          @click="togglePush"
        >
          {{ pushOn ? '已开启' : '开启' }}
        </button>
      </div>
      <div class="list-item" style="padding: 12px 0">
        <div style="flex: 1">
          <div style="font-weight: 600">订阅日历</div>
          <div class="text-3" style="font-size: 12px">
            在 iPhone「日历」App 中订阅课程表，课前自动弹提醒（无需打开本应用）
          </div>
        </div>
        <button
          class="btn btn-sm btn-ghost"
          @click="showInvite = true"
        >
          查看
        </button>
      </div>
    </div>

    <!-- 孩子管理 -->
    <div class="section-title">孩子管理</div>
    <div class="card">
      <div
        v-for="s in dataS.students"
        :key="s.id"
        class="list-item"
        style="padding: 10px 0"
      >
        <div style="font-size: 22px">{{ s.avatar_emoji }}</div>
        <div style="flex: 1">
          <div style="font-weight: 600">{{ s.name }}</div>
          <div v-if="s.birth_date" class="text-3" style="font-size: 12px">
            {{ s.birth_date }}
          </div>
        </div>
        <button
          class="btn btn-sm btn-danger-soft"
          @click="
            confirmS
              .ask({ title: `删除 ${s.name}？`, danger: true, confirmText: '删除' })
              .then((ok) => {
                if (ok) {
                  dataS
                    .deleteStudent(s.id)
                    .then(() => toast.success('已删除'))
                    .catch((e: Error) => toast.error(e.message))
                }
              })
          "
        >
          删除
        </button>
      </div>

      <button class="btn btn-block btn-ghost" style="margin-top: 10px" @click="showStudentSheet = true">
        ＋ 添加孩子
      </button>
    </div>

    <!-- 退出登录 -->
    <div class="section-title">账号</div>
    <div class="card">
      <button class="btn btn-block btn-danger-soft" @click="showSignOut = true">
        退出登录
      </button>
    </div>

    <!-- 日历订阅引导 -->
    <Sheet v-model="showInvite" title="订阅课程日历">
      <div style="padding: 4px 0 8px">
        <div class="text-2" style="line-height: 1.8; font-size: 14px">
          <b>iPhone（推荐）：</b><br />
          1. 打开系统「设置」→「日历」→「账户」→「添加账户」→「其他」<br />
          2. 选择「添加订阅日历」<br />
          3. 粘贴下面的链接，保存即可<br /><br />
          订阅后：课程会自动出现在系统日历中，到达提醒时间前 iOS 会自动弹通知，<b>无需打开本应用</b>。
        </div>

        <div
          style="
            background: var(--bg);
            border-radius: 12px;
            padding: 12px;
            margin-top: 14px;
            font-size: 13px;
            word-break: break-all;
          "
        >
          {{ icsUrl }}
        </div>

        <button class="btn btn-block" style="margin-top: 14px" @click="copy(icsUrl, '日历链接')">
          复制订阅链接
        </button>
      </div>
    </Sheet>

    <!-- 添加孩子弹层 -->
    <Sheet v-model="showStudentSheet" title="添加孩子">
      <div class="field">
        <label class="field-label">姓名</label>
        <input v-model="studentForm.name" class="input" placeholder="如：小明" />
      </div>
      <div class="field">
        <label class="field-label">头像表情</label>
        <div style="display: flex; gap: 8px; flex-wrap: wrap">
          <button
            v-for="e in ['🧒', '👦', '👧', '👶']"
            :key="e"
            type="button"
            class="chip"
            :class="{ active: studentForm.avatar_emoji === e }"
            @click="studentForm.avatar_emoji = e"
          >
            {{ e }}
          </button>
        </div>
      </div>
      <button class="btn btn-block" @click="saveStudent">保存</button>
    </Sheet>

    <!-- 退出确认 -->
    <Sheet v-model="showSignOut" title="确认退出登录？">
      <div style="display: flex; gap: 10px; margin-top: 8px">
        <button class="btn btn-soft" style="flex: 1" @click="showSignOut = false">取消</button>
        <button class="btn btn-danger" style="flex: 1" @click="signOut">退出</button>
      </div>
    </Sheet>
  </div>
</template>

<script lang="ts">
import { useConfirmStore } from '@/stores/confirm'

const confirmS = useConfirmStore()
const icsUrl = `${location.origin}/api/calendar.ics`

export default {
  name: 'ProfileView',
  computed: {
    confirmS: () => confirmS,
    icsUrl: () => icsUrl,
  },
}
</script>
