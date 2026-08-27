/**
 * The nine things a gate cannot check, stated once.
 *
 * This table is defined by subtraction from `lib/gates/rules.ts`: everything a
 * machine can decide is a rule there, and only what needs judgment lives here.
 * Duplicating a mechanical rule would recreate exactly the drift that file
 * exists to stop, in a place where nothing fails to catch it.
 *
 * Rendered into two prompts from this one object: the writer is told what a
 * reviewer will read for, and the reviewer is asked about the same nine
 * standards in the same words. A test asserts both.
 *
 * Each string is phrased as the standard the draft must meet, so it reads as an
 * instruction to the writer and as a question to the reviewer without being
 * written twice.
 */
export const CHECKS = {
  'story.thread':
    'One thread runs the whole post. Every H2 is the next beat of the same story, not a new topic. A section that could be lifted into a different post without anyone noticing is not part of the story.',
  'story.scene':
    'The opening is a situation a reader can picture, with someone in it. A definition, or a category statement dressed up as a scene, is not one.',
  'story.characters':
    'The customers this post may name act in the story. A brand name attached to a number in a list is not a character.',
  'serp.lesson_applied':
    'The post covers what the ranking pages cover, and says at least one thing none of them said. It does not reproduce their shape.',
  'claim.earns_place':
    'Every number is doing work in an argument. A permitted figure dropped in to sound credible is decoration, and reads like it.',
  'coined.definition_lands':
    'At least one coined term is defined in words a merchant understands on first read. The writer picks which one, and only needs one. That a term exists and is defined in a clause is checked in code; this is whether the definition explains anything.',
  'argument.no_restatement':
    'No two sections make the same point in different words. Length is earned with new ground, never by restating the heading above it.',
  'persona.fit':
    'Written to the mapped persona and the number they are accountable for, not to a generic ecommerce audience.',
  'cta.earned':
    'The one call to action follows from the argument the post just made. A reader who agreed with the post would want it.',
} as const;

export type CheckId = keyof typeof CHECKS;

export const CHECK_IDS = Object.keys(CHECKS) as CheckId[];

/**
 * A review that reports on fewer than this many checks did not do the job, and
 * is recorded as unavailable rather than presented as a thin verdict. Five of
 * nine: a majority, tolerant of one or two findings dropped for want of a real
 * quote.
 */
export const MIN_REPORTED = 5;

/** The table as prompt text. Both prompts render from this, never from a copy. */
export function promptChecks(): string {
  // Colon separator, not a dash. `tone.em_dash` bans dashes in what the model
  // writes, and handing it a list of them here is the drift this pattern exists
  // to prevent.
  return CHECK_IDS.map((id) => `- **${id}**: ${CHECKS[id]}`).join('\n');
}
