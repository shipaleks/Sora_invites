# Sora Invite Distribution Bot

Telegram-бот для распределения инвайтов в Sora с вирусной механикой самоподдержания пула инвайт-кодов.

## 🎯 Основная идея

Пользователь получает 1 инвайт → регистрируется в Sora → получает 4 кода → возвращает 2-3 обратно → система растет автоматически!

**Дополнительно:**
- 💝 Любой может пожертвовать инвайт-коды в общий пул (помочь сообществу)
- 🔒 Приватность: никнеймы пользователей не отображаются (только ID)

## 🌍 Языки

- 🇷🇺 Русский
- 🇬🇧 English

При первом запуске бот предложит выбрать язык. Сменить язык можно командой `/language`.

## 🚀 Быстрый старт

### 1. Создать Telegram бота

```bash
# Открой @BotFather в Telegram
# Создай бота: /newbot
# Сохрани токен
```

### 2. Настроить Firebase

1. Создай проект на https://console.firebase.google.com/
2. Включи Firestore Database
3. Скачай Service Account JSON
4. Скопируй данные для .env

### 3. Установка

```bash
npm install
```

### 4. Настройка переменных окружения

Создай файл `.env` со следующими переменными (смотри `.env.example` для примера):

```env
# Telegram
TELEGRAM_BOT_TOKEN=твой_токен_от_botfather
ADMIN_TELEGRAM_ID=твой_telegram_user_id
TELEGRAM_CHANNEL=@humanagentinteraction
SORA_USERNAME=@shipaleks

# Firebase (из Service Account JSON)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# App
NODE_ENV=production
PORT=3000
WEBHOOK_DOMAIN=your-app.koyeb.app
```

### 5. Инициализация

```bash
npm run init
```

Скрипт проверит подключение к Firebase и предложит добавить начальные инвайт-коды.

### 6. Запуск

```bash
# Development (polling)
npm run dev

# Production (webhook)
npm start
```

## 📦 Деплой на Koyeb

### Переменные окружения в Koyeb

В Koyeb Dashboard → Settings → Environment Variables добавь:

```
TELEGRAM_BOT_TOKEN
ADMIN_TELEGRAM_ID
TELEGRAM_CHANNEL
SORA_USERNAME
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
NODE_ENV=production
WEBHOOK_DOMAIN=your-app.koyeb.app
PORT=3000
```

**Важно:** `FIREBASE_PRIVATE_KEY` должен быть в кавычках с `\n` для переносов строк.

### Настройка деплоя

- Build command: `npm install`
- Run command: `npm start`
- Port: 3000

### Установка webhook

После деплоя бот автоматически установит webhook. Проверить можно:

```bash
curl https://api.telegram.org/bot<YOUR_TOKEN>/getWebhookInfo
```

## 🔧 Админ команды

| Команда | Описание |
|---------|----------|
| `/addcodes код1 код2 код3` | Добавить коды вручную |
| `/poolsize` | Размер пула |
| `/queuesize` | Размер очереди |
| `/broadcast текст` | Рассылка всем пользователям |
| `/stats` | Статистика системы |

## 📊 Структура базы данных (Firestore)

### Коллекции

- **users** - все пользователи бота
- **queue** - очередь на получение инвайта
- **invite_pool** - пул доступных инвайт-кодов
- **settings** - системные настройки

## ⚙️ Механика работы

### Для первых 10 пользователей
- Получают 1 код
- Должны вернуть **3 кода** из 4
- Оставляют себе 1 код

### Для остальных
- Получают 1 код
- Должны вернуть **2 кода** из 4
- Оставляют себе 2 кода

### Система напоминаний
- Через 24 часа - первое напоминание
- Через 40 часов - второе напоминание
- Через 47 часов - финальное предупреждение

**Важно:** Система основана на доверии. Банов нет, только мягкие напоминания.

## 🔍 Мониторинг

Логи доступны в Koyeb Dashboard → Logs.

Ключевые метрики для отслеживания:
- % возврата кодов (цель: >70%)
- Среднее время возврата (цель: <36 часов)
- Отношение кодов в пуле к размеру очереди (цель: >1.5x)

## 🐛 Troubleshooting

### Бот не отвечает
```bash
# Проверь webhook
curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo

# Проверь логи в Koyeb
# Проверь переменные окружения
```

### Firebase ошибки
- Проверь правильность `FIREBASE_PRIVATE_KEY` (с `\n`)
- Проверь permissions Service Account
- Проверь quotas в Firebase Console

### Cron не работает
- Убедись что приложение не "засыпает" (Koyeb keep-alive)
- Проверь timezone сервера
- Проверь логи cron задач

## 📄 Лицензия

MIT

## 👤 Автор

[@shipaleks](https://t.me/humanagentinteraction)

---

**Примечание:** Этот бот создан для сообщества с целью справедливого распределения доступа к Sora. Используй ответственно! 🙏

