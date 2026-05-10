import apiClient from './index'
import type { Warrant, TrialLog, SaveTrialLogPayload, TrialCalculation } from '@/types/warrant'

export async function getWarrants(): Promise<Warrant[]> {
  const response = await apiClient.get<{ data: Warrant[] }>('/warrants')
  return response.data.data
}

export async function getTrialLogs(warrantId: string): Promise<TrialLog[]> {
  const response = await apiClient.get<{ warrantId: string; logs: TrialLog[] }>(
    `/warrants/${encodeURIComponent(warrantId)}/trial-logs`,
  )
  return response.data.logs
}

export async function saveTrialLog(warrantId: string, payload: SaveTrialLogPayload): Promise<TrialLog> {
  const response = await apiClient.post<TrialLog>(
    `/warrants/${encodeURIComponent(warrantId)}/trial-logs`,
    payload,
    { headers: { 'X-Idempotency-Key': crypto.randomUUID() } },
  )
  return response.data
}

/**
 * 呼叫後端即時試算（Delta、理論價值、建議避險張數）
 * POST /api/warrants/{warrantId}/calculate
 * @param warrantId 權證代碼
 * @param marketPrice 標的市價（必須 > 0）
 */
export async function calculateWarrant(
  warrantId: string,
  marketPrice: number,
): Promise<TrialCalculation> {
  const response = await apiClient.post<TrialCalculation>(
    `/warrants/${encodeURIComponent(warrantId)}/calculate`,
    { marketPrice },
  )
  return response.data
}
