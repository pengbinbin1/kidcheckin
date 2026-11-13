<script setup lang="ts">
import { useToastStore } from '@/stores/toast'

const store = useToastStore()
</script>

<template>
  <teleport to="body">
    <div class="toast-host">
      <div
        v-for="t in store.toasts"
        :key="t.id"
        class="toast"
        :class="t.type"
      >
        {{ t.text }}
      </div>
    </div>
  </teleport>
</template>
