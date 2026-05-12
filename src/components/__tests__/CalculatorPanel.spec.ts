import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { ref, nextTick } from 'vue'
import CalculatorPanel from '../CalculatorPanel.vue'
import { useWarrantStore } from '@/stores/warrant'
import type { TrialCalculation, TrialLog, Warrant } from '@/types/warrant'

// ─── Shared mock state for useTrialCalculation ────────────────────────────────

const mockCalculation = ref<TrialCalculation | null>(null)
const mockIsCalculating = ref(false)
const mockCalcError = ref<string | null>(null)

vi.mock('@/composables/useTrialCalculation', () => ({
  useTrialCalculation: vi.fn(() => ({
    calculation: mockCalculation,
    isCalculating: mockIsCalculating,
    calcError: mockCalcError,
  })),
}))

vi.mock('@/api/warrant', () => ({
  saveTrialLog: vi.fn(),
  calculateWarrant: vi.fn(),
  getWarrants: vi.fn().mockResolvedValue([]),
  getTrialLogs: vi.fn().mockResolvedValue([]),
}))

// Only mock message; components are handled via global.stubs below
// (unplugin-vue-components is not active in vitest.config.ts)
vi.mock('ant-design-vue', () => ({
  message: { success: vi.fn(), error: vi.fn() },
}))

import { saveTrialLog } from '@/api/warrant'
const mockSaveTrialLog = vi.mocked(saveTrialLog)

// ─── Stubs for ant-design-vue components ──────────────────────────────────────
// Provided via global.stubs so Vue can resolve the kebab-case tag names
// that appear in the SFC template.

const adStubs = {
  'a-card': { template: '<div><slot name="title" /><slot /></div>' },
  'a-tag': { template: '<span><slot /></span>' },
  'a-input-number': {
    props: ['value', 'precision', 'min', 'step', 'placeholder', 'size', 'addonAfter'],
    emits: ['update:value'],
    template: `<input
      type="number"
      :value="value ?? ''"
      @input="$emit('update:value', $event.target.value === '' ? null : +$event.target.value)"
    />`,
  },
  'a-spin': { props: ['spinning', 'tip'], template: '<div><slot /></div>' },
  'a-button': {
    props: ['disabled', 'loading', 'type', 'size'],
    emits: ['click'],
    template: '<button :disabled="disabled || loading" @click="$emit(\'click\')"><slot /></button>',
  },
}

// ─── Test data ────────────────────────────────────────────────────────────────

const mockWarrant: Warrant = {
  warrantId: '00001C',
  strikePrice: 100,
  conversionRatio: 0.1,
  warrantType: 'CALL',
  positionQty: 1000,
}

const calcResult: TrialCalculation = {
  warrantId: '00001C',
  marketPrice: 110,
  strikePrice: 100,
  conversionRatio: 0.1,
  warrantType: 'CALL',
  positionQty: 1000,
  delta: 0.8,
  deltaStatus: 'ITM',
  theoryPrice: 1.0,
  hedgeQty: 80,
}

const mockLog: TrialLog = {
  logId: 1,
  warrantId: '00001C',
  marketPrice: 110,
  theoryPrice: 1.0,
  hedgeQty: 80,
  createdTime: '2026-05-11T10:00:00',
}

// ─── Helper: mount with a warrant selected and Save button in ready state ─────

async function mountReady() {
  const store = useWarrantStore()
  store.selectedWarrant = mockWarrant

  const wrapper = mount(CalculatorPanel, { global: { stubs: adStubs } })

  // Changing calculation triggers the idempotencyKey watcher
  mockCalculation.value = calcResult
  await nextTick()
  await nextTick()

  // Set a valid market price via the input stub
  await wrapper.find('input[type="number"]').setValue('110')
  await nextTick()

  return { wrapper, store }
}

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  mockCalculation.value = null
  mockIsCalculating.value = false
  mockCalcError.value = null
})

describe('CalculatorPanel', () => {

  // ─── BUG-06: canSave must exclude isCalculating ───────────────────────────

  describe('BUG-06：isCalculating = true 時禁用儲存按鈕', () => {
    it('isCalculating = true 時按鈕 disabled', async () => {
      const { wrapper } = await mountReady()

      mockIsCalculating.value = true
      await nextTick()

      expect(wrapper.find('button').attributes('disabled')).toBeDefined()
    })

    it('isCalculating = false 且有計算結果時按鈕可用', async () => {
      const { wrapper } = await mountReady()

      mockIsCalculating.value = false
      await nextTick()

      expect(wrapper.find('button').attributes('disabled')).toBeUndefined()
    })
  })

  // ─── BUG-05: idempotencyKey cleared after successful save ────────────────

  describe('BUG-05：儲存成功後 idempotencyKey 清空', () => {
    it('儲存成功後按鈕立即 disabled（防止重複提交）', async () => {
      const { wrapper } = await mountReady()
      mockSaveTrialLog.mockResolvedValueOnce(mockLog)

      await wrapper.find('button').trigger('click')
      await flushPromises()

      expect(wrapper.find('button').attributes('disabled')).toBeDefined()
    })

    it('儲存成功後新紀錄出現在 store.trialLogs 最前面', async () => {
      const { wrapper, store } = await mountReady()
      mockSaveTrialLog.mockResolvedValueOnce(mockLog)

      await wrapper.find('button').trigger('click')
      await flushPromises()

      expect(store.trialLogs[0]).toEqual(mockLog)
    })
  })

  // ─── Idempotency retry: key preserved on failure ──────────────────────────

  describe('冪等重試：儲存失敗後 Key 保留，重試帶相同 Key', () => {
    it('第一次失敗再次點擊，兩次呼叫的 idempotencyKey 相同', async () => {
      const { wrapper } = await mountReady()
      mockSaveTrialLog
        .mockRejectedValueOnce(new Error('網路逾時'))
        .mockResolvedValueOnce(mockLog)

      const btn = wrapper.find('button')

      await btn.trigger('click')
      await flushPromises()

      await btn.trigger('click')
      await flushPromises()

      const calls = mockSaveTrialLog.mock.calls
      expect(calls).toHaveLength(2)
      expect(calls[0][2]).toBe(calls[1][2])
    })
  })

  // ─── UX: marketPrice reset when switching warrants ────────────────────────

  describe('UX：切換權證後市價清空', () => {
    it('selectedWarrant.warrantId 改變後 input 清空為空值', async () => {
      const { wrapper, store } = await mountReady()

      store.selectedWarrant = { ...mockWarrant, warrantId: '00002P', warrantType: 'PUT' }
      await nextTick()

      expect(wrapper.find('input[type="number"]').element.value).toBe('')
    })
  })

})
