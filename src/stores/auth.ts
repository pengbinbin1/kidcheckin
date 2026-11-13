// 认证与家庭上下文
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { AppUser, Family, FamilyMember } from '@/types'
import { getBackend } from '@/api'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AppUser | null>(null)
  const family = ref<Family | null>(null)
  const members = ref<FamilyMember[]>([])
  const initialized = ref(false)

  const myMember = computed<FamilyMember | null>(
    () => members.value.find(m => m.user_id === user.value?.id) ?? null,
  )
  const isAdmin = computed(() => myMember.value?.role === 'admin')
  const isDemo = computed(() => backend.value?.mode === 'demo')

  let backend = ref<Awaited<ReturnType<typeof getBackend>> | null>(null)
  let initPromise: Promise<void> | null = null

  async function init() {
    if (initialized.value) return
    if (initPromise) return initPromise

    initPromise = (async () => {
      backend.value = await getBackend()
      user.value = await backend.value.init()
      if (user.value) {
        await refreshFamily()
      }
      initialized.value = true
    })()

    return initPromise
  }

  async function refreshFamily() {
    if (!backend.value) return
    const ctx = await backend.value.loadFamilyContext()
    if (ctx) {
      family.value = ctx.family
      members.value = ctx.members
    } else {
      family.value = null
      members.value = []
    }
  }

  async function signInWithPassword(email: string, password: string) {
    await backend.value!.signInWithPassword(email, password)
    user.value = await backend.value!.init()
    await refreshFamily()
  }

  async function signUpWithPassword(email: string, password: string) {
    await backend.value!.signUpWithPassword(email, password)
    user.value = await backend.value!.init()
    await refreshFamily()
  }

  async function signInWithOtp(email: string) {
    await backend.value!.signInWithOtp(email)
  }

  async function signOut() {
    await backend.value!.signOut()
    user.value = null
    family.value = null
    members.value = []
  }

  async function createFamily(name: string, nickname: string) {
    await backend.value!.createFamily(name, nickname)
    await refreshFamily()
  }

  async function joinFamily(inviteCode: string, nickname: string) {
    await backend.value!.joinFamily(inviteCode, nickname)
    await refreshFamily()
  }

  async function updateMyNickname(nickname: string) {
    await backend.value!.updateMyNickname(nickname)
    await refreshFamily()
  }

  async function setMemberRole(memberId: string, role: 'admin' | 'member') {
    await backend.value!.setMemberRole(memberId, role)
    await refreshFamily()
  }

  async function removeMember(memberId: string) {
    await backend.value!.removeMember(memberId)
    await refreshFamily()
  }

  function nicknameOf(userId?: string | null) {
    if (!userId) return '家人'
    return members.value.find(m => m.user_id === userId)?.nickname ?? '家人'
  }

  return {
    user,
    family,
    members,
    initialized,
    myMember,
    isAdmin,
    isDemo,
    backend,
    init,
    refreshFamily,
    signInWithPassword,
    signUpWithPassword,
    signInWithOtp,
    signOut,
    createFamily,
    joinFamily,
    updateMyNickname,
    setMemberRole,
    removeMember,
    nicknameOf,
  }
})
