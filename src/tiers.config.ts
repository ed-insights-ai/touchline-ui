// Player tiers: the publication gate.
//
// Nothing about tiers reaches a page unless this file says so: no TIER block,
// no line at the top of a sheet, no squad mark or key, no CAREER line, no link
// and no /about/tiers/ page. With the gate closed, the built site is the site
// as it was before tiers existed (orchestrator decision 8, 15 November 2026).
//
// The gate opens for publication only when the owner has said yes AND a
// corrections contact is configured: the method page promises a player, a
// parent or a school a way to ask for a correction or a removal, and a page
// that promises one without saying where to write is not fit to ship (SPEC
// O16). For local review, TOUCHLINE_TIERS_PREVIEW=1 opens it without either.
//
// Whatever this file says, tiers belong to Division II alone: a build for any
// other level renders none of it, in preview too.

import { ncaaDivision } from "./site.config.ts";

export interface TiersConfig {
  /** The owner's go-ahead to publish tiers. */
  published: boolean;
  /** Where a correction or a removal is asked for, printed on the method
   *  page. Null until the owner supplies one; the gate stays closed without
   *  it, whatever `published` says. */
  correctionsContact: string | null;
}

export const tiersConfig: TiersConfig = {
  published: false,
  correctionsContact: null,
};

/** The only level tiers are built for (ALGORITHM.md section 0). */
const TIERS_LEVEL = "d2";

/**
 * Whether this build renders player tiers.
 *
 * True only for a Division II build, and then only when tiers are published
 * with a corrections contact, or the preview variable is "1". The level is an
 * argument so a Division I build can be held to it before one exists.
 */
export function tiersEnabled(
  level: string = ncaaDivision,
  preview: string | undefined = process.env.TOUCHLINE_TIERS_PREVIEW,
  config: TiersConfig = tiersConfig,
): boolean {
  if (level !== TIERS_LEVEL) return false;
  const live = config.published && (config.correctionsContact?.trim() ?? "") !== "";
  return live || preview === "1";
}
