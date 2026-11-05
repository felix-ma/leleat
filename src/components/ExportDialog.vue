<script setup lang="ts">
import type { Allergen, RecipeEntry, SubstitutesMap, WeekOption } from '../types'
import ExportPanel from './ExportPanel.vue'

defineProps<{
  open: boolean
  selectedWeek: string
  selectedWeekOption: WeekOption | null
  recipes: RecipeEntry[]
  allergens: Allergen[]
  substitutes: SubstitutesMap
  supplements: string[]
}>()

const emit = defineEmits<{
  close: []
}>()

function printCurrentWeek(): void {
  window.print()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="open"
        class="screen-only fixed inset-0 z-50 flex items-end justify-center bg-ink/70 p-0 backdrop-blur-sm sm:items-center sm:p-5"
        @click.self="emit('close')"
      >
        <div
          class="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-cream p-4 shadow-2xl sm:rounded-3xl sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-dialog-title"
        >
          <div class="mb-4 flex items-start justify-between gap-4 px-1">
            <div>
              <p class="eyebrow">Export & Print</p>
              <h2 id="export-dialog-title" class="mt-1 font-display text-2xl font-semibold text-ink">
                导出 / 打印
              </h2>
              <p class="mt-1 text-xs leading-5 text-ink-muted">
                DOCX 可用 Word 继续修改；浏览器打印直接输出本周周表和 7 天补剂清单。
              </p>
            </div>
            <button type="button" class="icon-btn" aria-label="关闭导出面板" @click="emit('close')">
              <svg class="h-5 w-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              </svg>
            </button>
          </div>

          <div class="mb-4 flex flex-col gap-2 rounded-2xl border border-leaf-100 bg-leaf-50/70 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p class="text-sm font-semibold text-leaf-800">在线打印本周</p>
              <p class="mt-0.5 text-xs text-leaf-700/75">A4 横向，包含 5 天食谱和周一至周日补剂勾选。</p>
            </div>
            <button type="button" class="btn btn-secondary shrink-0 bg-white/70" @click="printCurrentWeek">
              打印本周
            </button>
          </div>

          <ExportPanel
            :selected-week="selectedWeek"
            :selected-week-option="selectedWeekOption"
            :recipes="recipes"
            :allergens="allergens"
            :substitutes="substitutes"
            :supplements="supplements"
          />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
