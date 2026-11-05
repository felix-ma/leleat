<script setup lang="ts">
import type { ImagePreview, MenuDay } from '../types'
import MealCard from './MealCard.vue'

defineProps<{
  days: MenuDay[]
}>()

const emit = defineEmits<{
  preview: [image: ImagePreview]
}>()
</script>

<template>
  <section aria-labelledby="week-menu-title">
    <div class="mb-4 flex items-end justify-between gap-4">
      <div>
        <p class="eyebrow">Weekly menu</p>
        <h2 id="week-menu-title" class="mt-1 font-display text-2xl font-semibold text-ink">
          逐日食谱
        </h2>
      </div>
      <p v-if="days.length > 0" class="pb-1 text-xs text-ink-faint">
        共 {{ days.length }} 天 · 点击图片可查看原图
      </p>
    </div>

    <div v-if="days.length > 0" class="space-y-5">
      <article
        v-for="day in days"
        :key="day.date"
        class="card overflow-hidden"
      >
        <header
          class="flex flex-wrap items-center justify-between gap-3 border-b border-ink/[0.06] bg-white/45 px-4 py-4 sm:px-6"
        >
          <div class="flex items-center gap-3.5">
            <div
              class="flex h-12 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-ink text-white"
            >
              <span class="text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-white/60">
                {{ day.weekdayLabel }}
              </span>
              <span class="mt-0.5 text-[0.7rem] font-bold leading-none">{{ day.dateLabel }}</span>
            </div>
            <div>
              <h2 class="text-lg font-bold text-ink">{{ day.weekdayLabel }}食谱</h2>
              <p class="mt-0.5 text-xs text-ink-faint">
                {{ day.meals.length }} 个餐次 · {{ day.riskDishCount }} 道需替餐
              </p>
            </div>
          </div>

          <span
            v-if="day.hasRisk"
            class="tag bg-berry-50 text-berry-700 ring-1 ring-inset ring-berry-200"
          >
            需替餐 {{ day.riskDishCount }} 道
          </span>
          <span
            v-else
            class="tag bg-leaf-50 text-leaf-700 ring-1 ring-inset ring-leaf-200"
          >
            <span class="h-1.5 w-1.5 rounded-full bg-leaf-500" aria-hidden="true"></span>
            全天安全
          </span>
        </header>

        <div class="divide-y divide-ink/[0.06]">
          <MealCard
            v-for="meal in day.meals"
            :key="meal.key"
            :meal="meal"
            @preview="emit('preview', $event)"
          />
        </div>
      </article>
    </div>

    <div
      v-else
      class="card flex flex-col items-center justify-center px-6 py-16 text-center"
    >
      <span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-leaf-50 text-leaf-600">
        <svg class="h-7 w-7" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M6 3.5v7a3 3 0 0 0 6 0v-7M9 3.5v17M17 3.5c-1.8 1.2-2.6 3.1-2.6 5.5 0 1.8.8 2.8 2.6 2.8H18v8.7"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </span>
      <h2 class="mt-4 text-lg font-bold text-ink">这一周还没有可展示的食谱</h2>
      <p class="mt-1.5 max-w-sm text-sm leading-6 text-ink-muted">
        可以切换到其他周，或请负责录入的 Agent 补充该周数据后再查看。
      </p>
    </div>
  </section>
</template>
