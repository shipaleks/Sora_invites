// Стоп-слова которые не являются кодами
const STOP_WORDS = [
  'INVITE', 'CODE', 'SORA', 'JOIN', 'OPEN', 'ENTER', 'REDEEM', 
  'ONBOARDING', 'HTTPS', 'APPS', 'APPLE', 'APP'
];

export function validateInviteCode(code) {
  // Базовая валидация - код должен быть строкой длиной от 5 до 10 символов (обычно 6)
  if (typeof code !== 'string') return false;
  
  // Убираем пробелы
  const trimmed = code.trim().toUpperCase();
  
  // Код обычно 6 символов, но допускаем 5-10
  if (trimmed.length < 5 || trimmed.length > 10) return false;
  
  // Код должен состоять из букв и/или цифр (иногда дефисы)
  if (!/^[A-Za-z0-9\-]+$/.test(trimmed)) return false;
  
  // Исключаем стоп-слова
  if (STOP_WORDS.includes(trimmed)) return false;
  
  return true;
}

export function extractCodes(text) {
  const codes = [];
  
  // Паттерн 1: "Join Sora with my invite code: XXXXXX!"
  const pattern1 = /invite code:\s*([A-Za-z0-9\-]{5,10})/gi;
  let match;
  while ((match = pattern1.exec(text)) !== null) {
    codes.push(match[1].toUpperCase());
  }
  
  // Паттерн 2: Просто коды в строках (6 символов - основной формат)
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Ищем 6-значные коды
    const codeMatch = trimmed.match(/\b([A-Za-z0-9]{6})\b/);
    if (codeMatch) {
      const code = codeMatch[1].toUpperCase();
      if (!codes.includes(code)) {
        codes.push(code);
      }
      continue;
    }
    
    // Если вся строка похожа на код (5-10 символов)
    if (validateInviteCode(trimmed)) {
      const code = trimmed.toUpperCase();
      if (!codes.includes(code)) {
        codes.push(code);
      }
    }
  }
  
  // Паттерн 3: Извлекаем из текста все 6-значные последовательности букв/цифр
  if (codes.length === 0) {
    const allCodes = text.match(/\b[A-Za-z0-9]{6}\b/g);
    if (allCodes) {
      allCodes.forEach(code => {
        const upperCode = code.toUpperCase();
        if (!codes.includes(upperCode)) {
          codes.push(upperCode);
        }
      });
    }
  }
  
  return codes;
}

