import config from './config.js';

// Мультиязычные сообщения
const MESSAGES = {
  ru: {
    languageSelect: `Привет! Выбери язык / Choose language:`,
    
    welcome: `👋 Привет! Это бот для распределения инвайтов в Sora.

🎬 **Sora** — это новая AI-платформа от OpenAI для генерации видео.

⚠️ **Важно:** Для активации инвайта нужен американский VPN!

Нажми на кнопку ниже, чтобы получить инвайт 👇`,

    rules: (codesRequired) => `📜 **Правила системы:**

1️⃣ Ты получишь 1 инвайт-код для регистрации на sora.com

2️⃣ После регистрации у тебя появится 4 собственных инвайт-кода

3️⃣ **Ты возвращаешь ${codesRequired} кода** обратно в бот (помогаешь другим)

4️⃣ Оставшиеся ${4 - codesRequired} кода оставляешь себе для друзей

⏰ Срок возврата: **48 часов** после получения инвайта

💡 Это система взаимопомощи — чем больше людей возвращают коды, тем быстрее растет очередь!

Согласен с условиями?`,

    inviteSent: (code, codesRequired) => `🎉 **Поздравляю! Твой инвайт-код:**

\`${code}\`

📝 **Инструкция:**
1. Подключи американский VPN 🇺🇸
2. Перейди на sora.com и зарегистрируйся
3. После регистрации у тебя появится 4 инвайт-кода
4. Вернись сюда и отправь **${codesRequired} кода** обратно

⏰ У тебя есть **48 часов** на возврат кодов

🔔 Бот напомнит о возврате через 24 часа

📨 Когда коды будут готовы — нажми кнопку ниже 👇

💝 Опционально (но буду рад):
• Подпишись на ${config.telegram.channel}
• Подпишись на ${config.telegram.soraUsername} в Sora`,

    waitingForCodes: (codesRequired) => `📨 **Отправка кодов**

Отправь мне **${codesRequired} инвайт-кода** текстом.

Формат: каждый код с новой строки
\`\`\`
код1
код2${codesRequired === 3 ? '\nкод3' : ''}
\`\`\`

Просто скопируй коды из Sora и отправь их мне.`,

    codesReceived: (totalCodes) => `✅ **Спасибо! Коды приняты!**

Ты вернул ${totalCodes} ${pluralizeRu(totalCodes, 'код', 'кода', 'кодов')}.

🙏 Благодаря тебе система продолжает работать и помогать другим!

💝 Если еще не сделал, подпишись на:
• ${config.telegram.channel}
• ${config.telegram.soraUsername} в Sora

Удачи в создании видео! 🎬`,

    reminder: (hoursLeft, codesRequired) => `⏰ **Дружеское напоминание**

Ты получил инвайт в Sora ${48 - hoursLeft} часов назад.

Не забудь вернуть **${codesRequired} кода** в бот — другие участники тоже ждут!

⏱️ Осталось: **~${hoursLeft} часов**

📨 Чтобы отправить коды, нажми /start и выбери "Отправить коды"`,

    finalWarning: (codesRequired) => `⚠️ **Последнее напоминание**

У тебя остался ~1 час чтобы вернуть **${codesRequired} кода**.

Это не обязательно, но другие участники очереди надеются на твою помощь 🙏

Система работает на доверии — давай поддержим друг друга!

📨 Отправь коды: /start → "Отправить коды"`,

    addedToQueue: (position, poolSize) => `✅ **Ты добавлен в очередь!**

📊 Твоя позиция: **#${position}**
💎 Кодов в пуле: **${poolSize}**

${poolSize > 0 
  ? `🚀 Твоя очередь подойдет скоро! Как только освободится код, я сразу тебе отправлю.` 
  : `⏳ Пул пока пуст, но скоро появятся новые коды от участников.`}

📊 Проверить статус: /stats`,

    stats: (position, poolSize, queueSize, codesReturned) => {
      let statusText = '';
      
      if (position) {
        statusText = `📍 **Твоя позиция в очереди:** #${position}\n`;
      } else if (codesReturned > 0) {
        statusText = `✅ **Статус:** Ты вернул ${codesReturned} ${pluralizeRu(codesReturned, 'код', 'кода', 'кодов')}\n`;
      } else {
        statusText = `📊 **Статус:** Участник системы\n`;
      }

      return `📊 **Статистика**

${statusText}
💎 Кодов в пуле: **${poolSize}**
👥 Человек в очереди: **${queueSize}**

${poolSize > queueSize 
  ? '🟢 Система здорова — кодов достаточно!' 
  : '🟡 Ждем возврата кодов от участников'}`;
    },

    alreadyInQueue: (position) => `ℹ️ Ты уже в очереди на позиции **#${position}**

Как только подойдет твоя очередь, я сразу отправлю инвайт!

📊 Проверить статус: /stats`,

    notInSystem: `❌ Ты еще не зарегистрирован.

Нажми /start чтобы начать!`,

    help: `ℹ️ **Справка**

**Команды:**
/start - Начать работу с ботом
/stats - Показать статистику
/help - Эта справка
/language - Сменить язык

**Как это работает:**
1. Запрашиваешь инвайт
2. Получаешь код для Sora
3. Регистрируешься на sora.com (с VPN 🇺🇸)
4. Возвращаешь часть своих кодов в бот
5. Помогаешь другим получить доступ!

**Вопросы?**
Пиши в ${config.telegram.channel}`,

    adminHelp: `🔧 **Админ команды:**

\`/addcodes код1 код2 код3\` - Добавить коды вручную
\`/poolsize\` - Размер пула
\`/queuesize\` - Размер очереди
\`/broadcast текст\` - Рассылка всем пользователям
\`/stats\` - Статистика системы`,

    buttons: {
      wantInvite: '🎫 Хочу инвайт',
      agree: '✅ Понятно, согласен',
      cancel: '❌ Отказаться',
      submitCodes: '📨 Отправить коды',
      russian: '🇷🇺 Русский',
      english: '🇬🇧 English'
    }
  },

  en: {
    languageSelect: `Hi! Choose language / Привет! Выбери язык:`,
    
    welcome: `👋 Hi! This is a bot for distributing Sora invites.

🎬 **Sora** is OpenAI's new AI platform for video generation.

⚠️ **Important:** You need a US VPN to activate the invite!

Click the button below to get an invite 👇`,

    rules: (codesRequired) => `📜 **System Rules:**

1️⃣ You will receive 1 invite code to register on sora.com

2️⃣ After registration, you'll get 4 invite codes of your own

3️⃣ **You return ${codesRequired} codes** back to the bot (helping others)

4️⃣ Keep the remaining ${4 - codesRequired} code${4 - codesRequired > 1 ? 's' : ''} for your friends

⏰ Return deadline: **48 hours** after receiving the invite

💡 This is a mutual help system — the more people return codes, the faster the queue grows!

Do you agree with the terms?`,

    inviteSent: (code, codesRequired) => `🎉 **Congratulations! Your invite code:**

\`${code}\`

📝 **Instructions:**
1. Connect to a US VPN 🇺🇸
2. Go to sora.com and register
3. After registration, you'll receive 4 invite codes
4. Come back here and send **${codesRequired} codes** back

⏰ You have **48 hours** to return the codes

🔔 The bot will remind you in 24 hours

📨 When codes are ready — click the button below 👇

💝 Optional (but appreciated):
• Subscribe to ${config.telegram.channel}
• Follow ${config.telegram.soraUsername} on Sora`,

    waitingForCodes: (codesRequired) => `📨 **Sending Codes**

Send me **${codesRequired} invite code${codesRequired > 1 ? 's' : ''}** as text.

Format: each code on a new line
\`\`\`
code1
code2${codesRequired === 3 ? '\ncode3' : ''}
\`\`\`

Just copy the codes from Sora and send them to me.`,

    codesReceived: (totalCodes) => `✅ **Thank you! Codes accepted!**

You've returned ${totalCodes} code${totalCodes > 1 ? 's' : ''}.

🙏 Thanks to you, the system keeps working and helping others!

💝 If you haven't already, subscribe to:
• ${config.telegram.channel}
• ${config.telegram.soraUsername} on Sora

Good luck creating videos! 🎬`,

    reminder: (hoursLeft, codesRequired) => `⏰ **Friendly Reminder**

You received your Sora invite ${48 - hoursLeft} hours ago.

Don't forget to return **${codesRequired} code${codesRequired > 1 ? 's' : ''}** to the bot — other participants are waiting too!

⏱️ Time remaining: **~${hoursLeft} hours**

📨 To send codes, click /start and select "Submit Codes"`,

    finalWarning: (codesRequired) => `⚠️ **Final Reminder**

You have ~1 hour left to return **${codesRequired} code${codesRequired > 1 ? 's' : ''}**.

It's not mandatory, but other queue participants are hoping for your help 🙏

The system works on trust — let's support each other!

📨 Send codes: /start → "Submit Codes"`,

    addedToQueue: (position, poolSize) => `✅ **You've been added to the queue!**

📊 Your position: **#${position}**
💎 Codes in pool: **${poolSize}**

${poolSize > 0 
  ? `🚀 Your turn will come soon! As soon as a code becomes available, I'll send it to you right away.` 
  : `⏳ The pool is empty for now, but new codes from participants will appear soon.`}

📊 Check status: /stats`,

    stats: (position, poolSize, queueSize, codesReturned) => {
      let statusText = '';
      
      if (position) {
        statusText = `📍 **Your queue position:** #${position}\n`;
      } else if (codesReturned > 0) {
        statusText = `✅ **Status:** You've returned ${codesReturned} code${codesReturned > 1 ? 's' : ''}\n`;
      } else {
        statusText = `📊 **Status:** System participant\n`;
      }

      return `📊 **Statistics**

${statusText}
💎 Codes in pool: **${poolSize}**
👥 People in queue: **${queueSize}**

${poolSize > queueSize 
  ? '🟢 System is healthy — enough codes!' 
  : '🟡 Waiting for codes from participants'}`;
    },

    alreadyInQueue: (position) => `ℹ️ You're already in queue at position **#${position}**

As soon as it's your turn, I'll send you the invite!

📊 Check status: /stats`,

    notInSystem: `❌ You're not registered yet.

Click /start to begin!`,

    help: `ℹ️ **Help**

**Commands:**
/start - Start working with the bot
/stats - Show statistics
/help - This help
/language - Change language

**How it works:**
1. Request an invite
2. Receive a code for Sora
3. Register on sora.com (with VPN 🇺🇸)
4. Return some of your codes to the bot
5. Help others get access!

**Questions?**
Write to ${config.telegram.channel}`,

    adminHelp: `🔧 **Admin Commands:**

\`/addcodes code1 code2 code3\` - Add codes manually
\`/poolsize\` - Pool size
\`/queuesize\` - Queue size
\`/broadcast text\` - Broadcast to all users
\`/stats\` - System statistics`,

    buttons: {
      wantInvite: '🎫 Want Invite',
      agree: '✅ I Agree',
      cancel: '❌ Cancel',
      submitCodes: '📨 Submit Codes',
      russian: '🇷🇺 Русский',
      english: '🇬🇧 English'
    }
  }
};

function pluralizeRu(n, one, few, many) {
  if (n % 10 === 1 && n % 100 !== 11) return one;
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return few;
  return many;
}

export function getMessages(language = 'ru') {
  return MESSAGES[language] || MESSAGES.ru;
}

export default MESSAGES;
