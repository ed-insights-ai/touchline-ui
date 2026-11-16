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
import type { TeamSeason } from "./workload.ts";

/** One decimal, rounding the double's exact value, a tie (x.x5 exactly,
 *  which a double can hold only as .25 or .75) going up. */
export const round1 = (x: number): number => Number(x.toFixed(1));

/** Whether x sits exactly on a rounding tie at one decimal, where a
 *  half-even rounding would print the other figure. Counted for the log. */
export const onRoundingTie = (x: number): boolean =>
  Number.isInteger(x * 4) && !Number.isInteger(x * 2);

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

/** Section 10's order: by key, then number (as printed, a missing number
 *  last), both in code-unit order. */
export function byKeyThenNumber(a: TierEntry, b: TierEntry): number {
  if (a.key !== b.key) return a.key < b.key ? -1 : 1;
  if (a.number === b.number) return 0;
  if (a.number === null) return 1;
  if (b.number === null) return -1;
  return a.number < b.number ? -1 : 1;
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
      if (byKeyThenNumber(list[i - 1] as TierEntry, list[i] as TierEntry) > 0) {
        problems.push(`$.players.${slug}: not sorted by key, then number`);
        break;
      }
    }
  }
  if (problems.length > 0) {
    throw new Error(`tiers: the artifact breaks sections 9 and 10:\n  ${problems.join("\n  ")}`);
  }
}

export function teamFigure(t: TeamSeason): TierTeam {
  return {
    matches: t.matches,
    workload: t.workload,
    shots_faced_per_match: t.matches > 0 ? round1(t.shotsFaced / t.matches) : null,
    pct_in: t.shotsFaced > 0 ? round1((100 * t.goalsAgainst) / t.shotsFaced) : null,
    goals_conceded: t.goalsAgainst,
    opponents_usual: round1(t.expected),
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
    shots_faced_per_match: round1(sa / n),
    pct_in: round1((100 * ga) / sa),
  };
}

export interface ArtifactInput {
  level: TiersFile["level"];
  season: number;
  gender: TiersFile["gender"];
  frozenAt: string;
  dataCommit: string;
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

/** The artifact, in section 10's key order, sorted, checked and parsed. */
export function buildArtifact(input: ArtifactInput): TiersFile {
  const teams: Record<string, TierTeam> = {};
  for (const t of [...input.teams].sort((a, b) => (a.slug < b.slug ? -1 : 1))) {
    teams[t.slug] = teamFigure(t);
  }
  const players: Record<string, TierEntry[]> = {};
  for (const slug of [...input.players.keys()].sort()) {
    const list = [...(input.players.get(slug) ?? [])].sort(byKeyThenNumber);
    if (list.length > 0) players[slug] = list;
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
