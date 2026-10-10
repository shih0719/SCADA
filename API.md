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

### `GET /api/circuits?all=true`
列出**跨所有 Space** 的全部 Circuit（靜態資料，格式跟上面相同）。場景編輯介面（`/edit` 的場景面板）用這個端點取得完整清單，讓使用者能選擇任何 Space 底下的任何 Circuit 加入場景。

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

> 這個端點的核心邏輯（取出 Circuit、樂觀更新、送出 Modbus FC5 寫入）被抽成 `src/lib/server/circuit-control.ts` 的 `setCircuitValue()`，下面的「場景套用」與「Space 全開/全關」都重用同一個函式，行為保證一致（包含失敗訊息格式 `set failed: ...`）。

---

## 場景／群組控制（Scene / Group Control）

場景（Scene）是一組「Circuit → 目標值」的命名組合，建立/編輯/刪除在編輯頁（`/edit`）進行（屬於設定/配置行為），套用（觸發）在操作頁（`/`）進行（屬於日常操作行為）。場景**可以跨 Space**——一個場景裡的 action 可以同時指向不同 Space 底下的 Circuit。

另外提供 Space 層級的「全開/全關」快捷操作（不需要事先定義場景，直接對目前選中的 Space 底下所有 Circuit 生效）。

兩者套用時都遵循跟 CSV 匯入一致的設計哲學：**部分失敗不影響其他動作**——例如場景裡有兩個 Circuit，其中一個對應的 Device 離線，該 Circuit 回報失敗，另一個仍會正常套用成功。

### `GET /api/scenes`
列出所有場景的基本資料（不含 action 明細，只有數量）。

**回應** `200`
```json
[
  { "id": 1, "name": "下班關燈", "created_at": "...", "updated_at": "...", "action_count": 3 }
]
```

### `POST /api/scenes`
建立一個新場景。

**請求 body**
```json
{
  "name": "下班關燈",
  "actions": [
    { "circuit_id": 2, "value": false },
    { "circuit_id": 5, "value": false }
  ]
}
```

**驗證規則**：
- `name` 必填、非空字串
- `actions` 必須是陣列（可為空陣列）；每個項目的 `circuit_id` 必須是存在的 Circuit，否則整個請求回 `400`（明確指出哪個 `circuit_id` 有問題），**不會**建立半成品場景
- 每個項目的 `value` 必須是 boolean
- 若同一個 `circuit_id` 在 `actions` 裡出現超過一次，不會報錯——套用時以陣列順序**最後一個**為準

**回應** `201` 場景物件（不含 actions 明細，要看明細請用 `GET /api/scenes/:id`）／`400` 驗證失敗

### `GET /api/scenes/:id`
取得單一場景的完整明細，包含每個 action 的 Circuit 名稱與所屬 Space 名稱（方便前端顯示，不用額外查詢）。

**回應** `200`
```json
{
  "id": 1,
  "name": "下班關燈",
  "created_at": "...",
  "updated_at": "...",
  "actions": [
    { "circuit_id": 2, "value": false, "circuit_name": "窗邊燈", "space_id": 1, "space_name": "3F辦公室" },
    { "circuit_id": 5, "value": false, "circuit_name": "走廊燈", "space_id": 2, "space_name": "2F倉庫" }
  ]
}
```
若場景裡某個 action 所指向的 Circuit 已被刪除（FK `ON DELETE CASCADE`），該 action 會自動從列表中消失——`GET`/`POST apply` 都不會因此出錯，場景只是少了那個動作。

`404` 若場景不存在。

### `PATCH /api/scenes/:id`
局部更新場景。`name`、`actions` 都可以單獨給，也可以一起給。

- 只給 `name` → 只改名字，actions 不變
- 只給 `actions` → **整批替換**（先刪除該場景底下所有舊 actions，再寫入新的），name 不變
- `actions` 的驗證規則跟 `POST /api/scenes` 相同

**回應** `200` 更新後的場景完整明細（跟 `GET /api/scenes/:id` 格式相同）／`404` 場景不存在／`400` 驗證失敗

### `DELETE /api/scenes/:id`
刪除場景。底下的 actions 靠 FK `ON DELETE CASCADE` 自動清掉，**不會**動到任何 Circuit 本身的資料。

**回應** `200 { "ok": true }` ／ `404` 場景不存在

### `POST /api/scenes/:id/apply`
套用場景：對場景底下每個 action **平行**呼叫跟 `/api/circuits/:id/set` 相同的核心邏輯（`setCircuitValue()`），任何一個 Circuit 失敗都不影響其他 Circuit。

**回應** `200`
```json
{
  "scene_id": 1,
  "results": [
    { "ok": true, "circuit_id": 2, "value": false },
    { "ok": false, "circuit_id": 5, "error": "set failed: device unreachable" }
  ],
  "success_count": 1,
  "error_count": 1
}
```
`404` 若場景不存在。

---

## Space 全開／全關（快捷群組操作）

### `POST /api/spaces/:id/bulk-set`
把指定 Space 底下**所有** Circuit 平行設成同一個目標值（不需要事先建立場景）。跟場景套用一樣，部分 Circuit 失敗不影響其他 Circuit。

**請求 body**：`{ "value": true }`（`value` 必填，必須是 boolean）

**回應** `200`
```json
{
  "space_id": 1,
  "results": [
    { "ok": true, "circuit_id": 2, "value": true },
    { "ok": true, "circuit_id": 3, "value": true }
  ],
  "success_count": 2,
  "error_count": 0
}
```
`404` 若 Space 不存在／`400` `value` 缺失或非 boolean

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

## 備份／還原

個人單機工具的全站備份機制：一鍵把資料庫＋底圖圖片打包成單一 zip 檔下載，之後可以上傳同一個 zip 還原。

### `GET /api/backup/export`
匯出前會先對 SQLite 執行 `wal_checkpoint(TRUNCATE)`，確保 WAL 內容 flush 回主 db 檔案，備份檔案內容完整（不需另外處理 `-wal`/`-shm`）。

**回應** `200`，`Content-Type: application/zip`，`Content-Disposition: attachment; filename="scada-backup-<時間戳>.zip"`

zip 內容：
```
manifest.json   # { "app": "scada-lighting-control", "version": 1, "created_at": "<ISO時間>" }
scada.db        # 資料庫檔案的原始 bytes
uploads/**      # UPLOADS_DIR 底下所有檔案，保留相對路徑
```

### `POST /api/backup/restore`
還原備份。

**請求**：`multipart/form-data`，欄位名稱 `file`（`GET /api/backup/export` 產生的 zip）

**驗證規則**：
- zip 裡必須有 `manifest.json` 且 `app === "scada-lighting-control"`，否則 `400 { "error": "不是有效的備份檔" }`
- zip 裡必須有 `scada.db` 這個 entry，否則 `400 { "error": "不是有效的備份檔（缺少 scada.db）" }`

**還原行為（重要：採用簡化設計，避免熱切換已開啟的資料庫連線）**：
1. `uploads/` 會立即套用——清空現有 UPLOADS_DIR 內容，把 zip 裡 `uploads/` 底下的檔案全部還原進去。這一步呼叫成功後就已經生效，不需要重啟。
2. 還原的 `scada.db` 會先寫到 `<DB_PATH>.restoring`（不會直接覆蓋正在使用中的資料庫檔案），並寫一個標記檔案 `<DATA_DIR>/.pending-restore` 記錄待套用的路徑。
3. **資料庫的還原要等下一次伺服器啟動才會真正套用**：下次啟動時（`src/lib/server/db.ts` 建立 `better-sqlite3` 連線之前），如果偵測到標記檔案存在，會把現有的 `scada.db` 改名成 `scada.db.bak`，把 `.restoring` 檔案 rename 成正式的 `scada.db`，刪除標記檔案，然後才正常建立 DB 連線。

**回應** `200`
```json
{ "ok": true, "action_required": "請重新啟動伺服器（Ctrl+C 後重新執行 npm run dev）以套用還原的資料" }
```
收到這個回應後，**務必重新啟動伺服器**（`Ctrl+C` 後重新 `npm run dev`），否則資料庫內容還是還原前的舊狀態（uploads 已經是新的，但 DB 要等重啟）。

`400`：格式不符的檔案（見上方驗證規則）；此時現有資料庫**不會**被動到。

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
