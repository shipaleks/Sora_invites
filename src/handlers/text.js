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
    
    // Админ команды (только для админа)
    if (text.startsWith('/') && userId === config.telegram.adminId) {
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
      if (text === '/adminstat') {
        return handleAdminStat(ctx);
      }
      // Остальные команды админа (start, stats, help, language) - пропускаем в commands.js
    }
    
    // Если это команда - пропускаем (обрабатывается в commands.js)
    if (text.startsWith('/')) {
      return;
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
  
  // SHADOW BAN: игнорируем забаненных, но ведём себя нормально
  if (user.is_banned) {
    // Имитируем успешный ответ
    await ctx.reply('✅ ' + (user.language === 'en' ? 'Code received! Processing...' : 'Код получен! Обрабатываем...'), {
      parse_mode: 'Markdown'
    });
    
    // Через 2 секунды отправляем "успешное" сообщение
    setTimeout(async () => {
      await ctx.reply('✅ ' + (user.language === 'en' ? 'Thank you! Code added to pool.' : 'Спасибо! Код добавлен в пул.'));
    }, 2000);
    
    // Но ничего не записываем в БД
    console.log(`[SHADOW BAN] User @${user.username} tried to submit code (banned)`);
    return;
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
    
    // Получаем актуальные данные для мотивации
    const uniqueCodes = await DB.getUniqueCodesCount();
    const currentQueueSize = await DB.getQueueSize();
    
    await ctx.reply(MESSAGES.chooseUsageCount(code, uniqueCodes, currentQueueSize), {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
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
  
  // SHADOW BAN для пожертвований
  if (user.is_banned) {
    await ctx.reply('✅ ' + (user.language === 'en' ? 'Code received! Processing...' : 'Код получен! Обрабатываем...'));
    setTimeout(async () => {
      await ctx.reply('💝 ' + (user.language === 'en' ? 'Thank you for donation!' : 'Спасибо за пожертвование!'));
    }, 2000);
    console.log(`[SHADOW BAN] User @${user.username} tried to donate (banned)`);
    await DB.updateUser(user.telegram_id, {
      awaiting_donation: false,
      awaiting_donation_usage: false
    });
    return;
  }
  
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
    
    // Получаем актуальные данные для мотивации
    const uniqueCodes = await DB.getUniqueCodesCount();
    const currentQueueSize = await DB.getQueueSize();
    
    await ctx.reply(MESSAGES.chooseUsageCount(code, uniqueCodes, currentQueueSize), {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
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
  
  // SHADOW BAN для возврата неиспользованных
  if (user.is_banned) {
    await ctx.reply('✅ ' + (user.language === 'en' ? 'Code received! Processing...' : 'Код получен! Обрабатываем...'));
    setTimeout(async () => {
      await ctx.reply('✅ ' + (user.language === 'en' ? 'Code returned to pool!' : 'Код возвращён в пул!'));
    }, 2000);
    console.log(`[SHADOW BAN] User @${user.username} tried to return unused (banned)`);
    await DB.updateUser(user.telegram_id, {
      awaiting_unused_return: false
    });
    return;
  }
  
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
  
  await ctx.reply('🔨 Баню пользователя и очищаю базу от скам-кодов...');
  
  // Импортируем Firestore для прямой работы с базой
  const admin = await import('firebase-admin');
  const db = admin.default.firestore();
  const bot = ctx.telegram;
  
  try {
    // 1. Находим ВСЕ коды, добавленные этим пользователем
    const scamCodes = [];
    
    // Коды из пула (активные)
    const poolQuery = await db.collection('invite_pool')
      .where('submitted_by', '==', user.telegram_id)
      .get();
    
    poolQuery.forEach(doc => {
      scamCodes.push(doc.data().code);
    });
    
    // Коды из пула (donation)
    const donationQuery = await db.collection('invite_pool')
      .where('submitted_by', '==', `donation:${user.telegram_id}`)
      .get();
    
    donationQuery.forEach(doc => {
      scamCodes.push(doc.data().code);
    });
    
    // Уникальные коды
    const uniqueScamCodes = [...new Set(scamCodes)];
    
    // 2. Находим всех пользователей, которые получили эти коды
    const allUsers = await DB.getAllUsers();
    const victims = allUsers.filter(u => 
      u.invite_code_given && uniqueScamCodes.includes(u.invite_code_given.toUpperCase())
    );
    
    // 3. Удаляем ВСЕ скам-коды из пула (включая дубликаты)
    const poolDeletePromises = [];
    
    // Удаляем все коды из пула
    for (const code of uniqueScamCodes) {
      const deleteQuery = db.collection('invite_pool').where('code', '==', code);
      const snapshot = await deleteQuery.get();
      snapshot.forEach(doc => {
        poolDeletePromises.push(doc.ref.delete());
      });
    }
    
    await Promise.all(poolDeletePromises);
    
    // 4. Баним пользователя
    await DB.banUser(user.telegram_id, reason);
    
    // 5. Отправляем уведомления жертвам
    let notifiedCount = 0;
    for (const victim of victims) {
      try {
        const victimLang = victim.language || 'ru';
        const message = victimLang === 'en' 
          ? `⚠️ **ATTENTION: Scam code detected!**\n\nThe invite code you received was invalid.\nThe scammer has been banned.\n\n✅ You can request a new invite now - just click /start and choose "Get Invite"`
          : `⚠️ **ВНИМАНИЕ: Обнаружен скам!**\n\nКод, который ты получил, оказался фейковым.\nМошенник забанен.\n\n✅ Можешь запросить новый инвайт - просто нажми /start и выбери "Получить инвайт"`;
        
        await bot.sendMessage(victim.telegram_id, message, { parse_mode: 'Markdown' });
        
        // Сбрасываем статус жертвы, чтобы могли запросить новый инвайт
        await DB.updateUser(victim.telegram_id, {
          status: 'new',
          invite_code_given: null,
          invite_sent_at: null
        });
        
        notifiedCount++;
      } catch (error) {
        console.error(`Failed to notify victim ${victim.username}:`, error.message);
      }
    }
    
    // Экранируем спецсимволы Markdown в username
    const safeUsername = user.username.replace(/_/g, '\\_');
    
    const report = `✅ **Бан завершён: @${safeUsername}**\n\n` +
      `📋 Причина: ${reason}\n` +
      `🗑️ Удалено кодов: ${uniqueScamCodes.length}\n` +
      `👥 Жертв оповещено: ${notifiedCount}\n\n` +
      `${uniqueScamCodes.length > 0 ? `🚫 Удалённые коды:\n${uniqueScamCodes.map(c => `\`${c}\``).join(', ')}` : ''}`;
    
    return ctx.reply(report, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Ban error:', error);
    return ctx.reply('❌ Ошибка при бане. Проверь логи.');
  }
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
  // Проверяем лок чтобы не отправлять повторно
  const acquired = await DB.acquireLock('help_request', 300); // 5 минут
  
  if (!acquired) {
    return ctx.reply('⚠️ Запрос помощи уже отправляется. Подожди 5 минут перед следующей рассылкой.');
  }
  
  try {
    const allUsers = await DB.getAllUsers();
    
    // Находим пользователей кто:
    // 1. Получил инвайт (received или completed)
    // 2. НЕ поделился всеми 4 использованиями
    // 3. НЕ получал запрос помощи в последние 24 часа
    const now = new Date();
    const targetUsers = allUsers.filter(u => {
      if ((u.status !== 'received' && u.status !== 'completed') || u.is_banned) {
        return false;
      }
      
      if ((u.usage_count_shared || 0) >= 4) {
        return false;
      }
      
      // Проверяем когда последний раз получал запрос помощи
      if (u.last_help_request) {
        const lastRequest = u.last_help_request.toDate ? u.last_help_request.toDate() : new Date(u.last_help_request);
        const hoursSince = (now - lastRequest) / (1000 * 60 * 60);
        
        if (hoursSince < 24) {
          return false; // Недавно получал запрос
        }
      }
      
      return true;
    });
    
    if (targetUsers.length === 0) {
      await DB.releaseLock('help_request');
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

**Donate your Sora invite code!**

You can share more uses of your code (even if you already shared some).

Click the button to help! ⬇️`
        : `🔥 **ГОНДОР ЗОВЁТ НА ПОМОЩЬ!**

Пул инвайтов опустел. Люди ждут в очереди.

**Пожертвуй свой инвайт-код из Sora!**

Можешь поделиться дополнительными использованиями своего кода (даже если уже делился).

Нажми кнопку чтобы помочь! ⬇️`;
      
      await bot.telegram.sendMessage(user.telegram_id, helpMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: MESSAGES.buttons.rohanAnswers, callback_data: 'rohan_answers' }
          ]]
        }
      });
      
      // Отмечаем что отправили запрос этому пользователю
      await DB.updateUser(user.telegram_id, {
        last_help_request: new Date()
      });
      
      successCount++;
      
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      failCount++;
      console.error(`Help request failed for ${user.telegram_id}:`, error.message);
    }
  }
  
  return ctx.reply(`✅ Запрос помощи отправлен!\nУспешно: ${successCount}\nОшибок: ${failCount}`);
  } finally {
    // Освобождаем лок через 30 секунд после завершения
    setTimeout(() => DB.releaseLock('help_request'), 30000);
  }
}

async function handleAdminStat(ctx) {
  try {
    await ctx.reply('📊 Генерирую статистику...');
    
    const allUsers = await DB.getAllUsers();
    const poolSize = await DB.getPoolSize();
    const queueSize = await DB.getQueueSize();
    const settings = await DB.getSystemSettings();
    
    // Основная статистика
    const totalUsers = allUsers.length;
    const receivedInvites = allUsers.filter(u => u.status === 'received' || u.status === 'completed').length;
    const returnedCodes = allUsers.filter(u => u.codes_returned > 0).length;
    const notReturned = receivedInvites - returnedCodes;
    const returnRate = receivedInvites > 0 ? Math.round((returnedCodes / receivedInvites) * 100) : 0;
    
    // Топ донатеры (по количеству использований)
    const donors = allUsers
      .filter(u => u.usage_count_shared > 0)
      .sort((a, b) => (b.usage_count_shared || 0) - (a.usage_count_shared || 0))
      .slice(0, 5);
    
    // Проблемные коды с авторами
    const admin = await import('firebase-admin');
    const db = admin.default.firestore();
    
    const allReportedCodes = [];
    allUsers.forEach(u => {
      if (u.invalid_codes_reported && u.invalid_codes_reported.length > 0) {
        u.invalid_codes_reported.forEach(code => {
          const existing = allReportedCodes.find(r => r.code === code);
          if (existing) {
            existing.count++;
          } else {
            allReportedCodes.push({ code, count: 1, reporters: [] });
          }
        });
      }
    });
    
    // Находим авторов проблемных кодов
    for (const reported of allReportedCodes) {
      const poolEntry = await db.collection('invite_pool')
        .where('code', '==', reported.code)
        .limit(1)
        .get();
      
      if (!poolEntry.empty) {
        const authorId = poolEntry.docs[0].data().submitted_by;
        
        if (authorId.includes('donation:')) {
          const userId = authorId.replace('donation:', '');
          const author = await DB.getUser(userId);
          reported.author = author ? `@${author.username}` : 'Unknown';
        } else if (authorId === 'admin') {
          reported.author = 'Admin';
        } else {
          const author = await DB.getUser(authorId);
          reported.author = author ? `@${author.username}` : authorId;
        }
      } else {
        reported.author = 'Unknown';
      }
    }
    
    const topReported = allReportedCodes
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    
    // Забаненные пользователи
    const bannedUsers = allUsers.filter(u => u.is_banned);
    
    // Статистика по языкам
    const ruUsers = allUsers.filter(u => u.language === 'ru').length;
    const enUsers = allUsers.filter(u => u.language === 'en').length;
    
    // Распределение по количеству использований
    const usageDistribution = {
      1: allUsers.filter(u => u.usage_count_shared === 1).length,
      2: allUsers.filter(u => u.usage_count_shared === 2).length,
      3: allUsers.filter(u => u.usage_count_shared === 3).length,
      4: allUsers.filter(u => u.usage_count_shared === 4).length
    };
    
    const totalShared = Object.values(usageDistribution).reduce((a, b) => a + b, 0);
    
    // График динамики (последние 7 дней)
    const invitesByDay = {};
    allUsers.forEach(u => {
      if (u.invite_sent_at) {
        const date = u.invite_sent_at.toDate ? u.invite_sent_at.toDate() : new Date(u.invite_sent_at);
        const dayKey = date.toISOString().split('T')[0];
        invitesByDay[dayKey] = (invitesByDay[dayKey] || 0) + 1;
      }
    });
    
    const sortedDays = Object.keys(invitesByDay).sort();
    const last7Days = sortedDays.slice(-7);
    const inviteCounts = last7Days.map(day => invitesByDay[day]);
    
    // Генерируем URL для графика через QuickChart
    const chartData = {
      type: 'line',
      data: {
        labels: last7Days.map(d => d.substring(5)), // MM-DD
        datasets: [{
          label: 'Invites Sent',
          data: inviteCounts,
          borderColor: 'rgb(75, 192, 192)',
          tension: 0.1
        }]
      },
      options: {
        title: {
          display: true,
          text: 'Invites Sent - Last 7 Days'
        }
      }
    };
    
    const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartData))}`;
    
    const stat = `📊 **ДЕТАЛЬНАЯ СТАТИСТИКА**

**🎯 Основное:**
Всего пользователей: ${totalUsers}
Получили инвайты: ${receivedInvites}
Вернули коды: ${returnedCodes} (${returnRate}%)
Не вернули: ${notReturned}

**💎 Пул и очередь:**
Кодов в пуле: ${poolSize}
В очереди: ${queueSize}
Соотношение: ${poolSize > 0 ? (poolSize / Math.max(queueSize, 1)).toFixed(2) : '0'}

**🌍 Языки:**
🇷🇺 Русский: ${ruUsers}
🇬🇧 English: ${enUsers}

**📊 Распределение по использованиям:**
Поделились 1 использованием: ${usageDistribution[1]} чел
Поделились 2 использованиями: ${usageDistribution[2]} чел
Поделились 3 использованиями: ${usageDistribution[3]} чел
Поделились 4 использованиями: ${usageDistribution[4]} чел (герои! ⚔️)
Всего поделились: ${totalShared} из ${receivedInvites}

**🏆 Топ-5 донатеров:**
${donors.length > 0 ? donors.map((u, i) => 
  `${i + 1}. @${u.username.replace(/_/g, '\\_')}: ${u.usage_count_shared} использований`
).join('\n') : 'Нет данных'}

**🚫 Проблемные коды:**
${topReported.length > 0 ? topReported.map(r => 
  `\`${r.code}\` от ${r.author} - ${r.count} ${r.count === 1 ? 'жалоба' : 'жалоб'}`
).join('\n') : 'Нет жалоб'}

**🔨 Забанено: ${bannedUsers.length}**
${bannedUsers.length > 0 ? bannedUsers.map(u => `@${u.username.replace(/_/g, '\\_')}: ${u.ban_reason}`).join('\n') : ''}`;

    await ctx.reply(stat, { parse_mode: 'Markdown' });
    
    // Отправляем график
    if (last7Days.length > 0) {
      await ctx.replyWithPhoto({ url: chartUrl }, {
        caption: '📈 Динамика отправки инвайтов за последние 7 дней'
      });
    }
    
  } catch (error) {
    console.error('Error generating admin stats:', error);
    return ctx.reply('❌ Ошибка при генерации статистики');
  }
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
