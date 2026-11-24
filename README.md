# Час у дорозі

PWA для водіїв: облік робочого часу.

- **Почати / Закінчити роботу** — одна велика кнопка, таймер іде наживо.
- **Перерва** — час перерви не входить у робочий час.
- Підсумки за **сьогодні, тиждень, місяць** (нічна зміна ділиться між днями).
- **Історія змін** по днях; натисни на зміну, щоб виправити чи видалити.
- **Експорт у CSV** (Excel / Google Таблиці).
- Працює **офлайн**, ставиться на головний екран телефона.

Дані зберігаються лише на пристрої (localStorage).

## Локальний запуск

Потрібен Node.js 18+.

```bash
npm install
npm start
```

Відкрий http://localhost:5173/

## Перевірки

```bash
npm run check   # eslint + тести
```

## Структура

```
site/                 # усе, що публікується
├── index.html
├── style.css
├── sw.js             # service worker (офлайн)
├── manifest.webmanifest
├── icon.svg
├── firebase.json     # хостинг: no-cache для html/js/css
└── src/
    ├── app.js        # інтерфейс
    └── time.js       # підрахунок часу (без DOM)
scripts/serve.mjs     # локальний сервер для npm start
tests/                # node --test
.github/workflows/deploy.yml
```

## Публікація (Firebase Hosting)

Пуш у `main` → GitHub Actions запускає перевірки. Деплой на Firebase вмикається,
коли в репозиторії налаштовано:

- змінну `FIREBASE_PROJECT_ID` (Settings → Secrets and variables → Actions → Variables);
- секрет `FIREBASE_SERVICE_ACCOUNT` (JSON сервісного акаунта Firebase).

Без них сайт не публікується — апка працює лише локально.
