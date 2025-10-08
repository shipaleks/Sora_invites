import DB from '../database.js';
import { getMessages } from '../messages.js';
import config from '../config.js';
import { enhancePromptWithCookbook, createSoraVideo, pollSoraVideo, soraQueue, Stars, SoraPricing } from '../sora.js';
import { validateSoraPrompt } from '../utils/validators.js';

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
    
    // SHADOW BAN: показываем интерфейс, но ограничиваем
    if (user.is_banned) {
      console.log(`[SHADOW BAN] Banned user @${user.username} accessed /start`);
      // Показываем обычное приветствие для забаненных
      const MESSAGES = getMessages(user.language || 'ru');
      return ctx.reply(MESSAGES.welcome, {
        reply_markup: {
          inline_keyboard: [
            [{ text: MESSAGES.buttons.shareCode, callback_data: 'share_code' }],
            [{ text: MESSAGES.buttons.wantInvite, callback_data: 'want_invite' }]
          ]
        },
        parse_mode: 'Markdown'
      });
    }
    
    // Если язык не выбран, показываем выбор языка
    if (!user.language) {
      const MESSAGES = getMessages('ru'); // Показываем на русском по умолчанию
      return ctx.reply(MESSAGES.languageSelect, {
        reply_markup: {
          inline_keyboard: [[
            { text: MESSAGES.buttons.russian, callback_data: 'lang_ru' },
            { text: MESSAGES.buttons.english, callback_data: 'lang_en' }
          ]]
        }
      });
    }
    
    const MESSAGES = getMessages(user.language);
    
    // Если пользователь уже получил инвайт, ПРИОРИТЕТ - поделиться кодом!
    if (user.status === 'received') {
      await ctx.reply(MESSAGES.welcome, {
        reply_markup: {
          inline_keyboard: [
            [{ text: MESSAGES.buttons.shareCode, callback_data: 'share_code' }],
            [{ text: MESSAGES.buttons.returnUnused, callback_data: 'return_unused' }],
            [{ text: MESSAGES.buttons.reportInvalid, callback_data: 'report_invalid' }],
            [{ text: MESSAGES.buttons.wantInvite, callback_data: 'want_invite' }],
            [{ text: MESSAGES.buttons.generateVideo, callback_data: 'start_generate' }]
          ]
        },
        parse_mode: 'Markdown'
      });
    } else {
      // Для всех остальных: поделиться или запросить + генерация
      await ctx.reply(MESSAGES.welcome, {
        reply_markup: {
          inline_keyboard: [
            [{ text: MESSAGES.buttons.wantInvite, callback_data: 'want_invite' }],
            [{ text: MESSAGES.buttons.shareCode, callback_data: 'share_code' }],
            [{ text: MESSAGES.buttons.generateVideo, callback_data: 'start_generate' }]
          ]
        },
        parse_mode: 'Markdown'
      });
    }
  });

  // /stats
  bot.command('stats', async (ctx) => {
    const userId = ctx.from.id;
    const user = await DB.getUser(userId);
    
    const MESSAGES = getMessages(user?.language || 'ru');
    
    if (!user) {
      return ctx.reply(MESSAGES.notInSystem, { parse_mode: 'Markdown' });
    }
    
    // SHADOW BAN: показываем фейковую статистику
    if (user.is_banned) {
      console.log(`[SHADOW BAN] Banned user @${user.username} accessed /stats`);
      const fakeStats = user.language === 'en' 
        ? '📊 **Your Stats**\n\n✅ Position in queue: Not in queue\n📦 Pool size: 15 codes\n👥 Queue size: 3 people\n🎁 Codes returned: 0'
        : '📊 **Твоя статистика**\n\n✅ Позиция в очереди: Не в очереди\n📦 Размер пула: 15 кодов\n👥 Размер очереди: 3 человека\n🎁 Возвращено кодов: 0';
      return ctx.reply(fakeStats, { parse_mode: 'Markdown' });
    }
    
    const position = await DB.getQueuePosition(userId);
    const poolSize = await DB.getPoolSize();
    const queueSize = await DB.getQueueSize();
    
    await ctx.reply(
      MESSAGES.stats(position, poolSize, queueSize, user.codes_returned),
      { parse_mode: 'Markdown' }
    );
  });
  
  // /help
  bot.command('help', async (ctx) => {
    const userId = ctx.from.id;
    const user = await DB.getUser(userId);
    
    const MESSAGES = getMessages(user?.language || 'ru');
    
    // Админу показываем дополнительные команды
    if (userId === config.telegram.adminId) {
      await ctx.reply(MESSAGES.help + '\n\n' + MESSAGES.adminHelp, { 
        parse_mode: 'Markdown' 
      });
    } else {
      await ctx.reply(MESSAGES.help, { parse_mode: 'Markdown' });
    }
  });

  // /confirmedreset (admin)
  bot.command('confirmedreset', async (ctx) => {
    const userId = ctx.from.id;
    if (userId !== config.telegram.adminId) {
      return; // игнорируем не-админов
    }

    try {
      await ctx.reply('🧹 Выполняю полный сброс...');
      const clearedPool = await DB.clearAllAvailableCodes();
      const clearedQueue = await DB.clearQueue();
      const clearedUsers = await DB.resetAllUsers();
      await ctx.reply(`✅ Готово!\nПул: -${clearedPool}\nОчередь: -${clearedQueue}\nПользователи: -${clearedUsers}`);
    } catch (error) {
      console.error('Reset error:', error);
      await ctx.reply('❌ Ошибка при сбросе. См. логи.');
    }
  });

  // /language - смена языка
  bot.command('language', async (ctx) => {
    const userId = ctx.from.id;
    const user = await DB.getUser(userId);
    
    const MESSAGES = getMessages(user?.language || 'ru');
    
    await ctx.reply(MESSAGES.languageSelect, {
      reply_markup: {
        inline_keyboard: [[
          { text: MESSAGES.buttons.russian, callback_data: 'lang_ru' },
          { text: MESSAGES.buttons.english, callback_data: 'lang_en' }
        ]]
      }
    });
  });

  // /refunduser (admin only)
  bot.command('refunduser', async (ctx) => {
    const userId = ctx.from.id;
    if (userId !== config.telegram.adminId) {
      return;
    }

    console.log('[Refund] Command received via bot.command');

    const text = ctx.message.text;
    const parts = text.replace('/refunduser ', '').trim().split(/\s+/);
    
    if (parts.length < 2) {
      return ctx.reply('❌ Формат: /refunduser @username TX_ID\nПример: /refunduser @user123 abc123xyz');
    }
    
    const username = parts[0];
    const txId = parts[1];
    
    console.log('[Refund] Processing:', { username, txId });
    
    try {
      const user = await DB.getUser(userId);
      const targetUser = await DB.getUserByUsername(username);
      if (!targetUser) {
        return ctx.reply(`❌ Пользователь ${username} не найден`);
      }
      
      console.log('[Refund] User found:', targetUser.telegram_id);
      
      const tx = await DB.getSoraTransaction(txId);
      if (!tx) {
        return ctx.reply(`❌ Транзакция ${txId} не найдена`);
      }
      
      console.log('[Refund] Transaction found:', tx);
      
      if (tx.status === 'refunded') {
        return ctx.reply(`⚠️ Эта транзакция уже была возвращена ранее`);
      }
      
      if (!tx.telegram_charge_id) {
        return ctx.reply(`❌ Charge ID не найден в транзакции. Рефанд невозможен.\n\nTX data: ${JSON.stringify(tx, null, 2)}`);
      }
      
      await ctx.reply(`⏳ Выполняю рефанд ${tx.stars_paid}⭐ для @${targetUser.username}...`);
      
      // Делаем рефанд через raw API (Telegraf 4.15 не поддерживает refundStarPayment)
      console.log('[Refund] Calling refundStarPayment via raw API:', {
        userId: targetUser.telegram_id,
        chargeId: tx.telegram_charge_id
      });
      
      const refundResp = await fetch(`https://api.telegram.org/bot${config.telegram.token}/refundStarPayment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: parseInt(targetUser.telegram_id),
          telegram_payment_charge_id: tx.telegram_charge_id
        })
      });
      
      const refundData = await refundResp.json();
      if (!refundData.ok) {
        throw new Error(`Refund API failed: ${JSON.stringify(refundData)}`);
      }
      
      console.log('[Refund] Refund successful');
      
      // Обновляем статус
      await DB.updateSoraTransaction(txId, {
        status: 'refunded',
        refunded_by_admin: true,
        refunded_at: new Date()
      });
      
      // Уведомляем пользователя
      try {
        await ctx.telegram.sendMessage(
          parseInt(targetUser.telegram_id),
          `↩️ Возврат ${tx.stars_paid}⭐\n\nТранзакция: ${txId}\n\nТвои звёзды возвращены администратором.`
        );
      } catch (e) {
        console.error('[Refund] User notification failed:', e.message);
      }
      
      return ctx.reply(`✅ Рефанд выполнен\n\nUser: @${targetUser.username} (${targetUser.telegram_id})\nTX: ${txId}\nStars: ${tx.stars_paid}⭐\nCharge: ${tx.telegram_charge_id}`);
      
    } catch (error) {
      console.error('[Refund] Error:', error);
      return ctx.reply(`❌ Ошибка рефанда: ${error.message}\n\nStack: ${error.stack}`);
    }
  });

  // /generate (admin only test flow)
  bot.command('generate', async (ctx) => {
    const userId = ctx.from.id;
    if (userId !== config.telegram.adminId) {
      return;
    }

    const user = await DB.getUser(userId);
    const MESSAGES = getMessages(user?.language || 'ru');

    await ctx.reply(MESSAGES.generateAdminIntro, {
      reply_markup: {
        inline_keyboard: [[
          { text: '✨ ' + MESSAGES.generateOptions.basic4s, callback_data: 'gen_basic4s' }
        ],[
          { text: '💎 ' + MESSAGES.generateOptions.pro4s, callback_data: 'gen_pro4s' }
        ],[
          // { text: '🎁 ' + MESSAGES.generateOptions.bundles, callback_data: 'gen_bundles' },
          { text: '⚙️ ' + MESSAGES.generateOptions.constructor, callback_data: 'gen_constructor' }
        ]]
      },
      parse_mode: 'Markdown'
    });
  });
}
