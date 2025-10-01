export function validateInviteCode(code) {
  // Базовая валидация - код должен быть строкой длиной от 5 символов
  if (typeof code !== 'string') return false;
  if (code.length < 5) return false;
  if (code.length > 100) return false;
  
  return true;
}

export function extractCodes(text) {
  // Разбиваем текст на строки и фильтруем валидные коды
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => validateInviteCode(line));
}

