import DB from '../src/database.js';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function init() {
  console.log('🚀 Инициализация Sora Invite Bot\n');
  
  try {
    // Проверяем подключение к Firebase
    const settings = await DB.getSystemSettings();
    console.log('✅ Firebase подключен');
    console.log('Текущие настройки:', settings);
    
    // Спрашиваем про начальные коды
    const answer = await question('\nДобавить начальные инвайт-коды? (y/n): ');
    
    if (answer.toLowerCase() === 'y') {
      const codesInput = await question('Введи коды через пробел: ');
      const codes = codesInput.split(/\s+/).filter(c => c.length >= 5);
      
      if (codes.length > 0) {
        await DB.addCodesToPool(codes, 'system');
        console.log(`✅ Добавлено ${codes.length} кодов в пул`);
      } else {
        console.log('❌ Не найдено валидных кодов');
      }
    }
    
    // Показываем финальную статистику
    const finalSettings = await DB.getSystemSettings();
    const poolSize = await DB.getPoolSize();
    
    console.log('\n📊 Финальная статистика:');
    console.log(`- Всего пользователей: ${finalSettings.total_users || 0}`);
    console.log(`- Кодов в пуле: ${poolSize}`);
    console.log(`- Первых 10: ${finalSettings.first_10_count || 0}`);
    
    console.log('\n✅ Инициализация завершена!');
    console.log('Теперь можно запускать бота: npm start\n');
    
  } catch (error) {
    console.error('❌ Ошибка инициализации:', error);
  } finally {
    rl.close();
    process.exit(0);
  }
}

init();

