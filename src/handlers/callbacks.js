import DB from '../database.js';
import { getMessages } from '../messages.js';
import config from '../config.js';

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
    
    // Устанавливаем флаг ожидания кодов
    await DB.updateUser(userId, {
      awaiting_codes: true
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
