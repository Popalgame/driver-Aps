import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const site = new URL('../site/', import.meta.url);
const read = (f) => readFileSync(new URL(f, site), 'utf8');

test('усі файли з кешу service workera існують', () => {
  const list = read('sw.js').match(/const FILES = \[(.*?)\]/s)[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1));
  for (const f of list) if (f !== './') assert.ok(existsSync(new URL(f, site)), `немає ${f}`);
});

test('маніфест коректний', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.display, 'standalone');
  assert.ok(m.icons.length > 0);
});
