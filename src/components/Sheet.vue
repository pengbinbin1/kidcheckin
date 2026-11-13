<script setup lang="ts">
// 通用底部弹层
import { watch } from 'vue'

const props = defineProps<{
  modelValue: boolean
  title?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
}>()

watch(
  () => props.modelValue,
  (v) => {
    document.body.style.overflow = v ? 'hidden' : ''
  },
)

function close() {
  emit('update:modelValue', false)
}
</script>

<template>
  <teleport to="body">
    <transition name="fade">
      <div v-if="modelValue" class="sheet-mask" @click.self="close">
        <div class="sheet" role="dialog">
          <div class="sheet-handle"></div>
          <div v-if="title" class="sheet-title">{{ title }}</div>
          <slot />
        </div>
      </div>
    </transition>
  </teleport>
</template>
