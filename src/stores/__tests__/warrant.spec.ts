import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useWarrantStore } from '../warrant'
import type { Warrant, TrialLog } from '@/types/warrant'

vi.mock('@/api/warrant', () => ({
  getWarrants: vi.fn(),
  getTrialLogs: vi.fn(),
}))

import { getWarrants, getTrialLogs } from '@/api/warrant'

const mockGetWarrants = vi.mocked(getWarrants)
const mockGetTrialLogs = vi.mocked(getTrialLogs)

function makeWarrant(overrides: Partial<Warrant> = {}): Warrant {
  return { warrantId: '00001C', strikePrice: 100, conversionRatio: 0.1, warrantType: 'CALL', positionQty: 1000, ...overrides }
}

function makeLog(overrides: Partial<TrialLog> = {}): TrialLog {
  return { logId: 1, warrantId: '00001C', marketPrice: 100, theoryPrice: 5, hedgeQty: 80, createdTime: '2026-05-10T10:00:00', ...overrides }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

// ─── task.md: 左側顯示 800 筆清單 ─────────────────────────────────────────────

describe('fetchWarrants', () => {
  it('成功時將資料填入 warrants', async () => {
    const list = [makeWarrant(), makeWarrant({ warrantId: '00002P', warrantType: 'PUT' })]
    mockGetWarrants.mockResolvedValueOnce(list)

    const store = useWarrantStore()
    await store.fetchWarrants()

    expect(store.warrants).toEqual(list)
    expect(store.isLoadingWarrants).toBe(false)
    expect(store.errorMessage).toBeNull()
  })

  it('失敗時設定 errorMessage', async () => {
    mockGetWarrants.mockRejectedValueOnce(new Error('網路連線異常'))

    const store = useWarrantStore()
    await store.fetchWarrants()

    expect(store.warrants).toEqual([])
    expect(store.errorMessage).toBe('網路連線異常')
  })
})

// ─── task.md: 支援代碼關鍵字搜尋 ─────────────────────────────────────────────

describe('filteredWarrants（搜尋功能）', () => {
  it('無關鍵字時回傳全部清單', () => {
    const store = useWarrantStore()
    store.warrants = [makeWarrant({ warrantId: '00001C' }), makeWarrant({ warrantId: '00002P' })]

    expect(store.filteredWarrants).toHaveLength(2)
  })

  it('依代碼關鍵字過濾（大小寫不敏感）', async () => {
    const store = useWarrantStore()
    store.warrants = [makeWarrant({ warrantId: '00001C' }), makeWarrant({ warrantId: '00002P' })]
    store.setSearchKeyword('00001')
    vi.advanceTimersByTime(300)

    expect(store.filteredWarrants).toHaveLength(1)
    expect(store.filteredWarrants[0].warrantId).toBe('00001C')
  })

  it('關鍵字無符合時回傳空陣列', () => {
    const store = useWarrantStore()
    store.warrants = [makeWarrant({ warrantId: '00001C' })]
    store.setSearchKeyword('ZZZZZ')
    vi.advanceTimersByTime(300)

    expect(store.filteredWarrants).toHaveLength(0)
  })
})

// ─── task.md: 歷史明細（最近 10 筆） ──────────────────────────────────────────

describe('selectWarrant', () => {
  it('切換權證後 lazy load 試算紀錄', async () => {
    const logs = [makeLog()]
    mockGetTrialLogs.mockResolvedValueOnce(logs)

    const store = useWarrantStore()
    const warrant = makeWarrant()
    await store.selectWarrant(warrant)

    expect(store.selectedWarrant).toEqual(warrant)
    expect(mockGetTrialLogs).toHaveBeenCalledWith('00001C')
    expect(store.trialLogs).toEqual(logs)
  })
})

// ─── BUG-04 修正：trialLogsError 獨立於 errorMessage ─────────────────────────

describe('fetchTrialLogs（trialLogsError 獨立）', () => {
  it('失敗時設定 trialLogsError，不影響 errorMessage', async () => {
    mockGetTrialLogs.mockRejectedValueOnce(new Error('試算記錄載入失敗'))

    const store = useWarrantStore()
    await store.fetchTrialLogs('00001C')

    expect(store.trialLogsError).toBe('試算記錄載入失敗')
    expect(store.errorMessage).toBeNull()
    expect(store.trialLogs).toEqual([])
  })

  it('成功後清空 trialLogsError', async () => {
    const logs = [makeLog()]
    mockGetTrialLogs.mockResolvedValueOnce(logs)

    const store = useWarrantStore()
    store.trialLogsError = '前次錯誤'

    await store.fetchTrialLogs('00001C')

    expect(store.trialLogsError).toBeNull()
    expect(store.trialLogs).toEqual(logs)
  })

  it('fetchWarrants 失敗不影響 trialLogsError', async () => {
    mockGetWarrants.mockRejectedValueOnce(new Error('清單載入失敗'))

    const store = useWarrantStore()
    await store.fetchWarrants()

    expect(store.errorMessage).toBe('清單載入失敗')
    expect(store.trialLogsError).toBeNull()
  })
})

describe('prependTrialLog（最多 10 筆）', () => {
  it('新增一筆至最前面', () => {
    const store = useWarrantStore()
    store.trialLogs = [makeLog({ logId: 1 })]
    store.prependTrialLog(makeLog({ logId: 2 }))

    expect(store.trialLogs[0].logId).toBe(2)
    expect(store.trialLogs).toHaveLength(2)
  })

  it('超過 10 筆時截斷，只保留最新 10 筆', () => {
    const store = useWarrantStore()
    store.trialLogs = Array.from({ length: 10 }, (_, i) => makeLog({ logId: i + 1 }))

    store.prependTrialLog(makeLog({ logId: 999 }))

    expect(store.trialLogs).toHaveLength(10)
    expect(store.trialLogs[0].logId).toBe(999)
    // slice(0,10) 後，原本最後一筆（logId=10）被截掉
    expect(store.trialLogs.find(l => l.logId === 10)).toBeUndefined()
  })
})
