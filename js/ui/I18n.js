const translationLines = String.raw`CP WhiteBoard — 競程白板|CP WhiteBoard — Competitive Programming Whiteboard
白板畫布|Whiteboard canvas
載入中…|Loading…
復原 (Ctrl+Z)|Undo (Ctrl+Z)
取消復原 (Ctrl+Shift+Z)|Redo (Ctrl+Shift+Z)
匯出 JSON|Export JSON
匯入 JSON|Import JSON
匯出 PNG|Export PNG
帳號與雲端白板|Account and cloud boards
設定|Settings
繪圖工具（可捲動）|Drawing tools (scrollable)
選取|Select
平移|Pan
矩形|Rectangle
圓形|Circle
線段|Line
箭頭|Arrow
文字|Text
Markdown|Markdown
畫筆|Pen
縮小|Zoom out
放大|Zoom in
顯示全部|Fit all
選取 (V)|Select (V)
平移 (H)|Pan (H)
矩形 (R)|Rectangle (R)
圓形 (C)|Circle (C)
線段 (L)|Line (L)
箭頭 (A)|Arrow (A)
文字 (T)|Text (T)
畫筆 (P)|Pen (P)
矩陣|Matrix
堆疊|Stack
佇列|Queue
樹|Tree
圖論|Graph
物件屬性與圖層|Object properties and layers
屬性|Properties
圖層|Layers
收合屬性|Collapse properties
收合圖層|Collapse layers
編輯資料|Edit data
編輯選取格|Edit selected cells
編輯文字|Edit text
編輯儲存格|Edit cell
文字編輯器|Text editor
清空選取格|Clear selected cells
拖曳選格；Ctrl/⌘ 點選多格，Shift 選範圍。|Drag to select. Ctrl/⌘-click adds cells; Shift-click selects a range.
Enter 編輯；Ctrl/⌘+C/X/V 複製、剪下或貼上。|Press Enter to edit. Ctrl/⌘+C/X/V to copy, cut, or paste.
位置 & 大小|Position and size
格大小|Cell size
色彩|Color
樣式|Style
填充|Fill
空心|Outline
實心|Solid
虛線|Dashed
透明度|Opacity
飽和度|Saturation
線寬|Stroke width
字號|Font size
字體|Font
粗體|Bold
底線|Underline
斜體|Italic
關閉設定|Close settings
縮小 (Ctrl+-)|Zoom out (Ctrl+-)
重置縮放為 100%|Reset zoom to 100%
放大 (Ctrl+=)|Zoom in (Ctrl+=)
顯示全部（Shift+1）；顯示選取（Shift+2）|Fit all (Shift+1); fit selection (Shift+2)
物件操作|Object actions
物件名稱|Object name
重新命名|Rename
複製|Duplicate
轉換為前綴和|Convert to prefix sum
轉換為差分|Convert to difference array
上移一層|Move up one layer
下移一層|Move down one layer
移至最上層|Bring to front
移至最下層|Send to back
刪除|Delete
載入失敗|Load failed
必要模組載入失敗|A required module failed to load
錯誤資訊|Error details
錯誤位置|Error location
重新載入|Reload
清除本機暫存並重載|Clear local cache and reload
未知錯誤|Unknown error
就緒|Ready
載入字型…|Loading fonts…
字型載入逾時，繼續…|Font loading timed out. Continuing…
字型就緒|Fonts ready
字型載入失敗|Font loading failed
載入應用程式…|Loading application…
初始化…|Initializing…
載入中|Loading
語言|Language
介面語言|Interface language
格線|Grid
顯示格線|Show grid
格線間距|Grid spacing
畫筆與線條|Pen and lines
預設筆刷大小|Default pen size
筆刷平滑度|Pen smoothing
預設線寬|Default stroke width
其他|Other
版本|Version
CP WhiteBoard (檢查中...)|CP WhiteBoard (checking…)
樹的類型|Tree type
圖輸入格式|Graph input format
邊列表|Edge list
鄰接列表|Adjacency list
有向圖|Directed graph
0 起始編號|0-based numbering
樹輸入格式|Tree input format
繁體中文|Traditional Chinese
編輯矩陣|Edit matrix
編輯堆疊|Edit stack
編輯佇列|Edit queue
輸入矩陣資料；單一字元會填滿全部格子。|Enter matrix data. One character fills every cell.
數值以空格或換行分隔。|Separate values with spaces or new lines.
競程格式|Contest format
有根邊列表（父節點、子節點）|Rooted edge list (parent, child)
父節點陣列|Parent array
無標頭邊列表|Edge list (no header)
數值列表|Value list
一般樹|General tree
二元樹|Binary tree
紅黑樹|Red-black tree
紅黑樹（舊版）|Red-black tree (legacy)
編輯樹|Edit tree
編輯圖|Edit graph
輸入資料|Enter data
請輸入資料…|Enter data…
取消|Cancel
確認|Confirm
Ctrl/⌘+Enter 確認；Esc 取消|Ctrl/⌘+Enter to apply; Esc to cancel
N 後接 N−1 行：u v [w]|N followed by N−1 edges: u v [w]
編號預設從 1 起始；0 起始請勾選。單節點亦須指定。|IDs start at 1. Select 0-based numbering when needed, including for one node.
N 後接 N−1 行：父節點 子節點 [w]|N followed by N−1 edges: parent child [w]
每行填父節點編號；根填 0。|Enter one parent ID per line; use 0 for the root.
每行輸入 u v [w]；不含節點數。|Enter one edge u v [w] per line; omit the node count.
依序輸入數值，以空格或換行分隔。|Enter values in order, separated by spaces or new lines.
例：|Example:
N M 後接 M 行邊：u v [w]|N M followed by M edges: u v [w]
N 後接 N 行：每行先填 M，再填 M 個鄰點編號。|N, then N rows: M followed by M neighbor IDs.
版本|Version
重新命名|Rename
複製|Duplicate
轉換為前綴和|Convert to prefix sum
轉換為差分|Convert to difference array
上移一層|Move up one layer
下移一層|Move down one layer
移至最上層|Bring to front
移至最下層|Send to back
刪除|Delete
帳號與白板|Account and boards
關閉|Close
將目前白板另存到雲端|Save current board to cloud
返回本機白板|Return to local board
重新整理清單|Refresh list
登出|Sign out
請先登入帳號。|Sign in first.
無法取得登入憑證。請重新登入。|Could not get an access token. Sign in again.
帳號已切換|Account changed
帳號已切換。請先匯出尚未同步的白板 JSON。|Account changed. Export the unsynced board as JSON first.
載入白板清單…|Loading boards…
登入後查看雲端白板。|Sign in to view cloud boards.
登入視窗已開啟。|Sign-in window opened.
已登入|Signed in
擁有者|Owner
編輯者|Editor
檢視者|Viewer
連線中…|Connecting…
同步中…|Syncing…
雲端已同步|Cloud board synced
同步失敗|Sync failed
連線中斷|Disconnected
存取權已變更|Access changed
載入更多白板|Load more boards
尚無雲端白板。可將目前白板另存至雲端。|No cloud boards yet. Save the current board to get started.
白板已封鎖，尚未完成清除。|Board access is blocked until cleanup is complete.
重試清除|Retry cleanup
開啟|Open
分享|Share
改名|Rename board
刪除|Delete
雲端白板名稱：|Cloud board name:
新的白板名稱：|New board name:
未命名白板|Untitled board
名稱長度須為 1–80 個字元。|Name must be 1–80 characters.
白板復原草稿|Board recovery draft
下載草稿 JSON|Download draft JSON
清除本機草稿|Clear local draft
草稿僅保存在此瀏覽器。下載 JSON 後可匯入白板。|This draft is stored only in this browser. Download it as JSON to import it elsewhere.
本機草稿不存在或格式已損壞。|The local draft is missing or corrupted.
自訂顏色|Custom color
十六進位色碼|Hex color
套用|Apply
拖動排序|Drag to reorder
顯示圖層|Show layer
隱藏圖層|Hide layer
解鎖圖層|Unlock layer
鎖定圖層|Lock layer
尚未選取儲存格|No cells selected
雙擊編輯樹資料|Double-click to edit tree data
雙擊編輯圖資料|Double-click to edit graph data
Markdown 原始碼|Markdown source
預覽|Preview
Markdown 預覽|Markdown preview
編輯|Edit
輸入 Markdown…\n\n# 標題\n\n- 清單項目\n- **粗體**、*斜體*|Enter Markdown…\n\n# Heading\n\n- List item\n- **Bold**, *italic*
請先返回本機白板，再匯入 JSON，以免覆蓋尚未同步的內容。|Return to the local board before importing JSON to avoid overwriting unsynced changes.
匯入失敗：|Import failed:
已匯入|Imported
匯入完成，但自動儲存失敗。請立即匯出 JSON。|Import complete, but autosave failed. Export a JSON backup now.
前綴和與差分僅支援有限數值；空白格視為 0。|Prefix sums and difference arrays require finite numbers. Empty cells count as 0.
數值超出範圍，未建立矩陣。|Value out of range. Matrix not created.
結果超出矩陣尺寸上限。|Result exceeds the matrix size limit.
貼上資料不得超過 1 MB。|Pasted data must not exceed 1 MB.
貼上資料超出矩陣範圍，或每列欄數不一致。|Pasted data exceeds the matrix bounds or has inconsistent row widths.
輸入資料不得超過 1 MB。已保留原值。|Input exceeds 1 MB. Original value retained.
邊權重必須是有限數值。|Edge weight must be a finite number.
已匯出 JSON|JSON export complete.
前綴和|Prefix sum
差分|Difference array
Clerk 公開金鑰格式錯誤。|Invalid Clerk publishable key.
無法從 Clerk 公開金鑰讀取網域。|Could not read the domain from the Clerk publishable key.
無法載入 Clerk 登入服務。|Could not load the Clerk sign-in service.
無法啟動 Clerk 登入服務。|Could not start the Clerk sign-in service.
雲端服務尚未設定。請設定 API 網址與 Clerk 公開金鑰。|Cloud service is not configured. Set the API URL and Clerk publishable key.
未同步草稿仍保存在此瀏覽器。請先下載或清除，再登出；共用裝置請留意。確定登出？|This browser has an unsynced draft. Download or delete it before signing out, especially on a shared device. Sign out?
舊帳號仍有草稿。請先匯出 JSON，或返回本機並放棄草稿。|The previous account has a draft. Export JSON, or return to the local board and discard it.
復原期間已停用雲端操作，以防止跨帳號存取。|Cloud actions are disabled during recovery to prevent cross-account access.
修改尚未同步，請同步完成後再建立副本。|Changes are unsynced. Finish syncing before creating a copy.
建立白板前帳號已變更。請重新操作。|The account changed before the board was created. Try again.
建立期間帳號已切換，正以原帳號清理新白板。|Account changed during creation. Removing the new board from the original account.
切換白板前，請先匯出或清除舊帳號的復原草稿。|Before switching boards, export or clear the previous account's recovery draft.
此白板尚未同步。請下載 JSON 或清除草稿，再開啟雲端版。|This board has unsynced changes. Download JSON or clear the draft before opening the cloud copy.
修改尚未同步。請恢復連線或匯出資料，再切換白板。|Changes are unsynced. Reconnect or export before switching boards.
開啟期間帳號已變更。請重新選取白板。|The account changed while opening the board. Select it again.
分享連結與白板不相符。|The share link does not match this board.
連線無法啟動。請返回本機白板。|Could not start the connection. Return to the local board.
無法檢查本機草稿。請允許瀏覽器使用本機儲存，再開啟雲端白板。|Could not check for a local draft. Allow browser storage before opening a cloud board.
權限已變更，草稿未能保存在本機。請立即匯出 JSON。|Permissions changed; the draft could not be saved locally. Export JSON now.
白板過大，無法保存在本機。已設為唯讀，請匯出 JSON。|This board is too large to save locally. It is read-only; export a JSON backup.
帳號已切換。未同步修改已存為舊帳號的本機草稿。|Account changed. Unsynced edits are saved locally under the previous account.
分享選項：1 建立唯讀連結；2 邀請／更新成員；3 管理連結；4 管理成員。|Sharing: 1) Create read-only link; 2) Invite/update member; 3) Manage links; 4) Manage members.
連結有效天數（1–90）：|Link expiry in days (1–90):
唯讀分享連結：|Read-only share link:
輸入已註冊且驗證的帳號電子郵件：|Enter a verified account email:
權限（editor 或 viewer）：|Role (editor or viewer):
權限須為 editor 或 viewer。|Choose editor or viewer.
成員權限已新增或更新。對方須完成註冊與電子郵件驗證。|Member invited or updated. They must register and verify their email.
分享連結已撤銷。|Share link revoked.
目前沒有有效的分享連結。|No active share links.
目前沒有受邀成員。|No invited members.
成員已移除。|Member removed.
成員權限已更新。|Member role updated.
發生未知錯誤。|An unknown error occurred.
舊帳號修改尚未同步。請先匯出 JSON，再返回本機白板。確定返回？|Changes from the previous account are unsynced. Export JSON before returning to the local board. Return?
修改尚未同步。請恢復連線或匯出後，再返回本機白板。|Changes are unsynced. Reconnect or export before returning to the local board.
同步資料格式無效。|Invalid sync data format.
收到未知的同步訊息。|Received an unknown sync message.
白板視角資料無效。|Invalid board view data.
白板同步失敗。請先匯出資料。|Board sync failed. Export your data.
白板元素數量超出雲端上限。請匯出 JSON。|The board exceeds the cloud item limit. Export it as JSON.
白板物件 ID 無效或重複。|Invalid or duplicate board item ID.
單一元素超出雲端大小上限。請匯出 JSON。|An item exceeds the cloud size limit. Export the board as JSON.
白板資料無法轉換。|Could not convert board data.
白板資料超出雲端大小上限。請匯出 JSON。|The board exceeds the cloud size limit. Export it as JSON.
已連線（點擊更換房間）|Connected (click to change room)
連線中或已中斷|Connecting or disconnected
輸入協作房間編號：|Enter a collaboration room ID:
使用相同編號即可共同編輯。|Use the same ID to collaborate.
JSON 檔案不存在或超過 25 MB。|JSON file is missing or exceeds 25 MB.
JSON 檔案格式錯誤，缺少物件清單。|Invalid JSON file: item list is missing.
JSON 檔案超過 10,000 個物件上限。|JSON file exceeds the 10,000-item limit.
JSON 檔案含無效的白板物件。|JSON file contains an invalid board item.
不支援的白板物件類型：|Unsupported board item type:
白板物件位置或尺寸無效。|Invalid board item position or size.
白板物件位置超出支援範圍。|Board item position is out of range.
白板物件樣式資料無效。|Invalid board item style.
白板物件 ID 重複。|Duplicate board item ID.
圖形或連線資料無效。|Invalid shape or connector data.
矩陣尺寸或儲存格資料無效。|Invalid matrix dimensions or cell data.
Stack／Queue 資料無效或超過上限。|Invalid Stack or Queue data, or item limit exceeded.
畫筆資料無效或點數超過上限。|Invalid pen data, or point limit exceeded.
畫筆位置超出支援範圍。|Pen position is out of range.
圖或邊資料無效或超過上限。|Invalid graph or edge data, or limit exceeded.
圖節點資料無效。|Invalid graph node data.
圖邊連接到不存在的節點。|Graph edge references a missing node.
樹資料無效或超過上限。|Invalid tree data, or limit exceeded.
文字或樣式資料無效或超過上限。|Invalid text or style data, or limit exceeded.
Markdown 或樣式資料無效或超過上限。|Invalid Markdown or style data, or limit exceeded.
Mermaid SVG 資料無效或超過上限。|Invalid Mermaid SVG data, or limit exceeded.
白板視角設定無效。|Invalid board view settings.
白板物件欄位、位置或尺寸無效。|Invalid board item fields, position, or size.
白板物件 ID 無效。|Invalid board item ID.
矩陣資料不得超過 1 MB。|Matrix data must be 1 MB or less.
矩陣上限為 200 × 200，最多 10,000 格。|Matrix limit: 200 × 200 or 10,000 cells.
套用後資料不得超過 1 MB。|Resulting data must be 1 MB or less.
矩陣最多支援 200 列。|Matrix limit: 200 rows.
矩陣最多支援 200 欄。|Matrix limit: 200 columns.
矩陣最多 10,000 格。|Matrix limit: 10,000 cells.
輸入資料不得超過 1 MB。|Input must be 1 MB or less.
最多輸入 10,000 項。|Input limit: 10,000 items.
樹資料不得超過 1 MB。|Tree data must be 1 MB or less.
未知的樹輸入格式。|Unknown tree input format.
樹資料格式錯誤。|Invalid tree data.
請輸入樹資料。|Enter tree data.
請輸入節點數與邊資料。|Enter the node count and edges.
第一行需為正整數節點數 N。|Line 1 must contain a positive node count N.
請輸入至少一條有效邊。|Enter at least one valid edge.
請輸入父節點資料。|Enter parent data.
樹值資料格式無效。|Invalid tree value data.
樹值必須為有限數值。|Tree values must be finite numbers.
樹的邊不可重複。|Duplicate tree edge.
邊資料含循環，無法構成樹。|Edges contain a cycle; they cannot form a tree.
邊資料含循環或重複連結，無法構成樹。|Edges contain a cycle or duplicate link; they cannot form a tree.
重複邊權重不一致；請保留一筆資料。|Duplicate edges have different weights. Keep one edge.
圖資料不得超過 1 MB。|Graph data must be 1 MB or less.
未知的圖輸入格式：|Unknown graph input format:
邊列表標頭格式錯誤，應為 N M。|Invalid edge-list header. Expected N M.
N 須大於 0。|N must be greater than 0.
圖資料上限為 500 個節點、100,000 條邊。|Graph limit: 500 nodes and 100,000 edges.
鄰接列表標頭應為 N。|Invalid adjacency-list header. Expected N.
圖資料最多支援 500 個節點。|Graph limit: 500 nodes.
鄰接列表鄰居總數上限為 100,000。|Adjacency-list limit: 100,000 neighbors.
沒有可用的圖節點編號。|No available graph node IDs.
輸出失敗|Export failed
本機白板|Local board
雲端白板|Cloud board
復原|Undo
取消復原|Redo
矩陣最多|Matrix limit
上移|Move up
下移|Move down
（無堆疊資訊）|(No stack information)
Markdown 編輯器|Markdown editor
輸入 Markdown…|Enter Markdown…
# 標題|# Heading
- 清單項目|- List item
- **粗體**、*斜體*|- **Bold**, *italic*
自動存檔解析失敗：|Autosave data could not be parsed:
無法還原自動存檔：|Could not restore autosave:
請先匯出或清除舊帳號的復原草稿，再使用其他帳號。|Export or clear the previous account's recovery draft before using another account.
請先匯出或清除舊帳號的復原草稿，再切換白板。|Export or clear the previous account's recovery draft before switching boards.
無法載入雲端清單|Could not load cloud boards
未同步草稿|Unsynced draft
未同步草稿：|Unsynced draft:
正在建立雲端白板|Creating cloud board
輸入要撤銷的連結編號：|Enter the link number to revoke:
輸入要管理的成員編號：|Enter the member number to manage:
輸入 remove 移除；輸入 editor 或 viewer 設定權限。|Enter remove to remove the member, or editor/viewer to set their role.
樹資料格式無效。|Tree data format is invalid.
邊列表含循環，無法構成樹。|Edges contain a cycle and cannot form a tree.
父節點編號須為安全整數。|Parent IDs must be safe integers.
上移|Move up
下移|Move down
找不到頁面|Page not found
頁面不存在或網址錯誤。|The page does not exist or the URL is incorrect.
回到白板|Back to whiteboard
輸入資料|Enter data
X 位置|X position
Y 位置|Y position
寬度|Width
高度|Height
旋轉角度|Rotation
父節點 子節點 [w]|parent child [w]

主程式載入失敗（404 或語法錯誤）|Main application failed to load (404 or syntax error)
無法載入主程式。請檢查伺服器或程式檔案。|Could not load the application. Check the server or application files.

Markdown 預覽資料不得超過 1 MB。|Markdown preview data must be 1 MB or less.
Markdown 預覽上限為 2,000 行；請縮短內容。|Markdown preview limit is 2,000 lines. Shorten the content.

Markdown 資料過大，無法產生畫布預覽；請縮短內容。|Markdown is too large to render. Shorten it to show the canvas preview.

`.trim().split("\n");
const TRADITIONAL_TO_ENGLISH = new Map(translationLines.map(line => {
    const split = line.indexOf("|");
    return [line.slice(0, split), line.slice(split + 1)];
}));
const ENGLISH_TO_TRADITIONAL = new Map(
    [...TRADITIONAL_TO_ENGLISH].map(([traditional, english]) => [english, traditional])
);

function translateLine(value, locale) {
    const dictionary = locale === "zh-TW" ? ENGLISH_TO_TRADITIONAL : TRADITIONAL_TO_ENGLISH;
    if (dictionary.has(value)) return dictionary.get(value);
    let match;
    if (locale !== "zh-TW") {
        if ((match = value.match(/^貼上 1 個值，或剛好 (\d+) 個值。$/))) return "Paste one value or exactly " + match[1] + (match[1] === "1" ? " value." : " values.");
        if (value.startsWith("顏色 ")) return "Color " + value.slice(3);
        if (value.startsWith("選取 ")) return "Select " + value.slice(3);
        if (value.startsWith("圖層可見 ")) return "Layer visible: " + value.slice(5);
        if (value.startsWith("圖層鎖定 ")) return "Layer locked: " + value.slice(5);
        if (value.startsWith("減少")) return "Decrease " + translateLine(value.slice(2), locale);
        if (value.startsWith("增加")) return "Increase " + translateLine(value.slice(2), locale);
        if (value.startsWith("展開")) return "Expand " + translateLine(value.slice(2), locale);
        if (value.startsWith("收合")) return "Collapse " + translateLine(value.slice(2), locale);
        if ((match = value.match(/^(.+) 色彩分量$/))) return match[1] + " color component";
        if ((match = value.match(/^編輯選取的 (\d+) 格內容$/))) return "Edit values in " + match[1] + " selected cells";
        if ((match = value.match(/^(.+)內容$/))) return translateLine(match[1], locale) + " content";
        if ((match = value.match(/^已選取 (\d+) 格$/))) return "Selected " + match[1] + (match[1] === "1" ? " cell" : " cells");
        if ((match = value.match(/^第 (\d+) 行格式錯誤，應為 (.+)。$/))) return "Invalid format on line " + match[1] + ". Expected " + translateLine(match[2], locale) + ".";
        if ((match = value.match(/^編輯選取的 (\d+) 格$/))) return "Edit " + match[1] + " selected cells";
        if ((match = value.match(/^單一值填滿所有選取格；或輸入 (\d+) 個值。$/))) return "One value fills all selected cells; enter " + match[1] + " values to set them individually.";
        if ((match = value.match(/^輸入 1 個值套用全部，或輸入 (\d+) 個值。$/))) return "Enter one value for all selected cells or enter " + match[1] + " values.";
        if ((match = value.match(/^確定刪除白板「(.+)」？$/))) return "Delete board “" + match[1] + "”?";
        if ((match = value.match(/^(\d+)\. (.+) \((編輯者|檢視者)\)$/))) return match[1] + ". " + match[2] + " (" + translateLine(match[3], locale) + ")";
        if ((match = value.match(/^例：\s*(.*)$/))) return match[1] ? "Example: " + match[1] : "Example:";
        if ((match = value.match(/^第 (\d+) 行節點編號須介於 (\d+) 至 (\d+)。$/))) return "Node IDs on line " + match[1] + " must be between " + match[2] + " and " + match[3] + ".";
        if ((match = value.match(/^第 (\d+) 行節點編號須為安全整數。$/))) return "Node IDs on line " + match[1] + " must be safe integers.";
        if ((match = value.match(/^第 (\d+) 行節點編號須為非負整數。$/))) return "Node IDs on line " + match[1] + " must be non-negative integers.";
        if ((match = value.match(/^第 (\d+) 行節點編號須為正整數。$/))) return "Node IDs on line " + match[1] + " must be positive integers.";
        if ((match = value.match(/^第 (\d+) 行不可將節點設為自身的父節點。$/))) return "A node cannot be its own parent on line " + match[1] + ".";
        if ((match = value.match(/^第 (\d+) 行鄰居編號須為安全整數。$/))) return "Neighbor IDs on line " + match[1] + " must be safe integers.";
        if ((match = value.match(/^第 (\d+) 行鄰居編號須介於 (\d+) 至 (\d+)。$/))) return "Neighbor IDs on line " + match[1] + " must be between " + match[2] + " and " + match[3] + ".";
        if ((match = value.match(/^未同步草稿：(.+)$/))) return "Unsynced draft: " + match[1];
        if ((match = value.match(/^確定清除「(.+)」的未同步草稿？此操作無法復原。$/))) return "Clear unsynced draft “" + match[1] + "”? This cannot be undone.";
        if (value.startsWith("無法載入雲端清單（") && value.endsWith("）。仍可下載本機草稿。")) return "Could not load cloud boards (" + translateLine(value.slice("無法載入雲端清單（".length, -"）。仍可下載本機草稿。".length), locale) + "). The local draft is still available to download.";
        if (value.startsWith("無法開啟分享白板：")) return "Could not open shared board: " + translateLine(value.slice("無法開啟分享白板：".length), locale);
        if (value.includes("；新白板的清理尚未完成：")) {
            const parts = value.split("；新白板的清理尚未完成：");
            return translateLine(parts[0], locale) + "; cleanup of the new board is still pending: " + translateLine(parts[1], locale);
        }
        if ((match = value.match(/^(\d+)\. 到期 (.+)$/))) return match[1] + ". Expires " + match[2];
        if ((match = value.match(/^第 (\d+) 行權重須為有限數值。$/))) return "Weight on line " + match[1] + " must be a finite number.";
        if ((match = value.match(/^第 (\d+) 行不可連接自身。$/))) return "Self-edges are not allowed on line " + match[1] + ".";
        if ((match = value.match(/^標頭宣告 (\d+) 條邊，實際有 (\d+) 行。$/))) return "Header declares " + match[1] + (match[1] === "1" ? " edge, but " : " edges, but ") + match[2] + (match[2] === "1" ? " row was found." : " rows were found.");
        if ((match = value.match(/^鄰接列表須有 (\d+) 行非空資料。$/))) return "Adjacency list must contain " + match[1] + (match[1] === "1" ? " non-empty row." : " non-empty rows.");
        if ((match = value.match(/^N=(\d+) 時，需提供 (\d+) 條邊。$/))) return "For N=" + match[1] + ", provide " + match[2] + (match[2] === "1" ? " edge." : " edges.");
        if ((match = value.match(/^節點數上限為 (\d+)。$/))) return "Node limit: " + match[1] + ".";
        if ((match = value.match(/^有 (\d+) 個節點無法從根節點到達。$/))) return match[1] + (match[1] === "1" ? " node is" : " nodes are") + " unreachable from the root.";
        if ((match = value.match(/^有 (\d+) 個節點無法從節點 (.+) 到達。?$/))) return match[1] + (match[1] === "1" ? " node is" : " nodes are") + " unreachable from node " + match[2] + ".";
        if ((match = value.match(/^(\d+) 個節點無法從根到達$/))) return match[1] + (match[1] === "1" ? " node is" : " nodes are") + " unreachable from the root.";
        if ((match = value.match(/^(\d+) 個節點無法連通。$/))) return match[1] + (match[1] === "1" ? " node is" : " nodes are") + " disconnected.";
        if ((match = value.match(/^有 (\d+) 個節點無法連通。$/))) return match[1] + (match[1] === "1" ? " node is" : " nodes are") + " disconnected.";
        if ((match = value.match(/^節點數不可超過 (\d+)$/))) return "Node limit: " + match[1] + ".";
        if ((match = value.match(/^第 (\d+) 行：(.+) 須為非負整數。$/))) return "Line " + match[1] + ": " + (match[2] === "鄰居數" ? "neighbor count" : match[2]) + " must be a non-negative integer.";
        if ((match = value.match(/^第 (\d+) 行：(.+) 超出安全範圍。$/))) return "Line " + match[1] + ": " + (match[2] === "鄰居數" ? "neighbor count" : match[2]) + " is out of range.";
        if ((match = value.match(/^第 (\d+) 行鄰居數宣告 (\d+)，實際有 (\d+) 個。$/))) return "Line " + match[1] + " declares " + match[2] + (match[2] === "1" ? " neighbor but has " : " neighbors but has ") + match[3] + (match[3] === "1" ? " neighbor." : " neighbors.");
        if ((match = value.match(/^父節點陣列須有且僅有一個根節點；目前為 (\d+) 個。$/))) return "Parent array must have exactly one root; found " + match[1] + ".";
        if ((match = value.match(/^樹須有且僅有一個根節點；目前為 (\d+) 個。$/))) return "Tree must have exactly one root; found " + match[1] + ".";
        if ((match = value.match(/^節點 (.+) 有多個父節點或重複邊。$/))) return "Node " + match[1] + " has multiple parents or duplicate edges.";
        if ((match = value.match(/^節點 (.+) 的父節點編號超出範圍。$/))) return "Parent ID for node " + match[1] + " is out of range.";
        if ((match = value.match(/^樹邊資料上限為 (\d+) 行。$/))) return "Tree edge data limit: " + match[1] + " rows.";
        if ((match = value.match(/^正在建立雲端白板「(.+)」$/))) return "Creating cloud board “" + match[1] + "”";
        if ((match = value.match(/^雲端服務回應 (\d+)$/))) return "Cloud service returned " + match[1];
        if (value.startsWith("匯入失敗：")) return "Import failed: " + value.slice("匯入失敗：".length);
        if (value.startsWith("自動存檔解析失敗：")) return "Autosave data could not be parsed: " + value.slice("自動存檔解析失敗：".length);
        if (value.startsWith("無法還原自動存檔：")) return "Could not restore autosave: " + value.slice("無法還原自動存檔：".length);
        if (value.startsWith("未知的圖輸入格式：")) return "Unknown graph input format: " + value.slice("未知的圖輸入格式：".length);
        if (value.startsWith("不支援的白板物件類型：")) return "Unsupported board item type: " + value.slice("不支援的白板物件類型：".length);
    } else {
        if ((match = value.match(/^Paste one value or exactly (\d+) values?\.$/))) return "貼上 1 個值，或剛好 " + match[1] + " 個值。";
        if (value.startsWith("Color ")) return "顏色 " + value.slice(6);
        if (value.startsWith("Select ")) return "選取 " + value.slice(7);
        if (value.startsWith("Layer visible: ")) return "圖層可見 " + value.slice(15);
        if (value.startsWith("Layer locked: ")) return "圖層鎖定 " + value.slice(14);
        if (value.startsWith("Decrease ")) return "減少" + translateLine(value.slice(9), locale);
        if (value.startsWith("Increase ")) return "增加" + translateLine(value.slice(9), locale);
        if (value.startsWith("Expand ")) return "展開" + translateLine(value.slice(7), locale);
        if (value.startsWith("Collapse ")) return "收合" + translateLine(value.slice(9), locale);
        if ((match = value.match(/^(.+) color component$/))) return match[1] + " 色彩分量";
        if ((match = value.match(/^Edit values in (\d+) selected cells?$/))) return "編輯選取的 " + match[1] + " 格內容";
        if ((match = value.match(/^(.+) content$/))) return translateLine(match[1], locale) + "內容";
        if ((match = value.match(/^Selected (\d+) cells?$/))) return "已選取 " + match[1] + " 格";
        if (value.startsWith("Import failed: ")) return "匯入失敗：" + value.slice("Import failed: ".length);
        if (value.startsWith("Autosave data could not be parsed: ")) return "自動存檔解析失敗：" + value.slice("Autosave data could not be parsed: ".length);
        if (value.startsWith("Could not restore autosave: ")) return "無法還原自動存檔：" + value.slice("Could not restore autosave: ".length);
        if (value.startsWith("Unknown graph input format: ")) return "未知的圖輸入格式：" + value.slice("Unknown graph input format: ".length);
        if (value.startsWith("Unsupported board item type: ")) return "不支援的白板物件類型：" + value.slice("Unsupported board item type: ".length);
        if ((match = value.match(/^Cloud service returned (\d+)$/))) return "雲端服務回應 " + match[1];
        if ((match = value.match(/^Header declares (\d+) edges?, but (\d+) rows? (?:was|were) found\.$/))) return "標頭宣告 " + match[1] + " 條邊，實際有 " + match[2] + " 行。";
        if ((match = value.match(/^Weight on line (\d+) must be a finite number\.$/))) return "第 " + match[1] + " 行權重須為有限數值。";
        if ((match = value.match(/^Clear unsynced draft “(.+)”\? This cannot be undone\.$/))) return "確定清除「" + match[1] + "」的未同步草稿？此操作無法復原。";
        if ((match = value.match(/^(\d+) nodes? (?:are|is) unreachable from node (.+)\.$/))) return "有 " + match[1] + " 個節點無法從節點 " + match[2] + " 到達。";
        if ((match = value.match(/^Tree edge data limit: (\d+) rows\.$/))) return "樹邊資料上限為 " + match[1] + " 行。";
        if ((match = value.match(/^(\d+) nodes? (?:are|is) disconnected\.$/))) return "有 " + match[1] + " 個節點無法連通。";
        if ((match = value.match(/^A node cannot be its own parent on line (\d+)\.$/))) return "第 " + match[1] + " 行不可將節點設為自身的父節點。";
        if ((match = value.match(/^Self-edges are not allowed on line (\d+)\.$/))) return "第 " + match[1] + " 行不可連接自身。";
        if ((match = value.match(/^Node IDs on line (\d+) must be positive integers\.$/))) return "第 " + match[1] + " 行節點編號須為正整數。";
        if ((match = value.match(/^Node IDs on line (\d+) must be non-negative integers\.$/))) return "第 " + match[1] + " 行節點編號須為非負整數。";
        if ((match = value.match(/^Node IDs on line (\d+) must be safe integers\.$/))) return "第 " + match[1] + " 行節點編號須為安全整數。";

        if ((match = value.match(/^Invalid format on line (\d+)\. Expected (.+)\.$/))) return "第 " + match[1] + " 行格式錯誤，應為 " + translateLine(match[2], locale) + "。";
        if ((match = value.match(/^Edit (\d+) selected cells$/))) return "編輯選取的 " + match[1] + " 格";
        if ((match = value.match(/^One value fills all selected cells; enter (\d+) values to set them individually\.$/))) return "單一值填滿所有選取格；或輸入 " + match[1] + " 個值。";
        if ((match = value.match(/^Enter one value for all selected cells or enter (\d+) values\.$/))) return "輸入 1 個值套用全部，或輸入 " + match[1] + " 個值。";
        if ((match = value.match(/^Delete board “(.+)”\?$/))) return "確定刪除白板「" + match[1] + "」？";
        if ((match = value.match(/^(\d+)\. (.+) \((Editor|Viewer)\)$/))) return match[1] + ". " + match[2] + " (" + translateLine(match[3], locale) + ")";
        if ((match = value.match(/^Example:\s*(.*)$/))) return match[1] ? "例：" + match[1] : "例：";
        if ((match = value.match(/^Neighbor IDs on line (\d+) must be safe integers\.$/))) return "第 " + match[1] + " 行鄰居編號須為安全整數。";
        if ((match = value.match(/^Neighbor IDs on line (\d+) must be between (\d+) and (\d+)\.$/))) return "第 " + match[1] + " 行鄰居編號須介於 " + match[2] + " 至 " + match[3] + "。";
        if ((match = value.match(/^Unsynced draft: (.+)$/))) return "未同步草稿：" + match[1];
        if ((match = value.match(/^Clear unsynced draft “(.+)”? This cannot be undone\.$/))) return "確定清除「" + match[1] + "」的未同步草稿？此操作無法復原。";
        if ((match = value.match(/^(\d+) nodes? (?:are|is) unreachable from the root\.$/))) return "有 " + match[1] + " 個節點無法從根節點到達。";
        if (value.startsWith("Could not load cloud boards (") && value.endsWith("). The local draft is still available to download.")) return "無法載入雲端清單（" + translateLine(value.slice("Could not load cloud boards (".length, -"). The local draft is still available to download.".length), locale) + "）。仍可下載本機草稿。";
        if (value.startsWith("Could not open shared board: ")) return "無法開啟分享白板：" + translateLine(value.slice("Could not open shared board: ".length), locale);
        if (value.includes("; cleanup of the new board is still pending: ")) {
            const parts = value.split("; cleanup of the new board is still pending: ");
            return translateLine(parts[0], locale) + "；新白板的清理尚未完成：" + translateLine(parts[1], locale);
        }
        if ((match = value.match(/^(\d+)\. Expires (.+)$/))) return match[1] + ". 到期 " + match[2];
        if ((match = value.match(/^Line (\d+): (.+) must be a non-negative integer\.$/))) return "第 " + match[1] + " 行：" + (match[2] === "neighbor count" ? "鄰居數" : match[2]) + " 須為非負整數。";
        if ((match = value.match(/^Line (\d+): (.+) is out of range\.$/))) return "第 " + match[1] + " 行：" + (match[2] === "neighbor count" ? "鄰居數" : match[2]) + " 超出安全範圍。";
        if ((match = value.match(/^Node IDs on line (\d+) must be between (\d+) and (\d+)\.$/))) return "第 " + match[1] + " 行節點編號須介於 " + match[2] + " 至 " + match[3] + "。";
        if ((match = value.match(/^Line (\d+) declares (\d+) neighbors? but has (\d+) neighbors?\.$/))) return "第 " + match[1] + " 行鄰居數宣告 " + match[2] + "，實際有 " + match[3] + " 個。";
        if ((match = value.match(/^Adjacency list must contain (\d+) non-empty rows?\.$/))) return "鄰接列表須有 " + match[1] + " 行非空資料。";
        if ((match = value.match(/^For N=(\d+), provide (\d+) edges?\.$/))) return "N=" + match[1] + " 時，需提供 " + match[2] + " 條邊。";
        if ((match = value.match(/^Node limit: (\d+)\.$/))) return "節點數上限為 " + match[1] + "。";
        if ((match = value.match(/^Parent array must have exactly one root; found (\d+)\.$/))) return "父節點陣列須有且僅有一個根節點；目前為 " + match[1] + " 個。";
        if ((match = value.match(/^Tree must have exactly one root; found (\d+)\.$/))) return "樹須有且僅有一個根節點；目前為 " + match[1] + " 個。";
        if ((match = value.match(/^Node (.+) has multiple parents or duplicate edges\.$/))) return "節點 " + match[1] + " 有多個父節點或重複邊。";
        if ((match = value.match(/^Parent ID for node (.+) is out of range\.$/))) return "節點 " + match[1] + " 的父節點編號超出範圍。";
        if ((match = value.match(/^Creating cloud board “(.+)”$/))) return "正在建立雲端白板「" + match[1] + "」";
    }
    return value;
}

export function translateText(value, locale = "en") {
    const text = String(value ?? "");
    const translate = line => translateLine(line, locale);
    return text.split("\n").map(translate).join("\n");
}

class I18n {
    constructor() {
        try { this.locale = localStorage.getItem("wb_language") === "zh-TW" ? "zh-TW" : "en"; }
        catch { this.locale = "en"; }
        this.observer = null;
    }

    start() {
        if (typeof document === "undefined" || !document.body) return;
        document.documentElement.lang = this.locale;
        this.apply(document.documentElement);
        this.observer = new MutationObserver(records => {
            for (const record of records) {
                if (record.type === "characterData") this.applyText(record.target);
                else if (record.type === "attributes") this.applyAttribute(record.target, record.attributeName);
                else for (const node of record.addedNodes) this.apply(node);
            }
        });
        this.observer.observe(document.documentElement, {
            subtree: true, childList: true, characterData: true, attributes: true,
            attributeFilter: ["aria-label", "aria-description", "title", "placeholder", "alt", "data-tooltip", "value"]
        });
        const selector = document.getElementById("settings-language");
        if (selector) {
            selector.value = this.locale;
            selector.addEventListener("change", () => this.setLanguage(selector.value));
        }
        this.patchNativeDialogs();
    }

    shouldSkip(element) {
        return !element || Boolean(element.closest("script, style, textarea, code, pre, [contenteditable='true'], [data-no-i18n], .markdown-preview, .markdown-preview-content, .md-render-container, .layer-name, .whiteboard-user-content"));
    }

    shouldSkipAttributes(element, name = null) {
        if (!element) return true;
        if (element.closest("script, style, code, pre, [contenteditable='true'], [data-no-i18n], .whiteboard-user-content")) return true;
        const layerName = element.closest('.layer-name');
        if (layerName && (layerName !== element || (name && name !== 'aria-label'))) return true;
        const markdownContent = element.closest(".markdown-preview, .markdown-preview-content, .md-render-container");
        return Boolean(markdownContent && (
            markdownContent !== element || (name && name !== "aria-label")
        ));
    }

    apply(root) {
        if (!root) return;
        if (root.nodeType === 3) return this.applyText(root);
        if (root.nodeType !== 1 && root.nodeType !== 9) return;
        if (root.nodeType === 1) this.applyAttributes(root);
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) if (!this.shouldSkip(node.parentElement)) this.applyText(node);
        if (root.querySelectorAll) {
            for (const element of root.querySelectorAll("*")) this.applyAttributes(element);
        }
    }

    applyText(node) {
        if (!node?.parentElement || this.shouldSkip(node.parentElement)) return;
        const value = translateText(node.data, this.locale);
        if (value !== node.data) node.data = value;
    }

    applyAttributes(element) {
        if (this.shouldSkipAttributes(element)) return;
        for (const name of ["aria-label", "aria-description", "title", "placeholder", "alt", "data-tooltip"]) this.applyAttribute(element, name);
        if (element.matches("input[type='button'], input[type='submit'], button[value]")) this.applyAttribute(element, "value");
    }

    applyAttribute(element, name) {
        if (this.shouldSkipAttributes(element, name)) return;
        const value = element.getAttribute(name);
        if (value === null) return;
        const translated = translateText(value, this.locale);
        if (translated !== value) element.setAttribute(name, translated);
    }

    setLanguage(locale) {
        this.locale = locale === "zh-TW" ? "zh-TW" : "en";
        document.documentElement.lang = this.locale;
        try { localStorage.setItem("wb_language", this.locale); } catch {}
        const selector = document.getElementById("settings-language");
        if (selector) selector.value = this.locale;
        this.apply(document.documentElement);
        const app = window.appInstance;
        if (app) {
            app.cloudBoards?._renderStatus();
            app.cloudBoards?._refreshLocalizedDates?.();
            for (const element of app.elements || []) {
                if (element.type === "markdown" && element._renderLimitNotice) element._render();
            }
            app.renderer?.markDirty();
        }
    }

    t(value) { return translateText(value, this.locale); }

    patchNativeDialogs() {
        for (const name of ["alert", "confirm", "prompt"]) {
            const native = window[name]?.bind(window);
            if (native) window[name] = (message, ...args) => native(this.t(message), ...args);
        }
    }
}

export const i18n = new I18n();

