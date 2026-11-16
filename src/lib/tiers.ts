// The player-tiers artifact: the reader's side of the file the tiers build
// writes (scripts/tiers/build.ts), one per level, season and gender, under
// `tiers/{level}/{season}-{gender}.json` at the repository root.
//
// The contract is docs/specs/player-tiers/ALGORITHM.md, section 10, in the
// platform repository. The schema here is strict in the same way model.ts is:
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
    /** The folded name (foldKey). */
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
    /** n: physical matches where both sides have integer shots and scores. */
    matches: z.number().int().nonnegative(),
    /** null when n < 12. */
    workload: workloadSchema.nullable(),
    shots_faced_per_match: oneDecimal.nullable(),
    /** 100 × GA / SA; null when SA is 0. */
    pct_in: oneDecimal.nullable(),
    goals_conceded: z.number().int().nonnegative(),
    /** EGA. */
    opponents_usual: oneDecimal,
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

/** ALGORITHM.md section 4's fold, and the artifact's `key`: Unicode NFKD,
 *  combining marks stripped, lower-cased, letters only. It is deliberately
 *  NOT player.ts's foldName, which keeps spaces: "Juan Linares" folds to
 *  "juanlinares" here. A page that looks a player up passes this fold. */
export const foldKey = (name: string): string =>
  name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}]/gu, "");

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
  /** foldKey of the name the page prints. */
  foldedName: string;
  /** The shirt number as printed, when there is one. */
  number?: string | null;
}

/** One of several candidates, by shirt number; null when the number does not
 *  settle it, because a wrong player's tier is worse than none. */
function settle(candidates: readonly TierEntry[], number: string | null): TierEntry | null {
  if (candidates.length === 1) return candidates[0] ?? null;
  if (candidates.length === 0 || number === null) return null;
  const byNumber = candidates.filter((e) => e.number === number);
  return byNumber.length === 1 ? (byNumber[0] ?? null) : null;
}

/**
 * A player's entry in one programme's list, or null.
 *
 * Matched on the page id when both the query and the entry carry one, else
 * on the folded name; the shirt number breaks a tie. Ids are compared first
 * and on their own: an entry whose id differs from the query's is a different
 * player even when the names fold alike.
 */
export function tierFor(
  tiers: TiersFile,
  programmeSlug: string,
  query: TierQuery,
): TierEntry | null {
  const list = tiers.players[programmeSlug] ?? [];
  const id = query.playerId ?? null;
  const number = query.number ?? null;
  if (id !== null) {
    const byId = list.filter((e) => e.player_id === id);
    if (byId.length > 0) return settle(byId, number);
  }
  const byName = list.filter(
    (e) => (id === null || e.player_id === null) && e.key === query.foldedName,
  );
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
