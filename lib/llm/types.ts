export type Message = { role: 'user' | 'assistant'; content: string };

export type CompleteInput = {
  system: string;
  messages: Message[];
  maxTokens?: number;
  temperature?: number;
};

export type CompleteResult = {
  text: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
};

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  complete(input: CompleteInput): Promise<CompleteResult>;
}

export class LlmError extends Error {}
