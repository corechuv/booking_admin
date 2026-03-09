# Mira Booking Admin UI

Админ-панель салона Mira на `React + TypeScript + Vite`.

## Локальный запуск

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## ENV

Создай `.env` на основе `.env.example`:

```env
VITE_API_URL=https://mira-booking-api-prod.onrender.com/api/v1
VITE_CLIENT_APP_URL=https://center-mira.com
```

## Netlify

Файл `netlify.toml` уже добавлен:
- build command: `npm run build`
- publish dir: `dist`
- SPA redirect: `/* -> /index.html`

В Netlify добавь переменные окружения:
- `VITE_API_URL`
- `VITE_CLIENT_APP_URL`
