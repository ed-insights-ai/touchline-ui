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
import { loadFixtures, loadMatches, loadRosters, loadStats } from "./data.ts";
import {
  disputedAcross,
  type Fixture,
  hasScore,
  isCountable,
  isDisputed,
  isExhibition,
  isForfeit,
  isScored,
  markOf,
  matchDetailOf,
  matchIdentity,
  resultFor,
  type Season,
} from "./derive.ts";
import {
  classAbbr,
  dayOfMonth,
  friendlies,
  type Line,
  monShort,
  pct1,
  plural,
  positionLine,
  rate3,
  spell,
} from "./format.ts";
import type { KeeperStats, MatchesFile, MatchPlayerLine, Player, PlayerStats } from "./model.ts";

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

/**
 * A figure the card can print, or null when nothing says what it is.
 *
 * `atLeast` marks a floor: a count that could only be higher, because some
 * match that might have added to it has no box score to read. It prints with
 * a trailing "+", so "8+" is never mistaken for a published 8.
 */
export interface Count {
  n: number;
  atLeast: boolean;
}

/** A keeper's clean sheets, read off the season's box scores. */
export interface CleanSheets {
  /** The side conceded none and this keeper was the only one to play. */
  alone: number;
  /** The side conceded none and another keeper played too: the publisher's
   *  combined shutout (the CBO of "SHO/CBO"). */
  shared: number;
  /** The side conceded none and no box score says who was in goal. */
  unseen: number;
}

export interface LogRow {
  date: string;
  opponent: string;
  home: boolean;
  result: "W" | "D" | "L" | null;
  score: string | null;
  /** "by forfeit" or "disputed" beside the score, or null (derive.ts markOf). */
  mark: string | null;
  /** "5 sv · 0 ga" or "2 sh · 1 sog", or null when no box score was collected. */
  line: string | null;
  /** Minutes this player was on the pitch, off the box score's own line, or
   *  null when the box printed no minutes column or the player is not on it.
   *  A box that prints 0 is a listed player who never came on: 0, not null. */
  minutes: number | null;
  /** Came off the bench: the box score's started flag, false. Null when the
   *  box carries no line or no flag. */
  sub: boolean | null;
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
  /** "First season in this programme's archive" / "On the roster since 2022" */
  tenure: string | null;
  triad: Figure[];
  minutes: { played: number; available: number; pct: number; note: string } | null;
  block: { label: string; rows: DetailRow[] } | null;
  career: {
    columns: string[];
    rows: CareerRow[];
    /** The sum of each column above, once there are two seasons to add. */
    total: { label: string; values: string[] } | null;
    note: string | null;
  };
  log: LogRow[];
  exhibitions: string | null;
  finding: { label: "observed" | "derived" | "context"; text: string } | null;
  /** No appearances anywhere in the statistics: the zero state, not an error. */
  unplayed: boolean;
}

const dash = "—";

const stat = (n: number | undefined): string => (n === undefined ? dash : String(n));

const known = (n: number | undefined): Count | null =>
  n === undefined ? null : { n, atLeast: false };

const shown = (c: Count | null): string => (c === null ? dash : `${c.n}${c.atLeast ? "+" : ""}`);

/**
 * One column's career total: the sum of the figures printed above it.
 *
 * A dash adds nothing, because a figure the programme never published is
 * not a zero. The total is honest to the column rather than to the player:
 * a reader can see the dash it skipped one line up. A floor anywhere makes
 * the total a floor. A column of nothing but dashes totals to a dash.
 */
export function sumColumn(cells: readonly (Count | null)[]): Count | null {
  const present = cells.filter((c): c is Count => c !== null);
  if (present.length === 0) return null;
  return {
    n: present.reduce((t, c) => t + c.n, 0),
    atLeast: present.some((c) => c.atLeast),
  };
}

/**
 * Clean sheets counted from box scores, for the seasons a programme's
 * statistics page printed no shutout column the parser reads.
 *
 * Roughly two programmes in five publish the column as "SHO/CBO" (solo and
 * combined, "10/2"), which the collector does not read, so the season
 * statistics carry no shutouts for them at all. Every one of those matches is
 * in the box scores, though: the side conceded none, and the keeper lines say
 * who was in goal and for how long.
 *
 * A clean sheet is the keeper's ALONE only when they are the one keeper with
 * minutes. The NCAA's own convention, and the publisher's: a keeper replaced
 * at 80' shares the shutout with whoever finished it. Read against 2,050
 * keeper seasons whose page printed "SHO/CBO", the solo count here agrees
 * with the publisher's in 96.4% (2026-11-09). Where the two differ, this
 * count says what the box scores say, which is why the card labels it.
 *
 * The same results the record rests on: a disputed match, a forfeit and a
 * friendly are none of them a clean sheet.
 */
export function countCleanSheets(
  fixtures: readonly Fixture[],
  matches: MatchesFile | null,
  disputed: ReadonlySet<string> | undefined,
  slug: string,
  id: string | null,
  folded: string,
): CleanSheets {
  const out: CleanSheets = { alone: 0, shared: 0, unseen: 0 };
  for (const f of fixtures) {
    if (f.home !== slug && f.away !== slug) continue;
    if (!isScored(f) || !hasScore(f) || isForfeit(f)) continue;
    if (disputed?.has(matchIdentity(f))) continue;
    const home = f.home === slug;
    if ((home ? f.away_score : f.home_score) !== 0) continue;
    const detail = matches?.matches[f.id];
    const side = detail ? sideIndexOf(f, detail.home_index, slug) : null;
    const keepers = side === null ? undefined : detail?.teams[side]?.keepers;
    if (!keepers || keepers.length === 0) {
      out.unseen++;
      continue;
    }
    // A keeper line with no minutes column still kept goal; one that prints
    // 0 is the named substitute who never came on.
    const inGoal = keepers.filter((k) => (k.minutes ?? 1) > 0);
    if (!lineFor(inGoal, id, folded)) continue;
    if (inGoal.length === 1) out.alone++;
    else out.shared++;
  }
  return out;
}

/**
 * The figure a card prints for clean sheets: the programme's own where it
 * published one, else the solo count from the box scores. A count with
 * unseen matches is a floor, and a floor of nothing ("0+") says nothing, so
 * that prints as a dash.
 */
export function cleanSheetFigure(
  published: number | undefined,
  counted: CleanSheets,
): Count | null {
  if (published !== undefined) return { n: published, atLeast: false };
  if (counted.unseen > 0 && counted.alone === 0) return null;
  return { n: counted.alone, atLeast: counted.unseen > 0 };
}

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

/** One career row before it is printed: its cells kept as counts so the
 *  total can add them. */
interface CareerCells {
  season: number;
  cells: (Count | null)[];
}

/** A keeper's clean sheets in a season of the archive, wherever it was
 *  collected: published if the line has them, else counted from that
 *  season's own box scores. */
function priorCleanSheets(
  year: number,
  gender: string,
  key: string,
  slug: string,
  k: KeeperStats,
): Count | null {
  if (k.shutouts !== undefined) return known(k.shutouts);
  let fixtures: Fixture[];
  try {
    fixtures = loadFixtures(year, gender, key).fixtures;
  } catch {
    return null;
  }
  const counted = countCleanSheets(
    fixtures,
    loadMatches(year, gender, key),
    disputedAcross(year, gender),
    slug,
    k.player_id ?? null,
    foldName(k.name),
  );
  return cleanSheetFigure(undefined, counted);
}

/** Prior seasons of this programme, newest first, wherever they were collected. */
function priorSeasons(s: Season, slug: string, folded: string, keeper: boolean): CareerCells[] {
  const rows: CareerCells[] = [];
  const gender = s.fixtures.gender;
  for (let year = s.fixtures.season - 1; year >= s.fixtures.season - 10; year--) {
    for (const key of site.conferences) {
      const file = loadStats(year, gender, key);
      const team = file?.teams[slug];
      if (!team) continue;
      const p = team.players?.find((x) => foldName(x.name) === folded);
      const k = team.keepers?.find((x) => foldName(x.name) === folded);
      if (!p && !k) continue;
      rows.push({
        season: year,
        cells: keeper
          ? [
              known(k?.gp ?? p?.gp),
              known(k?.minutes ?? p?.minutes),
              known(k?.saves),
              known(k?.goals_against),
              k ? priorCleanSheets(year, gender, key, slug, k) : null,
            ]
          : [known(p?.gp), known(p?.minutes), known(p?.goals), known(p?.assists)],
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

/**
 * The keeper's composed sentence, and the striker's.
 *
 * Both are exported and pure so their agreement can be read at a count of one
 * without standing up a season. "One shots on target faced" shipped, and the
 * only way to see it on the site was to find a keeper who had faced exactly
 * one — which is the first competitive minute of every keeper's season.
 */
export function keeperSentence(faced: number, apps: number, saves: number, every: boolean): string {
  return `${cap(spell(faced))} ${plural(faced, "shot", "shots")} on target faced across ${spell(
    apps,
  )} ${plural(apps, "match", "matches")}; ${spell(saves)} stopped${
    every ? " — and every countable minute in goal so far." : "."
  }`;
}

export function strikeSentence(goals: number, shots: number): string {
  return `${cap(spell(goals))} from ${spell(shots)} ${plural(
    shots,
    "shot",
    "shots",
  )} — ${pct1(goals / shots)} of what they struck.`;
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
  // The archive is not a birth certificate.
  //
  // A player absent from every earlier roster file is new to THIS ARCHIVE,
  // which is a fact about what has been collected and not a fact about the
  // player. The LSC archive begins in 2022 and GAC/GSC in 2016, and any
  // transfer from outside these three conferences reads as archive-new
  // however many seasons they have played — Ryan Armijo of Ouachita Baptist
  // appears in no earlier file and the 2026 roster publishes him a Junior.
  // So the card states what the archive holds and never what it implies.
  //
  // One predicate, because the three places that ask this question used to
  // ask it by string-matching the tenure line, and three copies of a sentence
  // are three chances for two of them to drift.
  const archiveNew = firstYear === s.fixtures.season;
  const tenure =
    firstYear === null
      ? null
      : archiveNew
        ? "First season in this programme's archive"
        : `On the roster since ${firstYear}`;

  // ── The season's own figures ──────────────────────────────────────────────
  // Counted for every keeper, published figure or not: the shared clean
  // sheets are only ever in the box scores.
  const counted = keeper
    ? countCleanSheets(s.fixtures.fixtures, s.matches, s.disputed, slug, id, folded)
    : null;
  const cleanSheets = counted ? cleanSheetFigure(keeperStats?.shutouts, counted) : null;
  const triad: Figure[] = keeper
    ? [
        { value: stat(keeperStats?.saves), label: "SAVES" },
        { value: stat(keeperStats?.goals_against), label: "GOALS AGAINST" },
        { value: shown(cleanSheets), label: "CLEAN SHEETS" },
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
  // A forfeit was awarded, not played: no minute of it was available to
  // anyone. It stays in the log, marked, and out of the minutes.
  const available = teamPlayed.filter((f) => !isForfeit(f)).length * FULL_TIME;
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
          note: `${played} / ${available} · ${apps} ${plural(apps, "appearance", "appearances")}, ${starts} ${plural(starts, "start", "starts")}`,
        };

  const cautions = stats?.yellow ?? 0;
  const reds = stats?.red ?? 0;
  const discipline =
    cautions === 0 && reds === 0
      ? dash
      : [
          cautions > 0 ? `${cautions} ${plural(cautions, "caution", "cautions")}` : null,
          // "2 red" was the one that read as a typo rather than a sentence.
          reds > 0 ? `${reds} ${plural(reds, "red", "reds")}` : null,
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
          // Where the programme published none, the figure above was counted
          // here, and this row says so, with the half the publisher would
          // have printed after the slash.
          ...(keeperStats?.shutouts === undefined && counted && cleanSheets
            ? [
                {
                  label: "Clean sheets, by box score",
                  value: `${shown(cleanSheets)} alone · ${counted.shared} shared`,
                },
              ]
            : []),
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
  const thisSeason: CareerCells | null =
    stats || keeperStats
      ? {
          season: s.fixtures.season,
          cells: keeper
            ? [
                known(keeperStats?.gp),
                known(keeperStats?.minutes),
                known(keeperStats?.saves),
                known(keeperStats?.goals_against),
                cleanSheets,
              ]
            : [known(stats?.gp), known(stats?.minutes), known(stats?.goals), known(stats?.assists)],
        }
      : null;
  const prior = priorSeasons(s, slug, folded, keeper);
  const seasons = [...(thisSeason ? [thisSeason] : []), ...prior];
  const columns = keeper ? ["GP", "MIN", "SV", "GA", "CS"] : ["GP", "MIN", "G", "A"];
  // A total of one season is that season again; it appears from the second.
  const total =
    seasons.length > 1
      ? {
          label: "Total",
          values: columns.map((_, i) => shown(sumColumn(seasons.map((r) => r.cells[i] ?? null)))),
        }
      : null;
  const rows = seasons.map((r) => ({ season: r.season, values: r.cells.map(shown) }));
  const floors = [...rows.flatMap((r) => r.values), ...(total?.values ?? [])].some((v) =>
    v.endsWith("+"),
  );
  const career = {
    columns,
    rows,
    total,
    note:
      prior.length > 0
        ? // The archive's seasons at this programme, not the player's career:
          // a transfer's earlier programme is not in the sum.
          `${seasons.length} seasons at ${s.names.name(slug)} in the archive.${
            floors ? " A + is a floor: a clean sheet without a box score to say who kept it." : ""
          }`
        : archiveNew
          ? "No earlier season in this programme's archive carries this player."
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
    // The line the minutes are read off: a keeper's own keeper line where the
    // box has one (an outfield line for a keeper who took a shot lacks them).
    const appeared = keeper && ownKeeper ? ownKeeper : (own ?? ownKeeper);
    const played =
      keeper && ownKeeper
        ? `${ownKeeper.saves ?? 0} sv · ${ownKeeper.goals_against ?? 0} ga`
        : own
          ? `${own.shots ?? 0} sh · ${own.sog ?? 0} sog`
          : null;
    // A disputed score is shown and marked, never read as a result; a
    // forfeit's result is the award. A forfeit has no box score to be
    // absent from, and says so rather than naming a gap.
    log.push({
      date: shortDate(f.date),
      opponent: s.names.name(home ? f.away : f.home),
      home,
      result: isDisputed(s, f) ? null : resultFor(f, home ? "home" : "away"),
      score: gf === null || ga === null ? null : `${gf}–${ga}`,
      mark: markOf(s, f),
      line: played,
      minutes: appeared?.minutes ?? null,
      sub: appeared?.started === undefined ? null : !appeared.started,
      absent: played
        ? null
        : detail
          ? "did not appear"
          : isForfeit(f)
            ? "not played"
            : "box score unavailable",
    });
  }

  // ── Friendlies, named and outside the record ──────────────────────────────
  const exh = s.fixtures.fixtures.filter(
    (f) => isExhibition(f) && (f.home === slug || f.away === slug),
  );
  const exhibitions =
    exh.length === 0
      ? null
      : `+ ${exh.length} ${friendlies(exh.length)}, ${shortDate(
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
        text: keeperSentence(faced, apps, keeperStats.saves, every === true),
      };
    }
    if (stats && (stats.goals ?? 0) > 0 && stats.shots) {
      return {
        label: "derived" as const,
        text: strikeSentence(stats.goals ?? 0, stats.shots),
      };
    }
    if (firstYear !== null && !archiveNew) {
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
