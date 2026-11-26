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

test('керівник бачить усіх і всі зміни; чужу зміну виправляє лише з позначкою', async () => {
  const db = as('boss');
  await assertSucceeds(getDocs(collection(db, 'users')));
  await assertSucceeds(getDocs(query(collection(db, 'shifts'), where('start', '>=', 0), where('start', '<', 5000))));
  await assertSucceeds(getDoc(doc(db, 'shifts/s-bob')));
  await assertFails(updateDoc(doc(db, 'shifts/s-bob'), { note: 'правка' })); // без позначки — ні
  const mark = { editedBy: 'boss', editedByName: 'Шеф', editedAt: 5000 };
  await assertSucceeds(updateDoc(doc(db, 'shifts/s-bob'), { end: 2500, ...mark }));
  await assertFails(updateDoc(doc(db, 'shifts/s-bob'), { ...mark, editedBy: 'alice' })); // від чужого імені
  await assertFails(updateDoc(doc(db, 'shifts/s-bob'), { ...mark, uid: 'alice' })); // передати іншому
  // Додати зміну за водія (забув «Почати»)
  await assertSucceeds(setDoc(doc(db, 'shifts/added'), shift('alice', mark)));
  await assertFails(setDoc(doc(db, 'shifts/added2'), shift('alice'))); // без позначки
  await assertFails(setDoc(doc(db, 'shifts/added3'), shift('nobody', mark))); // немає такого користувача
  await assertSucceeds(deleteDoc(doc(db, 'shifts/s-bob')));
});

test('водій не ставить і не прибирає позначку «виправив керівник»', async () => {
  const a = as('alice');
  const mark = { editedBy: 'boss', editedByName: 'Шеф', editedAt: 5000 };
  await assertFails(setDoc(doc(a, 'shifts/fake'), shift('alice', mark)));
  await assertFails(updateDoc(doc(a, 'shifts/s-alice'), mark));
  await assertSucceeds(updateDoc(doc(as('boss'), 'shifts/s-alice'), { end: 2500, ...mark }));
  await assertSucceeds(updateDoc(doc(a, 'shifts/s-alice'), { note: 'ок', updatedAt: 6000 })); // позначка лишається
  await assertFails(updateDoc(doc(a, 'shifts/s-alice'), { editedBy: null, editedAt: null }));
  await assertFails(updateDoc(doc(as('bob'), 'shifts/s-alice'), { end: 2600, ...mark }));
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

// ---------- Проєкти й календар ----------
const project = (members, extra = {}) => ({
  name: 'Струмет', members, names: Object.fromEntries(members.map((m) => [m, m])), color: 0, createdAt: 1, updatedAt: 1, ...extra,
});
const event = (project, by, extra = {}) => ({
  project, date: '2026-12-03', time: '08:00', title: 'Медкомісія', people: 5, note: '', by, byName: by, createdAt: 1, updatedAt: 1, ...extra,
});
async function seedProjects() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'projects/strumet'), project(['alice', 'bob']));
    await setDoc(doc(db, 'projects/mlesna'), project(['gone'], { name: 'Млешна' }));
    await setDoc(doc(db, 'events/e1'), event('strumet', 'alice'));
    await setDoc(doc(db, 'events/e2'), event('mlesna', 'boss'));
  });
}

test('проєкти: водій бачить лише свої, створює лише керівник', async () => {
  await seedProjects();
  const a = as('alice');
  await assertSucceeds(getDoc(doc(a, 'projects/strumet')));
  await assertFails(getDoc(doc(a, 'projects/mlesna')));
  await assertSucceeds(getDocs(query(collection(a, 'projects'), where('members', 'array-contains', 'alice'))));
  await assertFails(getDocs(collection(a, 'projects')));
  await assertFails(setDoc(doc(a, 'projects/mine'), project(['alice'])));
  await assertFails(updateDoc(doc(a, 'projects/strumet'), { members: ['alice'] }));
  const m = as('boss');
  await assertSucceeds(getDocs(collection(m, 'projects')));
  await assertSucceeds(setDoc(doc(m, 'projects/new'), project(['bob'], { name: 'Новий' })));
  await assertSucceeds(updateDoc(doc(m, 'projects/strumet'), { members: ['alice'], names: { alice: 'Аліса' }, updatedAt: 2 }));
  await assertFails(setDoc(doc(m, 'projects/bad'), project(['bob'], { name: '' })));
  await assertFails(setDoc(doc(m, 'projects/bad'), project(['bob'], { extra: 1 })));
  await assertSucceeds(deleteDoc(doc(m, 'projects/new')));
  // pending і заблокований не бачать навіть «свій» проєкт
  await assertFails(getDoc(doc(as('gone'), 'projects/mlesna')));
});

test('календар: події бачать і змінюють лише учасники проєкту', async () => {
  await seedProjects();
  const b = as('bob');
  await assertSucceeds(getDoc(doc(b, 'events/e1')));
  await assertSucceeds(getDocs(query(collection(b, 'events'), where('project', '==', 'strumet'))));
  await assertFails(getDocs(query(collection(b, 'events'), where('project', '==', 'mlesna'))));
  await assertFails(getDoc(doc(b, 'events/e2')));
  await assertFails(getDocs(collection(b, 'events')));
  // будь-хто з проєкту редагує й видаляє
  await assertSucceeds(updateDoc(doc(b, 'events/e1'), { people: 7, updatedAt: 2 }));
  await assertSucceeds(updateDoc(doc(b, 'events/e1'), { people: 6, editedBy: 'bob', editedByName: 'Боб', updatedAt: 3 }));
  await assertFails(updateDoc(doc(b, 'events/e1'), { editedBy: 'alice', editedByName: 'Аліса' }));
  await assertFails(updateDoc(doc(b, 'events/e1'), { project: 'mlesna' }));
  await assertFails(updateDoc(doc(b, 'events/e1'), { by: 'bob' }));
  await assertSucceeds(setDoc(doc(b, 'events/e3'), event('strumet', 'bob')));
  await assertFails(setDoc(doc(b, 'events/e4'), event('strumet', 'alice')));   // від чужого імені
  await assertFails(setDoc(doc(b, 'events/e5'), event('mlesna', 'bob')));     // не свій проєкт
  await assertFails(setDoc(doc(b, 'events/e6'), event('strumet', 'bob', { date: '3.12.2026' })));
  await assertFails(setDoc(doc(b, 'events/e7'), event('strumet', 'bob', { title: '' })));
  await assertSucceeds(setDoc(doc(b, 'events/e8'), event('strumet', 'bob', { time: '', people: null })));
  await assertSucceeds(deleteDoc(doc(b, 'events/e1')));
  // заблокований учасник — нічого
  const g = as('gone');
  await assertFails(getDoc(doc(g, 'events/e2')));
  await assertFails(setDoc(doc(g, 'events/e9'), event('mlesna', 'gone')));
  // керівник: усе
  const m = as('boss');
  await assertSucceeds(getDocs(collection(m, 'events')));
  await assertSucceeds(setDoc(doc(m, 'events/e10'), event('mlesna', 'boss')));
  await assertSucceeds(deleteDoc(doc(m, 'events/e2')));
});

// ---------- Кадри ----------
test('кадри: лише календар і проєкти, де вона є; без змін, кілометражу й профілів', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/olha'), { ...profile('Ольга', 'hr'), kind: 'hr' });
    await setDoc(doc(db, 'projects/strumet'), project(['alice', 'bob'], { hr: ['olha'] }));
    await setDoc(doc(db, 'projects/mlesna'), project(['gone'], { name: 'Млешна' }));
    await setDoc(doc(db, 'events/e1'), event('strumet', 'alice'));
    await setDoc(doc(db, 'events/e2'), event('mlesna', 'boss'));
    await setDoc(doc(db, 'mileage/m1'), { uid: 'alice', type: 'odo', at: 1, km: 100, liters: null, amount: null, note: '', updatedAt: 1 });
  });
  const h = as('olha');
  await assertSucceeds(getDoc(doc(h, 'projects/strumet')));
  await assertSucceeds(getDocs(query(collection(h, 'projects'), where('hr', 'array-contains', 'olha'))));
  await assertFails(getDoc(doc(h, 'projects/mlesna')));
  await assertSucceeds(getDocs(query(collection(h, 'events'), where('project', '==', 'strumet'))));
  await assertFails(getDocs(query(collection(h, 'events'), where('project', '==', 'mlesna'))));
  await assertSucceeds(setDoc(doc(h, 'events/med'), event('strumet', 'olha', { title: 'Медкомісія', people: 3 })));
  await assertSucceeds(updateDoc(doc(h, 'events/e1'), { note: 'Взяти паспорт', editedBy: 'olha', editedByName: 'Ольга', updatedAt: 5 }));
  // нічого зайвого
  await assertFails(getDoc(doc(h, 'users/alice')));
  await assertFails(getDocs(collection(h, 'users')));
  await assertFails(getDoc(doc(h, 'shifts/s-alice')));
  await assertFails(getDoc(doc(h, 'mileage/m1')));
  await assertFails(getDocs(query(collection(h, 'mileage'), where('uid', '==', 'alice'))));
  await assertFails(setDoc(doc(h, 'shifts/x'), shift('olha')));
  await assertFails(updateDoc(doc(h, 'projects/strumet'), { members: ['alice'] }));
  await assertFails(updateDoc(doc(h, 'users/olha'), { role: 'manager' }));
  // водій бачить проєкт, де є кадровик
  await assertSucceeds(getDoc(doc(as('alice'), 'projects/strumet')));
});

test('кадри: створює й вимикає лише керівник; з водія кадровика не зробити', async () => {
  const m = as('boss');
  await assertSucceeds(setDoc(doc(m, 'users/hr1'), { ...profile('Ольга', 'hr'), kind: 'hr' }));
  await assertFails(setDoc(doc(m, 'users/hr2'), profile('Без kind', 'hr')));
  await assertFails(setDoc(doc(m, 'users/hr3'), { ...profile('Водій з kind', 'driver'), kind: 'hr' }));
  await assertSucceeds(updateDoc(doc(m, 'users/hr1'), { role: 'disabled' }));
  await assertFails(updateDoc(doc(m, 'users/hr1'), { role: 'driver' }));
  await assertSucceeds(updateDoc(doc(m, 'users/hr1'), { role: 'hr' }));
  await assertFails(updateDoc(doc(m, 'users/alice'), { role: 'hr' }));
  await assertFails(updateDoc(doc(m, 'users/hr1'), { kind: null }));
  // pending не може сам стати кадровиком
  await assertFails(updateDoc(doc(as('newbie'), 'users/newbie'), { role: 'hr' }));
  await assertFails(setDoc(doc(as('x'), 'users/x'), { ...profile('X', 'hr'), kind: 'hr' }));
});

// ---------- Завдання ----------
test('завдання: бере лише вільне, кроки — лише той, хто взяв', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/olha'), { ...profile('Ольга', 'hr'), kind: 'hr' });
    await setDoc(doc(db, 'users/carl'), profile('Карл', 'driver'));
    await setDoc(doc(db, 'projects/strumet'), project(['alice', 'bob'], { hr: ['olha'] }));
    await setDoc(doc(db, 'events/t1'), event('strumet', 'olha', { need: true, status: 'open', driver: null, editedBy: 'olha', editedByName: 'Ольга' }));
  });
  const a = as('alice'), b = as('bob'), h = as('olha');
  const take = (uid, name) => ({ status: 'taken', driver: uid, driverName: name, takenAt: 10, updatedAt: 10 });
  // кадрова не може «взяти»
  await assertFails(updateDoc(doc(h, 'events/t1'), take('olha', 'Ольга')));
  // не можна взяти за іншого
  await assertFails(updateDoc(doc(a, 'events/t1'), take('bob', 'Боб')));
  // не можна створити вже взяте
  await assertFails(setDoc(doc(a, 'events/t2'), event('strumet', 'alice', { need: true, status: 'taken', driver: 'alice' })));
  await assertSucceeds(updateDoc(doc(a, 'events/t1'), take('alice', 'Аліса')));
  // Боб уже не може перехопити
  await assertFails(updateDoc(doc(b, 'events/t1'), take('bob', 'Боб')));
  await assertFails(updateDoc(doc(b, 'events/t1'), { status: 'done', doneAt: 20 }));
  // Аліса: в дорозі → виконано
  await assertSucceeds(updateDoc(doc(a, 'events/t1'), { status: 'onway', startedAt: 15, updatedAt: 15 }));
  await assertSucceeds(updateDoc(doc(a, 'events/t1'), { status: 'done', doneAt: 20, updatedAt: 20 }));
  // кадрова може змінити текст (не чіпаючи статус), водій — нотатку, не стираючи «змінила Ольга»
  await assertSucceeds(updateDoc(doc(h, 'events/t1'), { note: 'Кабінет 12', editedBy: 'olha', editedByName: 'Ольга', updatedAt: 21 }));
  await assertSucceeds(updateDoc(doc(b, 'events/t1'), { people: 4, updatedAt: 22 }));
  await assertFails(updateDoc(doc(h, 'events/t1'), { status: 'open', driver: null }));
  // відмовитись може лише свій водій
  await setDoc(doc(as('boss'), 'events/t3'), event('strumet', 'boss', { need: true }));
  await assertSucceeds(updateDoc(doc(b, 'events/t3'), take('bob', 'Боб')));
  await assertFails(updateDoc(doc(a, 'events/t3'), { status: 'open', driver: null, driverName: '' }));
  await assertSucceeds(updateDoc(doc(b, 'events/t3'), { status: 'open', driver: null, driverName: '', takenAt: null }));
  // керівник перепризначає
  await assertSucceeds(updateDoc(doc(as('boss'), 'events/t3'), take('alice', 'Аліса')));
  // водій не з проєкту — нічого
  await assertFails(updateDoc(doc(as('carl'), 'events/t1'), take('carl', 'Карл')));
});

test('старі події (без полів завдання) водій може редагувати й брати', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'projects/strumet'), project(['alice', 'bob']));
    await setDoc(doc(ctx.firestore(), 'events/old'), event('strumet', 'bob'));
  });
  const a = as('alice');
  await assertSucceeds(setDoc(doc(a, 'events/old'), { ...event('strumet', 'bob'), need: true, note: 'нове', editedBy: 'alice', editedByName: 'Аліса', editedAt: 5, updatedAt: 5 }));
  await assertSucceeds(updateDoc(doc(a, 'events/old'), { status: 'taken', driver: 'alice', driverName: 'Аліса', takenAt: 6, updatedAt: 6 }));
});

test('оголошення: пише керівник, кадри — лише своєму проєкту; отримувач лише «Прочитав»', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/olha'), { ...profile('Ольга', 'hr'), kind: 'hr' });
    await setDoc(doc(db, 'projects/p1'), { name: 'Струмет', members: ['alice'], hr: ['olha'], names: {}, color: 0, createdAt: 1, updatedAt: 1 });
    await setDoc(doc(db, 'projects/p2'), { name: 'Млешна', members: ['bob'], hr: [], names: {}, color: 1, createdAt: 1, updatedAt: 1 });
  });
  const n = (by, extra = {}) => ({
    text: 'Не забувайте вписувати кілометраж', by, byName: 'Шеф', to: 'all', target: null,
    recipients: ['alice', 'bob'], names: { alice: 'Аліса', bob: 'Боб' }, important: false, until: null,
    createdAt: 1, read: {}, ...extra,
  });
  const m = as('boss');
  await assertSucceeds(setDoc(doc(m, 'notices/n1'), n('boss')));
  await assertFails(setDoc(doc(m, 'notices/bad1'), n('alice'))); // від чужого імені
  await assertFails(setDoc(doc(m, 'notices/bad2'), n('boss', { text: '' })));
  await assertFails(setDoc(doc(m, 'notices/bad3'), n('boss', { read: { alice: 1 } })));
  // Водій не пише оголошень
  await assertFails(setDoc(doc(as('alice'), 'notices/bad4'), n('alice')));
  // Кадри: лише свій проєкт і лише його люди
  const h = as('olha');
  await assertSucceeds(setDoc(doc(h, 'notices/n2'), n('olha', { to: 'project', target: 'p1', recipients: ['alice'] })));
  await assertFails(setDoc(doc(h, 'notices/bad5'), n('olha', { to: 'project', target: 'p1', recipients: ['alice', 'bob'] })));
  await assertFails(setDoc(doc(h, 'notices/bad6'), n('olha', { to: 'project', target: 'p2', recipients: ['bob'] })));
  await assertFails(setDoc(doc(h, 'notices/bad7'), n('olha')));
  // Читання: отримувач, автор, керівник
  const a = as('alice');
  await assertSucceeds(getDocs(query(collection(a, 'notices'), where('recipients', 'array-contains', 'alice'))));
  await assertSucceeds(getDocs(query(collection(h, 'notices'), where('by', '==', 'olha'))));
  await assertSucceeds(getDocs(collection(m, 'notices')));
  await assertFails(getDocs(collection(a, 'notices')));
  await assertFails(getDoc(doc(as('gone'), 'notices/n1')));
  // «Прочитав»: лише своя позначка
  await assertSucceeds(updateDoc(doc(a, 'notices/n1'), { 'read.alice': 5 }));
  await assertFails(updateDoc(doc(a, 'notices/n1'), { 'read.bob': 5 }));
  await assertFails(updateDoc(doc(a, 'notices/n1'), { text: 'хак' }));
  await assertFails(updateDoc(doc(as('olha'), 'notices/n1'), { 'read.olha': 5 })); // не отримувач
  // Видалити: автор або керівник
  await assertFails(deleteDoc(doc(a, 'notices/n1')));
  await assertSucceeds(deleteDoc(doc(h, 'notices/n2')));
  await assertSucceeds(deleteDoc(doc(m, 'notices/n1')));
});

test('подія: не більше 8 людей (9-те місце — водій); старі події з більшою кількістю лишаються', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'projects/p1'), { name: 'Струмет', members: ['alice'], hr: [], names: {}, color: 0, createdAt: 1, updatedAt: 1 });
    await setDoc(doc(db, 'events/old'), { project: 'p1', date: '2026-12-01', time: '', title: 'Стара', people: 12, note: '', by: 'boss', byName: 'Шеф', createdAt: 1, updatedAt: 1 });
  });
  const ev = (by, people) => ({ project: 'p1', date: '2026-12-02', time: '07:00', title: 'Поїздка', people, note: '', by, byName: 'X', createdAt: 1, updatedAt: 1, need: true, status: 'open', driver: null });
  for (const who of ['boss', 'alice']) {
    const db = as(who);
    await assertSucceeds(setDoc(doc(db, `events/ok-${who}`), ev(who, 8)));
    await assertFails(setDoc(doc(db, `events/big-${who}`), ev(who, 9)));
  }
  const a = as('alice');
  await assertSucceeds(updateDoc(doc(a, 'events/old'), { note: 'ок', updatedAt: 2 })); // кількість не міняли
  await assertFails(updateDoc(doc(a, 'events/old'), { people: 13, updatedAt: 3 }));
  await assertSucceeds(updateDoc(doc(a, 'events/old'), { people: 8, updatedAt: 4 }));
});

test('фото профілю: своє — так; керівник — будь-кому; чуже — ні; не фото — ні', async () => {
  const photo = 'data:image/jpeg;base64,' + 'A'.repeat(20000);
  await assertSucceeds(updateDoc(doc(as('alice'), 'users/alice'), { photo }));
  await assertSucceeds(updateDoc(doc(as('alice'), 'users/alice'), { photo: null }));
  await assertFails(updateDoc(doc(as('alice'), 'users/bob'), { photo }));
  await assertSucceeds(updateDoc(doc(as('boss'), 'users/bob'), { photo }));
  await assertFails(updateDoc(doc(as('alice'), 'users/alice'), { photo: 'data:text/html;base64,AAAA' }));
  await assertFails(updateDoc(doc(as('alice'), 'users/alice'), { photo: 'data:image/jpeg;base64,' + 'A'.repeat(40000) }));
  await assertFails(updateDoc(doc(as('alice'), 'users/alice'), { photo, role: 'manager' }));
});

test('машини: веде керівник; водії бачать усі; кадри — ні', async () => {
  const car = (driver, extra = {}) => ({ plate: 'AA1234BB', model: 'VW Crafter', driver, driverName: 'Аліса', note: '', createdAt: 1, updatedAt: 1, ...extra });
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users/olha'), { ...profile('Ольга', 'hr'), kind: 'hr' });
  });
  const m = as('boss');
  await assertSucceeds(setDoc(doc(m, 'cars/c1'), car('alice')));
  await assertSucceeds(setDoc(doc(m, 'cars/c2'), car('bob', { plate: 'BC5678AA' })));
  await assertFails(setDoc(doc(m, 'cars/bad'), car('alice', { insuranceUntil: '2026-12-06' }))); // страховку прибрано
  await assertFails(setDoc(doc(m, 'cars/bad2'), car('alice', { plate: '' })));
  await assertSucceeds(setDoc(doc(m, 'cars/c3'), car(null, { plate: 'KA0001AA', project: 'p1' })));
  await assertFails(setDoc(doc(m, 'cars/bad3'), car(null, { project: 5 })));
  await assertSucceeds(updateDoc(doc(m, 'cars/c3'), { access: ['alice'], updatedAt: 2 }));
  await assertFails(updateDoc(doc(m, 'cars/c3'), { access: 'alice' }));
  await assertFails(updateDoc(doc(as('alice'), 'cars/c3'), { access: ['alice', 'bob'] }));
  const a = as('alice');
  await assertSucceeds(getDoc(doc(a, 'cars/c1')));
  await assertSucceeds(getDocs(query(collection(a, 'cars'), where('driver', '==', 'alice'))));
  await assertSucceeds(getDoc(doc(a, 'cars/c2'))); // водій бачить усі — вибирає, на якій їде
  await assertSucceeds(getDocs(collection(a, 'cars')));
  await assertFails(updateDoc(doc(a, 'cars/c1'), { model: 'хак' }));
  await assertFails(setDoc(doc(a, 'cars/mine'), car('alice')));
  await assertFails(getDoc(doc(as('olha'), 'cars/c1')));
  await assertSucceeds(getDocs(collection(m, 'cars')));
  await assertSucceeds(deleteDoc(doc(m, 'cars/c2')));
});

test('кілометраж з машиною: car і plate', async () => {
  const a = as('alice');
  const e = { uid: 'alice', type: 'odo', at: 1, km: 1000, liters: null, amount: null, note: '', updatedAt: 1 };
  await assertSucceeds(setDoc(doc(a, 'mileage/m1'), { ...e, car: 'c1', plate: 'AA1234BB' }));
  await assertSucceeds(setDoc(doc(a, 'mileage/m2'), e));
  await assertFails(setDoc(doc(a, 'mileage/m3'), { ...e, car: 5 }));
  await assertFails(setDoc(doc(a, 'mileage/m4'), { ...e, plate: 'X'.repeat(20) }));
});

test('показники одометра машин видно всім водіям, решту записів — ні', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const e = { uid: 'bob', type: 'odo', at: 5, km: 1100, liters: null, amount: null, note: 'моє', updatedAt: 1 };
    await setDoc(doc(db, 'mileage/b1'), { ...e, car: 'c1', plate: 'AA1234BB' });
    await setDoc(doc(db, 'mileage/b2'), e);
    await setDoc(doc(db, 'mileage/b3'), { ...e, type: 'fuel', km: null, liters: 40, car: 'c1' });
  });
  const a = as('alice');
  await assertSucceeds(getDocs(query(collection(a, 'mileage'), where('type', '==', 'odo'), where('car', 'in', ['c1', 'c2']))));
  await assertSucceeds(getDoc(doc(a, 'mileage/b1')));
  await assertFails(getDoc(doc(a, 'mileage/b2')));
  await assertFails(getDoc(doc(a, 'mileage/b3')));
  await assertFails(getDocs(query(collection(a, 'mileage'), where('car', 'in', ['c1']))));
  await assertFails(getDoc(doc(as('newbie'), 'mileage/b1')));
});

test('працівник на своєму авто: створює керівник, свою машину вписує сам', async () => {
  const m = as('boss');
  await assertSucceeds(setDoc(doc(m, 'users/emp1'), { ...profile('Марко', 'driver'), kind: 'emp' }));
  await assertFails(setDoc(doc(m, 'users/emp2'), { ...profile('X', 'driver'), kind: 'boss' }));
  const e = as('emp1');
  await assertSucceeds(updateDoc(doc(e, 'users/emp1'), { myCar: { plate: 'WX12345', model: 'Dacia Jogger' } }));
  await assertFails(updateDoc(doc(e, 'users/emp1'), { myCar: { plate: '', model: '' } }));
  await assertFails(updateDoc(doc(e, 'users/emp1'), { myCar: { plate: 'A', model: 'B', extra: 1 } }));
  await assertFails(updateDoc(doc(e, 'users/emp1'), { kind: 'hr' }));
  await assertFails(updateDoc(doc(as('alice'), 'users/emp1'), { myCar: null }));
  // працює як водій: зміни й кілометраж
  await assertSucceeds(setDoc(doc(e, 'shifts/se'), shift('emp1')));
  await assertSucceeds(setDoc(doc(e, 'mileage/me'), { uid: 'emp1', type: 'odo', at: 1, km: 5000, liters: null, amount: null, note: '', updatedAt: 1, car: 'own_emp1', plate: 'WX12345' }));
  // керівник закриває / відкриває доступ
  await assertSucceeds(updateDoc(doc(m, 'users/emp1'), { role: 'disabled' }));
  await assertSucceeds(updateDoc(doc(m, 'users/emp1'), { role: 'driver' }));
});

test('тип: керівник змінює водія на працівника і назад; кадри — ні', async () => {
  const { deleteField } = await import('firebase/firestore');
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users/olha'), { ...profile('Ольга', 'hr'), kind: 'hr' });
  });
  const m = as('boss');
  await assertSucceeds(updateDoc(doc(m, 'users/alice'), { kind: 'emp' }));
  await assertSucceeds(updateDoc(doc(m, 'users/alice'), { kind: deleteField() }));
  await assertFails(updateDoc(doc(m, 'users/alice'), { kind: 'hr' }));
  await assertFails(updateDoc(doc(m, 'users/olha'), { kind: 'emp' }));
  await assertFails(updateDoc(doc(m, 'users/olha'), { kind: deleteField() }));
  await assertFails(updateDoc(doc(as('alice'), 'users/alice'), { kind: 'emp' }));
});
