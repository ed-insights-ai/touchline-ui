// The whole contract on a toy division: three programmes, two seasons, every
// match a box score. Small enough that every status can be read off by hand.

import { describe, expect, test } from "bun:test";
import type {
  Fixture,
  MatchDetail,
  MatchPlayerLine,
  MatchTeam,
  Player,
} from "../../src/lib/model.ts";
import { computeGender, type SeasonResult } from "./compute.ts";
import type { ConferenceSeason } from "./matches.ts";

const TEAMS = ["alpha", "beta", "gamma"] as const;
type Slug = (typeof TEAMS)[number];

/** Each programme's eleven: a keeper, four defenders, four midfielders, two
 *  forwards, every one of them 90 minutes of every match. */
const WORD: Record<string, string> = {
  "1": "One",
  "2": "Two",
  "3": "Three",
  "4": "Four",
  "5": "Five",
  "6": "Six",
  "7": "Seven",
  "8": "Eight",
  "9": "Nine",
  "10": "Ten",
  "11": "Eleven",
};
// Names are letters only: the contract's fold keeps letters alone, so "Back 2"
// and "Back 3" would be one person.
const SQUAD: readonly { name: string; position: string; label: string; number: string }[] = [
  { name: "Keeper", position: "Goalkeeper", label: "GK", number: "1" },
  ...["2", "3", "4", "5"].map((n) => ({
    name: `Back ${WORD[n]}`,
    position: "Defender",
    label: "DEF",
    number: n,
  })),
  ...["6", "7", "8", "9"].map((n) => ({
    name: `Mid ${WORD[n]}`,
    position: "Midfielder",
    label: "MID",
    number: n,
  })),
  ...["10", "11"].map((n) => ({
    name: `Striker ${WORD[n]}`,
    position: "Forward",
    label: "FWD",
    number: n,
  })),
];

const person = (slug: Slug, name: string) => `${slug[0]?.toUpperCase()}${slug.slice(1)} ${name}`;

/** A side's box-score table: every shot by the forwards, goals to striker ten. */
function side(slug: Slug, goals: number, shots: number): MatchTeam {
  const players: MatchPlayerLine[] = SQUAD.map((p) => ({
    name: person(slug, p.name),
    number: p.number,
    position: p.label,
    started: true,
    minutes: 90,
    goals: p.number === "10" ? goals : 0,
    shots:
      p.number === "10"
        ? shots - Math.floor(shots / 2)
        : p.number === "11"
          ? Math.floor(shots / 2)
          : 0,
  }));
  return { name: slug, periods: [goals, 0], score: goals, shots, players };
}

/** 18 matches a season, so each programme plays 12, six against each of the
 *  others: alpha always wins 2–0 on 10 shots to 6, beta and gamma draw 1–1 on
 *  8 shots each. */
function season(year: number, hometown: (slug: Slug, name: string) => string): ConferenceSeason {
  const fixtures: Fixture[] = [];
  const matches: Record<string, MatchDetail> = {};
  const pairs: [Slug, Slug][] = [
    ["alpha", "beta"],
    ["beta", "gamma"],
    ["gamma", "alpha"],
  ];
  for (let i = 0; i < 18; i++) {
    const [x, y] = pairs[i % 3] as [Slug, Slug];
    const [home, away] = i % 2 === 0 ? [x, y] : [y, x];
    const score = (s: Slug, o: Slug) => (s === "alpha" ? 2 : o === "alpha" ? 0 : 1);
    const shots = (s: Slug, o: Slug) => (s === "alpha" ? 10 : o === "alpha" ? 6 : 8);
    const id = `t:${year}:${i}`;
    const date = `${year}-09-${String(i + 1).padStart(2, "0")}`;
    fixtures.push({
      id,
      date,
      home,
      away,
      status: "final",
      home_score: score(home, away),
      away_score: score(away, home),
    });
    matches[id] = {
      source_url: `https://example.test/${id}`,
      home_index: 0,
      teams: [
        side(home, score(home, away), shots(home, away)),
        side(away, score(away, home), shots(away, home)),
      ],
      plays: [],
    };
  }
  // A bio URL ending in a number: the roster pass (4.2) sees only entries
  // with a bio id, as the collector's index does.
  const roster = (slug: Slug): Player[] =>
    SQUAD.map((p, i) => ({
      name: person(slug, p.name),
      source_url: `https://example.test/${slug}/roster/${100 + i}`,
      number: p.number,
      position: p.position,
      class_year: year === 2025 ? "Junior" : "Senior",
      hometown: hometown(slug, p.name),
    }));
  return {
    key: "tst",
    fixtures: {
      schema: "touchline.fixtures/2",
      season: year,
      gender: "men",
      conference: "TST",
      collected_at: `${year}-11-30T00:00:00Z`,
      programmes: TEAMS.map((slug) => ({ slug, name: slug, conference: "TST" })),
      fixtures,
    },
    rosters: {
      schema: "touchline.rosters/1",
      season: year,
      gender: "men",
      collected_at: `${year}-11-30T00:00:00Z`,
      rosters: Object.fromEntries(
        TEAMS.map((slug) => [slug, { programme: slug, players: roster(slug) }]),
      ),
    },
    stats: null,
    matches: {
      schema: "touchline.matches/2",
      season: year,
      gender: "men",
      collected_at: `${year}-11-30T00:00:00Z`,
      matches,
    },
  };
}

// In 2026 one of gamma's defenders lists a different home town than in 2025:
// a contradicted link, so that player's 2025 season is not theirs.
const result = computeGender(
  "men",
  new Map([
    [2025, [season(2025, () => "Searcy, Ark.")]],
    [
      2026,
      [
        season(2026, (slug, name) =>
          slug === "gamma" && name === "Back Two" ? "Leeds, England" : "Searcy, Ark.",
        ),
      ],
    ],
  ]),
);
const s2025 = result.seasons[0] as SeasonResult;
const s2026 = result.seasons[1] as SeasonResult;
const find = (s: SeasonResult, slug: Slug, name: string) =>
  s.entries.get(slug)?.find((e) => e.name === person(slug, name));

describe("a toy division, end to end", () => {
  test("every programme played twelve matches: each has a workload group", () => {
    for (const s of [s2025, s2026]) {
      expect(s.teams.map((t) => t.matches)).toEqual([12, 12, 12]);
      expect(s.teams.every((t) => t.workload !== null)).toBe(true);
    }
    // Alpha faced 6 shots a match; beta and gamma faced 10 from alpha six
    // times and 8 from each other six times, (60 + 48) / 12 = 9. Sorted 6, 9,
    // 9 with N = 3: h = 2/3 gives 6 + (2/3) × 3 = 8, h = 4/3 gives 9. Alpha is
    // light; beta and gamma sit on the second boundary and go to the heavier
    // group.
    expect(s2026.teams.map((t) => t.workload)).toEqual(["light", "heavy", "heavy"]);
  });

  test("every player with a box-score line has an entry, with a group from the roster", () => {
    for (const slug of TEAMS) expect(s2026.entries.get(slug)).toHaveLength(11);
    expect(find(s2026, "alpha", "Keeper")?.group).toBe("GK");
    expect(find(s2026, "alpha", "Mid Six")?.kind).toBe("shooting_scoring");
    expect(find(s2026, "alpha", "Back Three")?.kind).toBe("team_defence");
  });

  test("2025 has no season before it: forwards rest on one season, defenders need a second", () => {
    const f = find(s2025, "alpha", "Striker Ten");
    expect(f?.basis.seasons).toEqual([2025]);
    expect(find(s2025, "alpha", "Back Two")?.status).toBe("needs_second_season");
    expect(find(s2025, "alpha", "Keeper")?.basis.seasons).toEqual([2025]);
  });

  test("2026: a linked forward's estimate uses both seasons; the basis sums them", () => {
    const f = find(s2026, "beta", "Striker Ten");
    expect(f?.status === "tier" || f?.status === "eligible").toBe(true);
    expect(f?.basis).toEqual({
      minutes: 2160,
      matches: 24,
      seasons: [2025, 2026],
      class_year: "Senior",
    });
  });

  test("shooting and scoring: n = 6 forwards gives Tier 1 = ceil(0.3) = 1 plus ties", () => {
    // Alpha's striker ten scores two a match from five shots: clear of every
    // other forward, so the one Tier 1 place is theirs.
    expect(find(s2026, "alpha", "Striker Ten")?.tier).toBe(1);
    const tier1F = s2026.rated.filter((r) => r.group === "F" && r.tier === 1);
    expect(tier1F).toHaveLength(1);
    // Midfielders took no shots: twelve equal estimates, so the cut takes all.
    const mids = s2026.rated.filter((r) => r.group === "M");
    expect(new Set(mids.map((r) => r.tier))).toEqual(new Set([1]));
  });

  test("team defence: team-mates with the same seasons share the result", () => {
    // Fifteen defenders and keepers are regulars both seasons; gamma's Back Two
    // has one season counted (next test), so the pool is 14 and the tier is
    // ceil(0.2 × 14) = 3 plus ties. Team-mates with the same seasons have the
    // same career record, so whichever team holds it holds it whole.
    const holders = s2026.rated.filter((r) => r.kind === "team_defence" && r.tier === 1);
    expect(holders.length).toBeGreaterThanOrEqual(3);
    for (const slug of TEAMS) {
      const two = (s2026.entries.get(slug) ?? []).filter(
        (e) => e.kind === "team_defence" && e.basis.seasons.length === 2,
      );
      expect(new Set(two.map((e) => e.status)).size).toBe(1);
    }
    expect(find(s2026, "alpha", "Back Four")?.basis).toEqual({
      minutes: 2160,
      matches: 24,
      seasons: [2025, 2026],
      class_year: "Senior",
    });
  });

  test("a contradicted cross-season link is no link: the season before is not counted", () => {
    const back = find(s2026, "gamma", "Back Two");
    expect(back?.status).toBe("needs_second_season");
    expect(back?.basis.seasons).toEqual([2026]);
    expect(find(s2026, "gamma", "Back Three")?.basis.seasons).toEqual([2025, 2026]);
  });

  test("nothing about a person but their name, number and published basis leaves the build", () => {
    const e = find(s2026, "alpha", "Keeper");
    expect(Object.keys(e ?? {})).toEqual([
      "name",
      "key",
      "player_id",
      "number",
      "group",
      "kind",
      "status",
      "tier",
      "reason",
      "basis",
    ]);
  });
});
