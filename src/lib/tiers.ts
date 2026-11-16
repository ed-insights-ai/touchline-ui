// The player-tiers artifact: the reader's side of the file the tiers build
// writes (scripts/tiers/build.ts), one per level, season and gender, under
// `tiers/{level}/{season}-{gender}.json` at the repository root.
//
// The contract is docs/specs/player-tiers/ALGORITHM.md (version 2.2), section
// 10, in the platform repository. The schema here is strict in the same way model.ts is:
// a key the contract does not name is an error, not something to carry, and
// that is how section 9 ("what is never computed or stored") is held at the
// reader as well as at the writer. No score, estimate, rank or percentile for
// a person can reach a page through this file, because the file cannot hold
// one and still parse.
//
// Nothing here computes a tier. The pages read the artifact; the build is the
// only place the rule runs.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

export const TIERS_SCHEMA = "touchline-ui.tiers/1";
export const TIERS_SPEC = "player-tiers/0.6";

/** A figure the contract prints to one decimal: finite, and already rounded. */
const oneDecimal = z
  .number()
  .refine((x) => Number.isFinite(x) && Number(x.toFixed(1)) === x, "must be rounded to 1 decimal");

export const positionGroupSchema = z.enum(["F", "M", "D", "GK"]);
export type PositionGroup = z.infer<typeof positionGroupSchema>;

export const tierKindSchema = z.enum(["shooting_scoring", "team_defence"]);
export type TierKind = z.infer<typeof tierKindSchema>;

export const tierStatusSchema = z.enum([
  "tier",
  "eligible",
  "needs_minutes",
  "needs_second_season",
  "incomplete",
]);
export type TierStatus = z.infer<typeof tierStatusSchema>;

export const incompleteReasonSchema = z.enum([
  "no_minutes",
  "no_position",
  "identity",
  "few_matches",
]);
export type IncompleteReason = z.infer<typeof incompleteReasonSchema>;

export const workloadSchema = z.enum(["light", "typical", "heavy"]);
export type Workload = z.infer<typeof workloadSchema>;

export const tierBasisSchema = z
  .object({
    /** Summed over `seasons`. */
    minutes: z.number().int().nonnegative(),
    /** Appearances (matches with minutes above zero), summed over `seasons`. */
    matches: z.number().int().nonnegative(),
    /** The seasons counted, oldest first. */
    seasons: z.array(z.number().int()).min(1),
    /** This season's roster class year as printed, else null. */
    class_year: z.string().min(1).nullable(),
  })
  .strict();
export type TierBasis = z.infer<typeof tierBasisSchema>;

export const tierEntrySchema = z
  .object({
    /** As the source prints it. */
    name: z.string().min(1),
    /** The folded name (foldName, the collector's fold_name). */
    key: z.string(),
    /** The page id when the source has one. */
    player_id: z.string().min(1).nullable(),
    /** As printed. */
    number: z.string().min(1).nullable(),
    group: positionGroupSchema.nullable(),
    kind: tierKindSchema.nullable(),
    status: tierStatusSchema,
    tier: z.union([z.literal(1), z.literal(2)]).nullable(),
    reason: incompleteReasonSchema.nullable(),
    basis: tierBasisSchema,
  })
  .strict()
  .superRefine((e, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    const expectedKind =
      e.group === null
        ? null
        : e.group === "F" || e.group === "M"
          ? "shooting_scoring"
          : "team_defence";
    if (e.kind !== expectedKind) fail(`kind ${e.kind} does not follow group ${e.group}`);
    if ((e.status === "tier") !== (e.tier !== null))
      fail("tier is set exactly when status is tier");
    if (e.tier === 2 && e.kind !== "shooting_scoring") fail("only shooting and scoring has Tier 2");
    if ((e.status === "incomplete") !== (e.reason !== null)) {
      fail("reason is set exactly when status is incomplete");
    }
    if (e.status === "needs_second_season" && e.kind !== "team_defence") {
      fail("needs_second_season belongs to team defence");
    }
    if (e.reason === "few_matches" && e.kind !== "team_defence") {
      fail("few_matches belongs to team defence");
    }
    if (e.reason === "no_position" && e.group !== null) fail("no_position has no group");
    if (e.group === null && e.status !== "incomplete") fail("a player with no group is incomplete");
    const sorted = [...e.basis.seasons].sort((a, b) => a - b);
    if (sorted.some((s, i) => s !== e.basis.seasons[i] || (i > 0 && s === sorted[i - 1]))) {
      fail("basis.seasons is oldest first, without repeats");
    }
  });
export type TierEntry = z.infer<typeof tierEntrySchema>;

export const tierTeamSchema = z
  .object({
    /** n: records where both sides have integer shots and scores. */
    matches: z.number().int().nonnegative(),
    /** null when n < 12. */
    workload: workloadSchema.nullable(),
    /** SA / n; null when n is 0. */
    shots_faced_per_match: oneDecimal.nullable(),
    /** 100 × GA / SA; null when SA is 0. */
    pct_in: oneDecimal.nullable(),
    goals_conceded: z.number().int().nonnegative(),
    /** EGA; null when n is 0. */
    opponents_usual: oneDecimal.nullable(),
  })
  .strict();
export type TierTeam = z.infer<typeof tierTeamSchema>;

export const tierDivisionSchema = z
  .object({
    /** Programme-seasons with a workload group. */
    teams: z.number().int().nonnegative(),
    shots_faced_per_match: oneDecimal,
    pct_in: oneDecimal,
  })
  .strict();
export type TierDivision = z.infer<typeof tierDivisionSchema>;

export const tiersFileSchema = z
  .object({
    schema: z.literal(TIERS_SCHEMA),
    level: z.enum(["d1", "d2", "d3"]),
    season: z.number().int(),
    gender: z.enum(["men", "women"]),
    spec: z.literal(TIERS_SPEC),
    frozen_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    data_commit: z.string().regex(/^[0-9a-f]{4,40}(\+dirty)?$/),
    division: tierDivisionSchema,
    teams: z.record(z.string().min(1), tierTeamSchema),
    players: z.record(z.string().min(1), z.array(tierEntrySchema)),
  })
  .strict();
export type TiersFile = z.infer<typeof tiersFileSchema>;

// ── The fold ────────────────────────────────────────────────────────────────
//
// ALGORITHM.md 4.1: the collector's own rule, `fold_name` in
// keelson-rib-touchline pipeline/src/identity.py, ported line for line so the
// artifact's `key` is the key the collector's `player_ref` was resolved with.
// It is deliberately NOT player.ts's foldName (which keeps spaces and digits
// and leaves the name in printed order): "Høihjelle, Iver" and "Iver
// Hoihjelle" both fold to "iverhoihjelle" here. A page that looks a player up
// hands tierFor the name as printed; tierFor folds it.

/** Letters NFKD leaves whole, and the ASCII a stat crew types for them. */
const PLAIN_LETTERS: Readonly<Record<string, string>> = {
  ø: "o",
  æ: "ae",
  œ: "oe",
  ß: "ss",
  ð: "d",
  þ: "th",
  ł: "l",
  đ: "d",
  ı: "i",
};

/** Steps 2 to 4 of 4.1 (the collector's `_letters`): lower-case, NFKD, the
 *  fixed letter table, combining marks dropped, a to z kept. */
export const foldLetters = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[øæœßðþłđı]/g, (c) => PLAIN_LETTERS[c] ?? c)
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z]/g, "");

/** Step 1 (the collector's `_given_first`): "Last, First" becomes "First
 *  Last" when there is something after the comma. */
export function givenFirst(name: string): string {
  const comma = name.indexOf(",");
  if (comma >= 0) {
    const head = name.slice(0, comma).trim();
    const tail = name.slice(comma + 1).trim();
    if (tail) return `${tail} ${head}`;
  }
  return name.trim();
}

/** ALGORITHM.md 4.1, the collector's `fold_name`: the artifact's `key`. */
export const foldName = (name: string): string => foldLetters(givenFirst(name));

/** The folded surname (the collector's `fold_surname`): the part before the
 *  comma in "Last, First", the last word otherwise. */
export function foldSurname(name: string): string {
  const comma = name.indexOf(",");
  const surname = comma >= 0 ? name.slice(0, comma) : (name.trim().split(/\s+/).at(-1) ?? "");
  return foldLetters(surname);
}

/** A shirt number as compared (the collector's `_number`): trimmed, leading
 *  zeros dropped so "01" and "1" agree, "0" for a number of zeros alone,
 *  empty when none is printed. */
export function shirtNumber(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  return text.replace(/^0+/, "") || (text ? "0" : "");
}

// ── Reading the artifact ────────────────────────────────────────────────────

/** The artifact's path under a repository root. */
export const tiersPath = (level: string, season: number, gender: string, root: string): string =>
  join(root, "tiers", level, `${season}-${gender}.json`);

const cache = new Map<string, TiersFile | null>();

/**
 * The tiers artifact for one level, season and gender, or null when no file
 * was built for it. A file that is present and does not match the contract
 * throws, naming the file: a half-understood tier is worse than none.
 *
 * Read from the repository root (the process's working directory, the same
 * root the journal's fallback reads), never from the data home: the tiers
 * are this repository's build output.
 */
export function loadTiers(
  level: string,
  season: number,
  gender: string,
  root: string = process.cwd(),
): TiersFile | null {
  const path = tiersPath(level, season, gender, root);
  const hit = cache.get(path);
  if (hit !== undefined) return hit;
  if (!existsSync(path)) {
    cache.set(path, null);
    return null;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`Touchline: ${path} is not valid JSON — ${(err as Error).message}`);
  }
  const parsed = tiersFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Touchline: ${path} does not match the tiers contract (${TIERS_SCHEMA}).\n${parsed.error.message}`,
    );
  }
  cache.set(path, parsed.data);
  return parsed.data;
}

// ── Looking a player up ─────────────────────────────────────────────────────

export interface TierQuery {
  /** The page id the roster or the statistics carry, when they carry one. */
  playerId?: string | null;
  /** The name as the page prints it; folded here by foldName. */
  name: string;
  /** The shirt number as printed, when there is one. */
  number?: string | null;
}

/** One of several candidates, by shirt number (leading zeros dropped); null
 *  when the number does not settle it, because a wrong player's tier is worse
 *  than none. */
function settle(candidates: readonly TierEntry[], number: string): TierEntry | null {
  if (candidates.length === 1) return candidates[0] ?? null;
  if (candidates.length === 0 || number === "") return null;
  const byNumber = candidates.filter((e) => shirtNumber(e.number) === number);
  return byNumber.length === 1 ? (byNumber[0] ?? null) : null;
}

/**
 * A player's entry in one programme's list, or null.
 *
 * Matched on the page id when both the query and the entry carry one, else
 * on the folded name (foldName of the printed name); the shirt number breaks
 * a tie. Ids are compared first and on their own: an entry whose id differs
 * from the query's is a different player even when the names fold alike.
 */
export function tierFor(
  tiers: TiersFile,
  programmeSlug: string,
  query: TierQuery,
): TierEntry | null {
  const list = tiers.players[programmeSlug] ?? [];
  const id = query.playerId ?? null;
  const number = shirtNumber(query.number);
  if (id !== null) {
    const byId = list.filter((e) => e.player_id === id);
    if (byId.length > 0) return settle(byId, number);
  }
  const key = foldName(query.name);
  if (key === "") return null;
  const byName = list.filter((e) => (id === null || e.player_id === null) && e.key === key);
  return settle(byName, number);
}

export interface TeamFigures {
  team: TierTeam;
  division: TierDivision;
}

/** A programme's team-defence figures beside the division's, or null when
 *  the artifact has no row for the programme. */
export function teamFigures(tiers: TiersFile, programmeSlug: string): TeamFigures | null {
  const team = tiers.teams[programmeSlug];
  return team ? { team, division: tiers.division } : null;
}
