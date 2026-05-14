import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { Warrant, TrialLog } from '@/types/warrant'
import { getWarrants, getTrialLogs } from '@/api/warrant'
import { debounce } from '@/utils/debounce'

export const useWarrantStore = defineStore('warrant', () => {
  // -------------------------
  // State
  // -------------------------

  const warrants = ref<Warrant[]>([])
  const selectedWarrant = ref<Warrant | null>(null)
  const searchKeyword = ref<string>('')
  const trialLogs = ref<TrialLog[]>([])
  const isLoadingWarrants = ref<boolean>(false)
  const isLoadingTrialLogs = ref<boolean>(false)

  /** 權證清單載入錯誤（fetchWarrants 失敗時設定） */
  const errorMessage = ref<string | null>(null)

  /** 試算記錄載入錯誤（fetchTrialLogs 失敗時設定，與 errorMessage 獨立） */
  const trialLogsError = ref<string | null>(null)

  // -------------------------
  // Actions
  // -------------------------

  async function fetchWarrants(): Promise<void> {
    isLoadingWarrants.value = true
    errorMessage.value = null
    try {
      warrants.value = await getWarrants()
    } catch (err) {
      errorMessage.value = err instanceof Error ? err.message : '載入權證清單失敗'
    } finally {
      isLoadingWarrants.value = false
    }
  }

  // debounce API 呼叫，避免逐字輸入打出過多請求
  const fetchWarrantsByKeyword = debounce(async (keyword: string) => {
    isLoadingWarrants.value = true
    errorMessage.value = null
    try {
      warrants.value = await getWarrants(keyword)
    } catch (err) {
      errorMessage.value = err instanceof Error ? err.message : '載入權證清單失敗'
    } finally {
      isLoadingWarrants.value = false
    }
  }, 300)

  function setSearchKeyword(value: string): void {
    searchKeyword.value = value
    fetchWarrantsByKeyword(value)
  }

  async function selectWarrant(warrant: Warrant): Promise<void> {
    selectedWarrant.value = warrant
    trialLogs.value = []
    await fetchTrialLogs(warrant.warrantId)
  }

  async function fetchTrialLogs(warrantId: string): Promise<void> {
    isLoadingTrialLogs.value = true
    trialLogsError.value = null
    try {
      trialLogs.value = await getTrialLogs(warrantId)
    } catch (err) {
      trialLogsError.value = err instanceof Error ? err.message : '載入試算紀錄失敗'
      trialLogs.value = []
    } finally {
      isLoadingTrialLogs.value = false
    }
  }

  function prependTrialLog(log: TrialLog): void {
    trialLogs.value = [log, ...trialLogs.value].slice(0, 10)
  }

  return {
    warrants,
    selectedWarrant,
    searchKeyword,
    trialLogs,
    isLoadingWarrants,
    isLoadingTrialLogs,
    errorMessage,
    trialLogsError,
    setSearchKeyword,
    fetchWarrants,
    selectWarrant,
    fetchTrialLogs,
    prependTrialLog,
  }
})
