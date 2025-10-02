import DB from '../database.js';
import { getMessages } from '../messages.js';
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
    
    // Если пользователь уже получил инвайт, показываем дополнительные кнопки
    if (user.status === 'received') {
      await ctx.reply(MESSAGES.welcome, {
        reply_markup: {
          inline_keyboard: [
            [{ text: MESSAGES.buttons.wantInvite, callback_data: 'want_invite' }],
            [{ text: MESSAGES.buttons.submitCodes, callback_data: 'submit_codes' }],
            [{ text: MESSAGES.buttons.returnUnused, callback_data: 'return_unused' }],
            [{ text: MESSAGES.buttons.reportInvalid, callback_data: 'report_invalid' }],
            [{ text: MESSAGES.buttons.donateCodes, callback_data: 'donate_codes' }]
          ]
        },
        parse_mode: 'Markdown'
      });
    } else {
      await ctx.reply(MESSAGES.welcome, {
        reply_markup: {
          inline_keyboard: [
            [{ text: MESSAGES.buttons.wantInvite, callback_data: 'want_invite' }],
            [{ text: MESSAGES.buttons.donateCodes, callback_data: 'donate_codes' }]
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
}
