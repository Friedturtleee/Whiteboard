# CP Whiteboard — 競程白板

純前端競程（Competitive Programming）白板工具，支援繪圖、文字、矩陣、Stack／Queue、Tree／Graph、Markdown 與 Mermaid，也可排序圖層、切換可見狀態及鎖定圖層。

支援匯入／匯出白板 JSON、自動儲存，以及匯出 PNG。免登入本機模式仍是預設；可選的帳號與雲端白板需先設定 Clerk、Cloudflare D1 與 Worker，設定步驟見 `server/DEPLOYMENT.md`。分享與即時協作程式已接上；尚未完成正式部署與整合驗證。帳號成員目前限於已註冊、已驗證 email 的 Clerk 使用者，加入時不會寄送通知信。

## 快速輸入與編輯

樹可直接貼上常見競程輸入：第一行是節點數 `N`，之後恰好 `N-1` 行，每行為 `u v [weight]`。邊視為無向；節點編號可用 `1..N` 或 `0..N-1`，若輸入含 `0` 就以 `0` 為根，否則以 `1` 為根。也可在樹的輸入視窗切換為有根邊列表、父節點陣列或數值列表。

```text
5
1 2
1 3 8
3 4
3 5
```

圖預設使用 `N M`，接著輸入 `M` 條 `u v [weight]` 邊；輸入視窗也可切換有向圖、0-based 編號或鄰接列表。

```text
4 5
1 2
2 3 7
3 4
4 1
1 3 5
```

矩陣、Stack 和 Queue 可雙擊畫面上的儲存格或項目直接改值。按 Enter 或點到外面提交，Escape 取消，Tab 移到下一格；含空格、逗號或引號的資料可在輸入視窗用雙引號表示。

開發測試：

```sh
npm test
npm run test:browser
```
