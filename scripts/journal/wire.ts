// A standing line's date, computed rather than written.
//
// Two slots on this site carry a line that persists: the conference wire on
// the national page's card, and — when it exists — the national headline
// itself. Both are displaced by something more newsworthy or by no longer
// being true, never by the cadence coming round again, so most days the line
// comes back word for word and the date beside it must not move.
//
// The date is therefore never asked of the writer. A model-authored date would
// be a claim like any other, needing a basis and a checker; this is the one
// fact about the line that the machinery already knows for certain, by having
// the previous journal in its hand at the moment it writes the next one.

/** The previous run's line and the day it was last stamped. */
export interface Standing {
  line: string;
  updated?: string | undefined;
}

/**
 * The day this line last CHANGED — carried forward when the text is the same,
 * restamped to the collect date when it differs.
 *
 * Undefined has one meaning and it is not "today": the line is unchanged and
 * the previous journal carried no date, which is what the first run after this
 * field existed looks like. The site does not know when the sentence last
 * moved, so it prints no date rather than stamping today onto prose that is
 * older than today. The surface renders the tag only when there is one.
 */
export function standingDate(
  line: string,
  previous: Standing | undefined,
  collectDate: string,
): string | undefined {
  return previous && previous.line === line ? previous.updated : collectDate;
}

/**
 * The writer's note on what displaced the line, kept only when something did.
 *
 * Displacement is the whole judgement this slot asks of the writer, so the
 * writer is asked to name the fact that won — not on the page, which owes a
 * reader a sentence rather than a rationale, but in the file, for whoever
 * reads tomorrow's diff and wants the model's own reason rather than an
 * inference from two lines of prose.
 *
 * On a day the line stood there is nothing to name, and a note carried into
 * that day would describe a displacement that did not happen. The CLI decides
 * rather than the writer, because it has just done the comparison and asking
 * the writer to agree with it would be a second place for one fact to be wrong.
 */
export function standingNote(
  line: string,
  previous: Standing | undefined,
  note: string | undefined,
): string | undefined {
  return previous && previous.line === line ? undefined : note;
}
