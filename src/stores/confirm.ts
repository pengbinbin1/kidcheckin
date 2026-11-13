// Promise 风格的确认弹窗
import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface ConfirmOptions {
  title: string
  message?: string
  danger?: boolean
  confirmText?: string
  cancelText?: string
}

export const useConfirmStore = defineStore('confirm', () => {
  const state = ref<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null)

  function ask(opts: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
      state.value = { ...opts, resolve }
    })
  }

  function settle(ok: boolean) {
    state.value?.resolve(ok)
    state.value = null
  }

  return { state, ask, settle }
})
