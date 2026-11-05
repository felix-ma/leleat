<script setup lang="ts">
import type { CalendarDayCell } from '../types'

defineProps<{
  days: CalendarDayCell[]
}>()

const emit = defineEmits<{
  select: [date: string]
}>()
</script>

<template>
  <div class="grid grid-cols-7 gap-1.5 rounded-2xl border border-ink/[0.07] bg-white/60 p-1.5">
    <button
      v-for="day in days"
      :key="day.date"
      type="button"
      class="group relative flex min-w-0 flex-col items-center rounded-xl px-1 py-2.5 transition"
      :class="[
        day.isSelected
          ? 'bg-ink text-white shadow-sm'
          : 'text-ink hover:bg-ink/[0.045]',
        day.isWeekend && !day.isSelected ? 'opacity-60' : '',
      ]"
      :aria-label="`${day.monthDay} ${day.weekday}${day.hasMenu ? `，${day.riskDishCount} 道需替餐` : '，无食谱'}`"
      :aria-current="day.isSelected ? 'date' : undefined"
      @click="emit('select', day.date)"
    >
      <span
        class="text-[0.62rem] font-semibold tracking-wider"
        :class="day.isSelected ? 'text-white/60' : 'text-ink-faint'"
      >
        {{ day.weekday }}
      </span>
      <span class="mt-1 text-sm font-bold leading-none">{{ day.dayNumber }}</span>
      <span class="mt-1.5 flex h-1.5 items-center justify-center">
        <span
          v-if="day.riskDishCount > 0"
          class="h-1.5 w-1.5 rounded-full"
          :class="day.isSelected ? 'bg-berry-200' : 'bg-berry-500'"
        ></span>
        <span
          v-else-if="day.hasMenu"
          class="h-1.5 w-1.5 rounded-full"
          :class="day.isSelected ? 'bg-leaf-200' : 'bg-leaf-500'"
        ></span>
      </span>
      <span
        v-if="day.isToday"
        class="absolute right-1.5 top-1.5 h-1 w-1 rounded-full"
        :class="day.isSelected ? 'bg-white' : 'bg-honey-600'"
        aria-hidden="true"
      ></span>
    </button>
  </div>
</template>
