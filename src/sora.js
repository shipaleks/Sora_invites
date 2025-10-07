import config from './config.js';
import { roundUpTo, roundStarsUp } from './utils/helpers.js';

// NOTE: We avoid installing external deps; use fetch available in Node 18+

const OPENAI_BASE = 'https://api.openai.com/v1';

export const SoraPricing = {
  calcConstructorStars(seconds, quality /* 'lite'|'proMax' */) {
    const roundedSeconds = roundUpTo(config.pricing.constructor.roundToSeconds, seconds);
    const rate = quality === 'proMax' ? config.pricing.constructor.baseRatePerSecond.proMax : config.pricing.constructor.baseRatePerSecond.lite;
    const raw = roundedSeconds * rate;
    return roundStarsUp(raw, config.pricing.constructor.roundStarsTo);
  }
};

export class SoraQueue {
  constructor(concurrency) {
    this.concurrency = concurrency;
    this.active = 0;
    this.queue = [];
  }

  enqueue(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this._dequeue();
    });
  }

  async _dequeue() {
    if (this.active >= this.concurrency) return;
    const next = this.queue.shift();
    if (!next) return;
    this.active++;
    try {
      const res = await next.task();
      next.resolve(res);
    } catch (e) {
      next.reject(e);
    } finally {
      this.active--;
      this._dequeue();
    }
  }
}

export const soraQueue = new SoraQueue(config.sora.concurrency);

export async function enhancePromptWithCookbook(userPrompt, language = 'ru') {
  // Keep Russian; apply cookbook structure; filter policy via the same step
  const system = `Ты помощник по улучшению промптов для генерации видео в Sora 2. 
- Придерживайся языка пользователя (обычно русский).
- Оформи промпт по "кукбуку": сцена, стиль, освещение, движение камеры, длительность (если указана), ориентация.
- Не добавляй NSFW, насилие, детский контент, разжигание ненависти.
- Верни только улучшенный промпт без пояснений.`;
  const body = {
    model: 'gpt-5-mini',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.7,
    max_completion_tokens: 400
  };

  const resp = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.sora.openaiApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Prompt enhance failed: ${resp.status} ${text}`);
  }
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('Empty enhanced prompt');
  return content;
}

export async function createSoraVideo({ model, prompt, durationSeconds = 4, width, height, imageUrl }) {
  const payload = {
    model, // 'sora-2' | 'sora-2-pro'
    prompt,
    duration: durationSeconds,
    resolution: width && height ? { width, height } : undefined,
    image_reference_url: imageUrl || undefined
  };

  const resp = await fetch(`${OPENAI_BASE}/videos`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.sora.openaiApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(config.sora.createTimeoutMs)
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Sora create failed: ${resp.status} ${text}`);
  }

  const data = await resp.json();
  return data; // expect { id, status, ... }
}

export async function pollSoraVideo(jobId) {
  const start = Date.now();
  while (Date.now() - start < config.sora.pollTimeoutMs) {
    const resp = await fetch(`${OPENAI_BASE}/videos/${jobId}`, {
      headers: {
        'Authorization': `Bearer ${config.sora.openaiApiKey}`
      }
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Sora poll failed: ${resp.status} ${text}`);
    }
    const data = await resp.json();
    if (data.status === 'succeeded') return data;
    if (data.status === 'failed' || data.status === 'rejected') throw new Error(`Sora failed: ${data.status}`);
    await new Promise(r => setTimeout(r, config.sora.pollIntervalMs));
  }
  throw new Error('Sora poll timeout');
}

// Telegram Stars helpers (stubs). Real Stars flow uses Bot API invoices in XTR.
export const Stars = {
  async charge(ctx, stars, description) {
    // For admin test we simulate success. Real impl will send invoice and await payment.
    return { ok: true, stars };
  },
  async refund(ctx, stars, reason) {
    // No official refund API for Stars; emulate via manual compensation messaging/log.
    return { ok: true };
  }
};
