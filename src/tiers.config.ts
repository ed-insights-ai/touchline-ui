// Player tiers: the publication gate.
//
// Nothing about tiers reaches a page unless this file says so: no TIER block,
// no line at the top of a sheet, no squad mark or key, no CAREER line, no link
// and no /about/tiers/ page. With the gate closed, the built site is the site
// as it was before tiers existed (orchestrator decision 8, 15 November 2026).
//
// The gate is the owner's go-ahead and nothing else. It first also asked for
// a corrections contact, because the method page promised one. On 16 November
// 2026 the owner took that section off the page and published the tiers, so
// the gate ships open. TOUCHLINE_TIERS_PREVIEW=1 still opens a closed gate for
// local review, should it ever be closed again.
//
// A level shows only the tiers that passed the reliability test there
// (ed-insights-platform FIRMNESS.md, T1: R >= 0.80 for three published levels,
// R >= 0.61 for two), measured once on that level's own data with constants
// fitted by one procedure. Division I men, measured 2026-11-20 over 2022-2026:
// midfielders 0.86 pass the bar for two levels; forwards 0.78 do not, and
// pass the bar for one. Forwards therefore hold one tier on every level
// (SHOOTING_LEVELS), and both groups are shown on both. The team defence
// badge (0.66) passes on every level and is shown on team pages.

import type { TierEntry } from "./lib/tiers.ts";
import { type NcaaDivisionKey, ncaaDivision } from "./site.config.ts";

export interface TiersConfig {
  /** The owner's go-ahead to publish tiers. */
  published: boolean;
}

export const tiersConfig: TiersConfig = {
  published: true,
};

/** One label's reliability on a level (FIRMNESS.md, T1): the mean over 100
 *  split halves, stepped up to a full season, and the bar it must reach. */
export interface Measured {
  group: "M" | "F" | "team_badge";
  r: number;
  bar: number;
}

/** What a level publishes: the shooting and scoring groups, and whether its
 *  team pages show the team defence badge. A level measured on its own
 *  seasons, after the method was built on another, carries that measurement,
 *  and its method page is the short one that prints it. */
export interface LevelTiers {
  shooting: readonly ("F" | "M")[];
  badge: boolean;
  measured?: { seasons: readonly [number, number]; rows: readonly Measured[] };
}

/**
 * The day the team defence tier left player sheets, on every level. It was a
 * team's record handed to its regular defenders and goalkeepers; the review
 * of that day (ed-insights-platform player-tiers/evidence/defence-review)
 * found nothing individual in it that repeats, and the record inside workload
 * groups at R 0.51 / 0.54 / 0.40 for teams (D2 men, D2 women, D1 men). The
 * same record across the whole division, R 0.76 / 0.82 / 0.66, is now the
 * team defence badge, shown on the team. The files still carry the entries,
 * which mark a regular for the team figures on the sheet.
 */
export const TEAM_DEFENCE_TIER_RETIRED = "2026-11-20";

/**
 * How many levels each group's shooting and scoring tier has, the same on
 * every level of play: midfielders Tier 1 (top 5%) and Tier 2 (the next 15%);
 * forwards one tier, the top 20%. The owner's decision of FORWARDS_ONE_TIER:
 * Division I forwards measured R 0.78, short of T1's bar for two levels and
 * over its bar for one, and one rule holds on every level. The files still
 * carry Tier 1 and Tier 2 for forwards; together they are the top 20% with
 * ties (scripts/tiers/shooting.ts), so the sheet reads the one tier from them.
 */
export const SHOOTING_LEVELS: Readonly<Record<"F" | "M", 1 | 2>> = { F: 1, M: 2 };
export const FORWARDS_ONE_TIER = "2026-11-20";

/** The levels tiers are built and shown for, and what each shows. */
export const TIERS_LEVELS: Readonly<Partial<Record<NcaaDivisionKey, LevelTiers>>> = {
  d2: { shooting: ["F", "M"], badge: true },
  d1: {
    shooting: ["F", "M"],
    badge: true,
    measured: {
      seasons: [2022, 2026],
      rows: [
        { group: "M", r: 0.86, bar: 0.8 },
        { group: "F", r: 0.78, bar: 0.61 },
        { group: "team_badge", r: 0.66, bar: 0.61 },
      ],
    },
  },
};

/** Whether a level shows the whole shooting tier, forwards and midfielders. */
export const showsFullShooting = (shown: LevelTiers): boolean =>
  shown.shooting.includes("F") && shown.shooting.includes("M");

/** Whether a level's method page is the short one: a level measured on its
 *  own seasons, whose page prints that measurement and links the full method
 *  of the level the method was built on. */
export const methodIsShort = (shown: LevelTiers): boolean => shown.measured !== undefined;

/**
 * Whether this build renders player tiers.
 *
 * True only for a level in TIERS_LEVELS, and then only when tiers are
 * published or the preview variable is "1". The level is an argument so any
 * build can be held to it.
 */
export function tiersEnabled(
  level: string = ncaaDivision,
  preview: string | undefined = process.env.TOUCHLINE_TIERS_PREVIEW,
  config: TiersConfig = tiersConfig,
): boolean {
  if (levelTiers(level) === null) return false;
  return config.published || preview === "1";
}

/** What a level shows, or null for a level with no tiers. */
export function levelTiers(level: string = ncaaDivision): LevelTiers | null {
  return TIERS_LEVELS[level as NcaaDivisionKey] ?? null;
}

/** Whether a level shows this entry on a sheet: shooting and scoring for a
 *  group the level shows. A team defence entry is never shown as a tier
 *  (TEAM_DEFENCE_TIER_RETIRED); the sheet reads it only to know a regular. An
 *  entry it does not show is drawn nowhere, as if the file did not carry it. */
export function levelShows(level: string, e: Pick<TierEntry, "kind" | "group">): boolean {
  const shown = levelTiers(level);
  if (shown === null) return false;
  // No kind: no position could be read, so the player might have been either
  // kind. Shown only where the whole shooting tier is; elsewhere it would
  // imply a tier the level does not publish.
  if (e.kind === null) return showsFullShooting(shown);
  if (e.kind === "team_defence") return false;
  return shown.shooting.some((g) => g === e.group);
}
