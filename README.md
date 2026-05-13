# 權證發行風險監控與避險試算系統 — Frontend

Vue.js 3 前端，對應題目一「權證發行風險監控與避險試算系統」。  
使用者從左側選擇權證後，輸入標的股價即可即時試算理論價值與建議避險張數，並可一鍵存檔、查閱歷史紀錄。

---

## 目錄

1. [環境需求](#一環境需求)
2. [啟動說明](#二啟動說明)
3. [專案結構](#三專案結構)
4. [架構設計理由](#四架構設計理由)
5. [金融數值精確度處理說明](#五金融數值精確度處理說明)
6. [API 冪等性防護說明](#六api-冪等性防護說明)
7. [測試說明](#七測試說明)
8. [AI 工具使用與審核報告](#八ai-工具使用與審核報告)

---

## 一、環境需求

| 工具 | 版本要求 |
|------|----------|
| Node.js | 18.x 以上 |
| npm | 9.x 以上（隨 Node.js 附帶）|
| 後端 API | 須先啟動，預設監聽 `http://localhost:5226` |

---

## 二、啟動說明

### 1. 安裝依賴

```bash
npm install
```

### 2. 設定環境變數（可選）

預設後端 API base URL 為 `/api`（透過 Vite proxy 轉發至 `http://localhost:5226`）。  
若需直接指向後端，可在專案根目錄建立 `.env.local`：

```env
VITE_API_BASE_URL=http://localhost:5226/api
```

### 3. 啟動開發伺服器

```bash
npm run dev
```

瀏覽器開啟 `http://localhost:5173`。

### 4. 建置生產版本

```bash
npm run build
```

輸出至 `dist/` 資料夾，可直接部署至靜態檔案伺服器。

### 5. 預覽生產版本

```bash
npm run preview
```

### 6. 執行測試

```bash
npm test              # 單次執行所有測試
npm run test:watch    # 監聽模式（開發時使用）
npm run coverage      # 產出 Coverage 報告（輸出至 coverage/）
```

---

## 三、專案結構

```
src/
├── api/
│   ├── index.ts              # Axios 實例、統一錯誤攔截（ApiError）
│   ├── warrant.ts            # 四支 API 函式：getWarrants / getTrialLogs / saveTrialLog / calculateWarrant
│   └── __tests__/
│       └── warrant.spec.ts   # API 層單元測試
├── components/
│   ├── App.vue               # 根元件，RWD 佈局（桌面 Sider / 手機 Drawer）
│   ├── WarrantSider.vue      # 桌面版固定側欄（≥ lg 顯示）
│   ├── SiderContent.vue      # 側欄內容：搜尋框 + 虛擬捲動清單
│   ├── WarrantListItem.vue   # 單一權證列表項目
│   ├── CalculatorPanel.vue   # 試算面板（輸入 → 即時計算 → 儲存）
│   ├── HistoryTable.vue      # 歷史明細表格（最近 10 筆）
│   └── __tests__/
│       └── CalculatorPanel.spec.ts
├── composables/
│   ├── useTrialCalculation.ts  # 封裝即時試算邏輯（debounce、race condition 防護、卸載清除）
│   └── __tests__/
│       └── useTrialCalculation.spec.ts
├── stores/
│   ├── warrant.ts            # Pinia Store：權證清單、選中狀態、試算紀錄
│   └── __tests__/
│       └── warrant.spec.ts
├── types/
│   └── warrant.ts            # TypeScript 型別定義（Warrant、TrialLog、TrialCalculation…）
└── utils/
    ├── debounce.ts           # 帶 cancel() 的 debounce 工具函式
    └── formatters.ts         # Intl.NumberFormat 格式化（formatPrice / formatQty）
```

---

## 四、架構設計理由

### 4.1 API → Store → Composable → Component 四層分離

```
Component（純 UI / 事件處理）
    ↓ 讀 state、呼叫 action
Pinia Store（全域狀態 + async action）
    ↓ 呼叫
API 層（axios + 錯誤攔截）
    ↓ HTTP
後端 C# API

Composable（useTrialCalculation）
    ↑ 同時依賴 API 層與 Component 的 ref，不放入 Store
    因為試算結果與當前輸入緊密耦合，屬於局部 UI 狀態
```

職責邊界明確，Store 只管持久化的全域狀態（清單、選中、歷史），試算結果因只在 `CalculatorPanel` 使用而存放於 Composable，不污染全域。

### 4.2 後端負責所有計算，前端純顯示

試算的核心邏輯（Delta 判斷、理論價值、避險張數）**100% 由後端 C# 以 `decimal` 計算後回傳**，前端不做任何金融計算。

設計理由：
- 計算邏輯唯一來源在後端，前後端不可能出現計算不一致的 Bug
- 後端可在儲存前再次驗證，避免前端計算值被竄改後直接存入資料庫
- 前端測試只需驗證「正確呼叫 API」與「正確顯示回傳值」，無需覆蓋金融計算邏輯

### 4.3 虛擬捲動處理 800 筆清單

使用 `vue-virtual-scroller`（`RecycleScroller`）替代原生 `v-for`。DOM 節點數量維持恆定（約 10–15 個），滾動時只更新資料綁定，不新增或移除元素。800 筆資料一次取回（`pageSize=1000`），搭配 Pinia computed `filteredWarrants` 在用戶端過濾，無需每次搜尋都打 API。

### 4.4 debounce 統一工具

搜尋關鍵字（`stores/warrant.ts`）與即時試算觸發（`useTrialCalculation.ts`）共用同一個 `src/utils/debounce.ts`，均設定 300ms 延遲。`debounce` 函式回傳帶 `cancel()` 方法的型別 `Debounced<T>`，讓 `onUnmounted` 可以安全清除計時器。

### 4.5 RWD 佈局

| 寬度 | 佈局 |
|---|---|
| ≥ 1024px（lg） | `a-layout-sider`（固定 288px 左欄）+ 右側內容區 |
| < 1024px | 頁首漢堡按鈕 + `a-drawer`（左滑入覆蓋層）|

兩種模式共用同一個 `SiderContent` 元件，Pinia Store 為唯一資料來源。

### 4.6 錯誤狀態獨立管理

`fetchWarrants` 失敗 → `errorMessage`（影響側欄清單顯示）  
`fetchTrialLogs` 失敗 → `trialLogsError`（僅影響 HistoryTable 內的提示）  

兩個 ref 完全獨立，試算記錄載入失敗不會導致 800 筆清單消失，使用者仍可繼續切換權證。

---

## 五、金融數值精確度處理說明

### 5.1 計算層（後端 C#）

所有金融計算使用 C# `decimal` 型別，精度對應資料庫 `DECIMAL(18,4)` / `DECIMAL(18,2)`，不存在 IEEE 754 浮點誤差。前端不做任何金融運算。

### 5.2 傳輸層（JSON）

JSON 數值由 C# `decimal` 序列化，在 JavaScript `number`（64-bit double）範圍內（股價通常 0.01–9999 元），`Number.isSafeInteger` 上限（2⁵³ ≈ 9×10¹⁵）遠高於實際數值，不存在精度損失風險。

若未來需要更嚴格的精度保障（例如極大面額衍生品），後端可改為將 `decimal` 序列化為 `string` 傳輸，前端再格式化顯示，無需更動計算邏輯。

### 5.3 顯示層（前端）

所有金融數值透過 `Intl.NumberFormat('zh-TW', {...})` 格式化，固定小數位數：

| 欄位 | 格式化位數 | 對應 DB 型別 |
|------|-----------|-------------|
| 標的股價（marketPrice） | 4 位小數 | DECIMAL(18,4) |
| 理論價值（theoryPrice） | 4 位小數 | DECIMAL(18,4) |
| 履約價（strikePrice） | 2–4 位小數 | DECIMAL(18,4) |
| 行使比例（conversionRatio） | 4 位小數 | DECIMAL(18,4) |
| 避險張數（hedgeQty） | 2 位小數 | DECIMAL(18,2) |

`strikePrice` 採 `minimumFractionDigits: 2, maximumFractionDigits: 4`（去除尾隨零但保留 DB 精度）。

### 5.4 時間欄位（createdTime）

後端回傳的 `createdTime` 為台灣時間（UTC+8），**無時區後綴**（如 `"2026-05-10T18:30:00"`）。前端使用正規表達式偵測是否有時區資訊，無則自動補上 `+08:00` 再解析，確保非 UTC+8 瀏覽器也能正確顯示台灣時間：

```ts
const hasOffset = /Z$|[+-]\d{2}:\d{2}$/.test(iso)
const date = new Date(hasOffset ? iso : `${iso}+08:00`)
```

---

## 六、API 冪等性防護說明

### 設計目標

「使用者點擊儲存 → 網路逾時 → 點擊重試」的情境下，後端只寫入一筆紀錄，前端歷史清單也只新增一筆。

### 實作流程

```
1. 後端計算回傳 → calculation 更新
        ↓
2. watch(calculation) 觸發 → 產生新的 crypto.randomUUID() 存入 idempotencyKey
        ↓
3. 使用者點擊「儲存」→ 以當前 idempotencyKey 呼叫 saveTrialLog()
        ↓
   ┌─ 成功 ─→ idempotencyKey = null（廢棄）→ 按鈕立即 disabled，防止重複提交
   └─ 失敗 ─→ idempotencyKey 保留 → 使用者再次點擊時帶同一個 Key → 後端冪等回應
```

### 關鍵約束

- Key 由 `CalculatorPanel` 持有，而非在 `saveTrialLog()` 函式內部產生，確保重試語意正確
- 使用者重新輸入股價 → 新計算結果 → `watch(calculation)` 產生**新的** Key（舊意圖廢棄）
- `canSave` 包含 `idempotencyKey !== null` 作為前置條件，Key 廢棄後按鈕自動 disabled

---

## 七、測試說明

### 測試框架

Vitest 3 + @vue/test-utils 2 + jsdom

### 覆蓋範圍

| 測試檔案 | 測試數 | 涵蓋重點 |
|---|---|---|
| `api/__tests__/warrant.spec.ts` | 8 | getWarrants / getTrialLogs / saveTrialLog（冪等 Key）/ calculateWarrant |
| `stores/__tests__/warrant.spec.ts` | 11 | fetchWarrants / filteredWarrants（搜尋）/ selectWarrant / prependTrialLog（10 筆上限）/ errorMessage 與 trialLogsError 獨立性 |
| `composables/__tests__/useTrialCalculation.spec.ts` | 8 | debounce 觸發時機、防禦性輸入檢查（≤0）、Race Condition 清空、API 失敗回饋 |
| `components/__tests__/CalculatorPanel.spec.ts` | 6 | canSave 條件（含 isCalculating）、儲存成功後 Key 廢棄、冪等重試同一 Key、切換權證清空市價 |

**總計：33 tests，全部通過。**

### 執行 Coverage 報告

```bash
npm run coverage
```

Coverage 結果輸出至 `coverage/` 目錄，可用瀏覽器開啟 `coverage/index.html` 查閱。

---

## 八、AI 工具使用與審核報告

### 使用工具

本專案開發過程中使用 **Claude Code**（Anthropic）作為 AI 輔助工具，協助：
- 元件骨架與 Composable 初始設計
- TypeScript 型別定義撰寫
- 單元測試案例生成
- 三輪 Code Review（詳見 `docs/code-review.md` / `v2` / `v3`）

### AI 生成內容的審核流程

所有 AI 生成或建議的程式碼，均經過以下流程審核後才納入版本控制：

1. **邏輯審查**：確認業務邏輯符合 task.md 規範（Delta 計算、冪等性語意、防禦性輸入驗證）
2. **安全性審查**：確認 `encodeURIComponent(warrantId)` 防止 URL 注入、無 XSS 風險
3. **三輪迭代 Code Review**：每輪發現問題後立即修正，再進行下一輪審查
4. **測試驗證**：所有修正後執行 `npm test` 確認無回歸

### 三輪 Code Review 發現問題摘要

| 輪次 | 發現問題數 | 必修 | 建議 | 次要 | 報告位置 |
|------|-----------|------|------|------|---------|
| v1（2026-05-11） | 5 | 2 | 2 | 1 | `docs/code-review.md` |
| v2（2026-05-11） | 13 | 3 | 5 | 5 | `docs/code-review-v2.md` |
| v3（2026-05-12） | 3 | 0 | 1 | 2 | `docs/code-review-v3.md` |

**最終狀態**：v1、v2 共 18 項問題已全部修正；v3 發現的 3 項問題亦已全部修正。

### 主動回報的潛在問題

以下問題已在開發過程中發現並修正，特此說明：

| 問題 | 影響 | 修正方式 |
|---|---|---|
| `errorMessage` 被 `fetchTrialLogs` 覆蓋，導致試算記錄失敗時整個清單消失 | 嚴重 UX 回歸 | 新增獨立的 `trialLogsError` ref |
| 儲存成功後 `idempotencyKey` 未廢棄，使用者可立即重複儲存同一筆 | 客戶端出現重複條目 | 成功後立即設 `idempotencyKey.value = null` |
| `canSave` 未排除 `isCalculating`，使用者在 debounce 期間可儲存舊計算結果 | 儲存數據與輸入不一致 | 加入 `!isCalculating.value`；watch 立即清空舊 `calculation` |
| 併發請求 Race Condition：舊回應可能覆蓋新結果 | 顯示錯誤試算值 | `requestSeq` 序號機制，過期回應靜默丟棄 |
| Vacuous Test：「切換後清空 calculation」測試永遠通過（前置條件未觸發） | 測試形同虛設 | 補上先觸發計算、確認結果後再測試清空 |

---
