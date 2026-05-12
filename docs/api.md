# 權證風險監控系統 — 後端 API 文件

**Base URL**：`http://localhost:5226`  
**Content-Type**：`application/json`

---

## 目錄

1. [權證清單（分頁+搜尋）](#1-get-apiwarrants)
2. [取得單筆權證](#2-get-apiwarrantswarrantid)
3. [避險試算](#3-post-apiwarrantswarrantidcalculate)
4. [儲存試算記錄](#4-post-apiwarrantswarrantidtrial-logs)
5. [取得最近試算記錄](#5-get-apiwarrantswarrantidtrial-logs)
6. [資料模型](#資料模型)
7. [錯誤格式](#錯誤格式)

---

## 1. GET /api/warrants

取得權證清單，支援關鍵字前綴搜尋與分頁。

### Query Parameters

| 參數       | 型別   | 必填 | 預設 | 說明                              |
|------------|--------|------|------|-----------------------------------|
| `keyword`  | string | 否   | —    | 依 Warrant_ID 前綴模糊搜尋        |
| `page`     | int    | 否   | 1    | 頁碼（最小值 1）                  |
| `pageSize` | int    | 否   | 50   | 每頁筆數（1–1000）                |

### 範例請求

```
GET /api/warrants?keyword=003&page=1&pageSize=20
```

### 回應 `200 OK`

```json
{
  "data": [
    {
      "warrantId": "00300C",
      "strikePrice": 150.0000,
      "conversionRatio": 1.0000,
      "warrantType": "CALL",
      "positionQty": 10000
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20
}
```

---

## 2. GET /api/warrants/{warrantId}

取得單筆權證主檔資料。

### Path Parameters

| 參數         | 說明       |
|--------------|------------|
| `warrantId`  | 權證代號   |

### 範例請求

```
GET /api/warrants/00300C
```

### 回應 `200 OK`

```json
{
  "warrantId": "00300C",
  "strikePrice": 150.0000,
  "conversionRatio": 1.0000,
  "warrantType": "CALL",
  "positionQty": 10000
}
```

### 回應 `404 Not Found`

```json
{
  "success": false,
  "message": "找不到權證代號 '00300C'"
}
```

---

## 3. POST /api/warrants/{warrantId}/calculate

依市場價格執行避險試算，**純計算不寫入資料庫**。

### Path Parameters

| 參數        | 說明     |
|-------------|----------|
| `warrantId` | 權證代號 |

### Request Body

```json
{
  "marketPrice": 160.00
}
```

| 欄位          | 型別    | 必填 | 說明                    |
|---------------|---------|------|-------------------------|
| `marketPrice` | decimal | 是   | 標的市場價格（必須 > 0）|

### 回應 `200 OK`

```json
{
  "warrantId": "00300C",
  "marketPrice": 160.00,
  "strikePrice": 150.0000,
  "conversionRatio": 1.0000,
  "warrantType": "CALL",
  "positionQty": 10000,
  "delta": 0.8,
  "deltaStatus": "ITM",
  "theoryPrice": 10.0000,
  "hedgeQty": 8000.00
}
```

> 計算說明（以上例為準）：  
> - `theoryPrice` = Max(0, (160 - 150) × 1.0) = **10.0000**  
> - `hedgeQty` = 10000 × 1.0 × 0.8 = **8000.00**

| 欄位            | 說明                                                               |
|-----------------|--------------------------------------------------------------------|
| `delta`         | Delta 值：ITM=0.8 / ATM=0.5 / OTM=0.2                             |
| `deltaStatus`   | Delta 狀態：`ITM`（價內）/ `ATM`（平價）/ `OTM`（價外）           |
| `theoryPrice`   | CALL：Max(0, (市價 - 履約價) × 行使比例)；PUT：Max(0, (履約價 - 市價) × 行使比例) |
| `hedgeQty`      | 建議避險數量 = positionQty × conversionRatio × delta               |

#### Delta 判斷規則（CALL）

| 市場價 vs 履約價      | 狀態 | Delta |
|-----------------------|------|-------|
| marketPrice > strikePrice  | ITM  | 0.8   |
| marketPrice = strikePrice  | ATM  | 0.5   |
| marketPrice < strikePrice  | OTM  | 0.2   |

> PUT 反向判斷：marketPrice < strikePrice → ITM。

### 回應 `400 Bad Request`

```json
{
  "success": false,
  "message": "找不到權證代號 'XXXXX'"
}
```

---

## 4. POST /api/warrants/{warrantId}/trial-logs

將試算結果儲存至資料庫，**支援冪等保護**：同一個 `X-Idempotency-Key` 重複送出時，回傳已儲存的記錄而不重複寫入。

### Path Parameters

| 參數        | 說明     |
|-------------|----------|
| `warrantId` | 權證代號 |

### Headers

| Header              | 必填 | 說明                                   |
|---------------------|------|----------------------------------------|
| `X-Idempotency-Key` | 是   | UUID v4 格式，每次新試算產生一個新的  |

### Request Body

```json
{
  "marketPrice": 160.00,
  "theoryPrice": 128.0000,
  "hedgeQty": 8000.00
}
```

| 欄位          | 型別    | 必填 | 說明                        |
|---------------|---------|------|-----------------------------|
| `marketPrice` | decimal | 是   | 標的市場價格（必須 > 0）    |
| `theoryPrice` | decimal | 是   | 權證理論價值（不得為負數）  |
| `hedgeQty`    | decimal | 是   | 建議避險數量（不得為負數）  |

### 回應 `201 Created`（新寫入）

```json
{
  "logId": 42,
  "warrantId": "00300C",
  "marketPrice": 160.00,
  "theoryPrice": 128.0000,
  "hedgeQty": 8000.00,
  "createdTime": "2026-05-10T18:30:00"
}
```

### 回應 `200 OK`（冪等重複，已存在）

回傳格式與 `201` 相同。

> 前端可依 HTTP Status Code 區分「新建立」vs「重複送出」。

### 回應 `400 Bad Request`

```json
{
  "success": false,
  "message": "缺少必要的 Header：X-Idempotency-Key"
}
```

#### 冪等 Key 使用建議

```js
// 每次使用者按下「儲存」按鈕時產生新的 key
const idempotencyKey = crypto.randomUUID();

// 網路錯誤重試時使用同一個 key
await fetch(`/api/warrants/${warrantId}/trial-logs`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Idempotency-Key': idempotencyKey,
  },
  body: JSON.stringify({ marketPrice, theoryPrice, hedgeQty }),
});
```

---

## 5. GET /api/warrants/{warrantId}/trial-logs

取得指定權證的最近 **10 筆**試算記錄，依時間由新到舊排序。

### Path Parameters

| 參數        | 說明     |
|-------------|----------|
| `warrantId` | 權證代號 |

### 範例請求

```
GET /api/warrants/00300C/trial-logs
```

### 回應 `200 OK`

```json
{
  "warrantId": "00300C",
  "logs": [
    {
      "logId": 42,
      "warrantId": "00300C",
      "marketPrice": 160.00,
      "theoryPrice": 128.0000,
      "hedgeQty": 8000.00,
      "createdTime": "2026-05-10T18:30:00"
    },
    {
      "logId": 38,
      "warrantId": "00300C",
      "marketPrice": 155.00,
      "theoryPrice": 62.0000,
      "hedgeQty": 2000.00,
      "createdTime": "2026-05-10T17:10:00"
    }
  ]
}
```

---

## 資料模型

### WarrantDto

| 欄位              | 型別    | 說明                          |
|-------------------|---------|-------------------------------|
| `warrantId`       | string  | 權證代號（最長 10 碼）        |
| `strikePrice`     | decimal | 履約價                        |
| `conversionRatio` | decimal | 換股比例                      |
| `warrantType`     | string  | 類型：`CALL` 或 `PUT`         |
| `positionQty`     | int     | 發行部位數量                  |

### TrialLogDto

| 欄位           | 型別     | 說明           |
|----------------|----------|----------------|
| `logId`        | int      | 記錄 ID        |
| `warrantId`    | string   | 權證代號       |
| `marketPrice`  | decimal  | 標的市場價格   |
| `theoryPrice`  | decimal  | 權證理論價值   |
| `hedgeQty`     | decimal  | 建議避險數量   |
| `createdTime`  | datetime | 建立時間（台灣時間 UTC+8，無時區後綴）|

---

## 錯誤格式

所有 `4xx` 錯誤回傳統一格式：

```json
{
  "success": false,
  "message": "錯誤說明文字"
}
```

| Status | 情境                                  |
|--------|---------------------------------------|
| 400    | 參數驗證失敗、找不到權證、Key 格式錯誤|
| 404    | 指定的 warrantId 不存在               |
