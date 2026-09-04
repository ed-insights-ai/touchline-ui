// The conference table, grouped the way the conference prints it.
//
// Most conferences publish one table. One that publishes its standings in
// divisions marks each member's membership window with the division as the
// conference prints it, and the collector carries that string on
// `programmes[].division` of the fixtures file (touchline.fixtures/2, contract
// changelog 2026-09-04, rib 51dc0d2; the coordinator's ruling, bead
// tl-4sg.40). Which conference, and what its divisions are called, is the
// data's business: nothing here names one.
//
// The rule is all-or-none. The rib's check-membership refuses a
// conference-season where some windows name a division and others do not, so
// a file this site reads carries a division on every programme or on none. A
// mixed file cannot arrive from the rib; if one does, the site must not fall
// over on it, so it reads as a conference with one table and says so in the
// build log.
//
// The printed ORDER is not in the data. The rib writes `programmes[]` in
// membership order, so the order the divisions FIRST APPEAR in `programmes[]`
// is the order the conference prints them, and that is the order the tables
// take here. The day the rib carries an explicit order this is the one place
// to read it from.
//
// Nothing here recomputes a table. A division's table is the conference table
// restricted to the division's members, in the conference-wide ranking
// (points, then goal difference, then the name — model.ts `rank`), so a row's
// figures are the same on its division's table and on the conference-wide
// table beneath it; only the company changes.

import type { FixturesFile, Season, TableRow } from "./derive.ts";

/** The head rule's words on the conference-wide table when it follows the
 *  divisional ones; alone, a conference's one table is headed THE TABLE. */
export const CONFERENCE_WIDE_TITLE = "THE CONFERENCE TABLE";

export interface DivisionTable {
  /** The division's name, exactly as the conference prints it. */
  division: string;
  /** The conference table's rows for this division's members, in the
   *  conference-wide order. */
  rows: TableRow[];
}

/** The divisions a conference-season prints, in printed order (first
 *  appearance in `programmes[]`, see above), or null for a conference that
 *  publishes one table. A mixed file — some programmes with a division, some
 *  without — reads as one table, with a warning naming the odd members. */
export function printedDivisions(file: FixturesFile): string[] | null {
  const without = file.programmes.filter((p) => p.division === undefined).map((p) => p.slug);
  if (without.length === file.programmes.length) return null;
  if (without.length > 0) {
    console.warn(
      `[touchline] ${file.conference} ${file.gender} ${file.season} mixes divisions: ` +
        `every programme must carry a division or none may; rendering one table. ` +
        `Without a division: ${without.join(", ")}`,
    );
    return null;
  }
  const order: string[] = [];
  for (const p of file.programmes) {
    if (p.division !== undefined && !order.includes(p.division)) order.push(p.division);
  }
  return order;
}

/** The given table's rows grouped by division, in printed order, or null for
 *  a conference that publishes one table. The rows are whichever table the
 *  page is showing (the conference table, or the all-matches table before
 *  conference play opens); each keeps its place relative to the others. */
export function groupByDivision(
  file: FixturesFile,
  rows: readonly TableRow[],
): DivisionTable[] | null {
  const divisions = printedDivisions(file);
  if (divisions === null) return null;
  const divisionOf = new Map(file.programmes.map((p) => [p.slug, p.division]));
  return divisions.map((division) => ({
    division,
    rows: rows.filter((r) => divisionOf.get(r.slug) === division),
  }));
}

/** groupByDivision over a season's own fixtures file. */
export const divisionalTables = (s: Season, rows: readonly TableRow[]): DivisionTable[] | null =>
  groupByDivision(s.fixtures, rows);
