import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Загружаем credentials
const serviceAccount = JSON.parse(
  readFileSync('./sora-invite-bot-firebase-adminsdk-fbsvc-cb61b27933.json', 'utf8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function analyze() {
  console.log('🔍 Анализирую базу данных...\n');
  
  try {
    // 1. INVITE POOL
    console.log('📦 INVITE POOL:');
    const poolSnap = await db.collection('invite_pool').get();
    console.log(`   Всего записей: ${poolSnap.size}`);
    
    const poolData = {
      available: 0,
      sent: 0,
      uniqueCodes: new Set(),
      withComplaints: new Set(),
      bySubmitter: {}
    };
    
    poolSnap.forEach(doc => {
      const data = doc.data();
      poolData.uniqueCodes.add(data.code);
      
      if (data.status === 'available') poolData.available++;
      if (data.status === 'sent') poolData.sent++;
      
      const submitter = data.submitted_by || 'unknown';
      poolData.bySubmitter[submitter] = (poolData.bySubmitter[submitter] || 0) + 1;
    });
    
    console.log(`   Available: ${poolData.available}`);
    console.log(`   Sent: ${poolData.sent}`);
    console.log(`   Уникальных кодов: ${poolData.uniqueCodes.size}`);
    console.log(`   Топ-5 contributors:`);
    const topContributors = Object.entries(poolData.bySubmitter)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    topContributors.forEach(([sub, count]) => {
      console.log(`      ${sub}: ${count}`);
    });
    
    // 2. QUEUE
    console.log('\n👥 ОЧЕРЕДЬ:');
    const queueSnap = await db.collection('queue').get();
    console.log(`   Человек в очереди: ${queueSnap.size}`);
    
    if (queueSnap.size > 0) {
      const positions = [];
      queueSnap.forEach(doc => positions.push(doc.data().position));
      console.log(`   Позиции: от ${Math.min(...positions)} до ${Math.max(...positions)}`);
    }
    
    // 3. USERS
    console.log('\n👤 ПОЛЬЗОВАТЕЛИ:');
    const usersSnap = await db.collection('users').get();
    console.log(`   Всего: ${usersSnap.size}`);
    
    const userData = {
      byStatus: {},
      withInvites: 0,
      withComplaints: 0,
      banned: 0,
      totalComplaints: 0,
      codesReturned: { 0: 0, 1: 0 },
      usageShared: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 },
      allComplainedCodes: new Set()
    };
    
    usersSnap.forEach(doc => {
      const data = doc.data();
      
      // Статусы
      const status = data.status || 'unknown';
      userData.byStatus[status] = (userData.byStatus[status] || 0) + 1;
      
      // Инвайты
      if (data.invite_code_given) userData.withInvites++;
      
      // Жалобы
      if (data.invalid_codes_reported && data.invalid_codes_reported.length > 0) {
        userData.withComplaints++;
        userData.totalComplaints += data.invalid_codes_reported.length;
        data.invalid_codes_reported.forEach(code => userData.allComplainedCodes.add(code));
      }
      
      // Баны
      if (data.is_banned) userData.banned++;
      
      // Возвраты
      const returned = data.codes_returned || 0;
      userData.codesReturned[returned] = (userData.codesReturned[returned] || 0) + 1;
      
      // Usage shared
      const shared = data.usage_count_shared || 0;
      userData.usageShared[shared] = (userData.usageShared[shared] || 0) + 1;
    });
    
    console.log(`   По статусам:`);
    Object.entries(userData.byStatus).forEach(([status, count]) => {
      console.log(`      ${status}: ${count}`);
    });
    console.log(`   Получили инвайт: ${userData.withInvites}`);
    console.log(`   Жаловались на коды: ${userData.withComplaints} (всего жалоб: ${userData.totalComplaints})`);
    console.log(`   Уникальных кодов с жалобами: ${userData.allComplainedCodes.size}`);
    console.log(`   Забанено: ${userData.banned}`);
    console.log(`   Возвращено кодов (0/1): ${userData.codesReturned[0]}/${userData.codesReturned[1]}`);
    console.log(`   Поделились использованиями:`);
    Object.entries(userData.usageShared).forEach(([count, users]) => {
      if (parseInt(count) > 0) console.log(`      ${count} использований: ${users} чел`);
    });
    
    // 4. РАСЧЁТ ПОТЕНЦИАЛА
    console.log('\n💡 ПОТЕНЦИАЛ ДЛЯ БОЛЬШОЙ РАЗДАЧИ:');
    
    // Коды БЕЗ жалоб
    const cleanCodes = Array.from(poolData.uniqueCodes).filter(
      code => !userData.allComplainedCodes.has(code)
    );
    console.log(`   Чистых кодов (без жалоб): ${cleanCodes.length}`);
    console.log(`   Потенциально доступно: ${cleanCodes.length} × 4 = ${cleanCodes.length * 4} использований`);
    
    // Сколько людей в очереди
    console.log(`   Людей в очереди: ${queueSnap.size}`);
    
    // Сценарий: по 2 инвайта каждому
    const needed = queueSnap.size * 2;
    const available = cleanCodes.length * 4;
    console.log(`   Для раздачи по 2: нужно ${needed}, есть ${available}`);
    
    if (available >= needed) {
      console.log(`   ✅ ДОСТАТОЧНО! Останется: ${available - needed}`);
    } else {
      console.log(`   ❌ НЕ ХВАТИТ. Дефицит: ${needed - available}`);
      const canGive = Math.floor(available / queueSnap.size);
      console.log(`   Можем дать по ${canGive} инвайта каждому`);
    }
    
    // 5. ТОП-10 КОДОВ С ЖАЛОБАМИ
    if (userData.allComplainedCodes.size > 0) {
      console.log('\n🚫 КОДЫ С ЖАЛОБАМИ:');
      const complaintCounts = {};
      usersSnap.forEach(doc => {
        const data = doc.data();
        if (data.invalid_codes_reported) {
          data.invalid_codes_reported.forEach(code => {
            complaintCounts[code] = (complaintCounts[code] || 0) + 1;
          });
        }
      });
      
      const topComplaints = Object.entries(complaintCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      
      topComplaints.forEach(([code, count]) => {
        console.log(`   ${code}: ${count} жалоб`);
      });
    }
    
    // 6. SETTINGS
    console.log('\n⚙️ SETTINGS:');
    const settingsSnap = await db.collection('settings').doc('system').get();
    if (settingsSnap.exists) {
      console.log('   ', settingsSnap.data());
    } else {
      console.log('   Не найдено');
    }
    
    console.log('\n✅ Анализ завершён!');
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    process.exit(0);
  }
}

analyze();

