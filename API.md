# API 文件

本文件描述 `stack-c-sveltekit` 的所有 REST API。這是個人/本機工具，**沒有任何認證機制**，所有端點都開放存取。

Base URL：`http://localhost:<port>`（開發模式由 `npm run dev` 印出實際 port）

所有請求/回應皆為 JSON（除了上傳/匯出/匯入走 multipart 或純文字），錯誤格式一律為：
```json
{ "error": "可讀的錯誤訊息" }
```

---

## Space（空間）

### `GET /api/spaces`
列出所有 Space。

**回應** `200`
```json
[
  {
    "id": 1,
    "name": "3F辦公室",
    "floorplan_image_path": "/api/uploads/space-1-172...png",
    "floorplan_width": 1692,
    "floorplan_height": 639,
    "created_at": "...",
    "updated_at": "..."
  }
]
```

### `POST /api/spaces`
建立一個新 Space。

**請求 body**
```json
{ "name": "3F辦公室" }
```
**回應** `201` Space 物件 ／ `400` 缺少 `name`

### `GET /api/spaces/:id`
取得單一 Space。`404` 若不存在。

### `PATCH /api/spaces/:id`
更新 Space 名稱。

**請求 body**：`{ "name": "新名稱" }`
**回應** `200` 更新後的 Space ／ `404` 不存在

### `DELETE /api/spaces/:id?cascade=true`
刪除 Space。

- 若底下還有 Circuit 且**沒帶** `?cascade=true` → `409`：
  ```json
  { "error": "space has associated circuits", "circuit_count": 3, "hint": "retry with ?cascade=true ..." }
  ```
- 帶 `?cascade=true` → 連同底下所有 Circuit 一起刪除，回應 `200`：
  ```json
  { "ok": true, "deleted_circuits": 3 }
  ```

### `POST /api/spaces/:id/floorplan`
上傳/更換底圖圖片。

**請求**：`multipart/form-data`，欄位名稱 `file`（PNG/JPG，上限見 `uploads.ts` 的 `MAX_UPLOAD_BYTES`，目前 10MB）

**回應** `200` 更新後的 Space（含自動解析出的 `floorplan_width`/`floorplan_height`）／ `400` 檔案型別不符、超過大小上限、或沒帶檔案

### `GET /api/spaces/:id/status`
取得該 Space 下所有 Circuit 的**目前執行期狀態**（只讀記憶體快取，絕不會觸發即時 Modbus 讀取——真相來源永遠是背景輪詢）。

**回應** `200`
```json
[
  { "circuit_id": 2, "value": true, "status": "ok", "last_updated_at": "2026-10-10T08:00:00.000Z" },
  { "circuit_id": 3, "value": null, "status": "error", "last_updated_at": null }
]
```
`status` 為 `"ok"` / `"stale"`（資料過期但曾成功過）/ `"error"`（連線失敗、逾時、Device 停用——此時 `value` 不可信，前端應顯示未知/離線）。

---

## Device（Modbus Gateway）

### `GET /api/devices`
列出所有 Device。

### `POST /api/devices`
建立一個新 Device，同時重新載入背景輪詢器（立即開始輪詢）。

**請求 body**
```json
{
  "name": "1F配電箱Gateway",
  "ip_address": "127.0.0.1",
  "port": 502,
  "slave_id": 1,
  "poll_interval_ms": 1500,
  "timeout_ms": 1000,
  "is_enabled": true
}
```
只有 `name`/`ip_address`/`port` 必填，其他有合理預設值（`slave_id` 預設 1，`is_enabled` 預設 true，間隔/逾時用系統預設）。

**回應** `201` Device 物件 ／ `400` 驗證失敗（IP 格式、port 範圍 1-65535 等）

### `GET /api/devices/:id`
取得單一 Device，回應額外附帶 `circuit_count`（底下有幾個 Circuit 依賴它）。

### `PATCH /api/devices/:id`
更新 Device 任意欄位（局部更新，只需傳要改的欄位），儲存後立即重新載入輪詢器——所以改 IP/Port/`is_enabled` 會馬上生效，不用重啟服務。

### `DELETE /api/devices/:id?cascade=true`
行為與 Space 的刪除完全對稱（`409` + `circuit_count` 阻擋，或 `?cascade=true` 連動刪除底下 Circuit）。

---

## Circuit（迴路）

### `GET /api/circuits?space_id=<id>`
列出某個 Space 下所有 Circuit 的**靜態資料**（不含即時開關狀態，狀態要另外打 `/api/spaces/:id/status`）。`space_id` query 參數必填。

### `POST /api/circuits`
建立一個新 Circuit。

**請求 body**
```json
{ "space_id": 1, "device_id": 1, "coil_address": 5, "name": "主燈" }
```
**回應** `201` Circuit 物件（`pos_x`/`pos_y` 為 `null`，前端的「待定位」清單會抓到它）／`404` 若 `space_id`/`device_id` 不存在 ／ `400` 驗證失敗

### `GET /api/circuits/:id`
取得單一 Circuit。

### `PATCH /api/circuits/:id`
更新 Circuit 基本資料（`name`/`coil_address`/`device_id`，局部更新）。**不會**動到 `pos_x`/`pos_y`（座標走下面獨立的 position 端點）。

### `DELETE /api/circuits/:id`
刪除 Circuit（無條件刪除，Circuit 是葉節點，沒有連動問題）。

### `PATCH /api/circuits/:id/position`
輕量、高頻呼叫的座標更新端點，拖曳放開時呼叫一次。

**請求 body**：`{ "pos_x": 123.5, "pos_y": 456.25 }`（兩者皆為有限數字）
**回應** `200` 更新後的 Circuit

### `POST /api/circuits/:id/toggle`
切換 Circuit 開關（送出 Modbus FC5 寫入）。

- 若該 Circuit 目前狀態未知（從未成功輪詢過，或正處於 `error` 狀態）→ `409`：
  ```json
  { "error": "circuit current state is unknown; cannot toggle until next successful read" }
  ```
- 正常情況：依目前已知值反轉，樂觀更新記憶體狀態，實際送出 Modbus 寫入。成功 → `200 { "ok": true, "circuit_id": 2, "value": true }`；寫入失敗 → 回滾樂觀更新 + `502 { "error": "toggle failed: ..." }`

> 樂觀更新只是體感優化，真相來源永遠是下一輪輪詢；若輪詢結果跟樂觀值不同，畫面會在下一輪被覆蓋為真實值。

### `POST /api/circuits/:id/set`
直接把 Circuit 設成指定值（不是反轉）。跟 `/toggle` 不同，**不要求目前狀態已知**——即使該 Circuit 目前是 `error`/`null`，一樣可以直接下達目標值。

**請求 body**：`{ "value": true }`（`value` 必填，必須是 boolean）

**回應**：成功 `200 { "ok": true, "circuit_id": 2, "value": true }`；`value` 缺失或非 boolean → `400`；查無 Circuit → `404`；Modbus 寫入失敗 → `502 { "error": "set failed: ..." }`。重複呼叫同一個值是安全的（idempotent）。

---

## CSV 批量匯入／匯出

### `GET /api/circuits/export?space_id=<id>`
匯出指定 Space 下所有 Circuit 成 CSV（`text/csv`，帶 `Content-Disposition: attachment`，瀏覽器會直接下載）。

欄位：`circuit_id,space_name,device_name,device_ip,device_port,device_slave_id,coil_address,name`

> `device_ip`/`device_port`/`device_slave_id` 只在同一個 `device_name` **第一次出現**的那一行填值，後面重複的行留空（這三欄本質是 Device 的屬性，留空只是避免視覺上重複造成誤解，不影響匯入邏輯）。

### `POST /api/circuits/import?dryRun=true|false`
CSV 批量匯入。

**請求 body**：純文字（`text/plain` 或無特定 Content-Type），內容是 CSV 全文（含 header 行）。

**CSV 欄位**（header 名稱比對，順序不限）：
```
space_name,device_name,device_ip,device_port,device_slave_id,coil_address,name
```
可選加一欄 `circuit_id`（匯出時會帶，用於 upsert——見下方「更新模式」）。

**規則**：
- `space_name`/`device_name` 用名稱比對現有資料；找不到就自動建立（Space 只需 name；Device 若是新建，`device_ip`/`device_port`/`device_slave_id` 三欄必填）
- 已存在的 Device，CSV 裡的連線資訊欄位會被**忽略**（不會覆寫既有設定）
- 同一次匯入中同名的 Space/Device 只會建立一次，後面重複的行會重用
- 若某行帶有效的 `circuit_id`（對應既有 Circuit）→ **更新模式**：更新 `name`/`coil_address`/`space_id`/`device_id`，但**保留原有座標**（`pos_x`/`pos_y` 不變）
- `circuit_id` 有填但找不到對應 Circuit → 該行錯誤，不建立也不更新
- 同一 Device 下 `coil_address` 重複只給 `warning`，不阻擋

**回應** `200`
```json
{
  "dryRun": true,
  "totalRows": 3,
  "successCount": 3,
  "errorCount": 0,
  "newSpaces": [{ "name": "2F倉庫" }],
  "newDevices": [{ "name": "2F配電箱Gateway", "ip_address": "127.0.0.1", "port": 503, "slave_id": 1 }],
  "rows": [
    { "line": 2, "space_name": "...", "device_name": "...", "coil_address": 0, "name": "主燈", "status": "ok", "action": "create" }
  ]
}
```
`dryRun=true` 完全不寫入資料庫，只模擬執行結果，供前端預覽；確認後再用 `dryRun=false`（或省略參數）真正寫入。

---

## 監控 / 健康檢查

### `GET /api/healthz`
一律回應 HTTP `200`，狀態寫在 body 裡（個人工具沒有負載平衡器，不需要用 HTTP status code 表達健康狀態）。

```json
{
  "status": "ok",
  "server_started_at": "2026-10-10T07:00:00.000Z",
  "uptime_ms": 123456,
  "devices": [
    { "device_id": 1, "name": "1F配電箱Gateway", "is_enabled": true, "connected": true, "last_success_at": "...", "consecutive_failures": 0 }
  ]
}
```
任一已啟用的 Device 連續失敗次數 ≥ 3 → 整體 `status` 變 `"degraded"`。

### `GET /api/metrics`
每個 Device 最近輪詢的成功率/延遲（記憶體內的 rolling window，長度 20），`/status` 頁面用這個資料畫表格。

```json
[
  { "device_id": 1, "name": "1F配電箱Gateway", "success_rate": 1, "avg_latency_ms": 16, "last_poll_at": "...", "recent": [{ "ok": true, "latencyMs": 15, "at": "..." }] }
]
```

---

## 靜態檔案

### `GET /api/uploads/:filename`
讀取已上傳的底圖圖片（PNG/JPG）。檔名經過 `path.basename()` 清洗，防止路徑穿越。找不到檔案回 `404`。

---

## 共通行為備忘

- 所有 `:id` 類路徑參數都會先驗證為正整數，格式錯誤回 `400`；查無資料回 `404`
- 所有寫入型操作的輸入驗證失敗統一回 `400 { "error": "..." }`
- Circuit 的即時開關狀態（`value`/`status`）**只存在記憶體**，backend 重啟後歸零，要等下一輪輪詢才會恢復
- 本文件對應的程式碼版本：commit `96bbe25`（深色UI美化之後）；之後若 API 有變動但這份文件沒跟著更新，請以 `src/routes/api/**/+server.ts` 的原始碼為準
