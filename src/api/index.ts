// 根据环境变量选择后端实现
import { createDemoBackend } from './demo'
import type { Backend } from './types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const isLive = Boolean(supabaseUrl && supabaseAnonKey)

let backend: Backend | null = null

async function getBackend(): Promise<Backend> {
  if (backend) return backend
  if (isLive) {
    const { createLiveBackend } = await import('./live')
    backend = createLiveBackend()
  } else {
    backend = createDemoBackend()
  }
  return backend
}

export { getBackend }
export type { Backend } from './types'
