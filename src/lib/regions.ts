// Regions: the one grouping of conferences the site draws above the
// conference itself. A region is a row in site.config (`site.regions`, in
// navigation order) and a name each conference gives (`site.conferenceRegions`);
// it is configuration, never code, so a later division adds regions or
// conferences by editing that file and nothing here.
//
// The footprint map labels regions, the home page bands by region past its
// column cap, and the masthead menu lists conferences region-major. All three
// group through these helpers so none of them groups on its own — one order,
// one notion of "which region", one failure when a conference names none.
//
// The config is a parameter with `site` as its default, so a synthetic set
// (lib/fixtures/density.ts) can drive the same functions the live site does.

import { type SiteConfig, site } from "../site.config.ts";

export type Region = { key: string; name: string };
export type RegionConfig = Pick<SiteConfig, "regions" | "conferenceRegions">;

/** The listed region a conference names. Throws, naming the conference, when
 *  it names none or names one the table does not list. */
export function regionOf(key: string, cfg: RegionConfig = site): Region {
  const r = cfg.conferenceRegions[key];
  if (r === undefined) {
    throw new Error(
      `Touchline: conference "${key}" names no region in site.config (conferenceRegions)`,
    );
  }
  const region = cfg.regions.find((x) => x.key === r);
  if (!region) {
    throw new Error(
      `Touchline: conference "${key}" names region "${r}", which site.regions does not list`,
    );
  }
  return region;
}

/** The conference keys whose region is absent or unlisted, in input order.
 *  Pure: the config is an argument, so the check can be held against any
 *  table, including a deliberately broken one. */
export function missingRegions(keys: readonly string[], cfg: RegionConfig): string[] {
  const listed = new Set(cfg.regions.map((r) => r.key));
  return keys.filter((key) => {
    const r = cfg.conferenceRegions[key];
    return r === undefined || !listed.has(r);
  });
}

/**
 * Refuse to build a site whose conferences do not all name a listed region.
 * Every offender is named in one message: a build that failed once per
 * conference would take as many rebuilds to learn the whole list.
 */
export function assertRegions(keys: readonly string[], cfg: RegionConfig = site): void {
  const missing = missingRegions(keys, cfg);
  if (missing.length === 0) return;
  const listed = cfg.regions.map((r) => r.key).join(", ");
  throw new Error(
    `Touchline: conference ${missing.map((k) => `"${k}"`).join(", ")} names no listed region\n` +
      `  site.regions lists: ${listed || "(nothing)"}\n` +
      `  Every conference in site.config needs a conferenceRegions entry naming one of them.`,
  );
}

/** Items grouped by the region their key names, in `cfg.regions` order; item
 *  order kept within a group; regions with no items dropped. Every item's key
 *  must resolve (regionOf throws otherwise). */
export function byRegion<T extends { key: string }>(
  items: readonly T[],
  cfg: RegionConfig = site,
): { region: Region; items: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const region = regionOf(item.key, cfg);
    const group = groups.get(region.key);
    if (group) group.push(item);
    else groups.set(region.key, [item]);
  }
  return cfg.regions
    .filter((region) => groups.has(region.key))
    .map((region) => ({ region, items: groups.get(region.key) ?? [] }));
}

/** The listed regions, in table order, that at least one key names. */
export function regionsInUse(keys: readonly string[], cfg: RegionConfig = site): Region[] {
  const used = new Set(keys.map((key) => regionOf(key, cfg).key));
  return cfg.regions.filter((region) => used.has(region.key));
}
