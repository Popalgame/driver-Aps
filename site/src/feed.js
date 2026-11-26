// Спільні дані після входу: проєкти, події календаря, оголошення, (керівнику) користувачі.
// Один набір підписок на всю апку — їх використовують календар, проєкти і сповіщення.
import * as cloud from './cloud.js';

export const state = { user: null, projects: [], events: [], users: [], notices: [], cars: [], carKm: [], error: null, loaded: false };
const subs = new Set();
let stops = [], stopEvents = null, eventsFor = '', stopCarKm = null, carKmFor = '';

const emit = () => { for (const cb of subs) cb(state); };
const fail = (e) => { console.error(e); state.error = e; emit(); };

// cb(state) — одразу і при кожній зміні; повертає функцію відписки
export function subscribe(cb) {
  subs.add(cb);
  cb(state);
  return () => subs.delete(cb);
}

export function startFeed(profile) {
  stopFeed();
  const manager = profile.role === 'manager';
  state.user = { uid: profile.uid, name: profile.name, role: profile.role };
  stops.push(cloud.watchProjects(profile.uid, profile.role, (list) => {
    state.projects = list.sort((a, b) => a.name.localeCompare(b.name, 'uk'));
    state.error = null;
    state.loaded = true; // проєкти завантажено (для сповіщень «тебе додали до проєкту»)
    // Водій: події лише своїх проєктів — перепідписка, коли склад проєктів змінився
    const key = manager ? '*' : state.projects.map((p) => p.id).sort().join(',');
    if (key !== eventsFor) {
      stopEvents?.();
      eventsFor = key;
      stopEvents = cloud.watchEvents(state.projects.map((p) => p.id), manager, (ev) => { state.events = ev; emit(); }, fail);
    }
    emit();
  }, fail));
  if (manager) stops.push(cloud.watchUsers((list) => { state.users = list; emit(); }, fail));
  // Оголошення: помилку (напр., ще не оновлені правила) не показуємо в календарі — лише в консолі
  // Машини: керівнику — усі, водію — своя (кадрам не потрібні)
  // Машини фірми (працівнику теж — йому можуть дати машину фірми на час)
  if (profile.role !== 'hr') {
    stops.push(cloud.watchCars(profile.uid, profile.role, (list) => {
      state.cars = list;
      // Показники одометра цих машин від усіх водіїв — перепідписка, коли змінився список машин
      const key = list.map((c) => c.id).sort().join(',');
      if (key !== carKmFor) {
        stopCarKm?.();
        carKmFor = key;
        stopCarKm = cloud.watchCarMileage(list.map((c) => c.id), (km) => { state.carKm = km; emit(); }, (e) => console.error(e));
      }
      emit();
    }, (e) => console.error(e)));
  }
  stops.push(cloud.watchNotices(profile.uid, profile.role, (list) => { state.notices = list; emit(); }, (e) => console.error(e)));
  emit();
}

export function stopFeed() {
  for (const s of stops) s();
  stopEvents?.();
  stopCarKm?.();
  stops = []; stopEvents = null; eventsFor = ''; stopCarKm = null; carKmFor = '';
  Object.assign(state, { user: null, projects: [], events: [], users: [], notices: [], cars: [], carKm: [], error: null, loaded: false });
  emit();
}

// Оновити ім'я (налаштування): нові події підписуються новим іменем
export function setUserName(name) { if (state.user) state.user.name = name; }
