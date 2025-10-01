import dotenv from 'dotenv';
dotenv.config();

export default {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    adminId: parseInt(process.env.ADMIN_TELEGRAM_ID),
    channel: process.env.TELEGRAM_CHANNEL || '@humanagentinteraction',
    soraUsername: process.env.SORA_USERNAME || '@shipaleks'
  },
  
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  },
  
  rules: {
    first10CodesRequired: 3,      // Первые 10 возвращают 3 кода
    regularCodesRequired: 2,      // Остальные возвращают 2 кода
    deadlineHours: 72,            // Дедлайн для возврата (увеличен до 72ч)
    reminderIntervals: [6, 24, 48] // Напоминания (6ч - первый код, 24ч, 48ч)
  },
  
  app: {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT) || 3000,
    webhookDomain: process.env.WEBHOOK_DOMAIN
  }
};

