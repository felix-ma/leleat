<script setup lang="ts">
withDefaults(
  defineProps<{
    allergenNames: string[]
    compact?: boolean
  }>(),
  { compact: false },
)
</script>

<template>
  <span
    v-if="allergenNames.length === 0"
    class="tag bg-leaf-50 text-leaf-700 ring-1 ring-inset ring-leaf-200"
    :class="compact ? 'px-2 py-0.5' : ''"
  >
    <svg class="h-3 w-3" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="m3.2 8.4 3 3.1 6.6-7"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
    安全
  </span>

  <span
    v-for="name in allergenNames"
    :key="name"
    class="tag bg-berry-50 text-berry-700 ring-1 ring-inset ring-berry-200"
    :class="compact ? 'px-2 py-0.5' : ''"
  >
    <svg class="h-3 w-3" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.2" stroke="currentColor" stroke-width="1.4" />
      <path d="M8 4.8v3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      <circle cx="8" cy="11.1" r="0.85" fill="currentColor" />
    </svg>
    含{{ name }}
  </span>
</template>
