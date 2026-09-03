// The masthead menu's packing, held to its rule.
//
// The menu is region-major: whole regions per column, balanced by row count,
// the regions in site.regions order. So the claims worth testing are the
// rule's: every entry lands exactly once, no region is ever split, the order
// is the table's and then the input's, no column is empty, and the balance is
// the greedy bound. The nineteen-set packing is pinned as a literal so a
// change to the rule is a visible test change.

import { describe, expect, test } from "bun:test";
import { site } from "../site.config.ts";
import { type DensitySize, densityConferences, densityConfig } from "./fixtures/density.ts";
import {
  type MenuColumn,
  type MenuEntry,
  menuColumns,
  menuRegions,
  packMenuColumns,
} from "./menu.ts";
import { type RegionConfig, regionOf } from "./regions.ts";

const SIZES: readonly DensitySize[] = [12, 19];

/** The fixture's rows as menu entries, in the fixture's own order. */
const densityEntries = (size: DensitySize): MenuEntry[] =>
  densityConferences(size).map((c) => ({ key: c.key, abbr: c.code, name: c.name }));

/** The live six as the header builds them, without a Season: the name stands
 *  in for the abbreviation, which is all the packing needs. */
const liveEntries: MenuEntry[] = site.conferences.map((key) => ({
  key,
  abbr: key.toUpperCase(),
  name: site.conferenceNames[key] ?? key,
}));

/** Every set the packing is held to: the two fixtures and the live config. */
const SETS: readonly { label: string; entries: MenuEntry[]; cfg: RegionConfig }[] = [
  ...SIZES.map((size) => ({
    label: `density ${size}`,
    entries: densityEntries(size),
    cfg: densityConfig(size),
  })),
  { label: "live", entries: liveEntries, cfg: site },
];

const weight = (r: { rows: unknown[] }): number => r.rows.length + 1;

describe("the packing rule, on every set", () => {
  for (const { label, entries, cfg } of SETS) {
    const columns = menuColumns(entries, cfg);

    test(`${label}: every entry appears exactly once across the columns`, () => {
      const keys = columns.flatMap((c) => c.regions.flatMap((r) => r.rows.map((e) => e.key)));
      expect([...keys].sort()).toEqual(entries.map((e) => e.key).sort());
    });

    test(`${label}: no region is split across columns`, () => {
      const seen = new Map<string, number>();
      columns.forEach((c, i) => {
        for (const r of c.regions) {
          expect(seen.has(r.region.key), r.region.key).toBe(false);
          seen.set(r.region.key, i);
        }
      });
      // And every entry sits under the region its key names.
      for (const c of columns) {
        for (const r of c.regions) {
          for (const e of r.rows) expect(regionOf(e.key, cfg).key).toBe(r.region.key);
        }
      }
    });

    test(`${label}: regions keep site.regions order inside a column, rows keep input order`, () => {
      const tableOrder = cfg.regions.map((r) => r.key);
      const inputOrder = entries.map((e) => e.key);
      for (const c of columns) {
        const ranks = c.regions.map((r) => tableOrder.indexOf(r.region.key));
        expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
        for (const r of c.regions) {
          const positions = r.rows.map((e) => inputOrder.indexOf(e.key));
          expect(positions).toEqual([...positions].sort((a, b) => a - b));
        }
      }
    });

    test(`${label}: at most three columns and never an empty one`, () => {
      expect(columns.length).toBeLessThanOrEqual(3);
      expect(columns.length).toBeGreaterThan(0);
      for (const c of columns) {
        expect(c.regions.length).toBeGreaterThan(0);
        expect(c.rows).toBe(c.regions.reduce((sum, r) => sum + weight(r), 0));
      }
    });

    test(`${label}: the fullest column exceeds the emptiest by at most the largest region`, () => {
      const weights = columns.map((c) => c.rows);
      const largest = Math.max(...columns.flatMap((c) => c.regions.map(weight)));
      expect(Math.max(...weights) - Math.min(...weights)).toBeLessThanOrEqual(largest);
    });
  }
});

describe("the edges", () => {
  test("an empty list gives no columns", () => {
    expect(menuColumns([], site)).toEqual([]);
    expect(packMenuColumns([])).toEqual([]);
  });

  test("one region gives one column", () => {
    const cfg: RegionConfig = {
      regions: [
        { key: "a", name: "A" },
        { key: "b", name: "B" },
      ],
      conferenceRegions: { x: "b", y: "b" },
    };
    const entries: MenuEntry[] = [
      { key: "x", abbr: "X", name: "X" },
      { key: "y", abbr: "Y", name: "Y" },
    ];
    const columns = menuColumns(entries, cfg);
    expect(columns.length).toBe(1);
    expect(columns[0]?.regions.map((r) => r.region.key)).toEqual(["b"]);
    expect(columns[0]?.rows).toBe(3);
  });

  test("fewer than one column is one column; ties go to the first", () => {
    const regions = menuRegions(densityEntries(19), densityConfig(19));
    const one = packMenuColumns(regions, 0);
    expect(one.length).toBe(1);
    expect(one[0]?.regions.length).toBe(regions.length);
    // Two equal regions into three columns: the first two columns, in order.
    const cfg: RegionConfig = {
      regions: [
        { key: "a", name: "A" },
        { key: "b", name: "B" },
      ],
      conferenceRegions: { x: "a", y: "b" },
    };
    const two = menuColumns(
      [
        { key: "x", abbr: "X", name: "X" },
        { key: "y", abbr: "Y", name: "Y" },
      ],
      cfg,
    );
    expect(two.map((c) => c.regions.map((r) => r.region.key))).toEqual([["a"], ["b"]]);
  });
});

describe("the packings, pinned", () => {
  const keysOf = (columns: MenuColumn[]) => columns.map((c) => c.regions.map((r) => r.region.key));

  test("the nineteen: computed by hand from the rule, weights 4 4 3 6 3 5", () => {
    // Northeast (4) opens column one, Mid-Atlantic (4) column two, Midwest (3)
    // column three; Southeast (6) joins the lightest, Midwest's, making 9;
    // South Central (3) joins Northeast's, making 7; West (5) joins the
    // Mid-Atlantic's, making 9. Columns weigh 7, 9, 9.
    const columns = menuColumns(densityEntries(19), densityConfig(19));
    expect(keysOf(columns)).toEqual([
      ["northeast", "south-central"],
      ["mid-atlantic", "west"],
      ["midwest", "southeast"],
    ]);
    expect(columns.map((c) => c.rows)).toEqual([7, 9, 9]);
  });

  test("the twelve: weights 4 4 2 3 3 2 pack the same way, lighter", () => {
    const columns = menuColumns(densityEntries(12), densityConfig(12));
    expect(keysOf(columns)).toEqual([
      ["northeast", "south-central"],
      ["mid-atlantic", "west"],
      ["midwest", "southeast"],
    ]);
    expect(columns.map((c) => c.rows)).toEqual([7, 6, 5]);
  });

  test("the live six, by the same rule against the live config", () => {
    // Not pinned to region names: the live config grows by editing it, and
    // this test must not be the thing that stops a conference being added.
    const columns = menuColumns(liveEntries, site);
    const inUse = new Set(site.conferences.map((k) => regionOf(k).key));
    expect(columns.length).toBe(Math.min(3, inUse.size));
    expect(columns.flatMap((c) => c.regions).length).toBe(inUse.size);
  });
});
