# CP Whiteboard — 競程白板

純前端競程 (Competitive Programming) 白板工具，使用 HTML Canvas API 打造，無需任何框架或建置工具。

## 功能

### 基本圖形

- 矩形、圓形、線段、箭頭、文字
- 拖曳建立、調整大小、旋轉

### 資料結構視覺化

- **矩陣 (Matrix)** — 2D 格子，支援高亮特定儲存格
- **堆疊 (Stack)** — 由下而上 LIFO 視覺化
- **佇列 (Queue)** — 由左至右 FIFO 視覺化

### 樹結構視覺化

- 二元樹、BST、AVL 樹、紅黑樹
- 文字轉樹（父節點格式或數值列表自動建樹）
- Reingold-Tilford 佈局演算法

### 圖論視覺化

- 有向 / 無向圖
- 文字轉圖（N M 格式 + 邊列表）
- Fruchterman-Reingold 力導向佈局
- 邊權重顯示
- Alt + 拖曳節點可即時建立邊

### 互動功能

- 無限畫布：滾輪縮放、平移
- 拖曳 / 調整大小 / 旋轉
- 多選 / 框選
- 圖層管理（上移 / 下移 / 可見性切換）

### 樣式控制

- 16 色面板
- 透明度 / 飽和度 / 線寬滑桿

### 匯出 / 匯入

- JSON 匯出 / 匯入（`Ctrl+S` 快速匯出）
- PNG 圖片匯出（2x 解析度）

### Undo / Redo

- 完整的復原 / 重做支援（Command Pattern）

---

## 快捷鍵

| 按鍵 | 功能 |
| --- | --- |
| `V` | 選取工具 |
| `H` | 平移工具 |
| `R` | 矩形 |
| `C` | 圓形 |
| `L` | 線段 |
| `A` | 箭頭 |
| `T` | 文字 |
| `Space` (按住) | 臨時切換平移 |
| `Delete` / `Backspace` | 刪除選取 |
| `Ctrl+Z` | 復原 |
| `Ctrl+Shift+Z` / `Ctrl+Y` | 重做 |
| `Ctrl+A` | 全選 |
| `Ctrl+S` | 匯出 JSON |
| `Ctrl+D` | 複製選取 |
| `Escape` | 取消操作 / 清除選取 |
| `Shift` + 旋轉 | 旋轉角度鎖定 15° |

---

## 使用方式

1. 使用 VS Code 的 **Live Server** 或任何靜態檔案伺服器開啟 `index.html`
2. 左側工具列選擇工具，在畫布上點擊或拖曳建立元素
3. 資料結構 / 樹 / 圖元素建立後會自動跳出輸入對話框
4. 雙擊已有元素可重新編輯其內容
5. 右側面板可調整選取元素的屬性

> ⚠️ 必須透過 HTTP 伺服器開啟（ES Modules 不支援 `file://` 協定）

---

## 專案結構

```text
index.html          主頁面
css/
  colors.css        色彩變數
  main.css          全域樣式
  toolbar.css       工具列樣式
  panels.css        面板與對話框樣式
js/
  app.js            應用程式進入點
  canvas/
    Camera.js       相機（平移 & 縮放）
    Grid.js         無限格線
    Renderer.js     RAF 渲染迴圈
    HitTest.js      幾何碰撞偵測
  core/
    Element.js      元素抽象基類
    SelectionManager.js  選取管理
    LayerManager.js      圖層管理
    Transform.js         拖曳 / 縮放 / 旋轉
    History.js           Undo / Redo
    Serializer.js        JSON & PNG 匯出入
  elements/
    ShapeElement.js      矩形 / 圓形 / 線段 / 箭頭
    TextElement.js       文字元素
    MatrixElement.js     矩陣
    StackElement.js      堆疊
    QueueElement.js      佇列
  tree/
    TreeParser.js        樹結構解析
    TreeLayout.js        Reingold-Tilford 佈局
    TreeRenderer.js      樹渲染
    TreeElement.js       樹容器元素
  graph/
    GraphParser.js       圖解析
    GraphLayout.js       力導向佈局
    GraphRenderer.js     圖渲染
    GraphElement.js      圖容器元素
  ui/
    Toolbar.js           工具列
    PropertyPanel.js     屬性面板
    LayerPanel.js        圖層面板
    TextInputDialog.js   文字輸入對話框
    ColorPicker.js       色彩選取器
Docs/
  typing.md          需求規格
```

---

## 技術細節

- **渲染**：Canvas 2D + `requestAnimationFrame` + dirty flag
- **座標系統**：世界座標，Camera 負責 screen ↔ world 轉換
- **HiDPI**：`devicePixelRatio` 自動適配
- **樹佈局**：Reingold-Tilford (Buchheim et al.)，O(n)
- **圖佈局**：Fruchterman-Reingold 力導向，80 次迭代
- **碰撞偵測**：幾何式（AABB、橢圓方程、點到線段距離）
- **Undo/Redo**：Command Pattern，最多 100 步
