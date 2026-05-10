<script setup lang="ts">
import { computed } from 'vue'
import type { ColumnType } from 'ant-design-vue/es/table'
import { useWarrantStore } from '@/stores/warrant'
import type { TrialLog } from '@/types/warrant'

const store = useWarrantStore()

/** 格式化 ISO 8601 時間為本地時間字串 */
const formatTime = (iso: string): string => {
  const date = new Date(iso)
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

/** 格式化 4 位小數金融數值 */
const formatPrice = (val: number): string =>
  new Intl.NumberFormat('zh-TW', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(val)

/** 格式化 2 位小數張數 */
const formatQty = (val: number): string =>
  new Intl.NumberFormat('zh-TW', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val)

const columns = computed<ColumnType<TrialLog>[]>(() => [
  {
    title: '存檔時間',
    dataIndex: 'createdTime',
    key: 'createdTime',
    width: 180,
    customRender: ({ value }: { value: string }) => formatTime(value),
  },
  {
    title: '標的股價（元）',
    dataIndex: 'marketPrice',
    key: 'marketPrice',
    align: 'right',
    customRender: ({ value }: { value: number }) => formatPrice(value),
  },
  {
    title: '理論價值（元）',
    dataIndex: 'theoryPrice',
    key: 'theoryPrice',
    align: 'right',
    customRender: ({ value }: { value: number }) => formatPrice(value),
  },
  {
    title: '建議避險張數',
    dataIndex: 'hedgeQty',
    key: 'hedgeQty',
    align: 'right',
    customRender: ({ value }: { value: number }) => formatQty(value),
  },
])
</script>

<template>
  <a-card :bordered="false" class="shadow-sm">
    <template #title>
      <div class="flex items-center justify-between">
        <span class="font-semibold text-gray-800">歷史明細（最近 10 筆）</span>
        <a-spin v-if="store.isLoadingTrialLogs" size="small" />
      </div>
    </template>

    <a-table
      :columns="columns"
      :data-source="store.trialLogs"
      :pagination="false"
      :scroll="{ y: 240 }"
      :loading="store.isLoadingTrialLogs"
      row-key="logId"
      size="small"
      class="mt-4"
    >
      <template #emptyText>
        <a-empty description="尚無試算記錄" class="py-12" />
      </template>
    </a-table>
  </a-card>
</template>
