// Тести правил Firestore. Потрібен емулятор: npm run test:rules
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where } from 'firebase/firestore';

let env;
const shift = (uid, extra = {}) => ({
  uid, driverName: 'Тест', start: 1000, end: 2000, breaks: [], note: '', updatedAt: 3000, ...extra,
});
const profile = (name, role) => ({ name, email: name + '@x', role, createdAt: 1 });

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
    await setDoc(doc(db, 'users/alice'), profile('Аліса', 'driver'));
    await setDoc(doc(db, 'users/bob'), profile('Боб', 'driver'));
    await setDoc(doc(db, 'users/boss'), profile('Шеф', 'manager'));
    await setDoc(doc(db, 'users/boss2'), profile('Шеф2', 'manager'));
    await setDoc(doc(db, 'users/newbie'), profile('Новий', 'pending'));
    await setDoc(doc(db, 'users/gone'), profile('Звільнений', 'disabled'));
    await setDoc(doc(db, 'shifts/s-alice'), shift('alice'));
    await setDoc(doc(db, 'shifts/s-bob'), shift('bob'));
    await setDoc(doc(db, 'shifts/s-gone'), shift('gone'));
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
  await assertFails(setDoc(doc(db, 'shifts/s-bob'), shift('alice')));
});

test('некоректні дані відхиляються', async () => {
  const db = as('alice');
  await assertFails(setDoc(doc(db, 'shifts/bad1'), shift('alice', { end: 500 })));
  await assertFails(setDoc(doc(db, 'shifts/bad2'), shift('alice', { start: '10:00' })));
  await assertFails(setDoc(doc(db, 'shifts/bad3'), shift('alice', { note: 'x'.repeat(201) })));
  await assertFails(setDoc(doc(db, 'shifts/bad4'), shift('alice', { salary: 1000 })));
});

test('новий користувач без підтвердження: профіль лише pending і нічого не записує', async () => {
  const db = as('stranger');
  await assertFails(setDoc(doc(db, 'users/stranger'), profile('Чужий', 'driver')));
  await assertFails(setDoc(doc(db, 'users/stranger'), profile('Чужий', 'manager')));
  await assertFails(setDoc(doc(db, 'users/other'), profile('Інший', 'pending')));
  await assertSucceeds(setDoc(doc(db, 'users/stranger'), profile('Чужий', 'pending')));
  await assertFails(setDoc(doc(db, 'shifts/st'), shift('stranger')));
  const nb = as('newbie');
  await assertFails(setDoc(doc(nb, 'shifts/nb'), shift('newbie')));
  await assertFails(updateDoc(doc(nb, 'users/newbie'), { role: 'driver' }));
});

test('водій із закритим доступом нічого не записує', async () => {
  const db = as('gone');
  await assertFails(setDoc(doc(db, 'shifts/g2'), shift('gone')));
  await assertFails(updateDoc(doc(db, 'shifts/s-gone'), { note: 'x', updatedAt: 5 }));
  await assertFails(updateDoc(doc(db, 'users/gone'), { role: 'driver' }));
});

test('водій не може сам стати керівником, але може змінити ім\'я', async () => {
  const db = as('alice');
  await assertFails(updateDoc(doc(db, 'users/alice'), { role: 'manager' }));
  await assertSucceeds(updateDoc(doc(db, 'users/alice'), { name: 'Аліса К.' }));
  await assertFails(getDoc(doc(db, 'users/bob')));
  await assertFails(getDocs(collection(db, 'users')));
  await assertFails(setDoc(doc(db, 'users/friend'), profile('Друг', 'driver')));
});

test('керівник бачить усіх і всі зміни, але не змінює чужі зміни', async () => {
  const db = as('boss');
  await assertSucceeds(getDocs(collection(db, 'users')));
  await assertSucceeds(getDocs(query(collection(db, 'shifts'), where('start', '>=', 0), where('start', '<', 5000))));
  await assertSucceeds(getDoc(doc(db, 'shifts/s-bob')));
  await assertFails(updateDoc(doc(db, 'shifts/s-bob'), { note: 'правка' }));
  await assertFails(deleteDoc(doc(db, 'shifts/s-bob')));
});

test('керівник додає водіїв, підтверджує й закриває доступ', async () => {
  const db = as('boss');
  await assertSucceeds(setDoc(doc(db, 'users/carol'), profile('Кароль', 'driver')));
  await assertFails(setDoc(doc(db, 'users/dave'), profile('Дейв', 'manager')));
  await assertSucceeds(updateDoc(doc(db, 'users/newbie'), { role: 'driver' }));
  await assertSucceeds(updateDoc(doc(db, 'users/bob'), { role: 'disabled' }));
  await assertSucceeds(updateDoc(doc(db, 'users/gone'), { role: 'driver' }));
  await assertSucceeds(updateDoc(doc(db, 'users/alice'), { name: 'Аліса Коваль' }));
  await assertFails(updateDoc(doc(db, 'users/alice'), { role: 'manager' }));
  await assertFails(updateDoc(doc(db, 'users/alice'), { email: 'hack@x' }));
  await assertFails(updateDoc(doc(db, 'users/boss2'), { role: 'disabled' }));
  await assertFails(updateDoc(doc(db, 'users/boss'), { role: 'driver' }));
});

const odoDoc = (uid, extra = {}) => ({ uid, type: 'odo', at: 1000, km: 184520, liters: null, amount: null, note: '', updatedAt: 2, ...extra });
const fuelDoc = (uid, extra = {}) => ({ uid, type: 'fuel', at: 1000, km: null, liters: 45.5, amount: 280, note: 'Orlen', updatedAt: 2, ...extra });

test('кілометраж: свої записи — так, чужі — ні; керівник лише читає', async () => {
  const a = as('alice');
  await assertSucceeds(setDoc(doc(a, 'mileage/a1'), odoDoc('alice')));
  await assertSucceeds(setDoc(doc(a, 'mileage/a2'), fuelDoc('alice')));
  await assertSucceeds(getDocs(query(collection(a, 'mileage'), where('uid', '==', 'alice'))));
  await assertSucceeds(updateDoc(doc(a, 'mileage/a1'), { km: 184600, updatedAt: 3 }));
  await assertFails(setDoc(doc(a, 'mileage/b1'), odoDoc('bob')));
  await assertFails(getDocs(collection(a, 'mileage')));
  const b = as('bob');
  await assertFails(getDoc(doc(b, 'mileage/a1')));
  await assertFails(deleteDoc(doc(b, 'mileage/a1')));
  const m = as('boss');
  await assertSucceeds(getDocs(collection(m, 'mileage')));
  await assertFails(updateDoc(doc(m, 'mileage/a1'), { km: 1 }));
  await assertSucceeds(deleteDoc(doc(a, 'mileage/a2')));
});

test('кілометраж: некоректні дані і непідтверджені користувачі', async () => {
  const a = as('alice');
  await assertFails(setDoc(doc(a, 'mileage/x1'), odoDoc('alice', { km: null })));
  await assertFails(setDoc(doc(a, 'mileage/x2'), odoDoc('alice', { km: -5 })));
  // заправка лише з датою — дозволено
  await assertSucceeds(setDoc(doc(a, 'mileage/x3'), fuelDoc('alice', { liters: null, amount: null, note: '' })));
  await assertFails(setDoc(doc(a, 'mileage/x6'), fuelDoc('alice', { liters: 0 })));
  await assertFails(setDoc(doc(a, 'mileage/x4'), fuelDoc('alice', { type: 'wash' })));
  await assertFails(setDoc(doc(a, 'mileage/x5'), odoDoc('alice', { extra: 1 })));
  await assertFails(setDoc(doc(as('newbie'), 'mileage/n1'), odoDoc('newbie')));
  await assertFails(setDoc(doc(as('gone'), 'mileage/g1'), odoDoc('gone')));
});
