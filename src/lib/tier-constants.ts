// The shooting and scoring tier's fitted constants (ALGORITHM.md section 5,
// SPEC rules 5.3 and 5.5), per level and gender. The build computes with them
// (scripts/tiers/shooting.ts) and the method page prints them, from this one
// table, so the page cannot drift from the files.

import type { NcaaDivisionKey } from "../site.config.ts";
import type { Gender } from "./model.ts";

export interface ShootingConstants {
  /** Rule 5.3: threat = wG × goals + wS × shots, per 90. */
  weights: { wG: number; wS: number };
  /** Rule 5.5: [this, average] for one season counted, [this, previous,
   *  average] for two. */
  blend: { one: readonly [number, number]; two: readonly [number, number, number] };
}

/**
 * The fitted constants, per level and gender. One procedure fits every set
 * (ed-insights-platform evidence/v01.py: least squares with an intercept over
 * returning players at one programme, 600 minutes in both seasons), each on
 * its own population and frozen before that population was measured. Division
 * I has men only, fitted 2026-11-20 on ~/keelson/d1-soccer at fd497c9 (4,498
 * returning pairs for the weights, 2,787 and 760 for the blend); the same
 * procedure on Division II's own data reproduces Division II's blend.
 */
export const CONSTANTS: Readonly<
  Partial<Record<NcaaDivisionKey, Partial<Record<Gender, ShootingConstants>>>>
> = {
  d2: {
    men: {
      weights: { wG: 0.234, wS: 0.0885 },
      blend: { one: [0.79, 0.21], two: [0.59, 0.34, 0.07] },
    },
    women: {
      weights: { wG: 0.238, wS: 0.0749 },
      blend: { one: [0.82, 0.18], two: [0.64, 0.3, 0.06] },
    },
  },
  d1: {
    men: { weights: { wG: 0.207, wS: 0.0837 }, blend: { one: [0.8, 0.2], two: [0.6, 0.3, 0.1] } },
  },
};
