<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { DishTraceTarget, ImagePreview, IngredientIndex, IngredientRecord } from '../types'
import { formatMonthDay } from '../utils/date'
import { loadIngredientIndex } from '../utils/dataLoader'
import RiskBadge from './RiskBadge.vue'

const props = defineProps<{
  target: DishTraceTarget | null
}>()

const emit = defineEmits<{
  close: []
  preview: [image: ImagePreview]
}>()

/**
 * 同名菜有多种配方时，说明这道菜用的是哪一版、全库还有几版。
 * 用当前这道菜的食材与「最近一次出现」的变体比对，不一致就提示配方不同。
 */
const variantNote = computed(() => {
  const knowledge = props.target?.knowledge
  if (!knowledge?.variants || knowledge.variants.length < 2) return ''
  const dish = props.target?.dish
  if (!dish) return ''

  const current = dish.variantId
    ? knowledge.variants.find((variant) => variant.variantId === dish.variantId)
    : knowledge.variants.find(
        (variant) =>
          variant.variantId.includes(dish.name) ||
          variant.ingredients.join('/') === dish.ingredients.join('/'),
      )
  const others = knowledge.variants
    .filter((variant) => variant.variantId !== current?.variantId)
    .map((variant) => variant.ingredients.join('、'))

  if (!current) return `这道菜有 ${knowledge.variants.length} 种配方记录，本次配方与历史记录不同。`
  return `同名菜共 ${knowledge.variants.length} 种配方；本次为「${current.ingredients.join('、')}」，另有 ${others.join(' / ')}。`
})

/** 主配方的口径说明：库里以哪一版为准，以及它是不是最近一次。 */
const primaryNote = computed(() => {
  const knowledge = props.target?.knowledge
  if (!knowledge?.variants || knowledge.variants.length < 2) return ''
  const primary =
    knowledge.variants.find((variant) => variant.variantId === knowledge.primaryVariantId) ??
    knowledge.variants[0]
  if (!primary) return ''
  const basis =
    knowledge.primaryBasis === 'manual'
      ? '人工指定'
      : knowledge.primaryBasis === 'frequency'
        ? '出现次数最多'
        : '最近一次出现'
  return `库内主配方（${basis}）：${primary.ingredients.join('、')}${primary.lastSeen ? `，最近 ${primary.lastSeen}` : ''}`
})

const closeButton = ref<HTMLButtonElement | null>(null)

/**
 * 食材反查：点开某道菜时懒加载 ingredient-index.json（首屏不加载），
 * 给每个食材标注全库命中次数，可展开看命中的菜名与日期。
 */
const ingredientIndex = ref<IngredientIndex | null>(null)
const ingredientIndexPending = ref(false)
const activeIngredient = ref<string | null>(null)

/** 食材写法 → 索引里的规范食材记录（forms 含该写法即可）。 */
const ingredientLookup = computed(() => {
  const lookup = new Map<string, IngredientRecord>()
  const index = ingredientIndex.value
  if (!index) return lookup
  for (const [canonical, record] of Object.entries(index.ingredients)) {
    lookup.set(canonical, record)
    for (const form of record.forms ?? []) lookup.set(form, record)
  }
  return lookup
})

function recordFor(ingredient: string): IngredientRecord | null {
  return ingredientLookup.value.get(ingredient) ?? null
}

function hitCountLabel(ingredient: string): string {
  const record = recordFor(ingredient)
  if (!record) return ''
  const dishCount = new Set(record.hits.map((hit) => hit.dish)).size
  return `${record.hits.length} 次 · ${dishCount} 道菜`
}

const activeIngredientRecord = computed(() =>
  activeIngredient.value ? recordFor(activeIngredient.value) : null,
)

const activeIngredientHits = computed(() => {
  const record = activeIngredientRecord.value
  if (!record) return []
  return [...record.hits]
    .sort((left, right) => (left.date < right.date ? 1 : left.date > right.date ? -1 : 0))
    .slice(0, 12)
})

function toggleIngredient(ingredient: string): void {
  activeIngredient.value = activeIngredient.value === ingredient ? null : ingredient
}

watch(
  () => props.target,
  async (target) => {
    if (!target) return
    activeIngredient.value = null
    if (!ingredientIndex.value && !ingredientIndexPending.value) {
      ingredientIndexPending.value = true
      ingredientIndex.value = await loadIngredientIndex()
      ingredientIndexPending.value = false
    }
    await nextTick()
    closeButton.value?.focus()
  },
)
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="target"
        class="screen-only fixed inset-0 z-50 flex items-end justify-center bg-ink/70 p-0 backdrop-blur-sm sm:items-center sm:p-5"
        @click.self="emit('close')"
      >
        <div
          class="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-card p-5 shadow-2xl sm:rounded-3xl sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="trace-title"
        >
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="eyebrow">{{ formatMonthDay(target.date) }} · {{ target.mealLabel }} {{ target.mealTime }}</p>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <h2 id="trace-title" class="font-display text-2xl font-semibold text-ink">
                  {{ target.dish.name }}
                </h2>
                <RiskBadge :allergen-names="target.dish.allergenNames" compact />
              </div>
            </div>
            <button
              ref="closeButton"
              type="button"
              class="icon-btn"
              aria-label="关闭食材溯源"
              @click="emit('close')"
            >
              <svg class="h-5 w-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              </svg>
            </button>
          </div>

          <div class="mt-5 grid gap-4 sm:grid-cols-2">
            <section class="detail-block">
              <p class="eyebrow">Ingredients · 识别食材</p>
              <div class="mt-3 flex flex-wrap gap-1.5">
                <button
                  v-for="ingredient in target.dish.ingredients"
                  :key="ingredient"
                  type="button"
                  class="ingredient-pill transition hover:bg-ink/10"
                  :class="activeIngredient === ingredient ? 'bg-ink/10 text-ink' : ''"
                  @click="toggleIngredient(ingredient)"
                >
                  {{ ingredient }}
                  <span v-if="recordFor(ingredient)" class="ml-1 text-[0.65rem] text-ink-faint">
                    {{ recordFor(ingredient)?.hits.length }}次
                  </span>
                </button>
              </div>
              <p v-if="activeIngredientRecord" class="mt-2 rounded-lg bg-ink/[0.04] px-2 py-1.5 text-[0.7rem] leading-5 text-ink-muted">
                <span class="font-semibold text-ink">{{ activeIngredient }}</span>
                ·全库 {{ hitCountLabel(activeIngredient ?? '') }}
                <span v-for="hit in activeIngredientHits" :key="`${hit.dish}-${hit.date}-${hit.mealPeriod}`" class="mt-1 block">
                  {{ formatMonthDay(hit.date) }} · {{ hit.dish }}<span v-if="hit.form && hit.form !== activeIngredient">（{{ hit.form }}）</span>
                </span>
              </p>
              <p class="mt-3 text-[0.7rem] leading-5 text-ink-faint">
                来自该周食谱的识别记录，未展示未登记的隐藏配料。
              </p>
            </section>

            <section class="detail-block">
              <p class="eyebrow">Knowledge · 菜品库</p>
              <template v-if="target.knowledge">
                <div class="mt-3 flex items-center gap-2 text-sm font-semibold text-leaf-700">
                  <span class="h-1.5 w-1.5 rounded-full bg-leaf-500"></span>
                  已收录，第 {{ target.knowledge.occurrences.length }} 次出现
                </div>
                <p class="mt-2 text-xs leading-5 text-ink-muted">
                  首次：{{ target.knowledge.firstSeen }}<br />
                  最近：{{ target.knowledge.lastSeen }}
                </p>
                <p v-if="target.knowledge.aliases.length > 0" class="mt-2 text-xs text-ink-faint">
                  别名：{{ target.knowledge.aliases.join('、') }}
                </p>
                <p v-if="variantNote" class="mt-2 rounded-lg bg-honey-50 px-2 py-1.5 text-xs leading-5 text-honey-700">
                  {{ variantNote }}
                  <span v-if="primaryNote" class="mt-1 block text-honey-700/80">{{ primaryNote }}</span>
                </p>
              </template>
              <p v-else class="mt-3 text-sm leading-6 text-ink-muted">
                这道菜尚未进入菜品知识库，下一次识别到同名菜品时会自动复用食材记录。
              </p>
            </section>
          </div>

          <section v-if="target.dish.riskAllergens.length > 0" class="mt-4 rounded-2xl border border-honey-100 bg-honey-50/60 p-4">
            <p class="eyebrow text-honey-700">Replacement · 替餐建议</p>
            <p class="mt-2 text-sm font-semibold leading-6 text-ink">
              {{ target.dish.recommendation.join('、') || '暂无推荐替餐，请与幼儿园确认。' }}
            </p>
            <p class="mt-1 text-xs text-ink-faint">
              {{
                target.dish.substituteSource === 'dish'
                  ? '来自菜品专属替餐'
                  : '来自动态替餐库'
              }}
            </p>
            <p v-if="target.dish.substituteTags.length > 0" class="mt-1 text-xs text-honey-700">
              {{ target.dish.substituteTags.join(' · ') }}
            </p>
            <p v-if="target.dish.substituteMethod" class="mt-2 text-xs leading-5 text-ink-muted">
              <span class="font-semibold text-ink">在家做法：</span>{{ target.dish.substituteMethod }}
            </p>
          </section>

          <section class="mt-4">
            <div class="flex items-center justify-between gap-3">
              <p class="eyebrow">Source · 原图</p>
              <span class="text-xs text-ink-faint">{{ target.images.length }} 张</span>
            </div>
            <div v-if="target.images.length > 0" class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <button
                v-for="image in target.images"
                :key="image.src"
                type="button"
                class="group relative aspect-[4/3] overflow-hidden rounded-xl border border-ink/10 bg-cream"
                :aria-label="`查看${image.alt}`"
                @click="emit('preview', image)"
              >
                <img
                  :src="image.src"
                  :alt="image.alt"
                  class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  loading="lazy"
                />
                <span class="absolute inset-x-0 bottom-0 bg-ink/65 py-1 text-[0.6rem] font-medium text-white">
                  点击查看原图
                </span>
              </button>
            </div>
            <p v-else class="mt-2 rounded-xl bg-ink/[0.035] px-3 py-2 text-xs text-ink-faint">
              这条记录暂无原图。
            </p>
          </section>

          <p v-if="target.note" class="mt-4 text-xs leading-5 text-ink-muted">{{ target.note }}</p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
