// ALGORITHM.md sections 9 and 10: the artifact's shape, and what it may never hold.

import { describe, expect, test } from "bun:test";
import { type TierEntry, type TiersFile, tiersFileSchema } from "../../src/lib/tiers.ts";
import {
  assertNothingForbidden,
  buildArtifact,
  byKeyThenNumber,
  onRoundingTie,
  round1,
  SECTION_10,
  section10Violations,
  serialize,
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

  test("players are sorted by key, then number as printed, a missing number last", () => {
    // "annlee" #10 before #4 in code-unit order, then "zed".
    expect(artifact().players.harding?.map((e) => [e.key, e.number])).toEqual([
      ["annlee", "10"],
      ["annlee", "4"],
      ["zed", null],
    ]);
    expect(byKeyThenNumber(entry({ number: null }), entry({ number: "1" }))).toBe(1);
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
    });
    // The division counts only teams with a workload group.
    expect(a.division).toEqual({ teams: 1, shots_faced_per_match: 22.8, pct_in: 13.2 });
  });

  test("a rounding tie goes up; only .25 and .75 can be one in a double", () => {
    expect(round1(12.25)).toBe(12.3);
    expect(round1(12.75)).toBe(12.8);
    expect(onRoundingTie(12.25)).toBe(true);
    expect(onRoundingTie(12.35)).toBe(false);
    expect(onRoundingTie(12.5)).toBe(false);
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
    expect(() => assertNothingForbidden(a)).toThrow(/not sorted by key, then number/);
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
