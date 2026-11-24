# Driver-Aps

PWA для водіїв: облік робочого часу.

- **Почати / Закінчити роботу** — одна велика кнопка, таймер іде наживо.
- **Перерва** — час перерви не входить у робочий час.
- Підсумки за **сьогодні, тиждень, місяць** (нічна зміна ділиться між днями).
- **Історія змін** по днях; натисни на зміну, щоб виправити чи видалити.
- **Експорт у CSV** (Excel / Google Таблиці).
- Працює **офлайн**, ставиться на головний екран телефона.

- **Вхід** (email + пароль) і **база даних Firebase**: дані не губляться й синхронізуються між пристроями.
- **Реєстрації немає** — водіїв додає керівник у вкладці «Водії» (апка генерує пароль).
- **Керівник** бачить усіх водіїв: хто зараз у дорозі, підсумки за день / тиждень / місяць / період, деталі змін, CSV;
  підтверджує нові облікові записи й закриває доступ.
- Без інтернету зміни зберігаються й синхронізуються, коли зв'язок повернеться.

Поки Firebase не налаштований (`site/src/firebase-config.js` = `null`), апка працює лише
локально — дані на пристрої (localStorage).

## Локальний запуск

Потрібен Node.js 18+.

```bash
npm install
npm start
```

Відкрий http://localhost:5173/

## Перевірки

```bash
npm run check        # eslint + тести логіки
npm run test:rules   # тести правил доступу Firestore (емулятор, потрібна Java)
```

## Розробка з емулятором Firebase (без справжнього проєкту)

```bash
npm run emulators    # у першому терміналі
npm start            # у другому
```

Відкрий http://localhost:5173/?emulator — вхід і база працюють локально.

## База даних

```
users/{uid}   { name, email, role: "pending" | "driver" | "disabled" | "manager", createdAt }
shifts/{id}   { uid, driverName, start, end, breaks: [{start, end}], note, updatedAt }
```

Час — у мілісекундах. Правила доступу — `site/firestore.rules`:
- `pending` — увійшов, але ще не підтверджений: нічого не записує;
- `driver` — бачить і змінює лише свої зміни;
- `disabled` — доступ закрито керівником;
- `manager` — бачить усіх (зміни лише читає), додає водіїв, підтверджує, закриває доступ.

Після зміни правил встав `site/firestore.rules` у Firebase Console → Firestore → Rules → **Publish**
(автопублікація правил потребує окремих дозволів сервісного акаунта).

## Підключення Firebase (вже зроблено для проєкту `driver-aps`)

1. Authentication → Sign-in method → увімкнути **Email/Password**.
2. Firestore Database → Create database (`europe-central2`, production).
3. Project settings → Your apps → Web → конфіг у `site/src/firebase-config.js`.
4. Секрет `FIREBASE_SERVICE_ACCOUNT` у GitHub — публікація апки.
5. Firestore → Rules — вміст `site/firestore.rules` → **Publish**.

### Перший керівник

1. Authentication → Users → **Add user** (email + пароль).
2. Увійди в апку — з'явиться «Очікує підтвердження».
3. Firestore → `users` → документ з твоїм email → `role`: `manager` (і `name` — своє ім'я).
   Апка сама відкриє панель керівника.

Оновлення SDK Firebase: `npm run build:firebase` (збирає `site/vendor/firebase.js`).

## Структура

```
site/                 # усе, що публікується
├── index.html
├── style.css
├── sw.js             # service worker (офлайн)
├── manifest.webmanifest
├── icon.svg
├── firebase.json     # хостинг, правила, емулятори
├── firestore.rules   # правила доступу до бази
├── vendor/firebase.js
└── src/
    ├── app.js        # інтерфейс водія, вхід
    ├── manager.js    # панель керівника
    ├── cloud.js      # Firebase: вхід, профілі, зміни
    ├── firebase-config.js
    ├── report.js     # звіти й CSV (без DOM)
    └── time.js       # підрахунок часу (без DOM)
scripts/serve.mjs     # локальний сервер для npm start
tests/                # node --test
rules-tests/          # тести правил Firestore (npm run test:rules)
.github/workflows/deploy.yml
```

## Публікація (Firebase Hosting)

Пуш у `main` → GitHub Actions запускає перевірки й публікує `site/` на
https://driver-aps.web.app. Для публікації в репозиторії потрібен секрет
`FIREBASE_SERVICE_ACCOUNT` (Settings → Secrets and variables → Actions) —
JSON-ключ сервісного акаунта з Firebase Console → Project settings → Service accounts.
Без нього перевірки проходять, а публікація пропускається.

## Версії

Поточна версія — у `site/src/version.js` (зараз **0.0.4 альфа**). Її видно на екрані входу,
у бічному меню та в «Налаштування → Про апку».

При кожному оновленні піднімаємо номер (0.0.1 → 0.0.2 …) у трьох місцях:
`site/src/version.js`, `package.json` (`0.0.2-alpha`) і `CACHE` у `site/sw.js` (`driver-aps-0.0.2`).
`tests/version.test.mjs` перевіряє, що вони збігаються; нова назва кешу змушує телефони
підхопити оновлення.
