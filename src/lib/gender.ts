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

import { existsSync } from "node:fs";
import { join } from "node:path";
import { divisions, type Gender, genderPath, site } from "../site.config.ts";
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

/** The root base the gender builds hang off: this build's base without its
 *  own gender segment. "/touchline-ui/women" → "/touchline-ui". */
export function rootBase(base: string, own: Gender): string {
  const b = base.replace(/\/+$/, "");
  const seg = genderPath[own];
  return seg && b.endsWith(seg) ? b.slice(0, -seg.length) : b;
}

/** This build's base, without the trailing slash Astro gives it. */
const BASE = (import.meta.env?.BASE_URL ?? "/").replace(/\/+$/, "");

/** The address of the page `pathname` (as the browser sees it, base and all)
 *  in `target`'s build. */
export function genderHref(
  target: Gender,
  pathname: string,
  counterpart: Counterpart = counterpartOf(target),
  base: string = BASE,
  own: Gender = site.gender,
): string {
  const here = pathname.replace(/\/?$/, "/");
  const within = base && here.startsWith(`${base}/`) ? here.slice(base.length) : here;
  const path = target === own ? within : counterpartPath(within, counterpart);
  return `${rootBase(base, own)}${genderPath[target]}${path}`;
}

/** The other build, read from config and the shared data home. A fixtures file
 *  that is absent offers no team pages; it is not an error here, because that
 *  build's own run is where a missing file fails. */
export function counterpartOf(target: Gender): Counterpart {
  const home = dataHome();
  return {
    conferences: divisions[target].conferences,
    hasTeam: (conference, slug) => {
      const path = join(home.fixturesDir, `${seasonKey(site.season, target, conference)}.json`);
      if (!existsSync(path)) return false;
      const file = readParsed(path, (r) => fixturesFileSchema.parse(r), false);
      return !!file?.programmes.some((p) => p.slug === slug);
    },
  };
}
