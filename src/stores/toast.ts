// 轻量 Toast
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useToastStore = defineStore('toast', () => {
  const toasts = ref<{ id: number; text: string; type: 'success' | 'error' | 'info' }[]>([])
  let seq = 0

  function show(text: string, type: 'success' | 'error' | 'info' = 'info') {
    const id = ++seq
    toasts.value.push({ id, text, type })
    setTimeout(() => {
      toasts.value = toasts.value.filter(t => t.id !== id)
    }, 2600)
  }

  function success(text: string) {
    show(text, 'success')
  }

  function error(text: string) {
    show(text, 'error')
  }

  return { toasts, show, success, error }
})
