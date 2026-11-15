import { describe, expect, test } from "bun:test";
import { fixturesOf, loadSeason, matchIdentity } from "./derive.ts";
import { stageTag } from "./postseason.ts";
import { divisionPostseason } from "./postseason-division.ts";
import { chipFrom, stageChipOf, stagePhrase } from "./stage.ts";

describe("a postseason match wears the ledger's tag, and only a postseason match", () => {
  test("the phrase names the round in words, or the tournament when unplaced", () => {
    expect(stagePhrase("NCAA", "R2")).toBe("NCAA second round");
    expect(stagePhrase("GAC", "SF")).toBe("GAC semifinal");
    expect(stagePhrase("GAC", "FINAL")).toBe("GAC final");
    expect(stagePhrase("NCAA", "")).toBe("NCAA tournament");
  });

  test("every chip is the ledger's stageTag, trimmed, and every tie has one", () => {
    const p = divisionPostseason();
    for (const identity of p.byIdentity.keys()) {
      const chip = chipFrom(p, identity);
      expect(chip?.text).toBe(stageTag(p, identity)?.text.trim());
      // The phrase starts on the owner the chip prints.
      expect(chip?.phrase.startsWith(chip.text.split(" ")[0] as string)).toBe(true);
    }
  });

  test("a regular-season fixture carries no chip", () => {
    const s = loadSeason("gac");
    const p = divisionPostseason();
    for (const slug of s.fixtures.programmes.map((x) => x.slug)) {
      for (const f of fixturesOf(s, slug)) {
        if (!p.byIdentity.has(matchIdentity(f))) expect(stageChipOf(f)).toBeNull();
      }
    }
  });
});
