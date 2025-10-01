# Implementation Plan: Sora Invite Distribution Bot

## Архитектура системы

```
┌─────────────────┐
│  Telegram User  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Telegraf Bot   │ ◄──── node-cron (Schedulers)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Firebase        │
│ Firestore       │
│  - users        │
│  - invite_pool  │
│  - queue        │
│  - settings     │
└─────────────────┘
```

## Структура проекта

```
sora-invite-bot/
├── src/
│   ├── index.js              # Точка входа, инициализация бота
│   ├── config.js             # Конфигурация из .env
│   ├── database.js           # Firebase операции
│   ├── scheduler.js          # Cron задачи (напоминания, очередь)
│   ├── messages.js           # Все текстовые сообщения
│   ├── handlers/
│   │   ├── commands.js       # Обработчики команд (/start, /stats)
│   │   ├── callbacks.js      # Обработчики inline кнопок
│   │   └── text.js           # Обработчики текстовых сообщений
│   └── utils/
│       ├── validators.js     # Валидация инвайт кодов
│       └── helpers.js        # Вспомогательные функции
├── scripts/
│   └── init.js               # Скрипт инициализации
├── package.json
├── .env.example
├── .gitignore
├── README.md
└── koyeb.yaml               # Конфигурация деплоя
```

---

## Этап 1: Настройка окружения

### 1.1 Создание Telegram бота

```bash
# 1. Открыть @BotFather в Telegram
# 2. Команда: /newbot
# 3. Название: Sora Invite Bot
# 4. Username: sora_invite_bot (или другое доступное)
# 5. Сохранить токен
```

**Настройки бота в BotFather:**
```
/setdescription - Бот для распределения инвайтов в Sora
/setabouttext - Получи инвайт в Sora через систему взаимопомощи
/setcommands:
start - Начать работу
stats - Моя статистика
help - Помощь
```

### 1.2 Настройка Firebase

**Шаги:**
1. Перейти на https://console.firebase.google.com/
2. Создать новый проект: `sora-invite-bot`
3. Включить Firestore Database
4. Выбрать локацию: `europe-west` (ближайший к пользователям)
5. Режим: **Production mode**

**Правила безопасности Firestore:**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      // Только Admin SDK имеет доступ
      allow read, write: if false;
    }
  }
}
```

**Получить Service Account:**
1. Project Settings → Service Accounts
2. Generate new private key
3. Скачать JSON файл
4. Извлечь данные:
   - `project_id`
   - `client_email`
   - `private_key`

### 1.3 Локальная настройка

```bash
# Создать проект
mkdir sora-invite-bot
cd sora-invite-bot
npm init -y

# Установить зависимости
npm install telegraf firebase-admin node-cron dotenv

# Dev зависимости
npm install --save-dev nodemon

# Создать структуру
mkdir -p src/handlers src/utils scripts
touch src/{index,config,database,scheduler,messages}.js
touch src/handlers/{commands,callbacks,text}.js
touch src/utils/{validators,helpers}.js
touch scripts/init.js
```

**package.json конфигурация:**
```json
{
  "name": "sora-invite-bot",
  "version": "1.0.0",
  "type": "module",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "init": "node scripts/init.js"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

**Создать .env файл:**
```bash
# Telegram
TELEGRAM_BOT_TOKEN=your_token_from_botfather
ADMIN_TELEGRAM_ID=your_telegram_user_id
TELEGRAM_CHANNEL=@humanagentinteraction
SORA_USERNAME=@shipaleks

# Firebase
FIREBASE_PROJECT_ID=sora-invite-bot
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@sora-invite-bot.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour\nMultiline\nKey\n-----END PRIVATE KEY-----\n"

# App
NODE_ENV=development
PORT=3000

# Webhook (только для production)
WEBHOOK_DOMAIN=
```

### 1.4 Создать .gitignore

```
node_modules/
.env
firebase-credentials.json
*.log
.DS_Store
```

---

## Этап 2: Базовый код

### 2.1 src/config.js

```javascript
import dotenv from 'dotenv';
dotenv.config();

export default {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    adminId: parseInt(process.env.ADMIN_TELEGRAM_ID),
    channel: process.env.TELEGRAM_CHANNEL || '@humanagentinteraction',
    soraUsername: process.env.SORA_USERNAME || '@shipaleks'
  },
  
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  },
  
  rules: {
    first10CodesRequired: 3,      // Первые 10 возвращают 3 кода
    regularCodesRequired: 2,      // Остальные возвращают 2 кода
    deadlineHours: 48,            // Дедлайн для возврата
    reminderIntervals: [24, 40, 47] // Напоминания (часы после получения)
  },
  
  app: {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT) || 3000,
    webhookDomain: process.env.WEBHOOK_DOMAIN
  }
};
```

### 2.2 src/database.js

**Основные операции:**

```javascript
import admin from 'firebase-admin';
import config from './config.js';

// Инициализация
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: config.firebase.projectId,
    clientEmail: config.firebase.clientEmail,
    privateKey: config.firebase.privateKey
  })
});

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

export const DB = {
  // === USERS ===
  async getUser(telegramId) { /* ... */ },
  async createUser(telegramId, username) { /* ... */ },
  async updateUser(telegramId, updates) { /* ... */ },
  async getUsersWithStatus(status) { /* ... */ },
  async getAllUsers() { /* ... */ },
  
  // === QUEUE ===
  async addToQueue(telegramId) { /* ... */ },
  async getQueuePosition(telegramId) { /* ... */ },
  async getQueueSize() { /* ... */ },
  async getNextInQueue() { /* ... */ },
  async removeFromQueue(telegramId) { /* ... */ },
  async recalculateQueuePositions() { /* ... */ },
  
  // === INVITE POOL ===
  async addCodesToPool(codes, submittedBy) { /* ... */ },
  async getAvailableCode() { /* ... */ },
  async markCodeAsSent(codeId, sentTo) { /* ... */ },
  async getPoolSize() { /* ... */ },
  
  // === SETTINGS ===
  async getSystemSettings() { /* ... */ },
  async updateSystemSettings(updates) { /* ... */ },
  async incrementFirst10Count() { /* ... */ },
  async incrementTotalUsers() { /* ... */ }
};

export default DB;
```

### 2.3 src/messages.js

**Все тексты сообщений:**

```javascript
import config from './config.js';

export const MESSAGES = {
  welcome: `👋 Привет! Это бот для распределения инвайтов в Sora.

🎬 **Sora** — это новая AI-платформа от OpenAI для генерации видео.

⚠️ **Важно:** Для активации инвайта нужен американский VPN!`,

  rules: (codesRequired) => `📜 **Правила системы:**
...`,

  inviteSent: (code, codesRequired) => `🎉 **Поздравляю!**
...`,

  reminder: (hoursLeft, codesRequired) => `⏰ **Напоминание**
...`,
  
  // ... остальные сообщения
};
```

### 2.4 src/handlers/commands.js

```javascript
import DB from '../database.js';
import { MESSAGES } from '../messages.js';
import config from '../config.js';

export function registerCommands(bot) {
  // /start
  bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || 'anonymous';
    
    let user = await DB.getUser(userId);
    if (!user) {
      user = await DB.createUser(userId, username);
      await DB.incrementTotalUsers();
    }
    
    await ctx.reply(MESSAGES.welcome, {
      reply_markup: {
        inline_keyboard: [[
          { text: '🎫 Хочу инвайт', callback_data: 'want_invite' }
        ]]
      }
    });
  });

  // /stats
  bot.command('stats', async (ctx) => {
    const userId = ctx.from.id;
    const user = await DB.getUser(userId);
    
    if (!user) {
      return ctx.reply(MESSAGES.notInSystem);
    }
    
    const position = await DB.getQueuePosition(userId);
    const poolSize = await DB.getPoolSize();
    const queueSize = await DB.getQueueSize();
    
    await ctx.reply(
      MESSAGES.stats(position, poolSize, queueSize, user.codes_returned)
    );
  });
  
  // /help
  bot.command('help', async (ctx) => {
    await ctx.reply(MESSAGES.help);
  });
}
```

### 2.5 src/handlers/callbacks.js

```javascript
import DB from '../database.js';
import { MESSAGES } from '../messages.js';
import config from '../config.js';

export function registerCallbacks(bot) {
  // Хочу инвайт
  bot.action('want_invite', async (ctx) => {
    await ctx.answerCbQuery();
    
    const userId = ctx.from.id;
    const user = await DB.getUser(userId);
    
    if (!user) {
      return ctx.reply(MESSAGES.notInSystem);
    }
    
    // Проверка, не в очереди ли уже
    const position = await DB.getQueuePosition(userId);
    if (position && user.status === 'waiting') {
      return ctx.reply(MESSAGES.alreadyInQueue(position));
    }
    
    // Определяем сколько кодов потребуется
    const settings = await DB.getSystemSettings();
    const codesRequired = settings.first_10_count < 10 ? 
      config.rules.first10CodesRequired : 
      config.rules.regularCodesRequired;
    
    await ctx.reply(MESSAGES.rules(codesRequired), {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Понятно, согласен', callback_data: 'agree_rules' }],
          [{ text: '❌ Отказаться', callback_data: 'cancel' }]
        ]
      },
      parse_mode: 'Markdown'
    });
  });

  // Согласие с правилами
  bot.action('agree_rules', async (ctx) => {
    await ctx.answerCbQuery();
    
    const userId = ctx.from.id;
    const user = await DB.getUser(userId);
    
    if (!user) {
      return ctx.reply(MESSAGES.notInSystem);
    }
    
    await DB.addToQueue(userId);
    const position = await DB.getQueuePosition(userId);
    const poolSize = await DB.getPoolSize();
    
    await ctx.reply(MESSAGES.addedToQueue(position, poolSize));
    
    // Уведомление админу
    try {
      await bot.telegram.sendMessage(
        config.telegram.adminId,
        `➕ @${user.username} в очереди (позиция #${position})`
      );
    } catch (error) {
      console.error('Admin notification failed:', error.message);
    }
  });

  // Отправить коды
  bot.action('submit_codes', async (ctx) => {
    await ctx.answerCbQuery();
    
    const userId = ctx.from.id;
    const user = await DB.getUser(userId);
    
    if (!user || user.status !== 'received') {
      return ctx.reply('❌ Ты ещё не получил инвайт');
    }
    
    const settings = await DB.getSystemSettings();
    const codesRequired = /* определить количество */;
    
    await ctx.reply(MESSAGES.waitingForCodes(codesRequired), {
      parse_mode: 'Markdown'
    });
  });

  // Отказ
  bot.action('cancel', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('Хорошо, если передумаешь - нажми /start');
  });
}
```

### 2.6 src/handlers/text.js

```javascript
import DB from '../database.js';
import { MESSAGES } from '../messages.js';
import config from '../config.js';
import { validateInviteCode } from '../utils/validators.js';

export function registerTextHandlers(bot) {
  bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;
    
    // Админ команды
    if (userId === config.telegram.adminId) {
      if (text.startsWith('/addcodes ')) {
        return handleAdminAddCodes(ctx, text);
      }
      if (text === '/poolsize') {
        return handlePoolSize(ctx);
      }
      if (text === '/queuesize') {
        return handleQueueSize(ctx);
      }
    }
    
    // Обработка возврата кодов
    const user = await DB.getUser(userId);
    if (!user) {
      return ctx.reply(MESSAGES.notInSystem);
    }
    
    if (user.status === 'received') {
      return handleCodeSubmission(ctx, user);
    }
  });
}

async function handleCodeSubmission(ctx, user) {
  const text = ctx.message.text;
  const codes = text
    .split('\n')
    .map(c => c.trim())
    .filter(c => c.length >= 5); // Минимальная длина кода
  
  // Определить сколько кодов нужно
  const settings = await DB.getSystemSettings();
  const userIndex = /* определить индекс пользователя */;
  const codesRequired = userIndex <= 10 ? 
    config.rules.first10CodesRequired : 
    config.rules.regularCodesRequired;
  
  const neededCodes = codesRequired - user.codes_returned;
  
  if (codes.length < neededCodes) {
    return ctx.reply(
      `❌ Нужно ${neededCodes} ${pluralize(neededCodes, 'код', 'кода', 'кодов')}. ` +
      `Отправлено только ${codes.length}.`
    );
  }
  
  const codesToAdd = codes.slice(0, neededCodes);
  
  // Добавить в пул
  await DB.addCodesToPool(codesToAdd, user.id);
  
  const newTotal = user.codes_returned + codesToAdd.length;
  
  await DB.updateUser(user.id, {
    codes_returned: newTotal,
    codes_submitted: [...(user.codes_submitted || []), ...codesToAdd],
    status: newTotal >= codesRequired ? 'completed' : 'received'
  });
  
  if (newTotal >= codesRequired) {
    await ctx.reply(MESSAGES.codesReceived(newTotal), {
      parse_mode: 'Markdown'
    });
  } else {
    await ctx.reply(`✅ Принято ${codesToAdd.length}. Осталось: ${codesRequired - newTotal}`);
  }
}

async function handleAdminAddCodes(ctx, text) {
  const codes = text
    .replace('/addcodes ', '')
    .split(/\s+/)
    .filter(c => c.length > 0);
  
  await DB.addCodesToPool(codes, 'admin');
  return ctx.reply(`✅ Добавлено ${codes.length} кодов`);
}

async function handlePoolSize(ctx) {
  const size = await DB.getPoolSize();
  return ctx.reply(`💎 Кодов в пуле: ${size}`);
}

async function handleQueueSize(ctx) {
  const size = await DB.getQueueSize();
  return ctx.reply(`👥 В очереди: ${size}`);
}

function pluralize(n, one, few, many) {
  if (n % 10 === 1 && n % 100 !== 11) return one;
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return few;
  return many;
}
```

### 2.7 src/scheduler.js

```javascript
import cron from 'node-cron';
import DB from './database.js';
import { MESSAGES } from './messages.js';
import config from './config.js';

export function startSchedulers(bot) {
  startReminderScheduler(bot);
  startQueueProcessor(bot);
}

function startReminderScheduler(bot) {
  // Проверка каждый час
  cron.schedule('0 * * * *', async () => {
    console.log('[Scheduler] Checking reminders...');
    
    const usersWithInvites = await DB.getUsersWithStatus('received');
    
    for (const user of usersWithInvites) {
      if (!user.invite_sent_at) continue;
      
      const sentTime = user.invite_sent_at.toDate();
      const now = new Date();
      const hoursElapsed = (now - sentTime) / (1000 * 60 * 60);
      
      // Проверяем интервалы напоминаний
      for (let i = 0; i < config.rules.reminderIntervals.length; i++) {
        const targetHour = config.rules.reminderIntervals[i];
        
        // Если прошло нужное время и это напоминание ещё не отправлено
        if (Math.abs(hoursElapsed - targetHour) < 1 && 
            user.reminder_count <= i) {
          
          const hoursLeft = config.rules.deadlineHours - hoursElapsed;
          const codesRequired = /* определить */;
          
          const message = i === config.rules.reminderIntervals.length - 1 ?
            MESSAGES.finalWarning(codesRequired) :
            MESSAGES.reminder(Math.round(hoursLeft), codesRequired);
          
          try {
            await bot.telegram.sendMessage(user.id, message);
            
            await DB.updateUser(user.id, {
              reminder_count: i + 1,
              last_reminder: admin.firestore.FieldValue.serverTimestamp()
            });
            
            console.log(`[Reminder] Sent to ${user.username} (${hoursLeft.toFixed(1)}h left)`);
          } catch (error) {
            console.error(`[Reminder] Failed for ${user.id}:`, error.message);
          }
          
          break;
        }
      }
    }
  });
  
  console.log('[Scheduler] Reminder scheduler started');
}

function startQueueProcessor(bot) {
  // Проверка очереди каждые 5 минут
  cron.schedule('*/5 * * * *', async () => {
    console.log('[Scheduler] Processing queue...');
    
    const poolSize = await DB.getPoolSize();
    if (poolSize === 0) {
      console.log('[Scheduler] No codes available');
      return;
    }
    
    const nextUser = await DB.getNextInQueue();
    if (!nextUser) {
      console.log('[Scheduler] Queue is empty');
      return;
    }
    
    const availableCode = await DB.getAvailableCode();
    if (!availableCode) {
      console.log('[Scheduler] No available codes');
      return;
    }
    
    // Отправить инвайт
    await processNextInvite(bot, nextUser.id, availableCode);
  });
  
  console.log('[Scheduler] Queue processor started');
}

async function processNextInvite(bot, userId, codeObj) {
  const user = await DB.getUser(userId);
  if (!user) return;
  
  const count = await DB.incrementFirst10Count();
  const codesRequired = count <= 10 ? 
    config.rules.first10CodesRequired : 
    config.rules.regularCodesRequired;
  
  await DB.updateUser(userId, {
    status: 'received',
    invite_sent_at: admin.firestore.FieldValue.serverTimestamp(),
    invite_code_given: codeObj.code
  });
  
  await DB.markCodeAsSent(codeObj.id, userId);
  await DB.removeFromQueue(userId);
  
  try {
    await bot.telegram.sendMessage(
      userId,
      MESSAGES.inviteSent(codeObj.code, codesRequired),
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '📨 Отправить коды', callback_data: 'submit_codes' }
          ]]
        }
      }
    );
    
    console.log(`[Queue] Sent invite to @${user.username}`);
    
    // Уведомить админа
    await bot.telegram.sendMessage(
      config.telegram.adminId,
      `✅ Инвайт отправлен: @${user.username}`
    );
  } catch (error) {
    console.error(`[Queue] Failed to send to ${userId}:`, error.message);
  }
}
```

### 2.8 src/index.js

```javascript
import { Telegraf } from 'telegraf';
import config from './config.js';
import { registerCommands } from './handlers/commands.js';
import { registerCallbacks } from './handlers/callbacks.js';
import { registerTextHandlers } from './handlers/text.js';
import { startSchedulers } from './scheduler.js';

const bot = new Telegraf(config.telegram.token);

// Регистрируем обработчики
registerCommands(bot);
registerCallbacks(bot);
registerTextHandlers(bot);

// Запускаем планировщики
startSchedulers(bot);

// Запуск бота
if (config.app.nodeEnv === 'production' && config.app.webhookDomain) {
  // Production - Webhook
  const webhookUrl = `https://${config.app.webhookDomain}/webhook`;
  
  bot.telegram.setWebhook(webhookUrl);
  bot.startWebhook('/webhook', null, config.app.port);
  
  console.log(`✅ Bot started with webhook: ${webhookUrl}`);
} else {
  // Development - Polling
  bot.launch();
  console.log('✅ Bot started with polling (development mode)');
}

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

console.log(`
╔═══════════════════════════════════════╗
║   Sora Invite Bot v1.0.0              ║
║   Environment: ${config.app.nodeEnv.padEnd(23)} ║
║   Status: Running ✓                   ║
╚═══════════════════════════════════════╝
`);
```

---

## Этап 3: Тестирование

### 3.1 Локальное тестирование

```bash
# Запустить в dev режиме
npm run dev

# Протестировать:
# 1. /start - регистрация
# 2. Кнопка "Хочу инвайт"
# 3. Согласие с правилами
# 4. Проверка очереди /stats
```

### 3.2 Инициализация с начальными кодами

```bash
# scripts/init.js
import DB from '../src/database.js';

const initialCodes = [
  'YOUR_FIRST_CODE',
  'YOUR_SECOND_CODE'
];

await DB.addCodesToPool(initialCodes, 'system');
console.log('✅ Initialized with 2 codes');
process.exit(0);

# Запустить
npm run init
```

---

## Этап 4: Деплой на Koyeb

### 4.1 Подготовка репозитория

```bash
git init
git add .
git commit -m "Initial commit: Sora Invite Bot"

# Создать репо на GitHub
# Залить код
git remote add origin <your-repo-url>
git push -u origin main
```

### 4.2 Настройка Koyeb

1. Зарегистрироваться на https://koyeb.com
2. Создать новое приложение
3. Выбрать GitHub репозиторий
4. Настроить билд:
   - Build command: `npm install`
   - Run command: `npm start`
   - Port: 3000

### 4.3 Переменные окружения

В Koyeb Dashboard → Settings → Environment Variables добавить:

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

### 4.4 Установка webhook

После деплоя получить домен (например: `my-bot.koyeb.app`)

```bash
curl -X POST https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook \
  -d "url=https://my-bot.koyeb.app/webhook"
```

---

## Этап 5: Мониторинг и поддержка

### 5.1 Логирование

```javascript
// Добавить в код
console.log('[INFO] User registered:', userId);
console.error('[ERROR] Database error:', error);
console.warn('[WARN] Queue is empty');
```

### 5.2 Метрики для отслеживания

- Количество пользователей в очереди
- Размер пула инвайтов
- % возврата кодов
- Среднее время ожидания

### 5.3 Алерты админу

```javascript
// При критических событиях
if (poolSize === 0 && queueSize > 10) {
  await bot.telegram.sendMessage(
    config.telegram.adminId,
    '🚨 Пул пустой, но в очереди 10+ человек!'
  );
}
```

---

## Чеклист запуска

### Pre-launch
- [ ] Telegram бот создан
- [ ] Firebase настроен
- [ ] Локальное тестирование пройдено
- [ ] 2 начальных инвайта готовы
- [ ] Админ ID корректный

### Launch
- [ ] Код задеплоен на Koyeb
- [ ] Webhook установлен
- [ ] Начальные коды добавлены
- [ ] Бот отвечает на команды
- [ ] Очередь обрабатывается
- [ ] Напоминания работают

### Post-launch
- [ ] Мониторинг логов
- [ ] Отслеживание метрик
- [ ] Сбор фидбека от первых пользователей
- [ ] Оптимизация текстов сообщений

---

## Timeline оценка

| Этап | Время | Описание |
|------|-------|----------|
| Настройка окружения | 1 час | Telegram, Firebase, локальная настройка |
| Базовый код | 4 часа | Commands, callbacks, database |
| Scheduler | 2 часа | Очередь и напоминания |
| Тестирование | 2 часа | Локальная проверка всех флоу |
| Деплой | 1 час | Koyeb настройка и webhook |
| **Итого** | **10 часов** | От нуля до production |

---

## Troubleshooting

### Проблема: Бот не отвечает
- Проверить webhook: `curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo`
- Проверить логи в Koyeb
- Проверить переменные окружения

### Проблема: Firebase ошибки
- Проверить правильность private_key (с \n)
- Проверить permissions Service Account
- Проверить quotas в Firebase

### Проблема: Cron не работает
- Убедиться что приложение не "засыпает" (Koyeb keep-alive)
- Проверить timezone сервера
- Добавить логирование в cron задачи

---

## Следующие шаги

После успешного запуска:
1. Собрать статистику за первую неделю
2. Оптимизировать тексты на основе feedback
3. Добавить расширенную аналитику
4. Рассмотреть масштабирование при росте

---

## Заключение

Этот план обеспечивает пошаговую реализацию бота с минимальной сложностью и максимальной надежностью. Следуя этому плану, можно запустить рабочую систему за один день разработки.