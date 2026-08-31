// The facts brief — everything the writer is allowed to know.
//
// The model never sees the raw data home. It sees this: a compact pack of
// figures computed by the SAME functions the pages use, so every number the
// writer can reach is a number the validator can recompute. A writer that
// cannot see an unverifiable number cannot claim one.

import {
  boxScoreGaps,
  canonicalFixtureRef,
  conferenceLeaders,
  conferenceOpensOn,
  exhibitionsOf,
  fixtureCount,
  formOf,
  goalsForByProgramme,
  hasScore,
  isScored,
  latestResults,
  matchDetailOf,
  outsideRecord,
  recordOf,
  type Season,
  scoredCount,
  seasonWindow,
  table,
  tableIsLive,
  unresolved,
  upcomingFixtures,
} from "../../src/lib/derive.ts";
import type { Fixture } from "../../src/lib/model.ts";

export interface Brief {
  meta: {
    season: number;
    gender: string;
    conference: string;
    collected_at: string;
    as_of: string;
    week: string;
    season_window: string;
  };
  programmes: { slug: string; name: string; abbr: string }[];
  table: {
    mode: "live" | "pre-conference";
    conference_opens: string | null;
    days_until_conference: number | null;
    rows: {
      slug: string;
      played: number;
      won: number;
      drawn: number;
      lost: number;
      points: number;
      form: string;
    }[];
  };
  /** The vocabulary the copy must use, named so it cannot be confused.
   *  `played` is a final WITH a published score and nothing else; a final
   *  with no score is a silent final, counted beside it. Offering both under
   *  near-identical names is how a headline ends up claiming twenty matches
   *  where the page beside it shows fifteen. */
  counts: {
    matches_total: number;
    matches_played: number;
    silent_finals: number;
    past_date_no_result: number;
    box_score_gaps: number;
    exhibitions_excluded: number;
  };
  outside_record: { wins: number; draws: number; losses: number; gf: number; ga: number };
  goals_for: Record<string, number>;
  /** Per member: overall record over every scored fixture, conference or not. */
  records: Record<string, { wins: number; draws: number; losses: number; gf: number; ga: number }>;
  /** Names that have scored for each member, from collected box scores only. */
  distinct_scorers: Record<string, string[]>;
  leaders: {
    player: string;
    programme: string;
    position: string | null;
    class: string | null;
    line: string;
  }[];
  keepers: {
    player: string;
    programme: string;
    saves: number;
    goals_against: number;
    shutouts: number;
    save_pct: number | null;
  }[];
  latest_results: string[];
  upcoming: string[];
  silences: { finals_without_score: string[]; past_date_no_result: string[] };
  box_score_gaps: { fixture: string; reason: string }[];
}

/** A fixture as the brief names it: the canonical reference, then whatever is
 *  published about it. The two halves are separated by a bullet so the writer
 *  can see where the address ends — a `fixture_ref` is the address ALONE. */
const ref = (f: Fixture): string => {
  const extra = [hasScore(f) ? `${f.home_score}-${f.away_score}` : null, f.time ?? null].filter(
    Boolean,
  );
  return extra.length
    ? `${canonicalFixtureRef(f)}  ·  ${extra.join(" · ")}`
    : canonicalFixtureRef(f);
};

export function buildBrief(s: Season): Brief {
  const window = seasonWindow(s);
  const opens = conferenceOpensOn(s);
  const silence = unresolved(s);
  const gaps = boxScoreGaps(s);
  const members = s.fixtures.programmes.map((p) => p.slug);

  const scorers: Record<string, string[]> = {};
  for (const slug of members) {
    const found = new Set<string>();
    for (const f of s.fixtures.fixtures) {
      if (f.home !== slug && f.away !== slug) continue;
      const detail = matchDetailOf(s, f.id);
      if (!detail || detail.home_index === undefined) continue;
      const side = f.home === slug ? detail.home_index : 1 - detail.home_index;
      for (const g of detail.scoring ?? []) if (g.team === side) found.add(g.scorer);
    }
    scorers[slug] = [...found].sort();
  }

  const keepers = Object.entries(s.stats?.teams ?? {})
    .filter(([slug]) => members.includes(slug))
    .flatMap(([slug, team]) =>
      team.keepers
        .filter((k) => (k.minutes ?? 0) > 0)
        .map((k) => ({
          player: k.name,
          programme: slug,
          saves: k.saves ?? 0,
          goals_against: k.goals_against ?? 0,
          shutouts: k.shutouts ?? 0,
          save_pct: k.save_pct ?? null,
        })),
    )
    .sort((a, b) => b.saves - a.saves)
    .slice(0, 5);

  const outside = outsideRecord(s);

  return {
    meta: {
      season: s.fixtures.season,
      gender: s.fixtures.gender,
      conference: s.fixtures.conference,
      collected_at: s.collectedAt,
      as_of: s.asOf,
      week: window.weekIndex
        ? `${window.weekIndex} of ${window.weekCount}`
        : `${window.weekCount} matchweeks`,
      season_window: `${window.firstISO} to ${window.lastISO}`,
    },
    programmes: s.fixtures.programmes.map((p) => ({
      slug: p.slug,
      name: p.name,
      abbr: p.abbr ?? s.names.abbr(p.slug),
    })),
    table: {
      mode: tableIsLive(s) ? "live" : "pre-conference",
      conference_opens: opens,
      days_until_conference:
        opens && opens > s.asOf
          ? Math.round((Date.parse(opens) - Date.parse(s.asOf)) / 86_400_000)
          : null,
      rows: table(s).map((r) => ({
        slug: r.slug,
        played: r.played,
        won: r.won,
        drawn: r.drawn,
        lost: r.lost,
        points: r.points,
        form: formOf(s, r.slug).join("") || "—",
      })),
    },
    counts: {
      matches_total: fixtureCount(s),
      matches_played: scoredCount(s),
      silent_finals: silence.finalsWithoutScore.length,
      past_date_no_result: silence.pastDateNoResult.length,
      box_score_gaps: gaps.length,
      exhibitions_excluded: exhibitionsOf(s).length,
    },
    outside_record: {
      wins: outside.won,
      draws: outside.drawn,
      losses: outside.lost,
      gf: outside.goalsFor,
      ga: outside.goalsAgainst,
    },
    goals_for: Object.fromEntries(goalsForByProgramme(s).map((g) => [g.slug, g.goals])),
    records: Object.fromEntries(
      members.map((slug) => {
        const r = recordOf(s, slug);
        return [
          slug,
          { wins: r.won, draws: r.drawn, losses: r.lost, gf: r.goalsFor, ga: r.goalsAgainst },
        ];
      }),
    ),
    distinct_scorers: scorers,
    leaders: conferenceLeaders(s, 8).map((l) => ({
      player: l.player,
      programme: l.programme,
      position: l.position,
      class: l.class,
      line: l.line,
    })),
    keepers,
    latest_results: latestResults(s).map((f) => ref(f)),
    upcoming: upcomingFixtures(s).map((f) => ref(f)),
    silences: {
      finals_without_score: silence.finalsWithoutScore.map((f) => ref(f)),
      past_date_no_result: silence.pastDateNoResult.map((f) => ref(f)),
    },
    box_score_gaps: gaps.map((g) => ({
      fixture: g.fixture ? ref(g.fixture) : g.fixtureId,
      reason: g.reason,
    })),
  };
}

/** Every fixture, for the writer to reference by the `"{date} {home} v {away}"`
 *  form the journal's `featured` block uses. Kept out of the brief's headline
 *  figures so it can be trimmed when a conference's card is long. */
export function fixtureIndex(s: Season): string[] {
  return s.fixtures.fixtures.filter((f) => isScored(f) || f.date >= s.asOf).map((f) => ref(f));
}
