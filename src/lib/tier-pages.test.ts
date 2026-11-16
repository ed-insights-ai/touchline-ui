// The tier on the site's pages, read from their source in table.test.ts's
// way: the sheet and the team page read no tier field outside ALGORITHM.md
// section 10, and the method page keeps its place on the Men / Women switch.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { counterpartPath } from "./gender.ts";

const root = join(import.meta.dir, "..");
const src = (rel: string): string => readFileSync(join(root, rel), "utf8");

/** A property read off anything that a tier could carry and section 10 does
 *  not: no score, rank, estimate or percentile for a person, and none of the
 *  build's working figures (threat, the career record). */
const FORBIDDEN_READ = /\.(score|scores|rank|ranking|estimate|percentile|threat|record)\b/g;

describe("the sheet and the team page print only what section 10 holds", () => {
  test("the tier's model reads no field outside it", () => {
    expect(src("lib/player-tier.ts").match(FORBIDDEN_READ) ?? []).toEqual([]);
  });

  test.each([
    "components/PlayerSheet.astro",
    "pages/[conference]/team/[slug].astro",
  ])("%s: no tier line reads one either", (rel) => {
    const lines = src(rel)
      .split("\n")
      .filter((l) => /tier/i.test(l));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l.match(FORBIDDEN_READ) ?? [], l).toEqual([]);
  });

  test("the tier is drawn only from activeTiers, which the gate holds closed", () => {
    // The team page asks the gate once, and the sheet draws only what the
    // page hands it: with null there is no block, no line, no mark, no key.
    const page = src("pages/[conference]/team/[slug].astro");
    expect(page).toContain("const tiers = activeTiers();");
    expect(page).toContain("tier: tiers ? sheetTier(");
    expect(page).toContain("{tiers && <TierStyles />}");
    const sheet = src("components/PlayerSheet.astro");
    expect(sheet).not.toContain("activeTiers");
    expect(sheet).not.toContain("loadTiers");
  });
});

describe("the gender switch keeps the method page", () => {
  test("/about/tiers/ maps to itself, and /about/ still does", () => {
    const target = { conferences: ["gac"], hasTeam: () => false };
    expect(counterpartPath("/about/tiers/", target)).toBe("/about/tiers/");
    expect(counterpartPath("/about/", target)).toBe("/about/");
    expect(counterpartPath("/about/other/", target)).toBe("/");
  });
});
