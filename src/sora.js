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
  // Simplified prompt enhancement - avoid overly technical details that cause Sora API errors
  const enhancementPrompt = `You are a Sora 2 video prompt expert. Transform the user's idea into a clear, cinematic Sora 2 prompt in ENGLISH.

USER INPUT (translate scene/action to English, but PRESERVE any dialogue in original language):
"${userPrompt}"

TASK: Write a 80-150 word Sora 2 prompt in ENGLISH with:

1. STYLE (1 sentence): Visual style, film aesthetic, mood
   Example: "Cinematic documentary style, 35mm film with natural flares, warm color grade"

2. SCENE (2-3 sentences): Location, subject, atmosphere, lighting
   Example: "A cozy living room at golden hour. A playful cat dances on wooden floor near a window. Warm sunlight streams through, casting soft shadows."

3. CAMERA & ACTION (2-3 sentences): Framing, movement, what happens
   Example: "Medium shot, slow dolly-in. Camera at cat-eye level. The cat spins twice, pauses, looks at camera with a playful expression."

4. DIALOGUE (if present): Keep original language (Russian/English)
   Example: Dialogue: Character says "Привет, как дела?"

5. SOUND (1 short phrase, optional): Background audio cues
   Example: "Soft paw taps on wood, distant music"

CRITICAL SAFETY CHECK:
- REJECT if input contains: graphic violence, sexual content, children in unsafe situations, self-harm, hate speech, illegal activities
- If unsafe, return EXACTLY: "POLICY_VIOLATION"
- Otherwise proceed with enhancement

RULES:
- Keep it SIMPLE and CLEAR - avoid ultra-technical jargon
- ONE main action that fits 4-8 seconds
- Preserve dialogue in original language

OUTPUT: Just the enhanced English prompt (with preserved dialogue if any), no explanations.`;

  const body = {
    model: 'gpt-5-mini',
    messages: [
      { role: 'user', content: enhancementPrompt }
    ],
    max_completion_tokens: 2000,
    reasoning_effort: 'minimal'
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
  console.log('[Sora] GPT response:', JSON.stringify(data, null, 2));
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    console.error('[Sora] Empty content from GPT. Full response:', data);
    throw new Error('Empty enhanced prompt');
  }
  return content;
}

export async function createSoraVideo({ model, prompt, durationSeconds = 4, width, height, imageUrl }) {
  // Правильные параметры по официальной документации
  const payload = {
    model, // 'sora-2' | 'sora-2-pro'
    prompt,
    seconds: String(durationSeconds), // string: "4", "8", or "12"
    size: width && height ? `${width}x${height}` : '1280x720' // string: "widthxheight"
  };

  console.log('[Sora] Creating video with payload:', JSON.stringify(payload, null, 2));

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
    console.error('[Sora] Create failed:', resp.status, text);
    throw new Error(`Sora create failed: ${resp.status} ${text}`);
  }

  const data = await resp.json();
  console.log('[Sora] Create response:', JSON.stringify(data, null, 2));
  return data; // expect { id, status, ... }
}

export async function pollSoraVideo(jobId) {
  const start = Date.now();
  let pollCount = 0;
  while (Date.now() - start < config.sora.pollTimeoutMs) {
    pollCount++;
    console.log(`[Sora] Polling job ${jobId}, attempt ${pollCount}, elapsed ${Math.round((Date.now() - start) / 1000)}s`);
    const resp = await fetch(`${OPENAI_BASE}/videos/${jobId}`, {
      headers: {
        'Authorization': `Bearer ${config.sora.openaiApiKey}`
      }
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.error('[Sora] Poll failed:', resp.status, text);
      throw new Error(`Sora poll failed: ${resp.status} ${text}`);
    }
    const data = await resp.json();
    console.log(`[Sora] Poll response (attempt ${pollCount}):`, JSON.stringify(data, null, 2));
    if (data.status === 'completed') return data;
    if (data.status === 'failed' || data.status === 'rejected' || data.status === 'canceled') {
      throw new Error(`Sora failed: ${data.status}`);
    }
    await new Promise(r => setTimeout(r, config.sora.pollIntervalMs));
  }
  console.error(`[Sora] Poll timeout after ${pollCount} attempts, ${Math.round((Date.now() - start) / 1000)}s`);
  throw new Error('Sora poll timeout');
}

// Telegram Stars payment implementation
export const Stars = {
  async sendInvoice(ctx, { title, description, payload, stars }) {
    // Отправляем invoice с валютой XTR (Telegram Stars)
    await ctx.replyWithInvoice({
      title,
      description,
      payload, // JSON string with transaction details
      currency: 'XTR',
      prices: [{ label: title, amount: stars }]
    });
    return { ok: true };
  },

  async refund(ctx, telegramChargeId, stars, reason) {
    // Telegram Stars refund через Bot API
    try {
      await ctx.telegram.refundStarPayment(ctx.from.id, telegramChargeId);
      console.log(`[Stars] Refunded ${stars}⭐ to user ${ctx.from.id}, charge: ${telegramChargeId}`);
      return { ok: true };
    } catch (error) {
      console.error('[Stars] Refund failed:', error.message);
      return { ok: false, error: error.message };
    }
  }
};
