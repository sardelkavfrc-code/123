# VK Music Player

Полноценный десктоп-плеер для ВКонтакте: Vue 3 + Electron на фронте, FastAPI на бэке.

> ⚠️ ВК закрыл публичный audio API для сторонних приложений ещё в 2017. Все open-source плееры (VKX, VKM, Music for VK и т.д.) до сих пор работают через direct token grant клиента **Kate Mobile** — этот проект делает то же самое. Логин/пароль или готовый `access_token` остаются у тебя на машине, файл сессии лежит в `~/.vk-music-player/session.json` с правами `0o600`.

## Возможности

- Авторизация (логин/пароль с 2FA и капчей, либо готовый Kate-mobile токен)
- Моя музыка с поиском внутри библиотеки
- Музыка друзей — только те, у кого открыт просмотр аудио (`can_see_audio`)
- Глобальный поиск ВК и подбор похожих треков для текущего трека
- «Собрано алгоритмами» — карточки рекомендаций из `audio.getCatalog`
- Артисты с переходом со строки трека (`audio.getArtistById` + `audio.getAudiosByArtist`)
- Полноценный плеер: shuffle, repeat (off/all/one), очередь, медиа-клавиши, трей
- Spring-анимации на @vueuse/motion и режим производительности с мгновенными переходами
- Темы (Dark / AMOLED / Light) и 5 акцентов
- Автозапуск, закрытие в трей, лимит локального кеша

## Структура

```
backend/        FastAPI прокси к VK API
  app/
    config.py             — settings (env)
    storage.py            — session.json (0o600)
    vk/                   — клиент, auth, исключения
    routers/              — /auth /audio /friends
    services/             — нормализация ответов VK
    models/               — pydantic v2 модели
  tests/                  — юнит-тесты парсинга
frontend/       Vue 3 + Vite + Electron + TypeScript
  electron/    Главный и preload-процессы (трей, медиа-клавиши, автозапуск)
  src/
    api/           axios клиент + типы
    stores/        pinia (auth, player, library, settings, ui)
    composables/   useMotion, useFormat
    components/    Sidebar, PlayerBar, TrackRow и т.д.
    views/         Auth / Home / MyMusic / Friends / FriendMusic / Search / Artist / Settings
    styles/        Темы + анимации
```

## Запуск

### Бэкенд

```bash
cd backend
poetry install
poetry run fastapi dev app/main.py   # 127.0.0.1:8765
```

`.env` (см. `.env.example`):

```
VKMP_BIND_HOST=127.0.0.1
VKMP_BIND_PORT=8765
VKMP_CORS_ORIGINS=http://localhost:5173,app://./
VKMP_SESSION_DIR=~/.vk-music-player
```

### Фронт

```bash
cd frontend
npm install
npm run dev          # запустит Vite + Electron одновременно
```

В dev-режиме Electron подключается к `http://localhost:5173`, бэкенд должен быть запущен отдельно.

### Сборка production

```bash
cd frontend
npm run build        # vue-tsc + vite build
npm run build:electron
# дальше через electron-builder можно собрать .exe / .AppImage / .dmg
```

## Линт и тесты

```bash
# Backend
cd backend
poetry run ruff check app tests
poetry run pytest -q

# Frontend
cd frontend
npm run lint
npm run typecheck
```

## VK API

Все запросы идут через 127.0.0.1:8765/* и пробрасываются в `api.vk.com/method/*` с `access_token` из локальной сессии. Используются:

- `audio.get`, `audio.getById`, `audio.search`, `audio.add`, `audio.delete`
- `audio.getRecommendations` (похожие, в т.ч. по `target_audio`)
- `audio.getCatalog` (карточки «Собрано алгоритмами»)
- `audio.getAudiosByArtist`, `audio.getArtistById`
- `friends.get` (с фильтром по `can_see_audio`)
- `users.get`

## Заметки по безопасности

- Файл сессии хранится только локально (`~/.vk-music-player/session.json`, права `0o600`).
- Бэкенд слушает только `127.0.0.1`; CORS ограничен Vite dev origin и Electron `app://./`.
- Никаких внешних телеметрий, сторонних аналитик, рекламы.

Лицензия: MIT (свободно использовать для личных целей; коммерческое использование на свой страх и риск из-за политики ВК).
