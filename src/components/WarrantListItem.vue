<script setup lang="ts">
import type { Warrant } from '@/types/warrant'

const props = defineProps<{
  warrant: Warrant
  isSelected: boolean
}>()

const emit = defineEmits<{
  'select': []
}>()

const formatStrikePrice = (val: number): string =>
  new Intl.NumberFormat('zh-TW', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(val)
</script>

<template>
  <!--
    A11Y-01: role="option" (not "button") is correct for a selectable item
    inside a role="listbox" parent. aria-selected is valid on role="option".
    tabindex="0" makes it keyboard-focusable; Enter/Space trigger selection.
  -->
  <div
    class="flex items-center gap-2 px-3 cursor-pointer rounded-md transition-colors"
    :class="[
      props.isSelected
        ? 'bg-blue-50 border-l-2 border-blue-500'
        : 'hover:bg-gray-50 border-l-2 border-transparent',
    ]"
    style="height: 56px;"
    role="option"
    :aria-selected="props.isSelected"
    :tabindex="props.isSelected ? 0 : -1"
    @click="emit('select')"
    @keydown.enter.space.prevent="emit('select')"
  >
    <div class="flex flex-col flex-1 min-w-0">
      <span
        class="text-sm font-semibold truncate"
        :class="props.isSelected ? 'text-blue-700' : 'text-gray-800'"
      >
        {{ props.warrant.warrantId }}
      </span>
      <span class="text-xs text-gray-400">
        履約價 {{ formatStrikePrice(props.warrant.strikePrice) }}
      </span>
    </div>
    <a-tag
      :color="props.warrant.warrantType === 'CALL' ? 'green' : 'red'"
      class="shrink-0"
    >
      {{ props.warrant.warrantType }}
    </a-tag>
  </div>
</template>
