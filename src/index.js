import { Telegraf } from 'telegraf';
import config from './config.js';
import { registerCommands } from './handlers/commands.js';
import { registerCallbacks } from './handlers/callbacks.js';
import { registerTextHandlers } from './handlers/text.js';
import { startSchedulers } from './scheduler.js';

const bot = new Telegraf(config.telegram.token);

// Обработка ошибок
bot.catch((err, ctx) => {
  console.error('[Bot Error]', err);
  try {
    ctx.reply('❌ Произошла ошибка. Попробуй ещё раз или обратись к администратору.');
  } catch (e) {
    console.error('[Error Handler Failed]', e);
  }
});

// Регистрируем обработчики
registerCommands(bot);
registerCallbacks(bot);
registerTextHandlers(bot);

// Запускаем планировщики
startSchedulers(bot);

// Запуск бота
if (config.app.nodeEnv === 'production' && config.app.webhookDomain) {
  // Production - Webhook
  const webhookUrl = `https://${config.app.webhookDomain}/webhook`;
  
  bot.telegram.setWebhook(webhookUrl).then(() => {
    console.log(`✅ Webhook set: ${webhookUrl}`);
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

