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
        if (text === '/poolsize') {
          return handlePoolSize(ctx, user?.language || 'ru');
        }
        if (text === '/queuesize') {
          return handleQueueSize(ctx, user?.language || 'ru');
        }
        if (text.startsWith('/broadcast ')) {
          return handleBroadcast(ctx, text, bot);
        }
      }
      return; // Остальные команды обрабатываются в commands.js
    }
    
    // Обработка возврата кодов
    if (!user) {
      return ctx.reply(MESSAGES.notInSystem, { parse_mode: 'Markdown' });
    }
    
    // Проверяем флаги в правильном порядке
    
    // 1. Возврат неиспользованного инвайта (специфичный флаг)
    if (user.awaiting_unused_return) {
      return handleUnusedReturn(ctx, user);
    }
    
    // 2. Пожертвование (специфичный флаг)
    if (user.awaiting_donation || user.awaiting_donation_usage) {
      return handleDonation(ctx, user);
    }
    
    // 3. Обычный возврат кодов после регистрации (awaiting_codes ИЛИ статус received)
    if (user.awaiting_codes || user.status === 'received') {
      return handleCodeSubmission(ctx, user);
    }
  });
}

async function handleCodeSubmission(ctx, user) {
  const text = ctx.message.text;
  const codes = extractCodes(text);
  
  const MESSAGES = getMessages(user.language || 'ru');
  
  if (codes.length === 0) {
    const msg = user.language === 'en'
      ? '❌ No valid codes found. Send codes in format:\n```\ncode1\ncode2\n```'
      : '❌ Не найдено валидных кодов. Отправь коды в формате:\n```\nкод1\nкод2\n```';
    return ctx.reply(msg, { parse_mode: 'Markdown' });
  }
  
  // Защита: проверяем что пользователь НЕ отправляет код который получил от БОТА
  const botGivenCode = user.invite_code_given?.toUpperCase();
  const validCodes = codes.filter(code => code !== botGivenCode);
  
  if (validCodes.length < codes.length) {
    // Пользователь отправил код который получил от бота
    const MESSAGES = getMessages(user.language || 'ru');
    
    // Предлагаем вернуть неиспользованный инвайт (если не зарегистрировался)
    await ctx.reply(MESSAGES.ownCodeDetected(botGivenCode, user.language), {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: MESSAGES.buttons.returnUnused, callback_data: 'return_unused' }
        ]]
      }
    });
    
    if (validCodes.length === 0) {
      return; // Отправил только код от бота
    }
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
    const msg = user.language === 'en'
      ? '✅ You\'ve already returned all required codes. Thank you!'
      : '✅ Ты уже вернул все необходимые коды. Спасибо!';
    return ctx.reply(msg, { parse_mode: 'Markdown' });
  }
  
  if (validCodes.length === 0) {
    const msg = user.language === 'en'
      ? '❌ No valid codes found.'
      : '❌ Не найдено валидных кодов.';
    return ctx.reply(msg, { parse_mode: 'Markdown' });
  }
  
  // Принимаем сколько есть (не требуем все сразу)
  const codesToAdd = validCodes.slice(0, neededCodes);
  
  try {
    // Сохраняем код временно для выбора количества использований
    const code = codesToAdd[0];
    
    await DB.updateUser(user.telegram_id, {
      pending_code: code,
      awaiting_codes: false,
      awaiting_usage_choice: true
    });
    
    const MESSAGES = getMessages(user.language || 'ru');
    
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
    console.error('Error processing codes:', error);
    const msg = user.language === 'en'
      ? '❌ An error occurred while processing codes. Try again.'
      : '❌ Произошла ошибка при обработке кодов. Попробуй еще раз.';
    await ctx.reply(msg);
  }
}

async function handleDonation(ctx, user) {
  const text = ctx.message.text;
  const codes = extractCodes(text);
  
  const MESSAGES = getMessages(user.language || 'ru');
  
  if (codes.length === 0) {
    const msg = user.language === 'en'
      ? '❌ No valid code found. Send your invite code from Sora.'
      : '❌ Не найден валидный код. Отправь свой инвайт-код из Sora.';
    return ctx.reply(msg, { parse_mode: 'Markdown' });
  }
  
  try {
    // Сохраняем код для выбора количества использований
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
    const msg = user.language === 'en'
      ? '❌ An error occurred while processing code. Try again.'
      : '❌ Произошла ошибка при обработке кода. Попробуй еще раз.';
    await ctx.reply(msg);
  }
}

async function handleAdminAddCodes(ctx, text, language) {
  const params = text.replace('/addcodes ', '').trim();
  
  // Проверяем формат: "/addcodes КОД КОЛИЧЕСТВО" или "/addcodes КОД"
  const parts = params.split(/\s+/);
  
  if (parts.length === 0) {
    return ctx.reply('❌ Формат: /addcodes КОД [КОЛИЧЕСТВО]\nПример: /addcodes ABC123 2');
  }
  
  // Если указано количество (последний параметр число)
  const lastPart = parts[parts.length - 1];
  let usageCount = 1;
  let codeText = params;
  
  if (/^\d+$/.test(lastPart)) {
    usageCount = parseInt(lastPart);
    if (usageCount < 1 || usageCount > 4) {
      return ctx.reply('❌ Количество использований должно быть от 1 до 4');
    }
    // Убираем число из текста
    codeText = parts.slice(0, -1).join(' ');
  }
  
  // Извлекаем код
  const codes = extractCodes(codeText);
  
  if (codes.length === 0) {
    const msg = language === 'en' ? '❌ No valid codes found' : '❌ Не найдено валидных кодов';
    return ctx.reply(msg);
  }
  
  const code = codes[0];
  
  // Добавляем с указанным количеством использований
  const addedCount = await DB.addCodesToPoolWithLimit(code, 'admin', usageCount);
  
  if (addedCount === 0) {
    return ctx.reply(`❌ Код ${code} уже исчерпал лимит использований (4 макс)`);
  }
  
  const msg = language === 'en'
    ? `✅ Added code to pool:\nCode: \`${code}\`\nUses: ${addedCount} (added ${addedCount} times)`
    : `✅ Добавлен код в пул:\nКод: \`${code}\`\nИспользований: ${addedCount} (добавлено ${addedCount} раз)`;
  
  return ctx.reply(msg, { parse_mode: 'Markdown' });
}

async function handleAdminRemoveCode(ctx, text, language) {
  const code = text.replace('/removecode ', '').trim().toUpperCase();
  
  if (!code || code.length < 5) {
    const msg = language === 'en' ? '❌ Specify code to remove' : '❌ Укажи код для удаления';
    return ctx.reply(msg);
  }
  
  const removed = await DB.removeCodeFromPool(code);
  
  if (removed) {
    const msg = language === 'en'
      ? `✅ Code removed from pool: \`${code}\``
      : `✅ Код удалён из пула: \`${code}\``;
    return ctx.reply(msg, { parse_mode: 'Markdown' });
  } else {
    const msg = language === 'en'
      ? `❌ Code not found in pool: \`${code}\``
      : `❌ Код не найден в пуле: \`${code}\``;
    return ctx.reply(msg, { parse_mode: 'Markdown' });
  }
}

async function handleClearPool(ctx, language) {
  const count = await DB.clearAllAvailableCodes();
  
  const msg = language === 'en'
    ? `✅ Cleared ${count} code${count !== 1 ? 's' : ''} from pool`
    : `✅ Очищено ${count} ${pluralize(count, 'код', 'кода', 'кодов', language)} из пула`;
  
  return ctx.reply(msg);
}

async function handleClearQueue(ctx, language) {
  const count = await DB.clearQueue();
  
  const msg = language === 'en'
    ? `✅ Cleared ${count} user${count !== 1 ? 's' : ''} from queue`
    : `✅ Очищено ${count} ${pluralize(count, 'пользователь', 'пользователя', 'пользователей', language)} из очереди`;
  
  return ctx.reply(msg);
}

async function handleResetAll(ctx, language) {
  await ctx.reply('⚠️ Это удалит ВСЕ данные (пользователей, очередь, коды). Уверен? Отправь /confirmedreset');
}

async function handleFindUser(ctx, text) {
  const userId = text.replace('/finduser ', '').trim();
  
  if (!userId) {
    return ctx.reply('❌ Укажи ID пользователя: /finduser 12345');
  }
  
  const user = await DB.getUser(userId);
  
  if (!user) {
    return ctx.reply(`❌ Пользователь с ID ${userId} не найден`);
  }
  
  const queuePos = await DB.getQueuePosition(userId);
  
  const info = `👤 **Пользователь найден**

ID: \`${user.telegram_id}\`
Username: @${user.username}
Язык: ${user.language === 'en' ? 'English' : 'Русский'}
Статус: ${user.status}
Позиция в очереди: ${queuePos || 'Нет'}

Получил инвайт: ${user.invite_code_given || 'Нет'}
Вернул кодов: ${user.codes_returned}

Дата регистрации: ${user.requested_at ? new Date(user.requested_at.toDate()).toLocaleString('ru-RU') : 'N/A'}
Дата получения инвайта: ${user.invite_sent_at ? new Date(user.invite_sent_at.toDate()).toLocaleString('ru-RU') : 'N/A'}`;

  return ctx.reply(info, { parse_mode: 'Markdown' });
}

async function handlePoolSize(ctx, language) {
  const size = await DB.getPoolSize();
  const msg = language === 'en'
    ? `💎 Codes in pool: **${size}**`
    : `💎 Кодов в пуле: **${size}**`;
  return ctx.reply(msg, { parse_mode: 'Markdown' });
}

async function handleQueueSize(ctx, language) {
  const size = await DB.getQueueSize();
  const msg = language === 'en'
    ? `👥 In queue: **${size}**`
    : `👥 В очереди: **${size}**`;
  return ctx.reply(msg, { parse_mode: 'Markdown' });
}

async function handleUnusedReturn(ctx, user) {
  const text = ctx.message.text;
  const codes = extractCodes(text);
  
  const MESSAGES = getMessages(user.language || 'ru');
  
  if (codes.length === 0) {
    const msg = user.language === 'en'
      ? '❌ No valid codes found. Send the invite code you received.'
      : '❌ Не найдено валидных кодов. Отправь инвайт-код, который получил.';
    return ctx.reply(msg, { parse_mode: 'Markdown' });
  }
  
  const ownCode = user.invite_code_given?.toUpperCase();
  const returnedCode = codes[0];
  
  // Проверяем что это именно его код
  if (returnedCode !== ownCode) {
    const msg = user.language === 'en'
      ? `❌ This is not your invite code.\n\nYour code: \`${ownCode}\`\nYou sent: \`${returnedCode}\``
      : `❌ Это не твой инвайт-код.\n\nТвой код: \`${ownCode}\`\nТы отправил: \`${returnedCode}\``;
    return ctx.reply(msg, { parse_mode: 'Markdown' });
  }
  
  try {
    // Возвращаем код обратно в пул (проверка дубликатов)
    const addedCount = await DB.addCodesToPool([returnedCode], `unused:${user.telegram_id}`);
    
    if (addedCount === 0) {
      const msg = user.language === 'en'
        ? '❌ This code is already in the pool'
        : '❌ Этот код уже есть в пуле';
      await DB.updateUser(user.telegram_id, { awaiting_unused_return: false });
      return ctx.reply(msg, { parse_mode: 'Markdown' });
    }
    
    // Обновляем статус пользователя
    await DB.updateUser(user.telegram_id, {
      status: 'returned_unused',
      awaiting_unused_return: false,
      codes_returned: 0 // Сбрасываем, т.к. не требуем возврата
    });
    
    await ctx.reply(MESSAGES.unusedReturned(returnedCode, user.language), {
      parse_mode: 'Markdown'
    });
    
    // Уведомление админу
    try {
      await ctx.telegram.sendMessage(
        config.telegram.adminId,
        `↩️ Возврат неиспользованного инвайта от @${user.username}\nКод: ${returnedCode}`
      );
    } catch (error) {
      console.error('Admin notification failed:', error.message);
    }
  } catch (error) {
    console.error('Error processing unused return:', error);
    const msg = user.language === 'en'
      ? '❌ An error occurred. Try again.'
      : '❌ Произошла ошибка. Попробуй еще раз.';
    await ctx.reply(msg);
  }
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
