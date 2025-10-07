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
            [{ text: MESSAGES.buttons.wantInvite, callback_data: 'want_invite' }]
          ]
        },
        parse_mode: 'Markdown'
      });
    } else {
      // Для всех остальных: поделиться или запросить
      await ctx.reply(MESSAGES.welcome, {
        reply_markup: {
          inline_keyboard: [
            [{ text: MESSAGES.buttons.shareCode, callback_data: 'share_code' }],
            [{ text: MESSAGES.buttons.wantInvite, callback_data: 'want_invite' }]
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
          { text: MESSAGES.generateOptions.basic4s, callback_data: 'gen_basic4s' }
        ],[
          { text: MESSAGES.generateOptions.pro4s, callback_data: 'gen_pro4s' }
        ],[
          { text: MESSAGES.generateOptions.bundles, callback_data: 'gen_bundles' },
          { text: MESSAGES.generateOptions.constructor, callback_data: 'gen_constructor' }
        ]]
      },
      parse_mode: 'Markdown'
    });
  });
}
