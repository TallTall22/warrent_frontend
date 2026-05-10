<script setup lang="ts">
import { RecycleScroller } from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import { useWarrantStore } from '@/stores/warrant'
import WarrantListItem from '@/components/WarrantListItem.vue'

const emit = defineEmits<{
  /** 點選任一權證後，通知父層關閉 Drawer（僅小螢幕有效） */
  'warrant-selected': []
}>()

const store = useWarrantStore()

function handleSearch(value: string): void {
  store.setSearchKeyword(value)
}

function handleSelectWarrant(warrant: Parameters<typeof store.selectWarrant>[0]): void {
  store.selectWarrant(warrant)
  emit('warrant-selected')
}
</script>

<template>
  <div class="flex flex-col h-full p-3">
    <div class="mb-1 px-1 text-xs text-gray-400 font-medium tracking-wide">
      權證避險試算系統
    </div>

    <a-input-search
      :value="store.searchKeyword"
      placeholder="搜尋權證代碼"
      class="mb-3 mt-1"
      allow-clear
      @update:value="handleSearch"
      @search="handleSearch"
    />

    <!-- 載入中 -->
    <div v-if="store.isLoadingWarrants" class="flex items-center justify-center flex-1">
      <a-spin tip="載入中…" />
    </div>

    <!-- 錯誤狀態 -->
    <div v-else-if="store.errorMessage" class="flex-1 flex flex-col justify-center px-1">
      <a-alert
        type="error"
        :message="store.errorMessage"
        show-icon
      />
      <a-button
        class="mt-3"
        size="small"
        @click="store.fetchWarrants()"
      >
        重新載入
      </a-button>
    </div>

    <!-- 空結果 -->
    <a-empty
      v-else-if="store.filteredWarrants.length === 0"
      description="沒有符合條件的權證"
      class="py-12"
    />

    <!-- 虛擬捲動清單 -->
    <RecycleScroller
      v-else
      class="flex-1 overflow-auto"
      :items="store.filteredWarrants"
      :item-size="56"
      key-field="warrantId"
      v-slot="{ item }"
    >
      <WarrantListItem
        :warrant="item"
        :is-selected="store.selectedWarrant?.warrantId === item.warrantId"
        @select="handleSelectWarrant(item)"
      />
    </RecycleScroller>

    <div class="pt-2 text-xs text-gray-400 text-right border-t border-gray-100">
      共 {{ store.filteredWarrants.length }} 筆
    </div>
  </div>
</template>
