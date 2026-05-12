# Frontend Code Review v3（最終版）— 權證避險試算系統

**審查範圍**：`src/` 全部前端原始碼（含測試、工具函式）  
**對照規範**：`task.md`（v4）、`docs/api.md`  
**前次報告**：`docs/code-review-v2.md`（2026-05-11）  
**本次審查日期**：2026-05-12  

---

## 一、前次 13 項問題修正狀態

| ID | 說明 | 狀態 |
|---|---|---|
| BUG-04 | `errorMessage` 共用導致試算記錄失敗時清單消失 | ✅ **已修正**（`trialLogsError` 獨立 ref，`HistoryTable` 用 `a-alert` 顯示） |
| BUG-05 | 儲存成功後重複點擊產生重複條目 | ✅ **已修正**（`idempotencyKey.value = null` 使按鈕立即 disabled） |
| BUG-06 | `canSave` 未排除 `isCalculating`，可能儲存舊結果 | ✅ **已修正**（`canSave` 加入 `!isCalculating.value`，watch 即時清空 `calculation`） |
| BUG-07 | 併發請求 Race Condition | ✅ **已修正**（`requestSeq` 序號模式，過期回應靜默丟棄） |
| BUG-08 | debounce 計時器未在卸載時清除 | ✅ **已修正**（`onUnmounted` + `debouncedCalculate.cancel()` + `requestSeq = Infinity`） |
| CODE-01 | `useHedgeCalc.ts` 死碼 | ✅ **已刪除**（含對應測試） |
| CODE-02 | `debounce` 重複定義 | ✅ **已修正**（提取至 `src/utils/debounce.ts`，兩處共用） |
| CODE-03 | `formatPrice`/`formatQty` 重複定義 | ✅ **已修正**（提取至 `src/utils/formatters.ts`，兩元件共用） |
| UX-04 | 儲存成功後按鈕未回饋禁用狀態 | ✅ **已修正**（Key 清空後按鈕自動 disabled） |
| TEST-01 | `CalculatorPanel.vue` 無元件層測試 | ✅ **已補充**（`CalculatorPanel.spec.ts`，覆蓋 canSave、冪等重試、切換重置） |
| TEST-02 | Coverage 未涵蓋元件層 | ✅ **已修正**（`vitest.config.ts` 加入 `src/components/**`） |
| A11Y-01 | `aria-selected` 用於錯誤 ARIA role | ✅ **已修正**（`role="option"` + `role="listbox"` 父容器） |
| PKG-01 | `@ant-design/icons-vue` 在 `devDependencies` | ✅ **已修正**（移至 `dependencies`） |

**前次所有 13 項問題均已正確修正。**

---

## 二、本輪新發現問題

| 優先 | ID | 檔案 | 說明 |
|---|---|---|---|
| 🟡 | TEST-03 | `composables/__tests__/useTrialCalculation.spec.ts` | 一個測試案例邏輯空洞，永遠通過（Vacuous Test） |
| 🟢 | A11Y-02 | `components/WarrantListItem.vue` | 所有選項 `tabindex="0"`，未實作 Roving Tabindex 模式 |
| 🟢 | API-01 | `api/index.ts` | Timeout 錯誤與一般網路錯誤訊息相同，難以區分 |

---

## 三、問題詳細說明

---

### 🟡 TEST-03：`useTrialCalculation.spec.ts` 有一個永遠通過的空洞測試

**位置**：`src/composables/__tests__/useTrialCalculation.spec.ts` line 118–134

**現況**

```ts
it('切換權證後舊的 calculation 清空', async () => {
  mockCalculate.mockResolvedValueOnce(calcResult)
  const warrantId = ref<string | null>('00001C')
  const marketPrice = ref<number | null>(110)   // ← 初始值非 null

  const { calculation } = useTrialCalculation(warrantId, marketPrice)

  vi.advanceTimersByTime(300)
  await nextTick()
  await nextTick()

  // 切換到 null
  warrantId.value = null
  await nextTick()

  expect(calculation.value).toBeNull()
})
```

**問題**

`useTrialCalculation` 的 watch 設定為 `{ immediate: false }`，因此建立 composable 時初始值 `warrantId='00001C'`、`marketPrice=110` **不會觸發 watch**，`debouncedCalculate` 從未被排程。`vi.advanceTimersByTime(300)` 沒有任何計時器可以觸發，`mockCalculate.mockResolvedValueOnce(calcResult)` 也從未被消費。

`calculation.value` 從頭到尾都是初始值 `null`，設 `warrantId.value = null` 之後仍然是 `null`。`expect(calculation.value).toBeNull()` 永遠通過，**與清空機制是否正確無關**。

這個測試案例的實際覆蓋點是：「當 warrantId 從未觸發計算時，calculation 是 null」，而非「切換後清空先前計算結果」。

**修正**

測試必須先讓計算完成，才能驗證「清空」行為：

```ts
it('切換權證後舊的 calculation 清空', async () => {
  mockCalculate.mockResolvedValueOnce(calcResult)
  const warrantId = ref<string | null>('00001C')
  const marketPrice = ref<number | null>(null)

  const { calculation } = useTrialCalculation(warrantId, marketPrice)

  // Step 1：觸發一次有效計算
  marketPrice.value = 110
  await nextTick()
  vi.advanceTimersByTime(300)
  await flushPromises()

  // 確認計算已完成
  expect(calculation.value).toEqual(calcResult)

  // Step 2：切換到 null，驗證清空
  warrantId.value = null
  await nextTick()

  expect(calculation.value).toBeNull()
})
```

---

### 🟢 A11Y-02：所有選項 `tabindex="0"`，未實作 Roving Tabindex

**位置**：`src/components/WarrantListItem.vue` line 35

**現況**

```html
<div
  role="option"
  :aria-selected="props.isSelected"
  tabindex="0"              <!-- ← 所有項目均為 0 -->
  @keydown.enter.space.prevent="emit('select')"
>
```

**問題**

ARIA Listbox 模式的標準鍵盤行為：
- Tab 鍵應進入 / 離開清單，不在清單內項目間移動
- 上下方向鍵在清單內導覽

若所有 option 的 `tabindex="0"`，使用者按 Tab 時會逐一停在每個可見項目，不符合 ARIA Authoring Practices（APG）規範。標準做法是「Roving Tabindex」：僅被選中或被 focus 的項目為 `tabindex="0"`，其餘為 `tabindex="-1"`。

**實際影響**

由於 `RecycleScroller` 虛擬捲動，DOM 中同時存在的 `option` 約 10–15 個（非 800 個），Tab 停頓點數量有限。因此對大多數使用者的體驗影響相對輕微，但仍不符合 ARIA 規範，可能影響無障礙測試評分。

**修正建議**

```html
<div
  role="option"
  :aria-selected="props.isSelected"
  :tabindex="props.isSelected ? 0 : -1"
  @keydown.enter.space.prevent="emit('select')"
>
```

同時在 `RecycleScroller` 容器（`SiderContent.vue`）加上 `tabindex="0"` 讓清單本身可被 Tab 聚焦，並在容器上處理方向鍵事件。

---

### 🟢 API-01：Timeout 與網路斷線錯誤訊息相同

**位置**：`src/api/index.ts` line 55–64

**現況**

```ts
(error: AxiosError<ApiErrorResponse>) => {
  const serverMessage = error.response?.data?.message
  const statusCode = error.response?.status

  const friendlyMessage =
    serverMessage ??
    (statusCode === 404 ? '找不到指定資源' :
     statusCode === 500 ? '伺服器內部錯誤，請稍後再試' :
     statusCode === 401 ? '未授權，請重新登入' :
     '網路連線異常，請確認網路狀態')   // ← Timeout 也落入此分支
```

**問題**

Axios 設定了 `timeout: 15000`。當請求超時，axios 拋出的錯誤 `error.code === 'ECONNABORTED'`，`error.response` 為 `undefined`，`statusCode` 為 `undefined`，最終顯示「網路連線異常」。

超時（伺服器太慢）與無法連線（無網路）是不同情境，訊息相同會誤導使用者（前者應稍後重試，後者應檢查網路）。

**修正建議**

```ts
(error: AxiosError<ApiErrorResponse>) => {
  const serverMessage = error.response?.data?.message
  const statusCode = error.response?.status

  const friendlyMessage =
    serverMessage ??
    (error.code === 'ECONNABORTED'
      ? '請求逾時，請稍後再試'
      : statusCode === 404 ? '找不到指定資源'
      : statusCode === 500 ? '伺服器內部錯誤，請稍後再試'
      : statusCode === 401 ? '未授權，請重新登入'
      : '網路連線異常，請確認網路狀態')
```

---

## 四、設計決策驗證（確認正確）

以下為本輪重點驗證項目：

| 設計 | 位置 | 評估 |
|---|---|---|
| `requestSeq = Infinity` 在 `onUnmounted`，而非 `AbortController` | `useTrialCalculation.ts:61` | ✅ 有效防止卸載後回應更新 UI；代價是 in-flight HTTP 請求無法取消（帶寬浪費）。屬可接受的取捨，建議在 README 說明 |
| `calculation.value = null` 在 watch 內、debounce 觸發前立即執行 | `useTrialCalculation.ts:49` | ✅ 確保輸入變動瞬間舊結果消失，`canSave` 立即 disabled，防止使用者儲存錯誤數據 |
| `idempotencyKey` 在 `watch(calculation, ...)` 產生，失敗後保留供重試 | `CalculatorPanel.vue:33-36` | ✅ Key 生命週期與「一次使用者儲存意圖」綁定，冪等重試語意正確 |
| `handleSave` 中使用 `calculation.value.marketPrice`（後端結果）而非 `marketPrice.value`（輸入框） | `CalculatorPanel.vue:80` | ✅ 儲存的市價與計算時一致，不存在輸入框與存檔數據不符的問題 |
| `getCurrentInstance()` 保護 `onUnmounted`，允許 composable 在測試環境外使用 | `useTrialCalculation.ts:58` | ✅ 設計嚴謹 |
| `const columns` 非 `computed`（無響應式依賴） | `HistoryTable.vue:28` | ✅ 正確，上一版 code-review 中標記的 🔵 待改項已修正 |
| `formatTime` 以 regex 檢測時區後綴，無後綴時補 `+08:00` | `HistoryTable.vue:14-15` | ✅ 正確處理 UTC+8 問題 |
| `debounce.cancel()` 回傳型別透過 `Debounced<T>` interface 正確暴露 | `utils/debounce.ts:1-4` | ✅ 型別安全 |
| `encodeURIComponent(warrantId)` 防止 URL 路徑注入 | `api/warrant.ts:13,25,43` | ✅ |
| `@ant-design/icons-vue` 移至 `dependencies` | `package.json` | ✅ |

---

## 五、整體品質評估

| 評核項目 | 狀態 | 說明 |
|---|---|---|
| 金融數值精度 | ✅ 完整 | `DECIMAL(18,4)` 對應 `.toFixed(4)`，`formatPrice` 固定 4 位，`formatQty` 固定 2 位 |
| API 冪等性 | ✅ 完整 | Key 由呼叫方持有，失敗保留重試，成功後廢棄，端對端語意正確 |
| Race Condition 防護 | ✅ 完整 | requestSeq + onUnmounted Infinity 雙重保護 |
| 錯誤處理 | ✅ 完整 | ApiError 統一格式，trialLogsError 與 errorMessage 完全獨立 |
| UI 易用性 | ✅ 完整 | RWD Drawer、debounce 搜尋、即時試算、切換權證清空市價、儲存後禁用 |
| 測試覆蓋 | ✅ 良好 | API、Store、Composable、CalculatorPanel 均有測試；1 個測試案例邏輯空洞（TEST-03） |
| 無障礙性 | 🟡 部分 | role 層次正確；tabindex 模式仍有改善空間（A11Y-02） |
| 依賴管理 | ✅ 完整 | dependencies/devDependencies 歸類正確 |

---

## 六、最終修正優先清單

| 優先 | ID | 檔案 | 說明 | 預估工時 |
|---|---|---|---|---|
| 🟡 建議 | TEST-03 | `composables/__tests__/useTrialCalculation.spec.ts` | 修正「切換後清空」測試，補全前置計算步驟 | 15 min |
| 🟢 次要 | A11Y-02 | `components/WarrantListItem.vue` | `tabindex="-1"` 用於非選中項，實作 Roving Tabindex | 20 min |
| 🟢 次要 | API-01 | `api/index.ts` | 增加 `ECONNABORTED` 判斷，顯示逾時專屬訊息 | 5 min |

---

## 七、總結

本輪審查確認：前次 v2 報告的所有 13 項問題均已完整修正，包含三項🔴必修缺陷（獨立錯誤狀態、冪等 Key 清空、canSave 含 isCalculating 判斷）及所有🟡建議與🟢次要項目。

本輪新發現 3 項問題，均屬🟡或🟢等級：最重要的是 TEST-03（一個永遠通過的空洞測試），其餘兩項為 ARIA 細節與 UX 文案改善，不影響核心功能。

**若修正 TEST-03，此專案前端部分已達到可提交的生產品質標準。**

架構設計亮點：API 層 / Pinia Store / Composable 職責分離清晰；冪等性實作端對端閉環；虛擬捲動解決 800 筆效能問題；`requestSeq` 機制優雅處理 Race Condition；工具函式統一無重複。
