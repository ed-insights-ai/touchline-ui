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
import { bandMeta, homeBands, homeLayout, mapView, openBandIndex } from "../home.ts";
import { assertRegions, byRegion, regionsInUse } from "../regions.ts";
import {
  DENSITY_CONFERENCES,
  DENSITY_REGIONS,
  type DensitySize,
  densityCards,
  densityConferences,
  densityConfig,
  densityFootprints,
} from "./density.ts";

const SIZES: readonly DensitySize[] = [12, 19];
/** The other side of the column cap. */
const SMALL: readonly DensitySize[] = [1, 3];
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
    for (const size of [...SMALL, ...SIZES]) {
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
    for (const size of [...SMALL, ...SIZES]) {
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
      ["mid-atlantic", 2],
      ["midwest", 3],
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

describe("the home page past the cap", () => {
  test("at 12 and 19 the layout is bands, by the fixture's own cap", () => {
    for (const size of SIZES) {
      const cfg = densityConfig(size);
      expect(cfg.homeColumnCap).toBe(site.homeColumnCap);
      expect(homeLayout(size, cfg)).toBe("bands");
    }
  });

  test("the cards are in kickoff order: live first, then by opener", () => {
    for (const size of SIZES) {
      const cards = densityCards(size);
      expect(cards.length).toBe(size);
      const kickoffs = cards.map((c) => c.kickoff ?? "9999-99-99");
      expect([...kickoffs].sort()).toEqual(kickoffs);
      const firstOpener = cards.findIndex((c) => !c.live);
      expect(cards.slice(0, firstOpener).every((c) => c.live)).toBe(true);
      expect(cards.slice(firstOpener).every((c) => !c.live)).toBe(true);
      for (const c of cards) {
        expect(c.line?.length ?? 0).toBeGreaterThan(0);
        expect(c.stamp).toBeNull();
        expect(c.href).toBe("#");
      }
      expect(cards.filter((c) => c.imminent).length).toBeLessThanOrEqual(1);
      // A band is purple exactly when one of its cards is: at both sizes the
      // next kickoff is a live league's, so no card and no band wears it.
      const bands = homeBands(cards, densityConfig(size));
      expect(bands.filter((b) => b.imminent).length).toBe(cards.filter((c) => c.imminent).length);
      expect(bands.filter((b) => b.imminent).length).toBe(0);
    }
  });

  test("at 19, six bands with the generator's counts, and none of them imminent", () => {
    const bands = homeBands(densityCards(19), densityConfig(19));
    expect(bands.map((b) => [b.region.key, b.columns.length])).toEqual([
      ["northeast", 3],
      ["mid-atlantic", 2],
      ["midwest", 3],
      ["southeast", 5],
      ["south-central", 2],
      ["west", 4],
    ]);
    // The most imminent kickoff here is the GLVC's, which is live, so its
    // card wears the phase word and no purple. The Midwest head used to be
    // purple over it: a false signal, by the ruling (tl-4an.19). No band is
    // purple at this size, and with no headline the first opens, the
    // Northeast; a headline about a placeholder programme opens its band.
    expect(bands.filter((b) => b.imminent)).toEqual([]);
    expect(bands.map((b) => b.region.key)[openBandIndex(bands, null, () => null)]).toBe(
      "northeast",
    );
    expect(
      bands.map((b) => b.region.key)[openBandIndex(bands, "gsc-placeholder-1", () => "gsc")],
    ).toBe("southeast");
    for (const b of bands) {
      const meta = bandMeta(b);
      if (b.live > 0) expect(meta, b.region.key).toContain("LIVE");
      else expect(meta, b.region.key).toContain("OPENS");
    }
    // Both kinds of head are exercised at this size.
    expect(bands.some((b) => b.live > 0)).toBe(true);
    expect(bands.some((b) => b.live === 0)).toBe(true);
  });
});

describe("the home page under the cap keeps the map (owner's ruling)", () => {
  const COMPONENT = readFileSync(resolve(SRC, "components", "HomeConferences.astro"), "utf8");

  test("at 1 and 3 the layout is columns, by the fixture's own cap", () => {
    for (const size of SMALL) {
      const cfg = densityConfig(size);
      expect(cfg.conferences.length).toBe(size);
      expect(homeLayout(size, cfg)).toBe("columns");
      expect(densityCards(size).length).toBe(size);
    }
  });

  test("the plain map draws the states, one dot per programme, the footer — and no selection", () => {
    for (const size of SMALL) {
      const cfg = densityConfig(size);
      const fps = densityFootprints(size);
      const view = mapView(fps, null, cfg);
      expect(view.selecting).toBe(false);
      // The states are the basemap's own; every dot is one ink, nothing on,
      // nothing dim, no ring, no region to answer to.
      expect(BASEMAP_VIEWBOX.w).toBeGreaterThan(0);
      expect(view.dots.length).toBe(fps.reduce((n, f) => n + f.placed.length, 0));
      expect(view.dots.length).toBeGreaterThan(0);
      for (const d of view.dots) {
        expect(d.cls, d.slug).toBe("dot");
        expect(d.region, d.slug).toBeNull();
      }
      // The labels are present, one per region in use, and inert.
      expect(view.labels.map((l) => l.key)).toEqual(
        regionsInUse(cfg.conferences, cfg).map((r) => r.key),
      );
      for (const l of view.labels) {
        expect(l.href, l.key).toBeNull();
        expect(l.on, l.key).toBe(false);
      }
      // The footer names the counts the map draws; the placeholder points
      // hold no state, so the state count is honestly zero here.
      expect(view.footer).toBe(`${view.dots.length} PROGRAMMES · ${view.states.length} STATES`);
      expect(view.unplaced).toEqual(fps.flatMap((f) => f.unplaced));
    }
  });

  test("and the selecting map is the same dots with a selection laid over", () => {
    const cfg = densityConfig(3);
    const fps = densityFootprints(3);
    const regionOf = Object.fromEntries(
      fps.map((f) => [f.key, cfg.conferenceRegions[f.key] ?? ""]),
    );
    const view = mapView(
      fps,
      { regionOf, selected: "south-central", headlineProgramme: "gac-placeholder-1" },
      cfg,
    );
    expect(view.selecting).toBe(true);
    expect(view.dots.length).toBe(mapView(fps, null, cfg).dots.length);
    expect(view.dots.filter((d) => d.cls.includes("on")).length).toBe(
      fps
        .filter((f) => regionOf[f.key] === "south-central")
        .reduce((n, f) => n + f.placed.length, 0),
    );
    expect(view.dots.filter((d) => d.cls.includes("hl")).map((d) => d.slug)).toEqual([
      "gac-placeholder-1",
    ]);
    expect(view.labels.map((l) => [l.key, l.on, l.href])).toEqual([
      ["southeast", false, "#region-southeast"],
      ["south-central", true, "#region-south-central"],
    ]);
  });

  test("the columns branch composes the map and nothing that selects", () => {
    // The repo has no component render harness, so the composition is held
    // at the source: the columns branch draws HomeMap in plain mode and no
    // bands, no chips, no script.
    const columns = COMPONENT.slice(
      COMPONENT.indexOf('layout === "columns" ? ('),
      COMPONENT.indexOf(") : ("),
    );
    expect(columns).toContain("<HomeMap");
    expect(columns).not.toContain("<HomeBands");
    expect(columns).not.toContain("<script");
    expect(COMPONENT).toMatch(/layout === "columns"\s*\?\s*mapView\(footprints, null\)/);
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

  test("every live key carries the region site.conferenceRegions gives it", () => {
    // Against the nineteen: the twelve is a synthetic design size, and the
    // live site outgrew it in batch 3.
    const cfg = densityConfig(19);
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
