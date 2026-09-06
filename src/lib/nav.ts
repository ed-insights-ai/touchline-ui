// What the shared header and the home page's conference strip list, and how
// the home ledger folds. Pure, given what the page already holds: the header
// and the strip are two views of one list, so the list is built once here
// and neither surface can offer a conference the other does not.

import { site } from "../site.config.ts";
import type { Season } from "./derive.ts";
import type { MenuEntry } from "./menu.ts";

/** One row per collected conference, in navigation (config) order: the key
 *  the link is built from, the abbreviation the collected file prints, and
 *  the configured full name. A conference that failed to collect is simply
 *  absent — offered and broken is worse than not offered — which is the same
 *  manners the header has always had. */
export function conferenceEntries(seasons: readonly Season[]): MenuEntry[] {
  const byKey = new Map(seasons.map((s) => [s.key, s]));
  return site.conferences.flatMap((key) => {
    const season = byKey.get(key);
    if (!season) return [];
    const abbr = season.fixtures.conference;
    return [{ key, abbr, name: site.conferenceNames[key] ?? abbr }];
  });
}

/** The ledger's first `cap` rows stay in the open; the rest fold behind a
 *  disclosure. A cap at or past the length folds nothing, and a cap below one
 *  is treated as one so the ledger is never entirely behind a summary. */
export function splitLedger<T>(rows: readonly T[], cap: number): { open: T[]; folded: T[] } {
  const at = Math.max(1, Math.floor(cap));
  return { open: rows.slice(0, at), folded: rows.slice(at) };
}

/** The disclosure's summary: every result of the night, counted. */
export const ledgerSummary = (count: number): string => `All ${count} results`;
