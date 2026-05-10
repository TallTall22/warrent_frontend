<script setup lang="ts">
import { RecycleScroller } from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import { useWarrantStore } from '@/stores/warrant'
import WarrantListItem from '@/components/WarrantListItem.vue'

const store = useWarrantStore()

function handleSearch(value: string): void {
  store.setSearchKeyword(value)
}
</script>

<template>
  <a-layout-sider
    class="overflow-hidden border-r border-gray-200"
    :width="288"
    theme="light"
  >
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

      <div v-if="store.isLoadingWarrants" class="flex items-center justify-center flex-1">
        <a-spin tip="載入中…" />
      </div>

      <a-empty
        v-else-if="store.filteredWarrants.length === 0"
        description="沒有符合條件的權證"
        class="py-12"
      />

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
          @select="store.selectWarrant(item)"
        />
      </RecycleScroller>

      <div class="pt-2 text-xs text-gray-400 text-right border-t border-gray-100">
        共 {{ store.filteredWarrants.length }} 筆
      </div>
    </div>
  </a-layout-sider>
</template>
