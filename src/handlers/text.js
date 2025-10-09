import DB from '../database.js';
import { getMessages } from '../messages.js';
import config from '../config.js';
import { extractCodes, validateInviteCode, validateSoraPrompt } from '../utils/validators.js';
import { enhancePromptWithCookbook, createSoraVideo, pollSoraVideo, soraQueue, Stars } from '../sora.js';
import { pluralize } from '../utils/helpers.js';

export function registerTextHandlers(bot) {
  bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;
    
    // Логируем все админ-команды
    if (text.startsWith('/') && userId === config.telegram.adminId) {
      console.log('[Admin] Command received:', text, 'from user:', userId);
    }
    
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
      if (text === '/announcevideos') {
        return handleAnnounceVideos(ctx, bot);
      }
      if (text.startsWith('/clearlock ')) {
        return handleClearLock(ctx, text);
      }
      // /refunduser теперь в commands.js
      // Остальные команды админа (start, stats, help, language, generate, refunduser) - пропускаем в commands.js
    }
    
    // Если это команда - пропускаем (обрабатывается в commands.js)
    if (text.startsWith('/')) {
      return;
    }
    
    if (!user) {
      return ctx.reply(MESSAGES.notInSystem, { parse_mode: 'Markdown' });
    }
    
    // Sora admin test: ВЫСШИЙ ПРИОРИТЕТ (проверяем до всех остальных флагов)
    if (user.sora_pending_mode) {
      console.log(`[Sora] Admin ${userId} prompt received, mode: ${user.sora_pending_mode}`);
      return handleSoraPrompt(ctx, user);
    }
    
    // УПРОЩЁННАЯ ЛОГИКА: 3 типа обработки + защита от двойной отправки
    
    // 1. Возврат неиспользованного (только если флаг установлен)
    if (user.awaiting_unused_return === true) {
      return handleUnusedReturn(ctx, user);
    }
    
    // 2. Ожидание выбора количества использований (КРИТИЧЕСКАЯ ЗАЩИТА!)
    if (user.awaiting_usage_choice === true || user.awaiting_donation_usage === true) {
      const msg = user.language === 'en' 
        ? '⏳ Please choose how many uses to share by clicking a button above ⬆️' 
        : '⏳ Пожалуйста, выбери количество использований, нажав на кнопку выше ⬆️';
      return ctx.reply(msg);
    }
    
    // 2.5. Пожертвование кода (donation)
    if (user.awaiting_donation === true) {
      return handleDonation(ctx, user);
    }

    // 3. Поделиться кодом (универсальная обработка)
    if (user.awaiting_share === true) {
      return handleCodeSharing(ctx, user);
    }
  });
}

async function handleCodeSharing(ctx, user) {
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
  
  if (complaintsOnUserCodes >= 3) {
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
  if (!validateInviteCode(code)) {
    return ctx.reply('❌ Похоже, это невалидный код. Код должен состоять из 6 букв/цифр.', {
      parse_mode: 'Markdown'
    });
  }
  const botGivenCode = user.invite_code_given?.toUpperCase();
  
  // ПРОСТАЯ ПРОВЕРКА: код от бота блокируем, остальные принимаем
  if (botGivenCode && code === botGivenCode) {
    return ctx.reply(
      `⚠️ Это код от бота для регистрации: \`${botGivenCode}\`\n\n` +
      `Нужен код от Sora ПОСЛЕ регистрации.`,
      { parse_mode: 'Markdown' }
    );
  }
  
  // ЗАЩИТА: один уникальный код на пользователя (но можно делиться им несколько раз)
  const previousCodes = user.codes_submitted || [];
  if (previousCodes.length > 0 && !previousCodes.includes(code)) {
    return ctx.reply(
      `❌ Ты уже поделился другим кодом: \`${previousCodes[0]}\`\n\n` +
      `Можно делиться только ОДНИМ кодом (но несколько раз, если у тебя есть дополнительные использования).\n\n` +
      `Это защита от троллей, которые вкидывают фейковые коды.`,
      { parse_mode: 'Markdown' }
    );
  }
  
  try {
    // Сохраняем код для выбора количества использований
    await DB.updateUser(user.telegram_id, {
      pending_code: code,
      awaiting_usage_choice: true,
      awaiting_share: false // Сбрасываем флаг
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

  const first = codes[0];
  if (!validateInviteCode(first)) {
    return ctx.reply('❌ Похоже, это невалидный код. Код должен состоять из 6 букв/цифр.', {
      parse_mode: 'Markdown'
    });
  }
  
  // ЗАЩИТА: один уникальный код на пользователя (для donations тоже)
  const previousCodes = user.codes_submitted || [];
  if (previousCodes.length > 0 && !previousCodes.includes(first)) {
    return ctx.reply(
      `❌ Ты уже поделился другим кодом: \`${previousCodes[0]}\`\n\n` +
      `Можно делиться только ОДНИМ кодом (но несколько раз).\n\n` +
      `Это защита от троллей.`,
      { parse_mode: 'Markdown' }
    );
  }
  
  try {
    const code = first;
    
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

async function handleSoraPrompt(ctx, user) {
  console.log('[Sora] handleSoraPrompt v1.0.1 - NEW CODE with choice buttons');
  const language = user.language || 'ru';
  const MESSAGES = getMessages(language);
  const text = ctx.message.text || '';

  const basicValidation = validateSoraPrompt(text);
  if (!basicValidation.ok) {
    await DB.updateUser(user.telegram_id, { sora_pending_mode: null });
    return ctx.reply(language === 'en' 
      ? '🚫 This prompt violates content policy. Please try a different idea.'
      : '🚫 Этот промпт нарушает правила контента. Попробуй другой сюжет.');
  }

  try {
    // 1) Улучшаем промпт (бесплатно) и предлагаем выбор
    console.log('[Sora] Enhancing prompt...');
    const enhanced = await enhancePromptWithCookbook(text, language);
    console.log('[Sora] Enhanced prompt length:', enhanced.length);
    
    // Проверка на policy violation
    if (enhanced.startsWith('POLICY_VIOLATION')) {
      await DB.updateUser(user.telegram_id, { sora_pending_mode: null });
      return ctx.reply(language === 'en' 
        ? '🚫 This prompt violates content policy and cannot be sanitized. Please try a completely different idea.'
        : '🚫 Этот промпт сильно нарушает правила и не может быть исправлен. Попробуй совершенно другой сюжет.');
    }
    
    // Проверка на предупреждение (GPT исправил проблемный контент)
    let cleanedPrompt = enhanced;
    let hadWarning = false;
    if (enhanced.startsWith('POLICY_WARNING|')) {
      hadWarning = true;
      cleanedPrompt = enhanced.replace('POLICY_WARNING|', '');
    }
    
    // Сохраняем оба варианта для выбора
    await DB.updateUser(user.telegram_id, { 
      sora_original_prompt: text,
      sora_enhanced_prompt: cleanedPrompt,
      sora_had_warning: hadWarning
    });
    console.log('[Sora] Saved prompts to DB, sending choice buttons... (warning:', hadWarning, ')');
    
    const choiceText = hadWarning
      ? (language === 'en' 
        ? `⚠️ **Content Warning**\n\nYour prompt contains elements that may violate OpenAI policy. We've created a safer version.\n\n**Options:**\n• ✨ Safe version (recommended) — high success rate\n• 📝 Original — may be rejected by Sora\n• ✏️ Rewrite prompt completely\n\nChoose:`
        : `⚠️ **Предупреждение**\n\nТвой промпт может нарушать правила OpenAI. Мы создали безопасную версию.\n\n**Варианты:**\n• ✨ Безопасная версия (рекомендуем) — высокий шанс успеха\n• 📝 Оригинал — может быть отклонён Sora\n• ✏️ Написать новый промпт\n\nВыбери:`)
      : MESSAGES.promptEnhanceChoice;
    
    const buttons = hadWarning
      ? [[
          { text: '✨ Безопасная версия', callback_data: 'sora_use_enhanced' }
        ],[
          { text: '📝 Рискнуть оригиналом', callback_data: 'sora_use_original' }
        ],[
          { text: '✏️ Написать новый', callback_data: 'sora_rewrite' }
        ]]
      : [[
          { text: '✨ Усиленный', callback_data: 'sora_use_enhanced' },
          { text: '📝 Оригинал', callback_data: 'sora_use_original' }
        ]];
    
    const sent = await ctx.reply(choiceText, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons }
    });
    console.log('[Sora] Choice buttons sent successfully, message_id:', sent.message_id);
  } catch (error) {
    console.error('Sora prompt enhancement error:', error);
    await ctx.reply(MESSAGES.generationFailed(error.message || 'unknown'));
  }
}

// Функция вынесена в sora-handlers.js для избежания циклических импортов

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
    return ctx.reply(`❌ Код ${code} уже исчерпал лимит (${config.rules.maxCodeUsage} макс)`);
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
    
    // ========== ОСНОВНАЯ СТАТИСТИКА ==========
    const totalUsers = allUsers.length;
    const receivedInvites = allUsers.filter(u => u.status === 'received' || u.status === 'completed').length;
    const returnedCodes = allUsers.filter(u => u.codes_returned > 0).length;
    const returnRate = receivedInvites > 0 ? Math.round((returnedCodes / receivedInvites) * 100) : 0;
    
    // ========== КОНВЕРСИЯ ==========
    const usersWhoShared = allUsers.filter(u => u.usage_count_shared > 0).length;
    const shareRate = receivedInvites > 0 ? Math.round((usersWhoShared / receivedInvites) * 100) : 0;
    
    // ========== ВРЕМЯ ОЖИДАНИЯ ==========
    const avgWaitHours = await DB.getAverageWaitTimeHours();
    const usersWithWaitTime = allUsers.filter(u => 
      u.invite_sent_at && (u.joined_queue_at || u.requested_at)
    );
    
    // Группируем по часам ожидания для гистограммы
    const waitTimesByHour = {};
    usersWithWaitTime.forEach(u => {
      // Используем joined_queue_at если есть, иначе requested_at (для старых пользователей)
      const joinedAt = u.joined_queue_at 
        ? (u.joined_queue_at?.toDate?.() || new Date(u.joined_queue_at))
        : (u.requested_at?.toDate?.() || new Date(u.requested_at));
      
      const sentAt = u.invite_sent_at?.toDate?.() || new Date(u.invite_sent_at);
      const waitHours = Math.round((sentAt - joinedAt) / (1000 * 60 * 60));
      
      if (waitHours >= 0 && waitHours <= 48) { // Ограничиваем 48 часами
        waitTimesByHour[waitHours] = (waitTimesByHour[waitHours] || 0) + 1;
      }
    });
    
    // ========== АКТИВНОСТЬ ПОСЛЕДНИХ 7 ДНЕЙ ==========
    const now = new Date();
    const last7DaysActivity = {};
    const tzOffset = now.getTimezoneOffset() * 60000; // offset in ms
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now - tzOffset); // Local timezone
      date.setDate(date.getDate() - i);
      const dayKey = date.toISOString().split('T')[0];
      last7DaysActivity[dayKey] = { invites: 0, returns: 0 };
    }
    
    console.log('[AdminStat] Collecting activity for days:', Object.keys(last7DaysActivity));
    
    allUsers.forEach(u => {
      // Инвайты
      if (u.invite_sent_at) {
        const date = u.invite_sent_at.toDate ? u.invite_sent_at.toDate() : new Date(u.invite_sent_at);
        const localDate = new Date(date.getTime() - tzOffset);
        const dayKey = localDate.toISOString().split('T')[0];
        if (last7DaysActivity[dayKey] !== undefined) {
          last7DaysActivity[dayKey].invites++;
        }
      }
      
      // Возвраты (используем последнее обновление как прокси)
      if (u.codes_returned > 0 && u.requested_at) {
        const date = u.requested_at.toDate ? u.requested_at.toDate() : new Date(u.requested_at);
        const localDate = new Date(date.getTime() - tzOffset);
        const dayKey = localDate.toISOString().split('T')[0];
        if (last7DaysActivity[dayKey] !== undefined) {
          last7DaysActivity[dayKey].returns++;
        }
      }
    });
    
    console.log('[AdminStat] Activity collected:', last7DaysActivity);
    
    // ========== РАСПРЕДЕЛЕНИЕ ПО ИСПОЛЬЗОВАНИЯМ ==========
    const usageDistribution = {
      1: allUsers.filter(u => u.usage_count_shared === 1).length,
      2: allUsers.filter(u => u.usage_count_shared === 2).length,
      3: allUsers.filter(u => u.usage_count_shared === 3).length,
      4: allUsers.filter(u => u.usage_count_shared === 4).length
    };
    
    const totalShared = Object.values(usageDistribution).reduce((a, b) => a + b, 0);
    
    // ========== ЗАБАНЕННЫЕ ==========
    const bannedUsers = allUsers.filter(u => u.is_banned);
    
    // Баны по дням (последние 7 дней)
    const bansByDay = {};
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dayKey = date.toISOString().split('T')[0];
      bansByDay[dayKey] = 0;
    }
    
    bannedUsers.forEach(u => {
      if (u.ban_reason && u.ban_reason.includes('Автобан')) {
        // Пытаемся определить дату бана (используем примерную дату из причины или текущую)
        // Для более точного отслеживания нужно добавить поле banned_at
        const dayKey = new Date().toISOString().split('T')[0];
        if (bansByDay[dayKey] !== undefined) {
          bansByDay[dayKey]++;
        }
      }
    });
    
    // ========== ЯЗЫКИ ==========
    const ruUsers = allUsers.filter(u => u.language === 'ru').length;
    const enUsers = allUsers.filter(u => u.language === 'en').length;
    
    // ========== ТЕКСТОВАЯ СТАТИСТИКА ==========
    const stat = `📊 **АДМИН СТАТИСТИКА**

**👥 Пользователи:**
Всего: ${totalUsers}
🇷🇺 Русский: ${ruUsers} | 🇬🇧 English: ${enUsers}

**⚡️ Эффективность системы:**
Получили инвайт: ${receivedInvites}
Вернули код: ${returnedCodes} (${returnRate}%)
Поделились с другими: ${usersWhoShared} (${shareRate}%)

**⏱ Время ожидания:**
${avgWaitHours ? `Среднее: ${Math.round(avgWaitHours)} ч` : 'Нет данных'}
${avgWaitHours ? `Всего данных: ${usersWithWaitTime.length}` : ''}

**💎 Сейчас:**
Кодов в пуле: ${poolSize}
В очереди: ${queueSize}
Баланс: ${poolSize >= queueSize ? '✅ Хорошо' : '⚠️ Нужны коды'}

**📊 Щедрость (кто сколько раздал):**
1 человек: ${usageDistribution[1]} чел (минимум)
2 человека: ${usageDistribution[2]} чел
3 человека: ${usageDistribution[3]} чел 
4 человека: ${usageDistribution[4]} чел ⚔️ (максимум)
**Всего поделились: ${totalShared} из ${receivedInvites} (${Math.round(totalShared / Math.max(receivedInvites, 1) * 100)}%)**

**🔨 Модерация:**
Забанено всего: ${bannedUsers.length}
Автобанов: ${bannedUsers.filter(u => u.ban_reason?.includes('Автобан')).length}
Ручных банов: ${bannedUsers.filter(u => !u.ban_reason?.includes('Автобан')).length}

⚠️ **ГИПОТЕЗА: Shadow ban влияет на статистику?**
Забаненные "отправляют" коды, но коды не попадают в базу!
${bannedUsers.length > 0 ? '\n**Последние баны:**\n' + bannedUsers.slice(0, 3).map(u => `• @${u.username.replace(/_/g, '\\_')}: ${u.ban_reason}`).join('\n') : ''}`;

    await ctx.reply(stat, { parse_mode: 'Markdown' });
    
    // ========== ГРАФИК 1: ВРЕМЯ ОЖИДАНИЯ (ГИСТОГРАММА) ==========
    if (Object.keys(waitTimesByHour).length > 0) {
      const sortedHours = Object.keys(waitTimesByHour).map(Number).sort((a, b) => a - b);
      const waitCounts = sortedHours.map(h => waitTimesByHour[h]);
      
      const waitTimeChart = {
        type: 'bar',
        data: {
          labels: sortedHours.map(h => `${h}ч`),
          datasets: [{
            label: 'Количество пользователей',
            data: waitCounts,
            backgroundColor: 'rgba(54, 162, 235, 0.8)'
          }]
        },
        options: {
          title: {
            display: true,
            text: 'Распределение времени ожидания',
            fontSize: 16
          },
          scales: {
            yAxes: [{
              ticks: {
                beginAtZero: true,
                stepSize: 1
              }
            }]
          }
        }
      };
      
      const waitChartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(waitTimeChart))}&width=800&height=400`;
      
      await ctx.replyWithPhoto({ url: waitChartUrl }, {
        caption: `⏱ **График времени ожидания**\n\nСреднее: ${Math.round(avgWaitHours || 0)} ч\nВсего данных: ${usersWithWaitTime.length}`
      });
    }
    
    // ========== ГРАФИК 2: АКТИВНОСТЬ ЗА 7 ДНЕЙ ==========
    const activityDays = Object.keys(last7DaysActivity).sort();
    const invitesData = activityDays.map(day => last7DaysActivity[day].invites);
    const returnsData = activityDays.map(day => last7DaysActivity[day].returns);
    
    const activityChart = {
      type: 'line',
      data: {
        labels: activityDays.map(d => d.substring(5)), // MM-DD
        datasets: [
          {
            label: 'Отправлено инвайтов',
            data: invitesData,
            borderColor: 'rgb(75, 192, 192)',
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
            tension: 0.3
          },
          {
            label: 'Возвращено кодов',
            data: returnsData,
            borderColor: 'rgb(255, 99, 132)',
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
            tension: 0.3
          }
        ]
      },
      options: {
        title: {
          display: true,
          text: 'Активность за последние 7 дней',
          fontSize: 16
        },
        scales: {
          yAxes: [{
            ticks: {
              beginAtZero: true
            }
          }]
        }
      }
    };
    
    const activityChartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(activityChart))}&width=800&height=400`;
    
    await ctx.replyWithPhoto({ url: activityChartUrl }, {
      caption: '📈 **Динамика системы за неделю**'
    });
    
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

// handleRefundUser moved to commands.js as bot.command('refunduser')

async function handleClearLock(ctx, text) {
  const lockName = text.replace('/clearlock ', '').trim();
  
  if (!lockName) {
    return ctx.reply('❌ Укажи имя лока: /clearlock announce_videos');
  }
  
  try {
    await DB.releaseLock(lockName);
    return ctx.reply(`✅ Лок "${lockName}" освобождён`);
  } catch (error) {
    console.error('[ClearLock] Error:', error);
    return ctx.reply(`❌ Ошибка: ${error.message}`);
  }
}

async function handleAnnounceVideos(ctx, bot) {
  // Защита от повторных запусков
  const acquired = await DB.acquireLock('announce_videos', 3600); // 1 час
  if (!acquired) {
    return ctx.reply('⚠️ Рассылка уже идёт. Подожди час перед следующей.');
  }
  
  try {
    await ctx.reply('🚀 Запускаю targeted рассылку о генерации видео...');
    
    const allUsers = await DB.getAllUsers();
  
  // Сегментация пользователей
  const withInvites = allUsers.filter(u => 
    (u.status === 'received' || u.status === 'completed') && !u.is_banned
  );
  const inQueue = allUsers.filter(u => 
    u.status === 'waiting' && !u.is_banned
  );
  const others = allUsers.filter(u => 
    !['received', 'completed', 'waiting'].includes(u.status) && !u.is_banned
  );
  
  let sent = { withInvites: 0, inQueue: 0, others: 0 };
  let failed = 0;
  
  // Сообщение для получивших инвайт
  const msgWithInvites = {
    ru: `🎬 **Новинка: Генерация видео в Sora!**

✨ Теперь можешь создавать видео прямо в боте!

**Почему это круто:**
• 💎 Доступ к **Sora 2 Pro** (у OpenAI $100/мес!)
• 🎨 **Без вотермарки** (в обычном Sora есть)
• ⚙️ **Кастомизация**: длительность, качество, ориентация
• ⚡️ Быстро: 1-3 минуты

**Цены:**
• Обычный: 100⭐
• HD (Pro): 250⭐
• Кастом: от 100⭐

Даже с инвайтом у тебя нет Pro подписки — попробуй сейчас!

👉 /generate`,
    en: `🎬 **New: Sora Video Generation!**

✨ Now you can create videos right in the bot!

**Why it's awesome:**
• 💎 Access to **Sora 2 Pro** (OpenAI charges $100/mo!)
• 🎨 **No watermark** (regular Sora has it)
• ⚙️ **Customization**: duration, quality, orientation
• ⚡️ Fast: 1-3 minutes

**Pricing:**
• Basic: 100⭐
• HD (Pro): 250⭐
• Custom: from 100⭐

Even with invite, you don't have Pro subscription — try now!

👉 /generate`
  };
  
  // Сообщение для ожидающих
  const msgInQueue = {
    ru: `🎬 **Не хочешь ждать? Генерируй видео сейчас!**

Пока ждёшь инвайт, можешь создать видео с Sora AI!

**Доступно:**
• 💎 Sora 2 Pro (обычно $100/мес)
• 🎨 Без вотермарки
• ⚙️ Кастомизация параметров

**Цены:** от 100⭐

Твоя позиция в очереди сохранится — это просто дополнительная опция!

👉 /generate`,
    en: `🎬 **Don't want to wait? Generate video now!**

While waiting for invite, you can create videos with Sora AI!

**Available:**
• 💎 Sora 2 Pro (usually $100/mo)
• 🎨 No watermark
• ⚙️ Custom parameters

**Pricing:** from 100⭐

Your queue position is saved — this is just an extra option!

👉 /generate`
  };
  
  // Сообщение для остальных
  const msgOthers = {
    ru: `🎬 **Новинка: Генерация видео в Sora!**

Создавай AI-видео прямо в Telegram!

• 💎 Sora 2 Pro ($100/мес у OpenAI)
• 🎨 Без вотермарки
• ⚡️ 1-3 минуты

От 100⭐

👉 /generate`,
    en: `🎬 **New: Sora Video Generation!**

Create AI videos right in Telegram!

• 💎 Sora 2 Pro ($100/mo at OpenAI)
• 🎨 No watermark
• ⚡️ 1-3 minutes

From 100⭐

👉 /generate`
  };
  
  // Рассылка с задержкой
  console.log(`[Announce] Starting: ${withInvites.length} with invites, ${inQueue.length} in queue, ${others.length} others`);
  
  for (const user of withInvites) {
    try {
      const msg = user.language === 'en' ? msgWithInvites.en : msgWithInvites.ru;
      await bot.telegram.sendMessage(user.telegram_id, msg, { parse_mode: 'Markdown' });
      sent.withInvites++;
      if (sent.withInvites === 1 || sent.withInvites % 10 === 0) {
        console.log(`[Announce] ✅ Success: ${sent.withInvites}/${withInvites.length} with invites sent`);
      }
      await new Promise(r => setTimeout(r, 50));
    } catch (error) {
      failed++;
      if (failed === 1 || !error.message.includes('403')) {
        console.error(`[Announce] ❌ Failed for ${user.telegram_id} (@${user.username}):`, error.message);
      }
    }
  }
  
  console.log(`[Announce] With invites done: ${sent.withInvites} sent, ${failed} failed. Starting queue segment...`);
  
  const queueFailed = 0;
  for (const user of inQueue) {
    try {
      const msg = user.language === 'en' ? msgInQueue.en : msgInQueue.ru;
      await bot.telegram.sendMessage(user.telegram_id, msg, { parse_mode: 'Markdown' });
      sent.inQueue++;
      if (sent.inQueue === 1 || sent.inQueue % 10 === 0) {
        console.log(`[Announce] ✅ Queue: ${sent.inQueue}/${inQueue.length} sent`);
      }
      await new Promise(r => setTimeout(r, 50));
    } catch (error) {
      failed++;
      if (!error.message.includes('403')) {
        console.error(`[Announce] Queue failed for ${user.telegram_id}:`, error.message);
      }
    }
  }
  
  console.log(`[Announce] Queue done: ${sent.inQueue} sent. Starting others...`);
  
  for (const user of others) {
    try {
      const msg = user.language === 'en' ? msgOthers.en : msgOthers.ru;
      await bot.telegram.sendMessage(user.telegram_id, msg, { parse_mode: 'Markdown' });
      sent.others++;
      if (sent.others === 1 || sent.others % 10 === 0) {
        console.log(`[Announce] ✅ Others: ${sent.others}/${others.length} sent`);
      }
      await new Promise(r => setTimeout(r, 50));
    } catch (error) {
      failed++;
      if (!error.message.includes('403')) {
        console.error(`[Announce] Others failed for ${user.telegram_id}:`, error.message);
      }
    }
  }
  
    return ctx.reply(`✅ Рассылка завершена!\n\n` +
      `С инвайтами: ${sent.withInvites}\n` +
      `В очереди: ${sent.inQueue}\n` +
      `Остальные: ${sent.others}\n` +
      `Ошибок (blocked): ${failed}\n\n` +
      `Всего отправлено: ${sent.withInvites + sent.inQueue + sent.others}`);
  } finally {
    // Освобождаем лок через 30 сек после завершения
    setTimeout(() => DB.releaseLock('announce_videos'), 30000);
  }
}
