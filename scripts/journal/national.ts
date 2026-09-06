// The national brief — everything the division's writer is allowed to know.
//
// One difference from the conference brief, and it is the whole point of this
// surface: this one is composed ACROSS the conference files. Every figure that
// spans them goes through the fold in src/lib/division.ts, because a match
// between two of these conferences is in both files, and the lead story is the
// worst place on the site for a double-counted result to land.
//
// It also carries the surfaces as DATA rather than as prose. The prompt tells
// the writer not to restate what the page already shows; this is what the page
// shows today — the strip's own cells, straight out of the function that
// renders them, and each card's line verbatim. A writer told "do not restate
// the cards" without being shown the cards is being asked to guess.

import {
  boxScoreGaps,
  canonicalFixtureRef,
  conferenceOpensOn,
  DISPUTED_MARK,
  FORFEIT_MARK,
  formOf,
  hasScore,
  isForfeit,
  isScored,
  outsideRecord,
  recordOf,
  resultFor,
  resultsOf,
  type Season,
  tableIsLive,
  unresolved,
} from "../../src/lib/derive.ts";
import {
  allSightings,
  type DivisionFigures,
  type DivisionMatch,
  divisionCounts,
  foldToMatches,
  matchIdentity,
} from "../../src/lib/division.ts";
import { daysBetween } from "../../src/lib/format.ts";
import {
  homeColumns,
  lastNightLedger,
  lastNightOf,
  lastNightOpen,
  nationalAsOf,
  nationalLede,
} from "../../src/lib/home.ts";
import { editorial, loadJournal, type NationalJournalFile } from "../../src/lib/journal.ts";
import { site } from "../../src/site.config.ts";

export interface NationalBrief {
  meta: {
    season: number;
    gender: string;
    division: string;
    /** The freshest collect across the conferences — the page's own "today". */
    as_of: string;
    /** Each conference's own stamp. They do not collect at the same time, and
     *  a division fact is only as fresh as its stalest addend. */
    collected_at: { conference: string; at: string }[];
  };
  /** What the page already prints, in the order a reader meets it. Every
   *  string here is the surface's own, taken from the function that renders
   *  it — never recomposed, because a brief that describes the page from
   *  memory drifts from it the first time the page changes. */
  surfaces: {
    kicker: string;
    strip: string[];
    cards: {
      code: string;
      name: string;
      opens: string | null;
      matches_played: number;
      matches_total: number;
      /** The card's own line, verbatim. The headline may not say it again. */
      line: string;
    }[];
    ledger: { codes: string[]; match: string }[];
    left_open: string[];
  };
  /** The division's figures, folded. Each is a count of MATCHES: a match two
   *  conferences collected is one match. `duplicated_records` is what a naive
   *  sum of the conferences would have held twice, and it is here so the
   *  writer never reaches for that sum. */
  division: {
    matches_total: number;
    matches_played: number;
    silent_finals: number;
    box_score_gaps: number;
    friendlies_excluded: number;
    duplicated_records: DivisionFigures;
  };
  conferences: {
    code: string;
    name: string;
    as_of: string;
    table: "live" | "pre-conference";
    opens_on: string | null;
    days_until_conference: number | null;
    counts: {
      matches_total: number;
      matches_played: number;
      silent_finals: number;
      past_date_no_result: number;
      box_score_gaps: number;
    };
    record_vs_outside: { wins: number; draws: number; losses: number; gf: number; ga: number };
  }[];
  /** Last night, across every conference, folded to one entry per match — and
   *  for each side, what the result did to its season. A score means something
   *  or it means nothing, and the difference is in these records. */
  last_night: {
    date: string;
    results: {
      match: string;
      codes: string[];
      home_score: number;
      away_score: number;
      /** "by forfeit" or "disputed" when the score is not the whole result.
       *  A forfeit's goals count toward nothing; a disputed score is nobody's
       *  fact yet, and `scores` holds each source's own. */
      mark?: string;
      scores?: { source: string; home_score: number; away_score: number }[];
      sides: {
        programme: string;
        conference: string;
        /** Before this match, and after it. A first defeat is the pair. */
        before: { wins: number; draws: number; losses: number };
        after: { wins: number; draws: number; losses: number };
        form: string;
      }[];
    }[];
    left_open: { match: string; codes: string[] }[];
  };
  /** The claim only this surface can make: one ranking across the conference
   *  lines. Nothing else on the site sees all three at once. */
  across: {
    goals_for: { programme: string; conference: string; goals: number }[];
    records: {
      programme: string;
      conference: string;
      wins: number;
      draws: number;
      losses: number;
      gf: number;
      ga: number;
    }[];
    openers: { conference: string; opens_on: string; days_away: number }[];
    /** The counts AND the matches, because a silence is only worth a sentence
     *  when the sentence can name it. The masthead strip stopped printing the
     *  division's total (the owner's ruling, Sep 1: what the division is
     *  missing is not this page's lead information) — so a bare count is a
     *  story the page has already declined, and where the silences SIT is
     *  the only silence fact left worth its headline. */
    silences: {
      conference: string;
      /** Kept apart, and named apart. A final with no score and a match that
       *  never got a result at all are different absences — the VOICE section
       *  forbids adding them together, and a single list holding both is how
       *  a sentence comes to do it anyway. */
      finals_without_score: { count: number; matches: string[] };
      past_date_no_result: { count: number; matches: string[] };
    }[];
    /** The division's record against programmes outside it.
     *
     *  NOT the sum of the conferences' own outside records. A match between
     *  two covered conferences is outside the conference for both of them, so
     *  each counts it — one as a win, the other as the same match's loss — and
     *  adding the three gives a record holding both halves of one match. This
     *  folds first and keeps only matches with exactly one covered side. */
    division_vs_outside: { wins: number; draws: number; losses: number; gf: number; ga: number };
  };
  /** Last night, judged: a results night or a quiet day. The prompt's
   *  persistence rules turn on this one word, so it is computed here rather
   *  than left to the writer to infer from the length of a list. */
  night: { date: string; results: number; kind: NightKind };
  /** The previous journal's line, and the two facts about it the writer is
   *  not asked to work out: how old it is, and whether it has aged out. The
   *  age is the journal's own `updated` stamp against the page's "today", and
   *  the threshold is STANDING_MAX_AGE_DAYS — arithmetic done in code so the
   *  rule is data-driven, not the model's. Null when there is no previous
   *  journal. */
  standing: StandingLine | null;
  /** Every story the headline may be chosen from, in the order the desk
   *  ranks them: last night's results first, then each conference's card line
   *  before any conference's second story. On displacement the writer ranks
   *  these on equal footing; the falsified subject is not placed ahead. */
  candidates: Candidate[];
}

export type NightKind = "results" | "quiet";

/** A standing line yields to the strongest current story once it is this
 *  many days old, even when it is still true. Three, by the owner's ruling
 *  (tl-bb4r): the Southwest Baptist line stood four days. */
export const STANDING_MAX_AGE_DAYS = 3;

export interface StandingLine {
  headline: string;
  dek: string | null;
  /** The day the line last changed, from the previous journal; null when
   *  that journal carried no stamp. */
  updated: string | null;
  /** Days from `updated` to the page's as-of; null when there is no stamp. */
  age_days: number | null;
  /** True once age_days has reached STANDING_MAX_AGE_DAYS. */
  aged_out: boolean;
  max_age_days: number;
  fixture_ref: string | null;
  /** Whether the standing line's fixture_ref is one of last night's matches —
   *  the one case a results night does not displace it. */
  about_last_night: boolean;
}

export interface Candidate {
  rank: number;
  kind: "result" | "card" | "headline";
  conferences: string[];
  /** The story, as data: a result's match reference, or a card's line. */
  story: string;
  /** What a result did to a season — "first defeat", "first win", "unbeaten
   *  start over" — computed from each side's record before and after. A
   *  result that changed nothing season-level carries an empty list and
   *  ranks behind the ones that did. */
  meaning?: string[];
}

interface Tally {
  wins: number;
  draws: number;
  losses: number;
}

export interface NightResultSide {
  programme: string;
  conference: string;
  before: Tally;
  after: Tally;
}

export interface NightResult {
  match: string;
  codes: string[];
  sides: NightResultSide[];
}

/** What a result meant to a side, read off its record before and after. */
export function sideMeaning(side: NightResultSide): string[] {
  const { before, after, programme } = side;
  const played = before.wins + before.draws + before.losses;
  const out: string[] = [];
  if (played === 0) out.push(`${programme}: first result of the season`);
  if (before.losses === 0 && after.losses > 0) {
    out.push(played > 0 ? `${programme}: unbeaten start over` : `${programme}: first defeat`);
  }
  if (before.wins === 0 && after.wins > 0 && played > 0) out.push(`${programme}: first win`);
  if (before.draws === 0 && after.draws > 0 && played > 0 && before.losses === 0) {
    out.push(`${programme}: first points dropped`);
  }
  return out;
}

/** The night's kind, from the ledger alone. */
export const nightKind = (results: number): NightKind => (results > 0 ? "results" : "quiet");

/** The standing line's age against the page's as-of, and whether it has
 *  aged out. Pure, so the threshold is a test rather than a model's sum. */
export function standingAge(
  updated: string | undefined | null,
  asOf: string,
): { updated: string | null; age_days: number | null; aged_out: boolean } {
  if (!updated) return { updated: null, age_days: null, aged_out: false };
  const age = daysBetween(updated, asOf);
  return { updated, age_days: age, aged_out: age >= STANDING_MAX_AGE_DAYS };
}

/** The previous journal read as a standing line, with the facts the writer
 *  is told rather than asked to compute. */
export function standingLine(
  previous: Pick<NationalJournalFile, "headline" | "dek" | "updated" | "fixture_ref"> | null,
  asOf: string,
  lastNight: readonly { match: string }[],
): StandingLine | null {
  if (!previous) return null;
  const address = (m: string): string => m.split(" · ")[0]?.trim() ?? m;
  const ref = previous.fixture_ref ?? null;
  return {
    headline: previous.headline,
    dek: previous.dek ?? null,
    ...standingAge(previous.updated, asOf),
    max_age_days: STANDING_MAX_AGE_DAYS,
    fixture_ref: ref,
    about_last_night: ref !== null && lastNight.some((m) => address(m.match) === address(ref)),
  };
}

/**
 * The stories the headline is chosen from, ranked.
 *
 * Results first, the ones that changed a season-level fact ahead of the ones
 * that did not, in ledger order within each. Then the conferences, round
 * robin: every conference's first story (its card line) before any
 * conference's second (its journal headline, when the card shows a wire
 * instead). A list where one conference's whole journal came before the next
 * conference's first line would be the ordering the old prompt fell into —
 * the subject in front of the writer winning by being in front.
 */
export function rankCandidates(
  results: readonly NightResult[],
  conferences: readonly { code: string; stories: readonly string[] }[],
): Candidate[] {
  const out: Candidate[] = [];
  const meant = results.map((r) => ({ r, meaning: r.sides.flatMap(sideMeaning) }));
  const ordered = [
    ...meant.filter((x) => x.meaning.length > 0),
    ...meant.filter((x) => x.meaning.length === 0),
  ];
  for (const { r, meaning } of ordered) {
    out.push({ rank: 0, kind: "result", conferences: r.codes, story: r.match, meaning });
  }
  const deepest = Math.max(0, ...conferences.map((c) => c.stories.length));
  for (let i = 0; i < deepest; i++) {
    for (const c of conferences) {
      const story = c.stories[i];
      if (!story) continue;
      out.push({ rank: 0, kind: i === 0 ? "card" : "headline", conferences: [c.code], story });
    }
  }
  return out.map((c, i) => ({ ...c, rank: i + 1 }));
}

/** A match as the brief names it: the canonical reference, then what the
 *  source published about it — the same grammar the conference brief uses, so
 *  a fixture_ref means the same thing on both. */
const ref = (
  f: { date: string; home: string; away: string } & Record<string, unknown>,
  mark: string | null = null,
): string => {
  const fixture = f as Parameters<typeof canonicalFixtureRef>[0];
  const extra = [
    hasScore(fixture) ? `${fixture.home_score}-${fixture.away_score}` : null,
    mark,
    (fixture.time as string | undefined) ?? null,
  ].filter(Boolean);
  return extra.length
    ? `${canonicalFixtureRef(fixture)}  ·  ${extra.join(" · ")}`
    : canonicalFixtureRef(fixture);
};

/** The mark a folded match carries beside its score: disputed above all,
 *  else a forfeit's. The fold's own flag, not the file's, decides disputed. */
const ledgerMark = (m: DivisionMatch): string | null =>
  m.disputed ? DISPUTED_MARK : isForfeit(m.fixture) ? FORFEIT_MARK : null;

export function buildNationalBrief(
  seasons: readonly Season[],
  previous: NationalJournalFile | null = null,
): NationalBrief {
  const columns = homeColumns(seasons);
  const asOf = nationalAsOf(seasons);
  const counts = divisionCounts(seasons);
  const lede = nationalLede(columns, asOf, counts);
  const night = lastNightOf(asOf);
  const ledger = lastNightLedger(seasons, night);
  const open = lastNightOpen(seasons, night);

  // The card's line, chosen exactly as the card chooses it: the journal's wire
  // when it wrote one, the season headline when it did not.
  const cardLine = (s: Season): string => {
    const journal = loadJournal(s);
    return journal?.wire?.line ?? editorial(s, journal).headline;
  };
  // A conference's stories, first to second: the card line, then the journal
  // headline when the card shows a wire in its place — the same two lines,
  // never a third, so no conference is offered more than it prints.
  const stories = (s: Season): string[] => {
    const journal = loadJournal(s);
    const card = cardLine(s);
    const headline = editorial(s, journal).headline;
    return headline && headline !== card ? [card, headline] : [card];
  };

  const bySlug = new Map<string, Season>();
  for (const s of seasons) for (const p of s.fixtures.programmes) bySlug.set(p.slug, s);
  const codeOf = (slug: string): string => bySlug.get(slug)?.fixtures.conference ?? "—";

  /** One side's record through a date, and through the day before it. */
  const around = (s: Season, slug: string, date: string) => {
    const tally = (results: ReturnType<typeof resultsOf>) => ({
      wins: results.filter((r) => r.result === "W").length,
      draws: results.filter((r) => r.result === "D").length,
      losses: results.filter((r) => r.result === "L").length,
    });
    const all = resultsOf(s, slug);
    return {
      before: tally(all.filter((r) => r.fixture.date < date)),
      after: tally(all.filter((r) => r.fixture.date <= date)),
      form: formOf(s, slug).join("") || "—",
    };
  };

  const results: NightResult[] = ledger.map((m) => ({
    match: ref(m.fixture, ledgerMark(m)),
    codes: m.codes,
    sides: [m.fixture.home, m.fixture.away].map((slug) => {
      const own = bySlug.get(slug) ?? m.season;
      const { before, after } = around(own, slug, night);
      return { programme: slug, conference: codeOf(slug), before, after };
    }),
  }));

  return {
    meta: {
      season: site.season,
      gender: site.gender,
      division: site.division,
      as_of: asOf,
      collected_at: columns.map((c) => ({ conference: c.code, at: c.season.collectedAt })),
    },
    surfaces: {
      kicker: lede.kicker,
      strip: lede.strip,
      cards: columns.map((c) => ({
        code: c.code,
        name: c.name,
        opens: c.opensOn,
        matches_played: c.counts.played,
        matches_total: c.counts.total,
        line: cardLine(c.season),
      })),
      ledger: ledger.map((m) => ({ codes: m.codes, match: ref(m.fixture, ledgerMark(m)) })),
      left_open: open.map((m) => ref(m.fixture)),
    },
    division: {
      matches_total: counts.total,
      matches_played: counts.played,
      silent_finals: counts.silentFinals,
      box_score_gaps: counts.gaps,
      friendlies_excluded: counts.exhibitions,
      duplicated_records: counts.duplicated,
    },
    conferences: columns.map((c) => {
      const s = c.season;
      const silence = unresolved(s);
      const outside = outsideRecord(s);
      return {
        code: c.code,
        name: c.name,
        as_of: s.asOf,
        table: (tableIsLive(s) ? "live" : "pre-conference") as "live" | "pre-conference",
        opens_on: c.opensOn,
        days_until_conference:
          c.opensOn && c.opensOn > s.asOf ? daysBetween(s.asOf, c.opensOn) : null,
        counts: {
          matches_total: c.counts.total,
          matches_played: c.counts.played,
          silent_finals: c.counts.silentFinals,
          past_date_no_result: silence.pastDateNoResult.length,
          box_score_gaps: boxScoreGaps(s).length,
        },
        record_vs_outside: {
          wins: outside.won,
          draws: outside.drawn,
          losses: outside.lost,
          gf: outside.goalsFor,
          ga: outside.goalsAgainst,
        },
      };
    }),
    last_night: {
      date: night,
      results: ledger.map((m) => ({
        match: ref(m.fixture, ledgerMark(m)),
        codes: m.codes,
        home_score: m.fixture.home_score ?? 0,
        away_score: m.fixture.away_score ?? 0,
        ...(ledgerMark(m) ? { mark: ledgerMark(m) as string } : {}),
        ...(m.disputed
          ? {
              scores: m.scores.map((x) => ({
                source: x.source,
                home_score: x.home_score,
                away_score: x.away_score,
              })),
            }
          : {}),
        sides: [m.fixture.home, m.fixture.away].map((slug) => {
          const own = bySlug.get(slug) ?? m.season;
          return { programme: slug, conference: codeOf(slug), ...around(own, slug, night) };
        }),
      })),
      left_open: open.map((m) => ({ match: ref(m.fixture), codes: m.codes })),
    },
    across: {
      goals_for: seasons
        .flatMap((s) =>
          s.fixtures.programmes.map((p) => ({
            programme: p.slug,
            conference: s.fixtures.conference,
            goals: recordOf(s, p.slug).goalsFor,
          })),
        )
        .sort((a, b) => b.goals - a.goals || a.programme.localeCompare(b.programme)),
      records: seasons.flatMap((s) =>
        s.fixtures.programmes.map((p) => {
          const r = recordOf(s, p.slug);
          return {
            programme: p.slug,
            conference: s.fixtures.conference,
            wins: r.won,
            draws: r.drawn,
            losses: r.lost,
            gf: r.goalsFor,
            ga: r.goalsAgainst,
          };
        }),
      ),
      openers: columns
        .filter((c): c is typeof c & { opensOn: string } => c.opensOn !== null && !c.live)
        .map((c) => ({
          conference: c.code,
          opens_on: c.opensOn,
          days_away: daysBetween(asOf, c.opensOn),
        }))
        .sort((a, b) => a.opens_on.localeCompare(b.opens_on)),
      silences: seasons.map((s) => {
        const u = unresolved(s);
        return {
          conference: s.fixtures.conference,
          finals_without_score: {
            count: u.finalsWithoutScore.length,
            matches: u.finalsWithoutScore.map((f) => ref(f)),
          },
          past_date_no_result: {
            count: u.pastDateNoResult.length,
            matches: u.pastDateNoResult.map((f) => ref(f)),
          },
        };
      }),
      division_vs_outside: divisionVsOutside(seasons, bySlug),
    },
    night: { date: night, results: ledger.length, kind: nightKind(ledger.length) },
    standing: standingLine(previous, asOf, results),
    candidates: rankCandidates(
      results,
      columns.map((c) => ({ code: c.code, stories: stories(c.season) })),
    ),
  };
}

/** The division's record against everyone outside it, folded first so a match
 *  between two covered conferences — inside the division, whatever it is to
 *  either conference's own table — counts as neither a win nor a loss. */
export function divisionVsOutside(
  seasons: readonly Season[],
  bySlug: ReadonlyMap<string, Season>,
): { wins: number; draws: number; losses: number; gf: number; ga: number } {
  const out = { wins: 0, draws: 0, losses: 0, gf: 0, ga: 0 };
  for (const m of foldToMatches(allSightings(seasons))) {
    const f = m.fixture;
    // A disputed score is nobody's fact; a forfeit's goals are nobody's goals.
    if (m.disputed || !isScored(f) || !hasScore(f)) continue;
    const home = bySlug.has(f.home);
    const away = bySlug.has(f.away);
    if (home === away) continue; // both covered, or neither: not a division result
    const gf = home ? (f.home_score as number) : (f.away_score as number);
    const ga = home ? (f.away_score as number) : (f.home_score as number);
    if (!isForfeit(f)) {
      out.gf += gf;
      out.ga += ga;
    }
    const result = resultFor(f, home ? "home" : "away");
    if (result === "W") out.wins++;
    else if (result === "L") out.losses++;
    else out.draws++;
  }
  return out;
}

/** Every match the writer may address, across every conference, folded so the
 *  same match is offered once. The address grammar is the conference brief's,
 *  and the codes say which files it came from. */
export function nationalFixtureIndex(seasons: readonly Season[]): string[] {
  const seen = new Map<string, string>();
  for (const s of seasons) {
    for (const f of s.fixtures.fixtures) {
      if (!hasScore(f) && f.date < s.asOf) continue;
      const id = matchIdentity(f);
      if (!seen.has(id)) seen.set(id, ref(f));
    }
  }
  return [...seen.values()].sort();
}
