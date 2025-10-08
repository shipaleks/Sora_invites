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

    // 3) Списываем звёзды (эмуляция)
    if (starsToCharge > 0) {
      await ctx.reply(MESSAGES.paymentRequested(starsToCharge), { parse_mode: 'Markdown' });
      const charge = await Stars.charge(ctx, starsToCharge, `Sora gen ${user.sora_pending_mode}`);
      if (!charge.ok) throw new Error('Charge failed');
    }

    await ctx.reply(MESSAGES.generationQueued);

    // 4) Пускаем в очередь на генерацию (НЕ ждём завершения, чтобы не упасть по handlerTimeout)
    soraQueue.enqueue(async () => {
      try {
        await ctx.reply(MESSAGES.generationStarted);
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
        
        await ctx.replyWithVideo({ source: Buffer.from(videoBuffer) }, { caption: MESSAGES.generationSuccess });
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

