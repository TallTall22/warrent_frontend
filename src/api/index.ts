import axios, { type AxiosError } from 'axios'

/**
 * 後端 API 錯誤回應格式
 */
interface ApiErrorResponse {
  message?: string
  success?: boolean
}

/**
 * 統一 API 錯誤格式
 * 取 err.response.data.message，否則使用通用訊息
 */
export class ApiError extends Error {
  public readonly statusCode: number | undefined

  constructor(message: string, statusCode?: number) {
    super(message)
    this.name = 'ApiError'
    this.statusCode = statusCode
  }
}

/**
 * Axios instance
 * baseURL 從環境變數 VITE_API_BASE_URL 讀取，預設 /api
 */
const apiClient = axios.create({
  baseURL: import.meta.env['VITE_API_BASE_URL'] ?? '/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
})

// Request 攔截器：可在此加入 Auth Token
apiClient.interceptors.request.use(
  (config) => {
    // 預留：const token = localStorage.getItem('token')
    // if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  },
  (error: AxiosError) => Promise.reject(error),
)

// Response 攔截器：統一錯誤格式
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorResponse>) => {
    const serverMessage = error.response?.data?.message
    const statusCode = error.response?.status

    const friendlyMessage =
      serverMessage ??
      (statusCode === 404
        ? '找不到指定資源'
        : statusCode === 500
          ? '伺服器內部錯誤，請稍後再試'
          : statusCode === 401
            ? '未授權，請重新登入'
            : '網路連線異常，請確認網路狀態')

    return Promise.reject(new ApiError(friendlyMessage, statusCode))
  },
)

export default apiClient
