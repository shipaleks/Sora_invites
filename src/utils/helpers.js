export function pluralize(n, one, few, many, language = 'ru') {
  if (language === 'en') {
    // Для английского простая логика: 1 = singular, остальное = plural
    return n === 1 ? one : (many || few);
  }
  
  // Для русского
  if (n % 10 === 1 && n % 100 !== 11) return one;
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return few;
  return many;
}

export function formatTimestamp(timestamp) {
  if (!timestamp) return 'N/A';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleString('ru-RU');
}

export function getHoursSince(timestamp) {
  if (!timestamp) return 0;
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  return (now - date) / (1000 * 60 * 60);
}
