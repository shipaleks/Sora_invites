# Шаблон переменных окружения (.env)

Создай файл `.env` в корне проекта и заполни следующие переменные:

```env
# Telegram
TELEGRAM_BOT_TOKEN=your_token_from_botfather
ADMIN_TELEGRAM_ID=your_telegram_user_id
TELEGRAM_CHANNEL=@humanagentinteraction
SORA_USERNAME=@shipaleks

# Firebase (из Service Account JSON)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour\nMultiline\nKey\n-----END PRIVATE KEY-----\n"

# App
NODE_ENV=production
PORT=3000

# Webhook (для production на Koyeb)
WEBHOOK_DOMAIN=your-app.koyeb.app
```

## Как получить переменные:

### TELEGRAM_BOT_TOKEN
1. Открой @BotFather в Telegram
2. Создай бота: `/newbot`
3. Скопируй токен

### ADMIN_TELEGRAM_ID
1. Открой @userinfobot в Telegram
2. Отправь любое сообщение
3. Скопируй свой ID

### Firebase переменные
1. Открой https://console.firebase.google.com/
2. Перейди в Project Settings → Service Accounts
3. Нажми "Generate new private key"
4. Из скачанного JSON файла возьми:
   - `project_id` → FIREBASE_PROJECT_ID
   - `client_email` → FIREBASE_CLIENT_EMAIL
   - `private_key` → FIREBASE_PRIVATE_KEY (обязательно в кавычках!)

### WEBHOOK_DOMAIN
Домен твоего приложения в Koyeb (например: `my-sora-bot.koyeb.app`)

