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

// ── The lede, which is two fields ────────────────────────────────────────────

/** The headline and dek as one comparison string.
 *
 *  JSON rather than a joined string: the separator in "headline\ndek" is a
 *  character a headline could itself contain, and then a lede whose headline
 *  wrapped a line would be indistinguishable from one whose dek began where
 *  the headline ended. JSON.stringify over a fixed-length array escapes the
 *  quotes and the newlines, so the encoding is injective and two different
 *  ledes can never compare equal.
 */
const ledeKey = (headline: string, dek: string | undefined): string =>
  JSON.stringify([headline, dek ?? null]);

/** The previous run's lede, and the day it was last stamped. */
export interface StandingLede {
  headline: string;
  dek?: string | undefined;
  updated?: string | undefined;
}

/**
 * The lede's date and displacement note, on exactly the wire's rule.
 *
 * The headline and the dek are one thing to a reader — a sentence and the
 * figures that stand it up, read together, at the top of the page — so they
 * are one standing line here. Either of them moving is a displacement; both
 * coming back word for word is a day the lede stood, and the date must not
 * move. A dek rewritten under an unchanged headline is a change to what the
 * page says, and the tag would be lying if it kept yesterday's date over it.
 *
 * `stood` is returned rather than left to the caller to work out. The caller
 * wants to report which happened, and both facts it could infer it from are
 * unreliable: a date equal to today is also what a lede displaced twice in one
 * collect looks like, and a date equal to the previous one is also what a
 * second displacement on the same day looks like. Re-running a generation
 * after a bad one is exactly when someone reads that line, so the question is
 * answered here, where the comparison actually happens, and answered once.
 */
export function standingLede(
  next: { headline: string; dek?: string | undefined; displaced_by?: string | undefined },
  previous: StandingLede | undefined,
  collectDate: string,
): { updated: string | undefined; displaced_by: string | undefined; stood: boolean } {
  const before = previous
    ? { line: ledeKey(previous.headline, previous.dek), updated: previous.updated }
    : undefined;
  const line = ledeKey(next.headline, next.dek);
  return {
    updated: standingDate(line, before, collectDate),
    displaced_by: standingNote(line, before, next.displaced_by),
    stood: before !== undefined && before.line === line,
  };
}
