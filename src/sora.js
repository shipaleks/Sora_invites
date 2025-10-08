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
  // Enhanced prompt creation with auto-sanitization for policy compliance
  const enhancementPrompt = `You are a Sora 2 video prompt expert. Your job: transform user's idea into a clear, cinematic Sora 2 prompt in ENGLISH while making it POLICY-COMPLIANT.

USER INPUT (can be Russian; translate to English but preserve dialogue):
"${userPrompt}"

YOUR TASK:
1. CHECK if input contains problematic content (violence, hate speech, bullying, sexual content, self-harm, illegal acts, slurs, offensive stereotypes)
2. If problematic: REWRITE to make it acceptable while keeping the core creative intent
   - Replace slurs/offensive terms with neutral descriptors
   - Remove graphic violence/bullying → suggest tension/conflict instead
   - Remove sexual content → suggest romantic/aesthetic moments
   - Remove illegal acts → suggest legal alternatives or omit
3. Write enhanced 80-150 word prompt in ENGLISH with structure:

STYLE: Visual style, film aesthetic, mood
SCENE: Location, subjects, atmosphere, lighting
CAMERA & ACTION: Framing, movement, what happens (4-8 seconds)
DIALOGUE: Keep original language if dialogue exists
SOUND: Background audio cues (optional)

SAFETY HANDLING:
- If input is IMPOSSIBLE to sanitize (extreme violence, CP, terrorism, explicit sexual content) → return "POLICY_VIOLATION|HARD"
- If input has issues you CAN fix → return "POLICY_WARNING|" + your sanitized prompt
- If input is CLEAN → just return the enhanced prompt

CRITICAL RULES FOR DIALOGUE:
- REMOVE all profanity, slurs, sexual language from dialogue completely
- If dialogue is offensive, either OMIT it or replace with "[non-verbal tension]"
- NEVER include offensive words in any part of the prompt, even as "overheard rumors"
- Sora API will reject ANY explicit language

EXAMPLES OF SANITIZATION:
- "негр" → "dark-skinned person"
- "жирная баба" → "large woman"  
- "Зеленский нюхает кокаин" → "official in green uniform, white substance on nose"
- "школьники избивают" → "tense standoff between students"
- Dialogue with profanity → REMOVE dialogue entirely or use "[tense silence]"
- Sexual content → romantic tension WITHOUT explicit references

OUTPUT FORMAT:
- If HARD violation: "POLICY_VIOLATION|HARD"
- If fixable: "POLICY_WARNING|[your enhanced prompt here]"
- If clean: "[your enhanced prompt here]"`;

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

export async function pollSoraVideo(jobId, progressCallback) {
  const start = Date.now();
  let pollCount = 0;
  let lastProgress = 0;
  let stuckAt100Since = null;
  let queuedSince = null;
  
  while (Date.now() - start < config.sora.pollTimeoutMs) {
    pollCount++;
    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(`[Sora] Polling job ${jobId}, attempt ${pollCount}, elapsed ${elapsed}s`);
    
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
    
    // Логируем только при изменении прогресса или каждые 10 попыток
    if (data.progress !== lastProgress || pollCount % 10 === 0) {
      console.log(`[Sora] Poll response (attempt ${pollCount}):`, JSON.stringify(data, null, 2));
    }
    
    // Отправляем callback для промежуточных статусов
    if (progressCallback && data.progress !== lastProgress && data.progress > 0) {
      progressCallback(data.progress, elapsed);
    }
    lastProgress = data.progress;
    
    if (data.status === 'completed') return data;
    if (data.status === 'failed' || data.status === 'rejected' || data.status === 'canceled') {
      const reason = data.error?.message || data.error?.code || data.status;
      console.error(`[Sora] Video ${data.status}:`, data.error);
      throw new Error(`Sora ${data.status}: ${reason}`);
    }
    
    // Защита от зависания в queued (OpenAI перегружен)
    if (data.status === 'queued' && data.progress === 0) {
      if (!queuedSince) {
        queuedSince = Date.now();
      } else {
        const queuedDuration = (Date.now() - queuedSince) / 1000;
        if (queuedDuration > 300) { // 5 минут в очереди без прогресса
          console.error(`[Sora] Stuck in queued for ${Math.round(queuedDuration)}s, aborting`);
          throw new Error('Video stuck in queue for 5+ minutes (OpenAI overloaded)');
        }
      }
    } else {
      queuedSince = null;
    }
    
    // Защита от зависания на 100%
    if (data.progress === 100 && data.status === 'in_progress') {
      if (!stuckAt100Since) {
        stuckAt100Since = Date.now();
        console.log('[Sora] Reached 100% but still in_progress, monitoring...');
      } else {
        const stuckDuration = (Date.now() - stuckAt100Since) / 1000;
        
        // Попытка скачать контент после 2 минут на 100%
        if (stuckDuration > 120 && stuckDuration < 125) {
          console.log('[Sora] Trying to fetch content despite in_progress status...');
          try {
            const testResp = await fetch(`${OPENAI_BASE}/videos/${jobId}/content`, {
              headers: { 'Authorization': `Bearer ${config.sora.openaiApiKey}` }
            });
            if (testResp.ok) {
              console.log('[Sora] Content available! Returning as completed.');
              return { ...data, status: 'completed' };
            }
          } catch (e) {
            console.log('[Sora] Content not ready yet, continuing poll...');
          }
        }
        
        if (stuckDuration > 600) { // 10 минут на 100%
          console.error(`[Sora] Stuck at 100% for ${Math.round(stuckDuration)}s, aborting`);
          throw new Error('Video stuck at 100% progress for 10+ minutes');
        }
      }
    } else {
      stuckAt100Since = null;
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
