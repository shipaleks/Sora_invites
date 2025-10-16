import { Telegraf } from 'telegraf';
import config from './config.js';
import { registerCommands } from './handlers/commands.js';
import { registerCallbacks } from './handlers/callbacks.js';
import { registerTextHandlers } from './handlers/text.js';
import { startSchedulers } from './scheduler.js';

const bot = new Telegraf(config.telegram.token);

// Обработка ошибок (устойчиво к 403 и деактивированным аккаунтам)
bot.catch(async (err, ctx) => {
  const code = err?.response?.error_code;
  const desc = err?.response?.description || err?.message || '';
  const isUserBlocked = code === 403 && /bot was blocked by the user|user is deactivated/i.test(desc);

  if (isUserBlocked) {
    // 403 на отправку сообщений — игнорируем, чтобы не падать и не зацикливаться
    console.warn('[Bot Warn] 403 on sendMessage: user blocked or deactivated', {
      chat_id: ctx?.from?.id,
      desc
    });
    return;
  }

  console.error('[Bot Error]', { code, desc, stack: err?.stack });
  try {
    await ctx.reply('❌ Произошла ошибка. Попробуй ещё раз или обратись к администратору.').catch(() => {});
  } catch {}
});

// Глобальные обработчики, чтобы приложение не выходило с кодом 1 из-за необработанных ошибок
process.on('unhandledRejection', (reason) => {
  const code = reason?.response?.error_code;
  const desc = reason?.response?.description || reason?.message || '';
  if (code === 403 && /bot was blocked by the user|user is deactivated/i.test(desc)) {
    console.warn('[UnhandledRejection Ignored] 403 user blocked/deactivated');
    return;
  }
  console.error('[UnhandledRejection]', reason);
});

process.on('uncaughtException', (err) => {
  const code = err?.response?.error_code;
  const desc = err?.response?.description || err?.message || '';
  if (code === 403 && /bot was blocked by the user|user is deactivated/i.test(desc)) {
    console.warn('[UncaughtException Ignored] 403 user blocked/deactivated');
    return;
  }
  console.error('[UncaughtException]', err);
});

// Регистрируем обработчики
registerCommands(bot);
registerCallbacks(bot);
registerTextHandlers(bot);

// Telegram Stars payment handlers
import { registerPaymentHandlers } from './handlers/payments.js';
registerPaymentHandlers(bot);

// Запускаем планировщики
startSchedulers(bot);

// Запуск бота
if (config.app.nodeEnv === 'production' && config.app.webhookDomain) {
  // Production - Webhook
  const domain = config.app.webhookDomain.replace(/\/+$/, '');
  const webhookUrl = `https://${domain}/webhook`;
  
  // Проверяем текущий webhook перед установкой
  bot.telegram.getWebhookInfo().then(info => {
    if (info.url !== webhookUrl) {
      return bot.telegram.setWebhook(webhookUrl);
    } else {
      console.log(`✅ Webhook already set: ${webhookUrl}`);
    }
  }).then(() => {
    console.log(`✅ Webhook ready: ${webhookUrl}`);
  }).catch(err => {
    if (err.response?.error_code === 429) {
      console.warn('⚠️ Rate limited, webhook will be set on next startup');
    } else {
      console.error('❌ Webhook error:', err.message);
    }
  });
  
  bot.startWebhook('/webhook', null, config.app.port);
  
  console.log(`✅ Bot started with webhook on port ${config.app.port}`);
} else {
  // Development - Polling
  bot.launch();
  console.log('✅ Bot started with polling (development mode)');
}

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

console.log(`
╔═══════════════════════════════════════╗
║   Sora Invite Bot v1.0.0              ║
║   Environment: ${config.app.nodeEnv.padEnd(23)} ║
║   Status: Running ✓                   ║
╚═══════════════════════════════════════╝
`);

