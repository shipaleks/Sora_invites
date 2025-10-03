import DB from '../database.js';
import { getMessages } from '../messages.js';
import config from '../config.js';
import admin from 'firebase-admin';

const db = admin.firestore();

export function registerCallbacks(bot) {
  // Выбор языка
  bot.action(/^lang_(ru|en)$/, async (ctx) => {
    await ctx.answerCbQuery();
    
    const userId = ctx.from.id;
    const language = ctx.match[1];
    
    await DB.updateUser(userId, { language });
    
    const MESSAGES = getMessages(language);
    
    await ctx.editMessageText(
      `${language === 'ru' ? '✅ Язык установлен: Русский' : '✅ Language set: English'}\n\n${MESSAGES.welcome}`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: MESSAGES.buttons.wantInvite, callback_data: 'want_invite' }
          ]]
        },
        parse_mode: 'Markdown'
      }
    );
  });

  // Хочу инвайт
  bot.action('want_invite', async (ctx) => {
    await ctx.answerCbQuery();
    
    const userId = ctx.from.id;
    const user = await DB.getUser(userId);
    
    const MESSAGES = getMessages(user?.language || 'ru');
    
    if (!user) {
      return ctx.reply(MESSAGES.notInSystem, { parse_mode: 'Markdown' });
    }
    
    // Проверка, не в очереди ли уже
    const position = await DB.getQueuePosition(userId);
    if (position && user.status === 'waiting') {
      return ctx.reply(MESSAGES.alreadyInQueue(position), { 
        parse_mode: 'Markdown' 
      });
    }

    // Проверка, не получил ли уже инвайт
    if (user.status === 'received' || user.status === 'completed') {
      const msg = user.language === 'en' ? '✅ You already received an invite!' : '✅ Ты уже получил инвайт!';
      return ctx.reply(msg, { parse_mode: 'Markdown' });
    }
    
    // Определяем сколько кодов потребуется
    const settings = await DB.getSystemSettings();
    const codesRequired = settings.first_10_count < 10 ? 
      config.rules.first10CodesRequired : 
      config.rules.regularCodesRequired;
    
    await ctx.reply(MESSAGES.rules(codesRequired), {
      reply_markup: {
        inline_keyboard: [
          [{ text: MESSAGES.buttons.agree, callback_data: 'agree_rules' }],
          [{ text: MESSAGES.buttons.cancel, callback_data: 'cancel' }]
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
    
    const MESSAGES = getMessages(user?.language || 'ru');
    
    if (!user) {
      return ctx.reply(MESSAGES.notInSystem, { parse_mode: 'Markdown' });
    }
    
    // Проверка, не в очереди ли уже
    const existingPosition = await DB.getQueuePosition(userId);
    if (existingPosition) {
      return ctx.reply(MESSAGES.alreadyInQueue(existingPosition), { 
        parse_mode: 'Markdown' 
      });
    }
    
    const position = await DB.addToQueue(userId);
    const poolSize = await DB.getPoolSize();
    
    await ctx.reply(MESSAGES.addedToQueue(position, poolSize), { 
      parse_mode: 'Markdown' 
    });
    
    // Уведомление админу
    try {
      await bot.telegram.sendMessage(
        config.telegram.adminId,
        `➕ Новый в очереди: @${user.username} (позиция #${position}, язык: ${user.language})`
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
    
    const MESSAGES = getMessages(user?.language || 'ru');
    
    if (!user || user.status !== 'received') {
      const msg = user?.language === 'en' ? '❌ You haven\'t received an invite yet' : '❌ Ты ещё не получил инвайт';
      return ctx.reply(msg, { parse_mode: 'Markdown' });
    }
    
    // Определяем сколько кодов нужно
    const settings = await DB.getSystemSettings();
    
    // Находим индекс пользователя среди получивших инвайт
    const allUsers = await DB.getAllUsers();
    const usersWithInvites = allUsers
      .filter(u => u.invite_sent_at)
      .sort((a, b) => {
        const timeA = a.invite_sent_at?.toDate?.() || new Date(0);
        const timeB = b.invite_sent_at?.toDate?.() || new Date(0);
        return timeA - timeB;
      });
    
    const userIndex = usersWithInvites.findIndex(u => u.telegram_id === String(userId)) + 1;
    const codesRequired = userIndex <= 10 ? 
      config.rules.first10CodesRequired : 
      config.rules.regularCodesRequired;
    
    const neededCodes = Math.max(0, codesRequired - user.codes_returned);
    
    if (neededCodes === 0) {
      const msg = user.language === 'en' 
        ? '✅ You\'ve already returned all required codes. Thank you! 🙏' 
        : '✅ Ты уже вернул все необходимые коды. Спасибо! 🙏';
      return ctx.reply(msg, { parse_mode: 'Markdown' });
    }
    
    await ctx.reply(MESSAGES.waitingForCodes(codesRequired, user.codes_returned || 0), {
      parse_mode: 'Markdown'
    });
    
    // Устанавливаем флаг ожидания кодов и СБРАСЫВАЕМ остальные
    await DB.updateUser(userId, {
      awaiting_codes: true,
      awaiting_donation: false,
      awaiting_unused_return: false,
      awaiting_donation_usage: false
    });
  });

  // Пожертвовать коды
  bot.action('donate_codes', async (ctx) => {
    await ctx.answerCbQuery();
    
    const userId = ctx.from.id;
    const user = await DB.getUser(userId);
    
    const MESSAGES = getMessages(user?.language || 'ru');
    
    await ctx.reply(MESSAGES.donateCodesPrompt(user?.language || 'ru'), {
      parse_mode: 'Markdown'
    });
    
    // Устанавливаем флаг ожидания донейшен кодов
    await DB.updateUser(userId, {
      awaiting_donation: true
    });
  });

  // Вернуть неиспользованный инвайт
  bot.action('return_unused', async (ctx) => {
    await ctx.answerCbQuery();
    
    const userId = ctx.from.id;
    const user = await DB.getUser(userId);
    
    const MESSAGES = getMessages(user?.language || 'ru');
    
    if (!user || user.status !== 'received') {
      const msg = user?.language === 'en' 
        ? '❌ You haven\'t received an invite yet' 
        : '❌ Ты ещё не получил инвайт';
      return ctx.reply(msg, { parse_mode: 'Markdown' });
    }
    
    await ctx.reply(MESSAGES.returnUnusedPrompt(user?.language || 'ru'), {
      parse_mode: 'Markdown'
    });
    
    // Устанавливаем флаг ожидания возврата неиспользованного
    await DB.updateUser(userId, {
      awaiting_unused_return: true
    });
  });

  // Пожаловаться на нерабочий инвайт
  bot.action('report_invalid', async (ctx) => {
    await ctx.answerCbQuery();
    
    const userId = ctx.from.id;
    const user = await DB.getUser(userId);
    
    const MESSAGES = getMessages(user?.language || 'ru');
    
    if (!user || !user.invite_code_given) {
      const msg = user?.language === 'en' 
        ? '❌ You haven\'t received an invite yet' 
        : '❌ Ты ещё не получил инвайт';
      return ctx.reply(msg);
    }
    
    const code = user.invite_code_given;
    
    // ЗАЩИТА 1: Лимит на количество инвайтов (максимум 2)
    const currentInvites = user.invites_received_count || 0;
    if (currentInvites >= 2) {
      const msg = user?.language === 'en'
        ? '❌ Max invites reached (2). You cannot request more.'
        : '❌ Достигнут лимит инвайтов (2). Больше запросить нельзя.';
      return ctx.reply(msg);
    }
    
    // ЗАЩИТА 2: Лимит на количество жалоб (максимум 3)
    const totalReports = user.invalid_codes_reported?.length || 0;
    if (totalReports >= 3) {
      const msg = user?.language === 'en'
        ? '⚠️ You\'ve reported 3 codes already. This seems suspicious.\n\nPlease contact admin if you really have issues.'
        : '⚠️ Ты уже пожаловался на 3 кода. Это выглядит подозрительно.\n\nСвяжись с админом если действительно есть проблемы.';
      return ctx.reply(msg);
    }
    
    // ЗАЩИТА 3: Cooldown - последняя жалоба должна быть не раньше чем 10 минут назад
    if (user.last_report_time) {
      const lastReport = user.last_report_time.toDate ? user.last_report_time.toDate() : new Date(user.last_report_time);
      const minutesSinceLastReport = (new Date() - lastReport) / (1000 * 60);
      
      if (minutesSinceLastReport < 10) {
        const msg = user?.language === 'en'
          ? `⚠️ Please wait ${Math.ceil(10 - minutesSinceLastReport)} more minutes before reporting again.`
          : `⚠️ Подожди ещё ${Math.ceil(10 - minutesSinceLastReport)} минут перед следующей жалобой.`;
        return ctx.reply(msg);
      }
    }
    
    // Проверяем: не жаловался ли уже на этот конкретный код
    if (user.invalid_codes_reported?.includes(code)) {
      // Уже жаловался на этот код - просто добавляем в очередь
      await DB.addToQueue(userId);
      
      const msg = user?.language === 'en'
        ? '✅ You already reported this code. Added you back to queue for a different code!'
        : '✅ Ты уже жаловался на этот код. Добавил тебя в очередь на другой код!';
      return ctx.reply(msg);
    }
    
    await ctx.reply(MESSAGES.reportInvalidPrompt(code, user?.language || 'ru'), {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: MESSAGES.buttons.codeInvalid, callback_data: `confirm_invalid_${code}` }],
          [{ text: MESSAGES.buttons.cancel, callback_data: 'cancel' }]
        ]
      }
    });
  });

  // Подтверждение жалобы на нерабочий код
  bot.action(/^confirm_invalid_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    
    const userId = ctx.from.id;
    const code = ctx.match[1];
    const user = await DB.getUser(userId);
    
    const MESSAGES = getMessages(user?.language || 'ru');
    
    try {
      // Отмечаем жалобу
      await DB.updateUser(userId, {
        invalid_codes_reported: [...(user.invalid_codes_reported || []), code]
      });
      
      // Находим всех кто получил этот код
      const allUsers = await DB.getAllUsers();
      const affectedUsers = allUsers.filter(u => 
        u.invite_code_given === code && 
        u.telegram_id !== String(userId)
      );
      
      // Если есть другие получатели - спрашиваем у них
      if (affectedUsers.length > 0) {
        for (const affectedUser of affectedUsers) {
          try {
            const msg = getMessages(affectedUser.language || 'ru');
            await bot.telegram.sendMessage(
              affectedUser.telegram_id,
              msg.invalidCodeConfirm(code, affectedUser.language),
              {
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [
                    [{ text: msg.buttons.codeWorks, callback_data: `code_works_${code}` }],
                    [{ text: msg.buttons.codeInvalid, callback_data: `code_invalid_${code}` }]
                  ]
                }
              }
            );
          } catch (error) {
            console.error(`Failed to notify user ${affectedUser.telegram_id}:`, error.message);
          }
        }
      }
      
      // Находим автора кода
      const poolEntries = await db.collection('invite_pool')
        .where('code', '==', code)
        .get();
      
      if (!poolEntries.empty) {
        const authorId = poolEntries.docs[0].data().submitted_by;
        
        // Не отправляем если автор - система/админ/donation
        if (!authorId.includes('admin') && !authorId.includes('system') && !authorId.includes('donation') && !authorId.includes('unused')) {
          try {
            const author = await DB.getUser(authorId);
            if (author) {
              const authorMsg = getMessages(author.language || 'ru');
              await bot.telegram.sendMessage(
                author.telegram_id,
                authorMsg.authorWarning(code, 1, author.language),
                { parse_mode: 'Markdown' }
              );
            }
          } catch (error) {
            console.error(`Failed to notify author ${authorId}:`, error.message);
          }
        }
      }
      
      // Даём пользователю новый инвайт если есть в пуле
      const currentInvites = user.invites_received_count || 0;
      
      if (currentInvites >= 2) {
        await ctx.editMessageText(MESSAGES.maxInvitesReached(user?.language || 'ru'), {
          parse_mode: 'Markdown'
        });
        return;
      }
      
      const msg = user?.language === 'en'
        ? `✅ Report received. We're checking with other users and notifying the author.\n\nYou'll get a new invite soon!`
        : `✅ Жалоба принята. Проверяем у других пользователей и уведомляем автора.\n\nСкоро получишь новый инвайт!`;
      
      await ctx.editMessageText(msg);
      
      // Добавляем обратно в очередь с высоким приоритетом
      await DB.addToQueue(userId);
      
      // Уведомление админу
      try {
        await bot.telegram.sendMessage(
          config.telegram.adminId,
          `🚫 Жалоба на код от @${user.username}\nКод: ${code}\nДругих получателей: ${affectedUsers.length}`
        );
      } catch (error) {
        console.error('Admin notification failed:', error.message);
      }
      
    } catch (error) {
      console.error('Error processing invalid code report:', error);
      await ctx.reply('❌ Ошибка. Попробуй позже.');
    }
  });

  // Ответ: код работает
  bot.action(/^code_works_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery('Спасибо за подтверждение!');
    
    const code = ctx.match[1];
    
    const msg = ctx.from.language_code === 'ru'
      ? `✅ Отлично! Значит код работает.\n\nВозможно у жалующегося была другая проблема.`
      : `✅ Great! So the code works.\n\nMaybe the reporter had a different issue.`;
    
    await ctx.editMessageText(msg);
  });

  // Ответ: код НЕ работает
  bot.action(/^code_invalid_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    
    const userId = ctx.from.id;
    const code = ctx.match[1];
    const user = await DB.getUser(userId);
    
    const MESSAGES = getMessages(user?.language || 'ru');
    
    try {
      // Отмечаем жалобу
      await DB.updateUser(userId, {
        invalid_codes_reported: [...(user.invalid_codes_reported || []), code]
      });
      
      // Проверяем лимит инвайтов
      const currentInvites = user.invites_received_count || 0;
      
      if (currentInvites >= 2) {
        await ctx.editMessageText(MESSAGES.maxInvitesReached(user?.language || 'ru'), {
          parse_mode: 'Markdown'
        });
        return;
      }
      
      // Добавляем обратно в очередь
      await DB.addToQueue(userId);
      
      const msg = user?.language === 'en'
        ? `✅ Confirmed. You'll get a new invite soon!`
        : `✅ Подтверждено. Скоро получишь новый инвайт!`;
      
      await ctx.editMessageText(msg);
      
    } catch (error) {
      console.error('Error confirming invalid code:', error);
      await ctx.reply('❌ Ошибка.');
    }
  });

  // Рохан явится на помощь Гондору!
  bot.action('rohan_answers', async (ctx) => {
    await ctx.answerCbQuery('⚔️ За Рохан!');
    
    const userId = ctx.from.id;
    const user = await DB.getUser(userId);
    
    const MESSAGES = getMessages(user?.language || 'ru');
    
    // Отправляем новое сообщение вместо редактирования (чтобы избежать "message not modified")
    const promptText = user?.language === 'en'
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

Спасибо! 🙏`;
    
    await ctx.reply(promptText, {
      parse_mode: 'Markdown'
    });
    
    await DB.updateUser(userId, {
      awaiting_donation: true,
      awaiting_donation_usage: false,
      awaiting_codes: false,
      awaiting_unused_return: false
    });
  });

  // Выбор количества использований (обычный возврат)
  bot.action(/^usage_([1-4])$/, async (ctx) => {
    await ctx.answerCbQuery();
    
    const userId = ctx.from.id;
    const user = await DB.getUser(userId);
    const usageCount = parseInt(ctx.match[1]);
    
    const MESSAGES = getMessages(user?.language || 'ru');
    
    if (!user || !user.pending_code) {
      return ctx.reply('❌ Ошибка: код не найден');
    }
    
    const code = user.pending_code;
    
    try {
      // Добавляем код в пул указанное количество раз
      const addedCount = await DB.addCodesToPoolWithLimit(code, user.telegram_id, usageCount);
      
      if (addedCount === 0) {
        const msg = user.language === 'en'
          ? '❌ This code has already been added to the pool'
          : '❌ Этот код уже был добавлен в пул';
        return ctx.reply(msg);
      }
      
      // Обновляем статус пользователя
      await DB.updateUser(user.telegram_id, {
        codes_returned: 1,
        codes_submitted: [code],
        pending_code: null,
        awaiting_usage_choice: false,
        usage_count_shared: usageCount,
        status: 'completed'
      });
      
      const remaining = 4 - usageCount;
      const msg = user.language === 'en'
        ? `✅ Done!

Code: \`${code}\`
Shared: **${usageCount}** / Yours: **${remaining}**

Up to ${usageCount} people will get access through bot. You're all set! 🎉`
        : `✅ Готово!

Код: \`${code}\`
В бот: **${usageCount}** / Тебе: **${remaining}**

До ${usageCount} ${usageCount === 1 ? 'человека' : 'человек'} получат доступ через бот. Всё! 🎉`;
      
      await ctx.editMessageText(msg, { parse_mode: 'Markdown' });
      
      // Уведомление админу
      try {
        await ctx.telegram.sendMessage(
          config.telegram.adminId,
          `✅ Код получен от @${user.username}:\nКод: ${code}\nИспользований: ${usageCount} (добавлено ${addedCount} раз)`
        );
      } catch (error) {
        console.error('Admin notification failed:', error.message);
      }
    } catch (error) {
      console.error('Error processing usage choice:', error);
      await ctx.reply('❌ Произошла ошибка. Попробуй еще раз.');
    }
  });

  // Выбор количества использований (пожертвование)
  bot.action(/^donation_usage_([1-4])$/, async (ctx) => {
    await ctx.answerCbQuery();
    
    const userId = ctx.from.id;
    const user = await DB.getUser(userId);
    const usageCount = parseInt(ctx.match[1]);
    
    const MESSAGES = getMessages(user?.language || 'ru');
    
    if (!user || !user.pending_donation_code) {
      return ctx.reply('❌ Ошибка: код не найден');
    }
    
    const code = user.pending_donation_code;
    
    try {
      // Добавляем код в пул как пожертвование
      const addedCount = await DB.addCodesToPoolWithLimit(code, `donation:${user.telegram_id}`, usageCount);
      
      if (addedCount === 0) {
        const msg = user.language === 'en'
          ? '❌ This code has already been added to the pool'
          : '❌ Этот код уже был добавлен в пул';
        return ctx.reply(msg);
      }
      
      // Обновляем флаги
      await DB.updateUser(user.telegram_id, {
        pending_donation_code: null,
        awaiting_donation_usage: false
      });
      
      const remaining = 4 - usageCount;
      const msg = user.language === 'en'
        ? `✅ Thanks for donation!

Code: \`${code}\`
Donated: **${usageCount}** / Yours: **${remaining}**

Up to ${usageCount} people will register thanks to you! 🎉`
        : `✅ Спасибо за пожертвование!

Код: \`${code}\`
В бот: **${usageCount}** / Тебе: **${remaining}**

До ${usageCount} ${usageCount === 1 ? 'человека' : 'человек'} получат доступ! 🎉`;
      
      await ctx.editMessageText(msg, { parse_mode: 'Markdown' });
      
      // Уведомление админу
      try {
        await ctx.telegram.sendMessage(
          config.telegram.adminId,
          `💝 Пожертвование от @${user.username}:\nКод: ${code}\nИспользований: ${usageCount} (добавлено ${addedCount} раз)`
        );
      } catch (error) {
        console.error('Admin notification failed:', error.message);
      }
    } catch (error) {
      console.error('Error processing donation:', error);
      await ctx.reply('❌ Произошла ошибка. Попробуй еще раз.');
    }
  });

  // Отказ
  bot.action('cancel', async (ctx) => {
    await ctx.answerCbQuery();
    
    const userId = ctx.from.id;
    const user = await DB.getUser(userId);
    
    const msg = user?.language === 'en' 
      ? 'Okay, if you change your mind - click /start' 
      : 'Хорошо, если передумаешь - нажми /start';
    
    await ctx.reply(msg);
  });
}
