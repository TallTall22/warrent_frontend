# Frontend Code Review v2 — 權證避險試算系統

**審查範圍**：`src/` 全部前端原始碼（含測試）  
**對照規範**：`task.md`（v4）、`docs/api.md`  
**前次報告**：`docs/code-review.md`（2026-05-11）  
**本次審查日期**：2026-05-11  
**審查人**：Expert Code Review（第二輪，最終版）

---

## 一、前次缺陷修正狀態

| ID | 說明 | 狀態 |
|---|---|---|
| BUG-01 | 履約價顯示截斷為 2 位小數 | ✅ **已修正**（`CalculatorPanel` `.toFixed(4)`，`WarrantListItem` `maxFractionDigits:4`） |
| BUG-02 | `createdTime` 時區解析不穩定 | ✅ **已修正**（`HistoryTable` regex check + `+08:00` 補綴） |
| BUG-03 | Idempotency Key 在函式內部產生 | ✅ **已修正**（Key 由 `CalculatorPanel` 持有，`saveTrialLog` 接收外部 Key） |
| UX-01 | 切換權證後市價未重置 | ✅ **已修正**（`watch` 於 `warrantId` 改變時清空 `marketPrice`） |
| UX-02 | HistoryTable 雙重 Loading 指示器 | ✅ **已修正**（移除標題列 `<a-spin>`，僅保留 `:loading` prop） |

**前次所有問題已全部修正。** 以下為本輪新發現的問題。

---

## 二、新發現問題總覽

| 優先 | ID | 檔案 | 說明 |
|---|---|---|---|
| 🔴 | BUG-04 | `stores/warrant.ts` | `errorMessage` 共用導致試算記錄載入失敗時權證清單消失 |
| 🔴 | BUG-05 | `components/CalculatorPanel.vue` | 儲存成功後重複點擊「儲存」，客戶端歷史清單出現重複紀錄 |
| 🔴 | BUG-06 | `components/CalculatorPanel.vue` | `canSave` 未排除 `isCalculating`，可能儲存舊試算結果 |
| 🟡 | BUG-07 | `composables/useTrialCalculation.ts` | 併發請求無取消機制，舊回應可能覆蓋新結果（Race Condition） |
| 🟡 | BUG-08 | `composables/useTrialCalculation.ts` | `debounce` 計時器未在元件卸載時清除 |
| 🟡 | CODE-01 | `composables/useHedgeCalc.ts` | 此檔案為死碼（Dead Code），未被任何元件使用 |
| 🟡 | CODE-02 | `stores/warrant.ts` / `composables/useTrialCalculation.ts` | `debounce` 工具函式重複定義於兩個檔案 |
| 🟡 | CODE-03 | `components/CalculatorPanel.vue` / `components/HistoryTable.vue` | `formatPrice` / `formatQty` 重複定義於兩個元件 |
| 🟢 | UX-04 | `components/CalculatorPanel.vue` | 儲存成功後未禁用再次儲存，UX 誘導重複操作 |
| 🟢 | TEST-01 | `src/components/` | 元件層（CalculatorPanel、HistoryTable）無任何測試 |
| 🟢 | TEST-02 | `vitest.config.ts` | Coverage include 設定未涵蓋 `src/components/**` |
| 🟢 | A11Y-01 | `components/WarrantListItem.vue` | `aria-selected` 用於 `role="button"` 違反 ARIA 規範 |
| 🟢 | PKG-01 | `package.json` | `@ant-design/icons-vue` 被列為 `devDependencies` |

---

## 三、問題詳細說明

---

### 🔴 BUG-04：`errorMessage` 共用導致試算記錄載入失敗時清單消失

**位置**：`src/stores/warrant.ts`  line 113–122 / `src/components/SiderContent.vue` line 45–58

**現況**

```ts
// stores/warrant.ts — fetchTrialLogs
async function fetchTrialLogs(warrantId: string): Promise<void> {
  isLoadingTrialLogs.value = true
  try {
    trialLogs.value = await getTrialLogs(warrantId)
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '載入試算紀錄失敗'
    //              ↑ 覆蓋了 fetchWarrants 共用的 errorMessage
    trialLogs.value = []
  } finally {
    isLoadingTrialLogs.value = false
  }
}
```

```vue
<!-- SiderContent.vue — 顯示邏輯 -->
<div v-if="store.isLoadingWarrants" ...>           <!-- 載入中 -->
<div v-else-if="store.errorMessage" ...>           <!-- ← 條件觸發！ -->
  <a-alert type="error" :message="store.errorMessage" />
  <a-button @click="store.fetchWarrants()">重新載入</a-button>  <!-- ← 誤觸整列重載 -->
</div>
<RecycleScroller v-else ...>                       <!-- 被隱藏 -->
```

**問題**  
`fetchWarrants` 與 `fetchTrialLogs` 共用同一個 `errorMessage` ref。當使用者點選任一權證後，若後端的 `GET /trial-logs` 回傳失敗（例如 500 或網路逾時），`errorMessage` 被設為試算紀錄錯誤訊息，`SiderContent.vue` 的 `v-else-if` 條件命中，整個權證清單消失，顯示「重新載入」按鈕。

使用者點擊「重新載入」觸發的是 `store.fetchWarrants()`（重新拉取 1000 筆清單），而非重新載入試算記錄，**操作不符合使用者預期**。

**修正方向**

```ts
// stores/warrant.ts
const trialLogsError = ref<string | null>(null)  // 獨立的試算記錄錯誤狀態

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
```

`HistoryTable.vue` 改用 `store.trialLogsError` 顯示錯誤，`SiderContent.vue` 的 `errorMessage` 僅反映 `fetchWarrants` 失敗，兩者互不影響。

---

### 🔴 BUG-05：儲存成功後重複點擊「儲存」，歷史清單出現重複條目

**位置**：`src/components/CalculatorPanel.vue` line 76–105

**現況**

```ts
async function handleSave(): Promise<void> {
  // ...
  try {
    const log = await saveTrialLog(...)
    store.prependTrialLog(log)     // 加入歷史清單
    message.success('試算結果已儲存')
    // ← idempotencyKey 未被重置，calculation 未被清空
  } catch { ... }
  finally {
    isSaving.value = false         // ← canSave 再次為 true
  }
}
```

**問題**  
儲存成功後：
- `idempotencyKey.value` 保持原 UUID 不變
- `calculation.value` 保持原計算結果不變
- `isSaving.value = false` → `canSave = true`

使用者可立即再次點擊「儲存」。第二次請求帶相同的 `X-Idempotency-Key`，後端正確返回 HTTP 200 + 同一筆 `TrialLog`（冪等行為）。但前端的 `store.prependTrialLog(log)` 被再次呼叫，**將同一筆 logId 加入清單頂端，歷史清單出現重複條目**。

**修正方向**

儲存成功後立即廢棄 Key，使 `canSave` 變為 false，強制使用者重新輸入才能再次儲存：

```ts
const log = await saveTrialLog(...)
store.prependTrialLog(log)
idempotencyKey.value = null   // ← 廢棄 Key，防止重複儲存
message.success('試算結果已儲存')
```

---

### 🔴 BUG-06：`canSave` 未排除 `isCalculating` 狀態，可能儲存錯誤數據

**位置**：`src/components/CalculatorPanel.vue` line 65–74

**現況**

```ts
const canSave = computed<boolean>(() => {
  return (
    store.selectedWarrant !== null &&
    marketPrice.value !== null &&
    marketPrice.value > 0 &&
    calculation.value !== null &&
    idempotencyKey.value !== null &&
    !isSaving.value
    // !isCalculating.value ← 缺少此判斷
  )
})
```

**觸發場景**

1. 使用者輸入股價 **110**，debounce 300ms 後觸發計算，取回結果 A（理論價 1.0元）
2. 使用者修改股價為 **120**，debounce 計時開始
3. 在 debounce 300ms 期間：`calculation.value` 仍為結果 A，`idempotencyKey` 未變，`canSave = true`
4. 使用者點擊「儲存」→ **儲存的是股價 110 的試算結果，但輸入框顯示 120**

此時 UI 顯示：**輸入欄 = 120、理論價值 = 1.0（對應 110 的計算）**，使用者可能誤以為儲存的是 120 的結果。

**修正**

```ts
const canSave = computed<boolean>(() => {
  return (
    store.selectedWarrant !== null &&
    marketPrice.value !== null &&
    marketPrice.value > 0 &&
    calculation.value !== null &&
    idempotencyKey.value !== null &&
    !isSaving.value &&
    !isCalculating.value   // ← 加入：計算進行中時禁止儲存
  )
})
```

同時，在 `useTrialCalculation` 的 watch 中，當輸入為有效值但計算尚未完成時，也應立即清空舊結果：

```ts
watch([warrantId, marketPrice], ([newId, newPrice]) => {
  if (newId === null || newPrice === null || newPrice <= 0) {
    calculation.value = null
    calcError.value = null
    isCalculating.value = false
    return
  }
  calculation.value = null   // ← 立即清空舊結果，防止儲存舊值
  debouncedCalculate(newId, newPrice)
})
```

---

### 🟡 BUG-07：併發請求無取消機制（Race Condition）

**位置**：`src/composables/useTrialCalculation.ts` line 42–52

**現況**

```ts
async function runCalculate(id: string, price: number): Promise<void> {
  isCalculating.value = true
  calcError.value = null
  try {
    calculation.value = await calculateWarrant(id, price)
    // ← 無 AbortController，先前的請求若後到，會覆蓋新結果
  } catch { ... }
}
```

**觸發場景**

使用者在兩個 >300ms 的停頓點各輸入不同股價：

1. 停頓 →「請求 A」發出（price=110），網路較慢
2. 再次停頓 →「請求 B」發出（price=120），網路正常
3. **請求 B 先回傳** → `calculation.value = B` ✅
4. **請求 A 後回傳** → `calculation.value = A`（錯誤，顯示 110 的結果給 120 的輸入）

在金融系統中，顯示錯誤的試算結果可能導致決策失誤。

**修正方向**

使用 `AbortController` 取消前一個未完成的請求：

```ts
let abortController: AbortController | null = null

async function runCalculate(id: string, price: number): Promise<void> {
  if (abortController) abortController.abort()
  abortController = new AbortController()
  isCalculating.value = true
  calcError.value = null
  try {
    calculation.value = await calculateWarrant(id, price, abortController.signal)
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return
    calcError.value = err instanceof Error ? err.message : '試算失敗，請稍後再試'
    calculation.value = null
  } finally {
    isCalculating.value = false
  }
}
```

`src/api/warrant.ts` 的 `calculateWarrant` 對應加入 `signal` 參數並傳入 axios config。

---

### 🟡 BUG-08：`debounce` 計時器未在元件卸載時清除

**位置**：`src/composables/useTrialCalculation.ts` line 56

**現況**

```ts
const debouncedCalculate = debounce(runCalculate, 300)
// ← 無 onUnmounted 清除計時器
```

**問題**  
`useTrialCalculation` 在 `CalculatorPanel.vue` 中使用，而 `CalculatorPanel` 僅在選中權證時顯示（`v-if="store.selectedWarrant"`）。若使用者快速切換（選中→取消選中），`CalculatorPanel` 被卸載，但已排程的 `setTimeout` 可能在卸載後觸發，呼叫 `runCalculate` 並嘗試更新已卸載的 `ref`，引發 Vue 警告或非預期的 API 呼叫。

**修正**

```ts
import { ref, watch, onUnmounted, type Ref } from 'vue'

// debounce 工具需回傳取消函式
let timer: ReturnType<typeof setTimeout> | null = null

const debouncedCalculate = (id: string, price: number) => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => runCalculate(id, price), 300)
}

onUnmounted(() => {
  if (timer) clearTimeout(timer)
})
```

---

### 🟡 CODE-01：`useHedgeCalc.ts` 為死碼（Dead Code）

**位置**：`src/composables/useHedgeCalc.ts`

**現況**

```bash
# 全專案搜尋：useHedgeCalc 無任何 import
src/composables/__tests__/useHedgeCalc.spec.ts  ← 僅測試引用，無生產使用
```

**問題**  
`useHedgeCalc.ts` 實作了前端的 Delta/理論價值計算邏輯，並有完整的 13 個單元測試。但 `CalculatorPanel.vue` 實際上使用 `useTrialCalculation`（呼叫後端 `/calculate` API），前端計算模組完全未被使用。

設計文件 `plan.md` 明確記載：
> 即時試算觸發：呼叫後端 /calculate（非前端計算）→ 確保計算邏輯唯一來源在後端

這意味著 `useHedgeCalc.ts` 是遺留的探索性實作，未完成清理。

**問題影響**

- 維護者閱讀程式碼時，無法判斷哪個計算邏輯才是「真正被使用的」
- 若後續有人誤將元件改為使用 `useHedgeCalc`，計算邏輯與後端脫鉤，可能產生不一致
- 死碼的測試形同贅述，增加維護負擔

**建議**  
若已確認永遠不使用前端計算（計算邏輯僅在後端），應刪除 `useHedgeCalc.ts` 及其測試；若考慮離線計算或 fallback 場景，應在 README 中明確說明其用途與啟用條件。

---

### 🟡 CODE-02：`debounce` 工具函式重複定義

**位置**：  
- `src/stores/warrant.ts` line 11–16  
- `src/composables/useTrialCalculation.ts` line 8–14

**現況**

```ts
// 兩個檔案各自定義完全相同的 debounce 函式
function debounce<T extends (...args: Parameters<T>) => void>(fn: T, delay: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null
  return ((...args: Parameters<T>) => {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }) as T
}
```

**建議**  
提取至 `src/utils/debounce.ts` 並共用：

```ts
// src/utils/debounce.ts
export function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay: number,
): T { ... }
```

---

### 🟡 CODE-03：`formatPrice` / `formatQty` 重複定義

**位置**：  
- `src/components/CalculatorPanel.vue` line 45–56  
- `src/components/HistoryTable.vue` line 27–39

**現況**

```ts
// 兩個元件各自定義完全相同的格式化函式
const formatPrice = (val: number): string =>
  new Intl.NumberFormat('zh-TW', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(val)

const formatQty = (val: number): string =>
  new Intl.NumberFormat('zh-TW', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val)
```

**建議**  
提取至 `src/utils/formatters.ts`，兩個元件共同 import，確保格式化行為一致且易於修改。

---

### 🟢 UX-04：儲存成功後未明確禁用「儲存」，誘導使用者重複操作

**位置**：`src/components/CalculatorPanel.vue`

**現況**  
儲存成功後，按鈕立即恢復可點擊狀態（`isSaving = false`），使用者可能誤以為需要再次點擊確認，或期望看到確認後的某種狀態變化。

**建議**  
結合 BUG-05 的修正（儲存後 `idempotencyKey = null`），按鈕自動變灰，並在 `calculation` 的次要文字加入「已儲存」標記（例如將按鈕改為「已儲存」並保持 disabled 直到使用者重新輸入），給予使用者清晰的操作回饋。

---

### 🟢 TEST-01：`CalculatorPanel.vue` 缺乏元件層測試

**位置**：`src/components/`

**現況**  
全部四個元件（`CalculatorPanel`、`HistoryTable`、`SiderContent`、`WarrantListItem`）均無對應的 `.spec.ts` 測試。

`CalculatorPanel` 包含複雜邏輯：
- `canSave` 多條件計算
- `handleSave` 錯誤重試保留 idempotencyKey 的語意
- 切換權證清空 marketPrice 的 watch 行為

這些邏輯目前只能靠手動測試驗證，存在回歸風險。

**建議至少補充以下測試案例：**

| 測試案例 | 驗證點 |
|---|---|
| calculation 存在但 isCalculating 中，canSave 應為 false | BUG-06 修正驗證 |
| 儲存成功後 idempotencyKey 清空，canSave 變 false | BUG-05 修正驗證 |
| 儲存失敗後 idempotencyKey 保留，重試可使用同一 Key | 冪等重試語意 |
| 切換權證後 marketPrice 清空 | UX-01 回歸測試 |

---

### 🟢 TEST-02：Coverage 設定未涵蓋元件層

**位置**：`vitest.config.ts` line 18

**現況**

```ts
coverage: {
  include: ['src/composables/**', 'src/api/**', 'src/stores/**'],
  // ← 缺少 'src/components/**'
}
```

元件層包含 `canSave`、`handleSave` 等業務邏輯，不應被排除在覆蓋率之外。

**建議**

```ts
include: ['src/composables/**', 'src/api/**', 'src/stores/**', 'src/components/**'],
```

---

### 🟢 A11Y-01：`aria-selected` 搭配 `role="button"` 違反 ARIA 規範

**位置**：`src/components/WarrantListItem.vue` line 29–30

**現況**

```html
<div
  role="button"
  :aria-selected="props.isSelected"   <!-- ← aria-selected 不適用於 role="button" -->
  @click="emit('select')"
>
```

**問題**  
`aria-selected` 僅允許用於 `option`、`row`、`gridcell`、`tab`、`treeitem` 等角色。搭配 `role="button"` 會被瀏覽器的 accessibility tree 忽略或產生無效的 ARIA 屬性，螢幕閱讀器無法正確宣告「已選中」狀態。

**修正**

```html
<div
  role="option"
  :aria-selected="props.isSelected"
  :tabindex="props.isSelected ? 0 : -1"
  @click="emit('select')"
  @keydown.enter.space.prevent="emit('select')"
>
```

外層 `RecycleScroller` 或其容器應添加 `role="listbox"` 使 ARIA 階層完整。

---

### 🟢 PKG-01：`@ant-design/icons-vue` 列於 `devDependencies`

**位置**：`package.json` line 21

**現況**

```json
"devDependencies": {
  "@ant-design/icons-vue": "^7.0.1",
  ...
}
```

**問題**  
`@ant-design/icons-vue` 是 `ant-design-vue` 的 peer dependency，在 ant-design-vue 元件內部被隱式使用（例如 `<a-input-search>` 的搜尋圖示、`<a-alert>` 的警告圖示）。Vite 打包時 devDependencies 也會被 bundle，因此生產 build 不受影響。但這違反了 `devDependencies` 的語意（僅開發工具），若改為 Node.js 服務端 bundle 或執行 `npm install --production`，可能出現缺少模組錯誤。

**建議**：移至 `dependencies`。

---

## 四、確認正確的設計決策

以下設計已驗證符合規範，無需修改：

| 設計 | 位置 | 評估 |
|---|---|---|
| Idempotency Key 由呼叫方（CalculatorPanel）持有，失敗重試保留同一 Key | `CalculatorPanel.vue` line 32–35 | ✅ 符合冪等重試語意 |
| `pageSize: 1000` 一次取回所有權證，搭配 RecycleScroller 虛擬捲動 | `api/warrant.ts` line 6 | ✅ 800 筆在限制內，DOM 節點數恆定 |
| 後端 `/calculate` 純計算，前端不自行計算理論價值 | `useTrialCalculation.ts` | ✅ 確保計算邏輯唯一來源 |
| `encodeURIComponent(warrantId)` 防止路徑注入 | `api/warrant.ts` line 13, 25, 43 | ✅ 安全 |
| `canSave` 要求 `calculation !== null` 確保後端計算完成才可存檔 | `CalculatorPanel.vue` line 65 | ✅（但缺 `!isCalculating`，見 BUG-06） |
| ApiError 攔截器統一錯誤格式，元件直接讀 `err.message` | `api/index.ts` line 49–66 | ✅ 清晰一致 |
| `formatTime` 補 `+08:00` 確保非 UTC+8 瀏覽器正確顯示台灣時間 | `HistoryTable.vue` line 11–24 | ✅ 正確處理 |
| `columns` 無響應式依賴但宣告為 `computed` | `HistoryTable.vue` line 41 | 🔵 無害（computed 會在無依賴時只算一次），但可改為 `const` |
| 搜尋同時支援 `warrantId` 與 `warrantType` 關鍵字 | `stores/warrant.ts` line 73–77 | 🔵 超出規範但屬加分功能，應在 README 說明 |

---

## 五、修正優先清單（依影響由高至低）

| 優先 | ID | 檔案 | 一行說明 | 預估工時 |
|---|---|---|---|---|
| 🔴 必修 | BUG-04 | `stores/warrant.ts` + `SiderContent.vue` | 獨立 `trialLogsError`，清單不因試算記錄失敗而消失 | 30 min |
| 🔴 必修 | BUG-05 | `CalculatorPanel.vue` | 儲存成功後 `idempotencyKey = null`，防止客戶端重複條目 | 5 min |
| 🔴 必修 | BUG-06 | `CalculatorPanel.vue` + `useTrialCalculation.ts` | `canSave` 加入 `!isCalculating`，輸入變動立即清空舊結果 | 15 min |
| 🟡 建議 | BUG-07 | `useTrialCalculation.ts` + `api/warrant.ts` | AbortController 取消過期請求 | 45 min |
| 🟡 建議 | BUG-08 | `useTrialCalculation.ts` | `onUnmounted` 清除 debounce 計時器 | 10 min |
| 🟡 建議 | CODE-01 | `useHedgeCalc.ts` | 確認後刪除死碼及其測試 | 5 min |
| 🟡 建議 | CODE-02 | 多處 | 提取 `src/utils/debounce.ts` | 10 min |
| 🟡 建議 | CODE-03 | 多處 | 提取 `src/utils/formatters.ts` | 10 min |
| 🟢 次要 | UX-04 | `CalculatorPanel.vue` | 儲存後按鈕加入「已儲存」確認回饋 | 15 min |
| 🟢 次要 | TEST-01 | 補 `CalculatorPanel.spec.ts` | 涵蓋 canSave、handleSave 邏輯 | 60 min |
| 🟢 次要 | TEST-02 | `vitest.config.ts` | coverage include 加入 `src/components/**` | 2 min |
| 🟢 次要 | A11Y-01 | `WarrantListItem.vue` | `aria-selected` 改用正確 ARIA role | 20 min |
| 🟢 次要 | PKG-01 | `package.json` | `@ant-design/icons-vue` 移至 `dependencies` | 2 min |

---

## 六、總結

**已修正（5/5）**：前次報告全部問題均已正確修正，特別是 BUG-03 的 Idempotency Key 設計改動最為關鍵，方向完全正確。

**本輪新發現（13 項）**：  
- 3 項🔴必修：`errorMessage` 共用問題（BUG-04）是最嚴重的 UX 回歸，會讓使用者在高負載時完全失去清單；BUG-05 與 BUG-06 是直接影響資料正確性的邏輯缺陷。  
- 5 項🟡建議：Race Condition（BUG-07）在金融場景需認真對待；死碼（CODE-01）與重複工具（CODE-02/03）應於提交前清理。  
- 5 項🟢次要：測試覆蓋與無障礙性問題，不影響功能但影響代碼品質評分。

**整體評價**：架構設計清晰，API 層、Store、Composable 分層職責明確，冪等性實作已完備。若完成🔴必修三項修正，整體品質可達提交標準。
