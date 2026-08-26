import type { GateReport } from '../../../lib/gates/types.js';

export type Segment = { text: string; highlighted: boolean; rule?: string };

/**
 * Splits text so every failure's `evidence` can be marked where it actually
 * appears. Evidence that is a paraphrase rather than a substring simply does
 * not match and is left to the gate report column — better a missing highlight
 * than a wrong one.
 */
export function segment(text: string, report: GateReport | null): Segment[] {
  if (!report) return [{ text, highlighted: false }];

  const marks: { start: number; end: number; rule: string }[] = [];
  const lower = text.toLowerCase();

  for (const gate of report.results) {
    for (const failure of gate.failures) {
      const evidence = failure.evidence?.trim();
      // Very short evidence ("5") would light up the whole document.
      if (!evidence || evidence.length < 4) continue;
      const at = lower.indexOf(evidence.toLowerCase());
      if (at === -1) continue;
      marks.push({ start: at, end: at + evidence.length, rule: failure.rule });
    }
  }

  if (!marks.length) return [{ text, highlighted: false }];
  marks.sort((a, b) => a.start - b.start || b.end - a.end);

  const out: Segment[] = [];
  let cursor = 0;
  for (const mark of marks) {
    if (mark.start < cursor) continue; // overlapping evidence: first one wins
    if (mark.start > cursor) out.push({ text: text.slice(cursor, mark.start), highlighted: false });
    out.push({ text: text.slice(mark.start, mark.end), highlighted: true, rule: mark.rule });
    cursor = mark.end;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), highlighted: false });
  return out;
}

export type Block = { kind: 'h2' | 'h3' | 'p'; segments: Segment[] };

/** Minimal markdown blocks — enough to read a draft, not a full renderer. */
export function blocks(md: string, report: GateReport | null): Block[] {
  return md
    .split(/\n{2,}/)
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw): Block => {
      if (raw.startsWith('### ')) return { kind: 'h3', segments: segment(raw.slice(4), report) };
      if (raw.startsWith('## ')) return { kind: 'h2', segments: segment(raw.slice(3), report) };
      const text = raw.replace(/^#+\s+/, '').replace(/\*\*/g, '');
      return { kind: 'p', segments: segment(text, report) };
    });
}
