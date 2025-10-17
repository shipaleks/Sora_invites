import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(
  readFileSync('./sora-invite-bot-firebase-adminsdk-fbsvc-cb61b27933.json', 'utf8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function monitorPilot() {
  console.log('📊 МОНИТОРИНГ ПИЛОТНОЙ РАЗДАЧИ\n');
  
  try {
    // Получаем всех из migration_batch
    const pilotUsers = await db.collection('users')
      .where('migration_batch', '==', true)
      .get();
    
    console.log(`👥 Участников пилота: ${pilotUsers.size}\n`);
    
    const stats = {
      total: pilotUsers.size,
      responded: 0,
      notResponded: 0,
      marked: {
        used: 0,
        returned: 0,
        invalid: 0,
        pending: 0
      },
      codesReturned: 0,
      accessUnlocked: 0,
      byResponseTime: {
        '0-1h': 0,
        '1-3h': 0,
        '3-6h': 0,
        '6-12h': 0,
        '12-24h': 0,
        '24h+': 0
      }
    };
    
    const now = new Date();
    
    pilotUsers.forEach(doc => {
      const data = doc.data();
      const invites = data.invites_pending || [];
      
      // Проверяем ответил ли хоть на один код
      const hasResponded = invites.some(inv => inv.status !== 'pending');
      if (hasResponded) {
        stats.responded++;
        
        // Время первого ответа
        const firstMark = invites.find(inv => inv.marked_at);
        if (firstMark) {
          const sentAt = invites[0]?.sent_at?.toDate?.() || new Date(invites[0]?.sent_at || now);
          const markedAt = firstMark.marked_at?.toDate?.() || new Date(firstMark.marked_at);
          const hours = (markedAt - sentAt) / (1000 * 60 * 60);
          
          if (hours < 1) stats.byResponseTime['0-1h']++;
          else if (hours < 3) stats.byResponseTime['1-3h']++;
          else if (hours < 6) stats.byResponseTime['3-6h']++;
          else if (hours < 12) stats.byResponseTime['6-12h']++;
          else if (hours < 24) stats.byResponseTime['12-24h']++;
          else stats.byResponseTime['24h+']++;
        }
      } else {
        stats.notResponded++;
      }
      
      // Статусы кодов
      invites.forEach(inv => {
        stats.marked[inv.status] = (stats.marked[inv.status] || 0) + 1;
      });
      
      // Вернул ли коды из Sora
      if (data.codes_returned > 0) {
        stats.codesReturned++;
      }
      
      // Разблокирован ли доступ
      if (!data.access_locked) {
        stats.accessUnlocked++;
      }
    });
    
    // Вывод
    console.log('📈 РЕЗУЛЬТАТЫ:');
    console.log(`   Ответили: ${stats.responded}/${stats.total} (${Math.round(stats.responded / stats.total * 100)}%)`);
    console.log(`   Не ответили: ${stats.notResponded}\n`);
    
    console.log('📊 ОТМЕТКИ КОДОВ:');
    console.log(`   ✅ Использовал: ${stats.marked.used || 0}`);
    console.log(`   ↩️ Вернул: ${stats.marked.returned || 0}`);
    console.log(`   🚫 Не работает: ${stats.marked.invalid || 0}`);
    console.log(`   ⏳ Ещё не отметил: ${stats.marked.pending || 0}\n`);
    
    console.log('🎁 ВОЗВРАТЫ:');
    console.log(`   Вернули код из Sora: ${stats.codesReturned}/${stats.total} (${Math.round(stats.codesReturned / stats.total * 100)}%)`);
    console.log(`   Доступ разблокирован: ${stats.accessUnlocked}/${stats.total} (${Math.round(stats.accessUnlocked / stats.total * 100)}%)\n`);
    
    console.log('⏱ ВРЕМЯ ОТВЕТА:');
    Object.entries(stats.byResponseTime).forEach(([range, count]) => {
      if (count > 0) {
        console.log(`   ${range}: ${count} чел (${Math.round(count / stats.responded * 100)}%)`);
      }
    });
    
    // Рекомендации
    console.log('\n💡 РЕКОМЕНДАЦИИ:');
    const responseRate = stats.responded / stats.total;
    const returnRate = stats.codesReturned / stats.total;
    
    if (responseRate > 0.6 && returnRate > 0.4) {
      console.log('   ✅ ОТЛИЧНО! Можно запускать полную раздачу.');
    } else if (responseRate > 0.4 && returnRate > 0.2) {
      console.log('   🟡 СРЕДНЕ. Подожди ещё или запусти на следующих 1000.');
    } else {
      console.log('   🔴 ПЛОХО. Система не работает, нужно менять подход.');
    }
    
    console.log(`\n   Response rate: ${Math.round(responseRate * 100)}% (цель: >60%)`);
    console.log(`   Return rate: ${Math.round(returnRate * 100)}% (цель: >40%)\n`);
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    process.exit(0);
  }
}

monitorPilot();

