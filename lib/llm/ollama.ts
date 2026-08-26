import type { CompleteInput, CompleteResult, LlmProvider } from './types.js';
import { LlmError } from './types.js';

/**
 * Ollama Cloud, OpenAI-compatible chat completions.
 *
 * Verified against the native /api/chat route on 2026-08-26 with glm-5.2.
 *
 * Reasoning models here return a separate `thinking` field alongside `content`;
 * only `content` is the draft. Note that thinking is billed in eval_count, so a
 * short answer can still cost a lot of tokens.
 */
export class OllamaProvider implements LlmProvider {
  readonly name = 'ollama';
  readonly model: string;
  private readonly baseUrl: string;
  private readonly think: string | boolean;

  constructor(model = process.env.LLM_MODEL ?? 'gpt-oss:120b') {
    this.model = model;
    this.baseUrl = process.env.OLLAMA_BASE_URL ?? 'https://ollama.com/api';
    // Measured on glm-5.2 against the same question: max produced 3,898
    // characters of reasoning and 1,367 eval tokens, high produced 2,170 and
    // 747, the plain boolean 1,155. The brief carries thirty-odd simultaneous
    // constraints, so the extra reasoning is worth roughly double the tokens.
    // ("xhigh" is not a level and errors.)
    const level = process.env.OLLAMA_THINK ?? 'max';
    this.think = level === 'true' ? true : level === 'false' ? false : level;
  }

  async complete(input: CompleteInput): Promise<CompleteResult> {
    const key = process.env.OLLAMA_API_KEY;
    if (!key) throw new LlmError('OLLAMA_API_KEY is not set.');

    const res = await fetch(`${this.baseUrl}/chat`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        think: this.think,
        messages: [{ role: 'system', content: input.system }, ...input.messages],
        options: input.temperature === undefined ? undefined : { temperature: input.temperature },
      }),
    });

    if (!res.ok) throw new LlmError(`Ollama ${res.status}: ${(await res.text()).slice(0, 400)}`);

    const json = (await res.json()) as {
      message?: { content?: string };
      prompt_eval_count?: number;
      eval_count?: number;
    };
    const text = json.message?.content ?? '';
    if (!text.trim()) throw new LlmError('Ollama returned no text.');

    return {
      text,
      model: this.model,
      inputTokens: json.prompt_eval_count,
      outputTokens: json.eval_count,
    };
  }
}
