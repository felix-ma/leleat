<script setup lang="ts">
import { computed } from 'vue'
import {
  MEAL_LABELS,
  MEAL_ORDER,
  type MealPeriod,
  type MenuDay,
  type MenuMeal,
} from '../types'
import { formatMonthDay, formatWeekRange, formatWeekNumber, weekdayLabel } from '../utils/date'

const props = defineProps<{
  week: string
  dates: string[]
  daysByDate: Map<string, MenuDay>
  selectedDate: string
  today: string
}>()

const emit = defineEmits<{
  select: [date: string]
}>()

const availableDays = computed(() =>
  props.dates.map((date) => props.daysByDate.get(date)).filter((day): day is MenuDay => Boolean(day)),
)
const riskDishCount = computed(() =>
  availableDays.value.reduce((total, day) => total + day.riskDishCount, 0),
)
const safeMealCount = computed(() =>
  availableDays.value.reduce(
    (total, day) => total + day.meals.filter((meal) => !meal.hasRisk).length,
    0,
  ),
)
const rangeLabel = computed(() => formatWeekRange(props.dates[0] ?? '', props.dates[6] ?? ''))

const mealsAt = computed(() => {
  const map = new Map<string, Map<MealPeriod, MenuMeal>>()
  for (const date of props.dates) {
    const day = props.daysByDate.get(date)
    const inner = new Map<MealPeriod, MenuMeal>()
    for (const meal of day?.meals ?? []) inner.set(meal.mealPeriod, meal)
    map.set(date, inner)
  }
  return map
})
const mealAt = (date: string, period: MealPeriod): MenuMeal | null =>
  mealsAt.value.get(date)?.get(period) ?? null

/** 本表出现过的餐次，按固定顺序排列。 */
const periods = computed<MealPeriod[]>(() => {
  const found = new Set<MealPeriod>()
  for (const day of availableDays.value) {
    for (const meal of day.meals) found.add(meal.mealPeriod)
  }
  return [...found].sort((left, right) => MEAL_ORDER[left] - MEAL_ORDER[right])
})

function periodLabel(period: MealPeriod): string {
  for (const day of availableDays.value) {
    const meal = day.meals.find((item) => item.mealPeriod === period)
    if (meal) return meal.mealLabel
  }
  return MEAL_LABELS[period]
}

/** 列宽随天数与内容自适应，行高由同一行最高的一格决定。 */
const gridStyle = computed(() => ({
  gridTemplateColumns: `5.2rem repeat(${props.dates.length}, minmax(6.4rem, 1fr))`,
  minWidth: `${5.2 + props.dates.length * 6.8}rem`,
}))
</script>

<template>
  <section aria-labelledby="week-title">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p class="eyebrow">{{ week }} · Week</p>
        <h2 id="week-title" class="mt-2 font-display text-3xl font-semibold text-ink sm:text-4xl">
          一周总览
        </h2>
        <p class="mt-2 text-sm text-ink-muted">
          {{ rangeLabel }} · {{ formatWeekNumber(week) }}
        </p>
      </div>

      <div class="flex flex-wrap gap-2">
        <span class="summary-chip">
          <span class="text-ink-faint">有食谱</span>
          <strong>{{ availableDays.length }} 天</strong>
        </span>
        <span class="summary-chip" :class="riskDishCount > 0 ? 'border-berry-100 bg-berry-50/70' : ''">
          <span :class="riskDishCount > 0 ? 'text-berry-700' : 'text-ink-faint'">需替餐</span>
          <strong :class="riskDishCount > 0 ? 'text-berry-700' : ''">{{ riskDishCount }}</strong>
        </span>
        <span class="summary-chip border-leaf-100 bg-leaf-50/60">
          <span class="text-leaf-700/70">安全餐</span>
          <strong class="text-leaf-700">{{ safeMealCount }}</strong>
        </span>
      </div>
    </div>

    <div class="mt-5 overflow-x-auto pb-2">
      <div class="week-grid" :style="gridStyle" role="table" aria-label="本周食谱表">
        <div class="week-grid-label week-grid-corner" role="columnheader">餐次</div>
        <button
          v-for="date in dates"
          :key="date"
          type="button"
          role="columnheader"
          class="week-grid-head"
          :class="[
            date === today ? 'week-grid-head-today' : '',
            date === selectedDate ? 'week-grid-head-selected' : '',
          ]"
          :aria-label="`查看 ${formatMonthDay(date)} ${weekdayLabel(date)} 的食谱`"
          @click="emit('select', date)"
        >
          <span class="text-[0.6rem] font-bold tracking-wider text-ink-faint">
            {{ weekdayLabel(date) }}
          </span>
          <span class="font-display text-xl font-semibold leading-none text-ink">
            {{ Number(date.slice(8, 10)) }}
          </span>
          <span class="text-[0.56rem] text-ink-faint">{{ formatMonthDay(date) }}</span>
          <span
            v-if="date === today"
            class="rounded-full bg-honey-50 px-1.5 py-0.5 text-[0.55rem] font-bold text-honey-700"
          >
            今天
          </span>
        </button>

        <template v-for="period in periods" :key="period">
          <div class="week-grid-label" role="rowheader">
            <span class="text-[0.66rem] font-bold text-ink-muted">{{ periodLabel(period) }}</span>
          </div>
          <button
            v-for="date in dates"
            :key="`${period}-${date}`"
            type="button"
            role="cell"
            class="week-grid-cell"
            :class="[
              mealAt(date, period)?.hasRisk ? 'week-grid-cell-risk' : '',
              date === selectedDate ? 'week-grid-cell-selected' : '',
            ]"
            @click="emit('select', date)"
          >
            <template v-if="mealAt(date, period)">
              <p
                v-for="dish in mealAt(date, period)?.dishes"
                :key="dish.name"
                class="week-grid-dish"
                :class="dish.riskAllergens.length > 0 ? 'font-semibold text-berry-700' : 'text-ink-muted'"
              >
                {{ dish.name
                }}<template v-if="dish.riskAllergens.length > 0 && dish.recommendation[0]"
                  ><span class="font-normal text-berry-500">（替：{{ dish.recommendation[0] }}）</span></template
                >
              </p>
            </template>
            <span v-else class="text-[0.62rem] text-ink-faint/70">—</span>
          </button>
        </template>

        <div class="week-grid-label week-grid-foot" role="rowheader">
          <span class="text-[0.62rem] font-semibold text-ink-faint">当天小结</span>
        </div>
        <div
          v-for="date in dates"
          :key="`foot-${date}`"
          role="cell"
          class="week-grid-cell week-grid-foot"
        >
          <template v-if="daysByDate.get(date)">
            <span class="text-[0.62rem] text-ink-faint">
              {{ daysByDate.get(date)?.meals.length }} 餐
            </span>
            <span
              class="text-[0.62rem]"
              :class="
                (daysByDate.get(date)?.riskDishCount ?? 0) > 0
                  ? 'font-semibold text-berry-700'
                  : 'font-medium text-leaf-700'
              "
            >
              {{
                (daysByDate.get(date)?.riskDishCount ?? 0) > 0
                  ? `${daysByDate.get(date)?.riskDishCount} 道需替餐`
                  : '全天安全'
              }}
            </span>
          </template>
          <span v-else class="text-[0.62rem] text-ink-faint/70">无食谱</span>
        </div>
      </div>
    </div>

    <p class="mt-3 text-xs text-ink-faint">点表头或任意一格，进入当天的食谱和食材溯源。</p>
  </section>
</template>

<style scoped>
.week-grid {
  display: grid;
  gap: 1px;
  background: rgba(34, 34, 34, 0.09);
  border: 1px solid rgba(34, 34, 34, 0.09);
  border-radius: 0.95rem;
  overflow: hidden;
}

.week-grid > * {
  background: #fffdfa;
  min-width: 0;
}

.week-grid-label {
  position: sticky;
  left: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  padding: 0.5rem 0.55rem;
  background: #f7f4ec;
}

.week-grid-corner {
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: rgb(var(--ink-faint, 130 130 130));
}

.week-grid-head {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.15rem;
  padding: 0.55rem 0.6rem;
  text-align: left;
  transition: background-color 0.2s ease;
}

.week-grid-head:hover {
  background: #fbf8f1;
}

.week-grid-head-today {
  background: #fffaf0;
}

.week-grid-head-selected {
  box-shadow: inset 0 -2px 0 0 rgb(190 76 108);
}

.week-grid-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.1rem;
  padding: 0.5rem 0.6rem;
  text-align: left;
  transition: background-color 0.2s ease;
}

.week-grid-cell:hover {
  background: #fbf8f1;
}

.week-grid-cell-risk {
  background: #fff8f9;
}

.week-grid-cell-selected {
  box-shadow: inset 2px 0 0 0 rgb(190 76 108);
}

.week-grid-dish {
  font-size: 0.72rem;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.week-grid-foot {
  background: #faf8f3;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
}
</style>
