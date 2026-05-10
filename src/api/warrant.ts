import apiClient from './index'
import type { Warrant, TrialLog, SaveTrialLogPayload } from '@/types/warrant'

/**
 * T07 · 取得所有權證清單
 * GET /api/warrants
 */
export async function getWarrants(): Promise<Warrant[]> {
  const response = await apiClient.get<Warrant[]>('/warrants')
  return response.data
}

/**
 * T08 · 取得指定權證的試算歷史紀錄（最近 10 筆）
 * GET /api/trial-logs/:warrantId
 * @param warrantId 權證代碼
 */
export async function getTrialLogs(warrantId: string): Promise<TrialLog[]> {
  const response = await apiClient.get<TrialLog[]>(`/trial-logs/${encodeURIComponent(warrantId)}`, {
    params: { limit: 10 },
  })
  return response.data
}

/**
 * T09 · 儲存試算紀錄
 * POST /api/trial-log
 * @param payload 包含 warrantId 與 marketPrice
 */
export async function saveTrialLog(payload: SaveTrialLogPayload): Promise<TrialLog> {
  const response = await apiClient.post<TrialLog>('/trial-log', payload)
  return response.data
}
