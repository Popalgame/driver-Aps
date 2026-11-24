// Звіти Excel: мої зміни, сторінка водія, усі водії за період.
import { breakMs, workMs, workInRange, startOfDay } from './time.js';
import { driverStats, summarizeByDriver } from './report.js';
import { buildXlsx, downloadXlsx } from './xlsx.js';
import { odoRows, byMonth } from './mileage-calc.js';

const wdFmt = new Intl.DateTimeFormat('uk-UA', { weekday: 'long' });
const wdShort = new Intl.DateTimeFormat('uk-UA', { weekday: 'short' });
const ddmm = new Intl.DateTimeFormat('uk-UA', { day: '2-digit', month: '2-digit' });
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const isoDay = (ms) => { const d = new Date(ms); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };

// Назва файлу латиницею: кирилиця в імені завантаження ламається в деяких браузерах
const TR = { а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', ё: 'e', ы: 'y', э: 'e', ъ: '' };
export const latin = (t) => [...String(t)].map((ch) => {
  const lo = ch.toLowerCase(), r = TR[lo];
  if (r === undefined) return ch;
  return ch === lo ? r : r.charAt(0).toUpperCase() + r.slice(1);
}).join('');
const hhmm = (ms) => { const m = Math.round(ms / 60000); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
const slug = (t) => latin(t).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'zvit';

// ---------- Аркуші ----------
// range = [from, to) — для звіту за період: робочий час лише в межах періоду
function shiftsSheet(shifts, names, now, range) {
  const withDriver = !!names;
  const columns = [
    ...(withDriver ? [{ header: 'Водій', width: 24, type: 'text' }] : []),
    { header: 'Дата', width: 12, type: 'date' },
    { header: 'День тижня', width: 13, type: 'text' },
    { header: 'Початок', width: 10, type: 'time' },
    { header: 'Кінець', width: 10, type: 'time' },
    { header: 'Перерви', width: 10, type: 'duration' },
    { header: 'Робочий час', width: 13, type: 'duration' },
    { header: 'Годин (число)', width: 13, type: 'hours' },
    { header: 'Нотатка / маршрут', width: 40, type: 'wrap' },
  ];
  const sorted = [...shifts].sort((a, b) => (withDriver ? (names.get(a.uid) || '').localeCompare(names.get(b.uid) || '', 'uk') : 0) || a.start - b.start);
  const rows = sorted.map((s) => {
    const full = workMs(s, now);
    const part = range ? workInRange(s, range[0], range[1], now) : full;
    const notes = [
      s.end == null ? '(зміна триває)' : '',
      part !== full ? `(у періоді ${hhmm(part)} з ${hhmm(full)})` : '',
      s.note || '',
    ].filter(Boolean).join(' ');
    return [
      ...(withDriver ? [names.get(s.uid) || s.driverName || ''] : []),
      s.start, cap(wdFmt.format(s.start)), s.start, s.end ?? null,
      breakMs(s, now), part, part, notes,
    ];
  });
  const o = withDriver ? 1 : 0;
  return { name: 'Зміни', columns, rows, total: { label: 'Разом', sum: [o + 4, o + 5, o + 6] } };
}

// Робочий час по днях (нічна зміна ділиться між днями)
function daysSheet(shifts, now) {
  const map = new Map();
  for (const s of shifts) {
    for (let d = +startOfDay(new Date(s.start)); d <= (s.end ?? now); d = +startOfDay(new Date(d + 36 * 3600e3))) {
      const next = +startOfDay(new Date(d + 36 * 3600e3));
      const ms = workInRange(s, d, next, now);
      if (ms <= 0) continue;
      const r = map.get(d) || { ms: 0, count: 0 };
      r.ms += ms; r.count += 1;
      map.set(d, r);
    }
  }
  const rows = [...map.entries()].sort((a, b) => a[0] - b[0])
    .map(([d, r]) => [d, cap(wdFmt.format(d)), r.count, r.ms, r.ms]);
  return {
    name: 'По днях',
    columns: [
      { header: 'Дата', width: 12, type: 'date' },
      { header: 'День тижня', width: 13, type: 'text' },
      { header: 'Змін', width: 8, type: 'int' },
      { header: 'Робочий час', width: 13, type: 'duration' },
      { header: 'Годин (число)', width: 13, type: 'hours' },
    ],
    rows,
    total: { label: 'Разом', sum: [2, 3, 4] },
  };
}

function statsSheet(shifts, now) {
  const st = driverStats(shifts, now);
  return {
    name: 'Підсумки',
    columns: [
      { header: 'Показник', width: 24, type: 'text' },
      { header: 'Робочий час', width: 14, type: 'duration' },
      { header: 'Годин (число)', width: 14, type: 'hours' },
    ],
    rows: [
      ['Сьогодні', st.today, st.today],
      ['Цей тиждень', st.week, st.week],
      ['Минулий тиждень', st.lastWeek, st.lastWeek],
      ['Цей місяць', st.month, st.month],
      ['Минулий місяць', st.lastMonth, st.lastMonth],
      ['Увесь час', st.all, st.all],
      ['Середня зміна', st.avgShift, st.avgShift],
      ['Перерви за місяць', st.breaksMonth, st.breaksMonth],
      [`Змін цього місяця: ${st.shiftsMonth}, усього: ${st.shiftsAll}`, null, null],
    ],
  };
}

// ---------- Звіти ----------
const today = () => isoDay(Date.now());

// «Мій час» — мої зміни
export function exportMine(shifts, name) {
  const now = Date.now();
  const bytes = buildXlsx([shiftsSheet(shifts, null, now), daysSheet(shifts, now), statsSheet(shifts, now)]);
  downloadXlsx(bytes, `Driver-Aps_${name ? slug(name) + '_' : ''}${today()}.xlsx`);
}

// Сторінка водія
export function exportDriver(shifts, name) {
  const now = Date.now();
  const bytes = buildXlsx([statsSheet(shifts, now), shiftsSheet(shifts, null, now), daysSheet(shifts, now)]);
  downloadXlsx(bytes, `Driver-Aps_${slug(name)}_${today()}.xlsx`);
}

// Усі водії за період [from, to): підсумок, табель по днях, усі зміни
export function exportTeam(shifts, users, from, to, periodLabel) {
  const now = Date.now();
  const inRange = shifts.filter((s) => workInRange(s, from, to, now) > 0 || (s.end == null && s.start < to));
  const rowsAll = summarizeByDriver(inRange, users, from, to, now);
  const names = new Map(rowsAll.map((r) => [r.uid, r.name]));
  const statusOf = (r) => r.role === 'disabled' ? 'Доступ закрито' : r.active ? (r.onBreak ? 'Перерва' : 'У дорозі') : 'Не на зміні';

  const summary = {
    name: 'Підсумок',
    columns: [
      { header: 'Водій', width: 24, type: 'text' },
      { header: 'Email', width: 26, type: 'text' },
      { header: 'Статус зараз', width: 15, type: 'text' },
      { header: 'Змін', width: 8, type: 'int' },
      { header: 'Робочий час', width: 13, type: 'duration' },
      { header: 'Годин (число)', width: 13, type: 'hours' },
      { header: 'Перерви', width: 11, type: 'duration' },
    ],
    rows: rowsAll.map((r) => [r.name, r.email, statusOf(r), r.count, r.total, r.total,
      r.shifts.reduce((a, s) => a + breakMs(s, now), 0)]),
    total: { label: `Разом (${periodLabel})`, sum: [3, 4, 5, 6] },
  };

  const sheets = [summary];
  // Табель: водії × дні (години числом), якщо період не довший за 62 дні
  const days = [];
  for (let d = from; d < to && days.length <= 62; d = +startOfDay(new Date(d + 36 * 3600e3))) days.push(d);
  if (days.length <= 62) {
    sheets.push({
      name: 'Табель (години)',
      columns: [
        { header: 'Водій', width: 24, type: 'text' },
        ...days.map((d) => ({ header: `${ddmm.format(d)} ${wdShort.format(d)}`, width: 8, type: 'hours' })),
        { header: 'Разом', width: 10, type: 'hours' },
      ],
      rows: rowsAll.map((r) => {
        const per = days.map((d, i) => {
          const next = days[i + 1] ?? to;
          return r.shifts.reduce((a, s) => a + workInRange(s, d, next, now), 0) || null;
        });
        return [r.name, ...per, r.total];
      }),
      total: { label: 'Разом', sum: days.map((_, i) => i + 1).concat(days.length + 1) },
    });
  }
  sheets.push(shiftsSheet(inRange, names, now, [from, to]));
  downloadXlsx(buildXlsx(sheets), `Driver-Aps_vodii_${isoDay(from)}_${isoDay(to - 1)}.xlsx`);
}

// ---------- Кілометраж і заправки ----------
const monthFmt = new Intl.DateTimeFormat('uk-UA', { month: 'long', year: 'numeric' });

// entries — усі записи (для «проїхано» потрібен попередній показник); у файл — лише [from, to)
export function exportMileage(entries, from, to, name) {
  const inP = (e) => e.at >= from && e.at < to;
  const odo = odoRows(entries).filter(inP);
  const fuel = entries.filter((e) => e.type === 'fuel' && inP(e)).sort((a, b) => a.at - b.at);
  const firstMonth = startOfDay(new Date(from)); firstMonth.setDate(1);
  const months = byMonth(entries).filter((m) => m.from >= +firstMonth && m.from < to && (m.km || m.count));
  const sheets = [
    {
      name: 'Кілометраж',
      columns: [
        { header: 'Дата', width: 12, type: 'date' },
        { header: 'День тижня', width: 13, type: 'text' },
        { header: 'Кілометраж (зранку), км', width: 16, type: 'int' },
        { header: 'Проїхано від попереднього запису, км', width: 18, type: 'int' },
        { header: 'Нотатка', width: 30, type: 'wrap' },
      ],
      rows: odo.map((e) => [e.at, cap(wdFmt.format(e.at)), e.km, e.diff, e.note || '']),
      total: { label: 'Разом', sum: [3] },
    },
    {
      name: 'Заправки',
      columns: [
        { header: 'Дата', width: 12, type: 'date' },
        { header: 'Час', width: 8, type: 'time' },
        { header: 'Літри', width: 9, type: 'dec' },
        { header: 'Сума', width: 10, type: 'dec' },
        { header: 'Ціна за літр', width: 11, type: 'dec' },
        { header: 'Кілометраж, км', width: 13, type: 'int' },
        { header: 'АЗС / нотатка', width: 30, type: 'wrap' },
      ],
      rows: fuel.map((e) => [e.at, e.at, e.liters, e.amount, e.amount && e.liters ? e.amount / e.liters : null, e.km, e.note || '']),
      total: { label: 'Разом', sum: [2, 3] },
    },
    {
      name: 'По місяцях',
      columns: [
        { header: 'Місяць', width: 18, type: 'text' },
        { header: 'Пробіг, км', width: 11, type: 'int' },
        { header: 'Заправок', width: 10, type: 'int' },
        { header: 'Літри', width: 9, type: 'dec' },
        { header: 'Сума', width: 10, type: 'dec' },
        { header: 'Середня витрата, л/100 км', width: 14, type: 'dec' },
      ],
      rows: months.map((m) => [cap(monthFmt.format(m.from)), m.km, m.count, m.liters, m.amount, m.per100]),
      total: { label: 'Разом', sum: [1, 2, 3, 4] },
    },
  ];
  downloadXlsx(buildXlsx(sheets), `Driver-Aps_kilometrazh_${name ? slug(name) + '_' : ''}${isoDay(from)}_${isoDay(to - 1)}.xlsx`);
}
