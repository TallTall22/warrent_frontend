import { ref, watch, type Ref } from 'vue'
import type { TrialCalculation } from '@/types/warrant'
import { calculateWarrant } from '@/api/warrant'

/**
 * 手動 debounce 工具（避免引入額外依賴）
 */
function debounce<T extends (...args: Parameters<T>) => void>(fn: T, delay: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null
  return ((...args: Parameters<T>) => {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }) as T
}

/**
 * 後端即時試算 Composable
 *
 * 監聽 warrantId 與 marketPrice，當兩者皆有效時（marketPrice > 0），
 * debounce 300ms 後呼叫 POST /api/warrants/{warrantId}/calculate。
 * 結果以 reactive ref 形式回傳，供 CalculatorPanel 顯示與儲存使用。
 *
 * @param warrantId 當前選中的權證代碼（Ref）
 * @param marketPrice 使用者輸入的標的市價（Ref，null 或 <= 0 時不觸發）
 */
export function useTrialCalculation(
  warrantId: Ref<string | null>,
  marketPrice: Ref<number | null>,
) {
  /** 後端試算結果（null 表示尚未取得或輸入無效） */
  const calculation = ref<TrialCalculation | null>(null)

  /** 是否正在呼叫 calculate API */
  const isCalculating = ref<boolean>(false)

  /** 試算 API 錯誤訊息（null 表示無錯誤） */
  const calcError = ref<string | null>(null)

  /**
   * 實際呼叫 calculate API 的函式（由 debounce 包裹後使用）
   */
  async function runCalculate(id: string, price: number): Promise<void> {
    isCalculating.value = true
    calcError.value = null
    try {
      calculation.value = await calculateWarrant(id, price)
    } catch (err) {
      calcError.value = err instanceof Error ? err.message : '試算失敗，請稍後再試'
      calculation.value = null
    } finally {
      isCalculating.value = false
    }
  }

  /** debounce 300ms 的觸發函式 */
  const debouncedCalculate = debounce(runCalculate, 300)

  /**
   * 監聽 warrantId 與 marketPrice，任一變動即重新試算。
   * 條件：warrantId 非 null、marketPrice 非 null 且 > 0
   * 條件不符時清空上一次結果（避免顯示舊資料）。
   */
  watch(
    [warrantId, marketPrice],
    ([newId, newPrice]) => {
      if (newId === null || newPrice === null || newPrice <= 0) {
        // 輸入無效：清空結果，不觸發 API
        calculation.value = null
        calcError.value = null
        isCalculating.value = false
        return
      }
      debouncedCalculate(newId, newPrice)
    },
    { immediate: false },
  )

  return {
    calculation,
    isCalculating,
    calcError,
  }
}
