// Мінімальний генератор файлів Excel (.xlsx) без сторонніх бібліотек.
// .xlsx — це ZIP-архів з XML-файлами; тут архів без стиснення (метод «store»).
//
// buildXlsx([{ name, columns: [{ header, width, type }], rows: [[...]], total: { label, sum: [colIndex…] } }])
// type: 'text' | 'date' | 'time' | 'datetime' | 'duration' (мс) | 'hours' (число, 2 знаки) | 'int'
// Значення для date/time/datetime — мітка часу в мс; для duration — тривалість у мс.

const DAY_MS = 86400000;

// Стилі (індекси cellXfs у styles.xml)
const S = { text: 0, head: 1, date: 2, time: 3, duration: 4, hours: 5, datetime: 6, int: 7,
  totalText: 8, totalDuration: 9, totalHours: 10, totalInt: 11, wrap: 12 };

const esc = (v) => String(v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // символи, заборонені в XML
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

// Мітка часу (мс) → серійне число Excel у місцевому часі
const excelDate = (ms) => (ms - new Date(ms).getTimezoneOffset() * 60000) / DAY_MS + 25569;

function colName(i) {
  let s = '';
  for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}

function cell(ref, value, type) {
  if (value === null || value === undefined || value === '') return '';
  switch (type) {
    case 'date': return `<c r="${ref}" s="${S.date}"><v>${Math.floor(excelDate(value))}</v></c>`;
    case 'time': return `<c r="${ref}" s="${S.time}"><v>${excelDate(value)}</v></c>`;
    case 'datetime': return `<c r="${ref}" s="${S.datetime}"><v>${excelDate(value)}</v></c>`;
    case 'duration': return `<c r="${ref}" s="${S.duration}"><v>${Math.round(value / 60000) / 1440}</v></c>`; // до хвилини
    case 'hours': return `<c r="${ref}" s="${S.hours}"><v>${Math.round((value / 3600000) * 100) / 100}</v></c>`;
    case 'int': return `<c r="${ref}" s="${S.int}"><v>${value}</v></c>`;
    case 'wrap': return `<c r="${ref}" s="${S.wrap}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
    default: return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
  }
}

function sheetXml({ columns, rows, total }) {
  const last = colName(columns.length - 1);
  const cols = columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width || 14}" customWidth="1"/>`).join('');
  const head = `<row r="1">${columns.map((c, i) => `<c r="${colName(i)}1" s="${S.head}" t="inlineStr"><is><t>${esc(c.header)}</t></is></c>`).join('')}</row>`;
  const body = rows.map((r, ri) => `<row r="${ri + 2}">${columns.map((c, ci) => cell(`${colName(ci)}${ri + 2}`, r[ci], c.type)).join('')}</row>`).join('');
  let tot = '';
  const lastRow = rows.length + 1;
  if (total && rows.length) {
    const tr = rows.length + 2;
    const cells = columns.map((c, ci) => {
      const ref = `${colName(ci)}${tr}`;
      if (ci === 0) return `<c r="${ref}" s="${S.totalText}" t="inlineStr"><is><t>${esc(total.label || 'Разом')}</t></is></c>`;
      if (total.sum?.includes(ci)) {
        const st = { duration: S.totalDuration, hours: S.totalHours, int: S.totalInt }[c.type] ?? S.totalInt;
        return `<c r="${ref}" s="${st}"><f>SUM(${colName(ci)}2:${colName(ci)}${lastRow})</f></c>`;
      }
      return `<c r="${ref}" s="${S.totalText}"/>`;
    }).join('');
    tot = `<row r="${tr}">${cells}</row>`;
  }
  const filter = rows.length ? `<autoFilter ref="A1:${last}${lastRow}"/>` : '';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    + '<sheetFormatPr defaultRowHeight="15"/>'
    + `<cols>${cols}</cols><sheetData>${head}${body}${tot}</sheetData>${filter}</worksheet>`;
}

const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  + '<numFmts count="5">'
  + '<numFmt numFmtId="164" formatCode="dd.mm.yyyy"/>'
  + '<numFmt numFmtId="165" formatCode="hh:mm"/>'
  + '<numFmt numFmtId="166" formatCode="[h]:mm"/>'
  + '<numFmt numFmtId="167" formatCode="0.00"/>'
  + '<numFmt numFmtId="168" formatCode="dd.mm.yyyy hh:mm"/>'
  + '</numFmts>'
  + '<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font>'
  + '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>'
  + '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
  + '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
  + '<fill><patternFill patternType="solid"><fgColor rgb="FF14306B"/><bgColor indexed="64"/></patternFill></fill>'
  + '<fill><patternFill patternType="solid"><fgColor rgb="FFDCE7FB"/><bgColor indexed="64"/></patternFill></fill></fills>'
  + '<borders count="2"><border/><border><top style="thin"><color rgb="FF14306B"/></top></border></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="13">'
  + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' // 0 text
  + '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' // 1 head
  + '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' // 2 date
  + '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' // 3 time
  + '<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' // 4 duration
  + '<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' // 5 hours
  + '<xf numFmtId="168" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' // 6 datetime
  + '<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' // 7 int
  + '<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' // 8 total text
  + '<xf numFmtId="166" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' // 9
  + '<xf numFmtId="167" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' // 10
  + '<xf numFmtId="1" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' // 11
  + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>' // 12 wrap
  + '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

const safeSheetName = (n, i) => (String(n).replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || `Аркуш${i + 1}`);

export function buildXlsx(sheets) {
  const names = sheets.map((s, i) => safeSheetName(s.name, i));
  const files = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
      + '</Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + '</Relationships>'],
    ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + '<sheets>' + names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets>'
      + '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
      + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
      + '</Relationships>'],
    ['xl/styles.xml', STYLES],
    ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)]),
  ];
  return zip(files);
}

// ---------- ZIP (без стиснення) ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function zip(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  // Фіксована дата у форматі DOS (1.1.2024 00:00), щоб файл не залежав від часу
  const dosTime = 0, dosDate = ((2024 - 1980) << 9) | (1 << 5) | 1;
  for (const [name, text] of files) {
    const nameB = enc.encode(name), data = enc.encode(text), crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true); local.setUint16(10, dosTime, true); local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true);
    local.setUint16(26, nameB.length, true); local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), nameB, data);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
    cen.setUint16(10, 0, true); cen.setUint16(12, dosTime, true); cen.setUint16(14, dosDate, true);
    cen.setUint32(16, crc, true); cen.setUint32(20, data.length, true); cen.setUint32(24, data.length, true);
    cen.setUint16(28, nameB.length, true); cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), nameB);
    offset += 30 + nameB.length + data.length;
  }
  const cenSize = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cenSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let p = 0;
  for (const b of all) { out.set(b, p); p += b.length; }
  return out;
}

export function downloadXlsx(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
