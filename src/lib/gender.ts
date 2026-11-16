// The Men / Women switch (lib side). Each gender is its own static build,
// served side by side: the men's site at the deploy's root base and the
// women's under /women (site.config `genderPath`). The switch is a plain link
// to the matching page of the other build, so it works with scripting off.
//
// "Matching" is decided here, at build time, from what the other build will
// actually contain: its conference list is config, and its programmes are in
// its own fixtures file in the shared data home. A page with no counterpart
// falls back to the nearest one that exists, so the switch never links into a
// 404: a team the other gender does not field lands on that conference's
// overview, and a conference the other gender does not follow lands on home.
//
// The NCAA divisions are builds on the same terms, one level up: Division II
// at the root base, Division I under /d1 (site.config `divisionPath`), each
// with its own genders beneath it. A build's base is root + division + gender,
// and every switch strips its own two segments to find the root.

import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  buildPath,
  deployGenders,
  divisionPath,
  divisions,
  type Gender,
  genderOrder,
  genderPath,
  type NcaaDivisionKey,
  profiles,
  site,
} from "../site.config.ts";
import { dataHome, readParsed, seasonKey } from "./data.ts";
import { fixturesFileSchema } from "./model.ts";

/** What the switch needs to know about the build it links into. */
export interface Counterpart {
  conferences: readonly string[];
  /** Whether that build has a team page for this programme in this conference. */
  hasTeam: (conference: string, slug: string) => boolean;
}

/**
 * The path, within the other build, that best matches `within` (a path inside
 * this build, starting and ending with "/"). Pure, so the fallbacks can be
 * held against any counterpart.
 */
export function counterpartPath(within: string, target: Counterpart): string {
  const parts = within.split("/").filter(Boolean);
  if (parts.length === 0) return "/";
  if (parts.length === 1 && parts[0] === "about") return "/about/";
  const [conf, view, slug] = parts;
  if (!conf || !target.conferences.includes(conf)) return "/";
  if (view === "matches" && parts.length === 2) return `/${conf}/matches/`;
  if (view === "team" && slug && target.hasTeam(conf, slug)) return `/${conf}/team/${slug}/`;
  // A conference overview, a match (whose id belongs to this gender's record
  // alone), or a team the other gender does not field: the conference.
  return `/${conf}/`;
}

/** The root base every build hangs off: this build's base without its own
 *  division and gender segments. "/touchline-ui/women" → "/touchline-ui",
 *  "/touchline-ui/d1" → "/touchline-ui". */
export function rootBase(base: string, own: Gender, division: NcaaDivisionKey): string {
  const b = base.replace(/\/+$/, "");
  const seg = buildPath(division, own);
  return seg && b.endsWith(seg) ? b.slice(0, -seg.length) : b;
}

/** This build's base, without the trailing slash Astro gives it. */
const BASE = (import.meta.env?.BASE_URL ?? "/").replace(/\/+$/, "");

/** The address of the page `pathname` (as the browser sees it, base and all)
 *  in `target`'s build of this build's own division. */
export function genderHref(
  target: Gender,
  pathname: string,
  counterpart: Counterpart = counterpartOf(target),
  base: string = BASE,
  own: Gender = site.gender,
  division: NcaaDivisionKey = site.ncaaDivision,
): string {
  const here = pathname.replace(/\/?$/, "/");
  const within = base && here.startsWith(`${base}/`) ? here.slice(base.length) : here;
  const path = target === own ? within : counterpartPath(within, counterpart);
  return `${rootBase(base, own, division)}${buildPath(division, target)}${path}`;
}

/** The gender a reader lands on in `target`'s division: their own when that
 *  division fields it in this deploy, else the first it does. Null when the
 *  division publishes no build at all. */
export function divisionGender(
  target: NcaaDivisionKey,
  own: Gender = site.gender,
  genders: readonly Gender[] = deployGenders,
): Gender | null {
  const fielded = genderOrder.filter((g) => genders.includes(g) && profiles[target][g]);
  return fielded.includes(own) ? own : (fielded[0] ?? null);
}

/** The home of `target`'s build: a division's conferences are its own, so
 *  there is no matching page to find, and the switch lands on that division's
 *  home in the reader's gender where it fields one. Null when the division
 *  publishes nothing (the header then prints the row unlinked). */
export function divisionHref(
  target: NcaaDivisionKey,
  base: string = BASE,
  own: Gender = site.gender,
  division: NcaaDivisionKey = site.ncaaDivision,
  genders: readonly Gender[] = deployGenders,
): string | null {
  const g = divisionGender(target, own, genders);
  if (!g) return null;
  return `${rootBase(base, own, division)}${divisionPath[target]}${genderPath[g]}/`;
}

/** The other gender's build of this division, read from config and this
 *  division's own data home (both genders of a division share one home). A
 *  fixtures file that is absent offers no team pages; it is not an error here,
 *  because that build's own run is where a missing file fails. A gender this
 *  division does not field has no pages at all. */
export function counterpartOf(target: Gender): Counterpart {
  const home = dataHome();
  return {
    conferences: divisions[target]?.conferences ?? [],
    hasTeam: (conference, slug) => {
      const path = join(home.fixturesDir, `${seasonKey(site.season, target, conference)}.json`);
      if (!existsSync(path)) return false;
      const file = readParsed(path, (r) => fixturesFileSchema.parse(r), false);
      return !!file?.programmes.some((p) => p.slug === slug);
    },
  };
}
