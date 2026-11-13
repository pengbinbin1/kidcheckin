<script setup lang="ts">
import { useConfirmStore } from '@/stores/confirm'

const store = useConfirmStore()
</script>

<template>
  <teleport to="body">
    <transition name="fade">
      <div v-if="store.state" class="sheet-mask" @click.self="store.settle(false)">
        <div
          class="card"
          style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 82vw; max-width: 340px"
        >
          <div style="font-size: 17px; font-weight: 700; margin-bottom: 8px">
            {{ store.state.title }}
          </div>
          <div v-if="store.state.message" class="text-2" style="font-size: 14px; margin-bottom: 18px">
            {{ store.state.message }}
          </div>
          <div style="display: flex; gap: 10px">
            <button class="btn btn-soft" style="flex: 1" @click="store.settle(false)">
              {{ store.state.cancelText ?? '取消' }}
            </button>
            <button
              class="btn"
              :class="store.state.danger ? 'btn-danger' : ''"
              style="flex: 1"
              @click="store.settle(true)"
            >
              {{ store.state.confirmText ?? '确定' }}
            </button>
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>
