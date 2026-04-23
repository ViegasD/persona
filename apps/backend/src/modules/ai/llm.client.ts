import OpenAI from 'openai';
import { env } from '../../shared/config/env.js';
import { createChildLogger } from '../../shared/utils/logger.js';
import { trackEvent } from '../analytics/analytics.service.js';

const log = createChildLogger('llm-client');

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return client;
}

/** Models that support `reasoning_effort` (gpt-5 family + o-series). */
function isReasoningModel(model: string): boolean {
  return /^(o\d|gpt-5)/i.test(model);
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmResponse {
  content: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

/**
 * Calls the LLM with the given messages and returns both the text response and token usage.
 */
export async function callLlm(
  messages: LlmMessage[],
  options?: { leadId?: string; agentName?: string; model?: string; maxTokens?: number },
): Promise<LlmResponse> {
  const startMs = Date.now();
  const model = options?.model ?? env.OPENAI_MODEL;
  // Default is generous because reasoning models (o-series, gpt-5) burn
  // hidden reasoning tokens against this same cap and would otherwise
  // return finish_reason='length' with empty content.
  const maxTokens = options?.maxTokens ?? 2000;

  const completion = await getClient().chat.completions.create({
    model,
    messages,
    max_completion_tokens: maxTokens,
    // Reasoning models (gpt-5, o-series) burn hidden reasoning tokens against
    // max_completion_tokens. For short scriptwriting we don't need reasoning;
    // 'minimal' effectively disables it so all output budget goes to content.
    ...(isReasoningModel(model) ? { reasoning_effort: 'minimal' as const } : {}),
  });

  const choice = completion.choices[0];
  const content = choice?.message?.content ?? '';
  const finishReason = choice?.finish_reason;
  const refusal = (choice?.message as any)?.refusal;
  const usage = {
    promptTokens: completion.usage?.prompt_tokens ?? 0,
    completionTokens: completion.usage?.completion_tokens ?? 0,
    totalTokens: completion.usage?.total_tokens ?? 0,
  };
  if (!content || finishReason === 'content_filter' || finishReason === 'length') {
    log.warn(
      {
        model,
        finishReason,
        refusal,
        agent: options?.agentName,
        hasContent: !!content,
        completionTokens: usage.completionTokens,
        maxTokens,
      },
      'LLM returned empty or non-stop completion',
    );
  }

  const durationMs = Date.now() - startMs;

  log.debug(
    { model, tokens: usage.totalTokens, durationMs, agent: options?.agentName },
    'LLM call completed',
  );

  // Track usage for cost monitoring
  if (options?.leadId) {
    trackEvent(options.leadId, 'LLM_CALL', {
      model,
      agent: options.agentName,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      durationMs,
    }).catch(() => {}); // fire-and-forget
  }

  return { content, usage };
}

/**
 * Calls the LLM with structured JSON output.
 * The response is parsed as JSON.
 */
export async function callLlmJson<T>(
  messages: LlmMessage[],
  options?: { leadId?: string; agentName?: string; model?: string },
): Promise<{ data: T; usage: LlmResponse['usage'] }> {
  const MAX_ATTEMPTS = 3;
  let lastError: unknown;
  const model = options?.model ?? env.OPENAI_MODEL;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const startMs = Date.now();

    let completion;
    try {
      completion = await getClient().chat.completions.create({
        model,
        messages,
        max_completion_tokens: 10000,
        response_format: { type: 'json_object' },
        ...(isReasoningModel(model) ? { reasoning_effort: 'minimal' as const } : {}),
      });
    } catch (apiErr) {
      const durationMs = Date.now() - startMs;
      log.error({ attempt, durationMs, err: apiErr }, '[LLM:JSON] OpenAI API call failed');
      lastError = apiErr;
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        continue;
      }
      throw apiErr;
    }

    const choice = completion.choices[0];
    const raw = (choice?.message?.content ?? '').trim();
    const finishReason = choice?.finish_reason;
    const refusal = (choice?.message as any)?.refusal;
    const usage = {
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
      totalTokens: completion.usage?.total_tokens ?? 0,
    };

    const durationMs = Date.now() - startMs;

    log.info(
      { model, promptTokens: usage.promptTokens, completionTokens: usage.completionTokens, durationMs, agent: options?.agentName, attempt, finishReason, refusal },
      '[LLM:JSON] Call completed',
    );
    log.info({ rawResponse: raw.substring(0, 500) }, '[LLM:JSON] Raw response');

    if (options?.leadId) {
      trackEvent(options.leadId, 'LLM_CALL', {
        model,
        agent: options.agentName,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        durationMs,
        attempt,
      }).catch(() => {});
    }

    // Handle empty / whitespace-only response
    if (!raw || raw.length < 2) {
      log.warn(
        { attempt, rawLength: raw.length, finishReason, refusal, completionTokens: usage.completionTokens },
        '[LLM:JSON] Empty response from LLM',
      );
      if (attempt < MAX_ATTEMPTS) {
        log.info('[LLM:JSON] Retrying...');
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        continue;
      }
      throw new Error('LLM returned empty response after retries');
    }

    try {
      const data = JSON.parse(raw) as T;
      return { data, usage };
    } catch (parseErr) {
      log.warn({ attempt, rawSnippet: raw.substring(0, 200) }, '[LLM:JSON] JSON parse failed');
      if (attempt < MAX_ATTEMPTS) {
        log.info('[LLM:JSON] Retrying...');
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        continue;
      }
      throw parseErr;
    }
  }

  // Should never reach here, but TypeScript needs it
  throw new Error('LLM retries exhausted');
}

/**
 * Transcribes an audio buffer using OpenAI Whisper.
 * WhatsApp voice notes arrive as audio/ogg; codecs=opus — Whisper supports this natively.
 */
export async function transcribeAudio(
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  const startMs = Date.now();

  // Whisper accepts: mp3, mp4, mpeg, mpga, m4a, wav, webm, ogg
  const extMap: Record<string, string> = {
    'audio/ogg': 'ogg',
    'audio/ogg; codecs=opus': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/wav': 'wav',
    'audio/webm': 'webm',
    'audio/amr': 'amr',
  };
  const baseMime = mimeType.split(';')[0].trim();
  const ext = extMap[mimeType] ?? extMap[baseMime] ?? 'ogg';

  const file = new File([buffer], `audio.${ext}`, { type: baseMime });

  const transcription = await getClient().audio.transcriptions.create({
    model: 'whisper-1',
    file,
    language: 'pt',
  });

  const durationMs = Date.now() - startMs;
  log.info({ durationMs, textLength: transcription.text.length }, '[WHISPER] Audio transcribed');

  return transcription.text;
}
