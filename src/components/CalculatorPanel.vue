<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { message } from 'ant-design-vue'
import { useWarrantStore } from '@/stores/warrant'
import { useTrialCalculation } from '@/composables/useTrialCalculation'
import { saveTrialLog } from '@/api/warrant'
import type { DeltaStatus } from '@/types/warrant'
import { formatPrice, formatQty } from '@/utils/formatters'

const store = useWarrantStore()

/** 使用者輸入的標的股價 */
const marketPrice = ref<number | null>(null)

/** 當前選中的權證代碼（供 useTrialCalculation 監聽） */
const selectedWarrantId = computed<string | null>(
  () => store.selectedWarrant?.warrantId ?? null,
)

/** 後端即時試算結果（debounce 300ms 後呼叫 calculate API） */
const { calculation, isCalculating, calcError } = useTrialCalculation(
  selectedWarrantId,
  marketPrice,
)

// UX-01：切換權證時清空市價，避免舊數值殘留誤導試算
watch(
  () => store.selectedWarrant?.warrantId,
  () => { marketPrice.value = null },
)

// BUG-03：每次新計算結果產生對應的冪等 Key，讓重試可沿用同一個 Key
const idempotencyKey = ref<string | null>(null)
watch(calculation, (newVal) => {
  idempotencyKey.value = newVal !== null ? crypto.randomUUID() : null
})

/** Delta 狀態對應的 a-tag 色彩 */
const deltaStatusColor: Record<DeltaStatus, string> = {
  ITM: 'green',
  ATM: 'blue',
  OTM: 'orange',
}

/** 儲存按鈕 loading 狀態 */
const isSaving = ref(false)

/**
 * 儲存按鈕是否可用
 * 必須：已選權證、有效市價、後端計算完成（calculation 非 null）、Key 就緒、且非儲存中
 */
// BUG-06: also guard against saving while a new calculation is in flight
const canSave = computed<boolean>(() => {
  return (
    store.selectedWarrant !== null &&
    marketPrice.value !== null &&
    marketPrice.value > 0 &&
    calculation.value !== null &&
    idempotencyKey.value !== null &&
    !isSaving.value &&
    !isCalculating.value
  )
})

async function handleSave(): Promise<void> {
  if (
    !canSave.value ||
    !store.selectedWarrant ||
    !marketPrice.value ||
    calculation.value === null ||
    idempotencyKey.value === null
  ) return

  isSaving.value = true
  try {
    // 傳入後端 calculate 回傳的值；Key 由呼叫方持有，失敗重試時沿用同一個 Key
    const log = await saveTrialLog(
      store.selectedWarrant.warrantId,
      {
        marketPrice: calculation.value.marketPrice,
        theoryPrice: calculation.value.theoryPrice,
        hedgeQty: calculation.value.hedgeQty,
      },
      idempotencyKey.value,
    )
    store.prependTrialLog(log)
    // BUG-05: discard key after success — prevents client-side duplicate on re-click
    idempotencyKey.value = null
    message.success('試算結果已儲存')
  } catch (err) {
    // 保留 idempotencyKey，讓使用者點擊重試時仍帶同一個 Key
    message.error(err instanceof Error ? err.message : '儲存失敗，請稍後再試')
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <a-card v-if="store.selectedWarrant" :bordered="false" class="shadow-sm">
    <!-- 標題列：權證基本資訊 -->
    <template #title>
      <div class="flex items-center gap-3 flex-wrap">
        <span class="text-base font-bold text-gray-800">
          {{ store.selectedWarrant.warrantId }}
        </span>
        <a-tag :color="store.selectedWarrant.warrantType === 'CALL' ? 'green' : 'red'">
          {{ store.selectedWarrant.warrantType }}
        </a-tag>
        <span class="text-sm text-gray-500">
          履約價 {{ store.selectedWarrant.strikePrice.toFixed(4) }}
        </span>
        <span class="text-sm text-gray-500">
          行使比例 {{ store.selectedWarrant.conversionRatio.toFixed(4) }}
        </span>
        <span class="text-sm text-gray-500">
          庫存 {{ store.selectedWarrant.positionQty.toLocaleString() }} 張
        </span>
      </div>
    </template>

    <div class="flex flex-col gap-5">
      <!-- 股價輸入 -->
      <div>
        <div class="mb-1 text-sm text-gray-600 font-medium">標的股價</div>
        <a-input-number
          v-model:value="marketPrice"
          :precision="4"
          :min="0.0001"
          :step="0.5"
          placeholder="請輸入標的現價"
          class="w-full"
          size="large"
          addon-after="元"
        />
        <div v-if="marketPrice !== null && marketPrice <= 0" class="mt-1 text-xs text-red-500">
          股價必須大於 0
        </div>
        <!-- 試算 API 錯誤提示 -->
        <div v-if="calcError" class="mt-1 text-xs text-red-500">
          {{ calcError }}
        </div>
      </div>

      <!-- 計算結果 -->
      <a-spin :spinning="isCalculating" tip="試算中…">
        <div class="grid grid-cols-2 gap-4">
          <!-- 理論價值 -->
          <div class="rounded-lg bg-gray-50 p-4 border border-gray-100">
            <div class="text-xs text-gray-500 mb-1">理論價值（內含價值）</div>
            <div class="text-xl font-bold text-gray-800">
              <template v-if="calculation !== null">
                {{ formatPrice(calculation.theoryPrice) }}
                <span class="text-sm font-normal text-gray-500 ml-1">元</span>
              </template>
              <span v-else class="text-gray-400 text-base font-normal">—</span>
            </div>
          </div>

          <!-- 建議避險張數 -->
          <div class="rounded-lg bg-gray-50 p-4 border border-gray-100">
            <div class="text-xs text-gray-500 mb-1">建議避險張數</div>
            <div class="text-xl font-bold text-gray-800">
              <template v-if="calculation !== null">
                {{ formatQty(calculation.hedgeQty) }}
                <span class="text-sm font-normal text-gray-500 ml-1">張</span>
              </template>
              <span v-else class="text-gray-400 text-base font-normal">—</span>
            </div>
          </div>

          <!-- Delta 數值 -->
          <div class="rounded-lg bg-gray-50 p-4 border border-gray-100">
            <div class="text-xs text-gray-500 mb-1">Delta</div>
            <div class="text-xl font-bold text-gray-800">
              <template v-if="calculation !== null">
                {{ calculation.delta.toFixed(2) }}
              </template>
              <span v-else class="text-gray-400 text-base font-normal">—</span>
            </div>
          </div>

          <!-- Delta 狀態 -->
          <div class="rounded-lg bg-gray-50 p-4 border border-gray-100">
            <div class="text-xs text-gray-500 mb-2">價位狀態</div>
            <div>
              <template v-if="calculation !== null">
                <a-tag :color="deltaStatusColor[calculation.deltaStatus]" class="text-sm">
                  {{ calculation.deltaStatus }}
                </a-tag>
              </template>
              <span v-else class="text-gray-400 text-base font-normal">—</span>
            </div>
          </div>
        </div>
      </a-spin>

      <!-- 儲存按鈕 -->
      <a-button
        type="primary"
        size="large"
        :loading="isSaving"
        :disabled="!canSave"
        class="w-full mt-4"
        @click="handleSave"
      >
        儲存試算結果
      </a-button>
    </div>
  </a-card>
</template>
