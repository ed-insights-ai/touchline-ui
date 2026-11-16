// Section 1, reconciled: which copy of a physical match each figure is read
// from. Contract 2.2 names the kept copy for the score and no copy for the
// box score; the reconciliation with the Python build ruled (R-B to R-D, and
// the orientation rule below; docs/specs/player-tiers/reference/
// RECONCILIATION.md in ed-insights-platform):
//
// - The copies of a match are its FINAL fixture records, box score or not.
// - R-D: home and away are the copies' home slug when they agree. The match is
//   at a neutral site when the copies disagree on the home slug (its sides are
//   then named in slug order), else when the home side's own-site copy (the
//   copy whose record id carries its slug) says `neutral`, else, with no such
//   copy, when any copy does.
// - R-B: the score is the home side's own-site copy's, else the other copy's
//   (record id order). The team shot totals come from the first box copy, the
//   home side's own first, whose two totals are both integers.
// - A box score's two rows are matched to the copy's two slugs by the team
//   names when the names decide (evidence/build.py's affinity, ported below),
//   otherwise by `home_index`. A box score neither orients is not a box score.
//   Four collected copies print a `home_index` their own team names
//   contradict (Lake Erie 2022 twice and 2023, Georgian Court 2026); three
//   print none (Dallas Baptist v UT Dallas 2025 and 2026, Young Harris v
//   Limestone 2024).

import type { Sighting } from "../../src/lib/division.ts";
import type { Fixture, MatchDetail, MatchTeam } from "../../src/lib/model.ts";

// ── Team-name affinity (touchline_forecasting data.py, via evidence/build.py) ─

const STOPWORDS: ReadonlySet<string> = new Set([
  "university",
  "college",
  "of",
  "the",
  "and",
  "at",
  "univ",
]);

const EXPANSIONS: Readonly<Record<string, readonly string[]>> = {
  st: ["state", "saint"],
  ste: ["saint"],
  okla: ["oklahoma"],
  tex: ["texas"],
  tx: ["texas"],
  ut: ["texas"],
  intl: ["international"],
  so: ["southern"],
  sou: ["southern"],
  no: ["northern"],
  nor: ["northern"],
  ft: ["fort"],
  mt: ["mount"],
  colo: ["colorado"],
  csu: ["colorado", "state"],
  ark: ["arkansas"],
  ala: ["alabama"],
  miss: ["mississippi"],
  tenn: ["tennessee"],
  fla: ["florida"],
  kan: ["kansas"],
  mo: ["missouri"],
  neb: ["nebraska"],
  minn: ["minnesota"],
  wis: ["wisconsin"],
  mich: ["michigan"],
  ill: ["illinois"],
  ind: ["indiana"],
  penn: ["pennsylvania"],
  va: ["virginia"],
  w: ["west", "western"],
  e: ["east", "eastern"],
  n: ["north", "northern"],
  s: ["south", "southern"],
  cal: ["california"],
  wash: ["washington"],
  ore: ["oregon"],
  ariz: ["arizona"],
  nm: ["new", "mexico"],
  uah: ["alabama", "huntsville"],
  aum: ["auburn", "montgomery"],
  tamiu: ["texas", "a", "m", "international"],
  wtamu: ["west", "texas", "a", "m"],
  utpb: ["texas", "permian", "basin"],
  uwf: ["west", "florida"],
  snu: ["southern", "nazarene"],
  cbu: ["christian", "brothers"],
  dbu: ["dallas", "baptist"],
};

/** The tokens of a team name: lower case, bracketed text dropped, `&` read
 *  as "and", apostrophes dropped, runs of a-z0-9, each with its expansions,
 *  less the stopwords. */
export function nameTokens(text: string): Set<string> {
  const t = text
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replaceAll("&", " and ")
    .replaceAll("'", "");
  const out = new Set<string>();
  for (const raw of t.match(/[a-z0-9]+/g) ?? []) {
    out.add(raw);
    for (const x of EXPANSIONS[raw] ?? []) out.add(x);
  }
  for (const w of STOPWORDS) out.delete(w);
  return out;
}

/** How well a printed team name fits a programme's tokens: one per shared
 *  token, a half for each other token of four letters or more whose first
 *  four letters open one of the programme's unshared tokens. */
export function nameAffinity(candidates: ReadonlySet<string>, name: string): number {
  const other = nameTokens(name);
  let score = 0;
  const rest: string[] = [];
  for (const c of candidates) {
    if (other.has(c)) score += 1;
    else rest.push(c);
  }
  for (const token of other) {
    if (candidates.has(token)) continue;
    if (token.length >= 4 && rest.some((c) => c.length >= 4 && c.slice(0, 4) === token.slice(0, 4)))
      score += 0.5;
  }
  return score;
}

/** Every programme's name tokens for one season and gender: its slug (dashes
 *  as spaces), name and abbreviation, from every fixtures file. */
export function programmeTokens(
  programmes: readonly { slug: string; name?: string; abbr?: string }[],
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const p of programmes) {
    const set = out.get(p.slug) ?? new Set<string>();
    for (const t of nameTokens(p.slug.replaceAll("-", " "))) set.add(t);
    for (const text of [p.name, p.abbr]) {
      if (text) for (const t of nameTokens(text)) set.add(t);
    }
    out.set(p.slug, set);
  }
  return out;
}

/**
 * The row of a box score that is the copy's home side: by the team names when
 * they decide, else by `home_index`; null when neither does. Read on the copy
 * as published, before any one-match-a-day rename.
 */
export function homeRow(
  fixture: Pick<Fixture, "home" | "away">,
  detail: MatchDetail,
  tokens: ReadonlyMap<string, ReadonlySet<string>>,
): 0 | 1 | null {
  if (detail.teams.length !== 2) return null;
  const of = (slug: string): ReadonlySet<string> => {
    const known = tokens.get(slug);
    return known && known.size > 0 ? known : nameTokens(slug.replaceAll("-", " "));
  };
  const hn = of(fixture.home);
  const an = of(fixture.away);
  const l0 = detail.teams[0]?.name ?? "";
  const l1 = detail.teams[1]?.name ?? "";
  const straight = nameAffinity(hn, l0) + nameAffinity(an, l1);
  const crossed = nameAffinity(hn, l1) + nameAffinity(an, l0);
  if (straight !== crossed) return straight > crossed ? 0 : 1;
  const hi = detail.home_index;
  return hi === 0 || hi === 1 ? hi : null;
}

// ── The copies, and which one each figure comes from ───────────────────────

/** The programme slug inside a record id (`sidearm:<slug>:<n>`): the site
 *  that published that copy. */
export const publisherOf = (fixtureId: string): string => fixtureId.split(":")[1] ?? "";

/** One side's box score: the copy it is read from, and its row there. */
export interface SideSource {
  fixtureId: string;
  detail: MatchDetail;
  row: 0 | 1;
  team: MatchTeam;
  /** The copy is the side's own site's. */
  own: boolean;
}

export interface Resolution {
  home: string;
  away: string;
  neutral: boolean;
  /** How the venue was read. */
  venueBy: "homes-disagree" | "own-copy" | "any-copy" | "kept";
  homeGoals: number | null;
  awayGoals: number | null;
  homeShots: number | null;
  awayShots: number | null;
  /** The copy the shot totals came from; null when no copy has both. */
  shotsFrom: string | null;
  homeSide: SideSource | null;
  awaySide: SideSource | null;
}

/** A box copy: a final copy with a box score its names or home_index orient. */
interface BoxCopy {
  fixture: Fixture;
  detail: MatchDetail;
  /** The row of `fixture.home`. */
  homeRow: 0 | 1;
}

const integer = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x);

/** Copies ordered for a slug: its own site's first, then the rest, each in
 *  record id order. */
function ownFirst<T extends { fixture: Fixture }>(copies: readonly T[], slug: string): T[] {
  return [...copies].sort((a, b) => {
    const ao = publisherOf(a.fixture.id) === slug ? 0 : 1;
    const bo = publisherOf(b.fixture.id) === slug ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return a.fixture.id < b.fixture.id ? -1 : a.fixture.id > b.fixture.id ? 1 : 0;
  });
}

/** A box copy's row for one of its (possibly renamed) slugs. */
function rowFor(c: BoxCopy, slug: string): 0 | 1 | null {
  if (slug === c.fixture.home) return c.homeRow;
  if (slug === c.fixture.away) return c.homeRow === 0 ? 1 : 0;
  return null;
}

/**
 * Resolve one physical match. `sightings` are its copies (one-match-a-day
 * renames applied), `kept` the site fold's kept fixture, `keptNeutral` the
 * fold's neutral flag (used only if the copies cannot be read), `boxOf` a
 * copy's box score and `rowOf` its home row as published (null: no box score,
 * or one that cannot be oriented).
 */
export function resolveSides(
  sightings: readonly Sighting[],
  kept: Fixture,
  keptNeutral: boolean,
  boxOf: (s: Sighting) => MatchDetail | null,
  rowOf: (s: Sighting) => 0 | 1 | null,
): Resolution {
  const seen = new Set<string>();
  const finals = sightings.filter((s) => {
    if (s.fixture.status !== "final" || seen.has(s.fixture.id)) return false;
    seen.add(s.fixture.id);
    return true;
  });
  const pair = [kept.home, kept.away];
  const homes = new Set(finals.map((s) => s.fixture.home));
  let home = kept.home;
  let away = kept.away;
  let neutral = keptNeutral;
  let venueBy: Resolution["venueBy"] = "kept";
  let scoreFrom: Fixture = kept;
  if (finals.length > 0 && [...homes].every((h) => pair.includes(h))) {
    if (homes.size > 1) {
      [home, away] = [...pair].sort() as [string, string];
      neutral = true;
      venueBy = "homes-disagree";
    } else {
      home = [...homes][0] as string;
      away = home === kept.home ? kept.away : kept.home;
      const own = finals.filter((s) => publisherOf(s.fixture.id) === home);
      neutral = (own.length > 0 ? own : finals).some((s) => s.fixture.neutral === true);
      venueBy = own.length > 0 ? "own-copy" : "any-copy";
    }
    scoreFrom = (ownFirst(finals, home)[0] as Sighting).fixture;
  }
  const goalsOf = (slug: string): number | null => {
    const v =
      slug === scoreFrom.home
        ? scoreFrom.home_score
        : slug === scoreFrom.away
          ? scoreFrom.away_score
          : null;
    return integer(v) ? v : null;
  };

  const boxes: BoxCopy[] = [];
  for (const s of finals) {
    const detail = boxOf(s);
    const hr = rowOf(s);
    if (detail && hr !== null) boxes.push({ fixture: s.fixture, detail, homeRow: hr });
  }

  let homeShots: number | null = null;
  let awayShots: number | null = null;
  let shotsFrom: string | null = null;
  for (const c of ownFirst(boxes, home)) {
    const hr = rowFor(c, home);
    const ar = rowFor(c, away);
    if (hr === null || ar === null) continue;
    const hs = c.detail.teams[hr]?.shots;
    const as = c.detail.teams[ar]?.shots;
    if (integer(hs) && integer(as)) {
      homeShots = hs;
      awayShots = as;
      shotsFrom = c.fixture.id;
      break;
    }
  }

  // Each side's lines: the kept copy's box score, else the first other copy
  // with one (the build's reading of 2.2, unchanged here).
  const keptCopy = boxes.find((c) => c.fixture.id === kept.id) ?? boxes[0];
  const sideOf = (slug: string): SideSource | null => {
    if (!keptCopy) return null;
    const row = rowFor(keptCopy, slug);
    const team = row === null ? undefined : keptCopy.detail.teams[row];
    if (row === null || !team) return null;
    return {
      fixtureId: keptCopy.fixture.id,
      detail: keptCopy.detail,
      row,
      team,
      own: publisherOf(keptCopy.fixture.id) === slug,
    };
  };

  return {
    home,
    away,
    neutral,
    venueBy,
    homeGoals: goalsOf(home),
    awayGoals: goalsOf(away),
    homeShots,
    awayShots,
    shotsFrom,
    homeSide: sideOf(home),
    awaySide: sideOf(away),
  };
}
