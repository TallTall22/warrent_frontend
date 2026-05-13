import apiClient from './index'
import type { Warrant, TrialLog, SaveTrialLogPayload, TrialCalculation } from '@/types/warrant'

export async function getWarrants(): Promise<Warrant[]> {
  const response = await apiClient.get<{ data: Warrant[] }>(
    '/warrants',
    { params: { pageSize: 1000 } },
  )
  return response.data.data
}

export async function getTrialLogs(warrantId: string): Promise<TrialLog[]> {
  const response = await apiClient.get<{ warrantId: string; logs: TrialLog[] }>(
    `/warrants/${encodeURIComponent(warrantId)}/trial-logs`,
  )
  return response.data.logs
}

export async function saveTrialLog(
  warrantId: string,
  payload: SaveTrialLogPayload,
  idempotencyKey: string,
): Promise<TrialLog> {
  const response = await apiClient.post<TrialLog>(
    `/warrants/${encodeURIComponent(warrantId)}/trial-logs`,
    payload,
    { headers: { 'X-Idempotency-Key': idempotencyKey } },
  )
  return response.data
}

export async function calculateWarrant(
  warrantId: string,
  marketPrice: number,
  signal?: AbortSignal,
): Promise<TrialCalculation> {
  const response = await apiClient.post<TrialCalculation>(
    `/warrants/${encodeURIComponent(warrantId)}/calculate`,
    { marketPrice },
    { signal },
  )
  return response.data
}
