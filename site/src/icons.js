// Іконки апки — власні SVG в одному стилі (лінія 2 px, заокруглені кінці).
// У HTML: <i data-i="calendar"></i> — замінюється на SVG при старті (hydrateIcons).
// У JS: svg('calendar') — рядок; iconText(node, 'calendar', 'Текст') — іконка + текст.
const P = {
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  car: '<path d="M5 17H4a1 1 0 0 1-1-1v-3.5L5 7.5A2 2 0 0 1 6.9 6h10.2A2 2 0 0 1 19 7.5l2 5V16a1 1 0 0 1-1 1h-1"/><path d="M3.5 12.5h17"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/><path d="M9.5 17h5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/><rect x="7" y="13.5" width="3.5" height="3.5" rx=".8" class="f"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M15.5 4.8a3.2 3.2 0 0 1 0 6.3M18 14.8c2 .6 3.2 2.3 3.5 5.2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c.7-4 3.7-6 7.5-6s6.8 2 7.5 6"/>',
  userPlus: '<circle cx="10" cy="8" r="3.8"/><path d="M3 20.5c.7-3.9 3.5-6 7-6 1.6 0 3 .4 4.2 1.2"/><path d="M18.5 13.5v7M15 17h7"/>',
  folder: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.6a2 2 0 0 1 1.4.6L12 7h6.5A2.5 2.5 0 0 1 21 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/><path d="M3 10.5h18"/>',
  sliders: '<path d="M4 6.5h9M17 6.5h3M4 12h3M11 12h9M4 17.5h11M19 17.5h1"/><circle cx="15" cy="6.5" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17.5" r="2"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3M12 6.5v6M9.5 10l2.5 2.5 2.5-2.5"/>',
  play: '<path d="M8 5.5v13a.8.8 0 0 0 1.2.7l10.3-6.5a.8.8 0 0 0 0-1.4L9.2 4.8A.8.8 0 0 0 8 5.5z" class="f"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2.5" class="f"/>',
  coffee: '<path d="M4 9h12v4.5A5.5 5.5 0 0 1 10.5 19h-1A5.5 5.5 0 0 1 4 13.5z"/><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5c-.6.8-.6 1.7 0 2.5M12 3.5c-.6.8-.6 1.7 0 2.5"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  fuel: '<path d="M4.5 20.5V6a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v14.5M3 20.5h12M6.5 8.5h5"/><path d="M13.5 11h1.8a1.7 1.7 0 0 1 1.7 1.7v3.6a1.5 1.5 0 0 0 3 0V9.2L17.5 6.7"/>',
  gauge: '<path d="M3.5 17a8.5 8.5 0 1 1 17 0"/><path d="M12 17l4.2-5M6.5 13.5l1 .6M12 8.5V9.7M17.5 13.5l-1 .6"/><circle cx="12" cy="17" r="1.4" class="f"/>',
  pencil: '<path d="M4 20h4L19.3 8.7a2.1 2.1 0 0 0 0-3L18.3 4.7a2.1 2.1 0 0 0-3 0L4 16z"/><path d="M13.5 6.5l4 4"/>',
  alarm: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 1.8M4.5 4.5 2.8 6.2M19.5 4.5l1.7 1.7"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.8 2.8L16.2 9.7"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M4 7l8 6 8-6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  share: '<path d="M8 9.5H6.5A1.5 1.5 0 0 0 5 11v8.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V11a1.5 1.5 0 0 0-1.5-1.5H16M12 14V3M8.5 6.5 12 3l3.5 3.5"/>',
  addSquare: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.4-5.7M20 4.5V8.5h-4"/>',
  warn: '<path d="M10.3 4.2 2.8 17.5A2 2 0 0 0 4.5 20.5h15a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4.5M12 17.2v.1"/>',
  idcard: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="11" r="2.3"/><path d="M5.8 16.2c.5-1.6 1.7-2.4 3.2-2.4s2.7.8 3.2 2.4M14.5 10h3.5M14.5 13.5h3.5"/>',
  road: '<path d="M8 3 4 21M16 3l4 18M12 4v3M12 11v3M12 18v2"/>',
};

export const svg = (name, cls = '') =>
  `<svg class="i${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${P[name] || ''}</svg>`;

// Вміст вузла: іконка + текст (текст — безпечно, через textContent)
export function iconText(node, name, text) {
  node.innerHTML = svg(name);
  if (text) node.append(document.createTextNode(' ' + text));
  return node;
}

// Елемент-іконка
export function iconEl(name, cls) {
  const t = document.createElement('template');
  t.innerHTML = svg(name, cls);
  return t.content.firstChild;
}

// Те саме, але лише коли змінилось (кнопки, що оновлюються щосекунди, не перемальовуються)
export function setIconText(node, name, text) {
  const k = name + '|' + text;
  if (node.dataset.ik !== k) { iconText(node, name, text); node.dataset.ik = k; }
}

// <i data-i="назва"></i> у розмітці → SVG
export function hydrateIcons(root = document) {
  for (const n of root.querySelectorAll('i[data-i]')) n.replaceWith(iconEl(n.dataset.i, n.className));
}
