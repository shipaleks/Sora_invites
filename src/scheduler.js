import cron from 'node-cron';
import DB from './database.js';
import { getMessages } from './messages.js';
import config from './config.js';
import { getHoursSince } from './utils/helpers.js';

export function startSchedulers(bot) {
  startReminderScheduler(bot);
  startQueueProcessor(bot);
  
  console.log('[Scheduler] All schedulers started');
}

function startReminderScheduler(bot) {
  // Проверка каждые 3 часа (оптимизация затрат Firebase)
  cron.schedule('0 */3 * * *', async () => {
    console.log('[Scheduler] Checking reminders...');
    
    try {
      // Получаем распределённый лок (защита от параллельных инстансов)
      const acquired = await DB.acquireLock('reminder_processor', 60);
      
      if (!acquired) {
        console.log('[Scheduler] Reminder lock held by another instance, skipping');
        return;
      }
      
      try {
        const usersWithInvites = await DB.getUsersWithStatus('received');
      
      for (const user of usersWithInvites) {
        // Пропускаем тех, кто вернул неиспользованный инвайт
        if (user.status === 'returned_unused') continue;
        if (!user.invite_sent_at) continue;
        
        const hoursElapsed = getHoursSince(user.invite_sent_at);
        const MESSAGES = getMessages(user.language || 'ru');
        
        // Проверяем интервалы напоминаний
        for (let i = 0; i < config.rules.reminderIntervals.length; i++) {
          const targetHour = config.rules.reminderIntervals[i];
          
          // Если прошло нужное время и это напоминание ещё не отправлено
          if (hoursElapsed >= targetHour && user.reminder_count <= i) {
            
            const hoursLeft = config.rules.deadlineHours - hoursElapsed;
            
            // Определяем сколько кодов нужно этому пользователю
            const allUsers = await DB.getAllUsers();
            const usersWithInvitesSorted = allUsers
              .filter(u => u.invite_sent_at)
              .sort((a, b) => {
                const timeA = a.invite_sent_at?.toDate?.() || new Date(0);
                const timeB = b.invite_sent_at?.toDate?.() || new Date(0);
                return timeA - timeB;
              });
            
            const userIndex = usersWithInvitesSorted.findIndex(u => u.telegram_id === user.telegram_id) + 1;
            const codesRequired = userIndex <= 10 ? 
              config.rules.first10CodesRequired : 
              config.rules.regularCodesRequired;
            
            const neededCodes = codesRequired - user.codes_returned;
            
            // Пропускаем если уже вернул все коды
            if (neededCodes <= 0) {
              await DB.updateUser(user.telegram_id, {
                reminder_count: config.rules.reminderIntervals.length
              });
              break;
            }
            
            const message = i === config.rules.reminderIntervals.length - 1 ?
              MESSAGES.finalWarning(codesRequired, user.codes_returned || 0) :
              MESSAGES.reminder(Math.round(hoursLeft), codesRequired, user.codes_returned || 0);
            
            // Пропускаем если напоминание null (уже вернул код)
            if (!message) {
              await DB.updateUser(user.telegram_id, {
                reminder_count: config.rules.reminderIntervals.length
              });
              break;
            }
            
            try {
              await bot.telegram.sendMessage(user.telegram_id, message, {
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [[
                    { text: MESSAGES.buttons.shareCode, callback_data: 'share_code' }
                  ]]
                }
              });
              
              await DB.updateUser(user.telegram_id, {
                reminder_count: i + 1,
                last_reminder: new Date()
              });
              
              console.log(`[Reminder] Sent to @${user.username} (${hoursLeft.toFixed(1)}h left)`);
            } catch (error) {
              console.error(`[Reminder] Failed for ${user.telegram_id}:`, error.message);
            }
            
            break;
          }
        }
      }
      
        console.log('[Scheduler] Reminders check completed');
      } finally {
        // Всегда освобождаем лок
        await DB.releaseLock('reminder_processor');
      }
    } catch (error) {
      console.error('[Scheduler] Reminder error:', error);
    }
  });
  
  console.log('[Scheduler] Reminder scheduler initialized');
}

function startQueueProcessor(bot) {
  // Проверка очереди каждые 5 минут (оптимизация затрат Firebase)
  cron.schedule('*/5 * * * *', async () => {
    console.log('[Scheduler] Processing queue...');
    
    try {
      // Получаем распределённый лок (защита от параллельных инстансов)
      const acquired = await DB.acquireLock('queue_processor', 60);
      
      if (!acquired) {
        console.log('[Scheduler] Lock held by another instance, skipping');
        return;
      }
      
      try {
        let processed = 0;
        
        // Обрабатываем ВСЮ очередь пока есть коды
        while (true) {
          const poolSize = await DB.getPoolSize();
          if (poolSize === 0) {
            if (processed > 0) {
              console.log(`[Scheduler] No more codes available (processed ${processed} invites)`);
            }
            break;
          }
          
          const nextUser = await DB.getNextInQueue();
          if (!nextUser) {
            if (processed > 0) {
              console.log(`[Scheduler] Queue empty (processed ${processed} invites)`);
            }
            break;
          }
          
          // Подбираем код, который пользователь ранее не репортил
          let availableCode = null;
          const candidateCodes = await DB.getAvailableCodes(10);
          if (candidateCodes.length === 0) {
            console.log(`[Scheduler] No available codes (processed ${processed} invites)`);
            break;
          }

          const userForCodeCheck = await DB.getUser(nextUser.telegram_id);
          availableCode = candidateCodes.find(c => !(userForCodeCheck.invalid_codes_reported || []).includes(c.code));
          
          if (!availableCode) {
            // Пробуем расширить окно выбора
            const moreCandidateCodes = await DB.getAvailableCodes(100);
            availableCode = moreCandidateCodes.find(c => !(userForCodeCheck.invalid_codes_reported || []).includes(c.code));
          }

          if (!availableCode) {
            // Чтобы не блокировать очередь для остальных — переносим пользователя в конец очереди
            console.log(`[Scheduler] All available codes are reported by user ${nextUser.telegram_id}. Rotating user to the end of queue.`);
            await DB.removeFromQueue(nextUser.telegram_id);
            await DB.addToQueue(nextUser.telegram_id);
            continue; // пробуем следующего в этом же цикле
          }
          
          // Отправить инвайт
          await processNextInvite(bot, nextUser.telegram_id, availableCode);
          processed++;
          
          // Задержка между отправками (защита от rate limit)
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        if (processed > 0) {
          console.log(`[Scheduler] Successfully processed ${processed} invites`);
        }
        
        // Проверка критического состояния пула
        const finalPoolSize = await DB.getPoolSize();
        const finalQueueSize = await DB.getQueueSize();
        
        if (finalPoolSize <= 2 && finalQueueSize > 0) {
          // Пытаемся отправить срочный призыв (лок на 6 часов чтобы не спамить)
          const urgentAcquired = await DB.acquireLock('urgent_help_request', 21600); // 6 часов
          
          if (urgentAcquired) {
            console.log(`[Scheduler] Critical pool state! Sending urgent help request (pool: ${finalPoolSize}, queue: ${finalQueueSize})`);
            await sendUrgentHelpRequest(bot);
          }
        }
      } finally {
        // Всегда освобождаем лок
        await DB.releaseLock('queue_processor');
      }
    } catch (error) {
      console.error('[Scheduler] Queue processing error:', error);
    }
  });
  
  console.log('[Scheduler] Queue processor initialized');
}

async function processNextInvite(bot, userId, codeObj) {
  try {
    const user = await DB.getUser(userId);
    if (!user) {
      console.error(`[Queue] User ${userId} not found`);
      return;
    }
    
    // КРИТИЧЕСКАЯ ПРОВЕРКА: Пользователь уже получил инвайт?
    if (user.status === 'received' || user.status === 'completed') {
      console.log(`[Queue] User ${userId} already has invite, removing from queue`);
      await DB.removeFromQueue(userId);
      return;
    }
    
    // БАН: не отправляем инвайт забаненным, чистим очередь
    if (user.is_banned) {
      console.log(`[Queue] User ${userId} is banned, removing from queue`);
      await DB.removeFromQueue(userId);
      return;
    }
    
    // Пропуск репорченного кода обрабатывается на этапе подбора кода, здесь дополнительно защищаемся
    if (user.invalid_codes_reported?.includes(codeObj.code)) {
      console.log(`[Queue] User ${userId} already reported code ${codeObj.code}, selecting another code`);
      return;
    }
    
    const MESSAGES = getMessages(user.language || 'ru');
    
    // ВАЖНО: Удаляем из очереди только перед самой отправкой
    await DB.removeFromQueue(userId);
    
    // Определяем является ли пользователь из первых 10
    const count = await DB.incrementFirst10Count();
    const codesRequired = count <= 10 ? 
      config.rules.first10CodesRequired : 
      config.rules.regularCodesRequired;
    
    await DB.updateUser(userId, {
      status: 'received',
      invite_sent_at: new Date(),
      invite_code_given: codeObj.code,
      reminder_count: 0,
      invites_received_count: (user.invites_received_count || 0) + 1
    });
    
    await DB.markCodeAsSent(codeObj.id, userId);
    
    await bot.telegram.sendMessage(
      userId,
      MESSAGES.inviteSent(codeObj.code, codesRequired),
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: MESSAGES.buttons.shareCode, callback_data: 'share_code' }],
            [{ text: MESSAGES.buttons.reportInvalid, callback_data: 'report_invalid' }]
          ]
        }
      }
    );
    
    console.log(`[Queue] Sent invite to @${user.username} (${count <= 10 ? 'first 10' : 'regular'}, lang: ${user.language})`);
    
    // Уведомить админа
    try {
      await bot.telegram.sendMessage(
        config.telegram.adminId,
        `✅ Инвайт отправлен: @${user.username}\n` +
        `Должен вернуть: ${codesRequired} кодов\n` +
        `Статус: ${count <= 10 ? 'Из первых 10' : 'Обычный пользователь'}\n` +
        `Язык: ${user.language === 'en' ? 'English' : 'Русский'}`
      );
    } catch (error) {
      console.error('[Queue] Admin notification failed:', error.message);
    }
  } catch (error) {
    console.error(`[Queue] Failed to process invite for ${userId}:`, error);
  }
}

async function sendUrgentHelpRequest(bot) {
  try {
    const allUsers = await DB.getAllUsers();
    
    const targetUsers = allUsers.filter(u => 
      (u.status === 'received' || u.status === 'completed') &&
      (u.usage_count_shared || 0) < 4 &&
      !u.is_banned
    );
    
    if (targetUsers.length === 0) {
      console.log('[Urgent] No users to notify');
      return;
    }
    
    let sent = 0;
    
    for (const user of targetUsers) {
      try {
        const { getMessages } = await import('./messages.js');
        const MESSAGES = getMessages(user.language || 'ru');
        
        const urgentMessage = user.language === 'en'
          ? `🚨 **URGENT: System Critical!**

The invite pool is almost empty (≤2 codes) but people are waiting in queue.

**Your help is needed NOW!**

Please donate more invite uses if you can.`
          : `🚨 **СРОЧНО: Критическая ситуация!**

Пул инвайтов почти пуст (≤2 кода), а люди ждут в очереди.

**Твоя помощь нужна СЕЙЧАС!**

Пожалуйста пожертвуй дополнительные использования если можешь.`;
        
        // Обычная кнопка донейта (без эпичного "Рохан явится")
        await bot.telegram.sendMessage(user.telegram_id, urgentMessage, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: MESSAGES.buttons.shareCode, callback_data: 'share_code' }
            ]]
          }
        });
        sent++;
        
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`[Urgent] Failed to notify ${user.telegram_id}:`, error.message);
      }
    }
    
    console.log(`[Urgent] Sent urgent help request to ${sent} users`);
  } catch (error) {
    console.error('[Urgent] Error sending urgent help:', error);
  }
}

