import DB from './database.js';
import { getMessages } from './messages.js';
import config from './config.js';
import { createSoraVideo, pollSoraVideo, soraQueue, Stars } from './sora.js';

export async function executeSoraGeneration(ctx, user, promptToUse, isEnhanced) {
  const language = user.language || 'ru';
  const MESSAGES = getMessages(language);

  try {
    if (isEnhanced) {
      await ctx.reply(MESSAGES.promptImproved(promptToUse), { parse_mode: 'Markdown' });
    } else {
      await ctx.reply(MESSAGES.promptOriginal, { parse_mode: 'Markdown' });
    }

    // 2) Выбираем конфиг по режиму
    let model = 'sora-2';
    let duration = 4;
    let width = 1280, height = 720; // 720p для basic
    let starsToCharge = 0;

    if (user.sora_pending_mode === 'basic4s') {
      starsToCharge = 100;
      model = 'sora-2';
      width = 1280; height = 720;
    } else if (user.sora_pending_mode === 'pro4s') {
      starsToCharge = 250;
      model = 'sora-2-pro';
      // Выберем вертикаль по умолчанию
      width = 1024; height = 1792;
    } else if (user.sora_pending_mode === 'constructor') {
      // Используем параметры из кнопок
      duration = user.sora_custom_duration || 4;
      const quality = user.sora_custom_quality || 'basic';
      const orientation = user.sora_custom_orientation || '16:9';
      
      model = quality === 'pro' ? 'sora-2-pro' : 'sora-2';
      
      if (orientation === '9:16') {
        width = 1024; height = 1792;
      } else {
        width = 1792; height = 1024;
      }
      
      // Цена по формуле
      const rate = quality === 'pro' ? config.pricing.constructor.baseRatePerSecond.proMax : config.pricing.constructor.baseRatePerSecond.lite;
      starsToCharge = Math.ceil((duration * rate) / 50) * 50;
    }

    // 3) Отправляем invoice для оплаты звёздами
    if (starsToCharge > 0) {
      const title = model === 'sora-2-pro' ? `Sora HD ${duration}с` : `Sora ${duration}с`;
      const description = `Генерация видео через ${model}`;
      const payload = JSON.stringify({
        type: 'sora_generation',
        mode: user.sora_pending_mode,
        model,
        duration,
        stars: starsToCharge,
        userId: user.telegram_id
      });
      
      await Stars.sendInvoice(ctx, { title, description, payload, stars: starsToCharge });
      
      // Сохраняем промпт для использования после оплаты
      await DB.updateUser(user.telegram_id, {
        sora_pending_payment: {
          prompt: promptToUse,
          model,
          duration,
          width,
          height,
          stars: starsToCharge,
          isEnhanced
        }
      });
      
      // Выходим - продолжим после successful_payment
      return;
    }

    await ctx.reply(MESSAGES.generationQueued);

    // 4) Пускаем в очередь на генерацию (НЕ ждём завершения, чтобы не упасть по handlerTimeout)
    soraQueue.enqueue(async () => {
      try {
        // Расчёт ETA на основе параметров
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
        
        await ctx.reply(MESSAGES.generationStarted(eta));
        const create = await createSoraVideo({ model, prompt: promptToUse, durationSeconds: duration, width, height });
        console.log('[Sora] Video created, ID:', create.id);
        const result = await pollSoraVideo(create.id);
        console.log('[Sora] Video completed, downloading content...');
        
        // Загружаем контент через /videos/{id}/content
        const contentResp = await fetch(`https://api.openai.com/v1/videos/${create.id}/content`, {
          headers: { 'Authorization': `Bearer ${config.sora.openaiApiKey}` }
        });
        if (!contentResp.ok) {
          throw new Error(`Content download failed: ${contentResp.status}`);
        }
        const videoBuffer = await contentResp.arrayBuffer();
        console.log('[Sora] Video downloaded, size:', videoBuffer.byteLength, 'bytes');
        
        // Отправляем как документ для сохранения оригинального качества и пропорций
        await ctx.replyWithDocument(
          { source: Buffer.from(videoBuffer), filename: `sora_${create.id}.mp4` },
          { caption: `${MESSAGES.generationSuccess}\n\n📊 ${model}, ${duration}с, ${width}x${height}` }
        );
      } catch (err) {
        console.error('Sora generation error:', err);
        await ctx.reply(MESSAGES.generationFailed(err.message || 'unknown'));
        if (starsToCharge > 0) {
          try { await Stars.refund(ctx, starsToCharge, err.message || 'error'); await ctx.reply(MESSAGES.paymentRefunded(starsToCharge)); } catch (e) { /* noop */ }
        }
      }
    });
  } catch (error) {
    console.error('Sora execution error:', error);
    await ctx.reply(MESSAGES.generationFailed(error.message || 'unknown'));
  } finally {
    // Очищаем все временные флаги
    await DB.updateUser(user.telegram_id, { 
      sora_pending_mode: null,
      sora_original_prompt: null,
      sora_enhanced_prompt: null
    });
  }
}

