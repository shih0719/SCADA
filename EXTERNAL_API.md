# 外部整合 API 文件 — 迴路查詢與控制

本文件只提供給**外部系統**整合用，只涵蓋兩個能力：查詢迴路狀態、控制迴路開關。
系統內部的空間/裝置/迴路管理（新增/刪除/CSV匯入等）不開放給外部系統使用，不在此文件範圍內（如需完整內部 API，見 [API.md](./API.md)）。

## 重要限制（外部系統整合前必讀）

- **沒有任何認證機制**：這是內部單一控制站工具，所有端點目前完全開放，沒有 API Key / Token / 帳密驗證。**只能在受信任的內部網路環境使用**，不要把這個服務暴露到公開網際網路。
- **狀態是輪詢出來的，不是即時的**：後端每隔 1~2 秒（依 Device 設定）才去問一次 Modbus 裝置，所以你查到的狀態永遠是「最近一次輪詢的結果」，不是當下瞬間的真實值，可能有數秒延遲。
- **目前沒有單一迴路查詢端點**：要查某個迴路的狀態，得先呼叫整個 Space 的狀態清單，自己用 `circuit_id` 過濾（見下方範例）。如果外部整合覺得這樣不方便，可以請我們加一個 `GET /api/circuits/:id/status` 的單一迴路版本。
- **沒有 Webhook/推播機制**：外部系統只能主動輪詢，系統不會主動通知你狀態變化。

---

## 1. 查詢迴路

### 步驟一：取得迴路的基本資料（找到它屬於哪個 Space、它的 `circuit_id`）

```
GET /api/circuits?space_id=<space_id>
```

回應範例：
```json
[
  { "id": 2, "space_id": 1, "device_id": 1, "coil_address": 1, "name": "主燈", "pos_x": 100, "pos_y": 200 }
]
```
`id` 就是之後查狀態/控制要用的 `circuit_id`。

> 如果你不知道 `space_id`，先呼叫 `GET /api/spaces` 列出所有空間，從回應裡找到對應的 `id`。

### 步驟二：查詢該 Space 下所有迴路的目前狀態

```
GET /api/spaces/<space_id>/status
```

回應範例：
```json
[
  { "circuit_id": 2, "value": true, "status": "ok", "last_updated_at": "2026-10-10T08:00:00.000Z" },
  { "circuit_id": 3, "value": null, "status": "error", "last_updated_at": null }
]
```

從陣列中找出 `circuit_id` 符合你要查的那一筆，欄位意義：

| 欄位 | 說明 |
|---|---|
| `value` | `true`=開、`false`=關、`null`=目前未知（從未成功讀取過，或讀取失敗中） |
| `status` | `"ok"`=資料即時有效；`"stale"`=資料有點舊但還算有效；`"error"`=連線失敗/逾時/裝置停用，`value` 不可信，請當作「未知」處理，不要當成真正的開關狀態 |
| `last_updated_at` | 最後一次成功讀取的時間（ISO8601），`null` 表示從未成功讀取過 |

**整合建議**：外部系統應該把 `status !== "ok"` 跟 `status === "stale"` 分開處理——`error` 時不要相信 `value`；`stale` 時 `value` 還能參考，但要知道可能有點舊。

### 完整範例（curl）

```bash
# 1. 找到迴路清單
curl http://<host>:<port>/api/circuits?space_id=1

# 2. 查該空間所有迴路狀態，自己找 circuit_id=2 那一筆
curl http://<host>:<port>/api/spaces/1/status
```

---

## 2. 控制迴路

```
POST /api/circuits/<circuit_id>/toggle
```

不需要帶任何 body，呼叫一次就會把該迴路的開關狀態**反轉**（開→關、關→開）。

### 回應

**成功**（`200`）：
```json
{ "ok": true, "circuit_id": 2, "value": true }
```
`value` 是這次切換後的**目標值**（樂觀值），實際真相要等下一輪輪詢確認（通常 1~2 秒內）。

**失敗 — 目前狀態未知**（`409`，這是最常見的失敗情況）：
```json
{ "error": "circuit current state is unknown; cannot toggle until next successful read" }
```
代表系統目前不知道這個迴路現在是開是關（例如裝置剛離線），所以無法「反轉」一個不知道的值。外部系統應該先查詢狀態確認 `status === "ok"` 才呼叫 toggle，或至少準備好處理這個 409。

**失敗 — 寫入失敗**（`502`）：
```json
{ "error": "toggle failed: <原因>" }
```
代表指令送出但 Modbus 寫入失敗（連線問題、逾時等）。

**失敗 — 找不到迴路**（`404`）：
```json
{ "error": "circuit not found" }
```

### 完整範例（curl）

```bash
curl -X POST http://<host>:<port>/api/circuits/2/toggle
```

### 整合注意事項

- toggle 成功的回應只代表「指令已送出」，不代表裝置真的已經切換——要用查詢 API 確認下一輪輪詢後的真實狀態。
- 連續快速呼叫同一個迴路的 toggle 要小心：如果在前一次輪詢確認結果之前又呼叫一次，可能會跟預期的開關順序不一致（因為樂觀值會被下一輪真實輪詢覆蓋）。
- 如果你需要的是「指定目標狀態」（不管目前是開是關，直接設成我要的值），不要用 toggle，改用下面的 `/set` 端點。

---

## 3. 指定開/關（不管目前狀態）

```
POST /api/circuits/<circuit_id>/set
Content-Type: application/json

{ "value": true }
```

跟 toggle 不同，這個端點**不需要知道目前狀態**，直接把迴路設成你指定的 `value`（`true`=開、`false`=關）。重複呼叫同一個值是安全的（idempotent）——例如迴路已經是開的，再呼叫一次 `{"value": true}` 也不會出錯。

### 回應

**成功**（`200`）：
```json
{ "ok": true, "circuit_id": 2, "value": true }
```

**失敗 — 缺少或型別錯誤的 `value`**（`400`）：
```json
{ "error": "value is required and must be a boolean (true or false)" }
```

**失敗 — 寫入失敗**（`502`）：
```json
{ "error": "set failed: <原因>" }
```

**失敗 — 找不到迴路**（`404`）：
```json
{ "error": "circuit not found" }
```

### 完整範例（curl）

```bash
# 開
curl -X POST http://<host>:<port>/api/circuits/2/set \
  -H "Content-Type: application/json" -d '{"value": true}'

# 關
curl -X POST http://<host>:<port>/api/circuits/2/set \
  -H "Content-Type: application/json" -d '{"value": false}'
```

> `/set` 跟 `/toggle` 一樣是「送出指令」，不是「立即保證結果」——一樣要靠查詢 API 確認下一輪輪詢後的真實狀態。它跟 `/toggle` 最大的差別是**不要求目前狀態已知**：即使系統目前不確定這個迴路現在是開是關（例如剛從離線恢復），`/set` 一樣能用，因為它不需要「反轉」一個已知值，只是直接下達目標值。

---

## 需要我們補強的話可以提

如果外部整合有以下需求，請告訴我們，這些都是基於現有系統可以合理擴充的：
- 單一迴路狀態查詢端點（`GET /api/circuits/:id/status`），不用先查清單再過濾
- API Key 驗證（如果要對外網開放，這是必須的，目前絕對不要這樣做）
