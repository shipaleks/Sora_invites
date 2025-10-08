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
    maxCodeUsage: 20,             // Код можем отдать максимум 20 людям (Sora даёт дополнительные использования)
    deadlineHours: 48,            // Дедлайн для возврата
    reminderIntervals: [6, 12, 18, 24, 36, 42] // Напоминания (6ч, 12ч, 18ч, 24ч, 36ч, 42ч)
  },
  
  app: {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT) || 3000,
    webhookDomain: process.env.WEBHOOK_DOMAIN
  },

  sora: {
    openaiApiKey: process.env.OPENAI_API_KEY,
    // Конкурентность генерации видео (воркеры) - снижена до 1 из-за перегрузки OpenAI API
    concurrency: parseInt(process.env.SORA_CONCURRENCY || '1'),
    // Таймауты (Sora генерация может занимать 3-5 минут)
    createTimeoutMs: parseInt(process.env.SORA_CREATE_TIMEOUT_MS || '300000'), // 5 min
    pollIntervalMs: parseInt(process.env.SORA_POLL_INTERVAL_MS || '5000'), // 5s
    pollTimeoutMs: parseInt(process.env.SORA_POLL_TIMEOUT_MS || '900000') // 15 min
  },

  pricing: {
    // Индивидуальные
    single: {
      basic4s: 100, // sora-2, 720p, 4s
      pro4s: 250    // sora-2-pro, 1024×1792/1792×1024, 4s
    },
    // Бандлы (кратно 50)
    bundles: {
      basic4s: { '3': 250, '5': 450, '10': 800 },
      pro4s:   { '3': 650, '5': 1100, '10': 2000 }
    },
    // Конструктор
    constructor: {
      baseRatePerSecond: { lite: 13, proMax: 62 },
      roundToSeconds: [4, 8, 12],
      roundStarsTo: 50
    },
    // Приблизительная конверсия 1⭐ → ₽ (настраивается, по умолчанию 1)
    starToRub: parseFloat(process.env.STAR_TO_RUB || '1.0')
  }
};

