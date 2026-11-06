<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import DayView from './components/DayView.vue'
import ExportDialog from './components/ExportDialog.vue'
import ImageLightbox from './components/ImageLightbox.vue'
import PrintSheet from './components/PrintSheet.vue'
import TraceDialog from './components/TraceDialog.vue'
import WeekStrip from './components/WeekStrip.vue'
import WeekView from './components/WeekView.vue'
import {
  MEAL_TIMES,
  type CalendarDayCell,
  type DataBundle,
  type DishKnowledge,
  type DishTraceTarget,
  type ImagePreview,
  type MenuDay,
  type MenuDish,
  type MenuMeal,
} from './types'
import { resolveAssetUrl } from './utils/assets'
import { DataLoadError, loadStaticData } from './utils/dataLoader'
import {
  addDays,
  formatDayLong,
  formatMonthDay,
  formatUpdatedAt,
  formatWeekNumber,
  formatWeekRange,
  isoWeekForDate,
  parseIsoDate,
  todayIsoDate,
  weekDates,
  weekdayLabel,
} from './utils/date'
import { buildMenuDays, createWeekOptions, getWeekEntries } from './utils/menu'

const RECIPES_FALLBACK_ERROR = '食谱数据加载失败，请稍后重试或确认仓库资源。'

type ViewMode = 'day' | 'week'

const data = ref<DataBundle | null>(null)
const loading = ref(true)
const error = ref('')
const today = todayIsoDate()
/** 幼儿园放学时间：16 点以后默认看下一天。 */
const SCHOOL_DAY_END_HOUR = 16
const selectedDate = ref(today)
const viewMode = ref<ViewMode>('week')
const exportOpen = ref(false)
const traceTarget = ref<DishTraceTarget | null>(null)
const preview = ref<ImagePreview | null>(null)

const selectedWeek = computed(() => isoWeekForDate(selectedDate.value) ?? '')
const weekDatesList = computed(() => weekDates(selectedDate.value))
const weekRangeLabel = computed(() =>
  formatWeekRange(weekDatesList.value[0] ?? '', weekDatesList.value[6] ?? ''),
)
const weekOptions = computed(() => (data.value ? createWeekOptions(data.value.recipes) : []))
const selectedWeekOption = computed(
  () => weekOptions.value.find((option) => option.week === selectedWeek.value) ?? null,
)

const weekEntries = computed(() => {
  if (!data.value || !selectedWeek.value) return []
  return getWeekEntries(data.value.recipes, selectedWeek.value)
})

const weekDays = computed<MenuDay[]>(() => {
  if (!data.value) return []
  return buildMenuDays(
    weekEntries.value,
    data.value.allergens,
    data.value.substitutes,
    data.value.substituteLibrary,
  )
})

const weekDaysByDate = computed(
  () => new Map(weekDays.value.map((day) => [day.date, day])),
)
const day = computed(() => weekDaysByDate.value.get(selectedDate.value) ?? null)
const dayImages = computed(() => {
  const images = day.value?.meals.flatMap((meal) => meal.images) ?? []
  return [...new Map(images.map((image) => [image.src, image])).values()]
})

const calendarCells = computed<CalendarDayCell[]>(() =>
  weekDatesList.value.map((date, index) => {
    const menuDay = weekDaysByDate.value.get(date)
    const parsed = parseIsoDate(date)
    return {
      date,
      weekday: weekdayLabel(date),
      monthDay: formatMonthDay(date),
      dayNumber: parsed ? String(parsed.getUTCDate()) : date.slice(8, 10),
      hasMenu: Boolean(menuDay),
      riskDishCount: menuDay?.riskDishCount ?? 0,
      isToday: date === today,
      isSelected: date === selectedDate.value,
      isWeekend: index >= 5,
    }
  }),
)

const weekRiskCount = computed(() =>
  weekDays.value.reduce((total, menuDay) => total + menuDay.riskDishCount, 0),
)
const weekMealCount = computed(() =>
  weekDays.value.reduce((total, menuDay) => total + menuDay.meals.length, 0),
)
const availableDates = computed(() =>
  data.value
    ? [...new Set(data.value.recipes.map((recipe) => recipe.date))].sort()
    : [],
)
const defaultDate = computed(() => resolveDefaultDate(availableDates.value))
const todayWeek = computed(() => isoWeekForDate(today) ?? '')
/** 当前是否停在真实的今天 / 本周。 */
const onToday = computed(() =>
  viewMode.value === 'week'
    ? selectedWeek.value === todayWeek.value
    : selectedDate.value === today,
)
/** 默认日期因为放学或周末被推到了后面。 */
const defaultAhead = computed(() => defaultDate.value !== today)
const defaultHint = computed(() => {
  if (!defaultAhead.value) return ''
  if (defaultDate.value === addDays(today, 1)) {
    return `已过放学时间，默认先看明天（${formatMonthDay(defaultDate.value)} ${weekdayLabel(defaultDate.value)}）的食谱`
  }
  return `已过放学时间或到周末，默认先看下周（${formatMonthDay(defaultDate.value)} ${weekdayLabel(defaultDate.value)} 起）的食谱`
})
const knowledgeCount = computed(() =>
  data.value ? Object.keys(data.value.dishCatalog.dishes).length : 0,
)
const substituteCount = computed(() => data.value?.substituteLibrary.recipes.length ?? 0)
const knowledgeByName = computed(() => {
  const map = new Map<string, DishKnowledge>()
  for (const dish of Object.values(data.value?.dishCatalog.dishes ?? {})) {
    map.set(dish.name, dish)
    for (const alias of dish.aliases) map.set(alias, dish)
  }
  return map
})
const updatedAtLabel = computed(() => {
  if (!data.value) return ''
  return formatUpdatedAt(data.value.updatedAt) || '未标注'
})
const headerStatusLabel = computed(() => {
  if (loading.value) return '读取中…'
  if (error.value) return '加载失败'
  return updatedAtLabel.value || '未标注'
})
const pageTitle = computed(() => {
  if (viewMode.value === 'week') return '这周吃什么'
  return selectedDate.value === today ? '乐乐今天吃什么' : '当天食谱'
})
const overlayOpen = computed(
  () => Boolean(traceTarget.value) || Boolean(preview.value) || exportOpen.value,
)

/** 周五放学后算下周，周末算下周一，其余 16 点后算次日。 */
function smartDefaultDate(now = new Date()): string {
  const iso = todayIsoDate(now)
  const weekday = now.getDay()
  if (weekday === 6) return addDays(iso, 2) ?? iso
  if (weekday === 0) return addDays(iso, 1) ?? iso
  if (now.getHours() < SCHOOL_DAY_END_HOUR) return iso
  return addDays(iso, weekday === 5 ? 3 : 1) ?? iso
}

/**
 * 默认日期。
 * 1. 目标日有食谱就直接用；
 * 2. 目标日没食谱（放假、停课）时，优先在目标日所在那一周里找最近的一天；
 * 3. 目标那一周整体没有食谱时，取「最近有食谱的那一周」的第一个有食谱日，
 *    而不是最后一天——否则周五放学后会高亮到下周的周五。
 */
function resolveDefaultDate(dates: string[], now = new Date()): string {
  const target = smartDefaultDate(now)
  if (dates.length === 0) return target
  if (dates.includes(target)) return target
  const targetWeek = isoWeekForDate(target)
  const sameWeek = dates.filter((date) => isoWeekForDate(date) === targetWeek)
  if (sameWeek.length > 0) {
    const next = sameWeek.find((date) => date >= target)
    return next ?? sameWeek[sameWeek.length - 1] ?? target
  }
  const later = dates.filter((date) => date > target)
  if (later.length > 0) {
    const week = isoWeekForDate(later[0])
    return dates.find((date) => isoWeekForDate(date) === week) ?? later[0]
  }
  const lastWeek = isoWeekForDate(dates[dates.length - 1])
  return dates.find((date) => isoWeekForDate(date) === lastWeek) ?? dates[dates.length - 1]
}

async function loadPageData(): Promise<void> {
  loading.value = true
  error.value = ''
  data.value = null

  try {
    const bundle = await loadStaticData()
    data.value = bundle

    const dates = [...new Set(bundle.recipes.map((recipe) => recipe.date))].sort()
    // 每次进入都按当前时间决定默认日期，不再沿用上次记住的日子。
    selectedDate.value = resolveDefaultDate(dates)
    viewMode.value = 'week'
  } catch (caught) {
    console.error('[leleat] 数据加载失败', caught)
    error.value = caught instanceof DataLoadError ? caught.message : RECIPES_FALLBACK_ERROR
  } finally {
    loading.value = false
  }
}

function setViewMode(mode: ViewMode): void {
  if (mode === viewMode.value) return
  viewMode.value = mode
  // 切到日视图时回到「现在该看的那一天」。
  if (mode === 'day') selectedDate.value = resolveDefaultDate(availableDates.value)
}

function selectStripDate(date: string): void {
  selectedDate.value = date
}

function openWeekDay(date: string): void {
  selectedDate.value = date
  viewMode.value = 'day'
}

function stepDate(direction: -1 | 1): void {
  const amount = viewMode.value === 'day' ? direction : direction * 7
  const next = addDays(selectedDate.value, amount)
  if (next) selectedDate.value = next
}

function onDateChange(event: Event): void {
  const value = (event.target as HTMLInputElement).value
  if (parseIsoDate(value)) selectedDate.value = value
}

function goToday(): void {
  selectedDate.value = today
}

function openTrace(dish: MenuDish, meal: MenuMeal): void {
  const knowledge = knowledgeByName.value.get(dish.name)
  const images =
    dayImages.value.length > 0
      ? dayImages.value
      : (knowledge?.sourceImages ?? []).map((src) => ({
          src: resolveAssetUrl(src),
          alt: `${dish.name}的历史食谱原图`,
        }))

  traceTarget.value = {
    date: selectedDate.value,
    mealLabel: meal.mealLabel,
    mealTime: MEAL_TIMES[meal.mealPeriod],
    dish,
    images,
    note: meal.notes.join(' · '),
    knowledge,
  }
}

function openPreview(image: ImagePreview): void {
  preview.value = image
}

function closeOverlays(): void {
  if (preview.value) {
    preview.value = null
    return
  }
  if (traceTarget.value) {
    traceTarget.value = null
    return
  }
  if (exportOpen.value) {
    exportOpen.value = false
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closeOverlays()
}

function printWeek(): void {
  window.print()
}

watch(selectedDate, (date) => {
  if (!date) return
  document.title = `${formatMonthDay(date)} · Leleat`
})

watch(overlayOpen, (open) => {
  document.body.style.overflow = open ? 'hidden' : ''
})

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  void loadPageData()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <div class="screen-only min-h-screen">
    <header class="border-b border-ink/[0.06] bg-cream/85">
      <div
        class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6 lg:px-8"
      >
        <div class="flex items-center gap-3">
          <span
            class="flex h-10 w-10 items-center justify-center rounded-2xl bg-leaf-600 text-white"
            aria-hidden="true"
          >
            <svg class="h-5 w-5" viewBox="0 0 32 32" fill="none">
              <path
                d="M23.8 7.2c-7.7.5-14.5 3.7-15 11.5-.2 3.7 2.4 6.1 5.9 5.8 6.8-.6 8.5-7.4 9.1-17.3Z"
                fill="currentColor"
              />
              <path d="M10.4 26.8c2.4-5.2 5.6-8.5 9.7-11" stroke="#3f684d" stroke-width="1.9" stroke-linecap="round" />
            </svg>
          </span>
          <div>
            <p class="font-display text-lg font-bold leading-tight tracking-wide text-ink">Leleat</p>
            <p class="mt-0.5 text-[0.68rem] tracking-wide text-ink-muted">乐乐食谱替餐助手</p>
          </div>
        </div>

        <div class="flex items-center gap-4">
          <div class="hidden text-right sm:block">
            <p class="eyebrow">菜品知识库</p>
            <p class="mt-1 text-xs font-medium text-ink-muted">
              {{ knowledgeCount }} 道菜 · {{ substituteCount }} 个替餐
            </p>
          </div>
          <div class="text-right">
            <p class="eyebrow">数据更新</p>
            <p class="mt-1 text-xs font-medium text-ink-muted">{{ headerStatusLabel }}</p>
          </div>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8 lg:px-8">
      <div v-if="loading" class="animate-pulse" aria-busy="true" aria-label="正在加载食谱数据">
        <div class="h-32 rounded-2xl bg-white/55"></div>
        <div class="mt-4 grid grid-cols-7 gap-1.5">
          <div v-for="index in 7" :key="index" class="h-16 rounded-xl bg-white/45"></div>
        </div>
        <div class="mt-5 space-y-3">
          <div class="h-36 rounded-2xl bg-white/55"></div>
          <div class="h-44 rounded-2xl bg-white/45"></div>
          <div class="h-44 rounded-2xl bg-white/45"></div>
        </div>
      </div>

      <div v-else-if="error" class="card mx-auto max-w-xl px-6 py-12 text-center" role="alert">
        <span class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-berry-50 text-berry-600">
          <svg class="h-7 w-7" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 8v5M12 16.5v.1M10.3 4.2 3.1 17a2 2 0 0 0 1.7 3h14.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>
        <h1 class="mt-5 font-display text-2xl font-semibold text-ink">食谱还没加载出来</h1>
        <p class="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-muted">{{ error }}</p>
        <p class="mt-2 text-xs leading-5 text-ink-faint">
          请确认 public/assets/data/ 下的 JSON 文件存在且格式正确。
        </p>
        <button type="button" class="btn btn-primary mt-6" @click="loadPageData">重新加载</button>
      </div>

      <template v-else-if="data">
        <section class="rounded-2xl border border-ink/[0.07] bg-white/55 p-4 sm:p-5">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <p class="eyebrow">{{ viewMode === 'day' ? 'DAY VIEW' : 'WEEK VIEW' }}</p>
                <span class="text-[0.68rem] font-medium text-ink-faint">
                  {{ selectedWeek || '暂无周次' }} · {{ formatWeekNumber(selectedWeek) }}
                </span>
              </div>
              <h1 class="mt-1.5 font-display text-2xl font-semibold text-ink sm:text-3xl">
                {{ pageTitle }}
              </h1>
              <p class="mt-1 text-sm text-ink-muted">
                {{ viewMode === 'day' ? formatDayLong(selectedDate) : weekRangeLabel }}
              </p>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <div class="inline-flex rounded-full bg-ink/[0.045] p-1" role="group" aria-label="切换日视图或周视图">
                <button
                  type="button"
                  class="rounded-full px-3.5 py-1.5 text-xs font-semibold transition"
                  :class="viewMode === 'day' ? 'bg-white text-ink shadow-sm' : 'text-ink-muted'"
                  :aria-pressed="viewMode === 'day'"
                  @click="setViewMode('day')"
                >
                  日视图
                </button>
                <button
                  type="button"
                  class="rounded-full px-3.5 py-1.5 text-xs font-semibold transition"
                  :class="viewMode === 'week' ? 'bg-white text-ink shadow-sm' : 'text-ink-muted'"
                  :aria-pressed="viewMode === 'week'"
                  @click="setViewMode('week')"
                >
                  周视图
                </button>
              </div>

              <button type="button" class="btn btn-secondary" @click="printWeek">
                <svg class="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path
                    d="M6 7V3.5h8V7M6 14.5H4.5A1.5 1.5 0 0 1 3 13V9.5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2V13a1.5 1.5 0 0 1-1.5 1.5H14M6 11.5h8v5H6z"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
                打印本周
              </button>

              <button type="button" class="btn btn-primary" @click="exportOpen = true">
                <svg class="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path
                    d="M10 2.5v10m0 0 3.5-3.5M10 12.5 6.5 9M3.5 15v1.5h13V15"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
                导出
              </button>
            </div>
          </div>

          <div class="mt-4 flex flex-col gap-2 border-t border-ink/[0.06] pt-3 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex items-center gap-1.5">
              <button type="button" class="icon-btn h-10 w-10" aria-label="上一个日期或周" @click="stepDate(-1)">
                <svg class="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="m12.5 4.5-5.5 5.5 5.5 5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
              <label v-if="viewMode === 'day'" class="relative">
                <span class="sr-only">选择日期</span>
                <input
                  type="date"
                  class="h-10 rounded-xl border border-ink/10 bg-white/80 px-3 text-sm font-medium text-ink"
                  :value="selectedDate"
                  @change="onDateChange"
                />
              </label>
              <span
                v-else
                class="flex h-10 items-center rounded-xl border border-ink/10 bg-white/80 px-3 text-sm font-semibold text-ink"
              >
                {{ weekRangeLabel }}
              </span>
              <button type="button" class="icon-btn h-10 w-10" aria-label="下一个日期或周" @click="stepDate(1)">
                <svg class="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="m7.5 4.5 5.5 5.5-5.5 5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                class="rounded-full px-3 py-2 text-xs font-semibold text-ink-muted transition hover:bg-ink/[0.045] hover:text-ink disabled:opacity-40"
                :disabled="onToday"
                @click="goToday"
              >
                {{ viewMode === 'week' ? '本周' : '今天' }}
              </button>
            </div>

            <p class="text-xs text-ink-faint">
              {{ weekMealCount }} 个餐次 · {{ weekRiskCount }} 道需替餐 · 菜品库 {{ knowledgeCount }} 道
            </p>
          </div>
        </section>

        <div
          v-if="defaultHint && !onToday"
          class="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-honey-100 bg-honey-50/70 px-3.5 py-2.5 text-xs leading-5 text-honey-700"
          role="status"
        >
          <span>{{ defaultHint }}；「今天」标记仍是真实的 {{ formatMonthDay(today) }}。</span>
          <button
            type="button"
            class="rounded-full bg-white/80 px-3 py-1 text-[0.68rem] font-semibold text-honey-700 ring-1 ring-inset ring-honey-100"
            @click="goToday"
          >
            回到今天 {{ formatMonthDay(today) }}
          </button>
        </div>

        <div v-if="viewMode === 'day'" class="mt-4">
          <WeekStrip :days="calendarCells" @select="selectStripDate" />
        </div>

        <div class="mt-7">
          <DayView
            v-if="viewMode === 'day'"
            :date="selectedDate"
            :week="selectedWeek"
            :day="day"
            :images="dayImages"
            :is-today="selectedDate === today"
            @trace="openTrace"
            @preview="openPreview"
            @today="goToday"
          />

          <WeekView
            v-else
            :week="selectedWeek"
            :dates="weekDatesList"
            :days-by-date="weekDaysByDate"
            :selected-date="selectedDate"
            :today="today"
            @select="openWeekDay"
          />
        </div>

        <div v-if="weekOptions.length === 0" class="mt-6 rounded-2xl border border-honey-100 bg-honey-50/70 px-4 py-3 text-sm text-honey-700">
          食谱库还是空的。请让本地 Agent 写入 recipes.json 后再刷新。
        </div>
      </template>
    </main>

    <footer class="border-t border-ink/[0.06]">
      <div
        class="mx-auto flex max-w-6xl flex-col gap-1.5 px-4 py-6 text-[0.7rem] leading-5 text-ink-faint sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8"
      >
        <p>Leleat v0.1 · 日视图 / 周视图 · 菜品知识库 {{ knowledgeCount }} 道</p>
        <p>前端只读静态 JSON；识别与知识库增量维护由本地 Agent 完成。</p>
      </div>
    </footer>
  </div>

  <PrintSheet
    v-if="data && selectedWeek"
    :week="selectedWeek"
    :dates="weekDatesList"
    :days="weekDays"
    :supplements="data.settings.supplements"
    :school-name="data.settings.schoolName"
    :updated-at="updatedAtLabel"
  />

  <TraceDialog :target="traceTarget" @close="traceTarget = null" @preview="openPreview" />
  <ImageLightbox :image="preview" @close="preview = null" />

  <ExportDialog
    v-if="data"
    :open="exportOpen"
    :selected-week="selectedWeek"
    :selected-week-option="selectedWeekOption"
    :recipes="data.recipes"
    :allergens="data.allergens"
    :substitutes="data.substitutes"
    :substitute-library="data.substituteLibrary"
    :supplements="data.settings.supplements"
    :school-name="data.settings.schoolName"
    :updated-at="updatedAtLabel"
    @close="exportOpen = false"
  />
</template>
