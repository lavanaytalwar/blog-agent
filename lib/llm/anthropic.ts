import type { CompleteInput, CompleteResult, LlmProvider } from './types.js';
import { LlmError } from './types.js';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const VERSION = '2023-06-01';

/**
 * Written against the raw Messages API rather than the SDK: one fetch, no
 * transitive dependencies, and nothing provider-specific leaks into the
 * prompts — which is what makes the Ollama swap real rather than theoretical.
 */
export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic';
  readonly model: string;

  constructor(model = process.env.LLM_MODEL ?? 'claude-sonnet-5') {
    this.model = model;
  }

  async complete(input: CompleteInput): Promise<CompleteResult> {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new LlmError('ANTHROPIC_API_KEY is not set. See .env.example.');

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        system: input.system,
        messages: input.messages,
        max_tokens: input.maxTokens ?? 8000,
        ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
      }),
    });

    if (!res.ok) {
      throw new LlmError(`Anthropic ${res.status}: ${(await res.text()).slice(0, 400)}`);
    }

    const json = (await res.json()) as {
      content: { type: string; text?: string }[];
      usage?: { input_tokens: number; output_tokens: number };
    };

    const text = json.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('');

    if (!text.trim()) throw new LlmError('Anthropic returned no text.');

    return {
      text,
      model: this.model,
      inputTokens: json.usage?.input_tokens,
      outputTokens: json.usage?.output_tokens,
    };
  }
}
