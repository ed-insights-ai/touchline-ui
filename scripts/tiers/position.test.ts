// ALGORITHM.md section 3: the position-group table, read literally.

import { describe, expect, test } from "bun:test";
import { boxGroupTied, GROUP_LABELS, group, groupOf } from "./position.ts";

describe("group(label)", () => {
  test("every label in the contract's table lands in its group", () => {
    for (const [g, labels] of Object.entries(GROUP_LABELS)) {
      for (const label of labels) expect(group(label)).toBe(g as never);
    }
  });

  test("upper-cases and trims: ' defender ' is D, 'Goalkeeper' is GK", () => {
    expect(group(" defender ")).toBe("D");
    expect(group("Goalkeeper")).toBe("GK");
    expect(group("mid")).toBe("M");
  });

  test("a slash keeps the part before it: 'M/F' is M, 'Defender/Midfielder' is D", () => {
    expect(group("M/F")).toBe("M");
    expect(group("Defender/Midfielder")).toBe("D");
    expect(group("F / M")).toBe("F");
  });

  test("full stops are dropped: 'G.K.' is GK, 'Def.' is D, 'F.' is F", () => {
    expect(group("G.K.")).toBe("GK");
    expect(group("Def.")).toBe("D");
    expect(group("F.")).toBe("F");
  });

  test("a label outside the table is not recognised, however plain its meaning", () => {
    for (const label of ["Center Back", "Goal Keeper", "Winger", "- MID", "F-M", "", "N/A"]) {
      expect(group(label)).toBeNull();
    }
    expect(group(undefined)).toBeNull();
  });
});

describe("groupOf: the roster first, then the box scores", () => {
  test("a recognised roster label wins over every box-score label", () => {
    expect(groupOf("Forward", ["DEF", "DEF", "DEF"])).toBe("F");
  });

  test("no roster label, or an unrecognised one: the most common box-score group", () => {
    expect(groupOf(undefined, ["MID", "FWD", "MID"])).toBe("M");
    expect(groupOf("Center Back", ["DEF", "D", "MID"])).toBe("D");
  });

  test("a tie between box-score groups goes to the table's order, GK D M F", () => {
    // Two DEF and two MID: D comes before M in the table.
    expect(groupOf(null, ["MID", "DEF", "MID", "DEF"])).toBe("D");
    expect(boxGroupTied(["MID", "DEF", "MID", "DEF"])).toBe(true);
    expect(boxGroupTied(["MID", "DEF", "MID"])).toBe(false);
  });

  test("neither source gives a group: null (status incomplete, reason no_position)", () => {
    expect(groupOf(undefined, [])).toBeNull();
    expect(groupOf("Utility", ["- MID", null, "20"])).toBeNull();
  });
});
