// ALGORITHM.md 4.6 (version 2.2): penalties from the play-by-play.
//
// A play of type `penalty` is an attempt by the player it names, unless its
// text contains AWARDED (the award, not the kick) or begins with `*` (a note
// that names nobody). It is a goal when its text matches PENALTY KICK GOAL or
// FOR A GOAL, case-insensitively.
//
// Who it names is read by the contract's own rule (namedText, then
// resolveNamed), not the site's goalScorer. [v2.2] A leading clock and
// anything in brackets go first; every keyword is matched without regard to
// case; and the text is tried as it stands, then with one, two, ... leading
// words removed while one remains, so a team name of several words in front
// ("Franklin Pierce Rodrigues, Braudilio") is read past.

import type { MatchDetail, MatchPlay } from "../../src/lib/model.ts";
import { foldLetters, foldName, foldSurname, givenFirst } from "../../src/lib/tiers.ts";

/** Whether a penalty play's text marks a goal. */
export const isPenaltyGoalText = (text: string): boolean =>
  /PENALTY KICK GOAL|FOR A GOAL/i.test(text);

/** Whether a penalty play is an attempt at all. */
export const isPenaltyAttempt = (play: MatchPlay): boolean =>
  play.type === "penalty" && !play.text.includes("AWARDED") && !play.text.startsWith("*");

const CLOCK = /^\s*\d{1,3}:\d{2}\s*/;
const BRACKETS = /\([^)]*\)|\[[^\]]*\]/g;
const BY_FORM = /^PENALTY KICK by/i;
const CUT = /MISSED|MISS|WIDE|SAVED|for a GOAL|null/i;

/** The text that names the kicker. Anything in brackets and a leading clock
 *  are dropped first; then the text before PENALTY KICK, or, when the play
 *  begins PENALTY KICK by, the text after it cut at the first outcome word. */
export function namedText(playText: string): string {
  const text = playText.replace(BRACKETS, " ").replace(CLOCK, "").trim();
  let named: string;
  const by = BY_FORM.exec(text);
  if (by) {
    named = text.slice(by[0].length);
    const cut = CUT.exec(named);
    if (cut) named = named.slice(0, cut.index);
  } else {
    const at = text.search(/PENALTY KICK/i);
    named = at >= 0 ? text.slice(0, at) : "";
  }
  return named.replace(/\s+/g, " ").trim();
}

/** The first letter of the folded given name, for 4.3: the part after the
 *  comma in "Last, First", every word but the last otherwise; empty when
 *  there is none. */
export function givenInitial(name: string): string {
  const comma = name.indexOf(",");
  const given =
    comma >= 0 ? name.slice(comma + 1) : name.trim().split(/\s+/).slice(0, -1).join(" ");
  return foldLetters(given).slice(0, 1);
}

/** [v2.2] The kicker test's first letter: of the first word once "Last,
 *  First" is swapped to "First Last", folded. */
export function firstLetter(name: string): string {
  return foldLetters(givenFirst(name).split(/\s+/)[0] ?? "").slice(0, 1);
}

/**
 * The line indices on one side's sheet that a named text resolves to, or
 * null. Tried as it stands, then with one leading word removed, then two, and
 * so on while a word remains; the first try that resolves wins. For each try,
 * the lines whose folded name equals the try's fold, else the only line with
 * the same folded surname and, when the try has more than one word, the same
 * first letter (firstLetter) as the try. Lines that fold alike are one player
 * printed twice, and resolve together.
 */
export function resolveNamed(text: string, names: readonly string[]): number[] | null {
  const words = text.split(/\s+/).filter(Boolean);
  for (let drop = 0; drop < words.length; drop++) {
    const tryWords = words.slice(drop);
    const t = tryWords.join(" ");
    const f = foldName(t);
    if (f !== "") {
      const exact = names.flatMap((n, i) => (foldName(n) === f ? [i] : []));
      if (exact.length > 0) return exact;
    }
    const surname = foldSurname(t);
    if (surname === "") continue;
    const initial = tryWords.length > 1 ? firstLetter(t) : "";
    const hits = names.flatMap((n, i) =>
      foldSurname(n) === surname && (initial === "" || firstLetter(n) === initial) ? [i] : [],
    );
    if (hits.length > 0 && new Set(hits.map((i) => foldName(names[i] as string))).size === 1) {
      return hits;
    }
  }
  return null;
}

export interface PenaltyCredit {
  /** The box score's side index, and the indices of the lines on its
   *  `players` list that the play names. */
  side: number;
  lines: number[];
  goal: boolean;
}

export interface PenaltyReading {
  credits: PenaltyCredit[];
  /** Attempts no line could be found for. */
  unattributed: MatchPlay[];
  /** Penalty plays that are not attempts (AWARDED, or a `*` note). */
  notAttempts: number;
}

/** Every penalty play of one box score, credited to the lines it names. A
 *  play with no team index is credited only when exactly one side resolves. */
export function readPenalties(detail: MatchDetail): PenaltyReading {
  const credits: PenaltyCredit[] = [];
  const unattributed: MatchPlay[] = [];
  let notAttempts = 0;
  for (const play of detail.plays ?? []) {
    if (play.type !== "penalty") continue;
    if (!isPenaltyAttempt(play)) {
      notAttempts++;
      continue;
    }
    const text = namedText(play.text);
    const sides = play.team === 0 || play.team === 1 ? [play.team] : detail.teams.map((_, i) => i);
    const found = sides.flatMap((side) => {
      const names = (detail.teams[side]?.players ?? []).map((l) => l.name);
      const lines = text === "" ? null : resolveNamed(text, names);
      return lines ? [{ side, lines }] : [];
    });
    if (found.length === 1) {
      const hit = found[0] as { side: number; lines: number[] };
      credits.push({ side: hit.side, lines: hit.lines, goal: isPenaltyGoalText(play.text) });
    } else unattributed.push(play);
  }
  return { credits, unattributed, notAttempts };
}
