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

    await db.collection('queue').doc(String(telegramId)).set({
      telegram_id: String(telegramId),
      position: newPosition,
      joined_at: FieldValue.serverTimestamp()
    });

    await this.updateUser(telegramId, {
      status: 'waiting',
      requested_at: FieldValue.serverTimestamp()
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
    // Проверяем сколько раз этот код уже в пуле (ТОЛЬКО available, не считаем sent)
    const existing = await db.collection('invite_pool')
      .where('code', '==', code)
      .where('status', '==', 'available')
      .get();
    
    const currentAvailable = existing.size;
    
    // Проверяем сколько ВСЕГО был использован (available + sent)
    const allUsages = await db.collection('invite_pool')
      .where('code', '==', code)
      .get();
    
    const totalUsage = allUsages.size;
    
    // Максимум 4 использования на код
    if (totalUsage >= 4) {
      console.log(`[Pool] Code ${code} already used ${totalUsage} times`);
      return 0;
    }
    
    // Сколько использований можем добавить
    const availableSlots = Math.min(usageLimit, 4 - totalUsage);
    
    if (availableSlots === 0) {
      return 0;
    }
    
    const batch = db.batch();
    
    // Добавляем код столько раз, сколько пользователь выбрал
    for (let i = 0; i < availableSlots; i++) {
      const codeRef = db.collection('invite_pool').doc();
      batch.set(codeRef, {
        code: code,
        submitted_by: String(submittedBy),
        status: 'available',
        sent_to: null,
        usage_number: currentUsage + i + 1, // Какое по счёту использование
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
  }
};

export default DB;
