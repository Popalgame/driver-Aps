import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildXlsx } from '../site/src/xlsx.js';

// Розпакувати ZIP без стиснення (як його пише buildXlsx)
function unzip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dec = new TextDecoder();
  const files = {};
  let p = 0;
  while (dv.getUint32(p, true) === 0x04034b50) {
    const size = dv.getUint32(p + 18, true), nlen = dv.getUint16(p + 26, true), xlen = dv.getUint16(p + 28, true);
    const name = dec.decode(bytes.subarray(p + 30, p + 30 + nlen));
    files[name] = dec.decode(bytes.subarray(p + 30 + nlen + xlen, p + 30 + nlen + xlen + size));
    p += 30 + nlen + xlen + size;
  }
  return files;
}

test('xlsx: структура книги, аркуші, значення, формула «Разом»', () => {
  const start = +new Date(2026, 10, 24, 8, 0);
  const bytes = buildXlsx([{
    name: 'Зміни',
    columns: [{ header: 'Дата', type: 'date' }, { header: 'Нотатка', type: 'text' }, { header: 'Час', type: 'duration' }, { header: 'Годин', type: 'hours' }],
    rows: [[start, 'Київ – Львів <A&B>', 7.5 * 3600e3, 7.5 * 3600e3], [start, '', 3600e3, 3600e3]],
    total: { label: 'Разом', sum: [2, 3] },
  }, { name: 'Підсумки: [тест]', columns: [{ header: 'A' }], rows: [] }]);
  assert.equal(bytes[0], 0x50); assert.equal(bytes[1], 0x4b); // «PK»
  const f = unzip(bytes);
  for (const n of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']) assert.ok(f[n], n);
  assert.match(f['xl/workbook.xml'], /name="Зміни"/);
  assert.match(f["xl/workbook.xml"], /name="Підсумки тест"/); // заборонені символи прибрано
  const s1 = f['xl/worksheets/sheet1.xml'];
  assert.match(s1, /Київ – Львів &lt;A&amp;B&gt;/);
  assert.match(s1, /<c r="A2" s="2"><v>46350<\/v><\/c>/); // 24.11.2026 як дата Excel
  assert.match(s1, /<c r="C2" s="4"><v>0\.3125<\/v><\/c>/); // 7:30 = 0,3125 доби
  assert.match(s1, /<c r="D2" s="5"><v>7\.5<\/v><\/c>/);
  assert.match(s1, /<f>SUM\(C2:C3\)<\/f>/);
  assert.match(s1, /<autoFilter ref="A1:D3"\/>/);
  assert.match(s1, /state="frozen"/);
});
