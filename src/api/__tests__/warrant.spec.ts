import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getWarrants, getTrialLogs, saveTrialLog, calculateWarrant } from '../warrant'

// mock axios instance
vi.mock('../index', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}))

import apiClient from '../index'

const mockGet = vi.mocked(apiClient.get)
const mockPost = vi.mocked(apiClient.post)

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── task.md: 左側清單資料來源 ────────────────────────────────────────────────

describe('getWarrants', () => {
  it('從 response.data.data 解包陣列，帶 pageSize=1000', async () => {
    const warrants = [{ warrantId: '00001C', strikePrice: 100, conversionRatio: 0.1, warrantType: 'CALL', positionQty: 1000 }]
    mockGet.mockResolvedValueOnce({ data: { data: warrants, total: 1, page: 1, pageSize: 1000 } })

    const result = await getWarrants()

    expect(mockGet).toHaveBeenCalledWith('/warrants', { params: { pageSize: 1000 } })
    expect(result).toEqual(warrants)
  })
})

// ─── task.md: 歷史明細（最近 10 筆） ──────────────────────────────────────────

describe('getTrialLogs', () => {
  it('從 response.data.logs 解包陣列', async () => {
    const logs = [{ logId: 1, warrantId: '00001C', marketPrice: 100, theoryPrice: 5, hedgeQty: 80, createdTime: '2026-05-10T10:00:00' }]
    mockGet.mockResolvedValueOnce({ data: { warrantId: '00001C', logs } })

    const result = await getTrialLogs('00001C')

    expect(mockGet).toHaveBeenCalledWith('/warrants/00001C/trial-logs')
    expect(result).toEqual(logs)
  })

  it('warrantId 含特殊字元時進行 URL encode', async () => {
    mockGet.mockResolvedValueOnce({ data: { warrantId: 'A B/C', logs: [] } })
    await getTrialLogs('A B/C')
    expect(mockGet).toHaveBeenCalledWith('/warrants/A%20B%2FC/trial-logs')
  })
})

// ─── task.md: API 冪等性（X-Idempotency-Key） ─────────────────────────────────

describe('saveTrialLog', () => {
  const payload = { marketPrice: 100, theoryPrice: 5, hedgeQty: 80 }
  const log = { logId: 1, warrantId: '00001C', marketPrice: 100, theoryPrice: 5, hedgeQty: 80, createdTime: '2026-05-10T10:00:00' }

  it('將傳入的 Idempotency-Key 放到 X-Idempotency-Key header', async () => {
    mockPost.mockResolvedValueOnce({ data: log })
    const key = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

    await saveTrialLog('00001C', payload, key)

    const [, , config] = mockPost.mock.calls[0]
    expect(config?.headers?.['X-Idempotency-Key']).toBe(key)
  })

  it('重試時傳相同 Key，header 保持不變（冪等重試語意）', async () => {
    mockPost.mockResolvedValue({ data: log })
    const key = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

    await saveTrialLog('00001C', payload, key)
    await saveTrialLog('00001C', payload, key)

    const key1 = mockPost.mock.calls[0][2]?.headers?.['X-Idempotency-Key']
    const key2 = mockPost.mock.calls[1][2]?.headers?.['X-Idempotency-Key']
    expect(key1).toBe(key)
    expect(key2).toBe(key)
  })

  it('payload 包含 marketPrice、theoryPrice、hedgeQty', async () => {
    mockPost.mockResolvedValueOnce({ data: log })
    const key = crypto.randomUUID()

    await saveTrialLog('00001C', payload, key)

    expect(mockPost).toHaveBeenCalledWith(
      '/warrants/00001C/trial-logs',
      payload,
      expect.objectContaining({ headers: expect.objectContaining({ 'X-Idempotency-Key': key }) }),
    )
  })

  it('直接回傳 TrialLog（無包裝層）', async () => {
    const fullLog = { logId: 42, warrantId: '00001C', marketPrice: 100, theoryPrice: 5, hedgeQty: 80, createdTime: '2026-05-10T10:00:00' }
    mockPost.mockResolvedValueOnce({ data: fullLog })

    const result = await saveTrialLog('00001C', payload, crypto.randomUUID())

    expect(result).toEqual(fullLog)
  })
})

// ─── task.md: 即時試算呼叫正確 endpoint ────────────────────────────────────────

describe('calculateWarrant', () => {
  it('呼叫 POST /warrants/:id/calculate，傳入 marketPrice', async () => {
    const calcResult = {
      warrantId: '00001C', marketPrice: 110, strikePrice: 100,
      conversionRatio: 0.1, warrantType: 'CALL', positionQty: 1000,
      delta: 0.8, deltaStatus: 'ITM', theoryPrice: 1.0, hedgeQty: 80,
    }
    mockPost.mockResolvedValueOnce({ data: calcResult })

    const result = await calculateWarrant('00001C', 110)

    expect(mockPost).toHaveBeenCalledWith(
      '/warrants/00001C/calculate',
      { marketPrice: 110 },
    )
    expect(result).toEqual(calcResult)
  })
})
