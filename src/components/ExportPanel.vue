<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type {
  Allergen,
  DataIndex,
  ExportRow,
  RecipeEntry,
  SubstituteLibrary,
  SubstitutesMap,
  WeekOption,
} from '../types'
import { buildExportRows, buildMenuDays, filterEntriesByDateRange } from '../utils/menu'
import { formatWeekNumber, formatWeekRange, parseIsoDate } from '../utils/date'
import { exportCsv } from '../utils/exportCsv'
import { loadWeeks } from '../utils/dataLoader'

const props = defineProps<{
  selectedWeek: string
  selectedWeekOption: WeekOption | null
  /** 当前周已加载的食谱（App 负责按需加载）。 */
  weekRecipes: RecipeEntry[]
  /** 周清单，用于取数据范围与自定义区间的周号。 */
  index: DataIndex
  allergens: Allergen[]
  substitutes: SubstitutesMap
  substituteLibrary: SubstituteLibrary
  supplements: string[]
  schoolName?: string
  updatedAt?: string
}>()

type RangeMode = 'week' | 'custom'

const rangeMode = ref<RangeMode>('week')
const customStart = ref(props.selectedWeekOption?.startDate ?? '')
const customEnd = ref(props.selectedWeekOption?.endDate ?? '')
const isExportingDocx = ref(false)
const status = ref<{ tone: 'success' | 'error'; message: string } | null>(null)

const dataBounds = computed(() => ({
  start: props.index.range.startDate,
  end: props.index.range.endDate,
}))

const rangeError = computed(() => {
  if (rangeMode.value === 'week') return ''

  if (!customStart.value || !customEnd.value) {
    return '请选择完整的起止日期。'
  }
  if (!parseIsoDate(customStart.value) || !parseIsoDate(customEnd.value)) {
    return '日期格式无效，请重新选择。'
  }
  if (customStart.value > customEnd.value) {
    return '开始日期不能晚于结束日期。'
  }
  return ''
})

/** 自定义区间涉及的周食谱（按需加载后缓存在这里）。 */
const customWeekRecipes = ref<RecipeEntry[]>([])
const customLoading = ref(false)

/** 当前导出范围对应的食谱条目：周模式直接复用 App 已加载的周，自定义模式取已加载的多周。 */
const rangeEntries = computed<RecipeEntry[]>(() => {
  if (rangeMode.value === 'week') return props.weekRecipes
  if (rangeError.value) return []
  return filterEntriesByDateRange(customWeekRecipes.value, customStart.value, customEnd.value)
})

const rows = computed<ExportRow[]>(() =>
  buildExportRows(
    rangeEntries.value,
    props.allergens,
    props.substitutes,
    props.substituteLibrary,
  ),
)

const menuDays = computed(() =>
  buildMenuDays(
    rangeEntries.value,
    props.allergens,
    props.substitutes,
    props.substituteLibrary,
  ),
)

const effectiveStart = computed(() =>
  rangeMode.value === 'week'
    ? props.selectedWeekOption?.startDate ?? ''
    : customStart.value,
)

const effectiveEnd = computed(() =>
  rangeMode.value === 'week'
    ? props.selectedWeekOption?.endDate ?? ''
    : customEnd.value,
)

const rangeLabel = computed(() => {
  if (rangeMode.value === 'week') {
    return props.selectedWeekOption?.label ?? props.selectedWeek
  }
  if (rangeError.value) return '所选日期范围'
  return formatWeekRange(customStart.value, customEnd.value)
})

const fileBase = computed(() => {
  if (rangeMode.value === 'week') return `leleat-${props.selectedWeek}`
  if (rangeError.value) return 'leleat-export'
  return `leleat-${customStart.value}_${customEnd.value}`
})

const title = computed(() =>
  rangeMode.value === 'week' ? '乐乐 · 本周食谱与替餐' : '乐乐 · 食谱与替餐',
)

const exportDisabled = computed(
  () => Boolean(rangeError.value) || isExportingDocx.value || customLoading.value,
)

watch(
  () => props.selectedWeekOption,
  (option) => {
    if (!option || rangeMode.value !== 'week') return
    customStart.value = option.startDate
    customEnd.value = option.endDate
  },
)

watch([rangeMode, customStart, customEnd], () => {
  status.value = null
})

/** 与给定区间有交集的周号列表（来自 index.json，不依赖已加载的食谱）。 */
function weeksInRange(start: string, end: string): string[] {
  if (!parseIsoDate(start) || !parseIsoDate(end)) return []
  return props.index.weeks
    .filter((entry) => entry.startDate <= end && entry.endDate >= start)
    .map((entry) => entry.week)
}

/** 自定义区间跨周时才按需加载对应的周文件。 */
watch(
  [rangeMode, customStart, customEnd],
  async ([mode, start, end]) => {
    if (mode !== 'custom' || !start || !end || start > end) return
    const weeks = weeksInRange(start, end)
    if (weeks.length === 0) {
      customWeekRecipes.value = []
      return
    }
    if (
      customWeekRecipes.value.length > 0 &&
      weeks.every((week) => customWeekRecipes.value.some((entry) => entry.week === week))
    ) {
      return
    }

    customLoading.value = true
    try {
      customWeekRecipes.value = await loadWeeks(weeks)
    } catch (error) {
      console.error('[leleat] 自定义区间的周食谱加载失败', error)
      customWeekRecipes.value = []
      status.value = { tone: 'error', message: '所选区间的食谱加载失败，请重试。' }
    } finally {
      customLoading.value = false
    }
  },
  { immediate: true },
)

function selectMode(mode: RangeMode): void {
  rangeMode.value = mode
  if (mode === 'custom' && (!customStart.value || !customEnd.value)) {
    customStart.value = props.selectedWeekOption?.startDate ?? ''
    customEnd.value = props.selectedWeekOption?.endDate ?? ''
  }
}

function summaryText(): string {
  if (rangeError.value) return rangeError.value
  if (customLoading.value) return '正在加载所选区间的周食谱…'
  if (rows.value.length === 0) return '该范围没有需要替餐的菜品，DOCX 仍会导出整周食谱。'
  return `DOCX 为横向周表，红色标出这 ${rows.value.length} 道风险菜品。`
}

async function handleDocx(): Promise<void> {
  if (exportDisabled.value) return

  isExportingDocx.value = true
  status.value = null

  try {
    const { exportDocx } = await import('../utils/exportDocx')
    await exportDocx({
      days: menuDays.value,
      rangeStart: effectiveStart.value,
      rangeEnd: effectiveEnd.value,
      supplements: props.supplements,
      title: title.value,
      rangeLabel: rangeLabel.value,
      fileBase: fileBase.value,
      schoolName: props.schoolName,
      updatedAt: props.updatedAt,
    })
    status.value = { tone: 'success', message: `已生成 ${fileBase.value}.docx` }
  } catch (error) {
    console.error('[leleat] 生成 DOCX 失败', error)
    status.value = { tone: 'error', message: 'DOCX 生成失败，请重试或改用 CSV。' }
  } finally {
    isExportingDocx.value = false
  }
}

function handleCsv(): void {
  if (exportDisabled.value) return

  try {
    exportCsv(rows.value, fileBase.value)
    status.value = { tone: 'success', message: `已生成 ${fileBase.value}.csv` }
  } catch (error) {
    console.error('[leleat] 生成 CSV 失败', error)
    status.value = { tone: 'error', message: 'CSV 生成失败，请稍后重试。' }
  }
}
</script>

<template>
  <aside class="card p-5 sm:p-6" aria-labelledby="export-title">
    <div class="flex items-start gap-3">
      <span
        class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-leaf-600 text-white"
        aria-hidden="true"
      >
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 3v11m0 0 4-4m-4 4-4-4M5 16.5v2A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-2"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </span>
      <div>
        <p class="eyebrow">Export</p>
        <h2 id="export-title" class="mt-1 font-display text-xl font-semibold text-ink">
          导出周食谱
        </h2>
        <p class="mt-1 text-xs leading-5 text-ink-muted">
          横向周表，红色标出需替餐菜品，打印后交给幼儿园。
        </p>
      </div>
    </div>

    <div class="mt-5" role="group" aria-label="导出范围">
      <div class="grid grid-cols-2 gap-1 rounded-2xl bg-ink/[0.045] p-1">
        <button
          type="button"
          class="rounded-xl px-3 py-2 text-sm font-semibold transition"
          :class="
            rangeMode === 'week'
              ? 'bg-white text-leaf-700 shadow-sm'
              : 'text-ink-muted hover:text-ink'
          "
          :aria-pressed="rangeMode === 'week'"
          @click="selectMode('week')"
        >
          当前周
        </button>
        <button
          type="button"
          class="rounded-xl px-3 py-2 text-sm font-semibold transition"
          :class="
            rangeMode === 'custom'
              ? 'bg-white text-leaf-700 shadow-sm'
              : 'text-ink-muted hover:text-ink'
          "
          :aria-pressed="rangeMode === 'custom'"
          @click="selectMode('custom')"
        >
          自定义区间
        </button>
      </div>
    </div>

    <div v-if="rangeMode === 'week'" class="mt-4 rounded-2xl border border-ink/[0.06] bg-white/55 p-3.5">
      <p class="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-ink-faint">Selected week</p>
      <p class="mt-1.5 text-sm font-semibold leading-5 text-ink">
        {{ selectedWeekOption?.label ?? selectedWeek }}
      </p>
      <p class="mt-1 text-xs text-ink-faint">
        {{ selectedWeek }} · {{ formatWeekNumber(selectedWeek) }}
      </p>
    </div>

    <div v-else class="mt-4">
      <div class="grid grid-cols-2 gap-2.5">
        <label class="block">
          <span class="mb-1.5 block text-xs font-semibold text-ink-muted">开始日期</span>
          <input
            v-model="customStart"
            type="date"
            class="h-11 w-full rounded-xl border border-ink/10 bg-white/80 px-2.5 text-sm text-ink"
            :min="dataBounds.start || undefined"
            :max="dataBounds.end || undefined"
          />
        </label>
        <label class="block">
          <span class="mb-1.5 block text-xs font-semibold text-ink-muted">结束日期</span>
          <input
            v-model="customEnd"
            type="date"
            class="h-11 w-full rounded-xl border border-ink/10 bg-white/80 px-2.5 text-sm text-ink"
            :min="dataBounds.start || undefined"
            :max="dataBounds.end || undefined"
          />
        </label>
      </div>
      <p v-if="rangeError" class="mt-2 text-xs font-medium text-berry-700" role="alert">
        {{ rangeError }}
      </p>
    </div>

    <div class="mt-4 rounded-2xl bg-honey-50/75 px-3.5 py-3">
      <div class="flex items-baseline justify-between gap-3">
        <span class="text-xs font-semibold text-honey-700">需替餐菜品</span>
        <span class="text-lg font-bold tabular-nums text-ink">{{ rows.length }} 道</span>
      </div>
      <p class="mt-1 text-xs leading-5 text-ink-muted">{{ summaryText() }}</p>
    </div>

    <div class="mt-4 space-y-2.5">
      <button
        type="button"
        class="btn btn-primary w-full"
        :disabled="exportDisabled"
        @click="handleDocx"
      >
        <svg class="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M10 2.5v10m0 0 3.5-3.5M10 12.5 6.5 9M3.5 15v1.5h13V15"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        {{ isExportingDocx ? '正在生成…' : '下载 DOCX 周表' }}
      </button>
      <button
        type="button"
        class="btn btn-secondary w-full"
        :disabled="exportDisabled"
        @click="handleCsv"
      >
        <svg class="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M3 4.5h14v11H3zM3 8h14M8 4.5v11"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        下载 CSV 替餐明细
      </button>
    </div>

    <div class="mt-3.5 flex items-start gap-2 text-[0.7rem] leading-5 text-ink-faint">
      <svg class="mt-0.5 h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M3 2.5h7l3 3v8H3z" stroke="currentColor" stroke-width="1.2" />
        <path d="M10 2.5v3h3" stroke="currentColor" stroke-width="1.2" />
      </svg>
      <span class="min-w-0">
        文件名：
        <code class="break-all font-mono text-[0.68rem] text-ink-muted">{{ fileBase }}.docx</code>
      </span>
    </div>

    <p
      v-if="status"
      class="mt-3 rounded-xl px-3 py-2 text-xs font-medium leading-5"
      :class="
        status.tone === 'success'
          ? 'bg-leaf-50 text-leaf-700'
          : 'bg-berry-50 text-berry-700'
      "
      role="status"
    >
      {{ status.message }}
    </p>

    <p class="mt-4 border-t border-ink/[0.06] pt-3 text-[0.7rem] leading-5 text-ink-faint">
      DOCX 为 A4 横向周表，含周一至周日补剂勾选栏；CSV 带 UTF-8 BOM，便于用 Excel 查看。
    </p>
  </aside>
</template>
