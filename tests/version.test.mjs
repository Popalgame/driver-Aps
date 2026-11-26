import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VERSION, STAGE } from '../site/src/version.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('версія у форматі X.Y.Z', () => {
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
});

test('package.json має ту саму версію', () => {
  const pkg = JSON.parse(read('../package.json'));
  const suffix = { 'альфа': '-alpha', 'бета': '-beta', '': '' }[STAGE] ?? '';
  assert.equal(pkg.version, VERSION + suffix);
});

test('кеш service worker названо за версією (інакше телефони не отримають оновлення)', () => {
  assert.match(read('../site/sw.js'), new RegExp(`const CACHE = 'driver-aps-${VERSION.replace(/\./g, '\\.')}'`));
});

test('сторінка index.html знає свою версію (захист від змішаних файлів)', () => {
  assert.match(read('../site/index.html'), new RegExp(`<meta name="app-version" content="${VERSION.replace(/\./g, '\\.')}">`));
});
