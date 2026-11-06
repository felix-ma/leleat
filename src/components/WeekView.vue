<script setup lang="ts">
import { computed } from 'vue'
import type { MenuDay } from '../types'
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
      <div class="grid min-w-[900px] grid-cols-7 gap-2">
        <button
          v-for="date in dates"
          :key="date"
          type="button"
          class="calendar-column group"
          :class="[
            date === today ? 'calendar-column-today' : '',
            date === selectedDate ? 'calendar-column-selected' : '',
          ]"
          :aria-label="`查看 ${formatMonthDay(date)} ${weekdayLabel(date)} 的食谱`"
          @click="emit('select', date)"
        >
          <div class="flex items-start justify-between gap-1">
            <div>
              <p class="text-[0.65rem] font-bold tracking-wider text-ink-faint">
                {{ weekdayLabel(date) }}
              </p>
              <p class="mt-1 font-display text-2xl font-semibold leading-none text-ink">
                {{ Number(date.slice(8, 10)) }}
              </p>
            </div>
            <span
              v-if="date === today"
              class="rounded-full bg-honey-50 px-1.5 py-0.5 text-[0.58rem] font-bold text-honey-700"
            >
              今天
            </span>
          </div>

          <div v-if="daysByDate.get(date)" class="mt-4 flex-1 space-y-3">
            <div
              v-for="meal in daysByDate.get(date)?.meals"
              :key="meal.key"
              class="rounded-xl border border-ink/[0.055] bg-white/55 p-2"
            >
              <div class="flex items-center justify-between gap-1">
                <span class="text-[0.62rem] font-bold tracking-wide text-ink-faint">
                  {{ meal.mealLabel }}
                </span>
                <span
                  v-if="meal.hasRisk"
                  class="h-1.5 w-1.5 rounded-full bg-berry-500"
                  :title="`${meal.riskDishCount} 道需替餐`"
                ></span>
              </div>
              <div class="mt-1.5 space-y-0.5">
                <p
                  v-for="dish in meal.dishes"
                  :key="dish.name"
                  class="text-[0.72rem] leading-[1.55]"
                  :class="dish.riskAllergens.length > 0 ? 'font-semibold text-berry-700' : 'text-ink-muted'"
                >
                  {{ dish.name
                  }}<template v-if="dish.riskAllergens.length > 0 && dish.recommendation[0]"
                    ><span class="font-normal text-berry-500">（替：{{ dish.recommendation[0] }}）</span></template
                  >
                </p>
              </div>
            </div>
          </div>

          <div v-else class="flex flex-1 flex-col items-center justify-center py-14 text-ink-faint">
            <span class="text-2xl" aria-hidden="true">—</span>
            <span class="mt-2 text-[0.68rem]">无食谱</span>
          </div>

          <div
            v-if="daysByDate.get(date)"
            class="mt-3 flex items-center justify-between border-t border-ink/[0.06] pt-2 text-[0.62rem]"
          >
            <span class="text-ink-faint">{{ daysByDate.get(date)?.meals.length }} 餐</span>
            <span
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
          </div>
        </button>
      </div>
    </div>

    <p class="mt-3 text-xs text-ink-faint">点击任意一天，进入当天的食谱和食材溯源。</p>
  </section>
</template>
