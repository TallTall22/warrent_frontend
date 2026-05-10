import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useHedgeCalc } from '../useHedgeCalc'
import type { Warrant } from '@/types/warrant'

/**
 * 建立測試用權證 Ref 的輔助函式
 */
function makeWarrant(overrides: Partial<Warrant> = {}): ReturnType<typeof ref<Warrant | null>> {
  const defaults: Warrant = {
    warrantId: 'TEST001',
    strikePrice: 50,
    conversionRatio: 0.1,
    warrantType: 'CALL',
    positionQty: 1000,
  }
  return ref<Warrant | null>({ ...defaults, ...overrides })
}

describe('useHedgeCalc', () => {
  // --------------------------------------------------
  // CALL 系列測試
  // --------------------------------------------------

  describe('CALL 權證', () => {
    it('CALL ITM：股價=60, 履約價=50, 行使比例=0.1, 庫存=1000 → theoryPrice=1.0, delta=0.8, hedgeQty=80', () => {
      const warrant = makeWarrant({ warrantType: 'CALL', strikePrice: 50, conversionRatio: 0.1, positionQty: 1000 })
      const marketPrice = ref<number | null>(60)
      const { theoryPrice, delta, hedgeQty } = useHedgeCalc(warrant, marketPrice)

      expect(theoryPrice.value).toBeCloseTo(1.0, 4)
      expect(delta.value).toBe(0.8)
      expect(hedgeQty.value).toBeCloseTo(80, 2)
    })

    it('CALL ATM：股價=50, 履約價=50 → theoryPrice=0, delta=0.5', () => {
      const warrant = makeWarrant({ warrantType: 'CALL', strikePrice: 50, conversionRatio: 0.1, positionQty: 1000 })
      const marketPrice = ref<number | null>(50)
      const { theoryPrice, delta, hedgeQty } = useHedgeCalc(warrant, marketPrice)

      expect(theoryPrice.value).toBeCloseTo(0, 4)
      expect(delta.value).toBe(0.5)
      // hedgeQty = 1000 * 0.1 * 0.5 = 50
      expect(hedgeQty.value).toBeCloseTo(50, 2)
    })

    it('CALL OTM：股價=40, 履約價=50 → theoryPrice=0 (不為負), delta=0.2', () => {
      const warrant = makeWarrant({ warrantType: 'CALL', strikePrice: 50, conversionRatio: 0.1, positionQty: 1000 })
      const marketPrice = ref<number | null>(40)
      const { theoryPrice, delta, hedgeQty } = useHedgeCalc(warrant, marketPrice)

      expect(theoryPrice.value).toBe(0)
      expect(delta.value).toBe(0.2)
      // hedgeQty = 1000 * 0.1 * 0.2 = 20
      expect(hedgeQty.value).toBeCloseTo(20, 2)
    })
  })

  // --------------------------------------------------
  // PUT 系列測試
  // --------------------------------------------------

  describe('PUT 權證', () => {
    it('PUT ITM：股價=40, 履約價=50, 行使比例=0.1, 庫存=1000 → theoryPrice=1.0, delta=0.8', () => {
      const warrant = makeWarrant({ warrantType: 'PUT', strikePrice: 50, conversionRatio: 0.1, positionQty: 1000 })
      const marketPrice = ref<number | null>(40)
      const { theoryPrice, delta, hedgeQty } = useHedgeCalc(warrant, marketPrice)

      expect(theoryPrice.value).toBeCloseTo(1.0, 4)
      expect(delta.value).toBe(0.8)
      // hedgeQty = 1000 * 0.1 * 0.8 = 80
      expect(hedgeQty.value).toBeCloseTo(80, 2)
    })

    it('PUT ATM：股價=50, 履約價=50 → theoryPrice=0, delta=0.5', () => {
      const warrant = makeWarrant({ warrantType: 'PUT', strikePrice: 50, conversionRatio: 0.1, positionQty: 1000 })
      const marketPrice = ref<number | null>(50)
      const { theoryPrice, delta } = useHedgeCalc(warrant, marketPrice)

      expect(theoryPrice.value).toBeCloseTo(0, 4)
      expect(delta.value).toBe(0.5)
    })

    it('PUT OTM：股價=60, 履約價=50 → theoryPrice=0, delta=0.2', () => {
      const warrant = makeWarrant({ warrantType: 'PUT', strikePrice: 50, conversionRatio: 0.1, positionQty: 1000 })
      const marketPrice = ref<number | null>(60)
      const { theoryPrice, delta } = useHedgeCalc(warrant, marketPrice)

      expect(theoryPrice.value).toBe(0)
      expect(delta.value).toBe(0.2)
    })
  })

  // --------------------------------------------------
  // 邊界條件測試
  // --------------------------------------------------

  describe('邊界條件', () => {
    it('股價=0 → theoryPrice=null, delta=null, hedgeQty=null', () => {
      const warrant = makeWarrant()
      const marketPrice = ref<number | null>(0)
      const { theoryPrice, delta, hedgeQty } = useHedgeCalc(warrant, marketPrice)

      expect(theoryPrice.value).toBeNull()
      expect(delta.value).toBeNull()
      expect(hedgeQty.value).toBeNull()
    })

    it('股價為負數 → theoryPrice=null, delta=null, hedgeQty=null', () => {
      const warrant = makeWarrant()
      const marketPrice = ref<number | null>(-10)
      const { theoryPrice, delta, hedgeQty } = useHedgeCalc(warrant, marketPrice)

      expect(theoryPrice.value).toBeNull()
      expect(delta.value).toBeNull()
      expect(hedgeQty.value).toBeNull()
    })

    it('marketPrice=null → theoryPrice=null, delta=null, hedgeQty=null', () => {
      const warrant = makeWarrant()
      const marketPrice = ref<number | null>(null)
      const { theoryPrice, delta, hedgeQty } = useHedgeCalc(warrant, marketPrice)

      expect(theoryPrice.value).toBeNull()
      expect(delta.value).toBeNull()
      expect(hedgeQty.value).toBeNull()
    })

    it('warrant=null → theoryPrice=null, delta=null, hedgeQty=null', () => {
      const warrant = ref<Warrant | null>(null)
      const marketPrice = ref<number | null>(60)
      const { theoryPrice, delta, hedgeQty } = useHedgeCalc(warrant, marketPrice)

      expect(theoryPrice.value).toBeNull()
      expect(delta.value).toBeNull()
      expect(hedgeQty.value).toBeNull()
    })

    it('computed 具響應性：切換 marketPrice 後值更新', () => {
      const warrant = makeWarrant({ warrantType: 'CALL', strikePrice: 50, conversionRatio: 0.1, positionQty: 1000 })
      const marketPrice = ref<number | null>(60)
      const { theoryPrice, delta } = useHedgeCalc(warrant, marketPrice)

      // 初始：ITM
      expect(delta.value).toBe(0.8)
      expect(theoryPrice.value).toBeCloseTo(1.0, 4)

      // 切換至 OTM
      marketPrice.value = 40
      expect(delta.value).toBe(0.2)
      expect(theoryPrice.value).toBe(0)

      // 切換至 ATM
      marketPrice.value = 50
      expect(delta.value).toBe(0.5)
      expect(theoryPrice.value).toBeCloseTo(0, 4)
    })
  })
})
