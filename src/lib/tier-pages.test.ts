// The tier on the site's pages, read from their source in table.test.ts's
// way: the sheet and the team page read no tier field outside ALGORITHM.md
// section 10, the method page is built only through the gate and carries no
// placeholder, and it keeps its place on the Men / Women switch.

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

describe("the method page", () => {
  const page = src("pages/about/[tiers].astro");

  test("is emitted only through the gate: one path while the tiers are on, none otherwise", () => {
    expect(page).toContain('return activeTiers() ? [{ params: { tiers: "tiers" } }] : [];');
    // About's index names it only on the same terms.
    const about = src("pages/about.astro");
    expect(about).toContain("const tiersOn = activeTiers() !== null;");
    expect(about).toContain('{tiersOn && <a class="toc-link" href={aboutTiersHref()}>Tiers</a>}');
  });

  test("reads its division and its dates, and never prints a placeholder", () => {
    for (const rel of ["pages/about/[tiers].astro", "lib/player-tier.ts", "tiers.config.ts"]) {
      expect(src(rel), rel).not.toContain("{{");
    }
    // What the reader meets, the markup: no level and no month by hand.
    const markup = page.slice(page.indexOf("---", 3) + 3);
    expect(markup).not.toMatch(/Division I{1,3}\b/);
    expect(markup).not.toMatch(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/,
    );
    expect(page).not.toMatch(/"Division I{1,3}"/);
    expect(page).toContain("currentDivision.name");
    expect(page).toContain("monLong(tiers.frozen_at)");
    // The owner took the corrections section off the page (16 November 2026):
    // the page promises no address, so it prints none and no stand-in for one.
    expect(page).not.toMatch(/contact|corrections/i);
  });
});

describe("the short method page for a level that shows part of the tiers", () => {
  const scope = src("components/TiersScope.astro");

  test("drawn by the method page in place of the full method, never on its own", () => {
    const page = src("pages/about/[tiers].astro");
    expect(page).toContain("const partial = shown !== null && methodIsShort(shown);");
    expect(page).toContain("{partial && shown ? (");
  });

  test("names no division, month or constant by hand", () => {
    const markup = scope.slice(scope.indexOf("---", 3) + 3);
    expect(markup).not.toMatch(/Division I{1,3}\b/);
    expect(markup).not.toMatch(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/,
    );
    // The constants and the measurement are read from their tables.
    expect(markup).not.toMatch(/0\.\d{2}/);
    expect(scope).toContain("currentDivision.name");
    expect(scope).toContain("CONSTANTS[");
    expect(scope).toContain("shown.measured");
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
