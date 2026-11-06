<script setup lang="ts">
import { MEAL_TIMES, type MenuDish, type MenuMeal } from '../types'
import RiskBadge from './RiskBadge.vue'

defineProps<{
  meal: MenuMeal
}>()

const emit = defineEmits<{
  trace: [dish: MenuDish, meal: MenuMeal]
}>()
</script>

<template>
  <article class="meal-row">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div class="flex items-start gap-3">
        <div class="time-chip">
          <span class="text-[0.6rem] font-bold uppercase tracking-wider">TIME</span>
          <span class="mt-0.5 text-sm font-bold tabular-nums">{{ MEAL_TIMES[meal.mealPeriod] }}</span>
        </div>
        <div>
          <h3 class="text-lg font-bold leading-tight text-ink">{{ meal.mealLabel }}</h3>
          <p class="mt-1 text-xs text-ink-faint">{{ meal.dishes.length }} 道 · 当天食谱</p>
        </div>
      </div>

      <span
        v-if="meal.hasRisk"
        class="tag bg-berry-50 text-berry-700 ring-1 ring-inset ring-berry-200"
      >
        需替餐 {{ meal.riskDishCount }} 道
      </span>
      <span v-else class="tag bg-leaf-50 text-leaf-700 ring-1 ring-inset ring-leaf-200">
        <span class="h-1.5 w-1.5 rounded-full bg-leaf-500" aria-hidden="true"></span>
        本餐安全
      </span>
    </header>

    <div class="mt-4 divide-y divide-ink/[0.06] border-t border-ink/[0.06]">
      <div
        v-for="(dish, index) in meal.dishes"
        :key="`${dish.name}-${index}`"
        class="grid gap-3 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
      >
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <h4 class="text-[0.98rem] font-semibold leading-6 text-ink">{{ dish.name }}</h4>
            <RiskBadge :allergen-names="dish.allergenNames" compact />
          </div>

          <p class="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs leading-5 text-ink-muted">
            <span class="font-medium text-ink-faint">食材</span>
            <span
              v-for="ingredient in dish.ingredients"
              :key="ingredient"
              class="rounded-md bg-ink/[0.04] px-1.5 py-0.5"
            >
              {{ ingredient }}
            </span>
          </p>

          <div
            v-if="dish.riskAllergens.length > 0"
            class="mt-2.5 rounded-xl border px-3 py-2.5"
            :class="
              dish.recommendation.length > 0
                ? 'border-honey-100 bg-honey-50/65'
                : 'border-berry-100 bg-berry-50/65'
            "
          >
            <p class="text-[0.68rem] font-bold tracking-wide text-honey-700">
              替餐建议
              <span class="ml-1 font-medium text-ink-faint">
                {{ dish.substituteSource === 'dish' ? '菜品专属' : '动态替餐库' }}
              </span>
            </p>
            <p
              v-if="dish.recommendation.length > 0"
              class="mt-1 text-sm font-semibold leading-5 text-ink"
            >
              {{ dish.recommendation.join('、') }}
            </p>
            <p v-else class="mt-1 text-sm font-medium leading-5 text-berry-700">
              暂无推荐替餐，请与幼儿园确认。
            </p>
            <p v-if="dish.substituteTags.length > 0" class="mt-1 text-[0.68rem] leading-4 text-ink-faint">
              {{ dish.substituteTags.join(' · ') }}
            </p>
          </div>
        </div>

        <button
          type="button"
          class="btn btn-ghost h-9 min-h-0 self-start px-2.5 text-xs"
          :aria-label="`查看${dish.name}的食材与来源`"
          @click="emit('trace', dish, meal)"
        >
          <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M2.5 8s2-3.5 5.5-3.5S13.5 8 13.5 8s-2 3.5-5.5 3.5S2.5 8 2.5 8Z"
              stroke="currentColor"
              stroke-width="1.3"
            />
            <circle cx="8" cy="8" r="1.6" stroke="currentColor" stroke-width="1.3" />
          </svg>
          溯源
        </button>
      </div>
    </div>

    <div
      v-if="!meal.hasRisk"
      class="mt-3 flex items-start gap-2 rounded-xl border border-leaf-100 bg-leaf-50/70 px-3 py-2.5 text-sm font-medium text-leaf-700"
    >
      <span class="mt-0.5">✓</span>
      本餐对乐乐安全，无需替换。
    </div>

    <div
      v-if="meal.audit.length > 0"
      class="mt-3 rounded-xl border border-honey-100 bg-honey-50/60 px-3 py-2.5"
    >
      <p class="text-[0.68rem] font-bold tracking-wide text-honey-700">搭配审核</p>
      <ul class="mt-1 space-y-0.5 text-xs leading-5 text-ink-muted">
        <li v-for="item in meal.audit" :key="item">· {{ item }}</li>
      </ul>
    </div>

    <p v-if="meal.notes.length > 0" class="mt-3 text-xs leading-5 text-ink-faint">
      {{ meal.notes.join(' · ') }}
    </p>
  </article>
</template>
