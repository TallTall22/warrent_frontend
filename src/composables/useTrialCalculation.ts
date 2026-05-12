import { ref, watch, onUnmounted, getCurrentInstance, type Ref } from 'vue'
import type { TrialCalculation } from '@/types/warrant'
import { calculateWarrant } from '@/api/warrant'
import { debounce } from '@/utils/debounce'

export function useTrialCalculation(
  warrantId: Ref<string | null>,
  marketPrice: Ref<number | null>,
) {
  const calculation = ref<TrialCalculation | null>(null)
  const isCalculating = ref<boolean>(false)
  const calcError = ref<string | null>(null)

  // BUG-07: request sequence ID — stale responses are silently dropped
  let requestSeq = 0

  async function runCalculate(id: string, price: number): Promise<void> {
    const seq = ++requestSeq
    isCalculating.value = true
    calcError.value = null
    try {
      const result = await calculateWarrant(id, price)
      if (seq !== requestSeq) return
      calculation.value = result
    } catch (err) {
      if (seq !== requestSeq) return
      calcError.value = err instanceof Error ? err.message : '試算失敗，請稍後再試'
      calculation.value = null
    } finally {
      if (seq === requestSeq) {
        isCalculating.value = false
      }
    }
  }

  const debouncedCalculate = debounce(runCalculate, 300)

  watch(
    [warrantId, marketPrice],
    ([newId, newPrice]) => {
      if (newId === null || newPrice === null || newPrice <= 0) {
        calculation.value = null
        calcError.value = null
        isCalculating.value = false
        return
      }
      // BUG-06: clear stale result immediately so Save button disables
      // while waiting for the new debounced request
      calculation.value = null
      debouncedCalculate(newId, newPrice)
    },
    { immediate: false },
  )

  // BUG-08: cancel pending timer and ignore in-flight requests on unmount.
  // Guard with getCurrentInstance() so this composable can also be called
  // outside a component context (e.g. unit tests) without Vue warnings.
  if (getCurrentInstance()) {
    onUnmounted(() => {
      debouncedCalculate.cancel()
      requestSeq = Infinity
    })
  }

  return {
    calculation,
    isCalculating,
    calcError,
  }
}
