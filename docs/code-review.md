# Frontend Code Review — 權證避險試算系統

**審查範圍**：`src/` 全部前端原始碼  
**對照規範**：`task.md`（v4）、`docs/api.md`  
**審查日期**：2026-05-11  

---

## 一、總覽

| 評核項目 | 狀態 | 說明 |
|---|---|---|
| 金融數值精度 | ⚠️ 部分問題 | 履約價顯示截斷；時區處理有隱患 |
| API 冪等性 | ⚠️ 設計缺口 | Key 在函式內部產生，無法支援重試語意 |
| UI 易用性 | ✅ 整體良好 | 虛擬捲動、debounce、RWD Drawer 均已實作 |
| 錯誤處理 | ✅ 完整 | try/catch 覆蓋所有 API 呼叫，ApiError 統一格式 |
| 測試覆蓋 | ✅ 35 tests / 35 pass | API、Store、Composable 均有單元測試 |

---

## 二、金融數值精度

### 🔴 BUG-01：履約價顯示截斷為 2 位小數

**位置**
- `src/components/CalculatorPanel.vue` line 101
- `src/components/WarrantListItem.vue` line 13–17

**現況**
```html
<!-- CalculatorPanel.vue -->
履約價 {{ store.selectedWarrant.strikePrice.toFixed(2) }}
```
```ts
// WarrantListItem.vue
const formatStrikePrice = (val: number): string =>
  new Intl.NumberFormat('zh-TW', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,  // ← 截斷到 2 位
  }).format(val)
```

**問題**  
資料庫欄位為 `DECIMAL(18,4)`，2 位小數會靜默截斷精度（例如 `12.2512` 顯示為 `12.25`）。`conversionRatio` 已正確使用 `.toFixed(4)`，但 `strikePrice` 遺漏。

**修正**
```html
<!-- CalculatorPanel.vue -->
履約價 {{ store.selectedWarrant.strikePrice.toFixed(4) }}
```
```ts
// WarrantListItem.vue
minimumFractionDigits: 2,
maximumFractionDigits: 4,   // 至多 4 位，避免尾零多餘
```

---

### 🟡 BUG-02：`createdTime` 時區解析不穩定

**位置**：`src/components/HistoryTable.vue` line 11

**現況**
```ts
const formatTime = (iso: string): string => {
  const date = new Date(iso)   // iso = "2026-05-10T18:30:00"（無時區後綴）
  ...
}
```

**問題**  
後端 API 文件明確說明 `createdTime` 為「台灣時間 UTC+8，無時區後綴」。  
依 ECMAScript 規範，`new Date("2026-05-10T18:30:00")` **在缺少時區後綴時視為本地時間**。  
若使用者瀏覽器設定的時區不是 UTC+8（例如在海外），顯示時間將偏移。

**修正選項 A（建議）**：後端補上 `+08:00` 後綴（一勞永逸）。  
**修正選項 B（前端自理）**：
```ts
// 將無後綴的字串手動附加 +08:00 再解析
const date = new Date(iso.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(iso)
  ? iso
  : iso + '+08:00')
```

---

### ℹ️ INFO-01：JavaScript `number` 的 IEEE 754 限制

`Warrant` / `TrialLog` / `TrialCalculation` 型別中的金融欄位均使用 JS `number`（64-bit float），理論上對 DECIMAL(18,4) 可能有精度風險。  
**但**：核心計算已移至後端（C# `decimal`），前端僅顯示結果，且股價範圍遠小於 IEEE 754 安全整數上限（2⁵³）。  
→ 目前風險可接受，無需立即行動。如需更嚴格，可在 `TrialCalculation` 介面加上說明，或改用 `string` 傳輸再由前端格式化。

---

## 三、API 冪等性

### 🔴 BUG-03：Idempotency Key 在函式內部產生，無法支援重試語意

**位置**：`src/api/warrant.ts` — `saveTrialLog()`

**現況**
```ts
export async function saveTrialLog(
  warrantId: string,
  payload: SaveTrialLogPayload,
): Promise<TrialLog> {
  const response = await apiClient.post<TrialLog>(
    `/warrants/${encodeURIComponent(warrantId)}/trial-logs`,
    payload,
    { headers: { 'X-Idempotency-Key': crypto.randomUUID() } },  // ← 每次呼叫都產生新 Key
  )
  return response.data
}
```

**問題**  
API 文件定義的語意是：
> 同一個 `X-Idempotency-Key` 重複送出時，回傳已儲存的記錄而不重複寫入。  
> **網路錯誤重試時使用同一個 key。**

當 `saveTrialLog` 因網路超時（伺服器已寫入、回應未送達）而拋出例外，`CalculatorPanel.handleSave` 的 `catch` 只顯示錯誤訊息。使用者再次點擊「儲存」時，`saveTrialLog` 產生**新的 UUID**，伺服器無法辨識為重複請求 → 寫入重複紀錄。

**根本原因**：Key 的生命週期應與「使用者的一次儲存意圖」相同，而非與「函式呼叫」相同。

**修正方向**

Step 1：`saveTrialLog` 接收外部傳入的 Key：
```ts
export async function saveTrialLog(
  warrantId: string,
  payload: SaveTrialLogPayload,
  idempotencyKey: string,             // ← 由呼叫方管理
): Promise<TrialLog> {
  const response = await apiClient.post<TrialLog>(
    `/warrants/${encodeURIComponent(warrantId)}/trial-logs`,
    payload,
    { headers: { 'X-Idempotency-Key': idempotencyKey } },
  )
  return response.data
}
```

Step 2：`CalculatorPanel` 在「計算結果出現」時產生 Key，重試時沿用同一個：
```ts
// 當 calculation 變更時，產生新的 Key（代表新的儲存意圖）
const idempotencyKey = ref<string | null>(null)
watch(calculation, (newVal) => {
  idempotencyKey.value = newVal ? crypto.randomUUID() : null
})

async function handleSave(): Promise<void> {
  if (!canSave.value || !idempotencyKey.value || ...) return
  isSaving.value = true
  try {
    const log = await saveTrialLog(
      store.selectedWarrant!.warrantId,
      { ... },
      idempotencyKey.value,           // ← 重試時同一個 Key
    )
    idempotencyKey.value = null       // 儲存成功後廢棄 Key
    ...
  } catch { ... }
}
```

---

## 四、UI 易用性

### 🟡 UX-01：切換權證後市價未重置

**位置**：`src/components/CalculatorPanel.vue`

**現況**：使用者選擇另一個權證時，`marketPrice` ref 保留前一個權證輸入的價格，並立即用該價格對新權證觸發試算。

**影響**：使用者可能看到舊市價搭配新權證的計算結果，誤以為是正確的當前試算。

**修正**：在 `store.selectedWarrant` 改變時清空 `marketPrice`：
```ts
watch(
  () => store.selectedWarrant?.warrantId,
  () => { marketPrice.value = null },
)
```

---

### 🟡 UX-02：HistoryTable 出現雙重 Loading 指示器

**位置**：`src/components/HistoryTable.vue`

**現況**
```html
<template #title>
  <a-spin v-if="store.isLoadingTrialLogs" size="small" />  <!-- 指示器 1 -->
</template>
<a-table :loading="store.isLoadingTrialLogs" ...>          <!-- 指示器 2 -->
```

`a-table` 的 `:loading` prop 已內建 overlay 效果，同時顯示標題列的 `<a-spin>` 造成重複。

**修正**：移除 `<template #title>` 中的 `<a-spin>`，僅保留 `a-table` 的 `:loading`。

---

### 🟢 UX-03（加分）：已實作項目確認

以下需求均已正確實作：

| 需求 | 實作位置 | 狀態 |
|---|---|---|
| 左側 800 筆清單 | `getWarrants` `pageSize=1000` + `RecycleScroller` | ✅ |
| 代碼關鍵字搜尋（300ms debounce） | `stores/warrant.ts` `setSearchKeyword` | ✅ |
| 輸入股價即時反映試算（300ms debounce） | `useTrialCalculation.ts` | ✅ |
| 後端 `/calculate` API（不自行計算） | `useTrialCalculation` 呼叫後端 | ✅ |
| 儲存按鈕 + Toast 提示 | `CalculatorPanel.handleSave` + `message.success` | ✅ |
| 最近 10 筆歷史明細 | `stores/warrant.ts` `prependTrialLog` slice(0,10) | ✅ |
| 切換權證 lazy load 歷史 | `selectWarrant` 呼叫 `fetchTrialLogs` | ✅ |
| 股價 ≤ 0 禁止存檔 | `canSave` computed + API 層防守 | ✅ |
| RWD（手機 Drawer / 桌機 Sider） | `App.vue` + `WarrantSider.vue` | ✅ |
| 錯誤狀態 + 重新載入按鈕 | `SiderContent.vue` | ✅ |
| 4 位小數金融數值顯示 | `formatPrice` / `formatQty` `Intl.NumberFormat` | ✅ |

---

## 五、其他觀察

### 🟢 架構優點

- **`ApiError` 統一錯誤格式**（`src/api/index.ts`）：response interceptor 統一將後端 `message` 欄位轉換，元件層直接讀 `err.message`，不需各自解析。
- **`useTrialCalculation` 清空語意正確**：當 `warrantId` 為 `null` 時立即清空 `calculation` 與 `calcError`，不殘留舊資料。
- **`canSave` 多重防守**：`calculation !== null` 確保只有在後端計算完成後才能存檔，避免存入 `undefined` 或前端計算值。
- **虛擬捲動**：`RecycleScroller` 處理 800 筆清單，DOM 節點數量保持恆定，無效能問題。

### 🟡 可改善項目

- **`filteredWarrants` 同時搜尋 `warrantType`**（`stores/warrant.ts` line 74）：task.md 規範只提及代碼搜尋，支援輸入 "CALL"/"PUT" 過濾屬額外功能，應在 README 說明此行為，或移除以符合規範。
- **`selectWarrant` 與 `errorMessage` 共用**：`fetchTrialLogs` 失敗會覆蓋 `fetchWarrants` 的錯誤訊息（兩者共用 `errorMessage` ref）。建議分開為 `trialLogsError` 以避免訊息混用。
- **`a-input-number :min="0.0001"`**：此設定防止直接輸入 0，但不阻止用戶先清空後再輸入無效值，`watch` 的防守邏輯已覆蓋此情境，目前行為正確。

---

## 六、優先修正清單

| 優先 | ID | 檔案 | 說明 |
|---|---|---|---|
| 🔴 必修 | BUG-01 | `CalculatorPanel.vue`, `WarrantListItem.vue` | 履約價改為 4 位小數 |
| 🔴 必修 | BUG-03 | `api/warrant.ts`, `CalculatorPanel.vue` | Idempotency Key 移到呼叫方管理 |
| 🟡 建議 | BUG-02 | `HistoryTable.vue` | `createdTime` 補上 `+08:00` 解析 |
| 🟡 建議 | UX-01 | `CalculatorPanel.vue` | 切換權證時清空 `marketPrice` |
| 🟡 建議 | UX-02 | `HistoryTable.vue` | 移除重複 Loading 指示器 |
