import { AnthropicProvider } from './anthropic.js';
import { OllamaProvider } from './ollama.js';
import type { LlmProvider } from './types.js';

export * from './types.js';
export { AnthropicProvider, OllamaProvider };

let override: LlmProvider | null = null;

/** Tests inject a fake rather than reaching the network. */
export function setProvider(provider: LlmProvider | null): void {
  override = provider;
}

export function getProvider(): LlmProvider {
  if (override) return override;
  const name = process.env.LLM_PROVIDER ?? 'anthropic';
  switch (name) {
    case 'anthropic': return new AnthropicProvider();
    case 'ollama': return new OllamaProvider();
    default: throw new Error(`Unknown LLM_PROVIDER "${name}". Use anthropic or ollama.`);
  }
}
