import { computed, type Ref } from 'vue'
import type { Warrant } from '@/types/warrant'

/**
 * 避險試算核心計算 Composable
 *
 * @param warrant 當前選中的權證（含履約價、行使比例、庫存張數、類型）
 * @param marketPrice 標的市價（Ref，由使用者輸入）
 * @returns theoryPrice、delta、hedgeQty 的 computed refs
 */
export function useHedgeCalc(
  warrant: Ref<Warrant | null>,
  marketPrice: Ref<number | null>,
) {
  /**
   * 理論價值（內含價值）
   * CALL: Max(0, (標的價 - 履約價) × 行使比例)
   * PUT:  Max(0, (履約價 - 標的價) × 行使比例)
   * 當 marketPrice <= 0 或 warrant 為 null 時，回傳 null
   */
  const theoryPrice = computed<number | null>(() => {
    const mp = marketPrice.value
    const w = warrant.value
    if (w === null || mp === null || mp <= 0) return null

    const sp = w.strikePrice
    const cr = w.conversionRatio

    if (w.warrantType === 'CALL') {
      return Math.max(0, (mp - sp) * cr)
    } else {
      return Math.max(0, (sp - mp) * cr)
    }
  })

  /**
   * Delta 簡化模型
   * ITM (價內): 0.8
   * ATM (價平): 0.5
   * OTM (價外): 0.2
   *
   * CALL ITM: 標的價 > 履約價
   * CALL ATM: 標的價 = 履約價
   * CALL OTM: 標的價 < 履約價
   * PUT  ITM: 標的價 < 履約價
   * PUT  ATM: 標的價 = 履約價
   * PUT  OTM: 標的價 > 履約價
   *
   * 當 marketPrice <= 0 或 warrant 為 null 時，回傳 null
   */
  const delta = computed<number | null>(() => {
    const mp = marketPrice.value
    const w = warrant.value
    if (w === null || mp === null || mp <= 0) return null

    const sp = w.strikePrice

    if (w.warrantType === 'CALL') {
      if (mp === sp) return 0.5
      if (mp > sp) return 0.8  // ITM
      return 0.2               // OTM
    } else {
      if (mp === sp) return 0.5
      if (mp < sp) return 0.8  // ITM (PUT)
      return 0.2               // OTM (PUT)
    }
  })

  /**
   * 建議避險張數
   * 庫存張數 × 行使比例 × Delta
   * 當 delta 為 null 時回傳 null
   */
  const hedgeQty = computed<number | null>(() => {
    const d = delta.value
    const w = warrant.value
    if (d === null || w === null) return null

    return w.positionQty * w.conversionRatio * d
  })

  return {
    theoryPrice,
    delta,
    hedgeQty,
  }
}
