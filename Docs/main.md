# Whiteboard 專案地圖（給 AI 快速接手）

> 本文件是維護時的快速導覽，不取代程式碼。遇到差異時，以目前程式碼與測試為準；修改前先看 `git status`，保留既有未提交變更。

若接手帳號、白板分享或多人協作，先讀 [協作實作規劃](collaboration-plan.md)；功能程式已實作，但尚未設定正式 Clerk、D1 與 Worker，也未部署整合驗證。

## 專案概況

這是一個原生 JavaScript ES module 的 Canvas 白板，沒有前端 bundler，也沒有 TypeScript。入口是根目錄的 `index.html`，主要應用程式在 `js/app.js`。免登入本機模式仍是預設；帳號與雲端白板入口在 `js/network/CloudBoards.js`，Yjs 連線在 `js/network/BoardCollaboration.js`，Worker/D1 API 在 `server/`；`js/core/WhiteboardElementValidation.js` 是 JSON 匯入與雲端元素共用的純資料驗證。雲端功能需要外部設定；未填 `js/cloud-config.js` 時不會載入 Clerk/Yjs SDK 或發出雲端請求。協作實作進度與待辦見 [協作規劃](collaboration-plan.md)。

Node 開發指令：

```sh
npm test
npm run test:browser
```

目前沒有設定 lint、format、build 指令。瀏覽器測試使用 Puppeteer；若涉及 UI、Canvas 或互動，除了單元測試也應跑 browser smoke test。

## 從哪裡開始讀

- `index.html`：頁面 DOM、工具列／面板容器、CDN 函式庫與載入流程；最後由 loader 載入 `js/app.js`。
- `js/app.js`：`App` 主控制器。建立所有 manager/UI 元件、綁定輸入事件、協調新增／編輯／刪除、匯入匯出、自動儲存與 undo/redo。
- `js/canvas/Renderer.js`：dirty flag + `requestAnimationFrame` 繪圖循環；按照 `zIndex` 畫元素，再畫選取視覺效果。
- `js/core/`：共用模型與狀態管理（元素基底、選取、圖層、變形、歷史紀錄、序列化）。
- `js/elements/`：一般形狀、文字、Markdown、筆跡、矩陣、Stack、Queue、Mermaid。
- `js/tree/`、`js/graph/`：樹／圖的解析、版面配置、繪製與元素狀態。
- `js/ui/`：工具列、屬性面板、圖層面板、輸入對話框、顏色選擇器。圖層面板可切換可見狀態、鎖定元素及調整堆疊順序；鎖定會取消該元素正在進行的編輯或變形，鎖定狀態也會隨白板儲存。
- `css/`：`colors.css` 是設計 token；`main.css` 是整體基礎；`toolbar.css`、`panels.css` 是主要 UI；`markdown-dialog.css` 是 Markdown 編輯器。
- `tests/regression.test.js`：Node 原生測試，放資料解析、模型、幾何與 undo/redo 回歸案例。
- `test.js`：Puppeteer 瀏覽器 smoke/regression 測試。
- `server/`：獨立 Cloudflare Worker（Durable Object / Yjs / Clerk / D1 協作後端），不是前端靜態資產；未設定雲端時前端不會載入遠端 SDK 或呼叫它。`server/wrangler.toml` 的 Worker 部署與根目錄前端部署是兩件事。

## 執行期資料流

1. `App` 收到 DOM／Canvas 事件，經 `Camera` 將螢幕座標換成世界座標。
2. `HitTest`、各元素自己的 hit-test 與 `SelectionManager` 決定互動目標。
3. `App`、`Transform` 或 UI 元件更新元素模型；完成一次使用者操作時，把可逆命令送進 `History`。
4. 呼叫 `renderer.markDirty()`，由 `Renderer` 在下一幀重繪。
5. 應用程式會將白板資料存入 localStorage；使用者也可透過 `Serializer` 匯入／匯出 JSON 或 PNG。

常見呼叫鏈：

```text
index.html → App(js/app.js)
           → Camera / SelectionManager / Transform / History / LayerManager
           → Element subclasses
           → Renderer → Canvas
```

座標原則：元素模型通常存世界座標；事件處理要使用 `Camera` 轉換。繪製與 hit-test 都需考慮元素旋轉，修改其中一側時要檢查另一側是否仍與視覺位置一致。尺寸變更也可能改變元素內部幾何，需查看 `onResizeStart`、`onResize` 與 resize-state hook。

## 核心模組責任

- `core/Element.js`：所有元素共用的 id、bounds、旋轉座標、連接埠、樣式與基本 `serialize/deserialize`。
- `core/SelectionManager.js`：選取陣列是 `selectedElements`；提供 `select`、`toggleSelect`、`addToSelection`、`clear` 等方法，沒有 `remove()`。
- `core/History.js`：命令式 undo/redo。新增自訂歷史時，undo 與 redo 都要完整恢復模型、畫面依賴資料及相關連接線；push/undo/redo 也會排程自動儲存。若命令拋錯，命令應留在原堆疊，方便診斷／重試。
- `core/Transform.js`：拖曳、縮放、旋轉、線端點操作的起始快照與完成資訊；App 在完成操作後建立 History 命令。
- `core/LayerManager.js`：圖層順序與 `zIndex` 重排，並建立對應歷史紀錄。
- `core/Serializer.js`：JSON 匯入會先驗證並建立完整的新元素集合，成功後才取代目前畫布；成功匯入會清除舊歷史，避免 undo 操作到舊畫布。`core/WhiteboardElementValidation.js` 提供匯入與 Worker 共用的元素 schema 驗證；匯入限制為 25 MB、10,000 個元素、每筆跡 100,000 點，並限制座標和尺寸以避免資源耗盡。
- `canvas/Camera.js`、`Grid.js`、`HitTest.js`：鏡頭座標、格線與共用命中測試。

### 新增一種白板元素時

通常需一起更新：

1. 新增 `js/elements/<Name>Element.js`，繼承 `Element`，定義繪製、資料狀態、序列化；若尺寸會重排內部內容，定義 resize hook/state。
2. 在 `js/app.js` import 類別，接上工具按鈕／建立流程、編輯入口及適當的 undo 命令。
3. 在 `js/core/Serializer.js` 的 `TYPE_MAP` 加入 type 和 class，確保 JSON 匯入可重建該元素；處理特殊資料驗證。
4. 視需求更新 `index.html`、`js/ui/Toolbar.js`、屬性面板、Canvas hit-test／Renderer 或 CSS。
5. 在 `tests/regression.test.js` 加模型、解析與 undo/redo 測試；在 `test.js` 加瀏覽器繪製／互動 smoke test。

不要只加 Toolbar 按鈕或只加 `TYPE_MAP`：互動建立、JSON round-trip、繪製和 undo 是不同路徑。

## 元素與資料結構

白板主要狀態是 `app.elements`，每一個元素以 `type` 區分並實作 `draw()`、`serialize()`；特殊元素另外負責自己的解析、hit-test 與重建。

- `ShapeElement`：矩形、圓形、橢圓、線與箭頭；線端點可連到其他元素的 connection port。元素改尺寸／位置後，檢查 `App._updateConnectedLines()` 是否需同步。
- `TextElement`：文字及自動尺寸。字型、粗體等變更可能影響寬高，undo/redo 也要重新量測並更新連接線。
- `MatrixElement`：矩陣內容、格線、儲存格選取／高亮與內嵌編輯。文字方向依矩陣旋轉角度吸附到最近的水平或垂直方向。
- `StackElement`、`QueueElement`：陣列式資料結構，共享 `core/DataTokens.js` 的 token 規則。
- `TreeElement`：來源文字解析後建立樹節點；樹權重屬於邊，不是節點。`TreeElement.deserialize()` 會重建節點物件，所以不要讓跨越重建的歷史命令只捕捉舊 node object；需使用路徑或可重建的識別方式。
- `GraphElement`：節點與邊資料；`GraphParser` 處理輸入，`GraphLayout` 配置節點，`GraphRenderer` 繪製。編輯圖時要檢查有向／無向、自環、平行邊與權重。
- `PenElement`：自由筆跡幾何存在 `points`；移動／縮放 undo 必須同步點座標，而不只是 element bounds。
- `MarkdownElement`：Marked/KaTeX/highlight 等瀏覽器全域函式庫負責轉換內容，再產生供 Canvas 繪製的影像；非同步 render 要防止較舊結果覆蓋最新編輯。Markdown 的畫布呈現背景透明，樣式主要由 CSS 管理。
- `MermaidElement`：將序列化的 SVG 字串經 DOMParser 清除 script、事件屬性和外部資源後載入為圖片繪製；重載內容時保留白板儲存的縮放尺寸，較舊的非同步圖片也不會覆蓋新資料。目前不呼叫 Mermaid runtime，也不支援 Markdown fenced `mermaid` code block。

### 輸入佔位符規則

`core/DataTokens.js` 將全形／表意空格 `\u3000` 視為「明確空欄位」；一般 ASCII 空格、tab、逗號是分隔符，不代表空欄位。不要改成會把保留佔位符字串誤認成空值的 sentinel 比較。修改矩陣或 Stack/Queue 解析時，補上開頭、結尾、連續空欄及字面上類似 sentinel 的資料測試。

### Markdown 能力與渲染路徑

- `index.html` 載入 Marked 12、Highlight.js 11.11.2、KaTeX 0.16.47 與 html2canvas CDN；CDN 腳本與樣式使用 SHA-384 Subresource Integrity，更新版本或檔案時必須同步重新計算 integrity，否則瀏覽器會拒絕載入。`MarkdownElement.renderToHTML()` 使用 `marked.parse(..., { gfm: true })`，不是自製 Markdown parser。Markdown 原始內容最多 1 MB，避免即時預覽無上限耗用 CPU／記憶體。
- GFM 的常見表格、刪除線、任務清單與自動連結由 Marked 處理；KaTeX 數學式由自訂前處理器轉換，前處理會先保護 fenced/inline code。
- fenced code 的語言可標成 `cpp`、`c++` 等；沒標語言時由 Highlight.js 自動偵測。要穩定指定語言仍建議加 fence info，例如 ```` ```cpp ````。token 顏色需同時檢查 Markdown preview 的 `css/markdown-dialog.css` 與 Canvas 的 `_applyRenderStyles()`。
- Canvas 正常路徑是 Markdown → HTML → 隱藏 DOM → html2canvas；html2canvas 不可用時會走 SVG foreignObject fallback，新增文字／code token 樣式時要同步檢查兩條路徑。
- 為安全起見，原始 HTML 會被 escape，連結／圖片 URL 僅允許安全 scheme；不要為了支援任意 HTML 而移除這些限制。Mermaid 目前是獨立的 SVG 圖片元素；未使用的 Mermaid runtime 不載入，避免擴大 CDN 攻擊面。

## 修改慣例與高風險點

1. 先讀相關元素類別、其 Renderer/Parser、`App` 的事件入口和回歸測試；不要只改畫圖而忽略 hit-test 或反向操作。
2. 使用 `History` helper 或明確自訂命令。歷史命令必須對稱；重建模型時，避免保存會變成 stale reference 的物件引用。
3. 改尺寸時一起檢查內部幾何、文字尺寸、Pen 點座標、Tree/Graph 節點和連接線。
4. 改解析器時遵守現有上限與「輸入錯誤不可破壞舊資料」的行為；匯入 JSON 也需保留先驗證後提交的流程。
5. Canvas 繪製應使用 `save()/restore()` 隔離 context 狀態，並只在模型變更後標記 renderer dirty。
6. 修改 CSS 時先確認對應 DOM selector；樣式設計 token 優先放 `css/colors.css`，避免把外觀邏輯塞進模型。
7. `js/network/Collaboration.js` 是舊雛形，不要重新啟用；新的雲端程式須經 `CloudBoards` 與 Worker API，且設定留空時必須保持本機免登入模式。

## 部署邊界

- 前端靜態資產位於 repository 根目錄（`index.html`、`js/`、`css/`）；`CNAME` 記錄自訂網域。repository 內沒有 Pages build workflow/config，因此只看 Git push 不能證明靜態網站已部署；應在實際託管平台確認該 commit 的部署狀態，必要時比對線上資產。
- Worker 設定位於 `server/wrangler.toml`，Worker 名稱為 `whiteboard-server`，入口 `server/src/index.js`。D1 migration 在 `server/migrations/`；D1 binding、Clerk secret、ticket secret、精確 CORS/authorized parties 與前端公開設定步驟見 `server/DEPLOYMENT.md`。
- `server/src/auth.mjs` 驗證 Clerk Bearer token 並限制 authorized parties；`server/src/api.mjs` 執行 board owner/member ACL、唯讀分享連結與單次 WebSocket ticket。Worker WebSocket 每個訊息重查 ACL，Durable Object 另以 alarm 檢查休眠後連線；不依賴記憶體 socket Map。尚未完成實際部署設定和雙使用者驗收時，不可稱為 production-ready。
- Worker 若使用手動 Wrangler 部署，Git push 不會自動發布 Worker；只有 Cloudflare Workers Builds 已連接此 repository/branch 時，push 才會觸發 Worker build。部署 Worker 可能影響線上服務，沒有使用者明確要求時只檢查、不部署。
- 前端雲端入口存在不代表生產設定或服務已部署。處理協作／資安需求時分別確認：`js/cloud-config.js` 是否設定、前端是否發請求、D1 migration 是否套用、Worker 是否部署及 ACL 是否通過負向測試。
- repository 沒有 `.gitignore`，而根目錄與 `server/` 的 `node_modules` 合計有 5,583 個已追蹤檔案；套件安裝／更新可能造成大量 vendor 差異。調整依賴前先檢查 `git status`，若要改善此結構，需另案移除已追蹤的依賴檔並新增 ignore 規則；單加 `.gitignore` 不會停止追蹤既有檔案。

## 驗證與接手流程

開始工作：

```sh
git status --short
```

先辨認使用者既有的 dirty files；除非任務要求，不覆寫、不重置、不順手提交。完成程式修改後：

```sh
npm test
npm run test:browser
git diff --check
```

沒有 formatter/linter 腳本時，不要假稱跑過格式化；可用 `git diff --check`、`node --check <file>` 和測試驗證。只有使用者明確要求時才 commit/push。
