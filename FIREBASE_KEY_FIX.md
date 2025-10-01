# Исправление ошибки Firebase Private Key

## Проблема

Ошибка: `error:1E08010C:DECODER routines::unsupported`

Это означает, что `FIREBASE_PRIVATE_KEY` неправильно передан в Koyeb.

## ✅ Правильное решение

### Вариант 1: Передать ключ БЕЗ внешних кавычек

В Koyeb Environment Variables для `FIREBASE_PRIVATE_KEY` вставь **ТОЧНО** так (без внешних кавычек):

```
-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDkaDxq4fOTTnDk
4lM8xH/qla8Byq74XNIZfXxlCaGH2a6vXr+7dRpYb7JKVqEYlBag8wjiOFvskkBR
S98Xt9VxG3Qox7GVSIVwj2y4y83Kc06q5voEGIQXVWpQvawHGkvhIk1k/ejwyNux
3uLEa5DsTVjkMSiriTgNlwKk663adJcwTS8pONxWpYHa7Y5tXZcSFaeIK5JbyoE7
e+4cLAbOOSUWe700QUTJl32/EuxplBq+o8yOLrb2sYq4hp+qH10oSujIIarPJSKq
UF6/zWNKVme51SMg2D2z1oHgqd4gNlP40F8gI/HwQOtIaon7OSJHPfPtp1xyyyvU
v5VvVkDBAgMBAAECggEAGmRsBMqul0kjVONNDHLFOCFLK1kU/jhVg6IDH3atLlIq
M/PuEjZeELV5Y8seSsWD1t22W1N5VbzxhyNN+ELi/DKYqcSnYbFTT/YWsUTFdvz7
bFaLsbD2hG63ffRovhpdBbrtt/t58Oa4shUn3Vvzj0aBvL5sbWPJ8RIPuWhNOrZx
tW8+ojjfIHX2eWim0iw47nF+1CcRVZwPzAJrvkEzLlv4tNQobeHLu9RqxE2bV+8t
5PeHxn5Q5/O1nP6CpyyCb8+PRqVVsBb7yPGC9zB5yW6e6VHu3d1dF0sXJJfCvRPH
S/qAmcWnkYsWjy36dCq/x0i/BWSitz1HHKwHRvQ05QKBgQD+C8uMdoWuzhd5Wtu/
fh6XkYpE166E/uyFb2hSpW51YZnYMyG5+kT6IgINs0XfecZ1PwRKQD03QGLdT9vl
C9Zuaz3eppjZoZkjJ2T5xAnIVrWTlBa5ZhjpANiIHTDimrc9pXAVq8ZduUNEVcY6
HEc7XpqvDzTEvEkdKYxyMlWnTQKBgQDmKfWG05v7536LR+fzD8PzhV09iEFNMsQX
f5FLtf4LrfraBiaCgKgWPC3HTq5KhTbLqxlyBr79D+Ecny6zSw8UTWidkyi/amy0
+zs+9mQY6e3gZTxSzKGREgNT1yI6AgBQDFc/8AAPyKla17+Ue4ZX60ySugAFunr6
5xkkm6ZNRQKBgQDy293Dss5LdNN1/MjUQEIIjWaMN0+r7nO3f/BQCbwV1K8YwpC8
VKc6I+aoqDfk0mpJTWvRe6XJuvCINz60sONV/YlQ3xyB+H0H4TIjnyfm8BV3Nnue
0x5/KILXZGiGSHdiJFSJMwRYNrI6knEEvmHOPLtNHRFJ/eE7Uqvjw4CkhQKBgDBH
buQoMRkG9wlaPPJERVMoj2Vf1mrOEknnjV+3PiHPDcZ78coAGMIJP4UGIRMqnFLe
ggjkF13X3d12GoKrZO9aSW58NtjoBwNzi3rqjhaXwzkFo0CvAdj/UUld4CUQ1GX2
ILsdqbWl3rhadyo7OvPoPHiuoWCSPEezABgouhqNAoGABWtJnjUw0OmWDO4+I42U
+Y7YNeDSw0lC2EAtQFq2j2T9c+Fv54PlE4pTUgITjdIYtQTCp0xVzrjlmhMEOqUO
xaBmDY9fEmESKtGwYY7MoangLdKNpp6sh9ejI4w5pF/uovvE/BDVpiUTHTitQMzs
oCjbL8jX18e94fk+ZzhRMyU=
-----END PRIVATE KEY-----
```

**ВАЖНО:**
- Скопируй с РЕАЛЬНЫМИ переносами строк (не `\n`)
- БЕЗ кавычек в начале и конце
- Прямо многострочный текст

### Вариант 2: Если Koyeb не поддерживает многострочные значения

Тогда нужно передать с `\n` **В КАВЫЧКАХ**:

```
"-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDkaDxq4fOTTnDk\n4lM8xH/qla8Byq74XNIZfXxlCaGH2a6vXr+7dRpYb7JKVqEYlBag8wjiOFvskkBR\nS98Xt9VxG3Qox7GVSIVwj2y4y83Kc06q5voEGIQXVWpQvawHGkvhIk1k/ejwyNux\n3uLEa5DsTVjkMSiriTgNlwKk663adJcwTS8pONxWpYHa7Y5tXZcSFaeIK5JbyoE7\ne+4cLAbOOSUWe700QUTJl32/EuxplBq+o8yOLrb2sYq4hp+qH10oSujIIarPJSKq\nUF6/zWNKVme51SMg2D2z1oHgqd4gNlP40F8gI/HwQOtIaon7OSJHPfPtp1xyyyvU\nv5VvVkDBAgMBAAECggEAGmRsBMqul0kjVONNDHLFOCFLK1kU/jhVg6IDH3atLlIq\nM/PuEjZeELV5Y8seSsWD1t22W1N5VbzxhyNN+ELi/DKYqcSnYbFTT/YWsUTFdvz7\nbFaLsbD2hG63ffRovhpdBbrtt/t58Oa4shUn3Vvzj0aBvL5sbWPJ8RIPuWhNOrZx\ntW8+ojjfIHX2eWim0iw47nF+1CcRVZwPzAJrvkEzLlv4tNQobeHLu9RqxE2bV+8t\n5PeHxn5Q5/O1nP6CpyyCb8+PRqVVsBb7yPGC9zB5yW6e6VHu3d1dF0sXJJfCvRPH\nS/qAmcWnkYsWjy36dCq/x0i/BWSitz1HHKwHRvQ05QKBgQD+C8uMdoWuzhd5Wtu/\nfh6XkYpE166E/uyFb2hSpW51YZnYMyG5+kT6IgINs0XfecZ1PwRKQD03QGLdT9vl\nC9Zuaz3eppjZoZkjJ2T5xAnIVrWTlBa5ZhjpANiIHTDimrc9pXAVq8ZduUNEVcY6\nHEc7XpqvDzTEvEkdKYxyMlWnTQKBgQDmKfWG05v7536LR+fzD8PzhV09iEFNMsQX\nf5FLtf4LrfraBiaCgKgWPC3HTq5KhTbLqxlyBr79D+Ecny6zSw8UTWidkyi/amy0\n+zs+9mQY6e3gZTxSzKGREgNT1yI6AgBQDFc/8AAPyKla17+Ue4ZX60ySugAFunr6\n5xkkm6ZNRQKBgQDy293Dss5LdNN1/MjUQEIIjWaMN0+r7nO3f/BQCbwV1K8YwpC8\nVKc6I+aoqDfk0mpJTWvRe6XJuvCINz60sONV/YlQ3xyB+H0H4TIjnyfm8BV3Nnue\n0x5/KILXZGiGSHdiJFSJMwRYNrI6knEEvmHOPLtNHRFJ/eE7Uqvjw4CkhQKBgDBH\nbuQoMRkG9wlaPPJERVMoj2Vf1mrOEknnjV+3PiHPDcZ78coAGMIJP4UGIRMqnFLe\nggjkF13X3d12GoKrZO9aSW58NtjoBwNzi3rqjhaXwzkFo0CvAdj/UUld4CUQ1GX2\nILsdqbWl3rhadyo7OvPoPHiuoWCSPEezABgouhqNAoGABWtJnjUw0OmWDO4+I42U\n+Y7YNeDSw0lC2EAtQFq2j2T9c+Fv54PlE4pTUgITjdIYtQTCp0xVzrjlmhMEOqUO\nxaBmDY9fEmESKtGwYY7MoangLdKNpp6sh9ejI4w5pF/uovvE/BDVpiUTHTitQMzs\noCjbL8jX18e94fk+ZzhRMyU=\n-----END PRIVATE KEY-----\n"
```

## 📝 Шаги для исправления

### 1. Обновить WEBHOOK_DOMAIN

Установи:
```
WEBHOOK_DOMAIN=worldwide-anastassia-grounded-180d96d0.koyeb.app
```

(БЕЗ слэша в конце!)

### 2. Обновить FIREBASE_PRIVATE_KEY

Удали текущее значение и добавь заново используя **Вариант 1** (многострочный) или **Вариант 2** (с `\n` в кавычках).

**Попробуй сначала Вариант 1!**

### 3. Сохранить и перезапустить

После обновления переменных:
- Сохрани изменения
- Перезапусти приложение в Koyeb

### 4. Проверить логи

Если всё правильно, логи должны показывать успешное подключение к Firebase без ошибок `DECODER routines::unsupported`.

---

## Альтернативный метод: использовать Base64

Если ничего не помогает, можно закодировать ключ в Base64 и декодировать в коде.

1. Закодируй ключ:
```bash
echo "-----BEGIN PRIVATE KEY-----
...весь ключ...
-----END PRIVATE KEY-----" | base64
```

2. Передай Base64 строку в переменную `FIREBASE_PRIVATE_KEY_BASE64`

3. Декодируй в коде (потребует изменений в `src/database.js`)

Но это усложнение - попробуй сначала простые варианты!

