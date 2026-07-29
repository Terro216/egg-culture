# Яичная Культура (Egg Culture)

Гастрономический и эстетический манифест, возводящий куриное яйцо в ранг спешалти-кофе, коллекционного вина и элитного китайского чая. Ироничный по замыслу, абсолютно серьезный в подаче.

Сайт: `https://egg.<DOMAIN>` (по умолчанию — https://egg.ilyamedve.dev)

Полное описание концепции, философии и архитектуры — в [EGG.md](EGG.md). Исторический план проекта — в [PROJECT_PLAN.md](PROJECT_PLAN.md). Механика закрытой «кладки Фонина» — в [FONIN_PLAN.md](FONIN_PLAN.md).

## Стек

- **Astro 6** — статика (SSG) по умолчанию + SSR-адаптер `@astrojs/node` (standalone) для динамических страниц (`/blog`, `/prophecy`, `/dark-side/fonin`, API-роуты).
- **React 19** — точечные интерактивные острова (Island Architecture).
- **Three.js** — 3D-яйцо и шейдеры тёмной стороны.
- **d3-geo + topojson-client** — векторная карта терруаров.
- **@resvg/resvg-js** — серверный рендер og-карточек результата теста «Какое вы яйцо?» (SVG → PNG, шрифты в `src/shared/assets/fonts`).
- Нативный Astro i18n (`ru`/`en`) + собственная утилита переводов, без клиентских i18n-библиотек.
- Архитектура — Feature-Sliced Design (`app / pages / widgets / features / shared`).

## Команды

| Команда           | Действие                                    |
| :---------------- | :------------------------------------------ |
| `npm install`     | Установка зависимостей                      |
| `npm run dev`     | Dev-сервер на `localhost:4321` (с `--host`) |
| `npm run build`   | Сборка в `./dist/`                          |
| `npm run preview` | Локальный предпросмотр сборки               |

Требуется Node.js >= 22.12.

## Переменные окружения

Смотри `.env.example`:

- `DOMAIN` — базовый домен (сайт живет на поддомене `egg.`).
- `NEWS_API_KEY` — ключ [NewsData.io](https://newsdata.io) для мировой яичной ленты в блоге. Без ключа лента пустая, сайт работает.
- `FONIN_ACCESS_WORD` — кодовое слово закрытой кладки подарков.
- `FONIN_GIFT_TOKEN_SECRET` — секрет подписи временных ссылок на сертификаты (если не задан — используется кодовое слово, задать настоятельно рекомендуется).
- `FONIN_GIFT_PRIVATE_DIR` — путь к директории с PNG-сертификатами (по умолчанию `private/fonin-gifts`).
- `KLADKA_BOT_TOKEN`, `KLADKA_ADMIN_CHAT_ID` — Telegram-бот премодерации Книги Кладки (`/kladka`): записи прилетают админу с кнопками «Одобрить/Отклонить». Без токена записи публикуются сразу. Опционально: `KLADKA_WEBHOOK_SECRET`, `KLADKA_IP_SALT`, `KLADKA_DATA_DIR`.

После изменения `.env` контейнер нужно перезапустить.

## Деплой

Docker-first, без CI/CD:

```sh
docker compose up -d --build
```

`docker-compose.yml` рассчитан на внешнюю сеть `caddy_net` с Caddy в роли reverse proxy (лейблы для автоматического SSL уже прописаны). Кэш новостей живет в named volume `news_cache`, записи и фотографии Книги Кладки — в `kladka_data`; оба переживают redeploy.

Приватные сертификаты кладки (`private/fonin-gifts/*.png`) не хранятся в git — при деплое из чистого клона их нужно положить на место руками, иначе API отдаст 404 (мягкая деградация).

## Структура

```text
src/
├── app/        # Layout, глобальные стили (дизайн-токены)
├── pages/      # Роутинг: [lang]/... (ru|en) + api/
├── widgets/    # Header, Footer, DescriptorWheel
├── features/   # EggCalculator, EggOracle, TerroirMap, Quiz,
│               # GiftVault, QiCompass, TastingNote, WorldNews,
│               # EggPersona, Incubator, AdeptCertificate, KladkaBook
├── shared/     # i18n, утилиты (newsCache, foninGiftToken), UI, данные
└── data/       # Контент: блог (md), товары, события
```
