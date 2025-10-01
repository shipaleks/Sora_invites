import config from './config.js';

// Мультиязычные сообщения
const MESSAGES = {
  ru: {
    languageSelect: `Привет! Выбери язык / Choose language:`,
    
    welcome: `👋 Привет! Это бот для распределения инвайтов в Sora.

🎬 **Sora** — это новая AI-платформа от OpenAI для генерации видео.

⚠️ **Важно:** Для активации инвайта нужен американский VPN!

Нажми на кнопку ниже, чтобы получить инвайт 👇`,

    rules: (codesRequired) => `📜 **Правила:**

1️⃣ Получаешь инвайт-код → регистрируешься на sora.com

2️⃣ В Sora у тебя будет **1 код на 4 использования**

3️⃣ Возвращаешь этот код в бот → выбираешь сколькими использованиями поделиться (1-4)

4️⃣ Остаток оставляешь себе

💡 Система взаимопомощи — каждый делится сколько может!

Согласен?`,

    inviteSent: (code, codesRequired) => `🎉 **Твой инвайт:**

\`${code}\`

**Что делать:**
1. Включи VPN 🇺🇸
2. Зарегистрируйся на sora.com
3. В Sora появится твой код (один, на 4 использования)
4. Скопируй его и отправь сюда

**Где найти код в Sora:**
→ Веб: правый угол ⋮ → Invite Friends
→ Приложение: "4 invites" → Share

📨 Вернёшься и отправишь код → выберешь сколькими использованиями поделиться (я рекомендую 2).

⏰ Дедлайн: 48 часов

💝 Подпишись: ${config.telegram.channel} / ${config.telegram.soraUsername}`,

    waitingForCodes: (codesRequired, codesReturned) => {
      if (codesReturned > 0) {
        return `✅ Спасибо! Больше ничего не нужно 🎉`;
      }
      
      return `📨 **Отправь свой код из Sora**

**Где взять:**
→ Веб: ⋮ → Invite Friends → Copy
→ Приложение: "4 invites" → Share → Copy

Отправь код → выберешь сколько использований поделиться (1-4).`;
    },

    chooseUsageCount: (code) => `✅ Код: \`${code}\`

**Сколько человек пригласить через бот?**

Код работает 4 раза. Остаток останется тебе.

Выбери:`,

    codesReceived: (totalCodes) => `✅ Готово!

С тебя больше ничего не требуется ✨

💝 Подпишись: ${config.telegram.channel}`,

    reminder: (hoursLeft, codesRequired, codesReturned) => {
      if (codesReturned > 0) {
        return null;
      }
      
      return `⏰ Напоминание

Не забудь вернуть код из Sora!

/start → "Отправить коды"

⏱️ Осталось: ~${hoursLeft}ч`;
    },

    finalWarning: (codesRequired, codesReturned) => {
      if (codesReturned > 0) {
        return null;
      }
      
      return `⚠️ Последнее напоминание

Верни код из Sora в бот 🙏

/start → "Отправить коды"

Другие ждут!`;
    },

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

\`/addcodes КОД [КОЛИЧЕСТВО]\` - Добавить код (1-4 использования)
  Пример: \`/addcodes ABC123 2\` - 2 использования
\`/removecode КОД\` - Удалить код из пула
\`/clearpool\` - Очистить весь пул
\`/clearqueue\` - Очистить очередь
\`/finduser ID\` - Найти пользователя
\`/poolsize\` - Размер пула
\`/queuesize\` - Размер очереди
\`/broadcast текст\` - Рассылка всем
\`/stats\` - Статистика системы`,

    buttons: {
      wantInvite: '🎫 Хочу инвайт',
      agree: '✅ Понятно, согласен',
      cancel: '❌ Отказаться',
      submitCodes: '📨 Отправить коды',
      donateCodes: '💝 Пожертвовать коды',
      returnUnused: '↩️ Вернуть неиспользованный инвайт',
      russian: '🇷🇺 Русский',
      english: '🇬🇧 English',
      usage1: '1 человек (оставлю 3 себе)',
      usage2: '2 человека (оставлю 2 себе)',
      usage3: '3 человека (оставлю 1 себе)',
      usage4: '4 человека (отдам всё)'
    },

    donateCodesPrompt: (language) => language === 'en' 
      ? `💝 **Donate Code**

**Where to find code:**
→ Web: ⋮ → Invite Friends
→ App: "4 invites" → Share

Send code → choose how many uses to share.

Thanks! 🙏`
      : `💝 **Пожертвовать код**

**Где взять код:**
→ Веб: ⋮ → Invite Friends
→ Приложение: "4 invites" → Share

Отправь код → выберешь сколько использований поделиться.

Спасибо! 🙏`,

    donationReceived: (count, language) => language === 'en'
      ? `✅ **Thank you!**

${count} code${count > 1 ? 's' : ''} successfully added to the pool!

Thanks to you, someone will get access to Sora! 🎉`
      : `✅ **Спасибо!**

${count} ${pluralizeRu(count, 'код', 'кода', 'кодов')} успешно ${count === 1 ? 'добавлен' : 'добавлены'} в пул!

Благодаря тебе кто-то получит доступ к Sora! 🎉`,

    returnUnusedPrompt: (language) => language === 'en'
      ? `↩️ **Return Unused Invite**

Did you get an invite from another source and don't need this one?

You can return your unused invite code back to the pool.

Send the invite code you received from this bot.

✨ You won't be required to return any codes after this — we understand you didn't use our invite!`
      : `↩️ **Вернуть неиспользованный инвайт**

Получил инвайт из другого источника и этот не нужен?

Можешь вернуть свой неиспользованный инвайт-код обратно в пул.

Отправь инвайт-код, который получил от этого бота.

✨ С тебя больше ничего не потребуется — мы понимаем, что ты не воспользовался нашим инвайтом!`,

    unusedReturned: (code, language) => language === 'en'
      ? `✅ **Thank you for your honesty!**

Your unused invite code has been returned to the pool.

Code: \`${code}\`

Someone else will be able to use it now! 🎉

You're free from any obligations. Thanks for being fair! 💚`
      : `✅ **Спасибо за честность!**

Твой неиспользованный инвайт-код возвращён в пул.

Код: \`${code}\`

Теперь его сможет использовать кто-то другой! 🎉

С тебя больше ничего не требуется. Спасибо за честность! 💚`,

    ownCodeDetected: (code, language) => language === 'en'
      ? `⚠️ **You're trying to return your own invite code**

Your code: \`${code}\`

**Did you want to:**
• Return your UNUSED invite? (got invite elsewhere) ↩️
• Or return codes from Sora after registration? 📨

If you didn't use this invite — click the button below.
If you registered in Sora — send codes that Sora gave YOU (not this code).`
      : `⚠️ **Ты пытаешься вернуть свой собственный инвайт-код**

Твой код: \`${code}\`

**Ты хотел:**
• Вернуть НЕИСПОЛЬЗОВАННЫЙ инвайт? (получил инвайт в другом месте) ↩️
• Или вернуть коды от Sora после регистрации? 📨

Если ты не использовал этот инвайт — нажми кнопку ниже.
Если ты зарегистрировался в Sora — отправь коды, которые выдала ТЕБЕ Sora (не этот код).`
  },

  en: {
    languageSelect: `Hi! Choose language / Привет! Выбери язык:`,
    
    welcome: `👋 Hi! This is a bot for distributing Sora invites.

🎬 **Sora** is OpenAI's new AI platform for video generation.

⚠️ **Important:** You need a US VPN to activate the invite!

Click the button below to get an invite 👇`,

    rules: (codesRequired) => `📜 **Rules:**

1️⃣ Get invite → register on sora.com

2️⃣ In Sora you'll have **1 code with 4 uses**

3️⃣ Return code to bot → choose how many uses to share (1-4)

4️⃣ Keep the rest

💡 Mutual help system — everyone shares what they can!

Agree?`,

    inviteSent: (code, codesRequired) => `🎉 **Your invite:**

\`${code}\`

**What to do:**
1. Enable VPN 🇺🇸
2. Register on sora.com
3. In Sora you'll get your code (one, 4 uses)
4. Copy it and send here

**Where to find code in Sora:**
→ Web: corner ⋮ → Invite Friends
→ App: "4 invites" → Share

📨 Come back, send code → choose how many uses to share (I recommend 2).

⏰ Deadline: 48h

💝 Subscribe: ${config.telegram.channel} / ${config.telegram.soraUsername}`,

    waitingForCodes: (codesRequired) => `📨 **Sending Codes**

Send me **${codesRequired} invite code${codesRequired > 1 ? 's' : ''}** from Sora.

**For web (main method):**
1. Bottom right corner → three dots (⋮)
2. Invite Friends
3. Copy code (6 characters)
4. Paste here and send

**For mobile app:**
1. "4 invites" in top left corner
2. Share invite
3. Copy (entire message will be copied)
4. Paste here — bot will extract the code

Send ${codesRequired} code${codesRequired > 1 ? 's' : ''}, each on a new line or all at once.`,

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
\`/removecode CODE\` - Remove code from pool
\`/poolsize\` - Pool size
\`/queuesize\` - Queue size
\`/broadcast text\` - Broadcast to all users
\`/stats\` - System statistics`,

    buttons: {
      wantInvite: '🎫 Want Invite',
      agree: '✅ I Agree',
      cancel: '❌ Cancel',
      submitCodes: '📨 Submit Codes',
      donateCodes: '💝 Donate Codes',
      returnUnused: '↩️ Return Unused Invite',
      russian: '🇷🇺 Русский',
      english: '🇬🇧 English',
      usage1: '1 person (keep 3 for me)',
      usage2: '2 people (keep 2 for me)',
      usage3: '3 people (keep 1 for me)',
      usage4: '4 people (give all)'
    },

    chooseUsageCount: (code) => `✅ Code: \`${code}\`

**How many people to invite through bot?**

Code works 4 times. Rest stays with you.

Choose:`
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
