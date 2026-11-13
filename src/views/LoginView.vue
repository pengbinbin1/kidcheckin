<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'

const auth = useAuthStore()
const toast = useToastStore()

const mode = ref<'login' | 'signup'>('login')
const email = ref('')
const password = ref('')
const password2 = ref('')
const loading = ref(false)
const error = ref('')

async function submit() {
  error.value = ''
  if (!email.value.trim() || !/^\S+@\S+\.\S+$/.test(email.value.trim())) {
    error.value = '请输入有效的邮箱地址'
    return
  }
  if (password.value.length < 6) {
    error.value = '密码至少 6 位'
    return
  }
  if (mode.value === 'signup' && password.value !== password2.value) {
    error.value = '两次输入的密码不一致'
    return
  }

  loading.value = true
  try {
    if (mode.value === 'login') {
      await auth.signInWithPassword(email.value, password.value)
    } else {
      await auth.signUpWithPassword(email.value, password.value)
      toast.success('注册成功')
    }
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="page" style="display: flex; flex-direction: column; min-height: 100dvh; justify-content: center">
    <div style="text-align: center; margin-bottom: 32px">
      <div style="font-size: 56px; margin-bottom: 8px">📅</div>
      <div style="font-size: 26px; font-weight: 800">兴趣班签到</div>
      <div class="text-3" style="font-size: 14px; margin-top: 6px">
        家庭共享的兴趣班出勤记录
      </div>
    </div>

    <div class="card">
      <div class="field">
        <label class="field-label">邮箱</label>
        <input v-model="email" class="input" type="email" placeholder="you@example.com" />
      </div>
      <div class="field">
        <label class="field-label">密码</label>
        <input v-model="password" class="input" type="password" placeholder="至少 6 位" />
      </div>
      <div v-if="mode === 'signup'" class="field">
        <label class="field-label">确认密码</label>
        <input v-model="password2" class="input" type="password" placeholder="再输入一次" />
      </div>

      <div v-if="error" class="field-error" style="margin-bottom: 10px">{{ error }}</div>

      <button class="btn btn-block btn-lg" :disabled="loading" @click="submit">
        {{ loading ? '请稍候…' : mode === 'login' ? '登录' : '注册' }}
      </button>

      <div style="text-align: center; margin-top: 14px; font-size: 14px">
        <span class="text-3">{{ mode === 'login' ? '还没有账号？' : '已有账号？' }}</span>
        <a
          style="color: var(--primary); font-weight: 600; margin-left: 4px; cursor: pointer"
          @click="mode = mode === 'login' ? 'signup' : 'login'"
        >
          {{ mode === 'login' ? '注册一个' : '去登录' }}
        </a>
      </div>
    </div>
  </div>
</template>
