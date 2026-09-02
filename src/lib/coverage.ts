// The coverage manifest is the pipeline's own record of what it managed to
// collect. It is not part of the rib's file model, so its shape is declared
// here — and, like every other file, it is version-guarded.

import { z } from "zod";

export const COVERAGE_SCHEMA = "touchline.coverage/1";

/** Four states, and the difference between them is the point: `complete` was
 *  collected, `empty` was collected and the page had nothing, `unavailable`
 *  means the source refused or vanished, `no-collector` means Touchline has
 *  no way to ask. Not collected is not the same as not published. */
export const coverageStateSchema = z.enum(["complete", "empty", "unavailable", "no-collector"]);
export type CoverageState = z.infer<typeof coverageStateSchema>;

export const coverageLayerSchema = z.enum(["schedule", "roster", "stats", "matches"]);
export type CoverageLayer = z.infer<typeof coverageLayerSchema>;

export const coverageCellSchema = z
  .object({
    season: z.number().int(),
    gender: z.string().min(1),
    programme: z.string().min(1),
    layer: coverageLayerSchema,
    state: coverageStateSchema,
    collector: z.string().optional(),
    confirmed_at: z.string().optional(),
    count: z.number().int().optional(),
    reason: z.string().optional(),
    source_url: z.string().optional(),
    /** The collector's conditional fetch (rib 7a2f481, 2026-08-31): a page
     *  the server said was unchanged is reused, not re-parsed, and the cell
     *  says so. Present only on a re-collect that reused something, which is
     *  why the first fresh collects never carried it and the first re-collect
     *  (GLVC, 2026-09-02) was refused by this contract whole. A marker, not a
     *  state: the cell's `state` is still the layer's outcome. */
    verified: z.literal("unchanged").optional(),
  })
  .strict();
export type CoverageCell = z.infer<typeof coverageCellSchema>;

export const coverageFileSchema = z
  .object({
    schema: z.literal(COVERAGE_SCHEMA),
    updated_at: z.string().min(1),
    cells: z.record(z.string(), coverageCellSchema),
  })
  .strict();
export type CoverageFile = z.infer<typeof coverageFileSchema>;

export function coverageKey(
  season: number,
  gender: string,
  programme: string,
  layer: CoverageLayer,
): string {
  return `${season}/${gender}/${programme}/${layer}`;
}
