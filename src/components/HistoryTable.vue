<script setup lang="ts">
import type { ColumnType } from 'ant-design-vue/es/table'
import { useWarrantStore } from '@/stores/warrant'
import type { TrialLog } from '@/types/warrant'
import { formatPrice, formatQty } from '@/utils/formatters'

const store = useWarrantStore()

/** 格式化時間字串為台灣時間（UTC+8）
 *  後端回傳無時區後綴（e.g. "2026-05-10T18:30:00"），手動補上 +08:00 再解析，
 *  確保非 UTC+8 的使用者瀏覽器也能正確顯示台灣當地時間。
 */
const formatTime = (iso: string): string => {
  const hasOffset = /Z$|[+-]\d{2}:\d{2}$/.test(iso)
  const date = new Date(hasOffset ? iso : `${iso}+08:00`)
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

// columns is static — no reactive dependencies, no need for computed()
const columns: ColumnType<TrialLog>[] = [
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
]
</script>

<template>
  <a-card :bordered="false" class="shadow-sm">
    <template #title>
      <span class="font-semibold text-gray-800">歷史明細（最近 10 筆）</span>
    </template>

    <!-- BUG-04: trialLogsError is separate from errorMessage so the
         sidebar warrant list is unaffected by trial-log fetch failures -->
    <a-alert
      v-if="store.trialLogsError"
      type="error"
      :message="store.trialLogsError"
      show-icon
      class="mb-3"
    />

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
