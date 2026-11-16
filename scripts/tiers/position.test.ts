// ALGORITHM.md section 3, under ruling R-F: a label's group is the site's
// positionLine, mapped to the contract's four groups.

import { describe, expect, test } from "bun:test";
import { positionLine } from "../../src/lib/format.ts";
import { boxGroupTied, GROUP_OF_LINE, group, groupOf, rosterGroup } from "./position.ts";

describe("R-F: group(label) is positionLine, mapped", () => {
  test("GK is GK, DEF is D, MID is M, FWD is F; null, undefined and empty have no group", () => {
    expect(GROUP_OF_LINE).toEqual({ GK: "GK", DEF: "D", MID: "M", FWD: "F" });
    expect(["Goalkeeper", "Defender", "Midfielder", "Forward"].map(group)).toEqual([
      "GK",
      "D",
      "M",
      "F",
    ]);
    expect([group(null), group(undefined), group("")]).toEqual([null, null, null]);
  });

  test("it is the site's parser, called: same answer on every label here", () => {
    const labels = ["Keeper", "LM/RM", "C/B", "F Pathfinder", "M-B", "Utility", "DB", "N/A"];
    for (const label of labels) {
      const line = positionLine(label);
      expect(group(label)).toBe(line === null ? null : GROUP_OF_LINE[line]);
    }
  });

  test("roster labels the 2.2 normaliser could not read now place the player", () => {
    // Each is printed on a 2022-2026 roster and had no group under 2.2.
    expect(group("Center Defensive Midfielder")).toBe("M"); // midfield read before defen
    expect(group("LM/RM")).toBe("M"); // Tiffin's left-or-right midfielder
    expect(group("Forward, Back")).toBe("F"); // the first of several
    expect(group("Keeper")).toBe("GK");
    expect(group("Goakeeper")).toBe("GK"); // "keeper" anywhere
    expect(group("Midifelder")).toBe("M"); // the published-typo table
    expect(group("Left Wing")).toBe("F");
    expect(group("Center-Attacking Midfield")).toBe("M"); // midfield before attack
    expect(group("A/M East Meadow Soccer Club ECNL")).toBe("F"); // club after the initials
  });

  test("the contract's own examples read the same way", () => {
    for (const label of ["F/M", "F\\M", "F-M"]) expect(group(label), label).toBe("F");
    expect(group("Center-Back")).toBe("D");
    expect(group("MF Tonka Fusion Elite")).toBe("M");
    for (const label of ["FM", "C", "N/A", "Manager"]) expect(group(label), label).toBeNull();
  });

  test("labels the 2.2 tables placed and positionLine does not: no group (measured, reported)", () => {
    // DB (101 box-score lines with "- DB"), WB, DM and a centre back with his
    // club after the initials are real positions positionLine has no word for.
    for (const label of ["DB", "- DB", "WB", "DM", "CB Solar ECNL Comp", "K"]) {
      expect(group(label), label).toBeNull();
    }
    // Two full words joined by a hyphen are read as one phrase, midfield first.
    expect(group("Forward-Midfielder")).toBe("M");
  });
});

describe("groupOf: the roster line first, then the box scores", () => {
  test("a roster label with a group wins over every box-score label", () => {
    expect(groupOf("Forward", ["DEF", "DEF", "DEF"])).toBe("F");
  });

  test("no roster label, or one with no group: the most common box-score group", () => {
    expect(groupOf(undefined, ["MID", "FWD", "MID"])).toBe("M");
    expect(groupOf("Utility", ["DEF", "D", "MID"])).toBe("D");
  });

  test("a tie goes to the tied group that appears first in date order", () => {
    // Two MID and two DEF, MID first: M (version 1 took D, by table order).
    expect(groupOf(null, ["MID", "DEF", "MID", "DEF"])).toBe("M");
    expect(groupOf(null, ["DEF", "MID", "MID", "DEF"])).toBe("D");
    // A label with no group neither counts nor sets the order.
    expect(groupOf(null, ["N/A", "FWD", "GK", "GK", "FWD"])).toBe("F");
    expect(boxGroupTied(["MID", "DEF", "MID", "DEF"])).toBe(true);
    expect(boxGroupTied(["MID", "DEF", "MID"])).toBe(false);
  });

  test("neither source gives a group: null (status incomplete, reason no_position)", () => {
    expect(groupOf(undefined, [])).toBeNull();
    expect(groupOf("Utility", ["FM", null, "20"])).toBeNull();
  });
});

describe("[N3] a roster label naming two groups: the one the box scores show most", () => {
  test("parts split on '/', '\\' and ','; the most common in the box scores wins", () => {
    // positionLine reads "D/M" as its first, D; the box scores say M twice, D once.
    expect(group("D/M")).toBe("D");
    expect(rosterGroup("D/M", ["MID", "DEF", "MID"])).toEqual({ group: "M", byBox: true });
    expect(rosterGroup("Midfielder, Forward", ["F", "F"])).toEqual({ group: "F", byBox: true });
    expect(rosterGroup("D\\F", ["FWD"]).group).toBe("F");
    // The box scores agree with the first: decided, but not against it.
    expect(rosterGroup("D/M", ["DEF"])).toEqual({ group: "D", byBox: false });
    expect(groupOf("D/M", ["MID", "DEF", "MID"])).toBe("M");
  });

  test("a tie goes to the part seen first in date order", () => {
    expect(rosterGroup("D/M", ["MID", "DEF"]).group).toBe("M");
    expect(rosterGroup("D/M", ["DEF", "MID"]).group).toBe("D");
    // Labels of a group the roster does not name neither count nor order.
    expect(rosterGroup("D/M", ["FWD", "FWD", "MID"]).group).toBe("M");
  });

  test("none of the parts in the box scores: the label read whole", () => {
    expect(rosterGroup("D/M", ["FWD", "GK"])).toEqual({ group: "D", byBox: false });
    expect(rosterGroup("D/M", [])).toEqual({ group: "D", byBox: false });
  });

  test("hyphen-joined initials split on '-'; other hyphenated labels do not", () => {
    expect(group("F-M")).toBe("F");
    expect(rosterGroup("F-M", ["MID", "MID"]).group).toBe("M");
    expect(rosterGroup(" mf-d ", ["DEF"]).group).toBe("D");
    expect(rosterGroup("GK-F", ["FWD"]).group).toBe("F");
    // "Center-Back" is a word, not initials: one part, one group.
    expect(rosterGroup("Center-Back", ["MID", "MID"])).toEqual({ group: "D", byBox: false });
    expect(rosterGroup("Forward-Midfielder", ["FWD"]).group).toBe("M");
  });

  test("a label naming one group, or none, is read as before", () => {
    expect(rosterGroup("Forward", ["DEF", "DEF"])).toEqual({ group: "F", byBox: false });
    expect(rosterGroup("F/F", ["MID"]).group).toBe("F");
    expect(rosterGroup("Utility", ["MID"]).group).toBeNull();
    expect(rosterGroup(null, ["MID"]).group).toBeNull();
  });
});
