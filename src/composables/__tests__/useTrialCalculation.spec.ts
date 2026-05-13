import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { useTrialCalculation } from '../useTrialCalculation'

vi.mock('@/api/warrant', () => ({
  calculateWarrant: vi.fn(),
}))

import { calculateWarrant } from '@/api/warrant'

const mockCalculate = vi.mocked(calculateWarrant)

const calcResult = {
  warrantId: '00001C', marketPrice: 110, strikePrice: 100,
  conversionRatio: 0.1, warrantType: 'CALL' as const, positionQty: 1000,
  delta: 0.8, deltaStatus: 'ITM' as const, theoryPrice: 1.0, hedgeQty: 80,
}

beforeEach(() => {
  vi.resetAllMocks()   // clears calls AND the once-queue (clearAllMocks does not)
  vi.useFakeTimers()
})

// ─── task.md: 輸入股價即時反映試算結果 ────────────────────────────────────────

describe('useTrialCalculation', () => {
  it('marketPrice > 0 且 warrantId 有效時，debounce 後呼叫 calculateWarrant', async () => {
    mockCalculate.mockResolvedValueOnce(calcResult)
    // watch 是 immediate:false，需先建立 composable 再觸發變更
    const warrantId = ref<string | null>('00001C')
    const marketPrice = ref<number | null>(null)

    useTrialCalculation(warrantId, marketPrice)

    marketPrice.value = 110
    await nextTick()

    // debounce 300ms 前不觸發
    expect(mockCalculate).not.toHaveBeenCalled()

    vi.advanceTimersByTime(300)
    await nextTick()

    expect(mockCalculate).toHaveBeenCalledWith('00001C', 110, expect.any(AbortSignal))
  })

  it('debounce 300ms 內多次輸入只觸發一次 API', async () => {
    mockCalculate.mockResolvedValue(calcResult)
    const warrantId = ref<string | null>('00001C')
    const marketPrice = ref<number | null>(100)

    useTrialCalculation(warrantId, marketPrice)

    marketPrice.value = 105
    await nextTick()
    marketPrice.value = 110
    await nextTick()

    vi.advanceTimersByTime(300)
    await nextTick()

    expect(mockCalculate).toHaveBeenCalledTimes(1)
    expect(mockCalculate).toHaveBeenCalledWith('00001C', 110, expect.any(AbortSignal))
  })

  // ─── task.md: 防禦性檢查：股價 <= 0 禁止存檔 ──────────────────────────────

  it('marketPrice = 0 時不呼叫 API，calculation 為 null', async () => {
    const warrantId = ref<string | null>('00001C')
    const marketPrice = ref<number | null>(0)

    const { calculation } = useTrialCalculation(warrantId, marketPrice)

    vi.advanceTimersByTime(300)
    await nextTick()

    expect(mockCalculate).not.toHaveBeenCalled()
    expect(calculation.value).toBeNull()
  })

  it('marketPrice < 0 時不呼叫 API', async () => {
    const warrantId = ref<string | null>('00001C')
    const marketPrice = ref<number | null>(-10)

    useTrialCalculation(warrantId, marketPrice)

    vi.advanceTimersByTime(300)
    await nextTick()

    expect(mockCalculate).not.toHaveBeenCalled()
  })

  it('marketPrice = null 時不呼叫 API', async () => {
    const warrantId = ref<string | null>('00001C')
    const marketPrice = ref<number | null>(null)

    useTrialCalculation(warrantId, marketPrice)

    vi.advanceTimersByTime(300)
    await nextTick()

    expect(mockCalculate).not.toHaveBeenCalled()
  })

  it('warrantId = null 時不呼叫 API', async () => {
    const warrantId = ref<string | null>(null)
    const marketPrice = ref<number | null>(110)

    useTrialCalculation(warrantId, marketPrice)

    vi.advanceTimersByTime(300)
    await nextTick()

    expect(mockCalculate).not.toHaveBeenCalled()
  })

  it('切換權證後舊的 calculation 清空', async () => {
    mockCalculate.mockResolvedValueOnce(calcResult)
    const warrantId = ref<string | null>('00001C')
    const marketPrice = ref<number | null>(null)

    const { calculation } = useTrialCalculation(warrantId, marketPrice)

    // Step 1：觸發一次有效計算，確認結果已填入
    marketPrice.value = 110
    await nextTick()
    vi.advanceTimersByTime(300)
    await flushPromises()

    expect(calculation.value).toEqual(calcResult)

    // Step 2：切換到 null（未選權證），驗證舊結果被清空
    warrantId.value = null
    await nextTick()

    expect(calculation.value).toBeNull()
  })

  it('API 失敗時 calcError 顯示錯誤訊息', async () => {
    mockCalculate.mockImplementation(() =>
      Promise.reject(new Error('伺服器內部錯誤，請稍後再試')),
    )
    const warrantId = ref<string | null>('00001C')
    const marketPrice = ref<number | null>(null)

    const { calcError, calculation } = useTrialCalculation(warrantId, marketPrice)

    marketPrice.value = 110
    await nextTick()
    vi.advanceTimersByTime(300)
    await nextTick()
    await nextTick()

    expect(calcError.value).toBe('伺服器內部錯誤，請稍後再試')
    expect(calculation.value).toBeNull()
  })
})
