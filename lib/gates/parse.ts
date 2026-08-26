import type { Draft } from './types.js';

/**
 * Draft file format: a small key/value front-matter block, then markdown.
 * Deliberately not YAML — there is no nesting to represent, and a dependency
 * that can execute or coerce values has no business parsing generated content.
 */
const REQUIRED = [
  'slug', 'title', 'h1', 'meta_description', 'primary_keyword', 'cluster', 'persona',
] as const;

export class DraftParseError extends Error {}

export function parseDraft(source: string): Draft {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new DraftParseError('Draft must open with a --- front-matter block.');
  }

  const [, head, body = ''] = match;
  const fields: Record<string, string> = {};

  for (const line of (head ?? '').split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const at = line.indexOf(':');
    if (at === -1) throw new DraftParseError(`Front-matter line is not key: value — "${line}"`);
    const key = line.slice(0, at).trim();
    let value = line.slice(at + 1).trim();
    // Strip one layer of matching quotes; meta descriptions often need them.
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    fields[key] = value;
  }

  const missing = REQUIRED.filter((k) => !fields[k]);
  if (missing.length) {
    throw new DraftParseError(`Front matter is missing: ${missing.join(', ')}`);
  }

  return {
    slug: fields.slug!,
    title: fields.title!,
    h1: fields.h1!,
    metaDescription: fields.meta_description!,
    primaryKeyword: fields.primary_keyword!,
    clusterId: fields.cluster!,
    personaId: fields.persona!,
    bodyMd: body.trim(),
  };
}

export function serializeDraft(draft: Draft): string {
  return [
    '---',
    `slug: ${draft.slug}`,
    `title: ${draft.title}`,
    `h1: ${draft.h1}`,
    `meta_description: "${draft.metaDescription.replace(/"/g, "'")}"`,
    `primary_keyword: ${draft.primaryKeyword}`,
    `cluster: ${draft.clusterId ?? ''}`,
    `persona: ${draft.personaId ?? ''}`,
    '---',
    '',
    draft.bodyMd,
    '',
  ].join('\n');
}
