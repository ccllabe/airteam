# CGU AIR Team 活動記錄

網頁：https://ccllabe.github.io/airteam/event.html

內容直接讀取 Google Sheets 的第一個工作表：
https://docs.google.com/spreadsheets/d/1KUzCF6iYFt_MH1uRk9VFdTz-9RxTnpMazDvlQd2aH2k/edit?usp=sharing

這份試算表目前可供未登入訪客讀取，不需要 Apps Script、API 金鑰或另外維護活動快照。請保留「知道連結的所有人可以查看」權限；若改為私人，網站將無法讀取。

## 維護活動

第一列為欄位名稱，每一列代表一篇活動：

| 日期 | 標題 | 文字 (markdown) | 照片 |
| --- | --- | --- | --- |
| 20261012 | 活動標題 | 完整 Markdown 報導 | 可公開讀取的圖片網址 |

- 日期接受 `20261012`、`2026/10/12`、`2026-10-12`、`2026年10月12日`。請使用西元日期；網站依此欄由新到舊排序，同一天依試算表列順序排列。
- 新聞標題以「標題」欄為準，Markdown 內容獨立顯示，支援段落、粗體、清單、連結及小標題。
- 日期、標題或文字缺漏／日期無效時，略過該列並在同步提示中顯示略過數量。全空白列忽略。
- 照片欄請貼入 `https://…` 圖片網址。不可直接插入儲存格圖片或使用 `IMAGE()` 公式，因為 Google 的 CSV 不會提供這些圖片資料。
- 支援公開 Google Drive 圖片的 `https://drive.google.com/file/d/檔案ID/view`、`https://drive.google.com/open?id=檔案ID` 連結，網站會轉成縮圖網址；該圖片也必須允許未登入者查看。Drive 仍可能限制圖片請求，GitHub Pages 或其他公開圖片託管的直接圖片網址較穩定。
- 照片空白或網址格式無效時，保留報導並顯示「尚未提供活動照片」；有效網址載入失敗時顯示照片錯誤提示。

頁面開啟、回到分頁及分頁可見期間每 60 秒都讀取此試算表，也可手動按「重新整理」。Google 可能短暫快取回應，因此更新不是推播且不保證立即出現。讀取失敗時顯示錯誤，保留本次頁面中最後成功取得的內容，不載入先前 Drive 快照。

## 本機預覽

執行 `python -m http.server 8000`，開啟 http://localhost:8000/event.html 。

試算表 ID 位於 `event-config.js`；日後如需更換來源，可修改該設定。Markdown 以本地固定版本的 marked 15.0.12 解析、DOMPurify 3.2.7 清理，不依賴外部 CDN。
