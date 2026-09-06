// What the shared header lists. Pure, given what the page already holds, so
// any surface that names the conferences can build from the one list.

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
