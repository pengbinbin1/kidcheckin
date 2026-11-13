import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useDataStore } from '@/stores/data'

const router = createRouter({
  // BASE_URL 随 vite base 配置变化，兼容子路径部署
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue') },
    { path: '/onboarding', name: 'onboarding', component: () => import('@/views/OnboardingView.vue') },
    { path: '/', name: 'today', component: () => import('@/views/TodayView.vue'), meta: { tab: 'today' } },
    { path: '/courses', name: 'courses', component: () => import('@/views/CoursesView.vue'), meta: { tab: 'courses' } },
    { path: '/courses/new', name: 'course-new', component: () => import('@/views/CourseFormView.vue'), meta: { tab: 'courses' } },
    { path: '/courses/:id', name: 'course-detail', component: () => import('@/views/CourseDetailView.vue'), meta: { tab: 'courses' } },
    { path: '/courses/:id/edit', name: 'course-edit', component: () => import('@/views/CourseFormView.vue'), meta: { tab: 'courses' } },
    { path: '/summary', name: 'summary', component: () => import('@/views/SummaryView.vue'), meta: { tab: 'summary' } },
    { path: '/profile', name: 'profile', component: () => import('@/views/ProfileView.vue'), meta: { tab: 'profile' } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!auth.initialized) await auth.init()

  if (to.name === 'login') {
    return auth.user ? { path: '/' } : true
  }

  if (!auth.user) return { name: 'login' }

  if (!auth.family) {
    return to.name === 'onboarding' ? true : { name: 'onboarding' }
  }

  // 已有家庭 → 引导离开 onboarding
  if (to.name === 'onboarding' && auth.family) return { path: '/' }

  // 首次进入主应用 → 拉取数据
  const data = useDataStore()
  if (!data.loadedOnce) {
    await data.bootstrap()
  }

  return true
})

export default router
