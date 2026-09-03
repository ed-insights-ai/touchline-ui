// Regions, held to the config that declares them.
//
// A region is configuration: a row in site.regions and a name each conference
// gives in site.conferenceRegions. So the claims worth testing are the seam's:
// every configured conference names a listed region, a conference that does
// not fails by name with the table beside it, and the shared grouping follows
// the table's order without inventing a region no conference names.

import { describe, expect, test } from "bun:test";
import { site } from "../site.config.ts";
import {
  assertRegions,
  byRegion,
  missingRegions,
  type RegionConfig,
  regionOf,
  regionsInUse,
} from "./regions.ts";

/** What a call throws, as its message — or "" when it does not throw. */
function thrownMessage(fn: () => void): string {
  try {
    fn();
  } catch (err) {
    return (err as Error).message;
  }
  return "";
}

describe("the live config", () => {
  test("every configured conference names a listed region", () => {
    expect(missingRegions(site.conferences, site)).toEqual([]);
    expect(() => assertRegions(site.conferences)).not.toThrow();
  });

  test("site.regions keys are unique and non-empty; the home conference has a region", () => {
    const keys = site.regions.map((r) => r.key);
    expect(keys.every((k) => k.length > 0)).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
    expect(site.regions.every((r) => r.name.length > 0)).toBe(true);
    expect(regionOf(site.home).key).toBe(site.conferenceRegions[site.home] ?? "");
  });
});

describe("the build gate", () => {
  const cfg: RegionConfig = {
    regions: [{ key: "west", name: "West" }],
    conferenceRegions: { good: "west", unlisted: "atlantis" },
  };
  const keys = ["good", "absent", "unlisted"];

  test("a conference with no region fails, naming it and the conference-region table", () => {
    expect(missingRegions(keys, cfg)).toEqual(["absent", "unlisted"]);
    const message = thrownMessage(() => assertRegions(keys, cfg));
    expect(message).toContain('"absent"');
    expect(message).toContain('"unlisted"');
    expect(message).toContain("conferenceRegions");
    expect(message).toContain("west");
    // The conference that names a listed region is not a fault.
    expect(message).not.toContain("good");
  });

  test("regionOf names the conference and which way it failed", () => {
    expect(thrownMessage(() => regionOf("absent", cfg))).toContain("names no region");
    expect(thrownMessage(() => regionOf("unlisted", cfg))).toContain('"atlantis"');
    expect(regionOf("good", cfg)).toEqual({ key: "west", name: "West" });
  });
});

describe("grouping", () => {
  test("byRegion follows table order and keeps item order", () => {
    const items = site.conferences.map((key, i) => ({ key, i }));
    const groups = byRegion(items);
    expect(groups.map((g) => g.region)).toEqual(regionsInUse(site.conferences));
    // Flattening the groups is a stable sort of the input by region: every item
    // once, in table order by region, in input order within a region.
    const order = site.regions.map((r) => r.key);
    const rank = (item: { key: string }) => order.indexOf(regionOf(item.key).key);
    expect(groups.flatMap((g) => g.items)).toEqual(
      [...items].sort((a, b) => rank(a) - rank(b) || a.i - b.i),
    );
    for (const g of groups) {
      expect(g.items.length).toBeGreaterThan(0);
      for (const item of g.items) expect(regionOf(item.key).key).toBe(g.region.key);
    }
  });

  test("regionsInUse lists only regions with a conference, and never invents one", () => {
    const cfg: RegionConfig = {
      regions: [
        { key: "a", name: "A" },
        { key: "b", name: "B" },
        { key: "c", name: "C" },
      ],
      conferenceRegions: { x: "c", y: "a", z: "c" },
    };
    expect(regionsInUse(["x", "y", "z"], cfg).map((r) => r.key)).toEqual(["a", "c"]);
    expect(regionsInUse([], cfg)).toEqual([]);
    expect(byRegion([{ key: "z" }, { key: "x" }], cfg)).toEqual([
      { region: { key: "c", name: "C" }, items: [{ key: "z" }, { key: "x" }] },
    ]);
    const live = regionsInUse(site.conferences).map((r) => r.key);
    for (const key of live) expect(site.regions.some((r) => r.key === key)).toBe(true);
  });
});
