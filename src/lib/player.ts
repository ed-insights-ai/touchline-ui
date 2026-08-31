/**
 * The player sheet's model.
 *
 * Everything on the card is computed from the roster, the season statistics
 * and the box scores already loaded for the page. No model runs here: the one
 * sentence that wears an evidence chip is composed from the same figures
 * printed above it, so the validator's discipline holds without the validator.
 *
 * The card is position-shaped. A keeper's season is saves, goals against and
 * clean sheets; a field player's is goals, assists and points. Printing a
 * keeper's zero goals as though that were their record would be a true figure
 * telling a false story.
 */

import { site } from "../site.config.ts";
import { loadRosters, loadStats } from "./data.ts";
import {
  type Fixture,
  hasScore,
  isCountable,
  isExhibition,
  isScored,
  matchDetailOf,
  type Season,
} from "./derive.ts";
import {
  classAbbr,
  dayOfMonth,
  type Line,
  monShort,
  pct1,
  positionLine,
  rate3,
  spell,
} from "./format.ts";
import type { KeeperStats, MatchPlayerLine, Player, PlayerStats } from "./model.ts";

/** Regulation length. Countable minutes available are counted against it. */
const FULL_TIME = 90;

// ── Names ───────────────────────────────────────────────────────────────────
// Opponent-side match lines lose their diacritics where rosters and season
// statistics keep them ("Noe Coutiño" is served as "Noe Coutino"), so every
// cross-layer name match runs through the same fold.

export const foldName = (name: string): string =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’.,-]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");

/**
 * The player's id, which the rosters file carries only in its `source_url`.
 *
 * The trailing path segment of a roster source_url is the same id the season
 * statistics print, in 552 of 552 players across the three conferences. It is
 * NOT stable between seasons — Sidearm re-mints ids yearly — so it joins
 * within a season only, and career linkage uses the folded name instead.
 */
export const playerIdOf = (player: Player): string | null =>
  player.source_url?.match(/\/([^/]+)\/?$/)?.[1] ?? null;

/** "1st Year" and "Freshman" are the same class in two dialects. */
export function classFull(classYear: string | undefined): string | null {
  if (!classYear) return null;
  const s = classYear.toLowerCase();
  if (/^\d/.test(s)) {
    const ordinal = s[0];
    const named =
      ordinal === "1"
        ? "Freshman"
        : ordinal === "2"
          ? "Sophomore"
          : ordinal === "3"
            ? "Junior"
            : ordinal === "4"
              ? "Senior"
              : ordinal === "5"
                ? "Fifth Year"
                : null;
    if (named) return named;
  }
  return classYear;
}

// ── The card ────────────────────────────────────────────────────────────────

export interface Figure {
  value: string;
  label: string;
}

export interface DetailRow {
  label: string;
  value: string;
  /** A caution count draws the amber glyph beside its value. */
  cautions?: number;
}

export interface CareerRow {
  season: number;
  values: string[];
}

export interface LogRow {
  date: string;
  opponent: string;
  home: boolean;
  result: "W" | "D" | "L" | null;
  score: string | null;
  /** "5 sv · 0 ga" or "2 sh · 1 sog", or null when no box score was collected. */
  line: string | null;
  /** Why the line is missing, when it is. */
  absent: string | null;
}

export interface PlayerCard {
  anchor: string;
  name: string;
  number: string | null;
  line: Line | null;
  programme: string;
  season: number;
  keeper: boolean;
  /** "Freshman · 6'2" · 201 lbs · Cape Town, South Africa" */
  bio: string | null;
  /** "First season in the colors" / "On the roster since 2022" */
  tenure: string | null;
  triad: Figure[];
  minutes: { played: number; available: number; pct: number; note: string } | null;
  block: { label: string; rows: DetailRow[] } | null;
  career: { columns: string[]; rows: CareerRow[]; note: string | null };
  log: LogRow[];
  exhibitions: string | null;
  finding: { label: "observed" | "derived" | "context"; text: string } | null;
  /** No appearances anywhere in the statistics: the zero state, not an error. */
  unplayed: boolean;
}

const dash = "—";

const stat = (n: number | undefined): string => (n === undefined ? dash : String(n));

const cap = (w: string): string => `${w.charAt(0).toUpperCase()}${w.slice(1)}`;

/** "Aug 27" from an ISO date, without ever constructing a Date. */
const shortDate = (iso: string): string => `${monShort(iso)} ${dayOfMonth(iso)}`;

/**
 * Which served side of a box score is this programme.
 *
 * Resolved through the fixture's own home/away slugs and the detail's
 * home_index, never by matching team names — one side of every box score is
 * served under the host's own spelling, and only the site owner's side carries
 * player ids at all.
 */
function sideIndexOf(fixture: Fixture, homeIndex: number | undefined, slug: string): number | null {
  if (homeIndex === undefined) return null;
  return fixture.home === slug ? homeIndex : 1 - homeIndex;
}

function lineFor(
  lines: MatchPlayerLine[] | undefined,
  id: string | null,
  folded: string,
): MatchPlayerLine | undefined {
  const byId = id ? lines?.find((l) => l.player_id === id) : undefined;
  return byId ?? lines?.find((l) => foldName(l.name) === folded);
}

/** Prior seasons of this programme, newest first, wherever they were collected. */
function priorSeasons(s: Season, slug: string, folded: string, keeper: boolean): CareerRow[] {
  const rows: CareerRow[] = [];
  for (let year = s.fixtures.season - 1; year >= s.fixtures.season - 10; year--) {
    for (const key of site.conferences) {
      const file = loadStats(year, s.fixtures.gender, key);
      const team = file?.teams[slug];
      if (!team) continue;
      const p = team.players?.find((x) => foldName(x.name) === folded);
      const k = team.keepers?.find((x) => foldName(x.name) === folded);
      if (!p && !k) continue;
      rows.push({
        season: year,
        values: keeper
          ? [
              stat(k?.gp ?? p?.gp),
              stat(k?.minutes ?? p?.minutes),
              stat(k?.saves),
              stat(k?.goals_against),
            ]
          : [stat(p?.gp), stat(p?.minutes), stat(p?.goals), stat(p?.assists)],
      });
      break;
    }
  }
  return rows;
}

/** Whether this programme's roster carried the name in a given season. */
function onRosterIn(s: Season, slug: string, folded: string, year: number): boolean {
  for (const key of site.conferences) {
    const roster = loadRosters(year, s.fixtures.gender, key)?.rosters[slug];
    if (roster?.players.some((p) => foldName(p.name) === folded)) return true;
  }
  return false;
}

export function playerCard(
  s: Season,
  slug: string,
  player: Player,
  stats: PlayerStats | undefined,
  keeperStats: KeeperStats | undefined,
): PlayerCard {
  const folded = foldName(player.name);
  const id = playerIdOf(player);
  const keeper = keeperStats !== undefined && (keeperStats.minutes ?? 0) > 0;
  const line = positionLine(player.position);

  // ── Bio ───────────────────────────────────────────────────────────────────
  // Weight is published for a third of these rosters; height for nine in ten.
  // Each part appears only if the programme printed it.
  const bio =
    [classFull(player.class_year), player.height, player.weight, player.hometown]
      .filter(Boolean)
      .join(" · ") || null;

  const firstYear = (() => {
    for (let y = s.fixtures.season - 1; y >= s.fixtures.season - 10; y--) {
      if (!onRosterIn(s, slug, folded, y)) return y + 1;
    }
    return null;
  })();
  const tenure =
    firstYear === null
      ? null
      : firstYear === s.fixtures.season
        ? "First season in the colors"
        : `On the roster since ${firstYear}`;

  // ── The season's own figures ──────────────────────────────────────────────
  const triad: Figure[] = keeper
    ? [
        { value: stat(keeperStats?.saves), label: "SAVES" },
        { value: stat(keeperStats?.goals_against), label: "GOALS AGAINST" },
        { value: stat(keeperStats?.shutouts), label: "CLEAN SHEETS" },
      ]
    : [
        { value: stat(stats?.goals), label: "GOALS" },
        { value: stat(stats?.assists), label: "ASSISTS" },
        { value: stat(stats?.points), label: "POINTS" },
      ];

  // Every minute the programme has played that counts, against which this
  // player's own minutes are read. Exhibitions are not in it.
  const teamPlayed = s.fixtures.fixtures.filter(
    (f) => (f.home === slug || f.away === slug) && isScored(f),
  );
  const available = teamPlayed.length * FULL_TIME;
  const played = stats?.minutes ?? keeperStats?.minutes;
  const apps = stats?.gp ?? keeperStats?.gp ?? 0;
  const starts = stats?.gs ?? keeperStats?.gs ?? 0;
  const minutes =
    played === undefined || available === 0
      ? null
      : {
          played,
          available,
          pct: Math.min(100, Math.round((played / available) * 100)),
          note: `${played} / ${available} · ${apps} ${apps === 1 ? "appearance" : "appearances"}, ${starts} ${starts === 1 ? "start" : "starts"}`,
        };

  const cautions = stats?.yellow ?? 0;
  const reds = stats?.red ?? 0;
  const discipline =
    cautions === 0 && reds === 0
      ? dash
      : [
          cautions > 0 ? `${cautions} ${cautions === 1 ? "caution" : "cautions"}` : null,
          reds > 0 ? `${reds} red` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  const block = keeper
    ? {
        label: "BETWEEN THE POSTS",
        rows: [
          { label: "Save percentage", value: rate3(keeperStats?.save_pct) ?? dash },
          {
            label: "Goals against average",
            value: keeperStats?.gaa === undefined ? dash : keeperStats.gaa.toFixed(2),
          },
          { label: "Shots faced", value: stat(keeperStats?.shots_faced) },
          {
            label: "Record",
            value:
              keeperStats?.wins === undefined
                ? dash
                : `${keeperStats.wins}–${keeperStats.ties ?? 0}–${keeperStats.losses ?? 0}`,
          },
          { label: "Discipline", value: discipline, cautions },
        ],
      }
    : stats
      ? {
          label: "IN FRONT OF GOAL",
          rows: [
            { label: "Shots", value: stat(stats.shots) },
            {
              label: "On target",
              value:
                stats.sog === undefined
                  ? dash
                  : `${stats.sog}${stats.shots ? ` · ${pct1(stats.sog / stats.shots)}` : ""}`,
            },
            {
              label: "Conversion",
              value: stats.shots ? (pct1((stats.goals ?? 0) / stats.shots) ?? dash) : dash,
            },
            { label: "Discipline", value: discipline, cautions },
          ],
        }
      : null;

  // ── Career ────────────────────────────────────────────────────────────────
  const thisSeason: CareerRow | null =
    stats || keeperStats
      ? {
          season: s.fixtures.season,
          values: keeper
            ? [
                stat(keeperStats?.gp),
                stat(keeperStats?.minutes),
                stat(keeperStats?.saves),
                stat(keeperStats?.goals_against),
              ]
            : [stat(stats?.gp), stat(stats?.minutes), stat(stats?.goals), stat(stats?.assists)],
        }
      : null;
  const prior = priorSeasons(s, slug, folded, keeper);
  const career = {
    columns: keeper ? ["GP", "MIN", "SV", "GA"] : ["GP", "MIN", "G", "A"],
    rows: [...(thisSeason ? [thisSeason] : []), ...prior],
    note:
      prior.length > 0
        ? null
        : tenure === "First season in the colors"
          ? "A true freshman — no earlier seasons in the archive."
          : "No earlier season of this programme carries a line for this name.",
  };

  // ── Match by match ────────────────────────────────────────────────────────
  const log: LogRow[] = [];
  for (const f of teamPlayed) {
    const home = f.home === slug;
    const detail = matchDetailOf(s, f.id);
    const side = detail ? sideIndexOf(f, detail.home_index, slug) : null;
    const team = side === null ? undefined : detail?.teams[side];
    const own = lineFor(team?.players, id, folded);
    const ownKeeper = lineFor(team?.keepers, id, folded);
    const gf = hasScore(f) ? (home ? f.home_score : f.away_score) : null;
    const ga = hasScore(f) ? (home ? f.away_score : f.home_score) : null;
    const played =
      keeper && ownKeeper
        ? `${ownKeeper.saves ?? 0} sv · ${ownKeeper.goals_against ?? 0} ga`
        : own
          ? `${own.shots ?? 0} sh · ${own.sog ?? 0} sog`
          : null;
    log.push({
      date: shortDate(f.date),
      opponent: s.names.name(home ? f.away : f.home),
      home,
      result: gf === null || ga === null ? null : gf > ga ? "W" : gf < ga ? "L" : "D",
      score: gf === null || ga === null ? null : `${gf}–${ga}`,
      line: played,
      absent: played ? null : detail ? "did not appear" : "box score unavailable",
    });
  }

  // ── Exhibitions, named and outside the record ─────────────────────────────
  const exh = s.fixtures.fixtures.filter(
    (f) => isExhibition(f) && (f.home === slug || f.away === slug),
  );
  const exhibitions =
    exh.length === 0
      ? null
      : `+ ${exh.length} ${exh.length === 1 ? "exhibition" : "exhibitions"}, ${shortDate(
          exh[0]?.date ?? "",
        )}${exh.length > 1 ? `–${dayOfMonth(exh[exh.length - 1]?.date ?? "")}` : ""} — outside the record.`;

  // ── The one composed sentence ─────────────────────────────────────────────
  // Derived, because it restates published figures as a relationship the
  // publisher did not print: saves plus goals against is the shots on target
  // this keeper faced. It is arithmetic on the card's own numbers, nothing more.
  const finding = (() => {
    if (keeper && keeperStats?.saves !== undefined && keeperStats.goals_against !== undefined) {
      const faced = keeperStats.saves + keeperStats.goals_against;
      const every = minutes && minutes.played === minutes.available;
      return {
        label: "derived" as const,
        text: `${cap(spell(faced))} shots on target faced across ${spell(apps)} ${apps === 1 ? "match" : "matches"}; ${spell(keeperStats.saves)} stopped${
          every ? " — and every countable minute in goal so far." : "."
        }`,
      };
    }
    if (stats && (stats.goals ?? 0) > 0 && stats.shots) {
      return {
        label: "derived" as const,
        text: `${cap(spell(stats.goals ?? 0))} from ${spell(stats.shots)} ${stats.shots === 1 ? "shot" : "shots"} — ${pct1((stats.goals ?? 0) / stats.shots)} of what they struck.`,
      };
    }
    if (tenure && tenure !== "First season in the colors" && firstYear !== null) {
      return {
        label: "context" as const,
        text: `On ${s.names.name(slug)}'s roster every season since ${firstYear}.`,
      };
    }
    return null;
  })();

  return {
    anchor: `p-${slug}-${id ?? folded.replace(/\s+/g, "-")}`,
    name: player.name,
    number: player.number ?? null,
    line,
    programme: s.names.name(slug),
    season: s.fixtures.season,
    keeper,
    bio,
    tenure,
    triad,
    minutes,
    block,
    career,
    log,
    exhibitions,
    finding,
    unplayed: !stats && !keeperStats,
  };
}

export { classAbbr, isCountable };
