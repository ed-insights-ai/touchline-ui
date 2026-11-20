// ALGORITHM.md sections 6 and 7: team totals, workload groups, record, score.

import { describe, expect, test } from "bun:test";
import type { Factors } from "./opponents.ts";
import { teamTotals } from "./teams.ts";
import {
  quantile,
  record,
  scoreTeams,
  standardise,
  type TeamTotals,
  workloadBoundaries,
  workloadOf,
} from "./workload.ts";

describe("the linear-interpolation quantile", () => {
  test("whole positions read the value there", () => {
    // N = 7: h = 6 × 1/3 = 2 and 6 × 2/3 = 4, so the 3rd and 5th values.
    const b = workloadBoundaries([7, 1, 6, 2, 5, 3, 4]);
    expect(b).toEqual({ first: 3, second: 5 });
  });

  test("between positions it interpolates", () => {
    // N = 5: h = 4/3, so 10 + (1/3) × 10 = 13.33…; h = 8/3, so 20 + (2/3) × 10.
    expect(quantile([0, 10, 20, 30, 40], 1, 3)).toBeCloseTo(40 / 3, 12);
    expect(quantile([0, 10, 20, 30, 40], 2, 3)).toBeCloseTo(80 / 3, 12);
  });
});

describe("workload groups", () => {
  const b = { first: 3, second: 5 };

  test("a value equal to a boundary goes to the heavier group", () => {
    expect(workloadOf(3, b)).toBe("typical");
    expect(workloadOf(5, b)).toBe("heavy");
  });

  test("just below a boundary stays in the lighter group", () => {
    expect(workloadOf(2.999, b)).toBe("light");
    expect(workloadOf(4.999, b)).toBe("typical");
  });

  test("teams under twelve matches have no group, record or score", () => {
    const t = (slug: string, matches: number, sa: number): TeamTotals => ({
      slug,
      matches,
      goalsAgainst: 10,
      shotsFaced: sa,
      expected: 20,
    });
    // Loads 10, 11, 12 (and a team of 11 matches that is left out).
    const { teams, boundaries } = scoreTeams([
      t("a", 12, 120),
      t("b", 12, 132),
      t("c", 12, 144),
      t("d", 11, 500),
    ]);
    // N = 3: h = 2/3 and 4/3, so 10 + (2/3) × 1 and 11 + (1/3) × 1.
    expect(boundaries?.first).toBeCloseTo(10 + 2 / 3, 12);
    expect(boundaries?.second).toBeCloseTo(11 + 1 / 3, 12);
    expect(teams.map((x) => x.workload)).toEqual(["light", "typical", "heavy", null]);
    expect(teams[3]?.record).toBeNull();
    expect(teams[3]?.score).toBeNull();
    // Each group holds one team: its record standardises to 0.
    expect(teams[0]?.score).toBe(0);
  });
});

describe("record and score", () => {
  test("record = −ln(max(GA, 0.5) / EGA)", () => {
    expect(record(10, 20)).toBeCloseTo(Math.log(2), 12);
    // A clean season counts as half a goal: −ln(0.5 / 20) = ln 40.
    expect(record(0, 20)).toBeCloseTo(Math.log(40), 12);
  });

  test("standardised by the group's mean and population standard deviation", () => {
    // Mean 2, population variance (1 + 0 + 1) / 3 = 2/3.
    const s = standardise([1, 2, 3]);
    expect(s[0]).toBeCloseTo(-1 / Math.sqrt(2 / 3), 12);
    expect(s[1]).toBe(0);
    expect(s[2]).toBeCloseTo(1 / Math.sqrt(2 / 3), 12);
  });
});

describe("team totals over the matches with integer shots and scores", () => {
  const goals: Factors = {
    mu: 1.5,
    home: 1.2,
    att: new Map([
      ["2026:strong", 2],
      ["2026:weak", 0.5],
    ]),
    dfn: new Map(),
  };

  test("n, GA, SA and EGA = Σ mu × att[opponent] / h", () => {
    const t = teamTotals(
      "us",
      [
        // At home to a strong attack: 1.5 × 2 / 1.2 = 2.5.
        {
          opponent: "2026:strong",
          venue: "home",
          goalsFor: 1,
          goalsAgainst: 3,
          shotsFor: 9,
          shotsAgainst: 15,
        },
        // Away to a weak one: 1.5 × 0.5 / (1/1.2) = 0.9.
        {
          opponent: "2026:weak",
          venue: "away",
          goalsFor: 2,
          goalsAgainst: 0,
          shotsFor: 12,
          shotsAgainst: 6,
        },
        // Neutral, an opponent the model has no factor for: EGA takes the goals conceded, 2.
        {
          opponent: "2026:unknown",
          venue: "neutral",
          goalsFor: 0,
          goalsAgainst: 2,
          shotsFor: 4,
          shotsAgainst: 10,
        },
        // No shots printed for one side: not counted at all.
        {
          opponent: "2026:weak",
          venue: "home",
          goalsFor: 5,
          goalsAgainst: 5,
          shotsFor: null,
          shotsAgainst: 20,
        },
      ],
      goals,
    );
    expect(t.matches).toBe(3);
    expect(t.goalsAgainst).toBe(5);
    expect(t.shotsFaced).toBe(31);
    expect(t.expected).toBeCloseTo(2.5 + 0.9 + 2, 12);
  });
});
