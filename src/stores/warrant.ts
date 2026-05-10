import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { Warrant, TrialLog } from '@/types/warrant'
import { getWarrants, getTrialLogs } from '@/api/warrant'

/**
 * 手動 debounce 工具函式（避免引入額外依賴）
 * @param fn 要 debounce 的函式
 * @param delay 延遲毫秒數
 */
function debounce<T extends (...args: Parameters<T>) => void>(fn: T, delay: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null
  return ((...args: Parameters<T>) => {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }) as T
}

export const useWarrantStore = defineStore('warrant', () => {
  // -------------------------
  // State
  // -------------------------

  /** 所有權證清單（從 API 取得） */
  const warrants = ref<Warrant[]>([])

  /** 當前選中的權證 */
  const selectedWarrant = ref<Warrant | null>(null)

  /** 搜尋關鍵字（即時更新，debounce 僅用於 filteredWarrants 計算觸發） */
  const searchKeyword = ref<string>('')

  /** 內部 debounced 關鍵字（供 filteredWarrants computed 使用） */
  const debouncedKeyword = ref<string>('')

  /** 試算歷史紀錄（切換權證時 lazy load，最近 10 筆） */
  const trialLogs = ref<TrialLog[]>([])

  /** 是否正在載入權證清單 */
  const isLoadingWarrants = ref<boolean>(false)

  /** 是否正在載入試算紀錄 */
  const isLoadingTrialLogs = ref<boolean>(false)

  /** 錯誤訊息（供元件顯示用） */
  const errorMessage = ref<string | null>(null)

  // -------------------------
  // Debounce 更新
  // -------------------------

  const updateDebouncedKeyword = debounce((value: string) => {
    debouncedKeyword.value = value
  }, 300)

  /** 設定搜尋關鍵字（含 300ms debounce） */
  function setSearchKeyword(value: string): void {
    searchKeyword.value = value
    updateDebouncedKeyword(value)
  }

  // -------------------------
  // Computed
  // -------------------------

  /**
   * 過濾後的權證清單
   * 依據 debouncedKeyword（300ms debounce）過濾，不觸發額外 API
   */
  const filteredWarrants = computed<Warrant[]>(() => {
    const keyword = debouncedKeyword.value.trim().toLowerCase()
    if (!keyword) return warrants.value
    return warrants.value.filter(
      (w) =>
        w.warrantId.toLowerCase().includes(keyword) ||
        w.warrantType.toLowerCase().includes(keyword),
    )
  })

  // -------------------------
  // Actions
  // -------------------------

  /**
   * 從 API 拉取所有權證清單
   */
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

  /**
   * 切換選中的權證，並 lazy load 該權證的試算紀錄
   * @param warrant 要選中的權證
   */
  async function selectWarrant(warrant: Warrant): Promise<void> {
    selectedWarrant.value = warrant
    trialLogs.value = []
    await fetchTrialLogs(warrant.warrantId)
  }

  /**
   * 載入指定權證的試算歷史紀錄（最近 10 筆）
   * @param warrantId 權證代碼
   */
  async function fetchTrialLogs(warrantId: string): Promise<void> {
    isLoadingTrialLogs.value = true
    try {
      trialLogs.value = await getTrialLogs(warrantId)
    } catch (err) {
      errorMessage.value = err instanceof Error ? err.message : '載入試算紀錄失敗'
      trialLogs.value = []
    } finally {
      isLoadingTrialLogs.value = false
    }
  }

  /**
   * 在外部儲存成功後，將新紀錄加入 trialLogs（避免重新 fetch）
   * 僅保留最近 10 筆
   * @param log 新的試算紀錄
   */
  function prependTrialLog(log: TrialLog): void {
    trialLogs.value = [log, ...trialLogs.value].slice(0, 10)
  }

  return {
    // state
    warrants,
    selectedWarrant,
    searchKeyword,
    trialLogs,
    isLoadingWarrants,
    isLoadingTrialLogs,
    errorMessage,
    // computed
    filteredWarrants,
    // actions
    setSearchKeyword,
    fetchWarrants,
    selectWarrant,
    fetchTrialLogs,
    prependTrialLog,
  }
})
