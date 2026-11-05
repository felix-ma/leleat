<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ImagePreview, MenuMeal } from '../types'
import RiskBadge from './RiskBadge.vue'

const props = defineProps<{
  meal: MenuMeal
}>()

const emit = defineEmits<{
  preview: [image: ImagePreview]
}>()

const failedImages = ref<Record<string, boolean>>({})

const visibleImages = computed(() =>
  props.meal.images.filter((image) => !failedImages.value[image.src]),
)

function markImageFailed(src: string): void {
  failedImages.value = { ...failedImages.value, [src]: true }
}

function substituteLabel(source: MenuMeal['dishes'][number]['substituteSource']): string {
  if (source === 'dish') return '菜品专属'
  if (source === 'library') return '按过敏原推荐'
  return '待确认'
}
</script>

<template>
  <article
    class="px-4 py-5 sm:px-6"
    :class="meal.hasRisk ? 'bg-berry-50/25' : 'bg-card'"
  >
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <span
          class="flex h-9 w-9 items-center justify-center rounded-xl"
          :class="meal.hasRisk ? 'bg-berry-100 text-berry-700' : 'bg-leaf-100 text-leaf-700'"
          aria-hidden="true"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none">
            <path
              d="M4.5 10.5h15M7.5 10.5a4.5 4.5 0 0 0 9 0M12 3.5v2M4 18.5h16"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>
        <div>
          <h3 class="text-base font-bold tracking-wide text-ink">{{ meal.mealLabel }}</h3>
          <p class="mt-0.5 text-xs text-ink-faint">{{ meal.dishes.length }} 道菜品</p>
        </div>
      </div>

      <span
        v-if="meal.hasRisk"
        class="tag bg-berry-50 text-berry-700 ring-1 ring-inset ring-berry-200"
      >
        需替餐 {{ meal.riskDishCount }} 道
      </span>
      <span
        v-else
        class="tag bg-leaf-50 text-leaf-700 ring-1 ring-inset ring-leaf-200"
      >
        <span class="h-1.5 w-1.5 rounded-full bg-leaf-500" aria-hidden="true"></span>
        本餐安全
      </span>
    </header>

    <ul class="mt-4 space-y-3">
      <li
        v-for="(dish, index) in meal.dishes"
        :key="`${dish.name}-${index}`"
        class="rounded-2xl border p-4"
        :class="
          dish.riskAllergens.length > 0
            ? 'border-berry-100 bg-white/80'
            : 'border-ink/[0.06] bg-white/45'
        "
      >
        <div class="flex flex-wrap items-start justify-between gap-2">
          <h4 class="text-[0.98rem] font-semibold leading-6 text-ink">{{ dish.name }}</h4>
          <div class="flex flex-wrap items-center gap-1.5">
            <RiskBadge :allergen-names="dish.allergenNames" compact />
          </div>
        </div>

        <div class="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5 text-ink-muted">
          <span class="font-semibold text-ink-faint">食材</span>
          <span
            v-for="ingredient in dish.ingredients"
            :key="ingredient"
            class="rounded-md bg-ink/[0.045] px-1.5 py-0.5"
          >
            {{ ingredient }}
          </span>
        </div>

        <div
          v-if="dish.riskAllergens.length > 0"
          class="mt-3 rounded-xl border px-3.5 py-3"
          :class="
            dish.recommendation.length > 0
              ? 'border-honey-100 bg-honey-50/70'
              : 'border-berry-100 bg-berry-50/70'
          "
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-xs font-bold tracking-wide text-honey-700">替餐建议</span>
            <span
              class="rounded-full bg-white/70 px-2 py-0.5 text-[0.68rem] font-medium text-ink-faint"
            >
              {{ substituteLabel(dish.substituteSource) }}
            </span>
          </div>
          <p
            v-if="dish.recommendation.length > 0"
            class="mt-1.5 text-sm font-semibold leading-6 text-ink"
          >
            {{ dish.recommendation.join('、') }}
          </p>
          <p v-else class="mt-1.5 text-sm font-medium leading-6 text-berry-700">
            暂无推荐替餐，请与幼儿园确认。
          </p>
        </div>

        <p v-else class="mt-3 text-xs text-leaf-700">
          本菜品未登记过敏原。
        </p>
      </li>
    </ul>

    <div
      v-if="!meal.hasRisk"
      class="mt-4 flex items-start gap-2.5 rounded-xl border border-leaf-100 bg-leaf-50/80 px-3.5 py-3 text-sm font-medium text-leaf-700"
    >
      <svg class="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path
          d="m4 10.4 3.7 3.7L16 5.8"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      本餐对乐乐安全，无需替换。
    </div>

    <footer
      v-if="visibleImages.length > 0 || meal.notes.length > 0"
      class="mt-4 flex flex-col gap-3 border-t border-ink/[0.06] pt-3.5"
    >
      <div v-if="visibleImages.length > 0" class="flex flex-wrap items-center gap-2.5">
        <span class="text-xs font-semibold text-ink-faint">食谱原图</span>
        <button
          v-for="image in visibleImages"
          :key="image.src"
          type="button"
          class="group relative h-16 w-24 overflow-hidden rounded-xl border border-ink/10 bg-cream"
          :aria-label="`查看${image.alt}`"
          @click="emit('preview', image)"
        >
          <img
            :src="image.src"
            :alt="image.alt"
            class="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
            loading="lazy"
            decoding="async"
            @error="markImageFailed(image.src)"
          />
          <span
            class="absolute inset-x-0 bottom-0 bg-ink/75 py-1 text-center text-[0.62rem] font-semibold tracking-wide text-white opacity-0 transition group-hover:opacity-100"
          >
            查看原图
          </span>
        </button>
      </div>

      <ul v-if="meal.notes.length > 0" class="space-y-1">
        <li
          v-for="note in meal.notes"
          :key="note"
          class="flex items-start gap-2 text-xs leading-5 text-ink-muted"
        >
          <svg class="mt-0.5 h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12Z"
              stroke="currentColor"
              stroke-width="1.3"
            />
            <path d="M8 7.2v3.2M8 5.1v.1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
          {{ note }}
        </li>
      </ul>
    </footer>
  </article>
</template>
