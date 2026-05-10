/**
 * 權證資料模型
 * 對應後端 Schema：Warrant_ID, Strike_Price, Conversion_Ratio, Warrant_Type, Position_Qty
 */
export interface Warrant {
  /** 權證代碼 VARCHAR(10) */
  warrantId: string
  /** 履約價 DECIMAL(18,4) */
  strikePrice: number
  /** 行使比例 DECIMAL(18,4) */
  conversionRatio: number
  /** 權證類型 */
  warrantType: 'CALL' | 'PUT'
  /** 庫存張數 INT */
  positionQty: number
}

/**
 * 試算紀錄
 * 對應後端 Schema：Log_ID, Warrant_ID, Market_Price, Theory_Price, Hedge_Qty, Created_Time
 */
export interface TrialLog {
  /** 紀錄編號 INT Identity */
  logId: number
  /** 權證代碼 */
  warrantId: string
  /** 標的市價 DECIMAL(18,4)，必須 > 0 */
  marketPrice: number
  /** 理論價值 DECIMAL(18,4) */
  theoryPrice: number
  /** 建議避險張數 DECIMAL(18,2) */
  hedgeQty: number
  /** 建立時間 ISO 8601 */
  createdTime: string
}

/**
 * 儲存試算紀錄的請求 Payload
 */
export interface SaveTrialLogPayload {
  warrantId: string
  /** 標的市價，後端負責計算 theoryPrice 與 hedgeQty */
  marketPrice: number
}

/**
 * API 回應通用包裝格式
 */
export interface ApiResponse<T> {
  data: T
  message?: string
  success: boolean
}
