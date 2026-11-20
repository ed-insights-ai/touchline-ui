// ALGORITHM.md section 6: a programme-season's totals for defence.
//
// Over the physical matches where both sides have integer shots and scores:
// n matches, GA goals conceded, SA shots faced, and EGA = Σ mu × att[opponent]
// / h from the GOALS model, with h the home factor for the programme's side
// and, where the opponent has no factor, the goals actually conceded in that
// match.

import { type Factors, type Venue, venueFactor } from "./opponents.ts";
import type { TeamTotals } from "./workload.ts";

/** One match from one programme's side. */
export interface TeamMatch {
  /** The opponent as the model knows it (teamId). */
  opponent: string;
  venue: Venue;
  goalsFor: number | null;
  goalsAgainst: number | null;
  shotsFor: number | null;
  shotsAgainst: number | null;
}

const integer = (x: number | null): x is number => x !== null && Number.isInteger(x);

export function teamTotals(
  slug: string,
  matches: readonly TeamMatch[],
  goals: Factors,
): TeamTotals {
  let n = 0;
  let ga = 0;
  let sa = 0;
  let ega = 0;
  for (const m of matches) {
    if (
      !integer(m.goalsFor) ||
      !integer(m.goalsAgainst) ||
      !integer(m.shotsFor) ||
      !integer(m.shotsAgainst)
    ) {
      continue;
    }
    n += 1;
    ga += m.goalsAgainst;
    sa += m.shotsAgainst;
    const att = goals.att.get(m.opponent);
    ega += att === undefined ? m.goalsAgainst : (goals.mu * att) / venueFactor(m.venue, goals.home);
  }
  return { slug, matches: n, goalsAgainst: ga, shotsFaced: sa, expected: ega };
}
