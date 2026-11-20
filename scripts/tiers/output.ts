// ALGORITHM.md sections 9 and 10: the artifact, and what may never be in it.
//
// The artifact is assembled here and nowhere else, key by key in the order
// section 10 shows, and then held to that section's key inventory before it
// is written: a field outside it (a score, an estimate, a rank, a home town)
// fails the build rather than reaching a file. The site's reader
// (src/lib/tiers.ts) refuses the same fields a second time.

import {
  TIERS_SCHEMA,
  TIERS_SPEC,
  type TierDivision,
  type TierEntry,
  type TiersFile,
  type TierTeam,
  tiersFileSchema,
} from "../../src/lib/tiers.ts";
import { topWithTies } from "./cut.ts";
import type { TeamSeason } from "./workload.ts";

// [v2] Rounding is half up on the exact value. A ratio of integers is rounded
// as the ratio it is, in integer arithmetic, so a figure that is 12.35 exactly
// prints 12.4 even though the double nearest 247/20 sits a hair below it.

/** floor(a / b) for non-negative integers a and b > 0, without a division in
 *  floating point. */
const intDiv = (a: number, b: number): number => (a - (a % b)) / b;

/** num / den to one decimal, half up, in integer arithmetic:
 *  floor((20·num + den) / (2·den)) / 10. */
export const ratio1 = (num: number, den: number): number => intDiv(20 * num + den, 2 * den) / 10;

/** shots_faced_per_match = floor((20·SA + n) / (2·n)) / 10. */
export const shotsPerMatch1 = (sa: number, n: number): number => ratio1(sa, n);

/** pct_in = floor((2000·GA + SA) / (2·SA)) / 10. */
export const pctIn1 = (ga: number, sa: number): number => intDiv(2000 * ga + sa, 2 * sa) / 10;

/** opponents_usual = floor(EGA × 10 + 0.5) / 10: EGA is not a ratio of
 *  integers, so it is rounded as the double it is. */
export const round1 = (x: number): number => Math.floor(x * 10 + 0.5) / 10;

/** Section 10's keys, in the order it shows them. */
export const SECTION_10 = {
  file: [
    "schema",
    "level",
    "season",
    "gender",
    "spec",
    "frozen_at",
    "data_commit",
    "division",
    "teams",
    "players",
  ],
  division: ["teams", "shots_faced_per_match", "pct_in"],
  team: [
    "matches",
    "workload",
    "shots_faced_per_match",
    "pct_in",
    "goals_conceded",
    "opponents_usual",
    "badge",
  ],
  entry: [
    "name",
    "key",
    "player_id",
    "number",
    "group",
    "kind",
    "status",
    "tier",
    "reason",
    "basis",
  ],
  basis: ["minutes", "matches", "seasons", "class_year"],
} as const;

/** Every key path in `artifact` that section 10 does not name, or that is out
 *  of its order, or missing. Empty for a file that keeps to the section. */
export function section10Violations(artifact: unknown): string[] {
  const out: string[] = [];
  const check = (value: unknown, keys: readonly string[], path: string): void => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      out.push(`${path}: not an object`);
      return;
    }
    const got = Object.keys(value);
    for (const k of got) if (!keys.includes(k)) out.push(`${path}.${k}: not in section 10`);
    for (const k of keys) if (!got.includes(k)) out.push(`${path}.${k}: missing`);
    const known = got.filter((k) => keys.includes(k));
    const order = keys.filter((k) => known.includes(k));
    if (known.join() !== order.join()) out.push(`${path}: keys out of section 10's order`);
  };
  check(artifact, SECTION_10.file, "$");
  if (artifact === null || typeof artifact !== "object") return out;
  const a = artifact as Record<string, unknown>;
  if (a.division !== undefined) check(a.division, SECTION_10.division, "$.division");
  if (a.teams && typeof a.teams === "object") {
    for (const [slug, t] of Object.entries(a.teams)) check(t, SECTION_10.team, `$.teams.${slug}`);
  }
  if (a.players && typeof a.players === "object") {
    for (const [slug, list] of Object.entries(a.players)) {
      if (!Array.isArray(list)) {
        out.push(`$.players.${slug}: not an array`);
        continue;
      }
      list.forEach((e, i) => {
        const at = `$.players.${slug}[${i}]`;
        check(e, SECTION_10.entry, at);
        if (e && typeof e === "object" && "basis" in e) {
          check((e as { basis: unknown }).basis, SECTION_10.basis, `${at}.basis`);
        }
      });
    }
  }
  return out;
}

/** Code-unit order of two strings, a null first. */
const nullFirst = (a: string | null, b: string | null): number => {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return a < b ? -1 : 1;
};

/** Section 10's order [v2.2]: by key, then number as a string with a null
 *  number first, then name, then player_id (a null first, the number's rule;
 *  the contract does not say), all in code-unit order. */
export function entryOrder(a: TierEntry, b: TierEntry): number {
  if (a.key !== b.key) return a.key < b.key ? -1 : 1;
  return (
    nullFirst(a.number, b.number) ||
    nullFirst(a.name, b.name) ||
    nullFirst(a.player_id, b.player_id)
  );
}

/**
 * Section 9 at the writer: the file keeps to section 10's keys exactly, and
 * no programme's list is in any order but section 10's (an order by estimate
 * would publish a rank inside the tier). Throws, naming every violation.
 */
export function assertNothingForbidden(artifact: TiersFile): void {
  const problems = section10Violations(artifact);
  for (const [slug, list] of Object.entries(artifact.players)) {
    for (let i = 1; i < list.length; i++) {
      if (entryOrder(list[i - 1] as TierEntry, list[i] as TierEntry) > 0) {
        problems.push(`$.players.${slug}: not sorted by key, number, name, player_id`);
        break;
      }
    }
  }
  if (problems.length > 0) {
    throw new Error(`tiers: the artifact breaks sections 9 and 10:\n  ${problems.join("\n  ")}`);
  }
}

/** [0.8] The team defence badge: the top fifth (rounded up, ties included)
 *  of the season's programmes with a workload group, by record across the
 *  whole division. No workload groups here: the review of 20 November 2026
 *  measured the record inside them at R 0.51 / 0.54 / 0.40 (D2 men, D2 women,
 *  D1 men) and across the division at 0.76 / 0.82 / 0.66, against T1's 0.61. */
export const BADGE_PERCENT = 20;

export function badgeHolders(teams: readonly TeamSeason[]): Set<string> {
  return topWithTies(
    teams
      .filter((t) => t.workload !== null && t.record !== null)
      .map((t) => ({ id: t.slug, value: t.record as number })),
    BADGE_PERCENT,
  );
}

export function teamFigure(t: TeamSeason, badge = false): TierTeam {
  return {
    matches: t.matches,
    workload: t.workload,
    shots_faced_per_match: t.matches > 0 ? shotsPerMatch1(t.shotsFaced, t.matches) : null,
    pct_in: t.shotsFaced > 0 ? pctIn1(t.goalsAgainst, t.shotsFaced) : null,
    goals_conceded: t.goalsAgainst,
    opponents_usual: t.matches > 0 ? round1(t.expected) : null,
    badge,
  };
}

export function divisionFigure(teams: readonly TeamSeason[]): TierDivision {
  const grouped = teams.filter((t) => t.workload !== null);
  let n = 0;
  let sa = 0;
  let ga = 0;
  for (const t of grouped) {
    n += t.matches;
    sa += t.shotsFaced;
    ga += t.goalsAgainst;
  }
  if (n === 0 || sa === 0) throw new Error("tiers: no team has a workload group");
  return {
    teams: grouped.length,
    shots_faced_per_match: shotsPerMatch1(sa, n),
    pct_in: pctIn1(ga, sa),
  };
}

export interface ArtifactInput {
  level: TiersFile["level"];
  season: number;
  gender: TiersFile["gender"];
  frozenAt: string;
  dataCommit: string;
  /** Every collected programme-season; those with no record are left out. */
  teams: readonly TeamSeason[];
  /** Entries by programme slug, in any order. */
  players: ReadonlyMap<string, readonly TierEntry[]>;
}

/** The file's text: valid JSON in section 10's key order, one team and one
 *  player entry to a line, so that a rebuild's diff reads player by player. */
export function serialize(artifact: TiersFile): string {
  const head = SECTION_10.file
    .filter((k) => k !== "division" && k !== "teams" && k !== "players")
    .map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(artifact[k])}`);
  const teams = Object.entries(artifact.teams).map(
    ([slug, t]) => `    ${JSON.stringify(slug)}: ${JSON.stringify(t)}`,
  );
  const players = Object.entries(artifact.players).map(
    ([slug, list]) =>
      `    ${JSON.stringify(slug)}: [\n${list.map((e) => `      ${JSON.stringify(e)}`).join(",\n")}\n    ]`,
  );
  const block = (rows: string[]): string => (rows.length ? `{\n${rows.join(",\n")}\n  }` : "{}");
  return `{\n${[
    ...head,
    `  "division": ${JSON.stringify(artifact.division)}`,
    `  "teams": ${block(teams)}`,
    `  "players": ${block(players)}`,
  ].join(",\n")}\n}\n`;
}

/** The artifact, in section 10's key order, sorted, checked and parsed.
 *  [v2.2] `teams` and `players` hold the same programmes: every collected
 *  programme-season with at least one record, in slug order, a programme
 *  whose box scores carry no line for it holding an empty list. */
export function buildArtifact(input: ArtifactInput): TiersFile {
  const withRecords = [...input.teams]
    .filter((t) => t.matches > 0)
    .sort((a, b) => (a.slug < b.slug ? -1 : 1));
  const known = new Set(withRecords.map((t) => t.slug));
  for (const slug of input.players.keys()) {
    if (!known.has(slug)) throw new Error(`tiers: entries for ${slug}, which has no record`);
  }
  const teams: Record<string, TierTeam> = {};
  const players: Record<string, TierEntry[]> = {};
  const badged = badgeHolders(input.teams);
  for (const t of withRecords) {
    teams[t.slug] = teamFigure(t, badged.has(t.slug));
    players[t.slug] = [...(input.players.get(t.slug) ?? [])].sort(entryOrder);
  }
  const artifact: TiersFile = {
    schema: TIERS_SCHEMA,
    level: input.level,
    season: input.season,
    gender: input.gender,
    spec: TIERS_SPEC,
    frozen_at: input.frozenAt,
    data_commit: input.dataCommit,
    division: divisionFigure(input.teams),
    teams,
    players,
  };
  assertNothingForbidden(artifact);
  tiersFileSchema.parse(artifact);
  return artifact;
}
