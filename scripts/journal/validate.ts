// The validator — the thing that keeps the writer honest.
//
// Every OBSERVED and DERIVED claim carries a `basis`: the numbers the claim
// rests on. This pass recomputes each of them against the data home and DROPS
// what it cannot confirm. It never softens a claim, never rewrites a number to
// match, and never keeps a claim it merely failed to understand — a basis no
// checker recognises is a basis nobody can audit, and an unauditable claim is
// exactly what this pass exists to remove.
//
// Dropped claims are not deleted quietly: each lands in a sidecar with the
// figure that was claimed and the figure the data actually holds.

import {
  boxScoreGaps,
  conferenceOpensOn,
  type Fixture,
  fixtureCount,
  goalsForByProgramme,
  matchDetailOf,
  matchFixtureRef,
  outsideRecord,
  programmeCounts,
  recordOf,
  type Season,
  scoredCount,
  unresolved,
} from "../../src/lib/derive.ts";
import type { JournalFile } from "../../src/lib/journal.ts";

export type Verdict = "verified" | "contradicted" | "unverifiable";

export interface ClaimReport {
  path: string;
  label: string;
  text: string;
  checker: string | null;
  verdict: Verdict;
  /** One line per figure that disagreed: what was claimed, what the data holds. */
  mismatches: string[];
  dropped: boolean;
  /** Something a reviewer should see that is not a failure — a ref rewritten
   *  to canonical form, or a figure no checker looked at. */
  note?: string;
  /** Numeric basis keys that no checker consumed. Not a failure: a claim can
   *  carry working notes. Named so nobody mistakes silence for confirmation. */
  unchecked_figures?: string[];
}

export interface ValidationReport {
  schema: "touchline.journal-validation/1";
  journal: string;
  season: number;
  gender: string;
  conference: string;
  validated_at: string;
  data_collected_at: string;
  policy: string;
  totals: {
    checked: number;
    verified: number;
    contradicted: number;
    unverifiable: number;
    dropped: number;
  };
  /** Refs rewritten to canonical form. Applied only when the journal is written. */
  normalizations: { path: string; from: string; to: string }[];
  /** Numbers a reader will believe that nothing recomputed. Never dropped —
   *  a REVIEW line is a question for a person, not a verdict. */
  review: ReviewLine[];
  claims: ClaimReport[];
}

type Basis = Record<string, unknown>;

interface Ctx {
  season: Season;
  /** "obu" / "OBU" / "ouachita-baptist" → "ouachita-baptist", or null. */
  resolve(token: string): string | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const has = (b: Basis, ...keys: string[]): boolean => keys.some((k) => b[k] !== undefined);
const close = (a: number, b: number): boolean => Math.abs(a - b) < 0.0005;

function compare(b: Basis, key: string, actual: number, out: string[], tolerant = false): void {
  const claimed = num(b[key]);
  if (claimed === null) return;
  const ok = tolerant ? close(claimed, actual) : claimed === actual;
  if (!ok) out.push(`${key}: claimed ${claimed}, data holds ${actual}`);
}

interface Checker {
  name: string;
  claims(b: Basis, ctx: Ctx): boolean;
  check(b: Basis, ctx: Ctx): string[];
  /** Something a reviewer should see about HOW the check was satisfied — used
   *  where the basis's own wording admits more than one reading. */
  note?(b: Basis, ctx: Ctx): string | null;
}

/** A writer describing a player's share of a team writes `player_goals`, not
 *  `goals`. The figure is the same figure; only the name changed, so the
 *  checker answers to both rather than leaving it unread. */
const STAT_ALIASES: Record<string, string> = {
  player_goals: "goals",
  player_assists: "assists",
  player_shots: "shots",
  player_minutes: "minutes",
  player_saves: "saves",
};

const STAT_KEYS = [
  "goals",
  "assists",
  "points",
  "shots",
  "sog",
  "minutes",
  "gp",
  "gs",
  "saves",
  "goals_against",
  "shutouts",
  "wins",
  "losses",
] as const;

/** A programme-prefixed basis key like `obu_gf`. */
function prefixed(
  b: Basis,
  ctx: Ctx,
  suffix: string,
): { slug: string; key: string; value: number } | null {
  for (const [key, value] of Object.entries(b)) {
    if (!key.endsWith(`_${suffix}`)) continue;
    const v = num(value);
    if (v === null) continue;
    const slug = ctx.resolve(key.slice(0, -(suffix.length + 1)));
    if (slug) return { slug, key, value: v };
  }
  return null;
}

/** The per-programme readings a comparative may range over. Each resolves
 *  through the same source the plain figure checkers use, so a relation can
 *  never pass on a reading its own figures would fail: gf/ga are the fixtures'
 *  scorelines (goalsForByProgramme), the record is recordOf, and "played" is
 *  programmeCounts's reading — a final WITH a published score, never the
 *  status-final count, with exhibitions outside all of it. */
const METRICS: Record<string, (ctx: Ctx, slug: string) => number> = {
  gf: (ctx, slug) => goalsForByProgramme(ctx.season).find((g) => g.slug === slug)?.goals ?? 0,
  ga: (ctx, slug) => goalsForByProgramme(ctx.season).find((g) => g.slug === slug)?.conceded ?? 0,
  wins: (ctx, slug) => recordOf(ctx.season, slug).won,
  draws: (ctx, slug) => recordOf(ctx.season, slug).drawn,
  losses: (ctx, slug) => recordOf(ctx.season, slug).lost,
  played: (ctx, slug) => programmeCounts(ctx.season, slug).played,
};

/** Every programme the subject could be compared against, strongest first. */
function rivalReadings(
  ctx: Ctx,
  metricKey: string,
  subject: string,
): { slug: string; value: number }[] {
  const metric = METRICS[metricKey];
  if (!metric) return [];
  return ctx.season.fixtures.programmes
    .map((p) => p.slug)
    .filter((slug) => slug !== subject)
    .map((slug) => ({ slug, value: metric(ctx, slug) }))
    .sort((a, b) => b.value - a.value || a.slug.localeCompare(b.slug));
}

/** The sets a decomposition claim may address, each enumerated from the same
 *  helpers the site's own pages count with. */
const SETS: Record<string, (s: Season) => Fixture[]> = {
  silent_finals: (s) => unresolved(s).finalsWithoutScore,
  past_date_no_result: (s) => unresolved(s).pastDateNoResult,
  silences: (s) => {
    const u = unresolved(s);
    return [...u.finalsWithoutScore, ...u.pastDateNoResult];
  },
  box_score_gaps: (s) =>
    boxScoreGaps(s)
      .map((g) => g.fixture)
      .filter((f): f is Fixture => f !== undefined),
};

const CHECKERS: Checker[] = [
  {
    name: "player_stat",
    claims: (b) =>
      typeof b.player === "string" &&
      has(b, ...STAT_KEYS, ...Object.keys(STAT_ALIASES), "save_pct"),
    check: (b, { season, resolve }) => {
      const name = String(b.player);
      const wanted = typeof b.programme === "string" ? resolve(b.programme) : null;
      const teams = Object.entries(season.stats?.teams ?? {}).filter(
        ([slug]) => !wanted || slug === wanted,
      );
      const out: string[] = [];
      const outfield = teams.flatMap(([, t]) => t.players).find((p) => p.name === name);
      const keeper = teams.flatMap(([, t]) => t.keepers).find((k) => k.name === name);
      if (!outfield && !keeper)
        return [`player: "${name}" has no published line in ${wanted ?? "the conference"}`];
      for (const key of STAT_KEYS) {
        const actual =
          (outfield as Record<string, unknown> | undefined)?.[key] ??
          (keeper as Record<string, unknown> | undefined)?.[key];
        const a = num(actual);
        // The key itself, and any alias a writer used for the same figure.
        const names = [key, ...Object.keys(STAT_ALIASES).filter((k) => STAT_ALIASES[k] === key)];
        for (const name of names) {
          if (b[name] === undefined) continue;
          if (a !== null) compare(b, name, a, out);
          else out.push(`${name}: claimed ${String(b[name])}, the source published none`);
        }
      }
      const pct = num(keeper?.save_pct);
      if (pct !== null) compare(b, "save_pct", pct, out, true);
      else if (b.save_pct !== undefined) out.push("save_pct: claimed, the source published none");
      return out;
    },
  },
  {
    name: "distinct_scorers",
    claims: (b) => has(b, "distinct_scorers", "distinct_scorers_min"),
    check: (b, ctx) => {
      const token =
        typeof b.programme === "string"
          ? b.programme
          : (prefixed(b, ctx, "gf")?.slug ?? prefixed(b, ctx, "ga")?.slug ?? null);
      const slug = token ? ctx.resolve(token) : null;
      if (!slug) return ["distinct_scorers: the basis names no programme to count them for"];
      const found = new Set<string>();
      for (const f of ctx.season.fixtures.fixtures) {
        if (f.home !== slug && f.away !== slug) continue;
        const detail = matchDetailOf(ctx.season, f.id);
        if (!detail || detail.home_index === undefined) continue;
        const side = f.home === slug ? detail.home_index : 1 - detail.home_index;
        for (const g of detail.scoring ?? []) if (g.team === side) found.add(g.scorer);
      }
      const out: string[] = [];
      compare(b, "distinct_scorers", found.size, out);
      const min = num(b.distinct_scorers_min);
      if (min !== null && found.size < min)
        out.push(`distinct_scorers_min: claimed at least ${min}, box scores name ${found.size}`);
      return out;
    },
  },
  {
    name: "team_goals",
    claims: (b, ctx) =>
      (typeof b.programme === "string" && has(b, "gf", "ga")) ||
      prefixed(b, ctx, "gf") !== null ||
      prefixed(b, ctx, "ga") !== null,
    check: (b, ctx) => {
      const goals = goalsForByProgramme(ctx.season);
      const out: string[] = [];
      const direct = typeof b.programme === "string" ? ctx.resolve(b.programme) : null;
      if (direct) {
        const row = goals.find((g) => g.slug === direct);
        if (!row) return [`programme: "${String(b.programme)}" is not a member of this conference`];
        compare(b, "gf", row.goals, out);
        compare(b, "ga", row.conceded, out);
      }
      for (const [suffix, field] of [
        ["gf", "goals"],
        ["ga", "conceded"],
      ] as const) {
        const hit = prefixed(b, ctx, suffix);
        if (!hit) continue;
        const row = goals.find((g) => g.slug === hit.slug);
        if (!row) {
          out.push(`${hit.key}: "${hit.slug}" is not a member of this conference`);
          continue;
        }
        if (hit.value !== row[field])
          out.push(`${hit.key}: claimed ${hit.value}, data holds ${row[field]}`);
      }
      return out;
    },
  },
  {
    name: "team_goal_share",
    claims: (b) => typeof b.programme === "string" && has(b, "team_goals", "team_goals_against"),
    check: (b, ctx) => {
      const slug = ctx.resolve(String(b.programme));
      if (!slug) return [`programme: "${String(b.programme)}" is not a member of this conference`];
      const out: string[] = [];
      for (const [key, field] of [
        ["team_goals", "goals"],
        ["team_goals_against", "conceded"],
      ] as const) {
        const claimed = num(b[key]);
        if (claimed === null) continue;
        const readings = teamGoalReadings(ctx, slug)[field];
        if (!readings.includes(claimed))
          out.push(
            `${key}: claimed ${claimed}, the fixtures hold ${readings[0]} and the stats table ${readings[1]}`,
          );
      }
      return out;
    },
    note: (b, ctx) => {
      const slug = typeof b.programme === "string" ? ctx.resolve(b.programme) : null;
      const claimed = num(b.team_goals);
      if (!slug || claimed === null) return null;
      const [fixtures, stats] = teamGoalReadings(ctx, slug).goals;
      if (fixtures === stats) return null;
      // The two readings disagree, so say which one the claim rests on: a
      // scorer the source never attributed is exactly this gap.
      return claimed === fixtures
        ? `team_goals matches the fixtures (${fixtures}); the stats table attributes ${stats}`
        : `team_goals matches the stats table (${stats}); the fixtures hold ${fixtures}`;
    },
  },
  {
    name: "team_record",
    claims: (b) => typeof b.programme === "string" && has(b, "wins", "draws", "losses"),
    check: (b, ctx) => {
      const slug = ctx.resolve(String(b.programme));
      if (!slug) return [`programme: "${String(b.programme)}" is not a member of this conference`];
      const r = recordOf(ctx.season, slug);
      const out: string[] = [];
      compare(b, "wins", r.won, out);
      compare(b, "draws", r.drawn, out);
      compare(b, "losses", r.lost, out);
      return out;
    },
  },
  {
    name: "outside_record",
    claims: (b) =>
      b.programme === undefined && b.player === undefined && has(b, "wins", "draws", "losses"),
    check: (b, { season }) => {
      const r = outsideRecord(season);
      const out: string[] = [];
      compare(b, "wins", r.won, out);
      compare(b, "draws", r.drawn, out);
      compare(b, "losses", r.lost, out);
      compare(b, "gf", r.goalsFor, out);
      compare(b, "ga", r.goalsAgainst, out);
      return out;
    },
  },
  {
    name: "unresolved",
    claims: (b) => has(b, "finals_without_score", "past_date_no_result", "unresolved"),
    check: (b, { season }) => {
      const u = unresolved(season);
      const out: string[] = [];
      compare(b, "finals_without_score", u.finalsWithoutScore.length, out);
      compare(b, "past_date_no_result", u.pastDateNoResult.length, out);
      compare(b, "unresolved", u.total, out);
      return out;
    },
  },
  {
    name: "box_score_gaps",
    claims: (b) => has(b, "box_score_gaps", "missing_box_scores", "missing"),
    check: (b, { season }) => {
      const n = boxScoreGaps(season).length;
      const out: string[] = [];
      for (const key of ["box_score_gaps", "missing_box_scores", "missing"])
        compare(b, key, n, out);
      return out;
    },
  },
  {
    name: "fixture_counts",
    claims: (b) =>
      has(
        b,
        "matches_total",
        "matches_played",
        "silent_finals",
        "fixtures_total",
        "fixtures_played",
        "fixtures_scored",
        "played",
        "total",
        "scored",
      ),
    check: (b, { season }) => {
      const out: string[] = [];
      // "Played" means a final WITH a published score, at every spelling. The
      // count of finals with no score is a silent-final count and never a
      // played one — the two were one number until exhibitions came out of
      // the record, and a checker that still conflated them would drop
      // correct claims for disagreeing with the old definition.
      for (const key of ["matches_total", "fixtures_total", "total"]) {
        compare(b, key, fixtureCount(season), out);
      }
      for (const key of [
        "matches_played",
        "fixtures_played",
        "fixtures_scored",
        "played",
        "scored",
      ]) {
        compare(b, key, scoredCount(season), out);
      }
      for (const key of ["silent_finals"]) {
        compare(b, key, unresolved(season).finalsWithoutScore.length, out);
      }
      return out;
    },
  },
  {
    name: "conference_opens",
    claims: (b) => typeof b.conference_opens === "string",
    check: (b, { season }) => {
      const actual = conferenceOpensOn(season);
      return b.conference_opens === actual
        ? []
        : [
            `conference_opens: claimed ${String(b.conference_opens)}, data holds ${actual ?? "no conference fixture"}`,
          ];
    },
  },
  {
    // A claim ABOUT figures rather than of them: "more than any two other
    // programmes together". The numeral audit sees the numbers inside such a
    // sentence; only a named relation lets anything check the relation itself,
    // which is why the prompt teaches the writer to emit one.
    name: "comparative",
    claims: (b) => typeof b.comparative === "string",
    check: (b, ctx) => {
      const relation = String(b.comparative);
      if (relation !== "greater_than_sum" && relation !== "greater_than_each")
        return [`comparative: "${relation}" is not a relation this validator can evaluate`];
      if (typeof b.metric !== "string" || METRICS[b.metric] === undefined)
        return [`metric: "${String(b.metric)}" is not a figure a comparative can range over`];
      const subject = typeof b.programme === "string" ? ctx.resolve(b.programme) : null;
      if (!subject)
        return [`programme: "${String(b.programme)}" is not a member of this conference`];
      const own = METRICS[b.metric]?.(ctx, subject) ?? 0;

      // Who the claim measures against: the programmes it names, or — for
      // "any N others" — the strongest N, because that is the only reading
      // under which "any" is true.
      let against: { slug: string; value: number }[];
      const anyN = num(b.of_any);
      if (anyN !== null) {
        if (anyN < 1 || !Number.isInteger(anyN))
          return [`of_any: ${anyN} is not a count of programmes`];
        const ranked = rivalReadings(ctx, b.metric, subject);
        if (relation === "greater_than_sum" && ranked.length < anyN)
          return [`of_any: the conference holds ${ranked.length} other programmes, not ${anyN}`];
        against = relation === "greater_than_sum" ? ranked.slice(0, anyN) : ranked;
      } else if (Array.isArray(b.of) && b.of.length > 0) {
        const bad: string[] = [];
        against = [];
        for (const token of b.of) {
          const slug = ctx.resolve(String(token));
          if (!slug) bad.push(`of: "${String(token)}" is not a member of this conference`);
          else if (slug === subject) bad.push(`of: the claim compares ${subject} against itself`);
          else against.push({ slug, value: METRICS[b.metric]?.(ctx, slug) ?? 0 });
        }
        if (bad.length > 0) return bad;
      } else {
        return ['comparative: names neither "of" programmes nor "of_any" a count'];
      }

      if (relation === "greater_than_sum") {
        const sum = against.reduce((n, r) => n + r.value, 0);
        const parts = against.map((r) => `${r.slug} ${r.value}`).join(" + ");
        return own > sum
          ? []
          : [
              `comparative: ${subject} holds ${b.metric} ${own}, not greater than ${parts} = ${sum}`,
            ];
      }
      return against
        .filter((r) => r.value >= own)
        .map(
          (r) =>
            `comparative: ${subject} holds ${b.metric} ${own}, not greater than ${r.slug}'s ${r.value}`,
        );
    },
    note: (b, ctx) => {
      // "any two others" admits the question: which two? Name what the
      // relation was actually held against, so a reviewer need not re-rank.
      const anyN = num(b.of_any);
      if (anyN === null || anyN < 1 || !Number.isInteger(anyN)) return null;
      if (typeof b.metric !== "string" || METRICS[b.metric] === undefined) return null;
      const subject = typeof b.programme === "string" ? ctx.resolve(b.programme) : null;
      if (!subject) return null;
      const ranked = rivalReadings(ctx, b.metric, subject);
      if (ranked.length === 0) return null;
      if (String(b.comparative) === "greater_than_sum") {
        const strongest = ranked.slice(0, anyN);
        return `"any ${anyN} others" was held against the strongest ${anyN}: ${strongest
          .map((r) => `${r.slug} ${r.value}`)
          .join(" + ")}`;
      }
      const nearest = ranked[0];
      return nearest
        ? `held against every other programme; the nearest is ${nearest.slug} at ${nearest.value}`
        : null;
    },
  },
  {
    // A decomposition: "all three are Lubbock Christian's". The count says how
    // many; all_of says every member involves that programme — and both are
    // recomputed from the set itself, never taken from the sentence.
    name: "set_members",
    claims: (b) => typeof b.set === "string",
    check: (b, ctx) => {
      const name = String(b.set);
      const list = SETS[name];
      if (!list) return [`set: "${name}" is not a set this validator can enumerate`];
      const members = list(ctx.season);
      const out: string[] = [];
      compare(b, "count", members.length, out);
      if (typeof b.all_of === "string") {
        const slug = ctx.resolve(b.all_of);
        if (!slug) out.push(`all_of: "${String(b.all_of)}" is not a member of this conference`);
        else if (members.length === 0)
          out.push(`all_of: ${name} is empty — there is nothing to belong to ${slug}`);
        else
          for (const f of members)
            if (f.home !== slug && f.away !== slug)
              out.push(`all_of: ${f.date} ${f.home} v ${f.away} does not involve ${slug}`);
      } else if (b.count === undefined) {
        out.push('set: carries neither "all_of" nor "count" — the claim asserts nothing checkable');
      }
      return out;
    },
  },
];

const CHECKED_KEYS = new Set<string>([
  ...STAT_KEYS,
  ...Object.keys(STAT_ALIASES),
  "team_goals",
  "team_goals_against",
  "save_pct",
  "gf",
  "ga",
  "wins",
  "draws",
  "losses",
  "distinct_scorers",
  "distinct_scorers_min",
  "finals_without_score",
  "past_date_no_result",
  "unresolved",
  "box_score_gaps",
  "missing_box_scores",
  "missing",
  "matches_total",
  "matches_played",
  "silent_finals",
  "exhibitions_excluded",
  "fixtures_total",
  "fixtures_played",
  "fixtures_scored",
  "played",
  "total",
  "scored",
  "conference_opens",
  "of_any",
  "count",
]);

/** Numbers in the basis that no checker looked at. A basis may carry working
 *  notes, so this is reported rather than punished — but it is reported, because
 *  an unread figure is not a confirmed one. */
function uncheckedFigures(b: Basis, ctx: Ctx): string[] {
  return Object.entries(b)
    .filter(([key, value]) => {
      if (num(value) === null) return false;
      if (CHECKED_KEYS.has(key)) return false;
      const suffix = key.endsWith("_gf") ? "gf" : key.endsWith("_ga") ? "ga" : null;
      return !(suffix && ctx.resolve(key.slice(0, -(suffix.length + 1))));
    })
    .map(([key, value]) => `${key}: ${String(value)}`);
}

/** A programme's goals, both ways the sources publish them: totalled from the
 *  fixtures' scorelines, and summed from the stats table's attributed scorers.
 *  They can differ — a goal the source never attributed to anyone — so a claim
 *  about "published goals" is held against both rather than one chosen for it. */
function teamGoalReadings(
  ctx: Ctx,
  slug: string,
): { goals: [number, number]; conceded: [number, number] } {
  const row = goalsForByProgramme(ctx.season).find((g) => g.slug === slug);
  const team = ctx.season.stats?.teams[slug];
  const attributed = (team?.players ?? []).reduce((n, p) => n + (p.goals ?? 0), 0);
  const conceded = (team?.keepers ?? []).reduce((n, k) => n + (k.goals_against ?? 0), 0);
  return {
    goals: [row?.goals ?? 0, attributed],
    conceded: [row?.conceded ?? 0, conceded],
  };
}

function makeCtx(season: Season): Ctx {
  const byToken = new Map<string, string>();
  for (const p of season.fixtures.programmes) {
    byToken.set(p.slug.toLowerCase(), p.slug);
    if (p.abbr) byToken.set(p.abbr.toLowerCase(), p.slug);
    byToken.set(p.name.toLowerCase(), p.slug);
  }
  return { season, resolve: (t) => byToken.get(String(t).toLowerCase()) ?? null };
}

function judge(
  basis: Basis | undefined,
  ctx: Ctx,
): { checker: string | null; verdict: Verdict; mismatches: string[]; notes: string[] } {
  if (!basis || Object.keys(basis).length === 0)
    return {
      checker: null,
      verdict: "unverifiable",
      mismatches: ["the claim carries no basis"],
      notes: [],
    };
  const applicable = CHECKERS.filter((c) => c.claims(basis, ctx));
  if (applicable.length === 0)
    return {
      checker: null,
      verdict: "unverifiable",
      mismatches: [`no checker recognises this basis (keys: ${Object.keys(basis).join(", ")})`],
      notes: [],
    };
  const mismatches = applicable.flatMap((c) => c.check(basis, ctx));
  const notes = applicable.map((c) => c.note?.(basis, ctx)).filter((n): n is string => Boolean(n));
  return {
    checker: applicable.map((c) => c.name).join("+"),
    verdict: mismatches.length === 0 ? "verified" : "contradicted",
    mismatches,
    notes,
  };
}

/** Observed and derived must be proven. Signal and projected pass on schema —
 *  but a figure the data flatly contradicts is dropped whatever its label,
 *  because a wrong number is a wrong number. Context is never a finding. */
function shouldDrop(label: string, verdict: Verdict): boolean {
  if (label === "context") return false;
  if (verdict === "contradicted") return true;
  return verdict === "unverifiable" && (label === "observed" || label === "derived");
}

const POLICY =
  "observed and derived claims are recomputed against the data home before publish; " +
  "failures are dropped, not softened. signal and projected pass on schema unless the " +
  "data contradicts a figure. context is never validated as a finding.";

/**
 * Every number a reader can see, whether or not a checker knows about it.
 *
 * The checkers only reach figures a claim put in its `basis`. Headline, dek
 * and the table's own sentences carry no basis at all, so their numerals were
 * unexamined — which is how "Twenty matches in" survived beside a page saying
 * fifteen, and how "Seven matches carry no box-score link" survived until
 * someone wrote the seven rows out.
 *
 * This does not drop anything. It emits REVIEW lines: here is a number a
 * reader will believe, and here is the fact that nothing recomputed it.
 */
const SPELLED: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};

/** The house register spells numbers up to twenty, so digits alone miss most
 *  of the prose — the very sentences with no basis behind them. */
function numeralsIn(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/\d+(?:\.\d+)?/g)) found.add(m[0]);
  for (const m of text.matchAll(/[A-Za-z']+/g)) {
    const word = m[0].toLowerCase();
    const n = SPELLED[word];
    if (n === undefined) continue;
    // "every one of them" and "one of the three" are pronouns; the count in
    // such a sentence is the other number. Flagging them trains a reader to
    // skim REVIEW lines, which costs more than the rare missed one.
    if (word === "one") {
      const before = text.slice(0, m.index).toLowerCase();
      const after = text.slice(m.index + m[0].length).toLowerCase();
      if (/\b(every|each|any|no|which|that|the)\s+$/.test(before) || /^\s+of\b/.test(after)) {
        continue;
      }
    }
    found.add(String(n));
  }
  return [...found];
}

/** Every number the basis vouches for, including inside strings like "7-0-5". */
function numeralsVouched(basis: Basis | undefined): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown): void => {
    if (typeof v === "number") {
      out.add(String(v));
      // ".909" is published as 0.909 but read as a percentage, and a rate is
      // often spoken as its numerator elsewhere in the sentence.
      if (!Number.isInteger(v)) out.add(String(Math.round(v * 100)));
      return;
    }
    if (typeof v === "string") {
      for (const m of v.matchAll(/\d+/g)) out.add(String(Number(m[0])));
      return;
    }
    if (Array.isArray(v)) for (const x of v) walk(x);
    else if (v && typeof v === "object") for (const x of Object.values(v)) walk(x);
  };
  if (basis) walk(basis);
  return out;
}

export interface ReviewLine {
  path: string;
  text: string;
  /** Numerals in the prose that no basis figure accounts for. */
  unbacked: string[];
}

/**
 * Numbers the whole journal establishes rather than any one claim: the season,
 * the day it was collected, the day conference play opens. A dateline is not a
 * claim, and flagging every month-and-day would bury the numerals that matter
 * under the ones that never vary.
 */
function pageFacts(season: Season): Set<string> {
  const out = new Set<string>();
  // DATE PARTS ONLY. A collect stamped 21:07:31 would otherwise vouch for 7,
  // 21 and 31 — and seven is exactly the wrong number this audit exists to
  // have caught. The clock time is never a figure anybody writes about.
  for (const iso of [season.asOf, season.collectedAt, conferenceOpensOn(season) ?? ""]) {
    for (const m of iso.slice(0, 10).matchAll(/\d+/g)) out.add(String(Number(m[0])));
  }
  return out;
}

function review(
  path: string,
  text: string | undefined,
  basis: Basis | undefined,
  page: Set<string>,
): ReviewLine[] {
  if (!text) return [];
  const vouched = numeralsVouched(basis);
  const unbacked = numeralsIn(text).filter((n) => !vouched.has(n) && !page.has(n));
  return unbacked.length === 0
    ? []
    : [{ path, text, unbacked: unbacked.sort((a, b) => Number(a) - Number(b)) }];
}

export interface ValidationResult {
  journal: JournalFile;
  report: ValidationReport;
}

export function validateJournal(
  journal: JournalFile,
  season: Season,
  name: string,
): ValidationResult {
  const ctx = makeCtx(season);
  const claims: ClaimReport[] = [];
  const normalizations: { path: string; from: string; to: string }[] = [];
  const reviews: ReviewLine[] = [];
  const page = pageFacts(season);
  const out: JournalFile = structuredClone(journal);

  // The prose a reader meets first, and the prose no checker reaches.
  reviews.push(...review("headline", out.headline, out.lede_basis, page));
  reviews.push(...review("dek", out.dek, out.lede_basis, page));
  if (out.summary_stat) {
    reviews.push(
      ...review("summary_stat.detail", out.summary_stat.detail, out.summary_stat.basis, page),
    );
  }
  if (out.table_state) {
    reviews.push(
      ...review("table_state.statement", out.table_state.statement, out.table_state.basis, page),
      ...review("table_state.footnote", out.table_state.footnote, out.table_state.basis, page),
    );
  }

  const record = (path: string, label: string, text: string, basis: Basis | undefined): boolean => {
    const { checker, verdict, mismatches, notes } = judge(basis, ctx);
    const dropped = shouldDrop(label, verdict);
    const unchecked = basis ? uncheckedFigures(basis, ctx) : [];
    claims.push({
      path,
      label,
      text,
      checker,
      verdict,
      mismatches,
      dropped,
      ...(notes.length ? { note: notes.join("; ") } : {}),
      ...(unchecked.length ? { unchecked_figures: unchecked } : {}),
    });
    return dropped;
  };

  // The summary stat is a computed figure, so it is held to the derived bar.
  if (
    out.summary_stat &&
    record("summary_stat", "derived", out.summary_stat.value, out.summary_stat.basis)
  )
    out.summary_stat = undefined;

  if (out.pattern) {
    if (record("pattern", out.pattern.label, out.pattern.text, out.pattern.basis)) {
      out.pattern = undefined;
    } else if (out.pattern.chart?.kind === "goals-for-by-team") {
      // The chart is a claim of its own: every bar is a published number.
      const goals = new Map(goalsForByProgramme(season).map((g) => [g.slug, g.goals]));
      const bad: string[] = [];
      for (const [slug, value] of Object.entries(out.pattern.chart.values)) {
        const actual = goals.get(slug);
        if (actual === undefined) bad.push(`${slug}: not a member of this conference`);
        else if (actual !== value) bad.push(`${slug}: charted ${value}, data holds ${actual}`);
      }
      claims.push({
        path: "pattern.chart",
        label: "derived",
        text: out.pattern.chart.caption ?? out.pattern.chart.kind,
        checker: "goals_for_chart",
        verdict: bad.length === 0 ? "verified" : "contradicted",
        mismatches: bad,
        dropped: bad.length > 0,
      });
      if (bad.length > 0) out.pattern.chart = undefined;
    }
  }

  // The wire is one sentence standing for a whole conference on the national
  // page, and it is held exactly as a finding is: a basis is recomputed and a
  // contradicted one drops the line, leaving the card to fall back to the
  // season headline it used to render. A line with no basis is not dropped —
  // a wire naming a run or a state carries no figure to check, and the review
  // pass below catches any numeral that reached the prose without one.
  if (out.wire?.basis && record("wire", "observed", out.wire.line, out.wire.basis)) {
    out.wire = undefined;
  }
  if (out.wire) reviews.push(...review("wire", out.wire.line, out.wire.basis, page));

  out.findings = out.findings.filter((f, i) => !record(`findings[${i}]`, f.label, f.text, f.basis));
  // A surviving claim can still say a number its basis never mentioned — the
  // checkers hold the basis to the data, not the sentence to the basis.
  if (out.pattern)
    reviews.push(...review("pattern.text", out.pattern.text, out.pattern.basis, page));
  out.findings.forEach((f, i) => {
    reviews.push(...review(`findings[${i}].text`, f.text, f.basis, page));
  });

  // A player to watch is a claim that a named player published a named line.
  out.players_to_watch = out.players_to_watch.filter((p, i) => {
    const slug = ctx.resolve(p.programme);
    const team = slug ? season.stats?.teams[slug] : undefined;
    const found =
      team?.players.some((x) => x.name === p.player) ||
      team?.keepers.some((x) => x.name === p.player);
    const mismatches = !slug
      ? [`programme: "${p.programme}" is not a member of this conference`]
      : !found
        ? [`player: "${p.player}" has no published line for ${slug}`]
        : lineMismatches(p.line, p.player, slug, season);
    claims.push({
      path: `players_to_watch[${i}]`,
      label: "observed",
      text: `${p.player} — ${p.line ?? ""}`.trim(),
      checker: "player_line",
      verdict: mismatches.length === 0 ? "verified" : "contradicted",
      mismatches,
      dropped: mismatches.length > 0,
    });
    return mismatches.length === 0;
  });

  // A featured match must address exactly one fixture that exists. A ref that
  // does so while carrying the writer's annotations — a scoreline, a kickoff
  // time — is a correct answer in the wrong format: rewrite it, do not reject
  // it. A ref matching nothing, or matching two fixtures, still drops.
  for (const key of ["last_match", "next_match"] as const) {
    const feat = out.featured?.[key];
    if (!feat) continue;
    const original = feat.fixture_ref;
    const match = matchFixtureRef(season, original);
    if (match.fixture && match.normalized && match.canonical) {
      normalizations.push({ path: `featured.${key}`, from: original, to: match.canonical });
      feat.fixture_ref = match.canonical;
    }
    claims.push({
      path: `featured.${key}`,
      label: "observed",
      text: feat.fixture_ref,
      checker: "fixture_ref",
      verdict: match.fixture ? "verified" : "contradicted",
      mismatches: match.fixture
        ? []
        : [
            match.ambiguous
              ? `fixture_ref: "${original}" answers to more than one fixture`
              : `fixture_ref: "${original}" matches no fixture in this file`,
          ],
      dropped: !match.fixture,
      ...(match.normalized ? { note: `rewritten to canonical form from "${original}"` } : {}),
    });
    if (!match.fixture && out.featured) out.featured[key] = undefined;
  }

  const totals = {
    checked: claims.length,
    verified: claims.filter((c) => c.verdict === "verified").length,
    contradicted: claims.filter((c) => c.verdict === "contradicted").length,
    unverifiable: claims.filter((c) => c.verdict === "unverifiable").length,
    dropped: claims.filter((c) => c.dropped).length,
  };

  const validated_at = new Date().toISOString();
  out.validation = { policy: POLICY, validated_at };

  return {
    journal: out,
    report: {
      schema: "touchline.journal-validation/1",
      journal: name,
      season: journal.season,
      gender: journal.gender,
      conference: journal.conference,
      validated_at,
      data_collected_at: season.collectedAt,
      policy: POLICY,
      totals,
      normalizations,
      review: reviews,
      claims,
    },
  };
}

/** Read the figures out of a watchlist line ("2 G · 4 shots", ".909") and
 *  hold each against the published stat line. */
function lineMismatches(
  line: string | undefined,
  player: string,
  slug: string,
  season: Season,
): string[] {
  if (!line) return [];
  const team = season.stats?.teams[slug];
  const p = team?.players.find((x) => x.name === player);
  const k = team?.keepers.find((x) => x.name === player);
  const out: string[] = [];
  const pairs: [RegExp, number | undefined, string][] = [
    [/(\d+)\s*G\b/, p?.goals, "goals"],
    [/(\d+)\s*A\b/, p?.assists, "assists"],
    [/(\d+)\s*shots?\b/i, p?.shots, "shots"],
    [/(\d+)\s*saves?\b/i, k?.saves, "saves"],
    [/(\d+)\s*shutouts?\b/i, k?.shutouts, "shutouts"],
  ];
  for (const [re, actual, label] of pairs) {
    const m = re.exec(line);
    if (!m) continue;
    const claimed = Number(m[1]);
    if (actual === undefined)
      out.push(`${label}: line claims ${claimed}, the source published none`);
    else if (actual !== claimed) out.push(`${label}: line claims ${claimed}, data holds ${actual}`);
  }
  const pct = /(?:^|\s)\.(\d{3})\b/.exec(line);
  if (pct && k?.save_pct !== undefined && !close(Number(`0.${pct[1]}`), k.save_pct))
    out.push(`save_pct: line claims .${pct[1]}, data holds ${k.save_pct}`);
  return out;
}
