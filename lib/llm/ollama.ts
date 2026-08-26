import type { CompleteInput, CompleteResult, LlmProvider } from './types.js';
import { LlmError } from './types.js';

/**
 * Ollama Cloud, OpenAI-compatible chat completions.
 *
 * Untested against a live endpoint — no key exists yet. Present so the swap is
 * a config change rather than a rewrite. Expect weaker long-form drafting and
 * weaker multi-constraint instruction following than Sonnet; the gates are
 * deterministic precisely so that difference shows up as visible quality rather
 * than as something slipping through.
 */
export class OllamaProvider implements LlmProvider {
  readonly name = 'ollama';
  readonly model: string;
  private readonly baseUrl: string;

  constructor(model = process.env.LLM_MODEL ?? 'gpt-oss:120b') {
    this.model = model;
    this.baseUrl = process.env.OLLAMA_BASE_URL ?? 'https://ollama.com/api';
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
        messages: [{ role: 'system', content: input.system }, ...input.messages],
        options: input.temperature === undefined ? undefined : { temperature: input.temperature },
      }),
    });

    if (!res.ok) throw new LlmError(`Ollama ${res.status}: ${(await res.text()).slice(0, 400)}`);

    const json = (await res.json()) as { message?: { content?: string } };
    const text = json.message?.content ?? '';
    if (!text.trim()) throw new LlmError('Ollama returned no text.');

    return { text, model: this.model };
  }
}
