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

2️⃣ После регистрации у тебя появится **1 инвайт-код на 4 использования**

3️⃣ **Ты отправляешь этот код 1 раз** обратно в бот (помогаешь другим)

4️⃣ Оставшиеся 3 использования оставляешь себе для друзей

⚠️ **Важно:** У тебя не 4 разных кода, а 1 код который можно использовать 4 раза!

⏰ Срок возврата: **48 часов** после получения инвайта

💡 Это система взаимопомощи — чем больше людей возвращают коды, тем быстрее растет очередь!

Согласен с условиями?`,

    inviteSent: (code, codesRequired) => `🎉 **Поздравляю! Твой инвайт-код:**

\`${code}\`

📝 **Инструкция:**
1. Подключи американский VPN 🇺🇸
2. Перейди на sora.com и зарегистрируйся
3. После регистрации у тебя появится **1 инвайт-код на 4 использования**

⚠️ **ВАЖНО понять:**
• У тебя будет **ОДИН код**, который можно использовать **4 раза**
• Это НЕ 4 разных кода!
• Счётчик "3/4 invites" показывает сколько использований осталось

**Как вернуть код в бот:**
• **Веб:** Три точки (⋮) → Invite Friends → Copy code (6 символов)
• **Приложение:** "4 invites" → Share invite → Copy

**Что нужно сделать:**
• Отправь этот код **1 раз** обратно в бот
• Оставшиеся 3 использования оставь себе для друзей

⏰ **Дедлайн: 48 часов**

🔔 Бот напомнит через 12 часов если не отправишь

📨 Когда зарегистрируешься и увидишь код — сразу отправь его сюда 👇

💝 Опционально (но буду рад):
• Подпишись на ${config.telegram.channel}
• Подпишись на ${config.telegram.soraUsername} в Sora`,

    waitingForCodes: (codesRequired, codesReturned) => {
      if (codesReturned > 0) {
        return `✅ **Спасибо! Ты уже вернул код!**

Больше ничего отправлять не нужно.

Оставшиеся использования кода оставь себе для друзей! 🎉`;
      }
      
      return `📨 **Отправка кода**

⚠️ **ВАЖНО понять:**
• У тебя в Sora **ОДИН код** на 4 использования (не 4 разных кода!)
• Ты можешь выбрать **сколькими использованиями** поделиться: 1, 2, 3 или все 4

**Для веба (основной способ):**
1. Правый нижний угол → три точки (⋮)
2. Invite Friends
3. Copy code (код из 6 знаков)
4. Вставь сюда и отправь

**Для мобильного приложения:**
1. "4 invites" в левом верхнем углу
2. Share invite
3. Copy (скопируется всё сообщение)
4. Вставь сюда — бот сам найдёт код

**Отправь код сейчас:**`;
    },

    chooseUsageCount: (code) => `✅ **Код принят:** \`${code}\`

Сколькими использованиями этого кода ты готов поделиться?

💡 **Объяснение:**
• Код можно использовать 4 раза
• Каждое использование = 1 человек сможет зарегистрироваться
• Остаток останется у тебя для друзей

Выбери количество:`,

    codesReceived: (totalCodes) => `✅ **Спасибо! Код принят!**

🙏 Благодаря тебе до 2 человек смогут получить доступ к Sora!

💡 **Что дальше:**
• Твой код будут использовать максимум 2 раза
• У тебя останется ещё 2 использования для друзей
• С тебя больше ничего не требуется ✨

💝 Если еще не сделал, подпишись на:
• ${config.telegram.channel}
• ${config.telegram.soraUsername} в Sora

Удачи в создании видео! 🎬`,

    reminder: (hoursLeft, codesRequired, codesReturned) => {
      const remaining = codesRequired - codesReturned;
      
      if (codesReturned > 0) {
        return null; // Не отправляем напоминание если уже вернул
      }
      
      return `⏰ **Дружеское напоминание**

Ты получил инвайт в Sora ${48 - hoursLeft} часов назад.

Не забудь отправить свой инвайт-код обратно в бот!

⚠️ **Помни:** У тебя в Sora **1 код на 4 использования**. Отправь его 1 раз — остальные 3 использования оставь себе.

⏱️ Осталось времени: **~${hoursLeft} часов**

📨 Чтобы отправить код, нажми /start и выбери "Отправить коды"`;
    },

    finalWarning: (codesRequired, codesReturned) => {
      if (codesReturned > 0) {
        return null; // Не отправляем если уже вернул
      }
      
      return `⚠️ **Последнее напоминание**

Ты ещё не вернул свой инвайт-код!

Отправь код 1 раз — это займёт 10 секунд.

Другие участники очереди надеются на твою помощь 🙏

Система работает на доверии — давай поддержим друг друга!

📨 Отправь код: /start → "Отправить коды"`;
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
      ? `💝 **Donate Invite Codes**

Thank you for helping the community! 🙏

**How to get codes from Sora:**
• **Web:** Three dots (⋮) → Invite Friends → Copy code
• **App:** "4 invites" → Share invite → Copy

Send codes you want to donate (each on a new line or all at once).

Your donation will help others get access to Sora faster!`
      : `💝 **Пожертвовать инвайт-коды**

Спасибо, что помогаешь сообществу! 🙏

**Как получить коды из Sora:**
• **Веб:** Три точки (⋮) → Invite Friends → Copy code
• **Приложение:** "4 invites" → Share invite → Copy

Отправь коды, которые хочешь пожертвовать (каждый с новой строки или все сразу).

Твоё пожертвование поможет другим быстрее получить доступ к Sora!`,

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

    rules: (codesRequired) => `📜 **System Rules:**

1️⃣ You will receive 1 invite code to register on sora.com

2️⃣ After registration, you'll get **1 invite code with 4 uses**

3️⃣ **You send this code 1 time** back to the bot (helping others)

4️⃣ Keep the remaining 3 uses for your friends

⚠️ **Important:** You don't get 4 different codes, just 1 code that can be used 4 times!

⏰ Return deadline: **48 hours** after receiving the invite

💡 This is a mutual help system — the more people return codes, the faster the queue grows!

Do you agree with the terms?`,

    inviteSent: (code, codesRequired) => `🎉 **Congratulations! Your invite code:**

\`${code}\`

📝 **Instructions:**
1. Connect to a US VPN 🇺🇸
2. Go to sora.com and register
3. After registration, you'll get **1 invite code with 4 uses**

⚠️ **IMPORTANT to understand:**
• You'll have **ONE code** that can be used **4 times**
• This is NOT 4 different codes!
• Counter "3/4 invites" shows how many uses remain

**How to return the code to bot:**
• **Web:** Three dots (⋮) → Invite Friends → Copy code (6 chars)
• **App:** "4 invites" → Share invite → Copy

**What you need to do:**
• Send this code **1 time** back to the bot
• Keep the remaining 3 uses for your friends

⏰ **Deadline: 48 hours**

🔔 Bot will remind you in 12 hours if you don't send

📨 When you register and see the code — send it here right away 👇

💝 Optional (but appreciated):
• Subscribe to ${config.telegram.channel}
• Follow ${config.telegram.soraUsername} on Sora`,

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

    chooseUsageCount: (code) => `✅ **Code accepted:** \`${code}\`

How many uses of this code are you willing to share?

💡 **Explanation:**
• Code can be used 4 times
• Each use = 1 person can register
• Remainder stays with you for friends

Choose quantity:`
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
