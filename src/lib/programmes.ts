// Programme identity that no collected page publishes as data: the nickname a
// programme goes by, the town it plays in, and that town's point.
//
// Contract touchline.programmes/2. Built in the rib from schools.toml and the
// pinned 2023 Census Gazetteer, and mirrored into the data home by every
// collect, beside membership.json. This site vendors the schema — copied
// verbatim from the rib's src/programmes.ts, which is the authority for the
// shape — and reads the mirror, and only the mirror: there is no copy in this
// repo to fall back to.
//
// A member of a followed conference-season with no row is a build failure,
// named (see assertProgrammesFor). A stranger — an opponent outside the
// followed conferences — renders the designed absence state. Nothing here is
// ever guessed from a slug.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { dataRoot, readParsed } from "./data.ts";

export const PROGRAMMES_SCHEMA = "touchline.programmes/2";

/** Where one fact came from and when it was read. */
export const provenanceSchema = z
  .object({
    source: z.string().min(1),
    url: z.string().min(1).optional(),
    /** ISO date the source was read. */
    accessed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    /** Gazetteer only: the place the point resolved to. */
    geoid: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    state: z.string().length(2).optional(),
    note: z.string().min(1).optional(),
  })
  .strict();

export const programmeRowSchema = z
  .object({
    /** The reader-facing programme name. */
    name: z.string().min(1),
    nickname: z.string().min(1),
    /** The programme's own short form — the monogram. */
    abbreviation: z.string().min(1),
    /** AP state style, as the contract normalises it: "Searcy, Ark." */
    city: z.string().min(1),
    /** The town centroid the programme plays in — never the campus. */
    point: z.object({ lat: z.number(), lon: z.number() }).strict(),
    provenance: z
      .object({
        nickname: provenanceSchema,
        abbreviation: provenanceSchema,
        city: provenanceSchema,
        point: provenanceSchema,
      })
      .strict(),
  })
  .strict();
export type ProgrammeRow = z.infer<typeof programmeRowSchema>;

export const programmesFileSchema = z
  .object({
    schema: z.literal(PROGRAMMES_SCHEMA),
    description: z.string().optional(),
    gazetteer: z
      .object({
        source: z.string().min(1),
        url: z.string().min(1),
        file_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        license: z.string().min(1),
      })
      .strict(),
    programmes: z.record(z.string(), programmeRowSchema),
  })
  .strict();
export type ProgrammesFile = z.infer<typeof programmesFileSchema>;

/** The mirror in the data home, or the file `TOUCHLINE_PROGRAMMES_FILE` names. */
export function programmesPath(): string {
  const override = process.env.TOUCHLINE_PROGRAMMES_FILE?.trim();
  return override || join(dataRoot(), "data", "reference", "programmes.json");
}

let cached: ProgrammesFile | null = null;

export function loadProgrammes(): ProgrammesFile {
  if (cached) return cached;
  const path = programmesPath();
  // Absent means no collect has written into this data home yet, so the hint
  // says what writes it; the JSON and contract failures speak in readParsed's
  // voice, the same one every other file this site reads fails in.
  if (!existsSync(path)) {
    throw new Error(
      `Touchline: programmes reference is missing: ${path}\n` +
        `  A collect writes it beside membership.json. Set TOUCHLINE_DATA_DIR to the data home ` +
        `root (the directory containing data/), or TOUCHLINE_PROGRAMMES_FILE to the file.`,
    );
  }
  cached = readParsed(path, (r) => programmesFileSchema.parse(r), true) as ProgrammesFile;
  return cached;
}

export function programmeOf(slug: string): ProgrammeRow | null {
  return loadProgrammes().programmes[slug] ?? null;
}

/**
 * The name a programme is displayed under: the reference's own when it holds
 * a row, else the name the caller already has (a fixtures file's, a name
 * book's). The reference disambiguates where a conference file does not:
 * the CACC's file calls its member "Dominican" and the reference "Dominican
 * (N.Y.)", beside the PacWest's "Dominican (Calif.)".
 */
export function displayNameOf(slug: string, fallback: string): string {
  return programmeOf(slug)?.name ?? fallback;
}

export function identityOf(slug: string): { nickname: string; city: string } | null {
  const row = programmeOf(slug);
  return row ? { nickname: row.nickname, city: row.city } : null;
}

/** "Bisons · Searcy, Ark." — or null for a stranger, whose absence is designed. */
export function identityLine(slug: string): string | null {
  const id = identityOf(slug);
  return id ? `${id.nickname} · ${id.city}` : null;
}

/** The members with no row, sorted. Pure: the rows are an argument, so the
 *  check can be held against any table, including a deliberately short one. */
export function missingProgrammes(
  members: readonly { slug: string }[],
  rows: Readonly<Record<string, unknown>>,
): string[] {
  return members
    .map((m) => m.slug)
    .filter((slug) => rows[slug] === undefined)
    .sort();
}

/**
 * Refuse to build a followed conference-season whose members are not all in
 * the reference. Every missing slug is named in one message: a build that
 * failed once per slug would take as many rebuilds to learn the whole list.
 */
export function assertProgrammesFor(
  members: readonly { slug: string }[],
  conferenceSeason: string,
  rows: Readonly<Record<string, unknown>> = loadProgrammes().programmes,
): void {
  const missing = missingProgrammes(members, rows);
  if (missing.length === 0) return;
  throw new Error(
    `Touchline: programmes reference has no row for ${missing.join(", ")} ` +
      `(members of ${conferenceSeason})\n` +
      `  ${programmesPath()}\n` +
      `  Every member of a followed conference-season needs a row with nickname, city and point. ` +
      `Rebuild it in the rib (uv run build-programmes) and re-collect.`,
  );
}
