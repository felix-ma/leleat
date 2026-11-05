<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ExportPanel from './components/ExportPanel.vue'
import WeekMenu from './components/WeekMenu.vue'
import type { DataBundle, ImagePreview, MenuDay } from './types'
import { DataLoadError, loadStaticData } from './utils/dataLoader'
import { buildMenuDays, countSafeMeals, createWeekOptions, getWeekEntries } from './utils/menu'
import { formatDocxDate, formatUpdatedAt, formatWeekNumber } from './utils/date'

const STORAGE_KEY = 'leleat:selected-week'
const RECIPES_FALLBACK_ERROR = '食谱数据加载失败，请稍后重试或确认仓库资源。'

interface PrintRow {
  key: string
  date: string
  mealLabel: string
  dishName: string
  ingredients: string
  risk: string
  substitute: string
  hasRisk: boolean
}

const data = ref<DataBundle | null>(null)
const loading = ref(true)
const error = ref('')
const selectedWeek = ref('')
const preview = ref<ImagePreview | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
let focusBeforePreview: HTMLElement | null = null

const weekOptions = computed(() => (data.value ? createWeekOptions(data.value.recipes) : []))
const latestWeek = computed(() => weekOptions.value[weekOptions.value.length - 1]?.week ?? '')
const selectedWeekOption = computed(
  () => weekOptions.value.find((option) => option.week === selectedWeek.value) ?? null,
)
const selectedIndex = computed(() =>
  weekOptions.value.findIndex((option) => option.week === selectedWeek.value),
)
const canGoOlder = computed(() => selectedIndex.value > 0)
const canGoNewer = computed(
  () => selectedIndex.value >= 0 && selectedIndex.value < weekOptions.value.length - 1,
)

const days = computed<MenuDay[]>(() => {
  if (!data.value || !selectedWeek.value) return []
  return buildMenuDays(
    getWeekEntries(data.value.recipes, selectedWeek.value),
    data.value.allergens,
    data.value.substitutes,
  )
})

const riskDishCount = computed(() =>
  days.value.reduce((total, day) => total + day.riskDishCount, 0),
)
const safeMealCount = computed(() => countSafeMeals(days.value))
const totalMealCount = computed(() =>
  days.value.reduce((total, day) => total + day.meals.length, 0),
)
const monitoredAllergens = computed(() =>
  data.value?.allergens.map((allergen) => allergen.name).join('、') ?? '',
)
const updatedAtLabel = computed(() => {
  if (!data.value) return ''
  return formatUpdatedAt(data.value.updatedAt) || '未标注'
})
const headerStatusLabel = computed(() => {
  if (loading.value) return '读取中…'
  if (error.value) return '加载失败'
  return updatedAtLabel.value || '未标注'
})
const weekLabel = computed(() => selectedWeekOption.value?.label ?? '')
const weekNumber = computed(() =>
  selectedWeek.value ? formatWeekNumber(selectedWeek.value) : '',
)

const printRows = computed<PrintRow[]>(() =>
  days.value.flatMap((day) =>
    day.meals.flatMap((meal) =>
      meal.dishes.map((dish, index) => ({
        key: `${meal.key}-${index}`,
        date: formatDocxDate(day.date),
        mealLabel: meal.mealLabel,
        dishName: dish.name,
        ingredients: dish.ingredients.join('、') || '—',
        risk: dish.allergenNames.length > 0 ? dish.allergenNames.join('、') : '无',
        substitute:
          dish.riskAllergens.length > 0
            ? dish.recommendation.join('、') || '待与幼儿园确认'
            : '—',
        hasRisk: dish.riskAllergens.length > 0,
      })),
    ),
  ),
)

function readStoredWeek(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function persistWeek(week: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, week)
  } catch {
    // 隐私模式或存储被禁用时静默失败，不影响主流程。
  }
}

async function loadPageData(): Promise<void> {
  loading.value = true
  error.value = ''
  data.value = null

  try {
    const bundle = await loadStaticData()
    data.value = bundle

    const options = createWeekOptions(bundle.recipes)
    const latest = options[options.length - 1]?.week ?? ''
    const stored = readStoredWeek()
    const storedIsAvailable = Boolean(stored && options.some((option) => option.week === stored))
    selectedWeek.value = storedIsAvailable && stored ? stored : latest
  } catch (caught) {
    console.error('[leleat] 数据加载失败', caught)
    error.value =
      caught instanceof DataLoadError ? caught.message : RECIPES_FALLBACK_ERROR
  } finally {
    loading.value = false
  }
}

function selectWeek(event: Event): void {
  const target = event.target as HTMLSelectElement
  if (weekOptions.value.some((option) => option.week === target.value)) {
    selectedWeek.value = target.value
  }
}

function goOlderWeek(): void {
  const option = weekOptions.value[selectedIndex.value - 1]
  if (option) selectedWeek.value = option.week
}

function goNewerWeek(): void {
  const option = weekOptions.value[selectedIndex.value + 1]
  if (option) selectedWeek.value = option.week
}

function goLatestWeek(): void {
  if (latestWeek.value) selectedWeek.value = latestWeek.value
}

function printWeek(): void {
  window.print()
}

function openPreview(image: ImagePreview): void {
  focusBeforePreview = document.activeElement instanceof HTMLElement ? document.activeElement : null
  preview.value = image
}

function closePreview(): void {
  preview.value = null
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && preview.value) {
    closePreview()
  }
}

watch(selectedWeek, (week) => {
  if (week) persistWeek(week)
})

watch(preview, async (image) => {
  document.body.style.overflow = image ? 'hidden' : ''
  if (image) {
    await nextTick()
    closeButton.value?.focus()
  } else if (focusBeforePreview) {
    focusBeforePreview.focus()
    focusBeforePreview = null
  }
})

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  void loadPageData()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <div class="screen-only">
    <header class="border-b border-ink/[0.06] bg-cream/80">
      <div
        class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8"
      >
        <div class="flex items-center gap-3">
          <span
            class="flex h-11 w-11 items-center justify-center rounded-2xl bg-leaf-600 text-white shadow-lift"
            aria-hidden="true"
          >
            <svg class="h-6 w-6" viewBox="0 0 32 32" fill="none">
              <path
                d="M23.8 7.2c-7.7.5-14.5 3.7-15 11.5-.2 3.7 2.4 6.1 5.9 5.8 6.8-.6 8.5-7.4 9.1-17.3Z"
                fill="currentColor"
                opacity=".92"
              />
              <path
                d="M10.4 26.8c2.4-5.2 5.6-8.5 9.7-11"
                stroke="#3f684d"
                stroke-width="1.9"
                stroke-linecap="round"
              />
            </svg>
          </span>
          <div>
            <p class="font-display text-lg font-bold leading-tight tracking-wide text-ink">Leleat</p>
            <p class="mt-0.5 text-[0.7rem] tracking-wide text-ink-muted">乐乐食谱替餐助手</p>
          </div>
        </div>

        <div class="flex items-center gap-4">
          <span
            class="tag hidden bg-white/55 text-ink-muted ring-1 ring-inset ring-ink/[0.07] sm:inline-flex"
          >
            <span class="h-1.5 w-1.5 rounded-full bg-leaf-500" aria-hidden="true"></span>
            只读静态数据
          </span>
          <div class="text-right">
            <p class="eyebrow">数据更新</p>
            <p class="mt-1 text-xs font-medium text-ink-muted">
              {{ headerStatusLabel }}
            </p>
          </div>
        </div>
      </div>
    </header>

    <main id="main-content" class="mx-auto max-w-7xl px-4 pb-14 pt-8 sm:px-6 sm:pt-10 lg:px-8">
      <div v-if="loading" class="animate-pulse" aria-busy="true" aria-label="正在加载食谱数据">
        <div class="h-3 w-32 rounded-full bg-ink/10"></div>
        <div class="mt-4 h-11 w-64 rounded-2xl bg-ink/10"></div>
        <div class="mt-3 h-4 w-96 max-w-full rounded-full bg-ink/[0.07]"></div>
        <div class="mt-8 h-24 rounded-3xl border border-ink/[0.05] bg-white/50"></div>
        <div class="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <div class="space-y-5">
            <div class="h-48 rounded-3xl border border-ink/[0.05] bg-white/55"></div>
            <div class="h-64 rounded-3xl border border-ink/[0.05] bg-white/45"></div>
          </div>
          <div class="h-96 rounded-3xl border border-ink/[0.05] bg-white/55"></div>
        </div>
      </div>

      <div v-else-if="error" class="card mx-auto max-w-2xl px-6 py-12 text-center" role="alert">
        <span
          class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-berry-50 text-berry-600"
          aria-hidden="true"
        >
          <svg class="h-7 w-7" viewBox="0 0 24 24" fill="none">
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
          请确认仓库内 public/assets/data/ 下的 JSON 文件存在且格式正确。
        </p>
        <button type="button" class="btn btn-primary mt-6" @click="loadPageData">
          重新加载
        </button>
      </div>

      <template v-else-if="data">
        <section>
          <div class="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p class="eyebrow">Weekly menu · {{ selectedWeek || 'Leleat' }}</p>
              <h1 class="mt-2 font-display text-3xl font-semibold leading-tight text-ink sm:text-4xl">
                乐乐的本周食谱
              </h1>
              <p class="mt-2 max-w-xl text-sm leading-6 text-ink-muted">
                已按登记信息标出
                <strong class="font-semibold text-ink">{{ monitoredAllergens }}</strong>
                过敏风险。绿色无需替换，红色请查看替餐建议。
              </p>
            </div>

            <div class="grid grid-cols-3 gap-2.5 sm:gap-3">
              <div class="rounded-2xl border border-ink/[0.06] bg-white/55 px-3 py-3">
                <p class="eyebrow">覆盖</p>
                <p class="mt-1.5 text-2xl font-bold leading-none text-ink">
                  {{ days.length }}<span class="ml-1 text-xs font-medium text-ink-faint">天</span>
                </p>
              </div>
              <div class="rounded-2xl border border-berry-100 bg-berry-50/70 px-3 py-3">
                <p class="eyebrow text-berry-700/70">需替餐</p>
                <p class="mt-1.5 text-2xl font-bold leading-none text-berry-700">
                  {{ riskDishCount }}<span class="ml-1 text-xs font-medium text-berry-600/70">道</span>
                </p>
              </div>
              <div class="rounded-2xl border border-leaf-100 bg-leaf-50/80 px-3 py-3">
                <p class="eyebrow text-leaf-700/70">安全餐次</p>
                <p class="mt-1.5 text-2xl font-bold leading-none text-leaf-700">
                  {{ safeMealCount }}<span class="ml-1 text-xs font-medium text-leaf-600/70">餐</span>
                </p>
              </div>
            </div>
          </div>
        </section>

        <template v-if="weekOptions.length > 0">
          <section class="mt-6" aria-label="选择查看的周">
            <div class="card px-3 py-3 sm:px-4">
              <div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div class="flex min-w-0 flex-1 items-center gap-2">
                  <button
                    type="button"
                    class="icon-btn"
                    :disabled="!canGoOlder"
                    aria-label="查看上一周"
                    title="上一周"
                    @click="goOlderWeek"
                  >
                    <svg class="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <path
                        d="m12.5 4.5-5.5 5.5 5.5 5.5"
                        stroke="currentColor"
                        stroke-width="1.8"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </button>

                  <div class="min-w-0 flex-1 px-1 sm:px-2">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="tag bg-leaf-50 text-leaf-700 ring-1 ring-inset ring-leaf-100">
                        {{ selectedWeek }}
                      </span>
                      <span class="text-xs text-ink-faint">
                        {{ days.length }} 天 · {{ totalMealCount }} 餐
                      </span>
                      <button
                        v-if="selectedWeek !== latestWeek"
                        type="button"
                        class="text-xs font-semibold text-leaf-700 underline decoration-leaf-200 underline-offset-4 hover:decoration-leaf-500"
                        @click="goLatestWeek"
                      >
                        回到最新周
                      </button>
                    </div>
                    <p class="mt-1.5 truncate text-sm font-bold text-ink sm:text-base" aria-live="polite">
                      {{ weekLabel }} <span class="ml-1 font-normal text-ink-faint">{{ weekNumber }}</span>
                    </p>
                  </div>

                  <button
                    type="button"
                    class="icon-btn"
                    :disabled="!canGoNewer"
                    aria-label="查看下一周"
                    title="下一周"
                    @click="goNewerWeek"
                  >
                    <svg class="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <path
                        d="m7.5 4.5 5.5 5.5-5.5 5.5"
                        stroke="currentColor"
                        stroke-width="1.8"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </button>
                </div>

                <div class="flex items-stretch gap-2 xl:items-center">
                  <label class="relative min-w-0 flex-1 xl:w-72 xl:flex-none">
                    <span class="sr-only">跳转到指定周</span>
                    <select
                      class="select-control pr-9"
                      :value="selectedWeek"
                      @change="selectWeek"
                    >
                      <option
                        v-for="option in weekOptions"
                        :key="option.week"
                        :value="option.week"
                      >
                        {{ option.week }} · {{ option.shortLabel }}
                      </option>
                    </select>
                    <svg
                      class="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
                      viewBox="0 0 20 20"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="m5 7.5 5 5 5-5"
                        stroke="currentColor"
                        stroke-width="1.7"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </label>

                  <button
                    type="button"
                    class="btn btn-secondary shrink-0"
                    aria-label="打印当前周食谱"
                    @click="printWeek"
                  >
                    <svg class="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <path
                        d="M6 7V3.5h8V7M6 14.5H4.5A1.5 1.5 0 0 1 3 13V9.5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2V13a1.5 1.5 0 0 1-1.5 1.5H14M6 11.5h8v5H6z"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                    <span class="hidden sm:inline">打印本周</span>
                    <span class="sm:hidden">打印</span>
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section class="mt-4 flex flex-wrap items-center justify-between gap-3" aria-label="图例">
            <div class="flex flex-wrap items-center gap-2 text-xs">
              <span class="font-semibold text-ink-faint">图例</span>
              <span class="tag bg-leaf-50 text-leaf-700 ring-1 ring-inset ring-leaf-200">
                <span class="h-1.5 w-1.5 rounded-full bg-leaf-500" aria-hidden="true"></span>
                安全菜品
              </span>
              <span class="tag bg-berry-50 text-berry-700 ring-1 ring-inset ring-berry-200">
                含鸡蛋
              </span>
              <span class="tag bg-berry-50 text-berry-700 ring-1 ring-inset ring-berry-200">
                含牛奶
              </span>
              <span class="tag bg-berry-600 text-white">同时含两种</span>
            </div>
            <p class="text-xs text-ink-faint">
              数据更新于 {{ updatedAtLabel }}
            </p>
          </section>

          <div
            class="mt-5 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] xl:grid-cols-[minmax(0,1fr)_23rem]"
          >
            <WeekMenu :days="days" @preview="openPreview" />

            <ExportPanel
              :selected-week="selectedWeek"
              :selected-week-option="selectedWeekOption"
              :recipes="data.recipes"
              :allergens="data.allergens"
              :substitutes="data.substitutes"
            />
          </div>
        </template>

        <div v-else class="card mt-8 px-6 py-16 text-center">
          <h2 class="font-display text-2xl font-semibold text-ink">食谱库还是空的</h2>
          <p class="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-muted">
            仓库中还没有通过校验的食谱条目。请让本地 Agent 识别并提交
            <code class="rounded bg-ink/[0.05] px-1.5 py-0.5 text-xs">recipes.json</code>
            后再刷新页面。
          </p>
        </div>
      </template>
    </main>

    <footer class="border-t border-ink/[0.06]">
      <div
        class="mx-auto flex max-w-7xl flex-col gap-1.5 px-4 py-6 text-[0.7rem] leading-5 text-ink-faint sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8"
      >
        <p>Leleat v0.1 · 纯静态食谱展示与替餐导出</p>
        <p>识别与入库由本地 Agent 完成，前端不调用任何 AI 或后端接口。</p>
      </div>
    </footer>
  </div>

  <section
    v-if="days.length > 0"
    class="print-only print-sheet"
    aria-label="打印用食谱与替餐表"
  >
    <h1>乐乐 · 本周食谱与替餐表</h1>
    <p class="print-subtitle">
      {{ selectedWeekOption?.label }} · {{ selectedWeek || '' }}
    </p>
    <div class="print-meta">
      <span>数据更新：{{ updatedAtLabel }}</span>
      <span>打勾确认后交给幼儿园</span>
    </div>

    <table class="print-table">
      <colgroup>
        <col style="width: 12%" />
        <col style="width: 8%" />
        <col style="width: 17%" />
        <col style="width: 24%" />
        <col style="width: 13%" />
        <col style="width: 26%" />
      </colgroup>
      <thead>
        <tr>
          <th>日期</th>
          <th>餐次</th>
          <th>菜品</th>
          <th>食材</th>
          <th>过敏风险</th>
          <th>推荐替餐</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in printRows" :key="row.key">
          <td>{{ row.date }}</td>
          <td>{{ row.mealLabel }}</td>
          <td>{{ row.dishName }}</td>
          <td>{{ row.ingredients }}</td>
          <td :class="row.hasRisk ? 'print-risk' : 'print-safe'">{{ row.risk }}</td>
          <td>{{ row.substitute }}</td>
        </tr>
      </tbody>
    </table>

    <p class="print-footnote">
      说明：绿色“无”表示未登记鸡蛋、牛奶过敏原；红色为需替餐菜品。替餐建议请与幼儿园再次确认。
    </p>
  </section>

  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="preview"
        class="screen-only fixed inset-0 z-50 flex items-center justify-center bg-ink/85 p-4 backdrop-blur-sm"
        @click.self="closePreview"
      >
        <div
          class="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-3xl bg-card p-4 shadow-2xl sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="preview-title"
        >
          <div class="mb-3 flex items-center justify-between gap-4">
            <div>
              <p class="eyebrow">Source image</p>
              <h2 id="preview-title" class="mt-1 font-display text-xl font-semibold text-ink">
                食谱原图
              </h2>
            </div>
            <button
              ref="closeButton"
              type="button"
              class="icon-btn"
              aria-label="关闭原图预览"
              @click="closePreview"
            >
              <svg class="h-5 w-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path
                  d="m5 5 10 10M15 5 5 15"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                />
              </svg>
            </button>
          </div>

          <div class="flex min-h-32 items-center justify-center rounded-2xl bg-cream p-2 sm:p-4">
            <img
              :src="preview.src"
              :alt="preview.alt"
              class="max-h-[68vh] max-w-full rounded-xl object-contain"
              @error="closePreview"
            />
          </div>
          <p class="mt-3 px-1 text-xs leading-5 text-ink-muted">{{ preview.alt }}</p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.18s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
