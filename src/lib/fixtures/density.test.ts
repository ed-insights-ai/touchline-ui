// The synthetic density sets, held to the live config and to each other.
//
// They exist so the map, home and masthead can be exercised at twelve and
// nineteen conferences before the site follows that many. So: each set passes
// the same gate the live config passes, its rows are complete and its boxes
// sane, it never contradicts the live config where the two overlap, and
// nothing outside a test imports it.

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { site } from "../../site.config.ts";
import { BASEMAP_VIEWBOX } from "../basemap.ts";
import { regionLabels } from "../geo.ts";
import { assertRegions, byRegion, regionsInUse } from "../regions.ts";
import {
  DENSITY_CONFERENCES,
  DENSITY_REGIONS,
  type DensitySize,
  densityConferences,
  densityConfig,
  densityFootprints,
} from "./density.ts";

const SIZES: readonly DensitySize[] = [12, 19];
const SRC = resolve(import.meta.dir, "..", "..");

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

describe("each size", () => {
  test("passes the region gate with the expected number of unique keys", () => {
    for (const size of SIZES) {
      const cfg = densityConfig(size);
      expect(() => assertRegions(cfg.conferences, cfg)).not.toThrow();
      expect(cfg.conferences.length, `${size}`).toBe(size);
      expect(new Set(cfg.conferences).size, `${size}`).toBe(size);
      expect(densityConferences(size).length).toBe(size);
    }
  });

  test("every row has a code, a name, programmes, and a sane placeholder box", () => {
    for (const c of DENSITY_CONFERENCES) {
      expect(c.code.length, c.key).toBeGreaterThan(0);
      expect(c.name.length, c.key).toBeGreaterThan(0);
      expect(c.programmes, c.key).toBeGreaterThan(0);
      const { latMin, latMax, lonMin, lonMax } = c.box;
      expect(latMin, c.key).toBeLessThan(latMax);
      expect(lonMin, c.key).toBeLessThan(lonMax);
      expect(latMin, c.key).toBeGreaterThanOrEqual(20);
      expect(latMax, c.key).toBeLessThanOrEqual(50);
      expect(lonMin, c.key).toBeGreaterThanOrEqual(-125);
      expect(lonMax, c.key).toBeLessThanOrEqual(-65);
    }
  });

  test("conferenceNames is defined for every key", () => {
    for (const size of SIZES) {
      const cfg = densityConfig(size);
      for (const key of cfg.conferences) expect(cfg.conferenceNames[key], key).toBeDefined();
    }
  });
});

describe("grouping", () => {
  test("at 19, byRegion yields all six regions with the generator's counts", () => {
    const cfg = densityConfig(19);
    const groups = byRegion(densityConferences(19), cfg);
    expect(groups.map((g) => [g.region.key, g.items.length])).toEqual([
      ["northeast", 3],
      ["mid-atlantic", 3],
      ["midwest", 2],
      ["southeast", 5],
      ["south-central", 2],
      ["west", 4],
    ]);
    expect(regionsInUse(cfg.conferences, cfg)).toEqual([...DENSITY_REGIONS]);
  });

  test("at 12, byRegion follows table order and the groups sum to 12", () => {
    const cfg = densityConfig(12);
    const groups = byRegion(densityConferences(12), cfg);
    const order = DENSITY_REGIONS.map((r) => r.key);
    const seen = groups.map((g) => order.indexOf(g.region.key));
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(seen.every((i) => i >= 0)).toBe(true);
    expect(groups.reduce((n, g) => n + g.items.length, 0)).toBe(12);
  });
});

describe("the placeholder footprints", () => {
  test("at 19, one footprint per row with as many placed points as programmes", () => {
    const fps = densityFootprints(19);
    expect(fps.length).toBe(19);
    for (const [i, c] of densityConferences(19).entries()) {
      expect(fps[i]?.key).toBe(c.key);
      expect(fps[i]?.placed.length, c.key).toBe(c.programmes);
      expect(
        fps[i]?.unplaced.map((u) => u.name),
        c.key,
      ).toEqual(c.unplaced ?? []);
    }
  });

  test("at 19, six region labels, all inside the frame", () => {
    const labels = regionLabels(densityFootprints(19), densityConfig(19));
    expect(labels.map((l) => l.region.key)).toEqual(DENSITY_REGIONS.map((r) => r.key));
    const { x, y, w, h } = BASEMAP_VIEWBOX;
    for (const l of labels) {
      expect(l.x, l.region.key).toBeGreaterThanOrEqual(x);
      expect(l.x, l.region.key).toBeLessThanOrEqual(x + w);
      expect(l.y, l.region.key).toBeGreaterThanOrEqual(y);
      expect(l.y, l.region.key).toBeLessThanOrEqual(y + h);
    }
  });

  test("at 12, one label per region in use", () => {
    const cfg = densityConfig(12);
    const labels = regionLabels(densityFootprints(12), cfg);
    expect(labels.map((l) => l.region.key)).toEqual(
      regionsInUse(cfg.conferences, cfg).map((r) => r.key),
    );
  });

  test("the scatter is deterministic", () => {
    expect(densityFootprints(19)).toEqual(densityFootprints(19));
    expect(densityFootprints(12)).toEqual(densityFootprints(12));
  });
});

describe("against the live config", () => {
  test("the regions table is the live one", () => {
    expect(DENSITY_REGIONS).toEqual([...site.regions]);
  });

  test("the six live keys carry the region site.conferenceRegions gives them", () => {
    const cfg = densityConfig(12);
    for (const key of site.conferences) {
      expect(cfg.conferenceRegions[key], key).toBe(site.conferenceRegions[key] ?? "");
    }
    expect(site.conferences.every((key) => cfg.conferences.includes(key))).toBe(true);
  });

  test("nothing in src/ outside a test imports the fixture", () => {
    const offenders = [...walk(SRC)]
      .filter((p) => /\.(ts|astro|mjs|js)$/.test(p) && !/\.test\.ts$/.test(p))
      .filter((p) => p !== resolve(import.meta.dir, "density.ts"))
      .filter((p) => /fixtures\/density(\.ts)?["']/.test(readFileSync(p, "utf8")));
    expect(offenders).toEqual([]);
  });
});
