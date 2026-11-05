<script setup lang="ts">
import { computed } from 'vue'
import type { ImagePreview, MenuDay, MenuDish, MenuMeal, MenuImage } from '../types'
import { formatMonthDay, formatWeekNumber, weekdayLong } from '../utils/date'
import MealCard from './MealCard.vue'

const props = defineProps<{
  date: string
  week: string
  day: MenuDay | null
  images: MenuImage[]
  isToday: boolean
}>()

const emit = defineEmits<{
  trace: [dish: MenuDish, meal: MenuMeal]
  preview: [image: ImagePreview]
  latest: []
}>()

const riskDishCount = computed(() => props.day?.riskDishCount ?? 0)
const mealCount = computed(() => props.day?.meals.length ?? 0)
const safeMealCount = computed(
  () => props.day?.meals.filter((meal) => !meal.hasRisk).length ?? 0,
)
</script>

<template>
  <section aria-labelledby="day-title">
    <div class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div class="flex flex-wrap items-center gap-2">
          <p class="eyebrow">{{ week }} · Day</p>
          <span v-if="isToday" class="tag bg-honey-50 text-honey-700 ring-1 ring-inset ring-honey-100">
            今天
          </span>
        </div>
        <h2 id="day-title" class="mt-2 font-display text-3xl font-semibold text-ink sm:text-4xl">
          {{ formatMonthDay(date) }}
          <span class="ml-1 text-xl font-normal text-ink-muted sm:text-2xl">{{ weekdayLong(date) }}</span>
        </h2>
        <p class="mt-2 text-sm leading-6 text-ink-muted">
          <template v-if="day">
            {{ mealCount }} 个餐次 · {{ riskDishCount }} 道需替餐 · {{ safeMealCount }} 餐安全
          </template>
          <template v-else>这一天没有登记食谱</template>
        </p>
      </div>

      <div v-if="day" class="flex flex-wrap items-center gap-2">
        <span class="summary-chip">
          <span class="text-ink-faint">餐次</span>
          <strong>{{ mealCount }}</strong>
        </span>
        <span class="summary-chip" :class="riskDishCount > 0 ? 'border-berry-100 bg-berry-50/70' : ''">
          <span :class="riskDishCount > 0 ? 'text-berry-700' : 'text-ink-faint'">需替餐</span>
          <strong :class="riskDishCount > 0 ? 'text-berry-700' : ''">{{ riskDishCount }}</strong>
        </span>
        <button
          v-for="(image, index) in images"
          :key="image.src"
          type="button"
          class="group relative h-12 w-16 overflow-hidden rounded-xl border border-ink/10 bg-white"
          :aria-label="`查看${image.alt}`"
          @click="emit('preview', image)"
        >
          <img
            :src="image.src"
            :alt="image.alt"
            class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            loading="lazy"
          />
          <span
            class="absolute inset-0 flex items-center justify-center bg-ink/55 text-[0.6rem] font-semibold text-white opacity-0 transition group-hover:opacity-100"
          >
            原图{{ images.length > 1 ? ` ${index + 1}` : '' }}
          </span>
        </button>
        <span v-if="images.length > 0" class="sr-only">{{ formatWeekNumber(week) }} 当日食谱原图</span>
      </div>
    </div>

    <div v-if="day" class="mt-5 space-y-3.5">
      <MealCard
        v-for="meal in day.meals"
        :key="meal.key"
        :meal="meal"
        @trace="(dish, currentMeal) => emit('trace', dish, currentMeal)"
      />
    </div>

    <div v-else class="card mt-5 flex flex-col items-center px-6 py-14 text-center">
      <span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink/[0.045] text-ink-faint">
        <svg class="h-7 w-7" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M6.5 4.5h11a1 1 0 0 1 1 1v13.2l-3-2-3 2-3-2-3 2V5.5a1 1 0 0 1 1-1Z"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linejoin="round"
          />
          <path d="M8.5 8h7M8.5 11h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </span>
      <h3 class="mt-4 text-lg font-bold text-ink">这天还没有食谱</h3>
      <p class="mt-1.5 max-w-sm text-sm leading-6 text-ink-muted">
        幼儿园通常只登记周一到周五。可以切换到其他日期，或查看最近一次有食谱的一天。
      </p>
      <button type="button" class="btn btn-secondary mt-5" @click="emit('latest')">
        查看最近食谱
      </button>
    </div>
  </section>
</template>
