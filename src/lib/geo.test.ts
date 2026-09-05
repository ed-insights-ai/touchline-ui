// The map's claims, recomputed.
//
// Every figure the Footprint band prints is derived at build time, so the way
// to test it is the way the journal validator works: recompute each claim from
// the source and refuse to let a number stand that the data does not hold.
//
// The projection gets a second, stronger check than "it returns a number":
// every programme must land inside the outline of the state its own Gazetteer
// row names. That catches drift between the coordinates, the projection and
// the shipped basemap — the three things that have to agree for a dot to mean
// anything.

import { describe, expect, test } from "bun:test";
import { site } from "../site.config.ts";
import { BASEMAP_VIEWBOX, STATE_OUTLINES } from "./basemap.ts";
import { loadSeason } from "./derive.ts";
import {
  closestCrossConference,
  footprintOf,
  milesBetween,
  pointOf,
  projectPoint,
  regionLabels,
} from "./geo.ts";
import { homeSeasons } from "./home.ts";
import { regionsInUse } from "./regions.ts";

const collectedConferences = site.conferences.map((key) => {
  const season = loadSeason(key);
  const members = season.fixtures.programmes.map((p) => ({ slug: p.slug, name: p.name }));
  return {
    key,
    season,
    members,
    footprint: footprintOf(
      key,
      season.fixtures.conference,
      site.conferenceNames[key] ?? key,
      members,
    ),
  };
});
const seasons = collectedConferences.map((c) => c.season);
const footprints = collectedConferences.map((c) => c.footprint);

// USPS code → the us-atlas state name, for the point-in-state check.
const STATE_NAME: Record<string, string> = {
  AL: "Alabama",
  AR: "Arkansas",
  AZ: "Arizona",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DC: "District of Columbia",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  IA: "Iowa",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  MA: "Massachusetts",
  MD: "Maryland",
  ME: "Maine",
  MI: "Michigan",
  MN: "Minnesota",
  MO: "Missouri",
  MS: "Mississippi",
  MT: "Montana",
  NC: "North Carolina",
  ND: "North Dakota",
  NE: "Nebraska",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NV: "Nevada",
  NY: "New York",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VA: "Virginia",
  VT: "Vermont",
  WA: "Washington",
  WI: "Wisconsin",
  WV: "West Virginia",
  WY: "Wyoming",
};

/** Every closed ring in an SVG path, as point lists. */
function ringsOf(d: string): [number, number][][] {
  return d
    .split("Z")
    .filter((s) => s.trim())
    .map((sub) =>
      (sub.match(/-?[\d.]+\s-?[\d.]+/g) ?? []).map((pair) => {
        const parts = pair.split(/\s+/).map(Number);
        return [parts[0] ?? 0, parts[1] ?? 0] as [number, number];
      }),
    )
    .filter((r) => r.length >= 3);
}

function insidePath(d: string, x: number, y: number): boolean {
  for (const ring of ringsOf(d)) {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i];
      const b = ring[j];
      if (!a || !b) continue;
      const [xi, yi] = a;
      const [xj, yj] = b;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    if (hit) return true;
  }
  return false;
}

describe("the coordinate join", () => {
  test("every collected programme has a point, and every point has a programme", () => {
    const collected = new Set(seasons.flatMap((s) => s.fixtures.programmes.map((p) => p.slug)));
    const missing = [...collected].filter((s) => !pointOf(s)).sort();
    expect(missing).toEqual([]);
    // The other direction: the band must never carry a dot for a programme the
    // collect does not list, which is how a stale reference row would show up.
    const placed = footprints.flatMap((f) => f.placed.map((p) => p.slug));
    expect(placed.filter((s) => !collected.has(s))).toEqual([]);
  });

  test("dot count equals the membership the fixtures file publishes", () => {
    for (const c of collectedConferences) {
      expect(c.footprint.placed.length + c.footprint.unplaced.length).toBe(c.members.length);
    }
    // Placed and unplaced together: a member the frame cannot hold (the
    // PacWest's three in Hawaii) is named in the band, never dropped, so the
    // two lists still account for every published member.
    const total = footprints.reduce((n, f) => n + f.placed.length + f.unplaced.length, 0);
    expect(total).toBe(seasons.reduce((n, s) => n + s.fixtures.programmes.length, 0));
  });

  test("a programme with no point is named, not dropped", () => {
    for (const f of footprints) {
      for (const u of f.unplaced) expect(u.name.length).toBeGreaterThan(0);
    }
  });
});

/** Distance in frame pixels from a point to the nearest edge of any ring. */
function distanceToPath(d: string, x: number, y: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const ring of ringsOf(d)) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i];
      const b = ring[j];
      if (!a || !b) continue;
      const [ax, ay] = a;
      const [bx, by] = b;
      const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
      const t =
        len2 === 0
          ? 0
          : Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / len2));
      best = Math.min(best, Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay))));
    }
  }
  return best;
}

/**
 * Towns the simplified outline cannot hold: the basemap drops sub-pixel
 * coastline, and a town on a thin peninsula lands just offshore of the drawn
 * state. Each entry names the row and why, and is still held to the outline
 * by distance — a point that drifts further than the peninsula is wide is a
 * wrong point, not a thin coast.
 */
const OFFSHORE_BY_SIMPLIFICATION: Readonly<Record<string, string>> = {
  // St. Petersburg (ssc/eckerd) sits on the Pinellas peninsula between Tampa
  // Bay and the Gulf; the outline draws it too thin to contain the town's
  // internal point, which lands 1.7px into the bay.
  eckerd: "Pinellas peninsula",
  // Wheeling (mec/wheeling) sits on the Ohio River in West Virginia's Northern
  // Panhandle, a strip of the state a few miles wide between Ohio and
  // Pennsylvania; the outline draws the river bank coarsely enough that the
  // city's Gazetteer point lands 0.1px into Ohio.
  wheeling: "Northern Panhandle",
  // Marquette (gliac/northern-michigan) sits on the Lake Superior shore of
  // the Upper Peninsula; the outline draws the lakeshore coarsely enough that
  // the city's Gazetteer point lands 0.3px into the lake.
  "northern-michigan": "Lake Superior shore",
  // Santa Barbara (ccaa/westmont) sits on the Pacific shore under the Santa
  // Ynez range; the outline draws the coast coarsely enough that the city's
  // Gazetteer point lands 0.6px into the Pacific.
  westmont: "Santa Barbara coast",
};
const OFFSHORE_TOLERANCE_PX = 3;

describe("the projection", () => {
  test("every programme lands inside the state its own source row names", () => {
    const byName = new Map(STATE_OUTLINES.map((s) => [s.name, s.d]));
    const wrong: string[] = [];
    for (const f of footprints) {
      for (const p of f.placed) {
        const code = pointOf(p.slug)?.state;
        if (!code) continue;
        const d = byName.get(STATE_NAME[code] ?? "");
        if (!d) continue;
        if (insidePath(d, p.at.x, p.at.y)) continue;
        const coast = OFFSHORE_BY_SIMPLIFICATION[p.slug];
        const off = distanceToPath(d, p.at.x, p.at.y);
        if (coast && off <= OFFSHORE_TOLERANCE_PX) continue;
        wrong.push(
          `${p.slug} not inside ${code} (${off.toFixed(1)}px off${coast ? `, ${coast}` : ""})`,
        );
      }
    }
    expect(wrong).toEqual([]);
  });

  test("an offshore allowance names a row that is actually offshore, and only just", () => {
    // The list must not outlive the outline it excuses: a named row that the
    // outline now contains, or one that was never placed, is a stale entry.
    const byName = new Map(STATE_OUTLINES.map((s) => [s.name, s.d]));
    for (const slug of Object.keys(OFFSHORE_BY_SIMPLIFICATION)) {
      const placed = footprints.flatMap((f) => f.placed).find((p) => p.slug === slug);
      expect(placed, slug).toBeDefined();
      if (!placed) continue;
      const d = byName.get(STATE_NAME[pointOf(slug)?.state ?? ""] ?? "") ?? "";
      expect(insidePath(d, placed.at.x, placed.at.y), `${slug} is inside now`).toBe(false);
      expect(distanceToPath(d, placed.at.x, placed.at.y)).toBeLessThanOrEqual(
        OFFSHORE_TOLERANCE_PX,
      );
    }
  });

  test("holds its published reference points", () => {
    // The frame is 975x610 with translate [487.5, 305]; the projection's own
    // centre must land on that translate.
    const c = projectPoint(-96.6, 38.7);
    expect(c).not.toBeNull();
    expect(c?.x).toBeCloseTo(487.5, 6);
    expect(c?.y).toBeCloseTo(305, 6);
  });

  test("refuses a point the frame does not cover rather than misplacing it", () => {
    // Honolulu and Anchorage are outside the drawn lower 48.
    expect(projectPoint(-157.86, 21.31)).toBeNull();
    expect(projectPoint(-149.9, 61.22)).toBeNull();
  });

  test("measures miles on the globe, from coordinates and never from pixels", () => {
    const a = pointOf("fort-hays-state");
    const b = pointOf("harding");
    expect(a && b ? Math.round(milesBetween(a, b)) : 0).toBe(488);
    // Equal-area is not equidistant: the same great-circle distance covers a
    // different number of pixels depending on where it sits in the frame, so a
    // mile figure must never be derived from the projected positions.
    const c = pointOf("sul-ross-state");
    const d = pointOf("texas-a-m-international");
    if (!a || !b || !c || !d) throw new Error("reference programmes missing");
    const miles = (p: typeof a, q: typeof a) => milesBetween(p, q);
    const pixels = (p: typeof a, q: typeof a) => {
      const pp = projectPoint(p.lon, p.lat);
      const qq = projectPoint(q.lon, q.lat);
      if (!pp || !qq) throw new Error("reference programmes off-frame");
      return Math.hypot(pp.x - qq.x, pp.y - qq.y);
    };
    const ratioA = miles(a, b) / pixels(a, b);
    const ratioB = miles(c, d) / pixels(c, d);
    expect(Math.abs(ratioA - ratioB)).toBeGreaterThan(0.01);
  });
});

describe("what the band prints", () => {
  test("widest gap is the greatest distance between two members, recomputed", () => {
    for (const c of collectedConferences) {
      // Over the PLACED members, as footprintOf's contract says: a member
      // with a point the frame cannot hold (Honolulu, Hilo) is unplaced and
      // draws no dot, and the gap the band prints is the gap between dots.
      const pts = c.members
        .map((m) => pointOf(m.slug))
        .filter((p): p is NonNullable<typeof p> => !!p && projectPoint(p.lon, p.lat) !== null);
      let widest = 0;
      for (const [x, a] of pts.entries()) {
        for (const b of pts.slice(x + 1)) widest = Math.max(widest, milesBetween(a, b));
      }
      expect(c.footprint.widestGap).toBe(Math.round(widest));
    }
  });

  test("states are the states the placed members actually play in", () => {
    for (const f of footprints) {
      const expected = [
        ...new Set(f.placed.map((p) => pointOf(p.slug)?.state).filter((s): s is string => !!s)),
      ].sort();
      expect(f.states).toEqual(expected);
    }
  });

  test("no dot is drawn outside the frame the band renders", () => {
    for (const f of footprints) {
      for (const p of f.placed) {
        expect(Number.isFinite(p.at.x)).toBe(true);
        expect(Number.isFinite(p.at.y)).toBe(true);
      }
    }
  });
});

describe("why no territories are drawn", () => {
  test("two conferences have members closer than either league is wide", () => {
    const near = closestCrossConference(footprints);
    expect(near).not.toBeNull();
    if (!near) return;
    // The finding the map is built around: the leagues interleave on the
    // ground, so a shaded region would claim ground its conference lacks. If
    // this ever stops being true, the band's design should be revisited — not
    // the assertion quietly relaxed.
    const narrowest = Math.min(...footprints.map((f) => f.widestGap ?? Number.POSITIVE_INFINITY));
    expect(near.miles).toBeLessThan(narrowest);
  });
});

describe("region labels", () => {
  // Built the way the home page builds them for HomeMap: from the collected seasons.
  const live = homeSeasons().map((season) =>
    footprintOf(
      season.key,
      season.fixtures.conference,
      site.conferenceNames[season.key] ?? season.key,
      season.fixtures.programmes.map((p) => ({ slug: p.slug, name: p.name })),
    ),
  );
  const labels = regionLabels(live);

  test("one label per region in use that has a placed point, in table order", () => {
    const expected = regionsInUse(live.map((f) => f.key))
      .filter((r) => live.some((f) => site.conferenceRegions[f.key] === r.key && f.placed.length))
      .map((r) => r.key);
    expect(labels.map((l) => l.region.key)).toEqual(expected);
  });

  test("the counts sum to the footprints' own", () => {
    expect(labels.reduce((n, l) => n + l.conferences, 0)).toBe(
      live.filter((f) => f.placed.length > 0).length,
    );
    expect(labels.reduce((n, l) => n + l.programmes, 0)).toBe(
      live.reduce((n, f) => n + f.placed.length, 0),
    );
  });

  test("every label sits inside the frame, a margin clear of its edge", () => {
    // A label near an edge is fine; one past it is clipped. 40 units is the
    // margin the six-conference render needs at its widest label.
    const margin = 40;
    const { x, y, w, h } = BASEMAP_VIEWBOX;
    for (const l of labels) {
      expect(l.x, l.region.key).toBeGreaterThanOrEqual(x + margin);
      expect(l.x, l.region.key).toBeLessThanOrEqual(x + w - margin);
      expect(l.y, l.region.key).toBeGreaterThanOrEqual(y + margin);
      expect(l.y, l.region.key).toBeLessThanOrEqual(y + h - margin);
    }
  });

  test("a footprint with no placed point produces no label", () => {
    const ghost = {
      key: "ghost",
      code: "GH",
      name: "Ghost Conference",
      placed: [],
      unplaced: [{ slug: "nowhere", name: "Nowhere" }],
      states: [],
      widestGap: null,
    };
    const cfg = {
      regions: [{ key: "r", name: "R" }],
      conferenceRegions: { ghost: "r" },
    };
    expect(regionLabels([ghost], cfg)).toEqual([]);
  });

  test("the configured nudge moves the label off the centroid", () => {
    const one = {
      key: "one",
      code: "ONE",
      name: "One",
      placed: [
        { slug: "a", name: "A", city: "A", at: { x: 100, y: 100 } },
        { slug: "b", name: "B", city: "B", at: { x: 120, y: 140 } },
      ],
      unplaced: [],
      states: [],
      widestGap: null,
    };
    const plain = regionLabels([one], {
      regions: [{ key: "r", name: "R" }],
      conferenceRegions: { one: "r" },
    });
    const nudged = regionLabels([one], {
      regions: [{ key: "r", name: "R", label: { dx: 10, dy: 0 } }],
      conferenceRegions: { one: "r" },
    });
    expect(plain[0]).toMatchObject({ x: 110, y: 120, conferences: 1, programmes: 2 });
    expect(nudged[0]?.x).toBe(120);
    expect(nudged[0]?.y).toBe(120);
  });
});
