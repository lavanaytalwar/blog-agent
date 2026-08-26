import { assembleBrief } from '../brief/assemble.js';
import { renderSystemPrompt, renderUserMessage } from '../brief/render.js';
import { getProvider } from '../llm/index.js';
import { parseDraft, DraftParseError } from '../gates/parse.js';
import type { Draft } from '../gates/types.js';
import type { DraftRequest, DraftSource } from './source.js';
import type { SerpCoverage } from '../brief/types.js';

export class PipelineError extends Error {}

/**
 * The real draft source: brief in, prose out.
 *
 * Everything decided before the model runs is decided deterministically by
 * assembleBrief. The model's only job is to write, and its output is parsed
 * back into the same structure a human-written draft file uses — so the gates
 * cannot tell the difference and do not need to.
 */
export class PipelineDraftSource implements DraftSource {
  readonly name: string;

  constructor(
    private readonly serpCoverage: (keyword: string) => Promise<SerpCoverage[]> = async () => [],
    private readonly existingTitles: () => Promise<string[]> = async () => [],
  ) {
    this.name = `${process.env.LLM_PROVIDER ?? 'anthropic'}:${process.env.LLM_MODEL ?? 'claude-sonnet-5'}`;
  }

  async generate(request: DraftRequest): Promise<Draft> {
    const brief = assembleBrief({
      primaryKeyword: request.primaryKeyword,
      additionalKeywords: request.additionalKeywords,
      personaId: request.personaId,
      attempt: request.attempt,
      note: request.note,
      serpCoverage: await this.serpCoverage(request.primaryKeyword),
      existingTitles: await this.existingTitles(),
    });

    const provider = getProvider();
    const result = await provider.complete({
      system: renderSystemPrompt(brief),
      messages: [{ role: 'user', content: renderUserMessage(brief) }],
      // Low but not zero: the structure is fixed by the prompt, the prose is not.
      temperature: 0.7,
    });

    // The selection is a fact about the request, not something the model gets a
    // vote on. Whatever it echoed in the front matter is overwritten here so the
    // gates check what was actually asked for.
    return {
      ...parseResponse(result.text),
      additionalKeywords: brief.additionalTargets.map((t) => t.keyword),
    };
  }
}

/**
 * Models like to wrap output in fences or open with "Here's the post:".
 * Strip both rather than failing the whole run over packaging.
 */
export function parseResponse(text: string): Draft {
  let body = text.trim();

  const fenced = body.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/);
  if (fenced?.[1]) body = fenced[1].trim();

  const start = body.indexOf('---');
  if (start > 0) body = body.slice(start);

  // Models sometimes drop the opening delimiter and begin straight at `slug:`.
  // Failing an otherwise complete draft over a missing three characters is a
  // waste of a generation, so put it back.
  if (!body.startsWith('---') && /^slug:\s*\S/.test(body)) {
    const close = body.indexOf('\n---');
    if (close !== -1) body = `---\n${body}`;
  }

  try {
    return parseDraft(body);
  } catch (error) {
    if (error instanceof DraftParseError) {
      throw new PipelineError(
        `Model output was not a valid draft: ${error.message}\n\n${body.slice(0, 300)}`,
      );
    }
    throw error;
  }
}
