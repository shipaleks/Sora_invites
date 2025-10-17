import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(
  readFileSync('./sora-invite-bot-firebase-adminsdk-fbsvc-cb61b27933.json', 'utf8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function track() {
  const snap = await db.collection('users').where('migration_batch', '==', true).get();
  const queue = await db.collection('queue').get();
  
  let responded = 0;
  let used = 0;
  let returned = 0;
  let invalid = 0;
  let codesFromSora = 0;
  let unlocked = 0;
  
  snap.forEach(doc => {
    const d = doc.data();
    if (d.invites_pending?.some(inv => inv.status !== 'pending')) responded++;
    d.invites_pending?.forEach(inv => {
      if (inv.status === 'used') used++;
      if (inv.status === 'returned') returned++;
      if (inv.status === 'invalid') invalid++;
    });
    if (d.codes_returned > 0) codesFromSora++;
    if (!d.access_locked) unlocked++;
  });
  
  console.log(`📊 Раздано: ${snap.size} × 3 = ${snap.size * 3} кодов`);
  console.log(`👥 Очередь: ${queue.size}`);
  console.log(`📈 Ответили: ${responded} (${Math.round(responded/snap.size*100)}%)`);
  console.log(`   ✅ Использовал: ${used}`);
  console.log(`   ↩️ Вернул: ${returned}`);
  console.log(`   🚫 Не работает: ${invalid}`);
  console.log(`🎁 Вернули код из Sora: ${codesFromSora} (${Math.round(codesFromSora/snap.size*100)}%)`);
  console.log(`🔓 Доступ разблокирован: ${unlocked} (${Math.round(unlocked/snap.size*100)}%)`);
  
  process.exit(0);
}

track();

