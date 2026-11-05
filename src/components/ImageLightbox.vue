<script setup lang="ts">
import type { ImagePreview } from '../types'

defineProps<{
  image: ImagePreview | null
}>()

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="image"
        class="screen-only fixed inset-0 z-[60] flex items-center justify-center bg-ink/90 p-4 backdrop-blur-sm"
        @click.self="emit('close')"
      >
        <div class="relative max-h-[94vh] max-w-6xl overflow-auto rounded-2xl bg-card p-2">
          <button
            type="button"
            class="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-ink/75 text-white hover:bg-ink"
            aria-label="关闭原图"
            @click="emit('close')"
          >
            <svg class="h-5 w-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
          </button>
          <img
            :src="image.src"
            :alt="image.alt"
            class="max-h-[88vh] max-w-full rounded-xl object-contain"
          />
          <p class="px-2 py-1 text-center text-xs text-ink-muted">{{ image.alt }}</p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
