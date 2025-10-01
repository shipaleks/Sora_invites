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
    
    // Если пользователь хочет пожертвовать коды
    if (user.awaiting_donation) {
      return handleDonation(ctx, user);
    }
    
    // Если пользователь возвращает неиспользованный инвайт
    if (user.awaiting_unused_return) {
      return handleUnusedReturn(ctx, user);
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
  
  const MESSAGES = getMessages(user.language || 'ru');
  
  if (codes.length === 0) {
    const msg = user.language === 'en'
      ? '❌ No valid codes found. Send codes in format:\n```\ncode1\ncode2\n```'
      : '❌ Не найдено валидных кодов. Отправь коды в формате:\n```\nкод1\nкод2\n```';
    return ctx.reply(msg, { parse_mode: 'Markdown' });
  }
  
  // Защита: проверяем что пользователь не отправляет свой собственный код
  const ownCode = user.invite_code_given?.toUpperCase();
  const validCodes = codes.filter(code => code !== ownCode);
  
  if (validCodes.length < codes.length) {
    const MESSAGES = getMessages(user.language || 'ru');
    
    // Предлагаем вернуть неиспользованный инвайт
    await ctx.reply(MESSAGES.ownCodeDetected(ownCode, user.language), {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: MESSAGES.buttons.returnUnused, callback_data: 'return_unused' }
        ]]
      }
    });
    
    if (validCodes.length === 0) {
      return; // Все коды были собственными
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
  
  if (validCodes.length < neededCodes) {
    const msg = user.language === 'en'
      ? `❌ Need **${neededCodes}** code${neededCodes > 1 ? 's' : ''}.\nOnly **${validCodes.length}** valid sent.`
      : `❌ Нужно **${neededCodes}** ${pluralize(neededCodes, 'код', 'кода', 'кодов', user.language)}.\nОтправлено только **${validCodes.length}** валидных.`;
    return ctx.reply(msg, { parse_mode: 'Markdown' });
  }
  
  const codesToAdd = validCodes.slice(0, neededCodes);
  
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
      ? '❌ No valid codes found. Send codes in format:\n```\ncode1\ncode2\n```'
      : '❌ Не найдено валидных кодов. Отправь коды в формате:\n```\nкод1\nкод2\n```';
    return ctx.reply(msg, { parse_mode: 'Markdown' });
  }
  
  try {
    // Добавить в пул как донейшен
    await DB.addCodesToPool(codes, `donation:${user.telegram_id}`);
    
    // Обновить флаг
    await DB.updateUser(user.telegram_id, {
      awaiting_donation: false
    });
    
    await ctx.reply(MESSAGES.donationReceived(codes.length, user.language), {
      parse_mode: 'Markdown'
    });

    // Уведомление админу
    try {
      await ctx.telegram.sendMessage(
        config.telegram.adminId,
        `💝 Пожертвование от @${user.username}: ${codes.length} шт.`
      );
    } catch (error) {
      console.error('Admin notification failed:', error.message);
    }
  } catch (error) {
    console.error('Error processing donation:', error);
    const msg = user.language === 'en'
      ? '❌ An error occurred while processing codes. Try again.'
      : '❌ Произошла ошибка при обработке кодов. Попробуй еще раз.';
    await ctx.reply(msg);
  }
}

async function handleAdminAddCodes(ctx, text, language) {
  const codesText = text.replace('/addcodes ', '');
  
  // Используем тот же умный парсер что и для обычных пользователей
  const codes = extractCodes(codesText);
  
  if (codes.length === 0) {
    const msg = language === 'en' ? '❌ No valid codes found' : '❌ Не найдено валидных кодов';
    return ctx.reply(msg);
  }
  
  await DB.addCodesToPool(codes, 'admin');
  
  const codesList = codes.join(', ');
  const msg = language === 'en'
    ? `✅ Added ${codes.length} code${codes.length > 1 ? 's' : ''} to pool:\n\`${codesList}\``
    : `✅ Добавлено ${codes.length} ${pluralize(codes.length, 'код', 'кода', 'кодов', language)} в пул:\n\`${codesList}\``;
  
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
    // Возвращаем код обратно в пул
    await DB.addCodesToPool([returnedCode], `unused:${user.telegram_id}`);
    
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
