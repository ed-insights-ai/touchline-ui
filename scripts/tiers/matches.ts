// ALGORITHM.md section 1 (version 2.2): one record per physical match.
//
// A match between two collected programmes is published twice, once in each
// conference's file. The copies are first folded by the site's own fold,
// `foldToMatches` in src/lib/division.ts (the resolution the match page reaches
// through `divisionMatchOf`), after each record's sides are read the way the
// match page reads them (`canonicalFixture` in src/lib/postseason.ts, which
// strips a ranking from a slug like "21-mckendree"). The fold groups by date
// and the unordered pair of slugs and keeps the home side's conference's
// record. Exhibitions, forfeits and matches not final are dropped, and [v2] so
// is a fixture with no box score in any copy: it is not a record.
//
// [v2.1, v2.2] One match a day, on top of that fold: two records of one date
// are copies of one match when they share a programme slug and give the same
// score for both sides, even when they name the other side by different
// slugs ("concordia" on one site, "concordia-irvine" on the other's). The
// score test matters: three slugs (queens, dominican, maryville) each name two
// programmes. Copies form clusters (a record joins a cluster when it is a copy
// of any record in it), and each cluster is one record. The other side's slug
// is the one in the copy that side's own site published (the slug inside the
// record id, `sidearm:<slug>:<n>`) when exactly one copy in the cluster is its
// own; otherwise the kept copy's. The copies are rewritten to that slug and
// folded again by the site's fold, which then picks the kept copy and reads
// any disagreement as it always does.
//
// Which copy each figure is then read from (the score, the shot totals, each
// side's lines, home, away and neutral) is decided per record by the
// reconciliation rulings in sides.ts, not by the kept copy. A record is
// dropped as an exhibition or a forfeit when any of its final copies is
// marked so (R-C), and it needs a box score in some final copy that its team
// names or home_index orient.
//
// A cluster whose records share no one slug (a chain: A and B share one
// programme, B and C another) names no single "other side"; the contract does
// not say how to rewrite it. None occurs in the data home at this freeze; if
// one did, its records would stand unmerged and the build log would list it.

import type { Season } from "../../src/lib/derive.ts";
import { isExhibition, matchIdentity } from "../../src/lib/derive.ts";
import {
  allSightings,
  type DivisionMatch,
  foldToMatches,
  type Sighting,
} from "../../src/lib/division.ts";
import {
  type Fixture,
  type FixturesFile,
  isForfeit,
  type MatchDetail,
  type MatchesFile,
  type RostersFile,
  type StatsFile,
} from "../../src/lib/model.ts";
import { NameBook } from "../../src/lib/names.ts";
import { canonicalFixture, knownProgrammes } from "../../src/lib/postseason.ts";
import {
  homeRow,
  programmeTokens,
  publisherOf,
  type Resolution,
  resolveSides,
  type SideSource,
} from "./sides.ts";

export { publisherOf };

/** One conference's four files for one season and gender. */
export interface ConferenceSeason {
  key: string;
  fixtures: FixturesFile;
  rosters: RostersFile | null;
  stats: StatsFile | null;
  matches: MatchesFile | null;
}

/** One record: a final, countable physical match with a box score. */
export interface PhysicalMatch {
  season: number;
  identity: string;
  date: string;
  /** Home, away and neutral by R-D (sides.ts). */
  home: string;
  away: string;
  neutral: boolean;
  venueBy: Resolution["venueBy"];
  /** The copies print different finals; R-B's copy's score is used. */
  disputed: boolean;
  homeGoals: number | null;
  awayGoals: number | null;
  /** Team shot totals by R-B, both from one copy; null when no copy has both. */
  homeShots: number | null;
  awayShots: number | null;
  /** Each side's lines (and the penalty plays credited to them) by R-A; null
   *  when no copy carries a box score for that side. */
  homeSide: SideSource | null;
  awaySide: SideSource | null;
  /** The kept copy's box score, else another copy's: read only for the
   *  section 11 play-by-play counts. */
  detail: MatchDetail;
  /** Records one match a day merged into this one (0 when none). */
  merged: number;
  /** The kept copy has no box score (another copy's is `detail`). */
  boxFromOtherCopy: boolean;
}

/** One merge of the one-match-a-day rule. */
export interface DayMerge {
  date: string;
  /** The programme every merged copy names. */
  shared: string;
  /** The other side's slug, as kept. */
  other: string;
  /** Where that slug came from: the one copy the other side's own site
   *  published, or the kept copy (none or more than one such copy). */
  from: "own" | "kept";
  /** The slugs the other copies gave the other side, rewritten to `other`. */
  aliases: string[];
  records: number;
}

export interface FoldCounts {
  sightings: number;
  physical: number;
  exhibitions: number;
  forfeits: number;
  unplayed: number;
  /** Final fixtures with no box score in any copy: not records. */
  noBoxScore: number;
  disputed: number;
  records: number;
  unoriented: number;
  boxFromOtherCopy: number;
  /** Matches the site's fold refuses when no copy is a final. */
  refused: string[];
  merges: DayMerge[];
  /** Clusters the rule could not rewrite (no one shared slug, or the site's
   *  fold refused the copies), kept unmerged. */
  illDefined: string[];
}

/** A site Season around one conference's files: just what the fold reads. */
export function seasonOf(c: ConferenceSeason): Season {
  return {
    key: c.key,
    fixtures: c.fixtures,
    rosters: c.rosters,
    stats: c.stats,
    matches: c.matches,
    coverage: null,
    names: new NameBook(
      [c.fixtures],
      [],
      c.fixtures.programmes.map((p) => p.slug),
    ),
    asOf: c.fixtures.collected_at.slice(0, 10),
    collectedAt: c.fixtures.collected_at,
  };
}

/**
 * The site's fold, one identity group at a time, so one refused group stands
 * aside instead of stopping the season. The fold throws when a match's copies
 * disagree on its score or status in a way it will not read (2024-09-12
 * Flagler v Florida Tech, women: postponed in one file, postponed "2-2" in
 * the other). When no copy is a final it was not played either way, and it is
 * set aside; a refusal that involves a final still stops the build.
 */
export function foldEach(sightings: readonly Sighting[]): {
  folded: DivisionMatch[];
  refused: string[];
} {
  const groups = new Map<string, Sighting[]>();
  for (const s of sightings) {
    const id = matchIdentity(s.fixture);
    const g = groups.get(id);
    if (g) g.push(s);
    else groups.set(id, [s]);
  }
  const folded: DivisionMatch[] = [];
  const refused: string[] = [];
  for (const [id, group] of groups) {
    try {
      folded.push(...foldToMatches(group));
    } catch (err) {
      if (group.some((s) => s.fixture.status === "final")) throw err;
      refused.push(id);
    }
  }
  return { folded, refused };
}

const boxOf = (s: Sighting): MatchDetail | null => s.season.matches?.matches[s.fixture.id] ?? null;

const sidesOf = (m: DivisionMatch): [string, string] => [m.fixture.home, m.fixture.away];

/** A shared slug's goals and the other side's, from one match's kept copy. */
function scoreFrom(m: DivisionMatch, shared: string): string {
  const f = m.fixture;
  return f.home === shared ? `${f.home_score}-${f.away_score}` : `${f.away_score}-${f.home_score}`;
}

/** [v2.2] Whether two records are copies of one match: the same date, one
 *  programme slug in common, and the same score for both sides. The shared
 *  slug, or null. (Records with both slugs in common are one record already:
 *  the site's fold groups by the pair.) */
export function copySlug(x: DivisionMatch, y: DivisionMatch): string | null {
  if (x.fixture.date !== y.fixture.date) return null;
  const common = sidesOf(x).filter((slug) => sidesOf(y).includes(slug));
  if (common.length !== 1) return null;
  const shared = common[0] as string;
  return scoreFrom(x, shared) === scoreFrom(y, shared) ? shared : null;
}

/** A copy with the other side's slug rewritten. */
function rewrite(f: Fixture, shared: string, other: string): Fixture {
  if (f.home === shared && f.away !== other) return { ...f, away: other };
  if (f.away === shared && f.home !== other) return { ...f, home: other };
  return f;
}

const otherOf = (f: Fixture, shared: string): string => (f.home === shared ? f.away : f.home);

/** The site's fold over every copy of a cluster, the other side rewritten to
 *  `other`; null when it does not come to one match. */
function foldCluster(
  ms: readonly DivisionMatch[],
  shared: string,
  other: string,
): DivisionMatch | null {
  const copies = ms.flatMap((m) =>
    m.sightings.map((s) => ({ ...s, fixture: rewrite(s.fixture, shared, other) })),
  );
  try {
    const folded = foldToMatches(copies);
    return folded.length === 1 ? (folded[0] as DivisionMatch) : null;
  } catch {
    return null;
  }
}

/** The other side's slug for a cluster around `shared`: the one copy its own
 *  site published, when exactly one copy is its own; otherwise the kept
 *  copy's. The kept copy is the site fold's choice once the slugs agree, so
 *  it is found as the candidate slug whose fold keeps a copy that printed
 *  that slug (the first such, in record order); failing that, the slug the
 *  first fold's kept copy printed. */
export function otherSide(
  ms: readonly DivisionMatch[],
  shared: string,
): { other: string; from: "own" | "kept" } | null {
  const sightings = ms.flatMap((m) => m.sightings);
  const own = sightings.filter((s) => publisherOf(s.fixture.id) === otherOf(s.fixture, shared));
  if (own.length === 1)
    return { other: otherOf((own[0] as Sighting).fixture, shared), from: "own" };
  const printed = new Map(sightings.map((s) => [s.fixture.id, otherOf(s.fixture, shared)]));
  const candidates = [...new Set(ms.map((m) => otherOf(m.fixture, shared)))];
  let fallback: string | null = null;
  for (const c of candidates) {
    const kept = foldCluster(ms, shared, c);
    if (!kept) continue;
    const slug = printed.get(kept.fixture.id) ?? null;
    if (slug === c) return { other: c, from: "kept" };
    fallback ??= slug;
  }
  return fallback === null ? null : { other: fallback, from: "kept" };
}

/**
 * One match a day over records (final, countable, with a box score): each
 * cluster of copies, re-folded by the site's fold, in place of its records.
 */
export function oneMatchADay(
  records: readonly DivisionMatch[],
  counts: Pick<FoldCounts, "merges" | "illDefined">,
  absorbed: Map<DivisionMatch, number> = new Map(),
): DivisionMatch[] {
  const parent = records.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] as number;
    return i;
  };
  // Candidate pairs share a date and a slug.
  const at = new Map<string, number[]>();
  records.forEach((m, i) => {
    for (const slug of sidesOf(m)) {
      const k = `${m.fixture.date} ${slug}`;
      const list = at.get(k);
      if (list) list.push(i);
      else at.set(k, [i]);
    }
  });
  for (const list of at.values()) {
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        const i = list[a] as number;
        const j = list[b] as number;
        if (copySlug(records[i] as DivisionMatch, records[j] as DivisionMatch) === null) continue;
        const ri = find(i);
        const rj = find(j);
        if (ri !== rj) parent[Math.max(ri, rj)] = Math.min(ri, rj);
      }
    }
  }
  const clusters = new Map<number, number[]>();
  records.forEach((_, i) => {
    const r = find(i);
    const c = clusters.get(r);
    if (c) c.push(i);
    else clusters.set(r, [i]);
  });

  const describe = (ms: readonly DivisionMatch[]) =>
    ms
      .map(
        (m) =>
          `${m.fixture.home} ${m.fixture.home_score}-${m.fixture.away_score} ${m.fixture.away} (${m.sightings.map((s) => publisherOf(s.fixture.id)).join(", ")})`,
      )
      .join("; ");
  const out: DivisionMatch[] = [];
  for (const idx of clusters.values()) {
    const ms = idx.map((i) => records[i] as DivisionMatch);
    if (ms.length === 1) {
      out.push(ms[0] as DivisionMatch);
      continue;
    }
    const [first, ...rest] = ms as [DivisionMatch, ...DivisionMatch[]];
    const common = sidesOf(first).filter((slug) => rest.every((m) => sidesOf(m).includes(slug)));
    const shared = common.length === 1 ? (common[0] as string) : null;
    const side = shared === null ? null : otherSide(ms, shared);
    const merged = shared && side ? foldCluster(ms, shared, side.other) : null;
    if (!shared || !side || !merged) {
      out.push(...ms);
      counts.illDefined.push(`${first.fixture.date}: ${describe(ms)}`);
      continue;
    }
    out.push(merged);
    absorbed.set(merged, ms.length - 1);
    counts.merges.push({
      date: first.fixture.date,
      shared,
      other: side.other,
      from: side.from,
      aliases: [...new Set(ms.map((m) => otherOf(m.fixture, shared)))].filter(
        (slug) => slug !== side.other,
      ),
      records: ms.length,
    });
  }
  return out;
}

/** The kept copy's box score, else the first other copy's: read only for the
 *  section 11 counts of the play-by-play. */
function keptBox(m: DivisionMatch): { detail: MatchDetail; other: boolean } | null {
  const own = m.season.matches?.matches[m.fixture.id] ?? null;
  if (own) return { detail: own, other: false };
  const s = m.sightings.find((x) => boxOf(x) !== null);
  return s ? { detail: boxOf(s) as MatchDetail, other: true } : null;
}

/** Every record of one season and gender, in date order. */
export function physicalMatches(
  season: number,
  conferences: readonly ConferenceSeason[],
): { matches: PhysicalMatch[]; counts: FoldCounts } {
  const seasons = conferences.map(seasonOf);
  const known = knownProgrammes(seasons);
  const sightings = allSightings(seasons).map((s) => {
    const fixture = canonicalFixture(s.fixture, known);
    return fixture === s.fixture ? s : { ...s, fixture };
  });
  const { folded, refused } = foldEach(sightings);
  const counts: FoldCounts = {
    sightings: sightings.length,
    physical: folded.length + refused.length,
    exhibitions: 0,
    forfeits: 0,
    unplayed: refused.length,
    noBoxScore: 0,
    disputed: 0,
    records: 0,
    unoriented: 0,
    boxFromOtherCopy: 0,
    refused,
    merges: [],
    illDefined: [],
  };
  // Each box copy's home row, read on the copy as published (before any
  // one-match-a-day rename): by the team names, else by home_index.
  const tokens = programmeTokens(conferences.flatMap((c) => c.fixtures.programmes));
  const rows = new Map<string, 0 | 1 | null>();
  for (const s of sightings) {
    const detail = boxOf(s);
    if (detail) rows.set(s.fixture.id, homeRow(s.fixture, detail, tokens));
  }
  const rowOf = (s: Sighting): 0 | 1 | null => rows.get(s.fixture.id) ?? null;
  const finals = (m: DivisionMatch) => m.sightings.filter((s) => s.fixture.status === "final");

  const records: DivisionMatch[] = [];
  for (const m of folded) {
    const f = m.fixture;
    // R-C: an exhibition or a forfeit as any final copy marks it.
    if (finals(m).some((s) => isExhibition(s.fixture))) counts.exhibitions++;
    else if (finals(m).some((s) => isForfeit(s.fixture))) counts.forfeits++;
    else if (f.status !== "final") counts.unplayed++;
    else if (!finals(m).some((s) => boxOf(s) !== null && rowOf(s) !== null)) counts.noBoxScore++;
    else records.push(m);
  }

  const out: PhysicalMatch[] = [];
  const absorbed = new Map<DivisionMatch, number>();
  for (const m of oneMatchADay(records, counts, absorbed)) {
    const f = m.fixture;
    const box = keptBox(m);
    if (box === null) continue; // unreachable: every record has a box score
    const r = resolveSides(m.sightings, f, m.neutral, boxOf, rowOf);
    if (m.disputed) counts.disputed++;
    if (r.homeSide === null || r.awaySide === null) counts.unoriented++;
    if (box.other) counts.boxFromOtherCopy++;
    counts.records++;
    out.push({
      season,
      identity: m.identity,
      date: f.date,
      home: r.home,
      away: r.away,
      neutral: r.neutral,
      venueBy: r.venueBy,
      disputed: m.disputed,
      homeGoals: r.homeGoals,
      awayGoals: r.awayGoals,
      homeShots: r.homeShots,
      awayShots: r.awayShots,
      homeSide: r.homeSide,
      awaySide: r.awaySide,
      detail: box.detail,
      merged: absorbed.get(m) ?? 0,
      boxFromOtherCopy: box.other,
    });
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || a.identity.localeCompare(b.identity));
  return { matches: out, counts };
}
