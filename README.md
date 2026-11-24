# Час у дорозі

PWA для водіїв: облік робочого часу.

- **Почати / Закінчити роботу** — одна велика кнопка, таймер іде наживо.
- **Перерва** — час перерви не входить у робочий час.
- Підсумки за **сьогодні, тиждень, місяць** (нічна зміна ділиться між днями).
- **Історія змін** по днях; натисни на зміну, щоб виправити чи видалити.
- **Експорт у CSV** (Excel / Google Таблиці).
- Працює **офлайн**, ставиться на головний екран телефона.

- **Вхід** (email + пароль або Google) і **база даних Firebase**: дані не губляться й синхронізуються між пристроями.
- **Керівник** бачить усіх водіїв: хто зараз у дорозі, підсумки за день / тиждень / місяць / період, деталі змін, CSV.
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
users/{uid}   { name, email, role: "driver" | "manager", createdAt }
shifts/{id}   { uid, driverName, start, end, breaks: [{start, end}], note, updatedAt }
```

Час — у мілісекундах. Правила доступу — `site/firestore.rules`:
водій бачить і змінює лише свої зміни; керівник бачить усіх (лише читання).

## Підключення Firebase

1. Firebase Console → свій проєкт → **Build → Authentication → Get started** →
   увімкни **Email/Password** і **Google**.
2. **Build → Firestore Database → Create database** (регіон `eur3` / `europe-central2`, режим *production*).
3. **Firestore → Rules** — встав вміст `site/firestore.rules` → **Publish**.
4. **⚙ Project settings → Your apps → Web (</>)** — зареєструй апку, скопіюй `firebaseConfig`
   у `site/src/firebase-config.js`.
5. **Authentication → Settings → Authorized domains** — додай домен, де буде апка
   (`localhost` уже є).
6. Керівник: зареєструйся в апці, потім **Firestore → users → твій документ →
   поле `role`** зміни на `manager`.

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

Пуш у `main` → GitHub Actions запускає перевірки. Деплой на Firebase вмикається,
коли в репозиторії налаштовано:

- змінну `FIREBASE_PROJECT_ID` (Settings → Secrets and variables → Actions → Variables);
- секрет `FIREBASE_SERVICE_ACCOUNT` (JSON сервісного акаунта Firebase).

Без них сайт не публікується — апка працює лише локально.
