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
//   round sizes say so, or when a confirmed shape does (a full round the
//   results have closed, halving to the final; see shapeOf); otherwise R1,
//   R2, ...
// - Who went through: the score's winner (outcome, so a forfeit follows the
//   award); level, the collected shootout (OBSERVED); otherwise the one side
//   that appears in the next round (DERIVED); otherwise undetermined.
// - A shootout is a draw in every record. Nothing here touches outcome().

import type { Season } from "./derive.ts";
import { hasScore, matchIdentity, memberSlugs } from "./derive.ts";
import { allSightings, type DivisionMatch, foldToMatches, type Sighting } from "./division.ts";
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
  /** The final's winner, named only where a record says who won: the score,
   *  or a collected shootout. A final drawn with no shootout collected, or a
   *  disputed one, is decided and still names no champion. */
  champion: Advance | null;
  final: Tie | null;
  /** The final is played: marked final with a published score. The
   *  tournament is over whether or not any record names who won it, so this,
   *  never `champion`, is what "decided" means on every surface. */
  decided: boolean;
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
  //
  // A successor is on a LATER day: no side plays two rounds in one day, so
  // two ties a side has on one date are two records of one match the fold
  // could not join (one schedule naming the opponent differently: 2026
  // women's CCAA "concordia" beside PacWest's "concordia-irvine"), never one
  // round and the next. Chained, they would push every round behind them one
  // round higher.
  const successor = new Map<string, (typeof sorted)[number]>();
  sorted.forEach((t, i) => {
    const later = sorted
      .slice(i + 1)
      .find(
        (x) => x.fixture.date > t.fixture.date && sides(x).some((slug) => sides(t).includes(slug)),
      );
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
  // A confirmed shape names a round before the final is collected: the
  // quarterfinals are QF the week they are played, not "R4" until the final
  // joins them. Otherwise rounds are named from the end only when the sizes
  // already collected say so.
  const shape = shapeFrom(rounded);
  const labelOf = (round: number): string =>
    shape?.confirmed ? labelAt(round, shape.rounds) : labelFor(round, rounds, sizes);
  const ties: Tie[] = rounded.map((t) => {
    const withLabel = { ...t, label: t.round > 0 ? labelOf(t.round) : "" };
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
    decided: final !== null && isPlayed(final.fixture) && hasScore(final.fixture),
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

/** A slug as the postseason knows it. A few schedules print an opponent with
 *  its national ranking in front ("#21 McKendree"), and the collector slugs
 *  that as "21-mckendree" (2026 women's GLIAC: Wayne State's NCAA ties). Read
 *  raw, that is a programme no other record names: a phantom in the field, a
 *  match counted twice, and every round behind it labelled one too high. The
 *  ranking is stripped only where it is unambiguous: the slug is not itself a
 *  known programme and what follows the number is. Anything else stays as
 *  published ("402-development-academy" is an opponent's own name). */
export function canonicalSlug(slug: string, known: ReadonlySet<string>): string {
  if (known.has(slug)) return slug;
  const rest = /^\d+-(.+)$/.exec(slug)?.[1];
  return rest !== undefined && known.has(rest) ? rest : slug;
}

/** A record with its sides (and its shootout's winner) as canonicalSlug reads
 *  them; the record itself when nothing changes. The data home is never
 *  touched: this is a reading, made where the postseason folds. */
export function canonicalFixture(f: Fixture, known: ReadonlySet<string>): Fixture {
  const home = canonicalSlug(f.home, known);
  const away = canonicalSlug(f.away, known);
  if (home === f.home && away === f.away) return f;
  const shootout = f.shootout
    ? { ...f.shootout, winner: canonicalSlug(f.shootout.winner, known) }
    : f.shootout;
  return { ...f, home, away, ...(shootout ? { shootout } : {}) };
}

/** Every programme the given seasons' files name as a member. */
export const knownProgrammes = (seasons: readonly Season[]): Set<string> =>
  new Set(seasons.flatMap((s) => s.fixtures.programmes.map((p) => p.slug)));

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

/** A map that also answers to a record's raw identity where canonicalSlug
 *  changed it ("2026-11-13 21-mckendree v wayne-state" finds the tie of
 *  "2026-11-13 mckendree v wayne-state"). Lookups resolve the alias;
 *  iteration and size see each tie once. */
class AliasedMap<V> extends Map<string, V> {
  private readonly aliases: ReadonlyMap<string, string>;
  constructor(entries: Map<string, V>, aliases: ReadonlyMap<string, string>) {
    super(entries);
    this.aliases = aliases;
  }
  override get(key: string): V | undefined {
    return super.get(key) ?? super.get(this.aliases.get(key) ?? key);
  }
  override has(key: string): boolean {
    return super.has(key) || super.has(this.aliases.get(key) ?? key);
  }
}

/** The whole postseason across the given seasons (every configured
 *  conference's file), folded. */
export function postseasonOf(seasons: readonly Season[]): Postseason {
  const known = knownProgrammes(seasons);
  // Every record read with canonical sides before it is folded, so a ranked
  // opponent's record joins the opponent's own record of the same match. The
  // raw identity is kept to alias the tie below: a page that looks a tie up
  // from the record it holds still finds it.
  const raw = allSightings(seasons);
  const aliases = new Map<string, string>();
  const sightings = raw.map((s) => {
    const fixture = canonicalFixture(s.fixture, known);
    if (fixture === s.fixture) return s;
    aliases.set(matchIdentity(s.fixture), matchIdentity(fixture));
    return { ...s, fixture };
  });
  const folded = foldToMatches(sightings)
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
  return {
    ncaa,
    conference,
    byIdentity: new AliasedMap(byIdentity, aliases),
    tournamentOf: new AliasedMap(tournamentOf, aliases),
    conferenceOf,
  };
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

/** A tie and every tie behind it among `pool`: each side's latest tie in the
 *  round before, and so on back, by date. An unplaced tie (round 0) is never
 *  behind anything: its round is unknown, so no line may reach it. */
function subtreeOf(pool: readonly Tie[], root: Tie): Tie[] {
  const latestBefore = (slug: string, round: number): Tie | null =>
    round <= 1
      ? null
      : (pool
          .filter((x) => x.round === round - 1 && sides(x).includes(slug))
          .sort(byDate)
          .at(-1) ?? null);
  const walk = (tie: Tie, into: Tie[]): Tie[] => {
    into.push(tie);
    for (const slug of sides(tie)) {
      const prev = latestBefore(slug, tie.round);
      if (prev && !into.includes(prev)) walk(prev, into);
    }
    return into;
  };
  return walk(root, []).sort(byDate);
}

export function regionsOf(t: Tournament): BracketRegion[] {
  const qfs = t.ties.filter((x) => x.label === "QF");
  if (qfs.length === 0) return [];
  const regions = qfs.map((qf) => ({ quarterfinal: qf, ties: subtreeOf(t.ties, qf) }));
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

/** A bracket fragment the results have joined: a tie and every tie behind
 *  it. A region is one whose root is a quarterfinal. */
export interface BracketTree {
  root: Tie;
  ties: Tie[];
}

/** The placed ties of `pool` as trees, before any region exists: each rooted
 *  at a tie that feeds no later tie in the pool, with every tie behind it.
 *  Latest round first, then the trees the results have joined most, then by
 *  date, so a joined tree leads and a lone tie follows. Nothing is joined that
 *  the results do not join: two lone ties stay two trees. */
export function treesOf(pool: readonly Tie[]): BracketTree[] {
  const placed = pool.filter((x) => x.round > 0);
  const feedsLater = (x: Tie): boolean =>
    placed.some((y) => y.round === x.round + 1 && sides(y).some((slug) => sides(x).includes(slug)));
  return placed
    .filter((x) => !feedsLater(x))
    .map((root) => ({ root, ties: subtreeOf(placed, root) }))
    .sort(
      (a, b) =>
        b.root.round - a.root.round ||
        b.ties.length - a.ties.length ||
        byDate(a.root, b.root) ||
        tieAnchor(a.root).localeCompare(tieAnchor(b.root)),
    );
}

/** The knockout's shape, where the collected rounds say it. The largest round
 *  whose size is a power of two is taken as full (a first round of play-in
 *  ties is smaller than the round the byes join), and each round after it
 *  halves to a final of one. Null when no round says so, or when a later round
 *  already holds more ties than the halving allows: then the shape is not what
 *  it seems, and nothing is counted from it. */
export interface Shape {
  /** The full round the shape is counted from. */
  from: number;
  /** The final's round. */
  rounds: number;
  /** The ties a round holds when complete; 0 outside the shape. */
  size: (round: number) => number;
  /** The results have closed the full round: the round after it is collected
   *  and every side in it came through the round before, so no later entrant
   *  can still join. Until then the full round may be a part-collected one
   *  (a host's opponent is unknown until its play-in is played), so a shape
   *  may count what is ahead but may not name a round. */
  confirmed: boolean;
}

export function shapeOf(t: Tournament): Shape | null {
  return shapeFrom(t.ties);
}

function shapeFrom(ties: readonly { round: number; fixture: Fixture }[]): Shape | null {
  const sizes = new Map<number, number>();
  for (const x of ties) if (x.round > 0) sizes.set(x.round, (sizes.get(x.round) ?? 0) + 1);
  let from = 0;
  let full = 0;
  for (const [round, n] of sizes) {
    const power = n >= 2 && (n & (n - 1)) === 0;
    if (power && (n > full || (n === full && round < from))) {
      from = round;
      full = n;
    }
  }
  if (full === 0) return null;
  const rounds = from + Math.log2(full);
  const size = (round: number): number =>
    round < from || round > rounds ? 0 : full / 2 ** (round - from);
  for (const [round, n] of sizes) if (round > from && n > size(round)) return null;
  const sidesIn = (round: number): Set<string> =>
    new Set(ties.filter((x) => x.round === round).flatMap((x) => [x.fixture.home, x.fixture.away]));
  let confirmed = (sizes.get(from + 1) ?? 0) > 0;
  for (let round = from + 1; confirmed && round <= rounds && sizes.has(round); round++) {
    const before = sidesIn(round - 1);
    confirmed = [...sidesIn(round)].every((slug) => before.has(slug));
  }
  return { from, rounds, size, confirmed };
}

/** A round's short label, counted back from the final of a known shape. */
export const labelAt = (round: number, rounds: number): string =>
  (["FINAL", "SF", "QF"] as const)[rounds - round] ?? `R${round}`;

const ROUND_NAME: Record<string, string> = {
  R1: "First round",
  R2: "Second round",
  R3: "Third round",
  QF: "Quarterfinal",
  SF: "Semifinal",
  FINAL: "Final",
};

/** A round's name for a heading: "Second round", "Quarterfinal". */
export const roundNameOf = (label: string): string =>
  ROUND_NAME[label] ?? `Round ${label.slice(1)}`;

/** The ties still to come in one round, as a count: no pairing is drawn. */
export interface Ahead {
  round: number;
  label: string;
  ties: number;
}

/** Every round still to come, from the latest round collected to the final,
 *  with the ties each still lacks. Empty once the final is played (whether or
 *  not a champion is named), or when the collected rounds give no shape to
 *  count from. */
export function aheadOf(t: Tournament): Ahead[] {
  if (t.decided || t.champion) return [];
  const shape = shapeOf(t);
  if (!shape) return [];
  const latest = Math.max(...t.ties.map((x) => x.round));
  const out: Ahead[] = [];
  for (let round = Math.max(shape.from, latest); round <= shape.rounds; round++) {
    const missing = shape.size(round) - t.ties.filter((x) => x.round === round).length;
    if (missing > 0) out.push({ round, label: labelAt(round, shape.rounds), ties: missing });
  }
  return out;
}

/** How a tournament's final stands. `won` names a champion, from the score or
 *  a collected shootout; `drawn` is a final played level with no shootout
 *  collected, and `disputed` one whose records disagree: both are decided,
 *  and neither names anyone. */
export type Verdict =
  | { kind: "none" }
  | { kind: "to-play"; final: Tie }
  | { kind: "won"; final: Tie; champion: Advance }
  | { kind: "drawn"; final: Tie }
  | { kind: "disputed"; final: Tie };

export function verdictOf(t: Tournament): Verdict {
  const final = t.final;
  if (!final) return { kind: "none" };
  if (!t.decided) return { kind: "to-play", final };
  if (t.champion) return { kind: "won", final, champion: t.champion };
  if (final.disputed) return { kind: "disputed", final };
  return { kind: "drawn", final };
}

/** A tournament's state in words: a short head for its card, and a note that
 *  says why no champion is named, where none is. Nothing is read from the
 *  published result text: a shootout counts only when a record collects it,
 *  and otherwise the text is quoted as printed. */
export function verdictLine(
  t: Tournament,
  name: (slug: string) => string,
): { head: string; note: string | null } {
  const v = verdictOf(t);
  if (v.kind === "none") {
    const n = t.ties.length;
    return { head: `${n} ${n === 1 ? "match" : "matches"} collected`, note: null };
  }
  if (v.kind === "to-play") return { head: "Final to play", note: null };
  const f = v.final.fixture;
  if (v.kind === "won") {
    const who = name(v.champion.slug);
    const s = v.final.shootout;
    if (v.champion.by === "shootout" && s) {
      const won = v.champion.slug === f.home ? s.home : s.away;
      const lost = v.champion.slug === f.home ? s.away : s.home;
      return { head: `Champions: ${who}, on penalties, ${won}–${lost}, as published`, note: null };
    }
    return { head: `Champions: ${who}`, note: null };
  }
  if (v.kind === "disputed") {
    return {
      head: "Final played · records disagree",
      note: "Its records disagree, so no champion is named.",
    };
  }
  const score = `${f.home_score}–${f.away_score}`;
  const published = v.final.resultPublished;
  return published
    ? {
        head: `Final drawn ${score} · shootout winner not collected`,
        note: `Published as “${published}”. No record collects the shootout's winner, so no champion is named.`,
      }
    : {
        head: `Final drawn ${score} · shootout not published`,
        note: "No record publishes a shootout, so no champion is named.",
      };
}

/** Where one programme in the field stands, from its latest tie. */
export type Standing = "champion" | "through" | "to-play" | "unsettled" | "out";

export interface FieldEntry {
  slug: string;
  standing: Standing;
  /** The programme's latest tie: the one its standing is read from. */
  tie: Tie;
}

/** Every programme with a tie, once, by its latest tie: through when it won
 *  it, out when the other side did, to play while it is unplayed, and
 *  unsettled when it was played but the record names no one through (a
 *  disputed tie, or a level score with no shootout collected). */
export function fieldOf(t: Tournament): FieldEntry[] {
  const latest = new Map<string, Tie>();
  const ordered = [...t.ties].sort((a, b) => a.round - b.round || byDate(a, b));
  for (const x of ordered) for (const slug of sides(x)) latest.set(slug, x);
  return [...latest].map(([slug, tie]) => {
    const through = tie.through;
    let standing: Standing;
    if (through === null) standing = tie.fixture.status === "final" ? "unsettled" : "to-play";
    else if (through.slug !== slug) standing = "out";
    else standing = t.final === tie && t.champion?.slug === slug ? "champion" : "through";
    return { slug, standing, tie };
  });
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
  return layoutTree({ root: region.quarterfinal, ties: region.ties });
}

/** Lay any bracket tree out the same way, its root on the right. `first` is
 *  the round drawn as column 1 (default: the tree's own earliest), so trees of
 *  different depths stacked on one grid keep their rounds in the same column. */
export function layoutTree(
  tree: BracketTree,
  first?: number,
): { cells: Cell[]; cols: number; rows: number } {
  const region = { quarterfinal: tree.root, ties: tree.ties };
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
  const earliest = first ?? Math.min(...region.ties.map((t) => t.round));
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
      col: t.round - earliest + 1,
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
    cols: region.quarterfinal.round - earliest + 1,
    rows: leavesOf(region.quarterfinal),
  };
}

/** A tie's stable anchor: deep-linkable, and the same on every build. */
export const tieAnchor = (t: Tie): string =>
  `tie-${t.fixture.date}-${[t.fixture.home, t.fixture.away].sort().join("-")}`;

/** Whether the season has any postseason tie collected yet. */
export const hasPostseason = (p: Postseason): boolean => p.byIdentity.size > 0;

/** The programme whose own schedule page a record was read from, or null when
 *  the record cannot say. A conference's file holds its members' schedules, so
 *  a record of a match against an outsider is the member's. A record of a match
 *  between two members is whichever page the collector reached it on: the
 *  side every other row from that page's host involves. */
export function publisherOf(s: Sighting): string | null {
  const f = s.fixture;
  const members = memberSlugs(s.season);
  const candidates = [f.home, f.away].filter((slug) => members.has(slug));
  if (candidates.length === 1) return candidates[0] as string;
  const host = hostOf(f.source_url);
  if (!host) return null;
  const fromHost = s.season.fixtures.fixtures.filter((x) => hostOf(x.source_url) === host);
  const every = candidates.filter((slug) =>
    fromHost.every((x) => x.home === slug || x.away === slug),
  );
  return every.length === 1 ? (every[0] as string) : null;
}

/** "fhsuathletics.com" from a record's source URL, or null when it has none. */
function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** One record's kickoff, with whose page printed it. */
export interface KickoffVersion {
  /** The programme whose schedule printed it; null when the record cannot say. */
  by: string | null;
  /** The page's host, for a record whose programme is unknown. */
  source: string | null;
  /** HH:MM as published; null when that page published no time. */
  time: string | null;
  venue: string | null;
}

/** An unplayed tie's kickoff as published. Two schedules can print one match
 *  differently (each in its own local time, say), so nothing is merged: one
 *  record is printed, the host's where the match has one, and every other
 *  record is named beside it as agreeing or as printing something else. */
export interface Kickoff {
  /** The record printed: the home side's own, unless the match is at a
   *  neutral site or the home side's record is not collected. */
  primary: KickoffVersion;
  /** The primary is the host's page: a home side at its own ground. */
  hosted: boolean;
  /** Other records that print the same time. */
  agree: KickoffVersion[];
  /** Other records that print a different time, or none. */
  differ: KickoffVersion[];
}

export function kickoffOf(tie: Tie): Kickoff {
  const versions = tie.match.sightings.map(
    (s): KickoffVersion => ({
      by: publisherOf(s),
      source: hostOf(s.fixture.source_url),
      time: s.fixture.time ?? null,
      venue: s.fixture.venue ?? null,
    }),
  );
  const home = tie.match.neutral ? null : tie.fixture.home;
  const hostIndex = home === null ? -1 : versions.findIndex((v) => v.by === home);
  const at = hostIndex >= 0 ? hostIndex : 0;
  const primary = versions[at] as KickoffVersion;
  const rest = versions.filter((_, i) => i !== at);
  return {
    primary,
    hosted: hostIndex >= 0,
    agree: rest.filter((v) => v.time === primary.time),
    differ: rest.filter((v) => v.time !== primary.time),
  };
}

/** A side's ties in its tournament before this one, in order: its route to
 *  it. Empty when this is the first tie of its collected. */
export const routeOf = (t: Tournament, tie: Tie, slug: string): Tie[] =>
  t.ties.filter((x) => x !== tie && sides(x).includes(slug) && byDate(x, tie) < 0).sort(byDate);

/** The season a side's record is read from: the file it is a member of among
 *  the tie's records. Null for a side no collected record holds as a member,
 *  whose record the site does not have. */
export const sideSeasonOf = (tie: Tie, slug: string): Season | null =>
  tie.match.sightings.find((s) => memberSlugs(s.season).has(slug))?.season ?? null;
