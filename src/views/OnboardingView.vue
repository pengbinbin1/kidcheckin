<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const step = ref<'choose' | 'create' | 'join'>('choose')

const familyName = ref('')
const nickname = ref('爸爸')
const inviteCode = ref('')

async function createFamily() {
  if (!familyName.value.trim()) return
  await auth.createFamily(familyName.value.trim(), nickname.value)
}

async function joinFamily() {
  if (!inviteCode.value.trim()) return
  await auth.joinFamily(inviteCode.value.trim(), nickname.value)
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1 class="page-title">欢迎使用 👋</h1>
        <div class="page-sub">先创建你的家庭，或加入家人已创建的家庭</div>
      </div>
    </div>

    <!-- 第一步：选择 -->
    <template v-if="step === 'choose'">
      <div class="card" style="cursor: pointer" @click="step = 'create'">
        <div style="font-size: 36px">🏠</div>
        <div style="font-weight: 700; font-size: 17px; margin-top: 6px">创建我们的家庭</div>
        <div class="text-3" style="font-size: 13px; margin-top: 4px">
          适合第一位使用的家长，创建后自动成为管理员
        </div>
      </div>

      <div class="card card-gap" style="cursor: pointer" @click="step = 'join'">
        <div style="font-size: 36px">👨‍👩‍👧‍👦</div>
        <div style="font-weight: 700; font-size: 17px; margin-top: 6px">加入已有家庭</div>
        <div class="text-3" style="font-size: 13px; margin-top: 4px">
          家人已创建家庭？输入邀请码加入
        </div>
      </div>
    </template>

    <!-- 创建家庭 -->
    <div v-else-if="step === 'create'" class="card">
      <div style="font-weight: 700; font-size: 18px; margin-bottom: 16px">创建家庭</div>
      <div class="field">
        <label class="field-label">家庭名称</label>
        <input v-model="familyName" class="input" placeholder="如：我们的家" />
      </div>
      <div class="field">
        <label class="field-label">你的称呼</label>
        <input v-model="nickname" class="input" placeholder="爸爸 / 妈妈" />
      </div>
      <button class="btn btn-block" @click="createFamily">创建家庭</button>
      <button class="btn btn-block btn-ghost" style="margin-top: 10px" @click="step = 'choose'">
        返回
      </button>
    </div>

    <!-- 加入家庭 -->
    <div v-else class="card">
      <div style="font-weight: 700; font-size: 18px; margin-bottom: 16px">加入家庭</div>
      <div class="field">
        <label class="field-label">邀请码</label>
        <input v-model="inviteCode" class="input" placeholder="6 位邀请码" />
      </div>
      <div class="field">
        <label class="field-label">你的称呼</label>
        <input v-model="nickname" class="input" placeholder="爸爸 / 妈妈" />
      </div>
      <button class="btn btn-block" @click="joinFamily">加入家庭</button>
      <button class="btn btn-block btn-ghost" style="margin-top: 10px" @click="step = 'choose'">
        返回
      </button>
    </div>
  </div>
</template>
