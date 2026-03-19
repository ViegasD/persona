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
  options?: { leadId?: string; agentName?: string },
): Promise<LlmResponse> {
  const startMs = Date.now();

  const completion = await getClient().chat.completions.create({
    model: env.OPENAI_MODEL,
    messages,
    temperature: 0.7,
    max_tokens: 500,
  });

  const choice = completion.choices[0];
  const content = choice?.message?.content ?? '';
  const usage = {
    promptTokens: completion.usage?.prompt_tokens ?? 0,
    completionTokens: completion.usage?.completion_tokens ?? 0,
    totalTokens: completion.usage?.total_tokens ?? 0,
  };

  const durationMs = Date.now() - startMs;

  log.debug(
    { model: env.OPENAI_MODEL, tokens: usage.totalTokens, durationMs, agent: options?.agentName },
    'LLM call completed',
  );

  // Track usage for cost monitoring
  if (options?.leadId) {
    trackEvent(options.leadId, 'LLM_CALL', {
      model: env.OPENAI_MODEL,
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
  options?: { leadId?: string; agentName?: string },
): Promise<{ data: T; usage: LlmResponse['usage'] }> {
  const MAX_ATTEMPTS = 2;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const startMs = Date.now();

    const completion = await getClient().chat.completions.create({
      model: env.OPENAI_MODEL,
      messages,
      temperature: 0.7,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
    });

    const choice = completion.choices[0];
    const raw = (choice?.message?.content ?? '').trim();
    const usage = {
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
      totalTokens: completion.usage?.total_tokens ?? 0,
    };

    const durationMs = Date.now() - startMs;

    log.info(
      { model: env.OPENAI_MODEL, tokens: usage.totalTokens, durationMs, agent: options?.agentName, attempt },
      '[LLM:JSON] Call completed',
    );
    log.info({ rawResponse: raw.substring(0, 500) }, '[LLM:JSON] Raw response');

    if (options?.leadId) {
      trackEvent(options.leadId, 'LLM_CALL', {
        model: env.OPENAI_MODEL,
        agent: options.agentName,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        durationMs,
        attempt,
      }).catch(() => {});
    }

    // Handle empty / whitespace-only response
    if (!raw || raw.length < 2) {
      log.warn({ attempt, rawLength: raw.length }, '[LLM:JSON] Empty response from LLM');
      if (attempt < MAX_ATTEMPTS) {
        log.info('[LLM:JSON] Retrying...');
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
        continue;
      }
      throw parseErr;
    }
  }

  // Should never reach here, but TypeScript needs it
  throw new Error('LLM retries exhausted');
}
