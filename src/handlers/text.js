import DB from '../database.js';
import { MESSAGES } from '../messages.js';
import config from '../config.js';
import { extractCodes } from '../utils/validators.js';
import { pluralize } from '../utils/helpers.js';

export function registerTextHandlers(bot) {
  bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;
    
    // Игнорируем команды (они обрабатываются отдельно)
    if (text.startsWith('/')) {
      // Админ команды
      if (userId === config.telegram.adminId) {
        if (text.startsWith('/addcodes ')) {
          return handleAdminAddCodes(ctx, text);
        }
        if (text === '/poolsize') {
          return handlePoolSize(ctx);
        }
        if (text === '/queuesize') {
          return handleQueueSize(ctx);
        }
        if (text.startsWith('/broadcast ')) {
          return handleBroadcast(ctx, text, bot);
        }
      }
      return; // Остальные команды обрабатываются в commands.js
    }
    
    // Обработка возврата кодов
    const user = await DB.getUser(userId);
    if (!user) {
      return ctx.reply(MESSAGES.notInSystem, { parse_mode: 'Markdown' });
    }
    
    // Если пользователь получил инвайт, принимаем коды
    if (user.status === 'received') {
      return handleCodeSubmission(ctx, user);
    }
  });
}

async function handleCodeSubmission(ctx, user) {
  const text = ctx.message.text;
  const codes = extractCodes(text);
  
  if (codes.length === 0) {
    return ctx.reply(
      '❌ Не найдено валидных кодов. Отправь коды в формате:\n```\nкод1\nкод2\n```',
      { parse_mode: 'Markdown' }
    );
  }
  
  // Определить сколько кодов нужно
  const allUsers = await DB.getAllUsers();
  const usersWithInvites = allUsers
    .filter(u => u.invite_sent_at)
    .sort((a, b) => {
      const timeA = a.invite_sent_at?.toDate?.() || new Date(0);
      const timeB = b.invite_sent_at?.toDate?.() || new Date(0);
      return timeA - timeB;
    });
  
  const userIndex = usersWithInvites.findIndex(u => u.telegram_id === user.telegram_id) + 1;
  const codesRequired = userIndex <= 10 ? 
    config.rules.first10CodesRequired : 
    config.rules.regularCodesRequired;
  
  const neededCodes = codesRequired - user.codes_returned;
  
  if (neededCodes <= 0) {
    return ctx.reply('✅ Ты уже вернул все необходимые коды. Спасибо!', {
      parse_mode: 'Markdown'
    });
  }
  
  if (codes.length < neededCodes) {
    return ctx.reply(
      `❌ Нужно **${neededCodes}** ${pluralize(neededCodes, 'код', 'кода', 'кодов')}.\n` +
      `Отправлено только **${codes.length}**.`,
      { parse_mode: 'Markdown' }
    );
  }
  
  const codesToAdd = codes.slice(0, neededCodes);
  
  try {
    // Добавить в пул
    await DB.addCodesToPool(codesToAdd, user.telegram_id);
    
    const newTotal = user.codes_returned + codesToAdd.length;
    
    await DB.updateUser(user.telegram_id, {
      codes_returned: newTotal,
      codes_submitted: [...(user.codes_submitted || []), ...codesToAdd],
      status: newTotal >= codesRequired ? 'completed' : 'received',
      awaiting_codes: false
    });
    
    await ctx.reply(MESSAGES.codesReceived(newTotal), {
      parse_mode: 'Markdown'
    });

    // Уведомление админу
    try {
      await ctx.telegram.sendMessage(
        config.telegram.adminId,
        `✅ Коды получены от @${user.username}: ${codesToAdd.length} шт.`
      );
    } catch (error) {
      console.error('Admin notification failed:', error.message);
    }
  } catch (error) {
    console.error('Error processing codes:', error);
    await ctx.reply('❌ Произошла ошибка при обработке кодов. Попробуй еще раз.');
  }
}

async function handleAdminAddCodes(ctx, text) {
  const codes = text
    .replace('/addcodes ', '')
    .split(/\s+/)
    .filter(c => c.length >= 5);
  
  if (codes.length === 0) {
    return ctx.reply('❌ Не указаны валидные коды');
  }
  
  await DB.addCodesToPool(codes, 'admin');
  return ctx.reply(`✅ Добавлено ${codes.length} ${pluralize(codes.length, 'код', 'кода', 'кодов')} в пул`);
}

async function handlePoolSize(ctx) {
  const size = await DB.getPoolSize();
  return ctx.reply(`💎 Кодов в пуле: **${size}**`, { parse_mode: 'Markdown' });
}

async function handleQueueSize(ctx) {
  const size = await DB.getQueueSize();
  return ctx.reply(`👥 В очереди: **${size}**`, { parse_mode: 'Markdown' });
}

async function handleBroadcast(ctx, text, bot) {
  const message = text.replace('/broadcast ', '');
  
  if (!message) {
    return ctx.reply('❌ Укажи текст для рассылки');
  }
  
  const allUsers = await DB.getAllUsers();
  let successCount = 0;
  let failCount = 0;
  
  await ctx.reply(`🚀 Начинаю рассылку для ${allUsers.length} пользователей...`);
  
  for (const user of allUsers) {
    try {
      await bot.telegram.sendMessage(user.telegram_id, message, { parse_mode: 'Markdown' });
      successCount++;
      
      // Задержка чтобы не словить rate limit
      await new Promise(resolve => setTimeout(resolve, 50));
    } catch (error) {
      failCount++;
      console.error(`Broadcast failed for ${user.telegram_id}:`, error.message);
    }
  }
  
  return ctx.reply(
    `✅ Рассылка завершена!\n` +
    `Успешно: ${successCount}\n` +
    `Ошибок: ${failCount}`
  );
}

