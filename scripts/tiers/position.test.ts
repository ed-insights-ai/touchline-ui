// ALGORITHM.md section 3 (version 2): the position normaliser and its tables.

import { describe, expect, test } from "bun:test";
import { boxGroupTied, GROUP_PHRASES, GROUP_WORDS, group, groupOf } from "./position.ts";

describe("group(label): the tables", () => {
  test("every word and every phrase in the contract's tables lands in its group", () => {
    for (const [g, words] of Object.entries(GROUP_WORDS)) {
      for (const w of words) expect(group(w)).toBe(g as never);
    }
    for (const [g, phrases] of Object.entries(GROUP_PHRASES)) {
      for (const p of phrases) expect(group(p)).toBe(g as never);
    }
  });
});

describe("group(label): the contract's own examples", () => {
  test("F/M, F\\M and F-M are F (step 3: the first piece)", () => {
    expect(group("F/M")).toBe("F");
    expect(group("F\\M")).toBe("F");
    expect(group("F-M")).toBe("F");
  });

  test("Center-Back is D (step 2: 'CENTER BACK' once the hyphen is a space)", () => {
    expect(group("Center-Back")).toBe("D");
  });

  test("'MF Tonka Fusion Elite' is M (step 4: the piece's first word)", () => {
    expect(group("MF Tonka Fusion Elite")).toBe("M");
  });

  test("FM, C, N/A and Manager have no group", () => {
    // N/A: step 3 takes "N", step 4 "N"; neither is a word.
    for (const label of ["FM", "C", "N/A", "Manager"]) expect(group(label)).toBeNull();
  });
});

describe("group(label): each step", () => {
  test("step 1: '- MID' strips the dash; 'G.K.' drops full stops; '  defender ' is D", () => {
    expect(group("- MID")).toBe("M");
    expect(group("- FWD")).toBe("F");
    expect(group("G.K.")).toBe("GK");
    expect(group("  defender ")).toBe("D");
  });

  test("step 1: a label with no letters, or none at all, has no group", () => {
    expect(group("- 20 -")).toBeNull();
    expect(group("")).toBeNull();
    expect(group(undefined)).toBeNull();
    expect(group(null)).toBeNull();
  });

  test("step 2: phrases with runs of spaces and hyphens ('Goal  Keeper', 'Center - Mid')", () => {
    expect(group("Goal  Keeper")).toBe("GK");
    expect(group("Goal Keeper")).toBe("GK");
    // "CENTER - MID" collapses to "CENTER MID".
    expect(group("Center - Mid")).toBe("M");
    expect(group("Outside Back")).toBe("D");
  });

  test("step 3: the first piece is a word, or a phrase once collapsed", () => {
    expect(group("Defender/Midfielder")).toBe("D");
    expect(group("Central Midfielder / Forward")).toBe("M");
    expect(group("M\\D")).toBe("M");
  });

  test("step 4: the first word of the piece ('Winger Left' is F, 'Back Four' is D)", () => {
    expect(group("Winger Left")).toBe("F");
    expect(group("Back Four")).toBe("D");
    // "Foward" is a word in its own right now.
    expect(group("Foward")).toBe("F");
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
