import DB from '../database.js';
import { getMessages } from '../messages.js';
import { createSoraVideo, pollSoraVideo, soraQueue } from '../sora.js';
import config from '../config.js';

export function registerPaymentHandlers(bot) {
  // Pre-checkout query (подтверждение перед оплатой)
  bot.on('pre_checkout_query', async (ctx) => {
    console.log('[Payment] Pre-checkout query:', ctx.preCheckoutQuery);
    
    try {
      // Всегда подтверждаем (валидация уже прошла при создании invoice)
      await ctx.answerPreCheckoutQuery(true);
    } catch (error) {
      console.error('[Payment] Pre-checkout error:', error);
      await ctx.answerPreCheckoutQuery(false, 'Ошибка обработки платежа');
    }
  });

  // Successful payment (после успешной оплаты)
  bot.on('message', async (ctx, next) => {
    if (!ctx.message.successful_payment) return next();
    
    const payment = ctx.message.successful_payment;
    const userId = ctx.from.id;
    
    console.log('[Payment] Successful payment:', {
      userId,
      stars: payment.total_amount,
      payload: payment.invoice_payload,
      chargeId: payment.telegram_payment_charge_id
    });
    
    try {
      const payloadData = JSON.parse(payment.invoice_payload);
      const user = await DB.getUser(userId);
      const MESSAGES = getMessages(user?.language || 'ru');
      
      if (payloadData.type === 'sora_generation') {
        // Создаём транзакцию
        const tx = await DB.createSoraTransaction(userId, {
          type: 'single',
          stars: payment.total_amount,
          mode: payloadData.mode,
          bundleCount: 1,
          videoIds: []
        });
        
        await DB.updateSoraTransaction(tx.id, {
          telegram_charge_id: payment.telegram_payment_charge_id
        });
        
        // Получаем сохранённые параметры
        const pending = user.sora_pending_payment;
        if (!pending) {
          return ctx.reply('❌ Ошибка: параметры генерации не найдены');
        }
        
        await ctx.reply(`✅ Оплата ${payment.total_amount}⭐ принята!\n\n${MESSAGES.generationQueued}`);
        
        // Уведомляем админа о начале операции
        try {
          await bot.telegram.sendMessage(
            config.telegram.adminId,
            `💫 Новая Sora генерация\n\nUser: @${user.username} (${userId})\nTX: ${tx.id}\nMode: ${payloadData.model}, ${payloadData.duration}с\nStars: ${payment.total_amount}⭐\nCharge: ${payment.telegram_payment_charge_id}`
          );
        } catch (e) {
          console.error('[Payment] Admin notification failed:', e.message);
        }
        
        // Запускаем генерацию
        const { prompt, model, duration, width, height } = pending;
        
        // Расчёт ETA
        let eta = '3-5 минут';
        if (model === 'sora-2-pro') {
          if (duration >= 12) eta = '10-15 минут';
          else if (duration >= 8) eta = '7-10 минут';
          else eta = '5-7 минут';
        } else {
          if (duration >= 12) eta = '5-8 минут';
          else if (duration >= 8) eta = '3-5 минут';
          else eta = '1-3 минуты';
        }
        
        soraQueue.enqueue(async () => {
          try {
            let lastStatusMsg = null;
            await ctx.reply(MESSAGES.generationStarted(eta));
            const create = await createSoraVideo({ model, prompt, durationSeconds: duration, width, height });
            console.log('[Sora] Video created, ID:', create.id);
            
            // Обновляем транзакцию
            await DB.updateSoraTransaction(tx.id, {
              videos_generated: [create.id],
              videos_remaining: 0
            });
            
            // Опрашиваем с промежуточными статусами
            const result = await pollSoraVideo(create.id, (progress, elapsed) => {
              // -1 = в queued ожидании
              if (progress === -1 && elapsed % 120 < 6) {
                const msg = `⏳ В очереди OpenAI... (${Math.round(elapsed / 60)} мин)\n\nAPI перегружен, ждём свободного слота.`;
                if (msg !== lastStatusMsg) {
                  ctx.reply(msg).catch(() => {});
                  lastStatusMsg = msg;
                }
              }
              // Отправляем статус при ключевых прогрессах
              else if ([40, 66, 89].includes(progress)) {
                const msg = `⏳ Прогресс: ${progress}%...`;
                if (msg !== lastStatusMsg) {
                  ctx.reply(msg).catch(() => {});
                  lastStatusMsg = msg;
                }
              }
            });
            console.log('[Sora] Video completed, downloading content...');
            
            const contentResp = await fetch(`https://api.openai.com/v1/videos/${create.id}/content`, {
              headers: { 'Authorization': `Bearer ${config.sora.openaiApiKey}` }
            });
            if (!contentResp.ok) {
              throw new Error(`Content download failed: ${contentResp.status}`);
            }
            const videoBuffer = await contentResp.arrayBuffer();
            console.log('[Sora] Video downloaded, size:', videoBuffer.byteLength, 'bytes');
            
            const sentMsg = await ctx.replyWithDocument(
              { source: Buffer.from(videoBuffer), filename: `sora_${create.id}.mp4` },
              { caption: `${MESSAGES.generationSuccess}\n\n📊 ${model}, ${duration}с, ${width}x${height}\n\n❓ Проблемы? → ${config.telegram.soraUsername}` }
            );
            
            console.log('[Sora] Message sent, structure:', JSON.stringify({
              message_id: sentMsg.message_id,
              document: sentMsg.document ? {
                file_id: sentMsg.document.file_id,
                file_unique_id: sentMsg.document.file_unique_id,
                file_size: sentMsg.document.file_size
              } : 'no document'
            }, null, 2));
            
            // Сохраняем file_id для возможности повторной отправки
            const fileId = sentMsg.document?.file_id;
            if (fileId) {
              await DB.updateSoraTransaction(tx.id, {
                telegram_file_ids: [fileId],
                delivery_confirmed: true
              });
            }
            
            // Уведомляем админа об успешной генерации + отправляем файл
            try {
              const safeUsername = (user.username || 'anonymous').replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
              await ctx.telegram.sendMessage(
                config.telegram.adminId,
                `✅ Sora видео доставлено\n\nUser: @${safeUsername} \\(${userId}\\)\nTX: ${tx.id}\nVideo: ${create.id}\nFile ID: ${fileId || 'N/A'}\nStars: ${payment.total_amount}⭐\nMode: ${model}, ${duration}с, ${width}x${height}\nSize: ${Math.round(videoBuffer.byteLength / 1024)}KB`
              );
              
              // Отправляем копию файла админу
              if (fileId) {
                await ctx.telegram.sendDocument(config.telegram.adminId, fileId);
              } else {
                // Если file_id не получен, отправляем буфер
                await ctx.telegram.sendDocument(config.telegram.adminId, {
                  source: Buffer.from(videoBuffer),
                  filename: `sora_${create.id}.mp4`
                });
              }
            } catch (e) {
              console.error('[Payment] Admin notification failed:', e.message);
            }
          } catch (err) {
            console.error('Sora generation error:', err);
            
            // Если failed из-за policy violation - НЕ делаем retry, сразу рефанд
            if (err.message.includes('failed: failed')) {
              console.log('[Sora] Video rejected by OpenAI (policy violation), immediate refund');
              // Пропускаем retry, идём сразу к рефанду
            } else {
              // AUTO-RETRY: если был усиленный промпт и произошла ошибка, пробуем оригинальный
              const wasEnhanced = pending.isEnhanced;
              const originalPrompt = user.sora_original_prompt;
              
              if (wasEnhanced && originalPrompt && (err.message.includes('stuck') || err.message.includes('500'))) {
              console.log('[Sora] Enhanced prompt failed, retrying with original...');
              try {
                await ctx.reply('🔄 Усиленный промпт не сработал. Пробую оригинальный...');
                const retryCreate = await createSoraVideo({ model, prompt: originalPrompt, durationSeconds: duration, width, height });
                const retryResult = await pollSoraVideo(retryCreate.id, progressCallback);
                
                const retryContentResp = await fetch(`https://api.openai.com/v1/videos/${retryCreate.id}/content`, {
                  headers: { 'Authorization': `Bearer ${config.sora.openaiApiKey}` }
                });
                if (retryContentResp.ok) {
                  const retryBuffer = await retryContentResp.arrayBuffer();
                  const retrySentMsg = await ctx.replyWithDocument(
                    { source: Buffer.from(retryBuffer), filename: `sora_${retryCreate.id}.mp4` },
                    { caption: `${MESSAGES.generationSuccess} (retry с оригинальным промптом)\n\n📊 ${model}, ${duration}с, ${width}x${height}\n\n❓ Проблемы? → ${config.telegram.soraUsername}` }
                  );
                  
                  await DB.updateSoraTransaction(tx.id, {
                    videos_generated: [retryCreate.id],
                    telegram_file_ids: [retrySentMsg.document?.file_id].filter(Boolean),
                    delivery_confirmed: true,
                    retry_count: 1
                  });
                  
                  await ctx.telegram.sendMessage(config.telegram.adminId, 
                    `✅ Sora retry успешен\n\nUser: @${user.username}\nTX: ${tx.id}\nRetry video: ${retryCreate.id}\nOriginal failed, used fallback prompt`
                  );
                  
                  // Отправляем копию админу
                  if (retrySentMsg.document?.file_id) {
                    await ctx.telegram.sendDocument(config.telegram.adminId, retrySentMsg.document.file_id);
                  }
                  
                  return; // Успех, выходим без рефанда
                }
              } catch (retryErr) {
                  console.error('[Sora] Retry failed:', retryErr);
                  await ctx.reply('❌ Retry тоже не удался. Делаем рефанд...');
                }
              }
            }
            
            // Рефанд при ошибке (через raw API, Telegraf 4.15 не поддерживает refundStarPayment)
            try {
              const refundResp = await fetch(`https://api.telegram.org/bot${config.telegram.token}/refundStarPayment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  user_id: userId,
                  telegram_payment_charge_id: payment.telegram_payment_charge_id
                })
              });
              const refundData = await refundResp.json();
              if (!refundData.ok) {
                throw new Error(`Refund failed: ${JSON.stringify(refundData)}`);
              }
              
              // Более информативное сообщение об ошибке
              let errorMsg = MESSAGES.generationFailed(err.message || 'unknown');
              if (err.message && err.message.includes('failed: failed')) {
                errorMsg = user?.language === 'en'
                  ? '🚫 **Content Rejected**\n\nOpenAI rejected this video (policy violation).\n\nTry a different prompt without offensive/explicit content.'
                  : '🚫 **Контент отклонён**\n\nOpenAI отклонил это видео (нарушение правил).\n\nПопробуй другой промпт без оскорбительного/откровенного контента.';
              }
              
              await ctx.reply(`${errorMsg}\n\n${MESSAGES.paymentRefunded(payment.total_amount)}\n\n🔄 Попробуй ещё раз: /generate`);
              
              // Уведомляем админа об ошибке и рефанде
              await ctx.telegram.sendMessage(
                config.telegram.adminId,
                `❌ Sora ошибка + рефанд\n\nUser: @${user.username}\nTX: ${tx.id}\nStars: ${payment.total_amount}⭐ (возвращены)\nError: ${err.message}\nCharge: ${payment.telegram_payment_charge_id}`
              );
              
              await DB.updateSoraTransaction(tx.id, {
                status: 'refunded',
                error_message: err.message
              });
            } catch (refundErr) {
              console.error('[Payment] Refund failed:', refundErr);
              await ctx.reply(`${MESSAGES.generationFailed(err.message || 'unknown')}\n\n❌ Автоматический возврат не удался. Свяжись с ${config.telegram.soraUsername} для рефанда.`);
              
              // Критическое уведомление админу
              await ctx.telegram.sendMessage(
                config.telegram.adminId,
                `🚨 КРИТИЧНО: Рефанд не удался!\n\nUser: @${user.username}\nTX: ${tx.id}\nStars: ${payment.total_amount}⭐\nCharge: ${payment.telegram_payment_charge_id}\n\nНужен ручной рефанд!`
              );
            }
          }
        });
        
        // Очищаем pending
        await DB.updateUser(userId, {
          sora_pending_payment: null,
          sora_pending_mode: null,
          sora_original_prompt: null,
          sora_enhanced_prompt: null
        });
      }
    } catch (error) {
      console.error('[Payment] Processing error:', error);
      await ctx.reply('❌ Ошибка обработки платежа. Свяжись с админом.');
    }
  });
}
