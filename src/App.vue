<script setup lang="ts">
import { watch } from 'vue'
import ToastHost from '@/components/ToastHost.vue'
import ConfirmHost from '@/components/ConfirmHost.vue'
import TabBar from '@/components/TabBar.vue'
import { useAuthStore } from '@/stores/auth'
import { useDataStore } from '@/stores/data'

const auth = useAuthStore()
const data = useDataStore()

watch(
  () => [auth.user, auth.family],
  async () => {
    if (auth.user && auth.family) {
      await data.bootstrap()
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="app-root">
    <router-view />
    <TabBar />
    <ToastHost />
    <ConfirmHost />
  </div>
</template>

<style scoped>
.app-root {
  min-height: 100dvh;
}
</style>
