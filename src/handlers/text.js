import DB from '../database.js';
import { getMessages } from '../messages.js';
import config from '../config.js';
import { extractCodes } from '../utils/validators.js';
import { pluralize } from '../utils/helpers.js';

export function registerTextHandlers(bot) {
  bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;
    
    const user = await DB.getUser(userId);
    const MESSAGES = getMessages(user?.language || 'ru');
    
    // Игнорируем команды (они обрабатываются отдельно)
    if (text.startsWith('/')) {
      // Админ команды
      if (userId === config.telegram.adminId) {
        if (text.startsWith('/addcodes ')) {
          return handleAdminAddCodes(ctx, text, user?.language || 'ru');
        }
        if (text.startsWith('/removecode ')) {
          return handleAdminRemoveCode(ctx, text, user?.language || 'ru');
        }
        if (text === '/clearpool') {
          return handleClearPool(ctx, user?.language || 'ru');
        }
        if (text === '/clearqueue') {
          return handleClearQueue(ctx, user?.language || 'ru');
        }
        if (text === '/resetall') {
          return handleResetAll(ctx, user?.language || 'ru');
        }
        if (text.startsWith('/finduser ')) {
          return handleFindUser(ctx, text);
        }
        if (text.startsWith('/ban ')) {
          return handleBan(ctx, text);
        }
        if (text.startsWith('/unban ')) {
          return handleUnban(ctx, text);
        }
        if (text === '/poolsize') {
          return handlePoolSize(ctx, user?.language || 'ru');
        }
        if (text === '/queuesize') {
          return handleQueueSize(ctx, user?.language || 'ru');
        }
        if (text.startsWith('/broadcast ')) {
          return handleBroadcast(ctx, text, bot);
        }
        if (text === '/requesthelp') {
          return handleRequestHelp(ctx, bot);
        }
      }
      return; // Остальные команды обрабатываются в commands.js
    }
    
    if (!user) {
      return ctx.reply(MESSAGES.notInSystem, { parse_mode: 'Markdown' });
    }
    
    // УПРОЩЁННАЯ ЛОГИКА: только 3 типа обработки
    
    // 1. Возврат неиспользованного (только если флаг установлен)
    if (user.awaiting_unused_return === true) {
      return handleUnusedReturn(ctx, user);
    }
    
    // 2. Пожертвование (только если флаг установлен)
    if (user.awaiting_donation === true || user.awaiting_donation_usage === true) {
      return handleDonation(ctx, user);
    }
    
    // 3. Обычный возврат кодов (если получил инвайт и ещё не вернул)
    if (user.status === 'received' && user.codes_returned === 0) {
      return handleCodeSubmission(ctx, user);
    }
  });
}

async function handleCodeSubmission(ctx, user) {
  const text = ctx.message.text;
  const codes = extractCodes(text);
  
  const MESSAGES = getMessages(user.language || 'ru');
  
  // Проверка на бан
  if (user.is_banned) {
    return ctx.reply(
      `🚫 Ты заблокирован за отправку недействительных кодов.\n\nПричина: ${user.ban_reason || 'Нарушение правил'}`,
      { parse_mode: 'Markdown' }
    );
  }
  
  // Проверка: были ли жалобы на коды этого пользователя
  const allUsers = await DB.getAllUsers();
  const complaintsOnUserCodes = allUsers.filter(u => 
    u.invalid_codes_reported?.some(reportedCode => 
      user.codes_submitted?.includes(reportedCode)
    )
  ).length;
  
  if (complaintsOnUserCodes >= 2) {
    return ctx.reply(
      `🚫 На твои предыдущие коды поступили жалобы.\n\nОтправка новых кодов временно заблокирована.\n\nПожалуйста отправляй только действующие коды!`,
      { parse_mode: 'Markdown' }
    );
  }
  
  if (codes.length === 0) {
    return ctx.reply('❌ Не найден код. Отправь свой код из Sora (6 символов).', { 
      parse_mode: 'Markdown' 
    });
  }
  
  const code = codes[0]; // Берём первый код
  const botGivenCode = user.invite_code_given?.toUpperCase();
  
  // ПРОСТАЯ ПРОВЕРКА: код от бота блокируем, остальные принимаем
  if (botGivenCode && code === botGivenCode) {
    return ctx.reply(
      `⚠️ Это код от бота для регистрации: \`${botGivenCode}\`\n\n` +
      `Нужен код от Sora ПОСЛЕ регистрации.`,
      { parse_mode: 'Markdown' }
    );
  }
  
  try {
    // Сохраняем код для выбора количества использований
    await DB.updateUser(user.telegram_id, {
      pending_code: code,
      awaiting_usage_choice: true,
      awaiting_codes: false // Сбрасываем флаг
    });
    
    await ctx.reply(MESSAGES.chooseUsageCount(code), {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: MESSAGES.buttons.usage1, callback_data: 'usage_1' }],
          [{ text: MESSAGES.buttons.usage2, callback_data: 'usage_2' }],
          [{ text: MESSAGES.buttons.usage3, callback_data: 'usage_3' }],
          [{ text: MESSAGES.buttons.usage4, callback_data: 'usage_4' }]
        ]
      }
    });
  } catch (error) {
    console.error('Error processing code:', error);
    await ctx.reply('❌ Ошибка. Попробуй ещё раз.');
  }
}

async function handleDonation(ctx, user) {
  const text = ctx.message.text;
  const codes = extractCodes(text);
  
  const MESSAGES = getMessages(user.language || 'ru');
  
  if (codes.length === 0) {
    return ctx.reply('❌ Не найден код.', { parse_mode: 'Markdown' });
  }
  
  try {
    const code = codes[0];
    
    await DB.updateUser(user.telegram_id, {
      pending_donation_code: code,
      awaiting_donation: false,
      awaiting_donation_usage: true
    });
    
    await ctx.reply(MESSAGES.chooseUsageCount(code), {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: MESSAGES.buttons.usage1, callback_data: 'donation_usage_1' }],
          [{ text: MESSAGES.buttons.usage2, callback_data: 'donation_usage_2' }],
          [{ text: MESSAGES.buttons.usage3, callback_data: 'donation_usage_3' }],
          [{ text: MESSAGES.buttons.usage4, callback_data: 'donation_usage_4' }]
        ]
      }
    });
  } catch (error) {
    console.error('Error processing donation:', error);
    await ctx.reply('❌ Ошибка.');
  }
}

async function handleUnusedReturn(ctx, user) {
  const text = ctx.message.text;
  const codes = extractCodes(text);
  
  const MESSAGES = getMessages(user.language || 'ru');
  
  if (codes.length === 0) {
    return ctx.reply('❌ Не найден код.', { parse_mode: 'Markdown' });
  }
  
  const ownCode = user.invite_code_given?.toUpperCase();
  const returnedCode = codes[0];
  
  // Проверяем что это именно его код от бота
  if (returnedCode !== ownCode) {
    return ctx.reply(
      `❌ Это не твой код от бота.\n\nТвой код: \`${ownCode}\`\nТы отправил: \`${returnedCode}\``,
      { parse_mode: 'Markdown' }
    );
  }
  
  try {
    const addedCount = await DB.addCodesToPoolWithLimit(returnedCode, `unused:${user.telegram_id}`, 1);
    
    if (addedCount === 0) {
      await DB.updateUser(user.telegram_id, { awaiting_unused_return: false });
      return ctx.reply('❌ Этот код уже в пуле', { parse_mode: 'Markdown' });
    }
    
    await DB.updateUser(user.telegram_id, {
      status: 'returned_unused',
      awaiting_unused_return: false,
      codes_returned: 0
    });
    
    await ctx.reply(MESSAGES.unusedReturned(returnedCode, user.language), {
      parse_mode: 'Markdown'
    });
    
    try {
      await ctx.telegram.sendMessage(
        config.telegram.adminId,
        `↩️ Возврат неиспользованного от @${user.username}\nКод: ${returnedCode}`
      );
    } catch (error) {
      console.error('Admin notification failed:', error.message);
    }
  } catch (error) {
    console.error('Error processing unused return:', error);
    await ctx.reply('❌ Ошибка.');
  }
}

async function handleAdminAddCodes(ctx, text, language) {
  const params = text.replace('/addcodes ', '').trim();
  const parts = params.split(/\s+/);
  
  if (parts.length === 0) {
    return ctx.reply('❌ Формат: /addcodes КОД [КОЛИЧЕСТВО]\nПример: /addcodes ABC123 2');
  }
  
  const lastPart = parts[parts.length - 1];
  let usageCount = 1;
  let codeText = params;
  
  if (/^\d+$/.test(lastPart)) {
    usageCount = parseInt(lastPart);
    if (usageCount < 1 || usageCount > 4) {
      return ctx.reply('❌ Количество: 1-4');
    }
    codeText = parts.slice(0, -1).join(' ');
  }
  
  const codes = extractCodes(codeText);
  
  if (codes.length === 0) {
    return ctx.reply('❌ Не найден код');
  }
  
  const code = codes[0];
  const addedCount = await DB.addCodesToPoolWithLimit(code, 'admin', usageCount);
  
  if (addedCount === 0) {
    return ctx.reply(`❌ Код ${code} уже исчерпал лимит (4 макс)`);
  }
  
  return ctx.reply(`✅ Добавлен:\nКод: \`${code}\`\nИспользований: ${addedCount}`, {
    parse_mode: 'Markdown'
  });
}

async function handleAdminRemoveCode(ctx, text, language) {
  const code = text.replace('/removecode ', '').trim().toUpperCase();
  
  if (!code || code.length < 5) {
    return ctx.reply('❌ Укажи код');
  }
  
  const removed = await DB.removeCodeFromPool(code);
  
  if (removed) {
    return ctx.reply(`✅ Удалён: \`${code}\``, { parse_mode: 'Markdown' });
  } else {
    return ctx.reply(`❌ Не найден: \`${code}\``, { parse_mode: 'Markdown' });
  }
}

async function handleClearPool(ctx, language) {
  const count = await DB.clearAllAvailableCodes();
  return ctx.reply(`✅ Очищено ${count} ${pluralize(count, 'код', 'кода', 'кодов', language)} из пула`);
}

async function handleClearQueue(ctx, language) {
  const count = await DB.clearQueue();
  return ctx.reply(`✅ Очищено ${count} ${pluralize(count, 'пользователь', 'пользователя', 'пользователей', language)} из очереди`);
}

async function handleResetAll(ctx, language) {
  await ctx.reply('⚠️ Это удалит ВСЕ данные. Уверен? Отправь /confirmedreset');
}

async function handleBan(ctx, text) {
  const params = text.replace('/ban ', '').trim();
  const parts = params.split(' ');
  const username = parts[0];
  const reason = parts.slice(1).join(' ') || 'Нарушение правил';
  
  if (!username) {
    return ctx.reply('❌ Формат: /ban @username причина\nПример: /ban @user123 Фейковые коды');
  }
  
  const user = await DB.getUserByUsername(username);
  
  if (!user) {
    return ctx.reply(`❌ Пользователь ${username} не найден`);
  }
  
  await DB.banUser(user.telegram_id, reason);
  
  // Экранируем спецсимволы Markdown в username
  const safeUsername = user.username.replace(/_/g, '\\_');
  
  return ctx.reply(`✅ Забанен: @${safeUsername}\nПричина: ${reason}`, { 
    parse_mode: 'Markdown' 
  });
}

async function handleUnban(ctx, text) {
  const username = text.replace('/unban ', '').trim();
  
  if (!username) {
    return ctx.reply('❌ Формат: /unban @username');
  }
  
  const user = await DB.getUserByUsername(username);
  
  if (!user) {
    return ctx.reply(`❌ Пользователь ${username} не найден`);
  }
  
  await DB.unbanUser(user.telegram_id);
  
  const safeUsername = user.username.replace(/_/g, '\\_');
  
  return ctx.reply(`✅ Разбанен: @${safeUsername}`, {
    parse_mode: 'Markdown'
  });
}

async function handleFindUser(ctx, text) {
  const userId = text.replace('/finduser ', '').trim();
  
  if (!userId) {
    return ctx.reply('❌ Укажи ID: /finduser 12345');
  }
  
  const user = await DB.getUser(userId);
  
  if (!user) {
    return ctx.reply(`❌ Пользователь ${userId} не найден`);
  }
  
  const queuePos = await DB.getQueuePosition(userId);
  
  // Экранируем спецсимволы в username
  const safeUsername = user.username.replace(/_/g, '\\_');
  
  const info = `👤 Пользователь

ID: \`${user.telegram_id}\`
Username: @${safeUsername}
Статус: ${user.status}
Очередь: ${queuePos || '-'}
${user.is_banned ? `\n🚫 ЗАБАНЕН: ${user.ban_reason}` : ''}

Получил код: ${user.invite_code_given || '-'}
Вернул: ${user.codes_returned}
Инвайтов получено: ${user.invites_received_count || 0}`;

  return ctx.reply(info, { parse_mode: 'Markdown' });
}

async function handlePoolSize(ctx, language) {
  const size = await DB.getPoolSize();
  return ctx.reply(`💎 Кодов в пуле: **${size}**`, { parse_mode: 'Markdown' });
}

async function handleQueueSize(ctx, language) {
  const size = await DB.getQueueSize();
  return ctx.reply(`👥 В очереди: **${size}**`, { parse_mode: 'Markdown' });
}

async function handleRequestHelp(ctx, bot) {
  const allUsers = await DB.getAllUsers();
  
  // Находим пользователей кто:
  // 1. Получил инвайт (received или completed)
  // 2. НЕ поделился всеми 4 использованиями
  const targetUsers = allUsers.filter(u => 
    (u.status === 'received' || u.status === 'completed') &&
    (u.usage_count_shared || 0) < 4 &&
    !u.is_banned
  );
  
  if (targetUsers.length === 0) {
    return ctx.reply('❌ Нет подходящих пользователей для запроса помощи');
  }
  
  let successCount = 0;
  let failCount = 0;
  
  await ctx.reply(`🚀 Запрос помощи для ${targetUsers.length} пользователей...`);
  
  for (const user of targetUsers) {
    try {
      const MESSAGES = getMessages(user.language || 'ru');
      
      const helpMessage = user.language === 'en'
        ? `🔥 **GONDOR CALLS FOR AID!**

The invite pool is empty. People are waiting in queue.

**Will you answer the call?**

Even 1 extra invite use will help someone get access to Sora!`
        : `🔥 **ГОНДОР ЗОВЁТ НА ПОМОЩЬ!**

Пул инвайтов опустел. Люди ждут в очереди.

**Поможешь ли ты?**

Даже 1 дополнительное использование инвайта поможет кому-то получить доступ!`;
      
      await bot.telegram.sendMessage(user.telegram_id, helpMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: MESSAGES.buttons.rohanAnswers, callback_data: 'rohan_answers' }
          ]]
        }
      });
      successCount++;
      
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      failCount++;
      console.error(`Help request failed for ${user.telegram_id}:`, error.message);
    }
  }
  
  return ctx.reply(`✅ Запрос помощи отправлен!\nУспешно: ${successCount}\nОшибок: ${failCount}`);
}

async function handleBroadcast(ctx, text, bot) {
  const message = text.replace('/broadcast ', '');
  
  if (!message) {
    return ctx.reply('❌ Укажи текст');
  }
  
  const allUsers = await DB.getAllUsers();
  let successCount = 0;
  let failCount = 0;
  
  await ctx.reply(`🚀 Рассылка для ${allUsers.length} пользователей...`);
  
  for (const user of allUsers) {
    try {
      await bot.telegram.sendMessage(user.telegram_id, message, { parse_mode: 'Markdown' });
      successCount++;
      await new Promise(resolve => setTimeout(resolve, 50));
    } catch (error) {
      failCount++;
      console.error(`Broadcast failed for ${user.telegram_id}:`, error.message);
    }
  }
  
  return ctx.reply(`✅ Готово!\nУспешно: ${successCount}\nОшибок: ${failCount}`);
}
