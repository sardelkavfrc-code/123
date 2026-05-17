# VK Music Player — Backend

FastAPI-прокси к VK API. Делает три вещи:

1. Принимает у Electron-приложения логин/пароль (с поддержкой 2FA) и обменивает их на пользовательский токен через direct token grant, как это делают официальные мобильные клиенты VK.
2. Хранит токен локально (в `~/.vk-music-player/session.json`) между запусками — фронт может не пересылать его на каждый запрос.
3. Оборачивает нужные методы VK API: `audio.get`, `audio.search`, `audio.getRecommendations`, `audio.getCatalog`, `audio.add`, `audio.delete`, `audio.getAudiosByArtist`, `audio.getArtistById`, `friends.get`, `users.get`, и т.д.

## Запуск

```bash
poetry install
poetry run uvicorn app.main:app --reload --port 8765
```

После старта API доступно на `http://127.0.0.1:8765`, OpenAPI — на `http://127.0.0.1:8765/docs`.

## Конфиг (опционально, `.env`)

```env
VK_CLIENT_ID=2685278         # Kate Mobile (по умолчанию)
VK_CLIENT_SECRET=lxhD8OD7dMsqtXIm5IUY
VK_API_VERSION=5.131
VKMP_BIND_HOST=127.0.0.1
VKMP_BIND_PORT=8765
VKMP_CORS_ORIGINS=http://localhost:5173,app://./
```

## Замечание про VK Audio

Официальный публичный аудио-API VK закрыт с 2017. Этот backend намеренно использует `client_id` и `client_secret` Kate Mobile (как делают все опенсорс-плееры на ВК — Music for VK, VKX, VKM и др.). Это значит, что:

- авторизация работает только по логину/паролю (через direct token grant) либо по уже выданному access_token, который вы можете вытащить любым способом;
- ВК может в любой момент инвалидировать токен или поменять API.
