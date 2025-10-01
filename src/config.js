import dotenv from 'dotenv';
dotenv.config();

export default {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    adminId: parseInt(process.env.ADMIN_TELEGRAM_ID),
    channel: process.env.TELEGRAM_CHANNEL || 't.me/humanagentinteraction',
    soraUsername: process.env.SORA_USERNAME || '@shipaleks',
    twitterEn: process.env.TWITTER_EN || 'x.com/midwitgenstein'
  },
  
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  },
  
  rules: {
    first10CodesRequired: 1,      // Все возвращают код 1 раз
    regularCodesRequired: 1,      // Все возвращают код 1 раз
    maxCodeUsage: 2,              // Код можем отдать максимум 2 людям (из 4 использований)
    deadlineHours: 48,            // Дедлайн для возврата
    reminderIntervals: [12, 24, 40] // Напоминания (12ч, 24ч, 40ч)
  },
  
  app: {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT) || 3000,
    webhookDomain: process.env.WEBHOOK_DOMAIN
  }
};

