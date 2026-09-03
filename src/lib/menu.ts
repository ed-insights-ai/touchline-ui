// The masthead's conference menu, region-major.
//
// The panel lists every conference the site carries as a run of rows under
// its region's small head, and a column takes WHOLE regions, balanced by row
// count. Alphabetical order was given up for this by the owner's ruling: the
// trigger still shows the abbreviation, but the panel reads by region, which
// is the grouping the map and the home page already use.
//
// The regions are config (site.regions, site.conferenceRegions) and the
// grouping is lib/regions.ts byRegion, so nothing here names a conference or
// a region. Pure, and no Season anywhere: the twelve- and nineteen-conference
// fixtures (lib/fixtures/density.ts) drive the same packing the live six do.

import { site } from "../site.config.ts";
import { byRegion, type Region, type RegionConfig } from "./regions.ts";

/** One row of the menu: the key the link is built from, the abbreviation the
 *  row leads with, and the configured full name beside it. */
export interface MenuEntry {
  key: string;
  abbr: string;
  name: string;
}

/** A region's run of rows, under its head. */
export interface MenuRegion {
  region: Region;
  rows: MenuEntry[];
}

/** A rendered column: whole regions, and its packing weight (every row plus
 *  one per region head, since a head takes a line too). */
export interface MenuColumn {
  regions: MenuRegion[];
  rows: number;
}

/** The weight a region adds to a column: its rows and its head. */
const weightOf = (r: MenuRegion): number => r.rows.length + 1;

/** The entries grouped by region, in site.regions order, input order kept
 *  inside a region; regions with no entry are dropped. */
export function menuRegions(entries: readonly MenuEntry[], cfg: RegionConfig = site): MenuRegion[] {
  return byRegion(entries, cfg).map(({ region, items }) => ({ region, rows: items }));
}

/**
 * Whole regions per column, balanced by row count: walk the regions in order
 * and place each in the column with the fewest rows so far (ties go to the
 * first). A region is never split. Columns left empty, when there are fewer
 * regions than columns, are dropped, so the caller renders exactly the columns
 * that exist. Fewer than one column is treated as one.
 */
export function packMenuColumns(regions: readonly MenuRegion[], columns = 3): MenuColumn[] {
  const n = Math.max(1, Math.floor(columns));
  const cols: MenuColumn[] = Array.from({ length: n }, () => ({ regions: [], rows: 0 }));
  for (const r of regions) {
    const target = cols.reduce((a, b) => (a.rows <= b.rows ? a : b));
    target.regions.push(r);
    target.rows += weightOf(r);
  }
  return cols.filter((c) => c.regions.length > 0);
}

/** The menu as the header renders it: the entries grouped and packed. */
export function menuColumns(
  entries: readonly MenuEntry[],
  cfg: RegionConfig = site,
  columns = 3,
): MenuColumn[] {
  return packMenuColumns(menuRegions(entries, cfg), columns);
}
