import config from './config.js';

// Мультиязычные сообщения
const MESSAGES = {
  ru: {
    languageSelect: `Привет! Выбери язык / Choose language:`,
    
    welcome: `👋 Привет! Это бот для распределения инвайтов в Sora.

🎬 **Sora** — это новая AI-платформа от OpenAI для генерации видео.

⚠️ **Важно:** Для активации инвайта нужен американский VPN!

💡 **Новинка:** Генерация видео прямо в боте — доступна Pro версия (обычно $100/мес)!

Выбери действие 👇`,

    rules: (codesRequired) => `📜 **Правила:**

1️⃣ Получаешь инвайт-код → регистрируешься на sora.com

2️⃣ В Sora у тебя будет **1 код на 4 использования**

3️⃣ Возвращаешь этот код в бот → выбираешь сколькими использованиями поделиться (1-4)

4️⃣ Остаток оставляешь себе

💡 Система взаимопомощи — каждый делится сколько может!

Согласен?`,

    inviteSent: (code, codesRequired) => `🎉 **Твой инвайт:**

\`${code}\`

⚠️ **ВАЖНО: используй этот код ТОЛЬКО 1 РАЗ для регистрации!**

Если ты используешь его несколько раз (для себя и друзей), то не вернёшь достаточно кодов обратно, и цепочка замирает. Другие люди не получат инвайты из-за этого.

**Что делать:**
1. Включи VPN 🇺🇸
2. Зарегистрируйся на sora.com **с этим кодом**
3. В Sora появится **ТВОЙ код** (один, на 4 использования)
4. Скопируй **ТВОЙ код из Sora** и отправь сюда

**Где найти код в Sora:**
→ Веб: правый угол ⋮ → Invite Friends
→ Приложение: "4 invites" → Share

📨 Вернёшься и отправишь код → выберешь сколькими использованиями поделиться.

💡 **ОЧЕНЬ ПРОШУ поделиться 3-4 использованиями!**

Система работает только если люди возвращают коды. Сейчас очередь огромная, а кодов почти нет. 

Твой вклад критически важен! 🙏

⏰ Дедлайн: 48 часов

💝 Подпишись (про AI): ${config.telegram.channel}`,

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

    chooseUsageCount: (code, uniqueCodes, queueSize) => `✅ Код: \`${code}\`

**Сколько человек пригласить?**

⚠️ **Сейчас в пуле:** ${uniqueCodes} ${uniqueCodes === 1 ? 'уникальный код' : 'уникальных кода'}

💡 **Почему важно делиться больше:**
Система работает только если отдают БОЛЬШЕ чем берут. Сейчас ~50% людей халявят и ничего не возвращают.

🙏 Рекомендую **3-4 использования** - система критически нуждается!

Выбери:`,

    codesReceived: (totalCodes) => `✅ Готово!

С тебя больше ничего не требуется ✨

💝 Подпишись: ${config.telegram.channel}`,

    reminder: (hoursLeft, codesRequired, codesReturned) => {
      if (codesReturned > 0) {
        return null;
      }
      
      return `⏰ НАПОМИНАНИЕ

🙏 Пожалуйста верни код из Sora!

Очередь растёт, людям нужна твоя помощь.

/start → "Отправить коды"

⏱️ Осталось: ~${hoursLeft}ч`;
    },

    finalWarning: (codesRequired, codesReturned) => {
      if (codesReturned > 0) {
        return null;
      }
      
      return `🚨 СРОЧНО! Последнее напоминание

Система критически нуждается в кодах!

Пожалуйста верни код из Sora - это займёт 30 секунд.

Без твоей помощи система не сможет работать! 🙏

/start → "Отправить коды"`;
    },

    addedToQueue: (position, poolSize, avgWaitHours, showGenerateOption) => {
      // Расчёт примерного времени ожидания на основе реальной статистики
      let waitTime = '';
      
      if (poolSize >= position) {
        waitTime = '⚡️ **Примерное время ожидания:** несколько минут';
      } else if (avgWaitHours !== null && avgWaitHours > 0 && avgWaitHours < 1000) {
        // Используем реальную статистику только если она адекватная
        const waitingAhead = Math.max(0, position - poolSize);
        const estimatedHours = avgWaitHours * (waitingAhead / Math.max(1, poolSize || 1));
        
        if (estimatedHours < 1) {
          waitTime = `⏱ **Примерное время ожидания:** ${Math.round(estimatedHours * 60)} минут`;
        } else if (estimatedHours < 2) {
          waitTime = `⏱ **Примерное время ожидания:** ~${Math.round(estimatedHours)} час`;
        } else if (estimatedHours < 24) {
          waitTime = `⏱ **Примерное время ожидания:** ~${Math.round(estimatedHours)} часов`;
        } else if (estimatedHours < 72) {
          const days = Math.round(estimatedHours / 24);
          waitTime = `⏱ **Примерное время ожидания:** ~${days} ${days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'}`;
        } else {
          waitTime = '⏱ **Спрос большой.** Код придёт, но может занять время.';
        }
      } else {
        // Фолбэк если нет статистики или она некорректна
        waitTime = '⏱ **Спрос большой.** Код придёт, но может занять время.';
      }
      
      return { text: `✅ **Ты добавлен в очередь!**

📊 **Твоя позиция:** #${position}
💎 **Кодов в пуле:** ${poolSize}
${waitTime}

${poolSize > 0 
  ? `🚀 Твоя очередь подойдет скоро! Как только освободится код, я сразу тебе отправлю.` 
  : `⏳ Пул пока пуст, но скоро появятся новые коды от участников.`}

⚠️ **Важно:** Если найдёшь код раньше в другом месте — пожалуйста, верни неиспользованный код обратно через кнопку "Вернуть неиспользованный инвайт" в /start! Это поможет другим получить доступ быстрее.

📊 Проверить статус: /stats`,
        showGenerateButton: showGenerateOption
      };
    },

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

\`/adminstat\` - 📊 Детальная статистика
\`/addcodes КОД [N]\` - Добавить код (1-4)
\`/removecode КОД\` - Удалить код
\`/ban @user причина\` - 🔨 **МОЩНЫЙ БАН:**
  • Shadow ban (не видит что забанен)
  • Удаляет ВСЕ его коды из пула
  • Оповещает всех жертв скама
  • Сбрасывает статус для повторного запроса
\`/unban @user\` - Разбанить
\`/requesthelp\` - 🆘 Запрос помощи (рассылка)
\`/clearpool\` / \`/clearqueue\` - Очистить
\`/finduser ID\` - Найти пользователя
\`/poolsize\` / \`/queuesize\` - Размеры
\`/broadcast текст\` - Рассылка всем`,

    buttons: {
      wantInvite: '🎫 Хочу инвайт',
      generateVideo: '🎬 Генерация видео',
      agree: '✅ Понятно, согласен',
      cancel: '❌ Отказаться',
      shareCode: '📤 Поделиться кодом',
      returnUnused: '↩️ Вернуть неиспользованный инвайт',
      reportInvalid: '🚫 Нерабочий инвайт',
      russian: '🇷🇺 Русский',
      english: '🇬🇧 English',
      usage1: '1 человек (оставлю 3 себе)',
      usage2: '2 человека (оставлю 2 себе)',
      usage3: '3 человека (оставлю 1 себе)',
      usage4: '4 человека (отдам всё)',
      codeWorks: '✅ Код работает',
      codeInvalid: '❌ Код не работает',
      rohanAnswers: '⚔️ И РОХАН ЯВИТСЯ!'
    },

    shareCodePrompt: (language) => language === 'en' 
      ? `📤 **Share your code**

**Where to find code:**
→ Web: ⋮ → Invite Friends
→ App: "4 invites" → Share

Send your invite code → choose how many uses to share.

Thank you for helping others! 🙏`
      : `📤 **Поделись кодом**

**Где взять код:**
→ Веб: ⋮ → Invite Friends
→ Приложение: "4 invites" → Share

Отправь свой инвайт-код → выберешь сколько использований поделиться.

Спасибо, что помогаешь другим! 🙏`,

    donationReceived: (count, language) => language === 'en'
      ? `✅ **Thank you!**

${count} code${count > 1 ? 's' : ''} successfully added to the pool!

Thanks to you, someone will get access to Sora! 🎉`
      : `✅ **Спасибо!**

${count} ${pluralizeRu(count, 'код', 'кода', 'кодов')} успешно ${count === 1 ? 'добавлен' : 'добавлены'} в пул!

Благодаря тебе кто-то получит доступ к Sora! 🎉`,

    reportInvalidPrompt: (code, language) => language === 'en'
      ? `🚫 **Report Invalid Invite**

Code: \`${code}\`

Are you sure this code doesn't work?

We'll check with other users who received this code and notify the author.

You'll be able to request a new invite (max 2 invites total).`
      : `🚫 **Пожаловаться на нерабочий инвайт**

Код: \`${code}\`

Ты уверен что этот код не работает?

Мы проверим у других кто получил этот код и уведомим автора.

Ты сможешь запросить новый инвайт (макс 2 инвайта всего).`,

    invalidCodeConfirm: (code, language) => language === 'en'
      ? `⚠️ **Code reported as invalid**

Code: \`${code}\`

Can you confirm - does this code work for you?

If it doesn't work, we'll send you a new invite.`
      : `⚠️ **Код помечен как недействительный**

Код: \`${code}\`

Можешь подтвердить - этот код у тебя работает?

Если не работает, мы отправим тебе новый инвайт.`,

    authorWarning: (code, reportCount, language) => language === 'en'
      ? `⚠️ **Code Issue Reported**

Your code: \`${code}\`

${reportCount} user${reportCount > 1 ? 's' : ''} reported this code doesn't work.

**Please verify:**
• Did you send a valid code?
• Did you copy it correctly from Sora?

You can donate a working code anytime.

The show must go on - please don't let the community down! 🙏`
      : `⚠️ **Жалоба на твой код**

Твой код: \`${code}\`

${reportCount} ${reportCount === 1 ? 'человек сообщил' : 'человека сообщили'} что код не работает.

**Пожалуйста проверь:**
• Ты отправил действующий код?
• Правильно скопировал из Sora?

Можешь пожертвовать рабочий код в любой момент.

Шоу маст гоу он - не подводи комьюнити! 🙏`,

    newInviteGranted: (newCode, attemptNumber, language) => language === 'en'
      ? `✅ **New invite sent** (attempt #${attemptNumber})

Code: \`${newCode}\`

Previous code was confirmed as invalid.

Hope this one works! 🤞`
      : `✅ **Новый инвайт отправлен** (попытка #${attemptNumber})

Код: \`${newCode}\`

Предыдущий код подтверждён как недействительный.

Надеюсь этот сработает! 🤞`,

    maxInvitesReached: (language) => language === 'en'
      ? `❌ **Max invites reached**

You've already received 2 invites.

This is the maximum to prevent abuse.

Sorry! 🙏`
      : `❌ **Достигнут лимит инвайтов**

Ты уже получил 2 инвайта.

Это максимум для предотвращения злоупотреблений.

Извини! 🙏`,

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
      ? `⚠️ **This is the code you got from the bot**

Code from bot: \`${code}\`

**Did you want to:**
• Return UNUSED invite? (got invite elsewhere) ↩️
• Or return YOUR code from Sora? 📨

**If you registered in Sora:**
Send the code that SORA gave YOU (different from ${code})`
      : `⚠️ **Это код который ты получил от бота**

Код от бота: \`${code}\`

**Ты хотел:**
• Вернуть НЕИСПОЛЬЗОВАННЫЙ инвайт? (получил инвайт в другом месте) ↩️
• Или вернуть СВОЙ код от Sora? 📨

**Если ты зарегистрировался в Sora:**
Отправь код который выдала ТЕБЕ Sora (он другой, не ${code})`
    ,
    // ==== Sora Generation (admin test) ====
    generateAdminIntro: `🎬 **Генерация видео (тест, только админ)**\n\nВыбери режим:`,
    generateOptions: {
      basic4s: 'Обычный',
      pro4s: 'HD',
      bundles: 'Бандлы',
      constructor: 'Кастом'
    },
    bundlesMenu: {
      basic: 'Обычный 4с',
      pro: 'Про 4с',
      back: '⬅️ Назад'
    },
    promptAsk: `📝 Опиши ролик на русском (что увидеть, стиль, атмосфера).`,
    promptEnhanceChoice: `✨ Усилить промпт или отправить как есть?`,
    promptImproved: (enhanced) => `✨ **Усиленный промпт:**\n\n${enhanced.substring(0, 400)}${enhanced.length > 400 ? '...' : ''}\n\n_Запускаю генерацию..._`,
    promptOriginal: `📝 Отправляю оригинальный промпт без изменений...`,
    paymentRequested: (stars) => `💫 Списываю ${stars}⭐ через Telegram Stars...`,
    paymentRefunded: (stars) => `↩️ Возврат ${stars}⭐ из-за ошибки генерации.`,
    generationQueued: `⏳ Задача отправлена в очередь, скоро начнём.`,
    generationStarted: (eta) => `🚀 Генерация началась...\n\n⏱ Примерное время: ${eta}. Подожди, не закрывай бота.`,
    generationProgress: (p) => `⏳ Прогресс: ${p}%...`,
    generationSuccess: `✅ Готово!`,
    generationFailed: (reason) => `❌ Ошибка генерации: ${reason}`,
    proDisclaimer: (rubles) => `ℹ️ У OpenAI HD-доступ стоит ~$100 в месяц.\n\nУ нас — всего 250⭐ (≈${rubles}₽).`
  },
  
  en: {
    languageSelect: `Hi! Choose language / Привет! Выбери язык:`,
    
    welcome: `👋 Hi! This is a bot for distributing Sora invites.

🎬 **Sora** is OpenAI's new AI platform for video generation.

⚠️ **Important:** You need a US VPN to activate the invite!

💡 **New:** Generate videos right in the bot — Pro version available (normally $100/mo)!

Choose action 👇`,

    rules: (codesRequired) => `📜 **Rules:**

1️⃣ Get invite → register on sora.com

2️⃣ In Sora you'll have **1 code with 4 uses**

3️⃣ Return code to bot → choose how many uses to share (1-4)

4️⃣ Keep the rest

💡 Mutual help system — everyone shares what they can!

Agree?`,

    inviteSent: (code, codesRequired) => `🎉 **Your invite:**

\`${code}\`

⚠️ **IMPORTANT: use this code ONLY ONCE for registration!**

If you use it multiple times (for yourself and friends), you won't return enough codes back, and the chain stops. Other people won't get invites because of this.

**What to do:**
1. Enable VPN 🇺🇸
2. Register on sora.com **with this code**
3. In Sora you'll get **YOUR code** (one, 4 uses)
4. Copy **YOUR code from Sora** and send it here

**Where to find code in Sora:**
→ Web: corner ⋮ → Invite Friends
→ App: "4 invites" → Share

📨 Come back, send code → choose how many uses to share.

💡 **PLEASE share 3-4 uses!**

The system only works if people return codes. Right now the queue is huge but we have almost no codes.

Your contribution is critical! 🙏

⏰ Deadline: 48h

💝 Follow for AI insights: ${config.telegram.twitterEn}
Head of Research at Yandex Search & AI`,

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

    reminder: (hoursLeft, codesRequired, codesReturned) => {
      if (codesReturned > 0) {
        return null;
      }
      
      return `⏰ REMINDER

🙏 Please return your code from Sora!

Queue is growing, people need your help.

/start → "Submit Codes"

⏱️ Time left: ~${hoursLeft}h`;
    },

    finalWarning: (codesRequired, codesReturned) => {
      if (codesReturned > 0) {
        return null;
      }
      
      return `🚨 URGENT! Final reminder

System critically needs codes!

Please return your code from Sora - takes 30 seconds.

Without your help the system can't work! 🙏

/start → "Submit Codes"`;
    },

    addedToQueue: (position, poolSize, avgWaitHours, showGenerateOption) => {
      // Calculate estimated wait time based on real statistics
      let waitTime = '';
      
      if (poolSize >= position) {
        waitTime = '⚡️ **Estimated wait time:** a few minutes';
      } else if (avgWaitHours !== null && avgWaitHours > 0 && avgWaitHours < 1000) {
        // Use real statistics only if reasonable
        const waitingAhead = Math.max(0, position - poolSize);
        const estimatedHours = avgWaitHours * (waitingAhead / Math.max(1, poolSize || 1));
        
        if (estimatedHours < 1) {
          waitTime = `⏱ **Estimated wait time:** ${Math.round(estimatedHours * 60)} minutes`;
        } else if (estimatedHours < 2) {
          waitTime = `⏱ **Estimated wait time:** ~${Math.round(estimatedHours)} hour`;
        } else if (estimatedHours < 24) {
          waitTime = `⏱ **Estimated wait time:** ~${Math.round(estimatedHours)} hours`;
        } else if (estimatedHours < 72) {
          const days = Math.round(estimatedHours / 24);
          waitTime = `⏱ **Estimated wait time:** ~${days} day${days > 1 ? 's' : ''}`;
        } else {
          waitTime = '⏱ **High demand.** You\'ll get the code, but it may take time.';
        }
      } else {
        // Fallback if no statistics or incorrect
        waitTime = '⏱ **High demand.** You\'ll get the code, but it may take time.';
      }
      
      return { text: `✅ **You've been added to the queue!**

📊 **Your position:** #${position}
💎 **Codes in pool:** ${poolSize}
${waitTime}

${poolSize > 0 
  ? `🚀 Your turn will come soon! As soon as a code becomes available, I'll send it to you right away.` 
  : `⏳ The pool is empty for now, but new codes from participants will appear soon.`}

⚠️ **Important:** If you find a code elsewhere before your turn — please return the unused code via "Return Unused Invite" button in /start! This will help others get access faster.

📊 Check status: /stats`,
        showGenerateButton: showGenerateOption
      };
    },

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
4. Return your code to the bot
5. Help others get access!

**AI insights:**
${config.telegram.twitterEn}
Head of Research at Yandex Search & AI`,

    adminHelp: `🔧 **Admin Commands:**

\`/adminstat\` - 📊 Detailed statistics
\`/addcodes CODE [N]\` - Add code (1-4 uses)
\`/removecode CODE\` - Remove code
\`/ban @user reason\` - 🔨 **POWERFUL BAN:**
  • Shadow ban (they don't see they're banned)
  • Removes ALL their codes from pool
  • Notifies all scam victims
  • Resets status for re-request
\`/unban @user\` - Unban user
\`/requesthelp\` - 🆘 Help request (broadcast)
\`/clearpool\` / \`/clearqueue\` - Clear data
\`/finduser ID\` - Find user
\`/poolsize\` / \`/queuesize\` - Sizes
\`/broadcast text\` - Broadcast to all`,

    buttons: {
      wantInvite: '🎫 Want Invite',
      generateVideo: '🎬 Generate Video',
      agree: '✅ I Agree',
      cancel: '❌ Cancel',
      shareCode: '📤 Share Code',
      returnUnused: '↩️ Return Unused Invite',
      reportInvalid: '🚫 Invalid Invite',
      russian: '🇷🇺 Русский',
      english: '🇬🇧 English',
      usage1: '1 person (keep 3 for me)',
      usage2: '2 people (keep 2 for me)',
      usage3: '3 people (keep 1 for me)',
      usage4: '4 people (give all)',
      codeWorks: '✅ Code works',
      codeInvalid: '❌ Code invalid',
      rohanAnswers: '⚔️ AND ROHAN WILL ANSWER!'
    },

    chooseUsageCount: (code, uniqueCodes, queueSize) => `✅ Code: \`${code}\`

**How many people to invite?**

⚠️ **In pool now:** ${uniqueCodes} unique code${uniqueCodes !== 1 ? 's' : ''}

💡 **Why sharing more matters:**
System only works if people give MORE than they take. Currently ~50% freeload and return nothing.

🙏 Recommend **3-4 uses** - system critically needs it!

Choose:`
  ,
    // ==== Sora Generation (admin test) ====
    generateAdminIntro: `🎬 **Video generation (test, admin only)**\n\nChoose mode:`,
    generateOptions: {
      basic4s: 'Basic',
      pro4s: 'HD',
      bundles: 'Bundles',
      constructor: 'Custom'
    },
    bundlesMenu: {
      basic: 'Basic 4s',
      pro: 'Pro 4s',
      back: '⬅️ Back'
    },
    promptAsk: `📝 Describe the video (what to see, style, mood).`,
    promptEnhanceChoice: `✨ Enhance prompt or send as-is?`,
    promptImproved: (enhanced) => `✨ **Enhanced prompt:**\n\n${enhanced.substring(0, 400)}${enhanced.length > 400 ? '...' : ''}\n\n_Starting generation..._`,
    promptOriginal: `📝 Sending original prompt unchanged...`,
    paymentRequested: (stars) => `💫 Charging ${stars}⭐ via Telegram Stars...`,
    paymentRefunded: (stars) => `↩️ Refunded ${stars}⭐ due to generation error.`,
    generationQueued: `⏳ Task queued, starting soon.`,
    generationStarted: (eta) => `🚀 Generation started...\n\n⏱ Estimated time: ${eta}. Please wait, don't close the bot.`,
    generationProgress: (p) => `⏳ Progress: ${p}%...`,
    generationSuccess: `✅ Done!`,
    generationFailed: (reason) => `❌ Generation error: ${reason}`,
    proDisclaimer: (rubles) => `ℹ️ OpenAI HD access costs ~$100/mo.\n\nHere — just 250⭐ (≈${rubles}₽).`
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
