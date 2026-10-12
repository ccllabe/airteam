# CGU AIR Team 活動記錄

網頁：https://ccllabe.github.io/airteam/event.html

GitHub Pages 提供靜態網頁，Google Drive 分享連結沒有提供瀏覽器可直接呼叫的資料夾列表 API。此頁透過 Google Apps Script 讀取固定的活動根資料夾；無須 API 金鑰。未設定讀取端前，頁面顯示 2026/10/13 擷取的真實活動快照，並明確標示尚未啟用即時連線。

## 啟用即時讀取（只需一次）

1. 使用能存取活動根資料夾的 Google 帳號開啟 https://script.google.com/ ，建立「新專案」。
2. 將本專案 `drive-events.gs` 的內容完整貼到 Apps Script 的 `程式碼.gs`，儲存。
3. 點選「部署 → 新增部署作業」，類型選「網頁應用程式」。
4. 「執行身分」選「我」，「誰可以存取」選「所有人」（包含未登入者）。依畫面指示授權 Drive 讀取權限。若學校帳號不提供「所有人」，需由 Google Workspace 管理員允許公開網頁應用程式，或使用可公開部署且能讀取此資料夾的帳號。
5. 複製部署產生的網址，須為 `https://script.google.com/macros/s/部署ID/exec`，不要用 `/dev` 測試網址。
6. 將網址填入 `event-config.js` 的 `endpoint`，提交到 GitHub 的 `main` 分支。也可以把網址貼給 Codex 完成設定。
7. 開啟 `event.html`，確認提示為「已連線 Google Drive」。可新增或修改活動報導，按「重新整理」驗證最新內容。

讀取端每次請求都讀取 Drive，不使用後端內容快取。網頁開啟時、回到分頁時及可見期間每 60 秒更新；這是定時同步，非 Drive 推播。連線失敗會標示錯誤並保留已載入內容。

## 活動資料夾規則

根資料夾：https://drive.google.com/drive/folders/1Q9r9_8J0SsgRuO8-pbkSHdZNyrSPRFSI

每個根資料夾下的直接子資料夾代表一則活動，其第一層必須同時有：

- `封面圖片.png`：PNG 圖片。
- `活動報導.md`：UTF-8 Markdown 文字。

缺少任一檔案就略過整則活動；不遞迴搜尋更深層的資料夾。同名檔案有多份時使用最後修改的一份。Markdown 第一個 `# 標題` 作為新聞標題，沒有則用資料夾名稱。排序使用 **Drive 資料夾建立時間**，非資料夾名稱、活動日期或修改時間。

封面依螢幕寬度縮放、保留比例，不裁切。即時模式由讀取端傳回 Drive 縮圖（無縮圖則使用原圖），避免 Google Drive 圖片連結在訪客瀏覽器遭到限制。報導支援 Markdown，輸出會以 DOMPurify 清理。Markdown 中另行引用的圖片仍須可供訪客讀取。

部署為「以我執行、所有人可存取」代表這兩個指定檔案的內容會公開給網站訪客。程式只開放固定根資料夾，不接受外部傳入任意資料夾 ID。Apps Script 的服務配額與執行時間限制仍適用；活動與流量增加時需評估。

修改 `drive-events.gs` 後，需在 Apps Script 的「管理部署作業 → 編輯 → 新版本」更新部署。

## 本機預覽

在本專案目錄執行 `python -m http.server 8000`，開啟 http://localhost:8000/event.html 。

Markdown 解析器及清理器已固定版本並放在 `vendor/`（marked 15.0.12、DOMPurify 3.2.7），不依賴外部 CDN。
