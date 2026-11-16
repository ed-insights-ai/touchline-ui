// ALGORITHM.md section 4, penalties: a play of type `penalty` is an attempt by
// the player it names, and a goal when its text matches PENALTY KICK GOAL
// (case-insensitive).
//
// Who the play names is read with the site's own penalty parse (`goalScorer`
// in src/lib/plays.ts, the parse the match page's ledger and timeline use),
// which returns the teamsheet's spelling when the sentence names someone on
// it. When it does not ("PENALTY KICK by COKERM Celestin Blondel WIDE." puts
// the name after the words the parse cuts at), the play's side's line whose
// every name word appears in the sentence is taken, if exactly one does. A
// play that names nobody on the sheet ("*penalty kick") is an attempt by no
// one, and is counted as unattributed for the build log.

import type { MatchDetail, MatchPlay, MatchPlayerLine } from "../../src/lib/model.ts";
import { goalScorer, playerIndex } from "../../src/lib/plays.ts";
import { foldKey } from "../../src/lib/tiers.ts";

export const isPenaltyGoalText = (text: string): boolean => /PENALTY KICK GOAL/i.test(text);

export interface PenaltyCredit {
  /** The box score's side index, and the line on it. */
  side: number;
  line: MatchPlayerLine;
  goal: boolean;
}

export interface PenaltyReading {
  credits: PenaltyCredit[];
  /** Penalty plays no line could be found for. */
  unattributed: MatchPlay[];
}

const words = (s: string): string[] =>
  s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter(Boolean);

/** The one line on a side that a penalty play names, or null. */
function lineNamed(
  play: MatchPlay,
  side: number,
  detail: MatchDetail,
  index: ReturnType<typeof playerIndex>,
): MatchPlayerLine | null {
  const team = detail.teams[side];
  const lines = team?.players ?? [];
  if (lines.length === 0) return null;
  const parsed = goalScorer(play, team, index);
  const exact = lines.filter((l) => l.name === parsed);
  if (exact.length === 1) return exact[0] ?? null;
  const folded = foldKey(parsed);
  const byFold = lines.filter((l) => foldKey(l.name) === folded);
  if (byFold.length === 1) return byFold[0] ?? null;
  const said = new Set(words(play.text));
  const contained = lines.filter((l) => {
    const w = words(l.name);
    return w.length > 0 && w.every((x) => said.has(x));
  });
  return contained.length === 1 ? (contained[0] ?? null) : null;
}

/** Every penalty play of one box score, credited to the line it names. */
export function readPenalties(detail: MatchDetail): PenaltyReading {
  const credits: PenaltyCredit[] = [];
  const unattributed: MatchPlay[] = [];
  const plays = (detail.plays ?? []).filter((p) => p.type === "penalty");
  if (plays.length === 0) return { credits, unattributed };
  const index = playerIndex(detail);
  for (const play of plays) {
    const goal = isPenaltyGoalText(play.text);
    const sides = play.team === 0 || play.team === 1 ? [play.team] : detail.teams.map((_, i) => i);
    const found = sides
      .map((side) => ({ side, line: lineNamed(play, side, detail, index) }))
      .filter((x): x is { side: number; line: MatchPlayerLine } => x.line !== null);
    if (found.length === 1) {
      const hit = found[0] as { side: number; line: MatchPlayerLine };
      credits.push({ side: hit.side, line: hit.line, goal });
    } else unattributed.push(play);
  }
  return { credits, unattributed };
}
