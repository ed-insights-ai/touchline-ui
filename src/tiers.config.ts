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
// Whatever this file says, tiers belong to Division II alone: a build for any
// other level renders none of it, in preview too.

import { ncaaDivision } from "./site.config.ts";

export interface TiersConfig {
  /** The owner's go-ahead to publish tiers. */
  published: boolean;
}

export const tiersConfig: TiersConfig = {
  published: true,
};

/** The only level tiers are built for (ALGORITHM.md section 0). */
const TIERS_LEVEL = "d2";

/**
 * Whether this build renders player tiers.
 *
 * True only for a Division II build, and then only when tiers are published
 * or the preview variable is "1". The level is an argument so a Division I
 * build can be held to it before one exists.
 */
export function tiersEnabled(
  level: string = ncaaDivision,
  preview: string | undefined = process.env.TOUCHLINE_TIERS_PREVIEW,
  config: TiersConfig = tiersConfig,
): boolean {
  if (level !== TIERS_LEVEL) return false;
  return config.published || preview === "1";
}
