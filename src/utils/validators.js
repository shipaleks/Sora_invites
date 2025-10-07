// Стоп-слова которые не являются кодами
const STOP_WORDS = [
  'INVITE', 'CODE', 'SORA', 'JOIN', 'OPEN', 'ENTER', 'REDEEM', 
  'ONBOARDING', 'HTTPS', 'APPS', 'APPLE', 'APP'
];

export function validateInviteCode(code) {
  // Базовая валидация - код должен быть строкой РОВНО 6 символов
  if (typeof code !== 'string') return false;
  
  // Убираем пробелы
  const trimmed = code.trim().toUpperCase();
  
  // Код СТРОГО 6 символов (настоящие коды Sora всегда 6)
  if (trimmed.length !== 6) return false;
  
  // Код должен состоять ТОЛЬКО из букв и цифр (БЕЗ дефисов и спецсимволов)
  if (!/^[A-Za-z0-9]+$/.test(trimmed)) return false;
  
  // Исключаем стоп-слова
  if (STOP_WORDS.includes(trimmed)) return false;
  
  return true;
}

export function extractCodes(text) {
  const codes = [];
  
  // Паттерн 1: "Join Sora with my invite code: XXXXXX!" - СТРОГО 6 символов
  const pattern1 = /invite code:\s*([A-Za-z0-9]{6})/gi;
  let match;
  while ((match = pattern1.exec(text)) !== null) {
    const code = match[1].toUpperCase();
    if (!STOP_WORDS.includes(code)) {
      codes.push(code);
    }
  }
  
  // Паттерн 2: Просто коды в строках (6 символов - основной формат)
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Ищем 6-значные коды (только буквы и цифры)
    const codeMatch = trimmed.match(/\b([A-Za-z0-9]{6})\b/);
    if (codeMatch) {
      const code = codeMatch[1].toUpperCase();
      if (!codes.includes(code) && !STOP_WORDS.includes(code)) {
        codes.push(code);
      }
      continue;
    }
    
    // Если вся строка похожа на код (СТРОГО 6 символов, только буквы и цифры)
    if (/^[A-Za-z0-9]{6}$/.test(trimmed)) {
      const code = trimmed.toUpperCase();
      if (!codes.includes(code) && !STOP_WORDS.includes(code)) {
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
        if (!codes.includes(upperCode) && !STOP_WORDS.includes(upperCode)) {
          codes.push(upperCode);
        }
      });
    }
  }
  
  return codes;
}

export function validateSoraPrompt(prompt) {
  // Простая эвристика. Подробная модерация будет делаться через GPT фильтр.
  if (!prompt || typeof prompt !== 'string') return { ok: false, reason: 'empty' };
  const trimmed = prompt.trim();
  if (trimmed.length < 5) return { ok: false, reason: 'too_short' };
  // Базовые запреты (дублируем в LLM фильтре):
  const banned = /(child|underage|porn|violence|terror|suicide|self-harm)/i;
  if (banned.test(trimmed)) return { ok: false, reason: 'policy' };
  return { ok: true };
}

