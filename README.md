# CP Whiteboard — 競程白板

純前端競程（Competitive Programming）白板工具，支援繪圖、文字、矩陣、Stack／Queue、Tree／Graph、Markdown 與 Mermaid，也可排序圖層、切換可見狀態及鎖定圖層。

支援匯入／匯出白板 JSON、自動儲存，以及匯出 PNG。免登入本機模式仍是預設；可選的帳號與雲端白板需先設定 Clerk、Cloudflare D1 與 Worker，設定步驟見 `server/DEPLOYMENT.md`。分享與即時協作程式已接上；尚未完成正式部署與整合驗證。帳號成員目前限於已註冊、已驗證 email 的 Clerk 使用者，加入時不會寄送通知信。

開發測試：

```sh
npm test
npm run test:browser
```
