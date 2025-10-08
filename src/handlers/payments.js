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
              // Отправляем статус каждые 60 секунд или при ключевых прогрессах
              if (elapsed % 60 < 6 || [40, 66, 89, 100].includes(progress)) {
                const msg = `⏳ Прогресс: ${progress}%... (${Math.round(elapsed / 60)} мин)`;
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
            
            await ctx.replyWithDocument(
              { source: Buffer.from(videoBuffer), filename: `sora_${create.id}.mp4` },
              { caption: `${MESSAGES.generationSuccess}\n\n📊 ${model}, ${duration}с, ${width}x${height}` }
            );
          } catch (err) {
            console.error('Sora generation error:', err);
            await ctx.reply(MESSAGES.generationFailed(err.message || 'unknown'));
            
            // Рефанд при ошибке
            const refund = await bot.telegram.refundStarPayment(userId, payment.telegram_payment_charge_id);
            if (refund) {
              await ctx.reply(MESSAGES.paymentRefunded(payment.total_amount));
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
