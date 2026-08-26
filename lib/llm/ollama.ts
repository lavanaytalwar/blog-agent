import type { CompleteInput, CompleteResult, LlmProvider } from './types.js';
import { LlmError } from './types.js';

/**
 * Ollama Cloud, OpenAI-compatible chat completions.
 *
 * Verified against the native /api/chat route on 2026-08-26 with glm-5.2.
 *
 * Reasoning models here return a separate `thinking` field alongside `content`;
 * only `content` is the draft. Note that thinking is billed in eval_count, so a
 * short answer can still cost a lot of tokens: a 787-word draft at think:max
 * measured 19,113 output tokens, so 94% of what is billed is reasoning.
 *
 * **Streamed, deliberately.** Node's fetch is undici, whose `headersTimeout`
 * defaults to 300 seconds, and a non-streaming Ollama call sends no headers
 * until the entire generation is finished. That made every generation over five
 * minutes fail with a bare "fetch failed", which is exactly the regime this
 * pipeline entered once the word target started tracking SERP medians: a
 * 2,000-word draft at max reasoning takes longer than that. Streaming makes the
 * headers arrive immediately, so the ceiling disappears rather than being
 * raised to some other arbitrary number.
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
        stream: true,
        think: this.think,
        messages: [{ role: 'system', content: input.system }, ...input.messages],
        options: input.temperature === undefined ? undefined : { temperature: input.temperature },
      }),
    });

    if (!res.ok) throw new LlmError(`Ollama ${res.status}: ${(await res.text()).slice(0, 400)}`);

    if (!res.body) throw new LlmError('Ollama returned no body.');
    return { ...(await collect(res.body)), model: this.model };
  }
}

type Chunk = {
  message?: { content?: string };
  done?: boolean;
  error?: string;
  prompt_eval_count?: number;
  eval_count?: number;
};

/**
 * Newline-delimited JSON, one object per token batch, the last one carrying the
 * counts. Chunks split across reads, so the tail of each read is held back
 * until a newline arrives rather than being parsed and thrown away.
 */
async function collect(body: ReadableStream<Uint8Array>): Promise<{
  text: string; inputTokens?: number; outputTokens?: number;
}> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;

  const take = (line: string) => {
    if (!line.trim()) return;
    let chunk: Chunk;
    try {
      chunk = JSON.parse(line) as Chunk;
    } catch {
      // A line that is not JSON is a proxy or gateway speaking, not Ollama.
      throw new LlmError(`Ollama sent a non-JSON line: ${line.slice(0, 200)}`);
    }
    if (chunk.error) throw new LlmError(`Ollama: ${chunk.error}`);
    text += chunk.message?.content ?? '';
    if (chunk.prompt_eval_count !== undefined) inputTokens = chunk.prompt_eval_count;
    if (chunk.eval_count !== undefined) outputTokens = chunk.eval_count;
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) take(line);
  }
  take(buffer);

  if (!text.trim()) throw new LlmError('Ollama returned no text.');
  return { text, inputTokens, outputTokens };
}
