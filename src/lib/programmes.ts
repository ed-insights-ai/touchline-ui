// Programme identity that no collected page publishes: the nickname a
// programme goes by, and the town it plays in.
//
// This is reference data, not collected data, so it is versioned and shaped
// exactly like the data home's `reference/membership.json` — and it is looked
// for THERE first. When a collected contract takes this over, the file moves
// and nothing in this repo has to change.
//
// A slug absent from the file renders the designed absence state. Nothing here
// is ever guessed from a slug.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { dataRoot } from "./data.ts";

export const PROGRAMMES_SCHEMA = "touchline.programmes/1";

export const programmeIdentitySchema = z
  .object({
    nickname: z.string().min(1).optional(),
    /** As a programme prints it, AP state style: "Searcy, Ark." */
    city: z.string().min(1).optional(),
  })
  .strict();
export type ProgrammeIdentity = z.infer<typeof programmeIdentitySchema>;

export const programmesFileSchema = z
  .object({
    schema: z.literal(PROGRAMMES_SCHEMA),
    description: z.string().optional(),
    programmes: z.record(z.string(), programmeIdentitySchema),
  })
  .strict();
export type ProgrammesFile = z.infer<typeof programmesFileSchema>;

function paths(): string[] {
  const override = process.env.TOUCHLINE_PROGRAMMES_FILE?.trim();
  return [
    ...(override ? [override] : []),
    join(dataRoot(), "data", "reference", "programmes.json"),
    join(process.cwd(), "programmes.json"),
  ];
}

let loaded: Record<string, ProgrammeIdentity> | null = null;

function all(): Record<string, ProgrammeIdentity> {
  if (loaded) return loaded;
  for (const path of paths()) {
    if (!existsSync(path)) continue;
    try {
      loaded = programmesFileSchema.parse(JSON.parse(readFileSync(path, "utf8"))).programmes;
      return loaded;
    } catch (err) {
      // Reference data this site could not read is a gap, not an outage: every
      // page that uses it already has a state for not knowing.
      console.warn(`[touchline] programmes file ignored (${path}): ${(err as Error).message}`);
    }
  }
  loaded = {};
  return loaded;
}

export function identityOf(slug: string): ProgrammeIdentity | null {
  const hit = all()[slug];
  return hit && (hit.nickname || hit.city) ? hit : null;
}

/** "Bisons · Searcy, Ark." — whichever halves are known, or null for neither. */
export function identityLine(slug: string): string | null {
  const id = identityOf(slug);
  if (!id) return null;
  return [id.nickname, id.city].filter(Boolean).join(" · ");
}
