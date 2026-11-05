<script setup lang="ts">
import { computed } from 'vue'
import { MEAL_LABELS, MEAL_ORDER, type MealPeriod, type MenuDay, type MenuDish } from '../types'
import { formatWeekNumber, formatWeekRange, weekdayLong } from '../utils/date'

const props = defineProps<{
  week: string
  dates: string[]
  days: MenuDay[]
  supplements: string[]
  schoolName?: string
  updatedAt: string
}>()

const daysByDate = computed(() => new Map(props.days.map((day) => [day.date, day])))
const menuDates = computed(() => props.dates.slice(0, 5))

interface MealRow {
  period: MealPeriod
  label: string
}

const mealRows = computed<MealRow[]>(() => {
  const labels = new Map<MealPeriod, string>()
  for (const day of props.days) {
    for (const meal of day.meals) {
      if (!labels.has(meal.mealPeriod)) {
        labels.set(meal.mealPeriod, meal.mealLabel || MEAL_LABELS[meal.mealPeriod])
      }
    }
  }
  return [...labels.entries()]
    .map(([period, label]) => ({ period, label }))
    .sort((left, right) => MEAL_ORDER[left.period] - MEAL_ORDER[right.period])
})

function dishesFor(date: string, period: MealPeriod): MenuDish[] {
  const day = daysByDate.value.get(date)
  return day?.meals.find((meal) => meal.mealPeriod === period)?.dishes ?? []
}

function rangeLabel(): string {
  return formatWeekRange(props.dates[0] ?? '', props.dates[6] ?? '')
}

function shortDate(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`
}
</script>

<template>
  <section class="print-only print-sheet" aria-label="打印用周食谱和补剂清单">
    <header class="print-header">
      <div>
        <p class="print-kicker">{{ schoolName || 'Leleat' }} · 周食谱</p>
        <h1>乐乐 · 本周食谱与替餐</h1>
      </div>
      <div class="print-meta">
        <span>{{ rangeLabel() }} · {{ formatWeekNumber(week) }}</span>
        <span>数据更新：{{ updatedAt }}</span>
      </div>
    </header>

    <template v-if="days.length > 0">
      <table class="print-menu-table">
        <colgroup>
          <col style="width: 8%" />
          <col v-for="date in menuDates" :key="date" style="width: 18.4%" />
        </colgroup>
        <thead>
          <tr>
            <th>餐次</th>
            <th v-for="date in menuDates" :key="date">
              {{ weekdayLong(date) }}<br /><span class="print-date">{{ shortDate(date) }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="mealRow in mealRows" :key="mealRow.period">
            <th class="print-meal-label">{{ mealRow.label }}</th>
            <td v-for="date in menuDates" :key="date">
              <template v-if="dishesFor(date, mealRow.period).length > 0">
                <p
                  v-for="dish in dishesFor(date, mealRow.period)"
                  :key="dish.name"
                  class="print-dish"
                  :class="{ 'print-risk': dish.riskAllergens.length > 0 }"
                >
                  {{ dish.name }}<template v-if="dish.substituteSource === 'dish' && dish.recommendation[0]">（{{ dish.recommendation[0] }}）</template>
                </p>
              </template>
              <span v-else class="print-empty-cell">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </template>

    <p v-else class="print-empty">本周还没有食谱数据。</p>

    <section class="print-supplement">
      <div class="print-section-heading">
        <h2>每日补剂（周一至周日，逐日勾选）</h2>
        <span>一周 5 天食谱 · 7 天补剂</span>
      </div>
      <table class="print-supplement-table">
        <colgroup>
          <col style="width: 16%" />
          <col v-for="date in dates" :key="date" style="width: 12%" />
        </colgroup>
        <thead>
          <tr>
            <th>补剂</th>
            <th v-for="date in dates" :key="date">
              {{ weekdayLong(date) }}<br /><span class="print-date">{{ shortDate(date) }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in supplements" :key="item">
            <th>{{ item }}</th>
            <td v-for="date in dates" :key="date">□</td>
          </tr>
        </tbody>
      </table>
    </section>

    <p class="print-footnote">
      说明：红色为含登记过敏原的菜品，括号内为已确认替餐；未标注替餐的请与幼儿园确认。补剂请在对应日期勾选。
    </p>
  </section>
</template>
