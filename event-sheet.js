// 讀取 Google Sheets 公開 XLSX 匯出，保留插入在照片欄的圖片與原始列位置。
window.EVENT_SHEET = (() => {
  'use strict';
  const relationshipNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const elements = (node, name) => [...node.getElementsByTagNameNS('*', name)];
  const text = (node, name) => elements(node, name)[0]?.textContent || '';
  const resolve = (base, target) => new URL(target, 'https://xlsx.invalid/' + base).pathname.slice(1);
  const relPath = path => path.replace(/([^/]+)$/, '_rels/$1.rels');

  function read(buffer) {
    const files = fflate.unzipSync(new Uint8Array(buffer));
    function xml(path) {
      if (!files[path]) return null;
      const doc = new DOMParser().parseFromString(fflate.strFromU8(files[path]), 'application/xml');
      if (elements(doc, 'parsererror').length) throw new Error('試算表匯出格式不完整。');
      return doc;
    }
    function relationships(path) {
      const doc = xml(relPath(path));
      return new Map(doc ? elements(doc, 'Relationship').filter(rel => rel.getAttribute('TargetMode') !== 'External')
        .map(rel => [rel.getAttribute('Id'), resolve(path, rel.getAttribute('Target'))]) : []);
    }
    const workbookPath = '_rels/.rels';
    const root = xml(workbookPath);
    const workbook = root && elements(root, 'Relationship').find(rel => rel.getAttribute('Type')?.endsWith('/officeDocument'));
    const path = workbook ? resolve('', workbook.getAttribute('Target')) : 'xl/workbook.xml';
    const workbookDoc = xml(path);
    const first = workbookDoc && elements(workbookDoc, 'sheet')[0];
    const relations = relationships(path);
    const sheetPath = first && relations.get(first.getAttributeNS(relationshipNS, 'id'));
    const sheet = sheetPath && xml(sheetPath);
    if (!sheet) throw new Error('無法讀取試算表，請確認分享權限。');
    const stringsPath = [...relations.values()].find(value => value.endsWith('/sharedStrings.xml'));
    const stringsDoc = stringsPath && xml(stringsPath);
    const strings = stringsDoc ? elements(stringsDoc, 'si').map(si => elements(si, 't').map(t => t.textContent).join('')) : [];
    const stylesPath = [...relations.values()].find(value => value.endsWith('/styles.xml'));
    const styles = stylesPath && xml(stylesPath);
    const customFormats = new Map(styles ? elements(styles, 'numFmt').map(format => [Number(format.getAttribute('numFmtId')), format.getAttribute('formatCode')]) : []);
    const cellFormats = styles && elements(styles, 'cellXfs')[0];
    const dateStyles = cellFormats ? elements(cellFormats, 'xf').map(format => {
      const id = Number(format.getAttribute('numFmtId'));
      const code = (customFormats.get(id) || '').replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
      return (id >= 14 && id <= 22) || (id >= 45 && id <= 47) || /[yd]/i.test(code);
    }) : [];
    const rows = [];
    for (const row of elements(sheet, 'row')) {
      const index = Number(row.getAttribute('r')) - 1;
      if (!Number.isInteger(index) || index < 0) continue;
      rows[index] = [];
      for (const cell of elements(row, 'c')) {
        const letters = cell.getAttribute('r')?.match(/^[A-Z]+/)?.[0];
        if (!letters) continue;
        const column = [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
        const type = cell.getAttribute('t');
        const value = text(cell, 'v');
        let result = value;
        if (type === 's') result = strings[Number(value)] || '';
        else if (type === 'inlineStr') result = elements(cell, 't').map(t => t.textContent).join('');
        else if ((!type || type === 'n') && value !== '' && Number.isFinite(Number(value))) {
          if (dateStyles[Number(cell.getAttribute('s') || 0)]) {
            const date = new Date(Math.round((Number(value) - 25569) * 86400000));
            result = Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '';
          } else result = String(Number(value));
        }
        rows[index][column] = result;
      }
    }
    const sheetRelations = relationships(sheetPath);
    for (const drawing of elements(sheet, 'drawing')) {
      const drawingPath = sheetRelations.get(drawing.getAttributeNS(relationshipNS, 'id'));
      const drawingDoc = drawingPath && xml(drawingPath);
      if (!drawingDoc) continue;
      const drawingRelations = relationships(drawingPath);
      const anchors = [...elements(drawingDoc, 'oneCellAnchor'), ...elements(drawingDoc, 'twoCellAnchor')];
      for (const anchor of anchors) {
        const from = elements(anchor, 'from')[0];
        const row = Number(from && text(from, 'row'));
        const column = Number(from && text(from, 'col'));
        if (!from || !Number.isInteger(row) || !Number.isInteger(column) || row < 1 || column < 0) continue;
        const blip = elements(anchor, 'blip')[0];
        const imagePath = blip && drawingRelations.get(blip.getAttributeNS(relationshipNS, 'embed'));
        const bytes = imagePath && files[imagePath];
        const extension = imagePath?.split('.').pop().toLowerCase();
        const mime = {png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp'}[extension];
        if (!bytes || !mime) continue;
        rows[row] ||= [];
        if (rows[row][column]?.trim()) continue;
        let binary = '';
        for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
        rows[row][column] = 'data:' + mime + ';base64,' + btoa(binary);
      }
    }
    return rows;
  }
  return {read};
})();
