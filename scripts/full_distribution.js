import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { Telegraf } from 'telegraf';
import readline from 'readline';

// Загружаем credentials
const serviceAccount = JSON.parse(
  readFileSync('./sora-invite-bot-firebase-adminsdk-fbsvc-cb61b27933.json', 'utf8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const BOT_TOKEN = process.argv[2];
if (!BOT_TOKEN) {
  console.error('❌ Использование: node full_distribution.js BOT_TOKEN');
  process.exit(1);
}
const bot = new Telegraf(BOT_TOKEN);

const CODES_PER_USER = 3;
const RATE_LIMIT_MS = 40; // 25 msg/sec

async function fullDistribution() {
  console.log('🚀 ПОЛНАЯ РАЗДАЧА ВСЕМ ОСТАВШИМСЯ\n');
  
  try {
    // 1. Собираем ВСЕ уникальные коды
    console.log('📦 Собираю все коды...');
    const poolSnap = await db.collection('invite_pool').get();
    const allCodes = new Set();
    poolSnap.forEach(doc => allCodes.add(doc.data().code));
    console.log(`   Всего уникальных кодов: ${allCodes.size}`);
    console.log(`   Максимум использований: ${allCodes.size * 4}\n`);
    
    // 2. Вся очередь
    console.log('👥 Получаю всю очередь...');
    const queueSnap = await db.collection('queue')
      .orderBy('position', 'asc')
      .get();
    
    const queueUsers = [];
    queueSnap.forEach(doc => queueUsers.push(doc.data()));
    console.log(`   В очереди: ${queueUsers.length} человек\n`);
    
    // 3. Расчёт раздачи
    const totalCodes = allCodes.size * 4;
    const canDistribute = Math.floor(totalCodes / CODES_PER_USER);
    const willDistribute = Math.min(canDistribute, queueUsers.length);
    
    console.log('📊 ПЛАН:');
    console.log(`   Можем раздать: ${canDistribute} человек (по ${CODES_PER_USER} кода)`);
    console.log(`   Раздадим: ${willDistribute} человек`);
    console.log(`   Использовано кодов: ${willDistribute * CODES_PER_USER}`);
    console.log(`   Останется в очереди: ${queueUsers.length - willDistribute}`);
    console.log(`   Примерное время: ${Math.round(willDistribute * RATE_LIMIT_MS / 1000 / 60)} минут\n`);
    
    const confirm = await question('🚨 НАЧАТЬ ПОЛНУЮ РАЗДАЧУ? (yes/no): ');
    if (confirm.toLowerCase() !== 'yes') {
      console.log('Отменено');
      process.exit(0);
    }
    
    // 4. Распределение кодов
    console.log('\n📊 Распределяю коды...');
    const codesArray = Array.from(allCodes);
    const distribution = [];
    let codeIdx = 0;
    
    for (let i = 0; i < willDistribute; i++) {
      const userCodes = [];
      for (let j = 0; j < CODES_PER_USER; j++) {
        userCodes.push(codesArray[codeIdx % codesArray.length]);
        codeIdx++;
      }
      distribution.push({
        telegram_id: queueUsers[i].telegram_id,
        codes: userCodes
      });
    }
    
    console.log(`   Готово: ${distribution.length} пользователей\n`);
    
    // 5. РАЗДАЧА
    console.log('🚀 НАЧИНАЮ РАЗДАЧУ...\n');
    let sent = 0;
    let blocked = 0;
    let errors = 0;
    
    for (const item of distribution) {
      try {
        // Получаем пользователя для языка
        const userDoc = await db.collection('users').doc(item.telegram_id).get();
        if (!userDoc.exists) {
          errors++;
          continue;
        }
        
        const userData = userDoc.data();
        const lang = userData.language || 'ru';
        
        // Формируем сообщение
        const codesList = item.codes.map((c, i) => `${i + 1}️⃣ \`${c}\``).join('\n');
        const message = lang === 'en'
          ? `🎉 **Your Sora invite codes:**\n\n${codesList}\n\n**What to do:**\n1. Try codes one by one on sora.com (need US VPN 🇺🇸)\n2. One will work — mark it with ✅\n3. After registration, come back and send your Sora code\n\n⚠️ **Video generation access is locked until you mark results.**\n\nMark result for each code:`
          : `🎉 **Твои инвайт-коды для Sora:**\n\n${codesList}\n\n**Что делать:**\n1. Попробуй коды по очереди на sora.com (нужен VPN 🇺🇸)\n2. Один сработает — отметь его кнопкой ✅\n3. После регистрации вернись и отправь свой код из Sora\n\n⚠️ **Пока не отметишь результат — доступ к генерации видео закрыт.**\n\nОтметь результат для каждого кода:`;
        
        // Кнопки
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
        
        if (sent % 100 === 0) {
          console.log(`✅ Отправлено: ${sent}/${willDistribute} (blocked: ${blocked}, errors: ${errors})`);
        }
        
        await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
        
      } catch (error) {
        if (error.response?.error_code === 403) {
          blocked++;
          // Всё равно помечаем в БД (но не удаляем из очереди)
          try {
            const invites = item.codes.map(code => ({
              code,
              sent_at: new Date(),
              status: 'pending'
            }));
            await db.collection('users').doc(item.telegram_id).update({
              invites_pending: invites,
              migration_batch: true,
              access_locked: true
            });
          } catch {}
        } else {
          errors++;
          console.error(`❌ ${item.telegram_id}:`, error.message);
        }
      }
    }
    
    // 6. Пересчёт очереди (только тех кто остался)
    console.log('\n🔄 Пересчитываю очередь...');
    const remainingSnap = await db.collection('queue')
      .orderBy('joined_at', 'asc')
      .get();
    
    if (!remainingSnap.empty) {
      const batch = db.batch();
      let count = 0;
      remainingSnap.forEach((doc, idx) => {
        batch.update(doc.ref, { position: idx + 1 });
        count++;
        if (count >= 400) {
          batch.commit().catch(() => {});
          count = 0;
        }
      });
      if (count > 0) {
        try {
          await batch.commit();
        } catch (e) {
          console.warn('Ошибка пересчёта (не критично):', e.message);
        }
      }
    }
    
    console.log('\n✅ ПОЛНАЯ РАЗДАЧА ЗАВЕРШЕНА!');
    console.log(`   Успешно отправлено: ${sent}`);
    console.log(`   Blocked (403): ${blocked}`);
    console.log(`   Другие ошибки: ${errors}`);
    console.log(`   Осталось в очереди: ${remainingSnap.size}\n`);
    
    console.log('📊 ИТОГО:');
    console.log(`   Раздано кодов: ${sent * CODES_PER_USER}`);
    console.log(`   Человек получили: ${sent}`);
    console.log(`   Ожидаем возвратов: ~${Math.round(sent * 0.3)} (30%)\n`);
    
    console.log('🔍 Мониторинг:');
    console.log('   node scripts/pilot_monitor.js\n');
    
  } catch (error) {
    console.error('❌ КРИТИЧЕСКАЯ ОШИБКА:', error);
  } finally {
    process.exit(0);
  }
}

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

fullDistribution();

