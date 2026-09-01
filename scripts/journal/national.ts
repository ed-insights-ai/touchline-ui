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
  formOf,
  hasScore,
  isScored,
  outsideRecord,
  recordOf,
  resultsOf,
  type Season,
  tableIsLive,
  unresolved,
} from "../../src/lib/derive.ts";
import {
  allSightings,
  type DivisionFigures,
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
import { editorial, loadJournal } from "../../src/lib/journal.ts";
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
     *  when the sentence can name it. The strip already prints the division's
     *  total, so the fact left to say is which conference it sits in. */
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
}

/** A match as the brief names it: the canonical reference, then what the
 *  source published about it — the same grammar the conference brief uses, so
 *  a fixture_ref means the same thing on both. */
const ref = (f: { date: string; home: string; away: string } & Record<string, unknown>): string => {
  const fixture = f as Parameters<typeof canonicalFixtureRef>[0];
  const extra = [
    hasScore(fixture) ? `${fixture.home_score}-${fixture.away_score}` : null,
    (fixture.time as string | undefined) ?? null,
  ].filter(Boolean);
  return extra.length
    ? `${canonicalFixtureRef(fixture)}  ·  ${extra.join(" · ")}`
    : canonicalFixtureRef(fixture);
};

export function buildNationalBrief(seasons: readonly Season[]): NationalBrief {
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
      ledger: ledger.map((m) => ({ codes: m.codes, match: ref(m.fixture) })),
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
        match: ref(m.fixture),
        codes: m.codes,
        home_score: m.fixture.home_score ?? 0,
        away_score: m.fixture.away_score ?? 0,
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
  };
}

/** The division's record against everyone outside it, folded first so a match
 *  between two covered conferences — inside the division, whatever it is to
 *  either conference's own table — counts as neither a win nor a loss. */
function divisionVsOutside(
  seasons: readonly Season[],
  bySlug: ReadonlyMap<string, Season>,
): { wins: number; draws: number; losses: number; gf: number; ga: number } {
  const out = { wins: 0, draws: 0, losses: 0, gf: 0, ga: 0 };
  for (const m of foldToMatches(allSightings(seasons))) {
    const f = m.fixture;
    if (!isScored(f) || !hasScore(f)) continue;
    const home = bySlug.has(f.home);
    const away = bySlug.has(f.away);
    if (home === away) continue; // both covered, or neither: not a division result
    const gf = home ? (f.home_score as number) : (f.away_score as number);
    const ga = home ? (f.away_score as number) : (f.home_score as number);
    out.gf += gf;
    out.ga += ga;
    if (gf > ga) out.wins++;
    else if (gf < ga) out.losses++;
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
