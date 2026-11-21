// ALGORITHM.md sections 9 and 10 (version 2.2): the artifact's shape, its
// rounding, and what it may never hold.

import { describe, expect, test } from "bun:test";
import { type TierEntry, type TiersFile, tiersFileSchema } from "../../src/lib/tiers.ts";
import {
  assertNothingForbidden,
  BADGE_PERCENT,
  badgeHolders,
  buildArtifact,
  entryOrder,
  pctIn1,
  round1,
  SECTION_10,
  section10Violations,
  serialize,
  shotsPerMatch1,
  teamFigure,
} from "./output.ts";
import type { TeamSeason } from "./workload.ts";

const entry = (over: Partial<TierEntry> = {}): TierEntry => ({
  name: "Ann Lee",
  key: "annlee",
  player_id: "77",
  number: "4",
  group: "F",
  kind: "shooting_scoring",
  status: "tier",
  tier: 1,
  reason: null,
  basis: { minutes: 1620, matches: 18, seasons: [2026], class_year: "Senior" },
  ...over,
});

const team = (over: Partial<TeamSeason> = {}): TeamSeason => ({
  slug: "harding",
  matches: 18,
  goalsAgainst: 54,
  shotsFaced: 410,
  expected: 27.36,
  workload: "heavy",
  load: 410 / 18,
  record: 0,
  score: 0,
  ...over,
});

const artifact = (): TiersFile =>
  buildArtifact({
    level: "d2",
    season: 2026,
    gender: "men",
    frozenAt: "2026-11-16",
    dataCommit: "abc1234+dirty",
    teams: [team(), team({ slug: "aum", matches: 9, workload: null, record: null, score: null })],
    players: new Map([
      [
        "harding",
        [
          entry({ key: "zed", name: "Zed", number: null }),
          entry(),
          entry({ number: "10", status: "eligible", tier: null }),
        ],
      ],
    ]),
  });

describe("the artifact", () => {
  test("keeps section 10's keys in section 10's order, and parses", () => {
    const a = artifact();
    expect(Object.keys(a)).toEqual([...SECTION_10.file]);
    expect(Object.keys(a.division)).toEqual([...SECTION_10.division]);
    expect(Object.keys(a.teams.harding ?? {})).toEqual([...SECTION_10.team]);
    expect(Object.keys(a.players.harding?.[0] ?? {})).toEqual([...SECTION_10.entry]);
    expect(section10Violations(a)).toEqual([]);
    expect(tiersFileSchema.safeParse(a).success).toBe(true);
  });

  test("players are sorted by key, then number as printed, a null number first", () => {
    // "annlee" #10 before #4 in code-unit order, then "zed".
    expect(artifact().players.harding?.map((e) => [e.key, e.number])).toEqual([
      ["annlee", "10"],
      ["annlee", "4"],
      ["zed", null],
    ]);
    expect(entryOrder(entry({ number: null }), entry({ number: "1" }))).toBe(-1);
    expect(entryOrder(entry({ number: "1" }), entry({ number: null }))).toBe(1);
    const sorted = [entry({ number: "7" }), entry({ number: null }), entry({ number: "10" })].sort(
      entryOrder,
    );
    expect(sorted.map((e) => e.number)).toEqual([null, "10", "7"]);
  });

  test("[v2.2] one key and number: then name, then player_id (a null first)", () => {
    const a = entry({ name: "Lee, Ann", number: "4", player_id: "9" });
    const b = entry({ name: "Ann Lee", number: "4", player_id: "12" });
    const c = entry({ name: "Ann Lee", number: "4", player_id: null });
    const d = entry({ name: "Ann Lee", number: "4", player_id: "11" });
    expect([a, b, c, d].sort(entryOrder)).toEqual([c, d, b, a]);
    expect(entryOrder(b, b)).toBe(0);
  });

  test("[v2.2] teams and players hold every program with a record, and only those", () => {
    const a = buildArtifact({
      level: "d2",
      season: 2026,
      gender: "men",
      frozenAt: "2026-11-16",
      dataCommit: "abc1234",
      teams: [
        team({ slug: "harding" }),
        // A record, but no line on any box score: an empty list.
        team({ slug: "aum", matches: 3, workload: null, record: null, score: null }),
        // No record at all: in neither.
        team({ slug: "zz-idle", matches: 0, goalsAgainst: 0, shotsFaced: 0, workload: null }),
      ],
      players: new Map([["harding", [entry()]]]),
    });
    expect(Object.keys(a.teams)).toEqual(["aum", "harding"]);
    expect(Object.keys(a.players)).toEqual(["aum", "harding"]);
    expect(a.players.aum).toEqual([]);
    expect(() =>
      buildArtifact({
        level: "d2",
        season: 2026,
        gender: "men",
        frozenAt: "2026-11-16",
        dataCommit: "abc1234",
        teams: [team()],
        players: new Map([["ghost", [entry()]]]),
      }),
    ).toThrow(/ghost, which has no record/);
  });

  test("team figures are rounded to one decimal; pct_in is null when nothing was faced", () => {
    const a = artifact();
    // 410 / 18 = 22.777… → 22.8; 100 × 54 / 410 = 13.17… → 13.2; 27.36 → 27.4.
    expect(a.teams.harding).toEqual({
      matches: 18,
      workload: "heavy",
      shots_faced_per_match: 22.8,
      pct_in: 13.2,
      goals_conceded: 54,
      opponents_usual: 27.4,
      badge: true,
    });
    // The division counts only teams with a workload group.
    expect(a.division).toEqual({ teams: 1, shots_faced_per_match: 22.8, pct_in: 13.2 });
  });

  test("the badge is the top fifth by record across the division, ties in, workload ignored", () => {
    expect(BADGE_PERCENT).toBe(20);
    const loads = ["light", "typical", "heavy"] as const;
    // Ten teams with a workload group: ceil(0.2 × 10) = 2, and t7 ties the 2nd.
    const teams = Array.from({ length: 10 }, (_, i) =>
      team({ slug: `t${i}`, record: i === 7 ? 0.8 : i / 10, workload: loads[i % 3] }),
    );
    teams[9] = team({ slug: "t9", record: 0.9, workload: "light" });
    teams[8] = team({ slug: "t8", record: 0.8, workload: "light" });
    // No workload group (under twelve matches): never counted, never badged.
    const short = team({ slug: "short", matches: 9, workload: null, record: null, score: null });
    expect([...badgeHolders([...teams, short])].sort()).toEqual(["t7", "t8", "t9"]);
  });

  test("a ratio is rounded half up on its exact value, in integer arithmetic", () => {
    // 247 shots over 20 matches is exactly 12.35. The double 247 / 20 sits a
    // hair below, so toFixed prints 12.3; floor((20·247 + 20) / 40) / 10 = 12.4.
    expect((247 / 20).toFixed(1)).toBe("12.3");
    expect(shotsPerMatch1(247, 20)).toBe(12.4);
    // 23 goals from 2000 shots is exactly 1.15 per cent: toFixed says 1.1,
    // floor((2000·23 + 2000) / 4000) / 10 = 1.2.
    expect(((100 * 23) / 2000).toFixed(1)).toBe("1.1");
    expect(pctIn1(23, 2000)).toBe(1.2);
    // Exactly 12.25 per cent (49 of 400) goes up to 12.3; 12.24… stays down.
    expect(pctIn1(49, 400)).toBe(12.3);
    expect(pctIn1(4899, 40000)).toBe(12.2);
    // Off a tie the formula is ordinary rounding: 410 / 18 = 22.77… → 22.8.
    expect(shotsPerMatch1(410, 18)).toBe(22.8);
    expect(shotsPerMatch1(400, 18)).toBe(22.2);
  });

  test("opponents_usual is floor(EGA × 10 + 0.5) / 10 on the double", () => {
    expect(round1(12.25)).toBe(12.3);
    expect(round1(12.75)).toBe(12.8);
    expect(round1(27.36)).toBe(27.4);
    expect(round1(27.34)).toBe(27.3);
  });

  test("a team with no matches prints null for every ratio and for opponents_usual", () => {
    expect(
      teamFigure(team({ matches: 0, goalsAgainst: 0, shotsFaced: 0, expected: 0, workload: null })),
    ).toEqual({
      matches: 0,
      workload: null,
      shots_faced_per_match: null,
      pct_in: null,
      goals_conceded: 0,
      opponents_usual: null,
      badge: false,
    });
  });

  test("serializes to the same JSON, one team and one entry to a line", () => {
    const a = artifact();
    const text = serialize(a);
    expect(JSON.parse(text)).toEqual(a);
    expect(text.split("\n").filter((l) => l.includes('"key":')).length).toBe(3);
  });
});

describe("section 9: what is never computed or stored", () => {
  const forbidden = ["score", "estimate", "rank", "percentile", "hometown", "height", "weight"];

  test.each(forbidden)("an entry carrying %s is refused at the writer and the reader", (key) => {
    const a = artifact() as unknown as {
      players: Record<string, Record<string, unknown>[]>;
    };
    (a.players.harding as Record<string, unknown>[])[0] = {
      ...(a.players.harding?.[0] ?? {}),
      [key]: 1,
    };
    expect(section10Violations(a)).toContain(`$.players.harding[0].${key}: not in section 10`);
    expect(() => assertNothingForbidden(a as unknown as TiersFile)).toThrow(/sections 9 and 10/);
    expect(tiersFileSchema.safeParse(a).success).toBe(false);
  });

  test("a date of birth in the basis is refused", () => {
    const a = artifact() as unknown as {
      players: { harding: { basis: Record<string, unknown> }[] };
    };
    a.players.harding[0] = {
      ...a.players.harding[0],
      basis: { ...a.players.harding[0]?.basis, dob: "2005-01-01" },
    };
    expect(section10Violations(a)).toContain("$.players.harding[0].basis.dob: not in section 10");
    expect(tiersFileSchema.safeParse(a).success).toBe(false);
  });

  test("a team or the file carrying a rank is refused", () => {
    const a = artifact() as unknown as Record<string, unknown> & {
      teams: Record<string, Record<string, unknown>>;
    };
    a.teams.harding = { ...a.teams.harding, rank: 3 };
    a.order = ["annlee"];
    expect(section10Violations(a)).toEqual(
      expect.arrayContaining([
        "$.order: not in section 10",
        "$.teams.harding.rank: not in section 10",
      ]),
    );
  });

  test("no order inside a tier: a list in any order but key, then number, is refused", () => {
    const a = artifact();
    a.players.harding?.reverse();
    expect(() => assertNothingForbidden(a)).toThrow(/not sorted by key, number, name, player_id/);
  });

  test("the builder refuses an entry it cannot parse (a tier on a needs_minutes player)", () => {
    expect(() =>
      buildArtifact({
        level: "d2",
        season: 2026,
        gender: "men",
        frozenAt: "2026-11-16",
        dataCommit: "abc1234",
        teams: [team()],
        players: new Map([["harding", [entry({ status: "needs_minutes", tier: 1 })]]]),
      }),
    ).toThrow();
  });
});
