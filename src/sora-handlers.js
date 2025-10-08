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
      // Простейший парсер параметров конструктора
      // Пример: "8с, Pro Max, 9:16, промпт ..."
      const text = promptToUse;
      const secondsMatch = text.match(/(4|8|12)\s*с/i);
      duration = secondsMatch ? parseInt(secondsMatch[1]) : 4;
      const qualityMatch = /pro\s*max/i.test(text) ? 'proMax' : 'lite';
      const ratioMatch = /(9\s*:\s*16|16\s*:\s*9)/i.exec(text);
      const vertical = ratioMatch ? /9\s*:\s*16/i.test(ratioMatch[1]) : true;
      if (qualityMatch === 'proMax') {
        model = 'sora-2-pro';
      }
      if (vertical) { width = 1024; height = 1792; } else { width = 1792; height = 1024; }
      // Цена (эмулируем списание)
      starsToCharge = 0; // админ-тест: не списываем реально
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
        const result = await pollSoraVideo(create.id);
        const videoUrl = result.output_url || result.url || result.video?.url;
        if (!videoUrl) throw new Error('No video URL in result');
        await ctx.replyWithVideo({ url: videoUrl }, { caption: MESSAGES.generationSuccess });
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

