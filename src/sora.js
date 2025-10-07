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
  // Use gpt-5-mini reasoning model with minimal effort for high-quality Sora 2 prompts
  const enhancementPrompt = `You are a professional cinematographer and Sora 2 prompt expert. Transform the user's rough video idea into a detailed, production-ready Sora 2 prompt following the official OpenAI Sora 2 Prompting Guide (https://cookbook.openai.com/examples/sora/sora2_prompting_guide).

USER INPUT (keep original language - usually Russian):
"${userPrompt}"

TASK: Expand this into a structured Sora 2 prompt with these elements:

1. STYLE & FORMAT (1-2 sentences)
   - Visual style (e.g., "90s documentary", "cinematic drama", "hand-painted animation")
   - Film stock/camera aesthetic (e.g., "35mm film with natural flares", "digital capture emulating 65mm")
   - Color grade hints (e.g., "warm Kodak-inspired", "teal and sand palette")

2. SCENE DESCRIPTION (2-3 sentences)
   - Location and environment with sensory details
   - Subject(s) with distinctive characteristics
   - Atmosphere, weather, time of day, background elements

3. CINEMATOGRAPHY (structured block)
   Camera: [framing like "medium close-up", "wide establishing shot", movement like "slow dolly-in", "handheld"]
   Lens: [e.g., "35mm spherical", "50mm prime", "wide angle"]
   Lighting: [direction, quality, practicals - e.g., "golden natural key with tungsten bounce"]
   Mood: [2-4 adjectives like "nostalgic, tender, cinematic" or "suspenseful, gritty, intimate"]

4. ACTIONS (3-5 bullet points)
   - Clear, specific beats or gestures
   - Sequenced motion within 4-8 seconds
   - If dialogue exists, integrate it naturally

5. BACKGROUND SOUND (1 sentence, optional)
   - Diegetic sound cues (e.g., "rain, ticking clock, faint bulb sizzle")

CRITICAL RULES:
- Keep the ORIGINAL LANGUAGE (Russian/English) from user input
- Be DESCRIPTIVE but CONCISE - aim for 150-250 words total
- Use cinematography vocabulary: frame, depth of field, lighting direction, color palette
- Suggest ONE clear action or sequence that fits 4-8 seconds
- NEVER include: NSFW, violence against people, children in unsafe situations, hate content
- If user input violates policy, return: "Этот промпт нарушает правила. Попробуй другой сюжет."

OUTPUT FORMAT:
Return ONLY the enhanced prompt in the original language, structured and ready to send to Sora 2 API. No explanations, no meta-commentary.`;

  const body = {
    model: 'gpt-5-mini',
    messages: [
      { role: 'user', content: enhancementPrompt }
    ],
    max_completion_tokens: 1500,
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
  const payload = {
    model, // 'sora-2' | 'sora-2-pro'
    prompt,
    seconds: durationSeconds,
    size: width && height ? `${width}x${height}` : undefined,
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
