<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useWarrantStore } from '@/stores/warrant'
import WarrantSider from '@/components/WarrantSider.vue'
import SiderContent from '@/components/SiderContent.vue'
import CalculatorPanel from '@/components/CalculatorPanel.vue'
import HistoryTable from '@/components/HistoryTable.vue'

const store = useWarrantStore()

/** 小螢幕 Drawer 開關狀態 */
const drawerVisible = ref(false)

function openDrawer(): void {
  drawerVisible.value = true
}

function closeDrawer(): void {
  drawerVisible.value = false
}

onMounted(() => {
  store.fetchWarrants()
})
</script>

<template>
  <a-layout class="h-screen">
    <!-- 桌面版側欄（≥ lg）：由 WarrantSider 自身以 hidden lg:flex 控制 -->
    <WarrantSider />

    <a-layout-content class="flex flex-col min-w-0 overflow-auto bg-gray-50">
      <!--
        小螢幕頁首（< lg）：漢堡按鈕 + 系統標題
        桌面（≥ lg）：隱藏
      -->
      <div class="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 shrink-0">
        <button
          class="flex flex-col justify-center gap-[5px] w-8 h-8 p-1 rounded hover:bg-gray-100 border-none outline-none bg-transparent cursor-pointer"
          aria-label="開啟權證清單"
          @click="openDrawer"
        >
          <span class="block h-0.5 bg-gray-700 rounded" />
          <span class="block h-0.5 bg-gray-700 rounded" />
          <span class="block h-0.5 bg-gray-700 rounded" />
        </button>
        <span class="text-sm font-medium text-gray-700">權證避險試算系統</span>
        <span v-if="store.selectedWarrant" class="text-sm text-gray-400">
          — {{ store.selectedWarrant.warrantId }}
        </span>
      </div>

      <!-- 主要內容區 -->
      <div class="flex-1 overflow-auto p-4 lg:p-6">
        <div v-if="store.selectedWarrant" class="flex flex-col gap-6 max-w-3xl mx-auto">
          <CalculatorPanel />
          <HistoryTable />
        </div>
        <div v-else class="flex items-center justify-center h-full">
          <a-empty description="請從左側選擇一個權證" />
        </div>
      </div>
    </a-layout-content>
  </a-layout>

  <!--
    小螢幕側欄 Drawer（< lg）
    點選權證後自動關閉（SiderContent emit warrant-selected 事件）
  -->
  <a-drawer
    :open="drawerVisible"
    placement="left"
    :width="288"
    :closable="true"
    title="權證清單"
    :body-style="{ padding: 0, height: '100%', display: 'flex', flexDirection: 'column' }"
    @close="closeDrawer"
  >
    <SiderContent @warrant-selected="closeDrawer" />
  </a-drawer>
</template>
