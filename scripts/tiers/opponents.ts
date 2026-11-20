// ALGORITHM.md section 2: opponent factors.
//
// One multiplicative model, fitted per gender jointly over every match of the
// five seasons: E[y] = mu × att[team] × dfn[opponent] × h, with h = home for
// the home side, 1/home for the away side and 1 at a neutral site. A team is a
// (season, programme slug) pair; mu and home are shared. The fit is the
// contract's fixed-point iteration, forty passes in its stated order, starting
// from att = dfn = 1, mu = mean(y), home = 1.

export type Venue = "home" | "away" | "neutral";

/** One side of one match: `attack` scored `y` against `defend`. */
export interface ModelRow {
  attack: string;
  defend: string;
  y: number;
  venue: Venue;
}

export interface Factors {
  mu: number;
  home: number;
  att: ReadonlyMap<string, number>;
  dfn: ReadonlyMap<string, number>;
}

export const GOALS_PRIOR = 6.0;
export const SHOTS_PRIOR = 40.0;
export const ITERATIONS = 40;

/** A team as the model knows it: one programme in one season. */
export const teamId = (season: number, slug: string): string => `${season}:${slug}`;

/** The home factor h for a side at a venue. */
export function venueFactor(venue: Venue, home: number): number {
  if (venue === "home") return home;
  if (venue === "away") return 1 / home;
  return 1;
}

/** The venue of the other side of the same match. */
export const otherVenue = (venue: Venue): Venue =>
  venue === "home" ? "away" : venue === "away" ? "home" : "neutral";

/**
 * Fit the model. Rows are summed in the order given, so the same rows in the
 * same order give the same factors to the last bit.
 *
 * Every team named on any row gets both factors; a team with no row in a role
 * keeps (0 + prior) / (0 + prior) = 1 in it. The home step needs at least one
 * home row and one away row; without both it leaves `home` where it is (the
 * contract's formula would divide by zero there).
 */
export function fitFactors(
  rows: readonly ModelRow[],
  prior: number,
  iterations: number = ITERATIONS,
): Factors {
  const teams = new Set<string>();
  for (const r of rows) {
    teams.add(r.attack);
    teams.add(r.defend);
  }
  const att = new Map<string, number>();
  const dfn = new Map<string, number>();
  for (const t of teams) {
    att.set(t, 1);
    dfn.set(t, 1);
  }
  let total = 0;
  for (const r of rows) total += r.y;
  let mu = rows.length > 0 ? total / rows.length : 0;
  let home = 1;
  const a = (t: string): number => att.get(t) as number;
  const d = (t: string): number => dfn.get(t) as number;

  for (let it = 0; it < iterations; it++) {
    // 1. att[i] = (Σ y + prior) / (Σ mu·dfn[opp]·h + prior), rows where i attacks.
    const attNum = new Map<string, number>();
    const attDen = new Map<string, number>();
    for (const r of rows) {
      const h = venueFactor(r.venue, home);
      attNum.set(r.attack, (attNum.get(r.attack) ?? 0) + r.y);
      attDen.set(r.attack, (attDen.get(r.attack) ?? 0) + mu * d(r.defend) * h);
    }
    for (const t of teams) {
      att.set(t, ((attNum.get(t) ?? 0) + prior) / ((attDen.get(t) ?? 0) + prior));
    }

    // 2. dfn[j] = (Σ y + prior) / (Σ mu·att[team]·h + prior), rows where j defends.
    const dfnNum = new Map<string, number>();
    const dfnDen = new Map<string, number>();
    for (const r of rows) {
      const h = venueFactor(r.venue, home);
      dfnNum.set(r.defend, (dfnNum.get(r.defend) ?? 0) + r.y);
      dfnDen.set(r.defend, (dfnDen.get(r.defend) ?? 0) + mu * a(r.attack) * h);
    }
    for (const t of teams) {
      dfn.set(t, ((dfnNum.get(t) ?? 0) + prior) / ((dfnDen.get(t) ?? 0) + prior));
    }

    // 3. home = sqrt((Σ_home y / Σ_home base) / (Σ_away y / Σ_away base)), base = mu·att·dfn.
    let homeY = 0;
    let homeBase = 0;
    let awayY = 0;
    let awayBase = 0;
    for (const r of rows) {
      const base = mu * a(r.attack) * d(r.defend);
      if (r.venue === "home") {
        homeY += r.y;
        homeBase += base;
      } else if (r.venue === "away") {
        awayY += r.y;
        awayBase += base;
      }
    }
    if (homeBase > 0 && awayBase > 0 && awayY > 0) {
      home = Math.sqrt(homeY / homeBase / (awayY / awayBase));
    }

    // 4. mu = Σ y / Σ (att·dfn·h), all rows.
    let den = 0;
    for (const r of rows) den += a(r.attack) * d(r.defend) * venueFactor(r.venue, home);
    if (den > 0) mu = total / den;
  }
  return { mu, home, att, dfn };
}
