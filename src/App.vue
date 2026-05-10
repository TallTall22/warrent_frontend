<script setup lang="ts">
import { onMounted } from 'vue'
import { useWarrantStore } from '@/stores/warrant'
import WarrantSider from '@/components/WarrantSider.vue'
import CalculatorPanel from '@/components/CalculatorPanel.vue'
import HistoryTable from '@/components/HistoryTable.vue'

const store = useWarrantStore()

onMounted(() => {
  store.fetchWarrants()
})
</script>

<template>
  <a-layout class="h-screen">
    <WarrantSider />
    <a-layout-content class="p-6 overflow-auto bg-gray-50">
      <div v-if="store.selectedWarrant" class="flex flex-col gap-6 max-w-3xl mx-auto">
        <CalculatorPanel />
        <HistoryTable />
      </div>
      <div v-else class="flex items-center justify-center h-full">
        <a-empty description="請從左側選擇一個權證" />
      </div>
    </a-layout-content>
  </a-layout>
</template>
