import admin from 'firebase-admin';
import config from './config.js';

// Инициализация Firebase
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: config.firebase.projectId,
    clientEmail: config.firebase.clientEmail,
    privateKey: config.firebase.privateKey
  })
});

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

export const DB = {
  // === USERS ===
  async getUser(telegramId) {
    const userRef = db.collection('users').doc(String(telegramId));
    const doc = await userRef.get();
    
    if (!doc.exists) {
      return null;
    }
    
    return { id: telegramId, ...doc.data() };
  },

  async createUser(telegramId, username) {
    const userData = {
      telegram_id: String(telegramId),
      username: username || 'anonymous',
      language: null, // будет установлен при выборе языка
      requested_at: FieldValue.serverTimestamp(),
      invite_sent_at: null,
      invite_code_given: null,
      codes_returned: 0,
      codes_submitted: [],
      status: 'new',
      reminder_count: 0,
      last_reminder: null,
      invites_received_count: 0, // Счётчик полученных инвайтов (макс 2)
      invalid_codes_reported: [], // Коды на которые пожаловался
      is_banned: false, // Забанен за недобросовестное поведение
      ban_reason: null // Причина бана
    };

    await db.collection('users').doc(String(telegramId)).set(userData);
    return { id: telegramId, ...userData };
  },

  async updateUser(telegramId, updates) {
    await db.collection('users').doc(String(telegramId)).update(updates);
  },

  async getUsersWithStatus(status) {
    const snapshot = await db.collection('users')
      .where('status', '==', status)
      .get();
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  },

  async getAllUsers() {
    const snapshot = await db.collection('users').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  // === QUEUE ===
  async addToQueue(telegramId) {
    const queueSnapshot = await db.collection('queue')
      .orderBy('position', 'desc')
      .limit(1)
      .get();
    
    const maxPosition = queueSnapshot.empty ? 0 : queueSnapshot.docs[0].data().position;
    const newPosition = maxPosition + 1;

    const joinedAt = new Date();
    
    await db.collection('queue').doc(String(telegramId)).set({
      telegram_id: String(telegramId),
      position: newPosition,
      joined_at: FieldValue.serverTimestamp()
    });

    await this.updateUser(telegramId, {
      status: 'waiting',
      requested_at: FieldValue.serverTimestamp(),
      joined_queue_at: joinedAt  // Сохраняем для расчёта времени ожидания
    });

    return newPosition;
  },

  async getQueuePosition(telegramId) {
    const doc = await db.collection('queue').doc(String(telegramId)).get();
    
    if (!doc.exists) {
      return null;
    }
    
    return doc.data().position;
  },

  // Получить среднее время ожидания (в часах) на основе последних получивших инвайты
  async getAverageWaitTimeHours() {
    try {
      const allUsers = await this.getAllUsers();
      
      // Берём только тех, кто получил инвайт в последние 72 часа
      const recentUsers = allUsers.filter(u => {
        if (!u.invite_sent_at) return false;
        
        // Нужен либо joined_queue_at либо requested_at
        if (!u.joined_queue_at && !u.requested_at) return false;
        
        const inviteTime = u.invite_sent_at?.toDate?.() || new Date(u.invite_sent_at);
        const now = new Date();
        const hoursSinceInvite = (now - inviteTime) / (1000 * 60 * 60);
        
        return hoursSinceInvite <= 72; // Последние 3 дня
      });
      
      if (recentUsers.length === 0) {
        return null; // Нет данных
      }
      
      // Считаем время ожидания для каждого
      const waitTimes = recentUsers.map(u => {
        // Используем joined_queue_at если есть, иначе requested_at (для старых пользователей)
        const joinedAt = u.joined_queue_at 
          ? (u.joined_queue_at?.toDate?.() || new Date(u.joined_queue_at))
          : (u.requested_at?.toDate?.() || new Date(u.requested_at));
        
        const sentAt = u.invite_sent_at?.toDate?.() || new Date(u.invite_sent_at);
        const waitHours = (sentAt - joinedAt) / (1000 * 60 * 60);
        return waitHours > 0 ? waitHours : 0;
      });
      
      // Среднее время
      const avgWaitHours = waitTimes.reduce((sum, t) => sum + t, 0) / waitTimes.length;
      
      return avgWaitHours;
    } catch (error) {
      console.error('Error calculating average wait time:', error);
      return null;
    }
  },

  async getQueueSize() {
    const snapshot = await db.collection('queue').get();
    return snapshot.size;
  },

  async getNextInQueue() {
    const snapshot = await db.collection('queue')
      .orderBy('position', 'asc')
      .limit(1)
      .get();
    
    if (snapshot.empty) {
      return null;
    }
    
    const doc = snapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data()
    };
  },

  async removeFromQueue(telegramId) {
    await db.collection('queue').doc(String(telegramId)).delete();
    await this.recalculateQueuePositions();
  },

  async recalculateQueuePositions() {
    const snapshot = await db.collection('queue')
      .orderBy('joined_at', 'asc')
      .get();
    
    const batch = db.batch();
    snapshot.docs.forEach((doc, index) => {
      batch.update(doc.ref, { position: index + 1 });
    });
    
    await batch.commit();
  },

  // === INVITE POOL ===
  async addCodesToPool(codes, submittedBy) {
    // Простое добавление для донейшенов (без лимитов)
    const batch = db.batch();
    let addedCount = 0;
    
    for (const code of codes) {
      const codeRef = db.collection('invite_pool').doc();
      batch.set(codeRef, {
        code: code,
        submitted_by: String(submittedBy),
        status: 'available',
        sent_to: null,
        usage_limit: 1, // По умолчанию 1 использование
        created_at: FieldValue.serverTimestamp()
      });
      addedCount++;
    }
    
    await batch.commit();
    
    // Обновить счетчик в настройках
    await this.updateSystemSettings({
      codes_in_pool: FieldValue.increment(addedCount)
    });
    
    return addedCount;
  },

  async addCodesToPoolWithLimit(code, submittedBy, usageLimit) {
    // Проверяем сколько ВСЕГО был использован (available + sent)
    const allUsages = await db.collection('invite_pool')
      .where('code', '==', code)
      .get();
    
    const totalUsage = allUsages.size;
    
    console.log(`[Pool] Code ${code}: total usage ${totalUsage}, requesting ${usageLimit} more`);
    
    // Мягкий лимит: максимум из конфигурации (Sora может увеличивать лимиты)
    const MAX_CODE_USAGE = config.rules.maxCodeUsage;
    
    if (totalUsage >= MAX_CODE_USAGE) {
      console.log(`[Pool] Code ${code} reached max usage (${MAX_CODE_USAGE}/${MAX_CODE_USAGE})`);
      return 0;
    }
    
    // Сколько использований можем добавить
    const availableSlots = Math.min(usageLimit, MAX_CODE_USAGE - totalUsage);
    
    if (availableSlots === 0) {
      console.log(`[Pool] No available slots for ${code}`);
      return 0;
    }
    
    console.log(`[Pool] Adding ${availableSlots} uses of ${code} (will be ${totalUsage + availableSlots}/${MAX_CODE_USAGE} total)`);
    
    const batch = db.batch();
    
    // Добавляем код столько раз, сколько пользователь выбрал
    for (let i = 0; i < availableSlots; i++) {
      const codeRef = db.collection('invite_pool').doc();
      batch.set(codeRef, {
        code: code,
        submitted_by: String(submittedBy),
        status: 'available',
        sent_to: null,
        usage_number: totalUsage + i + 1, // Какое по счёту использование
        total_limit: usageLimit, // Сколько всего пользователь поделился
        created_at: FieldValue.serverTimestamp()
      });
    }
    
    await batch.commit();
    
    // Обновить счетчик
    await this.updateSystemSettings({
      codes_in_pool: FieldValue.increment(availableSlots)
    });
    
    return availableSlots;
  },

  async getAvailableCode() {
    const snapshot = await db.collection('invite_pool')
      .where('status', '==', 'available')
      .limit(1)
      .get();
    
    if (snapshot.empty) {
      return null;
    }
    
    const doc = snapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data()
    };
  },

  async getAvailableCodes(limit = 10) {
    const snapshot = await db.collection('invite_pool')
      .where('status', '==', 'available')
      .limit(limit)
      .get();
    
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async markCodeAsSent(codeId, sentTo) {
    await db.collection('invite_pool').doc(codeId).update({
      status: 'sent',
      sent_to: String(sentTo),
      sent_at: FieldValue.serverTimestamp()
    });

    await this.updateSystemSettings({
      codes_in_pool: FieldValue.increment(-1)
    });
  },

  async getPoolSize() {
    const snapshot = await db.collection('invite_pool')
      .where('status', '==', 'available')
      .get();
    
    return snapshot.size;
  },

  async getUniqueCodesCount() {
    const snapshot = await db.collection('invite_pool')
      .where('status', '==', 'available')
      .get();
    
    const uniqueCodes = new Set();
    snapshot.docs.forEach(doc => {
      uniqueCodes.add(doc.data().code);
    });
    
    return uniqueCodes.size;
  },

  async removeCodeFromPool(code) {
    const snapshot = await db.collection('invite_pool')
      .where('code', '==', code.toUpperCase())
      .where('status', '==', 'available')
      .get();
    
    if (snapshot.empty) {
      return false;
    }
    
    const doc = snapshot.docs[0];
    await doc.ref.delete();
    
    await this.updateSystemSettings({
      codes_in_pool: FieldValue.increment(-1)
    });
    
    return true;
  },

  async clearAllAvailableCodes() {
    const snapshot = await db.collection('invite_pool')
      .where('status', '==', 'available')
      .get();
    
    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    
    await this.updateSystemSettings({
      codes_in_pool: 0
    });
    
    return snapshot.size;
  },

  async clearQueue() {
    const snapshot = await db.collection('queue').get();
    
    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    
    return snapshot.size;
  },

  async resetAllUsers() {
    const snapshot = await db.collection('users').get();
    
    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    
    // Сбросить счётчики
    await this.updateSystemSettings({
      total_users: 0,
      first_10_count: 0
    });
    
    return snapshot.size;
  },

  // === SETTINGS ===
  async getSystemSettings() {
    const doc = await db.collection('settings').doc('system').get();
    
    if (!doc.exists) {
      // Инициализируем если не существует
      const defaultSettings = {
        total_users: 0,
        codes_in_pool: 0,
        first_10_count: 0
      };
      await db.collection('settings').doc('system').set(defaultSettings);
      return defaultSettings;
    }
    
    return doc.data();
  },

  async updateSystemSettings(updates) {
    await db.collection('settings').doc('system').set(
      updates,
      { merge: true }
    );
  },

  async incrementFirst10Count() {
    const settingsRef = db.collection('settings').doc('system');
    
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(settingsRef);
      const currentCount = doc.exists ? (doc.data().first_10_count || 0) : 0;
      const newCount = currentCount + 1;
      
      transaction.set(settingsRef, {
        first_10_count: newCount
      }, { merge: true });
    });

    const settings = await this.getSystemSettings();
    return settings.first_10_count;
  },

  async incrementTotalUsers() {
    await this.updateSystemSettings({
      total_users: FieldValue.increment(1)
    });
  },

  // === DISTRIBUTED LOCK ===
  async acquireLock(lockName, ttlSeconds = 60) {
    const lockRef = db.collection('locks').doc(lockName);
    
    try {
      await db.runTransaction(async (transaction) => {
        const lockDoc = await transaction.get(lockRef);
        
        if (lockDoc.exists) {
          const lockData = lockDoc.data();
          const lockTime = lockData.acquired_at?.toDate?.() || new Date(lockData.acquired_at);
          const now = new Date();
          const ageSeconds = (now - lockTime) / 1000;
          
          // Лок ещё активен
          if (ageSeconds < ttlSeconds) {
            throw new Error('Lock already acquired');
          }
        }
        
        // Создаём или обновляем лок
        transaction.set(lockRef, {
          acquired_at: FieldValue.serverTimestamp(),
          ttl_seconds: ttlSeconds
        });
      });
      
      return true;
    } catch (error) {
      return false;
    }
  },

  async releaseLock(lockName) {
    try {
      await db.collection('locks').doc(lockName).delete();
    } catch (error) {
      console.error(`[Lock] Error releasing lock ${lockName}:`, error.message);
    }
  },

  // === BAN SYSTEM ===
  async banUser(telegramId, reason) {
    await this.updateUser(telegramId, {
      is_banned: true,
      ban_reason: reason,
      banned_at: FieldValue.serverTimestamp()
    });
  },

  async unbanUser(telegramId) {
    await this.updateUser(telegramId, {
      is_banned: false,
      ban_reason: null
    });
  },

  async getUserByUsername(username) {
    const cleanUsername = username.replace('@', '');
    const snapshot = await db.collection('users')
      .where('username', '==', cleanUsername)
      .limit(1)
      .get();
    
    if (snapshot.empty) {
      return null;
    }
    
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  },

  // === SORA TRANSACTIONS ===
  async createSoraTransaction(telegramId, { type, stars, mode, bundleCount, videoIds = [], fileIds = [] }) {
    const txRef = db.collection('sora_transactions').doc();
    const txData = {
      telegram_id: String(telegramId),
      type, // 'single' | 'bundle'
      mode, // 'basic4s' | 'pro4s' | 'constructor'
      stars_paid: stars,
      bundle_count: bundleCount || 1,
      videos_generated: videoIds,
      telegram_file_ids: fileIds, // Для проверки доставки
      videos_remaining: bundleCount ? bundleCount - videoIds.length : 0,
      status: 'paid',
      created_at: FieldValue.serverTimestamp(),
      telegram_charge_id: null
    };
    await txRef.set(txData);
    return { id: txRef.id, ...txData };
  },

  async getSoraTransaction(txId) {
    const doc = await db.collection('sora_transactions').doc(txId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  },

  async updateSoraTransaction(txId, updates) {
    await db.collection('sora_transactions').doc(txId).update(updates);
  },

  async getUserActiveBundles(telegramId) {
    const snapshot = await db.collection('sora_transactions')
      .where('telegram_id', '==', String(telegramId))
      .where('type', '==', 'bundle')
      .where('videos_remaining', '>', 0)
      .get();
    
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async decrementBundleRemaining(txId, videoId) {
    const txRef = db.collection('sora_transactions').doc(txId);
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(txRef);
      if (!doc.exists) throw new Error('Transaction not found');
      const data = doc.data();
      transaction.update(txRef, {
        videos_generated: [...(data.videos_generated || []), videoId],
        videos_remaining: Math.max(0, (data.videos_remaining || 0) - 1)
      });
    });
  }
};

export default DB;
