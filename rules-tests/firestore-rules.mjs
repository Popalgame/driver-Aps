// Тести правил Firestore. Потрібен емулятор: npm run test:rules
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where } from 'firebase/firestore';

let env;
const shift = (uid, extra = {}) => ({
  uid, driverName: 'Тест', start: 1000, end: 2000, breaks: [], note: '', updatedAt: 3000, ...extra,
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-driver-aps',
    firestore: { rules: readFileSync(new URL('../site/firestore.rules', import.meta.url), 'utf8') },
  });
});
after(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/alice'), { name: 'Аліса', email: 'a@x', role: 'driver', createdAt: 1 });
    await setDoc(doc(db, 'users/bob'), { name: 'Боб', email: 'b@x', role: 'driver', createdAt: 1 });
    await setDoc(doc(db, 'users/boss'), { name: 'Шеф', email: 'm@x', role: 'manager', createdAt: 1 });
    await setDoc(doc(db, 'shifts/s-alice'), shift('alice'));
    await setDoc(doc(db, 'shifts/s-bob'), shift('bob'));
  });
});

const as = (uid) => env.authenticatedContext(uid).firestore();

test('гість не бачить нічого', async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, 'shifts/s-alice')));
  await assertFails(getDoc(doc(db, 'users/alice')));
});

test('водій бачить і змінює лише свої зміни', async () => {
  const db = as('alice');
  await assertSucceeds(getDoc(doc(db, 'shifts/s-alice')));
  await assertSucceeds(getDocs(query(collection(db, 'shifts'), where('uid', '==', 'alice'))));
  await assertFails(getDoc(doc(db, 'shifts/s-bob')));
  await assertFails(getDocs(collection(db, 'shifts')));
  await assertSucceeds(setDoc(doc(db, 'shifts/new'), shift('alice', { end: null })));
  await assertSucceeds(updateDoc(doc(db, 'shifts/s-alice'), { note: 'Київ – Львів', updatedAt: 4000 }));
  await assertSucceeds(deleteDoc(doc(db, 'shifts/s-alice')));
  await assertFails(updateDoc(doc(db, 'shifts/s-bob'), { note: 'хак' }));
  await assertFails(deleteDoc(doc(db, 'shifts/s-bob')));
});

test('водій не може записати зміну від імені іншого або «передати» свою', async () => {
  const db = as('alice');
  await assertFails(setDoc(doc(db, 'shifts/fake'), shift('bob')));
  await assertFails(updateDoc(doc(db, 'shifts/s-alice'), { uid: 'bob' }));
  await assertFails(setDoc(doc(db, 'shifts/s-bob'), shift('alice'))); // перезапис чужої
});

test('некоректні дані відхиляються', async () => {
  const db = as('alice');
  await assertFails(setDoc(doc(db, 'shifts/bad1'), shift('alice', { end: 500 })));       // кінець раніше початку
  await assertFails(setDoc(doc(db, 'shifts/bad2'), shift('alice', { start: '10:00' })));  // не число
  await assertFails(setDoc(doc(db, 'shifts/bad3'), shift('alice', { note: 'x'.repeat(201) })));
  await assertFails(setDoc(doc(db, 'shifts/bad4'), shift('alice', { salary: 1000 })));   // зайве поле
});

test('профіль: створити можна лише свій і лише з роллю driver', async () => {
  const db = as('carol');
  await assertFails(setDoc(doc(db, 'users/carol'), { name: 'Кароль', email: 'c@x', role: 'manager', createdAt: 1 }));
  await assertFails(setDoc(doc(db, 'users/dave'), { name: 'Дейв', email: 'd@x', role: 'driver', createdAt: 1 }));
  await assertSucceeds(setDoc(doc(db, 'users/carol'), { name: 'Кароль', email: 'c@x', role: 'driver', createdAt: 1 }));
});

test('водій не може сам стати керівником, але може змінити ім\'я', async () => {
  const db = as('alice');
  await assertFails(updateDoc(doc(db, 'users/alice'), { role: 'manager' }));
  await assertSucceeds(updateDoc(doc(db, 'users/alice'), { name: 'Аліса К.' }));
  await assertFails(getDoc(doc(db, 'users/bob')));
  await assertFails(getDocs(collection(db, 'users')));
});

test('керівник бачить усіх водіїв і всі зміни, але не змінює їх', async () => {
  const db = as('boss');
  await assertSucceeds(getDocs(collection(db, 'users')));
  await assertSucceeds(getDocs(query(collection(db, 'shifts'), where('start', '>=', 0), where('start', '<', 5000))));
  await assertSucceeds(getDoc(doc(db, 'shifts/s-bob')));
  await assertFails(updateDoc(doc(db, 'shifts/s-bob'), { note: 'правка' }));
  await assertFails(deleteDoc(doc(db, 'shifts/s-bob')));
});
