// The postseason: conference tournaments and the NCAA championship.
//
// The rib stamps each fixture with the stage its schedule page publishes
// (touchline.fixtures/2, contract changelog 2026-11-08). A match between two
// followed programmes is collected twice, so a stage is a fact about ONE
// record; this module folds the records of a match into one tie and decides
// what the tie may claim.
//
// The rules, from the approved design:
//
// - A fact found on one record only is kept: 8 of the 39 2025 NCAA ties
//   appear on one school's schedule. Unknown or missing is absence, never a
//   vote against.
// - A contradiction between records (a phase mismatch, a different
//   competition, a different shootout once oriented) makes the tie disputed:
//   both versions print, it counts nowhere, and no advancement is inferred.
// - Round placement is DERIVED from the match graph, counted back from the
//   latest round collected: each tie is one round before the next tie either
//   side plays. Labels count back from the end (FINAL, SF, QF) only when the
//   round sizes say so; otherwise R1, R2, ...
// - Who went through: the score's winner (outcome, so a forfeit follows the
//   award); level, the collected shootout (OBSERVED); otherwise the one side
//   that appears in the next round (DERIVED); otherwise undetermined.
// - A shootout is a draw in every record. Nothing here touches outcome().

import type { Season } from "./derive.ts";
import { hasScore, matchIdentity } from "./derive.ts";
import { allSightings, type DivisionMatch, foldToMatches } from "./division.ts";
import { type Fixture, type FixtureStage, isPlayed, outcome, type Shootout } from "./model.ts";

export type Phase = FixtureStage["phase"];
export type Competition = NonNullable<FixtureStage["competition"]>;
export type Evidence = "OBSERVED" | "DERIVED";

/** A record's phase. A record with no stage said nothing: unknown. */
export const phaseOf = (f: Fixture): Phase => f.stage?.phase ?? "unknown";

export const isPostseason = (f: Fixture): boolean => f.stage?.phase === "postseason";

export const competitionOf = (f: Fixture): Competition | null =>
  f.stage?.phase === "postseason" ? (f.stage.competition ?? null) : null;

/** A shootout as (winner, winner's count, loser's count): orientation-free. */
type ShootoutFact = { winner: string; won: number; lost: number };

function shootoutFact(f: Fixture): ShootoutFact | null {
  const s = f.shootout;
  if (!s) return null;
  const winnerHome = s.winner === f.home;
  return {
    winner: s.winner,
    won: winnerHome ? s.home : s.away,
    lost: winnerHome ? s.away : s.home,
  };
}

const sameShootout = (a: ShootoutFact, b: ShootoutFact): boolean =>
  a.winner === b.winner && a.won === b.won && a.lost === b.lost;

/** One record's version of a disputed tie, for printing beside the other. */
export interface TieVersion {
  code: string;
  source: string | null;
  phase: Phase;
  competition: Competition | null;
  shootout: Shootout | null;
  published: string | null;
}

export interface Advance {
  slug: string;
  evidence: Evidence;
  /** How it is known: "score", "shootout" or "next round". */
  by: "score" | "shootout" | "next round";
}

/** One match of the postseason, every record of it folded. */
export interface Tie {
  identity: string;
  match: DivisionMatch;
  fixture: Fixture;
  competition: Competition;
  /** The block header as printed, from the record that carries one. */
  source: string | null;
  /** The row's own round label, verbatim, from any record that prints one. */
  roundPublished: string | null;
  /** The shootout, oriented to `fixture`. */
  shootout: Shootout | null;
  /** The result cell as printed, from the record that carries one. */
  resultPublished: string | null;
  /** The score is disputed, or the records contradict on the stage or the
   *  shootout. A disputed tie counts nowhere and infers nothing. */
  disputed: boolean;
  /** Each record's version, only when disputed. */
  versions: TieVersion[];
  /** 1-based round from the match graph, within its tournament; 0 when the
   *  graph could not place it (its chain breaks before the tournament's
   *  latest round). An unplaced tie is listed by its published round, never
   *  joined to a bracket line. */
  round: number;
  /** The short label: R1, R2, R3, QF, SF, FINAL; empty when unplaced. */
  label: string;
  through: Advance | null;
}

/** A tournament: one competition's connected ties. The NCAA is one
 *  tournament from its first round; a conference's is the component of
 *  conference-postseason ties its members played. */
export interface Tournament {
  competition: Competition;
  /** The conference codes of the programmes in it, sorted ("GAC/MIAA" for a
   *  joint tournament). Empty for the NCAA. */
  codes: string[];
  ties: Tie[];
  rounds: number;
  /** The final, once the tournament has one with a decided side. */
  champion: Advance | null;
  final: Tie | null;
}

function versionOf(sightingCode: string, f: Fixture): TieVersion {
  return {
    code: sightingCode,
    source: f.stage?.source ?? null,
    phase: phaseOf(f),
    competition: competitionOf(f),
    shootout: f.shootout ?? null,
    published: f.result_published ?? null,
  };
}

/** Fold one match's records into a tie, or null when no record calls it a
 *  postseason match. */
export function tieOf(match: DivisionMatch): Omit<Tie, "round" | "label" | "through"> | null {
  const records = match.sightings.map((s) => s.fixture);
  const spoken = records.filter((f) => f.stage && f.stage.phase !== "unknown");
  const post = spoken.filter(isPostseason);
  if (post.length === 0) return null;
  const phases = new Set(spoken.map(phaseOf));
  const competitions = new Set(post.map(competitionOf).filter((c) => c !== null));
  const facts = records.map(shootoutFact).filter((s): s is ShootoutFact => s !== null);
  const shootoutsAgree = facts.every((s) => facts[0] !== undefined && sameShootout(s, facts[0]));
  const contradiction = phases.size > 1 || competitions.size > 1 || !shootoutsAgree;
  const disputed = match.disputed || contradiction;
  const competition = (post.map(competitionOf).find((c) => c !== null) ?? "ncaa") as Competition;
  const fixture = match.fixture;
  const fact = !disputed ? (facts[0] ?? null) : null;
  const shootout: Shootout | null = fact
    ? {
        winner: fact.winner,
        home: fact.winner === fixture.home ? fact.won : fact.lost,
        away: fact.winner === fixture.home ? fact.lost : fact.won,
      }
    : null;
  return {
    identity: match.identity,
    match,
    fixture,
    competition,
    source: post.find((f) => f.stage?.source)?.stage?.source ?? null,
    roundPublished: post.find((f) => f.stage?.round_published)?.stage?.round_published ?? null,
    shootout,
    resultPublished: records.find((f) => f.result_published)?.result_published ?? null,
    disputed,
    versions: disputed ? match.sightings.map((s) => versionOf(s.code, s.fixture)) : [],
  };
}

const sides = (t: { fixture: Fixture }): [string, string] => [t.fixture.home, t.fixture.away];

const byDate = (a: { fixture: Fixture }, b: { fixture: Fixture }): number =>
  a.fixture.date.localeCompare(b.fixture.date) ||
  (a.fixture.time ?? "99:99").localeCompare(b.fixture.time ?? "99:99") ||
  matchIdentity(a.fixture).localeCompare(matchIdentity(b.fixture));

/** The label for round `round` of `rounds`, given each round's size. A
 *  round is named from the end only when its size says so: the last round
 *  a single tie, the one before it two, the one before that four. */
function labelFor(round: number, rounds: number, sizes: Map<number, number>): string {
  const fromEnd = rounds - round;
  const expected = 2 ** fromEnd;
  const chain = Array.from({ length: fromEnd + 1 }, (_, i) => rounds - i).every(
    (r) => sizes.get(r) === 2 ** (rounds - r),
  );
  if (chain && expected <= 4) return (["FINAL", "SF", "QF"] as const)[fromEnd] as string;
  return `R${round}`;
}

/** Who went through a decided tie. `next` is the sides of the next tie either
 *  side played. */
function advanceOf(t: Omit<Tie, "through">, next: ReadonlySet<string>): Advance | null {
  if (t.disputed) return null;
  const f = t.fixture;
  if (isPlayed(f) && hasScore(f)) {
    const went = outcome(f);
    if (went === "home" || went === "away") {
      return { slug: went === "home" ? f.home : f.away, evidence: "OBSERVED", by: "score" };
    }
    if (t.shootout) return { slug: t.shootout.winner, evidence: "OBSERVED", by: "shootout" };
  }
  const onward = sides(t).filter((slug) => next.has(slug));
  if (onward.length === 1 && onward[0]) {
    return { slug: onward[0], evidence: "DERIVED", by: "next round" };
  }
  return null;
}

function place(
  competition: Competition,
  folded: Omit<Tie, "round" | "label" | "through">[],
  codes: string[],
): Tournament {
  const sorted = [...folded].sort(byDate);
  // Each tie's successor: the next tie either side plays. In a knockout the
  // winner plays on and the loser does not, so the chain of successors runs
  // to the final, or, while the tournament is under way, to the latest round
  // collected. Counting rounds back from that end is what places a second
  // round tie between two first-round byes: counted forward from the first
  // round it would read as a first-round tie (2025: eight such ties).
  const successor = new Map<string, (typeof sorted)[number]>();
  sorted.forEach((t, i) => {
    const later = sorted.slice(i + 1).find((x) => sides(x).some((slug) => sides(t).includes(slug)));
    if (later) successor.set(t.identity, later);
  });
  // A tie with no successor ends a chain. It is the tournament's frontier
  // when it is dated within two days of the tournament's latest tie (a
  // round is a weekend at most); otherwise its chain is broken (a winner
  // whose next tie no record collected: Wilmington 2025, whose CACC
  // semifinal sits on two PrestoSports pages with no stage), and it and
  // every tie behind it are unplaced rather than counted from a false end.
  const latestDay = Math.max(...sorted.map((t) => Date.parse(t.fixture.date)));
  const frontier = (t: (typeof sorted)[number]): boolean =>
    latestDay - Date.parse(t.fixture.date) <= 2 * 86_400_000;
  const depth = new Map<string, number | null>();
  for (const t of [...sorted].reverse()) {
    const next = successor.get(t.identity);
    if (next) {
      const after = depth.get(next.identity);
      depth.set(t.identity, after === null || after === undefined ? null : after + 1);
    } else {
      depth.set(t.identity, frontier(t) ? 0 : null);
    }
  }
  const placedDepths = [...depth.values()].filter((d): d is number => d !== null);
  const rounds = placedDepths.length === 0 ? 0 : Math.max(...placedDepths) + 1;
  const rounded = sorted.map((t) => {
    const d = depth.get(t.identity);
    return { ...t, round: d === null || d === undefined ? 0 : rounds - d };
  });
  const sizes = new Map<number, number>();
  for (const t of rounded) if (t.round > 0) sizes.set(t.round, (sizes.get(t.round) ?? 0) + 1);
  const ties: Tie[] = rounded.map((t) => {
    const withLabel = { ...t, label: t.round > 0 ? labelFor(t.round, rounds, sizes) : "" };
    const next = successor.get(t.identity);
    const onward = new Set(next ? sides(next) : []);
    return { ...withLabel, through: advanceOf(withLabel, onward) };
  });
  const finals = ties.filter((t) => t.label === "FINAL");
  const final = finals.length === 1 ? (finals[0] as Tie) : null;
  return {
    competition,
    codes,
    ties,
    rounds,
    final,
    champion: final?.through ?? null,
  };
}

/** Group conference ties into tournaments: connected by a shared side. */
function components<T extends { fixture: Fixture }>(ties: readonly T[]): T[][] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root) as string;
    parent.set(x, root);
    return root;
  };
  for (const t of ties) for (const slug of sides(t)) if (!parent.has(slug)) parent.set(slug, slug);
  for (const t of ties) {
    const [a, b] = sides(t);
    parent.set(find(a), find(b));
  }
  const groups = new Map<string, T[]>();
  for (const t of ties) {
    const root = find(t.fixture.home);
    const group = groups.get(root) ?? [];
    group.push(t);
    groups.set(root, group);
  }
  return [...groups.values()];
}

export interface Postseason {
  ncaa: Tournament;
  conference: Tournament[];
  /** Every tie by match identity. */
  byIdentity: Map<string, Tie>;
  /** Each tournament a tie belongs to, by identity. */
  tournamentOf: Map<string, Tournament>;
  /** Each followed programme's conference code, by slug. */
  conferenceOf: Map<string, string>;
}

/** The whole postseason across the given seasons (every configured
 *  conference's file), folded. */
export function postseasonOf(seasons: readonly Season[]): Postseason {
  const folded = foldToMatches(allSightings(seasons))
    .map(tieOf)
    .filter((t): t is NonNullable<ReturnType<typeof tieOf>> => t !== null);
  const ncaa = place(
    "ncaa",
    folded.filter((t) => t.competition === "ncaa"),
    [],
  );
  const conferenceOf = new Map<string, string>();
  for (const s of seasons) {
    for (const p of s.fixtures.programmes) conferenceOf.set(p.slug, p.conference);
  }
  // A conference's tournament is one tournament even where a missing record
  // splits its graph in two: components that share a conference merge. A
  // joint tournament (GAC/MIAA 2026) is one because its ties connect.
  const codesOf = (group: readonly { fixture: Fixture }[]): Set<string> =>
    new Set(
      group
        .flatMap((t) => sides(t).map((slug) => conferenceOf.get(slug)))
        .filter((c): c is string => typeof c === "string"),
    );
  const merged: { ties: (typeof folded)[number][]; codes: Set<string> }[] = [];
  for (const group of components(folded.filter((t) => t.competition === "conference"))) {
    const codes = codesOf(group);
    const into = merged.find((m) => [...codes].some((c) => m.codes.has(c)));
    if (into) {
      into.ties.push(...group);
      for (const c of codes) into.codes.add(c);
    } else merged.push({ ties: [...group], codes });
  }
  const conference = merged.map((m) => place("conference", m.ties, [...m.codes].sort()));
  const byIdentity = new Map<string, Tie>();
  const tournamentOf = new Map<string, Tournament>();
  for (const tournament of [ncaa, ...conference]) {
    for (const t of tournament.ties) {
      byIdentity.set(t.identity, t);
      tournamentOf.set(t.identity, tournament);
    }
  }
  return { ncaa, conference, byIdentity, tournamentOf, conferenceOf };
}

/** The tag a ledger row wears in its conference-code cell: "GAC FINAL",
 *  "NCAA R2". Null for a match that is not a postseason tie. */
export function stageTag(
  p: Postseason,
  identity: string,
): { text: string; competition: Competition } | null {
  const t = p.byIdentity.get(identity);
  const tournament = p.tournamentOf.get(identity);
  if (!t || !tournament) return null;
  const owner = t.competition === "ncaa" ? "NCAA" : tournament.codes.join("/") || "CONF";
  return { text: `${owner} ${t.label}`, competition: t.competition };
}

/** A programme's season split by phase. Unknown matches count in the overall
 *  record and in neither split; they are named so a surface can say so. */
export interface Split {
  regular: { won: number; drawn: number; lost: number };
  conference: { won: number; drawn: number; lost: number };
  ncaa: { won: number; drawn: number; lost: number };
  unknown: number;
}

export function splitOf(results: readonly { fixture: Fixture; result: "W" | "D" | "L" }[]): Split {
  const empty = () => ({ won: 0, drawn: 0, lost: 0 });
  const split: Split = { regular: empty(), conference: empty(), ncaa: empty(), unknown: 0 };
  for (const r of results) {
    const phase = phaseOf(r.fixture);
    const bucket =
      phase === "regular"
        ? split.regular
        : phase === "postseason"
          ? competitionOf(r.fixture) === "conference"
            ? split.conference
            : competitionOf(r.fixture) === "ncaa"
              ? split.ncaa
              : null
          : null;
    if (!bucket) {
      split.unknown++;
      continue;
    }
    if (r.result === "W") bucket.won++;
    else if (r.result === "L") bucket.lost++;
    else bucket.drawn++;
  }
  return split;
}

/** The QF regions of an NCAA bracket, ordered by the semifinal pairings.
 *  Each region is the QF tie and every tie behind it. */
export interface BracketRegion {
  quarterfinal: Tie;
  ties: Tie[];
}

export function regionsOf(t: Tournament): BracketRegion[] {
  const qfs = t.ties.filter((x) => x.label === "QF");
  if (qfs.length === 0) return [];
  const latestBefore = (slug: string, round: number): Tie | null =>
    t.ties
      .filter((x) => x.round === round - 1 && sides(x).includes(slug))
      .sort(byDate)
      .at(-1) ?? null;
  const subtree = (tie: Tie, into: Tie[]): Tie[] => {
    into.push(tie);
    for (const slug of sides(tie)) {
      const prev = latestBefore(slug, tie.round);
      if (prev && !into.includes(prev)) subtree(prev, into);
    }
    return into;
  };
  const regions = qfs.map((qf) => ({ quarterfinal: qf, ties: subtree(qf, []).sort(byDate) }));
  const sfs = t.ties.filter((x) => x.label === "SF").sort(byDate);
  const order: BracketRegion[] = [];
  for (const sf of sfs) {
    for (const slug of sides(sf)) {
      const region = regions.find((r) => sides(r.quarterfinal).includes(slug));
      if (region && !order.includes(region)) order.push(region);
    }
  }
  for (const r of regions) if (!order.includes(r)) order.push(r);
  return order;
}

/** Every slug that has a tie in the tournament. */
export const participantsOf = (t: Tournament): Set<string> =>
  new Set(t.ties.flatMap((x) => sides(x)));

/** One tie's place on a region's grid. */
export interface Cell {
  tie: Tie;
  /** 1-based column: the region's earliest round is column 1. */
  col: number;
  /** 1-based grid row and span: a tie spans the rows of every tie behind it. */
  row: number;
  span: number;
  /** A line runs right to the tie it fed. `direct` when that tie is fed by
   *  this one alone (its other side had a bye), so the line runs straight. */
  feeds: boolean;
  direct: boolean;
  /** Where the joining rule meets the two feeding ties, as fractions of this
   *  tie's span; null when fewer than two ties feed it. */
  joins: { top: number; bottom: number } | null;
}

/** Lay a region out as a bracket: the quarterfinal on the right, each tie
 *  centred on the ties that fed it. Byes leave a side with no tie behind it,
 *  so subtrees are measured, never assumed to be two of everything. */
export function layoutRegion(region: BracketRegion): { cells: Cell[]; cols: number; rows: number } {
  const inRegion = new Set(region.ties);
  const feeders = (t: Tie): Tie[] =>
    sides(t).flatMap((slug) => {
      const prev = region.ties
        .filter((x) => x.round === t.round - 1 && sides(x).includes(slug))
        .sort(byDate)
        .at(-1);
      return prev && inRegion.has(prev) ? [prev] : [];
    });
  const leaves = new Map<string, number>();
  const leavesOf = (t: Tie): number => {
    const known = leaves.get(t.identity);
    if (known !== undefined) return known;
    const kids = feeders(t);
    const n = kids.length === 0 ? 1 : kids.reduce((sum, k) => sum + leavesOf(k), 0);
    leaves.set(t.identity, n);
    return n;
  };
  const first = Math.min(...region.ties.map((t) => t.round));
  const cells: Cell[] = [];
  const place = (t: Tie, row: number, parentFeeders: number): void => {
    const span = leavesOf(t);
    const kids = feeders(t);
    let joins: Cell["joins"] = null;
    if (kids.length === 2) {
      const a = leavesOf(kids[0] as Tie);
      const b = leavesOf(kids[1] as Tie);
      joins = { top: a / 2 / span, bottom: (a + b / 2) / span };
    }
    cells.push({
      tie: t,
      col: t.round - first + 1,
      row,
      span,
      feeds: t !== region.quarterfinal,
      direct: parentFeeders === 1,
      joins,
    });
    let at = row;
    for (const k of kids) {
      place(k, at, kids.length);
      at += leavesOf(k);
    }
  };
  place(region.quarterfinal, 1, 0);
  return {
    cells,
    cols: region.quarterfinal.round - first + 1,
    rows: leavesOf(region.quarterfinal),
  };
}

/** A tie's stable anchor: deep-linkable, and the same on every build. */
export const tieAnchor = (t: Tie): string =>
  `tie-${t.fixture.date}-${[t.fixture.home, t.fixture.away].sort().join("-")}`;

/** Whether the season has any postseason tie collected yet. */
export const hasPostseason = (p: Postseason): boolean => p.byIdentity.size > 0;
