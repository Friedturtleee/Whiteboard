# 白板帳號、分享與多人協作實作規劃

> 狀態：主要程式流程已接線（Clerk 前端登入、D1/Worker 白板 API、owner/member ACL、唯讀分享、一次性 WebSocket ticket、Yjs 同步與個人 undo）。尚未配置正式環境、部署或做雙客戶端整合驗證；目前不要視為可對外上線版本。
>
> 給下一位 agent：先讀 [`main.md`](main.md)、本文件及下方列出的程式，再依「階段與驗收」逐段實作；不要直接把舊協作入口打開。每階段都要保留免登入的本機模式。

## 1. 目標與第一版界線

- 免登入仍能建立、編輯、匯入／匯出本機白板。
- 登入後可將**使用者明確選擇**的白板另存到雲端，在「我的白板」跨裝置開啟。
- 擁有者可邀請指定帳號為 `editor` 或 `viewer`；可移除成員。
- 擁有者可建立可撤銷、可到期的**唯讀分享連結**。持連結者可以不登入，但不能寫入、改權限或列出其他白板。
- 有編輯權的成員能即時協作；游標／在線狀態是暫時資料，內容則持久保存。
- 第一版**不做**匿名編輯連結、團隊／組織、公開搜尋、留言、檔案附件、完整版本歷史或保證離線編輯。這些不應拖延權限正確性。
- 保留現有 JSON／PNG 匯出；雲端保存不應是唯一的資料取回方式。

## 2. 已確認的專案現況與風險

| 位置 | 現況／實作前提 |
| --- | --- |
| `js/app.js` | Canvas app、`app.elements`、操作和 undo/redo 主要都在這裡。雲端差異同步目前掛在 `_autosave()` 呼叫，仍需盤點直接修改元素但沒觸發 autosave 的路徑。 |
| `js/core/History.js` | 本機模式使用 Command Pattern；雲端模式的 undo/redo 轉給每個 Y.Doc 的 UndoManager。 |
| `js/core/Serializer.js` / `js/core/WhiteboardElementValidation.js` | 元素 type map、JSON 匯入／Worker 共用的純資料 schema 驗證與匯出入口；拒收不完整或超限的遠端元素。 |
| `js/network/Collaboration.js` | 未被前端啟用的舊雛形：以整個元素 JSON 字串更新 Y.Map；呼叫不存在的 `app.getTypeMap()` 時接收更新會直接跳過；`roomName` 使用亦不一致。不能只加 import 就發布。 |
| `js/network/CloudBoards.js` | 帳號載入、白板清單、另存、成員與連結管理、雲端／本機切換；需要 `js/cloud-config.js` 設定。 |
| `js/network/BoardCollaboration.js` | 雲端啟用後才動態載入 Yjs；物件欄位與長文字分別同步為 `Y.Map/Y.Text`，固定索引陣列以單一 CRDT 欄位原子更新，避免並行編輯矩陣或陣列時發生插入位移。 |
| `server/src/auth.mjs` / `server/src/api.mjs` | Clerk Bearer token、authorized parties、boards/members/share links/tickets API。ACL 由 owner/member/share-link 決定；ticket 為雜湊儲存、30 秒有效並單次兌換。 |
| `server/src/index.js` | API CORS、D1 授權、每板 Durable Object/Yjs/SQLite；唯讀連線拒絕更新，每個 socket 訊息和定期 alarm 重新檢查 ACL。SQLite compaction 使用 `transactionSync()`。 |
| `server/migrations/0001_boards.sql` / `server/wrangler.toml` | D1 schema 已加入；Wrangler 的真實 D1 binding ID 尚需部署者設定。DO namespace 使用 SQLite backend。Worker 與前端靜態資產分開部署。 |

上表是依目前檔案做的**程式碼檢視**，不是已完成的線上安全稽核。開工時重新檢查 `git status`；目前工作樹可能已有他人的未提交修改，勿重置或覆蓋。

## 3. 建議架構與資料流

```text
本機模式：Canvas/App → 統一白板操作層 → 本機儲存／JSON 匯出

雲端模式：Canvas/App → 統一白板操作層 → Y.Doc ↔ Worker ↔ 每板 Durable Object/SQLite
                                      │          │
                                      │          └→ D1：白板索引、成員、分享連結
                                      └→ 暫時 awareness：游標／在線狀態

Clerk：確認登入身分；Worker：針對每個 boardId 決定是否可讀、可寫、可管理。
```

這是**建議採用的架構**，不是現有部署狀態。D1 管跨白板查詢和權限索引；Durable Object 以不可猜測的 `boardId` 定位一塊白板並保存 Yjs 更新。不可再把使用者輸入的房間名稱當權限，也不可用固定的 `default-room`。身分驗證和白板授權是兩道不同的檢查。

前端新增單一「白板操作層」作為所有增刪、屬性、移動、大小、文字、矩陣、圖／樹結構變更的入口。操作層要區分本機操作、遠端更新、undo/redo；遠端更新只更新模型和重繪，不能再次送出或寫入本地 History，避免回音迴圈。先盤點 `app.js`、屬性面板、元素自己的編輯回呼及快捷鍵中的直接寫入，再逐項搬移；**不要用固定間隔全板序列化覆蓋 Y.Doc**。

### 協作資料模型

- 文件根層：`schemaVersion`、`elements`，必要時再加順序／白板設定。`boardId`、ACL、連結權杖不放進 Y.Doc。
- `elements` 以穩定 element ID 為鍵；每個元素用可獨立更新的欄位，而非一整段 JSON 字串。基本欄位（位置、尺寸、旋轉、樣式等）逐欄同步。固定索引陣列（矩陣格、堆疊／佇列項目、圖的節點與邊等）以原子欄位儲存，避免 Yjs 序列合併造成維度或索引錯位；同一陣列同時修改採確定性衝突勝出。`meta.camera` 只保存新雲端板建立時的初始視角；後續每位使用者各自平移／縮放，不互相搶鏡頭。
- 文字、Markdown、Mermaid 原始文字使用 `Y.Text`；矩陣儲存尺寸與逐格值；圖以 node/edge ID、樹以 node ID／父子關係或 edge ID 拆分。結構性修改包在單一 Yjs transaction。筆畫以完整 stroke 為單位；不要逐點廣播巨量畫筆事件。
- 定義元素 schema 版本及從既有 `serialize()` 輸出匯入的轉換器；渲染模型從協作模型建立。遠端內容經同一套型別／尺寸／數量限制驗證；不允許任意物件、原型欄位或未授權的 HTML/SVG 進入顯示路徑。
- 同欄位同時修改採 Yjs 收斂結果；不同欄位、不同節點／格子應能各自保留。若第一版仍有「整塊文字框正在編輯」衝突，先做清楚的 UI 提示與測試，不要宣稱沒有衝突。
- 協作 undo 使用 `Y.UndoManager` 並以 transaction origin 只追蹤**本使用者**操作；本機模式保留現有 `History`。切換白板或模式要清除對上一塊白板的 undo 狀態。

Yjs 的巢狀共享型別與 `UndoManager` 規則請以[共享型別文件](https://docs.yjs.dev/getting-started/working-with-shared-types)和[UndoManager 文件](https://docs.yjs.dev/api/undo-manager)核對，實作時針對文字、矩陣、圖、樹各做雙客戶端競爭測試。

### 資料表草案（D1）

| 表 | 主要欄位 | 約束／用途 |
| --- | --- | --- |
| `boards` | `id`, `owner_user_id`, `title`, `created_at`, `updated_at`, `deleted_at`, `cleanup_pending`, `schema_version` | `id` 為隨機不透明 ID；列表依 owner/member 查詢；刪除先封鎖並標記，DO 清除失敗時 owner 可重試，完成後清除 pending 狀態。 |
| `board_members` | `board_id`, `user_id`, `email_address`, `role`, `created_at` | 唯一鍵 `(board_id,user_id)`；僅由 owner 以 Clerk 已驗證 email 加入既有帳號，`role` 僅 `editor/viewer`，owner 由 `boards` 決定。 |
| `share_links` | `id`, `board_id`, `token_hash`, `expires_at`, `revoked_at`, `created_at` | 第一版角色固定 `viewer`；資料庫只存權杖雜湊，原始權杖只在建立時展示。 |

帳號身分使用 Clerk 穩定 user ID，不以可變 email 當主鍵。刪除帳號／白板時須處理成員關係、連結和實際內容的保留期或刪除流程；這項政策在上線前確認。D1 需新增遷移檔、開發／正式環境綁定及最小權限設定，不把金鑰提交到 Git。[Cloudflare D1 Worker 綁定文件](https://developers.cloudflare.com/d1/worker-api/d1-database/)

### API 與權限契約草案

| 路徑／動作 | 身分 | 權限／結果 |
| --- | --- | --- |
| `GET /api/boards`, `POST /api/boards` | Clerk 使用者 | 只列自己擁有或加入的板；新建板 owner 為本人。 |
| `GET /api/boards/:id` | owner/editor/viewer，或有效唯讀連結 | 回傳允許檢視的中繼資料，不洩漏成員信箱、權杖雜湊或其他板。 |
| `PATCH/DELETE /api/boards/:id` | owner | 改名／刪除；刪除後拒絕新連線並關閉既有連線。 |
| `GET/POST/PUT/DELETE /api/boards/:id/members` | owner | 列出／以已驗證 email 加入既有帳號（不寄送通知信）／調整角色／移除成員。 |
| `GET/POST/DELETE /api/boards/:id/links` | owner | 列出／建立／撤銷唯讀連結；可設定到期時間。 |
| `POST /api/boards/:id/connect-ticket` | 有效板級身分或唯讀連結 | 驗證後給短效、限板、限角色的單次 WebSocket ticket。 |
| `GET /api/boards/:id/connect?ticket=...` | 有效 ticket | Worker 再次判權後轉到該板 DO；DO 綁定 `userId/role/ACL revision` 到 socket。 |

API 名稱是建議草案，實作可調整，但每條路徑的驗證、授權和測試不可省略。HTTP 使用 Clerk 身分憑證；WebSocket 不能靠「前端把編輯按鈕藏起來」保護。避免把長效 Clerk token 放入 URL：URL 可能進入瀏覽器歷史、代理記錄或分析系統。短效 ticket 也需防重放，且不能成為繞過分享連結到期／撤銷的永久授權。Clerk 驗證須設定適用的來源限制並取出可信 user ID；以[Clerk request authentication 文件](https://clerk.com/docs/reference/backend/authenticate-request)核對實際 SDK API。

Worker 在握手與**每則寫入訊息**都要區分 editor/viewer；唯讀連線只接受必要讀取協定，不能把 Yjs sync 寫入封包丟給可修改文件的 handler。不要信任 awareness 內客戶端自稱的 user ID、名稱或角色。變更權限／撤銷連結時通知 DO 關閉受影響 socket，並在重連時重新檢查；重啟或休眠後要能從 socket attachment 恢復最低必要授權資訊，再檢查有效性。Cloudflare 的 WebSocket 休眠會重建記憶體狀態，需依其[attachment 文件](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)設計。對訊息大小、頻率、連線數、元素數和更新後文件大小設上限；儲存失敗時不能回報「已儲存」。

Durable Object 的更新壓縮、快照和故障復原必須先測過。現有 `sql.exec('BEGIN TRANSACTION')` 不符合[Cloudflare SQLite storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)；改用 `ctx.storage.transactionSync()` 等支援的方式，測試 100 次以上更新後壓縮、DO 重建、斷線重連仍保留內容。不能在未確認落盤時廣播成功或悄悄丟棄寫入。

## 4. 使用者流程與 UI

1. **本機**：首次進站直接使用；頂部顯示「本機白板」。本機資料仍保存在目前 localStorage 鍵，直到使用者主動另存雲端；不自動把私有內容上傳。
2. **登入／另存雲端**：登入後可進「我的白板」。第一次另存時建立**新板**並複製目前內容，不自動合併、不清除本機原稿；成功後才切換雲端板。
3. **開啟雲端板**：明確顯示板名、角色及「連線中／已同步／離線／儲存失敗」。連線失敗不能讓使用者誤以為修改已寫入雲端；第一版可暫停雲端編輯並提供 JSON 匯出，而不是承諾未實作的離線合併。
4. **分享**：owner 在對話框管理成員、複製唯讀連結、設定到期與撤銷。editor 可編輯但不能管理權限；viewer 不顯示可操作編輯工具，但後端仍須拒絕任何寫入。
5. **協作**：顯示在線成員及游標（避免在畫布上遮住內容）；個人 undo 只撤銷自己的操作。切換板、登出、權限被撤銷時清理 provider、awareness 和本機敏感快取。

目前全站只有一個 autosave key。雲端模式不可繼續把多塊板寫到同一鍵；若要做本機快取，至少按 account ID + board ID 分隔，並定義登出／撤權時的清除政策。不要讓雲端板蓋掉匿名本機白板。

## 5. 實作階段與可交付條件

### P0：整理操作入口與回歸基線

- 盤點各元素的 create/edit/delete、文字輸入、拖曳、層級、矩陣、圖／樹、匯入、undo/redo 路徑；先建立統一操作層和可測試的元素編碼／解碼界面。
- 保持 local-only，不加入 Clerk 畫面或網路請求。既有 `npm test`、`npm run test:browser` 通過；補「每類元素經操作層後匯出／匯入與 undo」測試。
- **完成判準**：所有預定同步的修改都能從同一入口觀察到；沒有需要定時全板覆蓋的漏網操作。

### P1：帳號、板索引、雲端單人保存

- 加入 Clerk 登入／登出和我的白板；建立 D1 遷移與 Worker REST API；補 owner-only ACL。帳號流程的前端 SDK 應固定版本，避免沿用舊 `Collaboration.js` 的動態注入方式。
- 完成「本機板另存新雲端板」與跨裝置讀取；保留本機原稿與 JSON 匯出。修正 DO SQLite 交易／壓縮，做資料持久化測試。
- **完成判準**：A 看不到 B 的私人板；重新整理、DO 重建後資料相同；失敗時本機內容不遺失。

### P2：成員與分享權限

- 加入 editor/viewer 邀請與管理 UI；完成每個 API/WS 的 ACL、短效 ticket、唯讀連結、撤銷／到期。可以先讓編輯者以單人雲端模式操作，再開多游標 UI。
- **完成判準**：匿名猜測 board ID、無權限登入者、被移除者均不能讀寫；唯讀者偽造 WebSocket 寫入也被拒；撤權後既有連線失效。

### P3：即時協作與個人 undo

- 接上 Yjs 的細粒度元素映射、雙向更新、斷線重連、awareness；加入個人 undo。先測文字／形狀，再測矩陣／圖／樹／Markdown/Mermaid／筆畫。
- **完成判準**：兩位 editor 在不同／相同元素上交錯編輯，最終一致；遠端更新不回音；A 的 undo 不撤銷 B 的操作；viewer 只看不寫。

### P4：發布前硬化

- 限流與資源上限、權杖過期、ACL 變更、資料刪除、錯誤／重連 UI、可觀測性及備份演練；Cloudflare 前端與 Worker 各自部署驗證。
- **完成判準**：上述測試在本地與預備環境通過；明確記錄環境變數／D1 遷移／回滾步驟；確認生產環境沒有意外開放的預設房間。

每個階段完成後更新本文件的狀態、實際 API／schema 偏差和剩餘風險。除非使用者另外要求，**不要在完成某階段時自行 push 或部署**。

## 6. 目前程式進度與尚未完成的工作

- **P0 部分完成**：保留匿名本機白板；`_autosave()` 觸發元素差異同步，沒有以定時整板覆蓋取代 CRDT。仍需在瀏覽器逐項核對 `app.js`、PropertyPanel、樹／圖／矩陣回呼及 undo 是否都會觸發同步。
- **P1 程式流程已接線、尚未配置**：新增 Clerk 前端登入、白板 CRUD、D1 schema、雲端清單與本機另存流程。切換白板前會等目前板同步確認，並在確認後才申請短效連線票證；無效元素或同步失敗會阻止切換。帳號身分改變時會離開前一帳號雲端板；若最後修改未確認，優先存入該帳號隔離快取，重新登入後可從未同步草稿清單下載 JSON。遇到 localStorage 容量不足時，只在目前分頁保留唯讀復原畫面、防止跨帳號另存並要求立即匯出 JSON。登出會清除一般快取，但先警告並保留未同步草稿。部署者需建立 Clerk/D1/Worker 設定並完成跨帳號驗證；預設設定留空，不會連線。
- **P2 權限程式已接線、尚未整合驗證**：owner/editor/viewer、可撤銷／到期的唯讀分享、一次性 WebSocket ticket、連線撤權；owner 可用 Clerk 已驗證 email 加入既有帳號。此流程不寄邀請信，也不會自動建立尚未註冊的帳號。
- **P3 基本同步程式已接線**：元素物件／文字欄位使用 Yjs shared types；固定索引陣列以原子欄位處理，避免並行編輯破壞維度，但同一陣列的同時修改採確定性勝出，可能遺失另一方該欄位的更新。切板同步會檢查序列化／schema 驗證結果，最長等待伺服器 ACK 12 秒；逾時保留原畫布，不假稱已儲存。undo/redo 追蹤本機交易；游標／在線成員 UI 尚未完成，兩客戶端衝突尚未驗證。
- **P4 尚未完成**：真實 D1 ID 與 secrets、Cloudflare 部署、REST API 全域限流、備份／保留政策，以及預備環境驗證。Worker 已有每板 50 條 WebSocket 同時連線上限、每連線訊息／頻寬限制、元素／文件大小上限、共用元素 schema 驗證（含 Tree 來源解析與覆寫路徑檢查）及 SQLite 壓縮；仍需 Chrome 兩帳號正向與越權測試、部署安全審查。
- 本次沒有新增或執行測試；完成語法與 whitespace 靜態檢查不等於功能驗收。分享連結／ACL 是安全邊界，設定正式環境前需測負向案例。

## 7. 測試矩陣（至少）

| 情境 | 期待 |
| --- | --- |
| 匿名本機、新帳號、登出後返回 | 本機功能仍可用；雲端內容不因登出而洩漏到另一帳號。 |
| A 擁有板、B 未受邀、C 為 viewer、D 為 editor | B 拒絕讀／連接；C 可讀不可寫；D 可寫不可改分享；A 可管理。 |
| 猜 board ID、竄改 `role`／awareness、重送過期 ticket | 都不能升權；拒絕結果不洩漏白板內容。 |
| 撤銷分享連結、移除成員、板被刪除 | 新請求立即拒絕；已連線 socket 被終止或在下一次操作前重新判權。 |
| 雙人同時移動／改文字／改矩陣格／改圖邊／改樹邊 | 文件收斂，不漏元素、不整板覆寫；符合預定同欄位衝突語義。 |
| A 改動、B 改動、A undo/redo | A 只影響自己追蹤的 transaction；雙方畫面一致。 |
| Worker 休眠／重建、100+ 次更新、SQLite 壓縮、網路中斷 | 重連後完整恢復；寫入失敗不顯示已儲存。 |
| 本機板另存雲端、切換兩板、匯出 JSON 再匯入 | 原本機稿保留；板間內容與 localStorage 不串版。 |
| 切換 Clerk 帳號／外部登出時仍開著雲端板 | 離開舊帳號的雲端板；已確認內容安全切回本機，未確認修改留在舊帳號專屬快取並提示。 |

## 8. 下一位 agent 的起手順序

1. `git status --short` 確認既有修改；讀 `Docs/main.md`、`README.md`、`js/app.js`、`js/core/{History,Serializer}.js`、`js/network/Collaboration.js`、`server/src/{index.js,auth.mjs}` 和測試。勿假設本文寫後程式未變。
2. 先從 P0 開始，新增／調整測試，再改操作入口；**不要**先露出分享按鈕或開啟 WebSocket。
3. 每階段跑 `npm test`、`npm run test:browser`、`git diff --check`；Worker/D1 增加獨立整合測試與權限負向測試。
4. 遇到需產品決策的情況，優先維持本文件第一版界線：本機免登入、指定帳號編輯、匿名連結唯讀、未保證離線編輯；超出時先向使用者確認。

## 9. 參考資料

- [Clerk request authentication](https://clerk.com/docs/reference/backend/authenticate-request)
- [Yjs shared types](https://docs.yjs.dev/getting-started/working-with-shared-types)／[Yjs UndoManager](https://docs.yjs.dev/api/undo-manager)
- [Cloudflare D1 Worker API](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [Cloudflare Durable Object WebSocket hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- [Cloudflare SQLite-backed Durable Object storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
