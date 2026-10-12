// Google Apps Script：僅讀取固定根資料夾下一層活動資料夾的指定檔案。
const ROOT_FOLDER_ID = '1Q9r9_8J0SsgRuO8-pbkSHdZNyrSPRFSI';

function doGet(e) {
  const callback = e && e.parameter && e.parameter.callback;
  if (callback && !/^airEvents_[a-zA-Z0-9_]+$/.test(callback)) {
    return ContentService.createTextOutput('{"ok":false,"error":"Invalid callback"}')
      .setMimeType(ContentService.MimeType.JSON);
  }
  let payload;
  try {
    const events = [];
    const folders = DriveApp.getFolderById(ROOT_FOLDER_ID).getFolders();
    while (folders.hasNext()) {
      const folder = folders.next();
      const covers = folder.getFilesByName('封面圖片.png');
      const reports = folder.getFilesByName('活動報導.md');
      if (!covers.hasNext() || !reports.hasNext()) continue;
      // 重複檔名時，穩定選取最後修改的版本。
      const cover = newestFile_(covers);
      const report = newestFile_(reports);
      if (cover.getMimeType() !== 'image/png') continue;
      // 縮圖以資料網址傳回，避免 Drive 圖片防盜連及跨來源限制。
      const blob = cover.getThumbnail() || cover.getBlob();
      events.push({
        id: folder.getId(), name: folder.getName(),
        createdTime: folder.getDateCreated().toISOString(),
        markdown: report.getBlob().getDataAsString('UTF-8'),
        coverUrl: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes())
      });
    }
    events.sort((a, b) => Date.parse(b.createdTime) - Date.parse(a.createdTime) || a.id.localeCompare(b.id));
    payload = {ok: true, events: events, fetchedAt: new Date().toISOString()};
  } catch (error) {
    console.error(error);
    payload = {ok: false, error: '無法讀取活動資料，請確認部署帳號的資料夾存取權限。'};
  }
  // U+2028/U+2029 escaped for JavaScript transport compatibility.
  const json = JSON.stringify(payload).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return ContentService.createTextOutput(callback ? callback + '(' + json + ');' : json)
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

function newestFile_(iterator) {
  let selected = iterator.next();
  while (iterator.hasNext()) {
    const candidate = iterator.next();
    if (candidate.getLastUpdated().getTime() > selected.getLastUpdated().getTime()) selected = candidate;
  }
  return selected;
}
