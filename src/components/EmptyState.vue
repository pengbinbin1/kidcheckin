<script setup lang="ts">
defineProps<{
  emoji?: string
  title: string
  sub?: string
}>()
</script>

<template>
  <div class="empty">
    <div class="empty-emoji">{{ emoji ?? '📭' }}</div>
    <div class="empty-title">{{ title }}</div>
    <div v-if="sub" style="font-size: 13px">{{ sub }}</div>
    <div style="margin-top: 16px">
      <slot />
    </div>
  </div>
</template>
