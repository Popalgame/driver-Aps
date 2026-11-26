// Версія апки — одне джерело для інтерфейсу.
// При кожному оновленні: підняти VERSION тут, у package.json і в CACHE у sw.js
// (tests/version.test.mjs перевіряє, що вони збігаються).
export const VERSION = '0.1.16';
export const STAGE = 'альфа';
export const VERSION_LABEL = `${VERSION} ${STAGE}`;
