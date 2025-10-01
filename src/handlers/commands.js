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
    
    // Если пользователь уже получил инвайт, показываем кнопку для возврата кодов
    if (user.status === 'received') {
      await ctx.reply(MESSAGES.welcome, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎫 Хочу инвайт', callback_data: 'want_invite' }],
            [{ text: '📨 Отправить коды', callback_data: 'submit_codes' }]
          ]
        },
        parse_mode: 'Markdown'
      });
    } else {
      await ctx.reply(MESSAGES.welcome, {
        reply_markup: {
          inline_keyboard: [[
            { text: '🎫 Хочу инвайт', callback_data: 'want_invite' }
          ]]
        },
        parse_mode: 'Markdown'
      });
    }
  });

  // /stats
  bot.command('stats', async (ctx) => {
    const userId = ctx.from.id;
    const user = await DB.getUser(userId);
    
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
    
    // Админу показываем дополнительные команды
    if (userId === config.telegram.adminId) {
      await ctx.reply(MESSAGES.help + '\n\n' + MESSAGES.adminHelp, { 
        parse_mode: 'Markdown' 
      });
    } else {
      await ctx.reply(MESSAGES.help, { parse_mode: 'Markdown' });
    }
  });
}

