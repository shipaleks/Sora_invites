import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';

dotenv.config();

// Загружаем credentials
const serviceAccount = JSON.parse(
  readFileSync('./sora-invite-bot-firebase-adminsdk-fbsvc-cb61b27933.json', 'utf8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Токен из env или аргумента
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.argv[2];
if (!BOT_TOKEN) {
  console.error('❌ Нужен TELEGRAM_BOT_TOKEN: либо в .env, либо как аргумент');
  console.error('   Использование: node pilot_distribution.js [BOT_TOKEN]');
  process.exit(1);
}
const bot = new Telegraf(BOT_TOKEN);

const BATCH_SIZE = 500; // Пилот на 500 человек
const CODES_PER_USER = 3;
const RATE_LIMIT_MS = 40; // 25 msg/sec = 1 msg / 40ms

async function pilotDistribution() {
  console.log('🚀 ПИЛОТНАЯ РАЗДАЧА');
  console.log(`   Размер батча: ${BATCH_SIZE} человек`);
  console.log(`   Кодов на человека: ${CODES_PER_USER}`);
  console.log(`   Всего нужно: ${BATCH_SIZE * CODES_PER_USER} использований\n`);
  
  try {
    // 1. Собираем все уникальные коды (исключая с жалобами)
    console.log('📦 Собираю коды из пула...');
    const poolSnap = await db.collection('invite_pool').get();
    const allCodes = new Set();
    poolSnap.forEach(doc => allCodes.add(doc.data().code));
    
    // Собираем коды с жалобами
    console.log('🚫 Проверяю коды с жалобами...');
    const usersSnap = await db.collection('users').get();
    const complainedCodes = new Set();
    usersSnap.forEach(doc => {
      const data = doc.data();
      if (data.invalid_codes_reported) {
        data.invalid_codes_reported.forEach(code => complainedCodes.add(code));
      }
    });
    
    // Чистые коды
    const cleanCodes = Array.from(allCodes).filter(code => !complainedCodes.has(code));
    console.log(`   Всего кодов: ${allCodes.size}`);
    console.log(`   С жалобами: ${complainedCodes.size}`);
    console.log(`   Чистых: ${cleanCodes.length}`);
    console.log(`   Максимум использований: ${cleanCodes.length * 4}\n`);
    
    const needed = BATCH_SIZE * CODES_PER_USER;
    if (cleanCodes.length * 4 < needed) {
      console.log(`❌ НЕ ХВАТАЕТ КОДОВ!`);
      console.log(`   Нужно: ${needed}`);
      console.log(`   Есть: ${cleanCodes.length * 4}`);
      process.exit(1);
    }
    
    // 2. Берём первых N из очереди
    console.log('👥 Получаю очередь...');
    const queueSnap = await db.collection('queue')
      .orderBy('position', 'asc')
      .limit(BATCH_SIZE)
      .get();
    
    if (queueSnap.size < BATCH_SIZE) {
      console.log(`⚠️ В очереди только ${queueSnap.size} человек (нужно ${BATCH_SIZE})`);
      const proceed = await question(`Продолжить с ${queueSnap.size}? (y/n): `);
      if (proceed.toLowerCase() !== 'y') {
        console.log('Отменено');
        process.exit(0);
      }
    }
    
    const queueUsers = [];
    queueSnap.forEach(doc => queueUsers.push(doc.data()));
    console.log(`   Готово: ${queueUsers.length} человек\n`);
    
    // 3. Подготовка раздачи
    console.log('📊 Распределяю коды...');
    const distribution = [];
    let codeIdx = 0;
    
    for (let i = 0; i < queueUsers.length; i++) {
      const userCodes = [];
      for (let j = 0; j < CODES_PER_USER; j++) {
        if (codeIdx >= cleanCodes.length) {
          // Начинаем с начала (используем коды по 2-4 раза)
          codeIdx = 0;
        }
        userCodes.push(cleanCodes[codeIdx]);
        codeIdx++;
      }
      distribution.push({
        telegram_id: queueUsers[i].telegram_id,
        codes: userCodes
      });
    }
    
    console.log(`   Раздача подготовлена: ${distribution.length} пользователей\n`);
    
    // Подтверждение
    console.log('⚠️  ВНИМАНИЕ: Сейчас начнётся массовая раздача!');
    console.log(`   Будет отправлено ${distribution.length} сообщений`);
    console.log(`   Примерное время: ${Math.round(distribution.length * RATE_LIMIT_MS / 1000 / 60)} минут\n`);
    
    const confirm = await question('Начать раздачу? (yes/no): ');
    if (confirm.toLowerCase() !== 'yes') {
      console.log('Отменено');
      process.exit(0);
    }
    
    // 4. РАЗДАЧА
    console.log('\n🚀 НАЧИНАЮ РАЗДАЧУ...\n');
    let sent = 0;
    let failed = 0;
    
    for (const item of distribution) {
      try {
        // Получаем пользователя для языка
        const userDoc = await db.collection('users').doc(item.telegram_id).get();
        if (!userDoc.exists) {
          console.log(`⚠️  User ${item.telegram_id} not found, skipping`);
          failed++;
          continue;
        }
        
        const userData = userDoc.data();
        const lang = userData.language || 'ru';
        
        // Формируем сообщение
        const codesList = item.codes.map((c, i) => `${i + 1}️⃣ \`${c}\``).join('\n');
        const message = lang === 'en'
          ? `🎉 **Your Sora invite codes:**\n\n${codesList}\n\n**What to do:**\n1. Try codes one by one on sora.com (need US VPN 🇺🇸)\n2. One will work — mark it with ✅\n3. After registration, come back and send your Sora code\n\n⚠️ **Video generation access is locked until you mark results.**\n\nMark result for each code:`
          : `🎉 **Твои инвайт-коды для Sora:**\n\n${codesList}\n\n**Что делать:**\n1. Попробуй коды по очереди на sora.com (нужен VPN 🇺🇸)\n2. Один сработает — отметь его кнопкой ✅\n3. После регистрации вернись и отправь свой код из Sora\n\n⚠️ **Пока не отметишь результат — доступ к генерации видео закрыт.**\n\nОтметь результат для каждого кода:`;
        
        // Кнопки для каждого кода + "не использовал ни один"
        const buttons = item.codes.map(code => [
          { text: `✅ ${code}`, callback_data: `mark_used_${code}` },
          { text: `↩️ ${code}`, callback_data: `mark_unused_${code}` },
          { text: `🚫 ${code}`, callback_data: `mark_invalid_${code}` }
        ]);
        buttons.push([{ text: '🤷 Не использовал ни один', callback_data: 'mark_none_used' }]);
        
        // Отправляем
        await bot.telegram.sendMessage(item.telegram_id, message, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: buttons }
        });
        
        // Обновляем БД
        const invites = item.codes.map(code => ({
          code,
          sent_at: new Date(),
          status: 'pending'
        }));
        
        await db.collection('users').doc(item.telegram_id).update({
          invites_pending: invites,
          migration_batch: true,
          access_locked: true,
          status: 'received'
        });
        
        // Удаляем из очереди
        await db.collection('queue').doc(item.telegram_id).delete();
        
        sent++;
        
        if (sent % 50 === 0) {
          console.log(`✅ Отправлено: ${sent}/${distribution.length}`);
        }
        
        // Rate limit
        await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
        
      } catch (error) {
        failed++;
        console.error(`❌ Ошибка для ${item.telegram_id}:`, error.message);
      }
    }
    
    // Пересчитываем позиции в очереди
    console.log('\n🔄 Пересчитываю позиции в очереди...');
    const remainingQueue = await db.collection('queue')
      .orderBy('joined_at', 'asc')
      .get();
    
    const batch = db.batch();
    remainingQueue.docs.forEach((doc, index) => {
      batch.update(doc.ref, { position: index + 1 });
    });
    if (!remainingQueue.empty) await batch.commit();
    
    console.log('\n✅ РАЗДАЧА ЗАВЕРШЕНА!');
    console.log(`   Успешно: ${sent}`);
    console.log(`   Ошибок: ${failed}`);
    console.log(`   Осталось в очереди: ${remainingQueue.size}\n`);
    
  } catch (error) {
    console.error('❌ КРИТИЧЕСКАЯ ОШИБКА:', error);
  } finally {
    process.exit(0);
  }
}

import readline from 'readline';

function question(query) {
  return new Promise(resolve => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question(query, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

pilotDistribution();

