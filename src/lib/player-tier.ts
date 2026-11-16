/**
 * The player sheet's tier: the TIER block, the holder's line at the top of the
 * sheet, the squad row's words, and the CAREER line for earlier seasons.
 *
 * Every sentence a reader meets about a tier is composed here, beside the
 * card's own (player.ts), so copy.test.ts reads them with the rest of the
 * sheet. The strings are DESIGN.md's ("The strings"), as settled by its
 * Decisions section; the method page is pages/about/[tiers].astro.
 *
 * Nothing here computes a tier. Everything is read off the tiers artifact
 * (lib/tiers.ts), and only the fields ALGORITHM.md section 10 names: no
 * score, estimate, rank or percentile can reach a page through this file,
 * because the artifact cannot hold one and still parse.
 *
 * And nothing here renders unless the publication gate (tiers.config.ts) is
 * open: activeTiers() is null with it closed, and every caller draws nothing
 * from null.
 */

import { ncaaDivision, site } from "../site.config.ts";
import { tiersEnabled } from "../tiers.config.ts";
import { isScored, type Season } from "./derive.ts";
import { dayOfMonth, monLong, plural } from "./format.ts";
import { classFull, playerIdOf } from "./player.ts";
import {
  loadTiers,
  type TeamFigures,
  type TierBasis,
  type TierEntry,
  type TiersFile,
  type TierTeam,
  teamFigures,
  tierFor,
} from "./tiers.ts";

/** The mark the site prints for a figure that was never published. */
const DASH = "—";

/** How far back the CAREER line looks: the career table's own reach. */
const EARLIER_SEASONS = 10;

/**
 * The tiers file this build renders, or null: null when the gate is closed,
 * when the build is not Division II, and when no file was built for the
 * season and gender. A page that holds null draws no tier anywhere.
 */
export function activeTiers(
  level: string = ncaaDivision,
  season: number = site.season,
  gender: string = site.gender,
  preview?: string,
): TiersFile | null {
  if (!tiersEnabled(level, preview)) return null;
  return loadTiers(level, season, gender);
}

// ── The status ──────────────────────────────────────────────────────────────

/**
 * A status as the sheet prints it. A tier of shooting and scoring has two
 * parts, printed "Tier 1 · Shooting and scoring"; the middot is drawn for the
 * eye and read as a comma, so `kind` is kept apart for the page to join.
 */
export interface StatusLabel {
  head: string;
  kind: string | null;
}

export function statusLabel(e: TierEntry): StatusLabel {
  switch (e.status) {
    case "tier":
      return e.kind === "team_defence"
        ? { head: "Team defence tier", kind: null }
        : { head: `Tier ${e.tier}`, kind: "Shooting and scoring" };
    case "eligible":
      return { head: "Eligible, no tier", kind: null };
    case "needs_minutes":
      return { head: "Needs more minutes", kind: null };
    case "needs_second_season":
      return { head: "Needs a second season", kind: null };
    case "incomplete":
      return { head: "Incomplete records", kind: null };
  }
}

/** The label as one string, middot and all: the CAREER line's text form. */
export const labelText = (l: StatusLabel): string => (l.kind ? `${l.head} · ${l.kind}` : l.head);

/**
 * A holder's tier in the sheet's meta register and in the squad row's
 * screen-reader text: "Tier 1, shooting and scoring", "Team defence tier".
 * Null for anyone who holds none, who gets neither.
 */
export function holderLine(e: TierEntry): string | null {
  if (e.status !== "tier") return null;
  return e.kind === "team_defence" ? "Team defence tier" : `Tier ${e.tier}, shooting and scoring`;
}

// ── The meaning ─────────────────────────────────────────────────────────────

/** The position group's plural, as the meaning lines name it. */
const groupPlural = (e: TierEntry): string => (e.group === "M" ? "midfielders" : "forwards");

/** One sentence on what the status means, naming the programme as the site
 *  names it (`programme` is the caller's `s.names.name(slug)`). */
export function meaningLine(e: TierEntry, programme: string): string {
  const P = programme;
  const defence = e.kind === "team_defence";
  switch (e.status) {
    case "tier":
      if (defence) {
        return `${P}'s defending over the seasons counted, shared by every regular defender and goalkeeper with the same seasons. It describes the team, not one player.`;
      }
      return e.tier === 1
        ? `The top 5% of eligible ${groupPlural(e)} for shooting and scoring.`
        : `The next 15% of eligible ${groupPlural(e)}, after Tier 1, for shooting and scoring.`;
    case "eligible":
      return defence
        ? `A regular at ${P} for enough seasons in a row to be compared.`
        : `Played enough this season to be compared with eligible ${groupPlural(e)} for shooting and scoring.`;
    case "needs_minutes":
      if (e.group === "GK") {
        return `The team defence tier needs a regular: 600 minutes and 50% of ${P}'s minutes in a season.`;
      }
      if (defence) {
        return `The team defence tier needs a regular: 900 minutes and 70% of ${P}'s minutes in a season.`;
      }
      return `A tier needs 900 minutes this season, or 600 in each of the last two seasons as a forward or midfielder at ${P}.`;
    case "needs_second_season":
      return `A regular in defence or goal at ${P} this season, but not the season before. The team defence tier needs two such seasons in a row.`;
    case "incomplete":
      switch (e.reason) {
        case "no_minutes":
          return `${P}'s box scores print minutes for too few matches, and its season statistics give none for this player, so playing time cannot be counted.`;
        case "no_position":
          return `Neither ${P}'s roster nor its box scores give a position for this player.`;
        case "few_matches":
          return `Fewer than twelve of ${P}'s matches were collected, too few to compare its defending.`;
        // "identity": the schema sets a reason on every incomplete entry, and
        // this is the fourth and last it allows.
        default:
          return `The name could not be matched from one ${P} box score to the next, so the season cannot be counted fairly.`;
      }
  }
}

// ── The basis ───────────────────────────────────────────────────────────────

const thousands = (n: number): string => n.toLocaleString("en-US");

/** "season 2026", "seasons 2025 and 2026", "seasons 2024 to 2026". Years are
 *  joined in words, never with a hyphen, which would read as a scoreline. */
export function seasonsPhrase(seasons: readonly number[]): string {
  const first = seasons[0];
  const last = seasons[seasons.length - 1];
  if (first === undefined || last === undefined) return "";
  if (seasons.length === 1) return `season ${first}`;
  if (seasons.length === 2) return `seasons ${first} and ${last}`;
  const consecutive = seasons.every((y, i) => i === 0 || y === (seasons[i - 1] ?? y) + 1);
  return consecutive
    ? `seasons ${first} to ${last}`
    : `seasons ${seasons.slice(0, -1).join(", ")} and ${last}`;
}

/**
 * What the status rests on: "1,412 minutes · 17 appearances · season 2026 ·
 * Junior". Summed over the seasons counted, which is why it says seasons when
 * there are two or three: the sum will not equal this season's MINUTES line.
 * One season's figures may not equal that line either, because the line reads
 * the stats page and the tier counts the box scores (basisNote, below).
 * A class year the roster never printed is left out, never "unknown".
 */
export function basisLine(b: TierBasis): string {
  const year = classFull(b.class_year ?? undefined);
  return [
    `${thousands(b.minutes)} ${plural(b.minutes, "minute", "minutes")}`,
    `${thousands(b.matches)} ${plural(b.matches, "appearance", "appearances")}`,
    seasonsPhrase(b.seasons),
    year,
  ]
    .filter(Boolean)
    .join(" · ");
}

// ── The basis beside the sheet's own line ───────────────────────────────────

/**
 * What the sheet's MINUTES line prints for the season, as the tier's note
 * reads it: the minutes, the appearances when the line prints them, and the
 * goalkeeping table's minutes when the stats page has that table for the
 * player.
 */
export interface SeasonLine {
  played: number;
  appearances: number | null;
  keeperTable: number | null;
  /** The programme has played since the tiers were set (playedSince). */
  since: boolean;
}

/**
 * Whether the programme has played since the tiers were set. A freeze is
 * built in the morning from the matches played to the day before, so a match
 * dated on the freeze day or later is not in it; the sheet's season line is
 * read live and runs on past the tier's count.
 */
export function playedSince(s: Season, slug: string, frozenAt: string): boolean {
  return s.fixtures.fixtures.some(
    (f) => (f.home === slug || f.away === slug) && isScored(f) && f.date >= frozenAt,
  );
}

/**
 * The season line off the card's own minutes ("1683 / 1800 · 20 appearances,
 * 20 starts"). It is read from what the sheet prints, not from the stats row
 * again, so the note compares the tier with the figures the reader sees. Null
 * when the sheet prints no MINUTES line.
 */
export function seasonLineOf(
  minutes: { played: number; note: string } | null,
  keeperTable?: number | null,
  since = false,
): SeasonLine | null {
  if (!minutes) return null;
  const appearances = /· (\d+) appearances?\b/.exec(minutes.note)?.[1];
  return {
    played: minutes.played,
    appearances: appearances === undefined ? null : Number(appearances),
    keeperTable: keeperTable ?? null,
    since,
  };
}

/**
 * One sentence where the tier's minutes or appearances are not the ones on
 * the sheet's own MINUTES line. That line reads the stats page; the tier
 * counts the box scores, or for a keeper the stats page's goalkeeping table,
 * whichever shows more (ALGORITHM.md, rulings N1 and M1). Printing two counts
 * of one season without a word is a silent contradiction, which the minutes
 * bar already refuses for its own two tables (PlayerSheet's minutesSource).
 *
 * Once the programme has played since the tiers were set, the line above has
 * run on and the tier has not ("the minutes beside a tier are the minutes to
 * that day"). A difference then is said as that, whatever else is in it: the
 * source of a count cannot be told apart from a later match.
 *
 * Null when the two agree, when the sheet prints no line, when the status
 * prints no basis, and when the basis spans seasons: a sum over seasons names
 * its seasons and is not the season's line.
 */
export function basisNote(e: TierEntry, line: SeasonLine | null): string | null {
  if (line === null || e.status === "incomplete" || e.basis.seasons.length !== 1) return null;
  const differs =
    e.basis.minutes !== line.played ||
    (line.appearances !== null && e.basis.matches !== line.appearances);
  if (differs && line.since) {
    return "Counted to the day the tier was set; the line above includes matches played since.";
  }
  if (e.basis.minutes !== line.played) {
    return line.keeperTable !== null && e.basis.minutes === line.keeperTable
      ? "Counted from the stats page's goalkeeping table."
      : "Counted from the box scores, which differ from the stats page's totals above.";
  }
  return line.appearances !== null && e.basis.matches !== line.appearances
    ? "Appearances are counted from the box scores, which differ from the stats page's count above."
    : null;
}

// ── The team figures ────────────────────────────────────────────────────────

export interface TierFigureRow {
  label: string;
  team: string;
  division: string;
  /** What a screen reader hears in place of a dash, when the team's figure
   *  was never recorded. */
  absent: string | null;
}

export interface TierFigures {
  /** "HARDING'S DEFENCE, 2026" and "HEAVY WORKLOAD": joined by a middot that
   *  is drawn for the eye and read as a comma. */
  caption: { head: string; workload: string | null };
  rows: TierFigureRow[];
  /** "Gave up 24 goals where its opponents usually score 31." */
  goals: string | null;
  note: string;
}

const oneDecimal = (x: number): string => x.toFixed(1);

/** Goals given up beside what the opponents usually score: the figure the
 *  team defence tier compares, in one sentence, its second number rounded to
 *  a whole one (Decision 2). Null when the team has no matches to read. */
export function goalsLine(team: TierTeam): string | null {
  if (team.opponents_usual === null) return null;
  const usual = Math.floor(team.opponents_usual + 0.5);
  const n = team.goals_conceded;
  // Figures, not prose: two counts set side by side read as numerals, both of them.
  return `Gave up ${n} ${plural(n, "goal", "goals")} where its opponents usually score ${usual}.`;
}

/** The note under the figures: they are the team's, not the player's. */
export const figuresNote = (programme: string): string =>
  `The same for every regular defender and goalkeeper at ${programme}.`;

/**
 * This season's team figures for a regular defender's or goalkeeper's sheet,
 * whatever seasons the tier rests on (SPEC rule 6.7). Two rows beside the
 * division's figures, then one sentence, then the note. Null when the team
 * faced no recorded match.
 */
export function tierFigures(f: TeamFigures, programme: string, season: number): TierFigures | null {
  const { team, division } = f;
  if (team.shots_faced_per_match === null) return null;
  return {
    caption: {
      head: `${programme.toUpperCase()}'S DEFENCE, ${season}`,
      workload: team.workload ? `${team.workload.toUpperCase()} WORKLOAD` : null,
    },
    rows: [
      {
        label: "Shots faced a match",
        team: oneDecimal(team.shots_faced_per_match),
        division: oneDecimal(division.shots_faced_per_match),
        absent: null,
      },
      {
        label: "Shots faced that went in",
        team: team.pct_in === null ? DASH : `${oneDecimal(team.pct_in)}%`,
        division: `${oneDecimal(division.pct_in)}%`,
        absent: team.pct_in === null ? "No shots faced were recorded." : null,
      },
    ],
    goals: goalsLine(team),
    note: figuresNote(programme),
  };
}

/** Whose sheet carries the team figures: a defender or goalkeeper who was a
 *  regular this season, which every one of these three statuses implies. */
const showsFigures = (e: TierEntry): boolean =>
  e.kind === "team_defence" &&
  (e.status === "tier" || e.status === "eligible" || e.status === "needs_second_season");

// ── The block ───────────────────────────────────────────────────────────────

/** "Set on November 16 from the published box scores." The day of the
 *  freeze, from the file; the year is the season's and the sheet has it. */
export const sourceLine = (frozenAt: string): string =>
  `Set on ${monLong(frozenAt)} ${dayOfMonth(frozenAt)} from the published box scores.`;

/** The TIER block, and the holder's line that rides at the top of the sheet. */
export interface SheetTier {
  /** The top line and the squad row's words; null for a non-holder. */
  holder: string | null;
  status: StatusLabel;
  meaning: string;
  /** Null for incomplete records: minutes that cannot be counted fairly are not printed as a basis. */
  basis: string | null;
  /** Why the basis is not the sheet's own MINUTES line, where it is not. */
  basisNote: string | null;
  figures: TierFigures | null;
  source: string;
}

/** The block for one entry of the file, at the programme it belongs to. */
export function tierBlock(
  e: TierEntry,
  tiers: TiersFile,
  slug: string,
  programme: string,
  line: SeasonLine | null = null,
): SheetTier {
  const figures = showsFigures(e) ? teamFigures(tiers, slug) : null;
  return {
    holder: holderLine(e),
    status: statusLabel(e),
    meaning: meaningLine(e, programme),
    basis: e.status === "incomplete" ? null : basisLine(e.basis),
    basisNote: basisNote(e, line),
    figures: figures ? tierFigures(figures, programme, tiers.season) : null,
    source: sourceLine(tiers.frozen_at),
  };
}

/** What the sheet knows about the player: the roster's line. */
export interface TierPlayer {
  name: string;
  number?: string | undefined;
  source_url?: string | undefined;
}

/**
 * The sheet's block, or null when the file has no entry for this player (a
 * roster-only player): no block at all, never an empty one.
 *
 * Matched by tierFor on the page id, the collector's fold of the printed name
 * (tiers.ts foldName, applied inside tierFor) and the shirt number.
 */
export function sheetTier(
  tiers: TiersFile,
  slug: string,
  programme: string,
  player: TierPlayer,
  line: SeasonLine | null = null,
): SheetTier | null {
  const e = tierFor(tiers, slug, {
    playerId: playerIdOf(player),
    name: player.name,
    number: player.number ?? null,
  });
  return e ? tierBlock(e, tiers, slug, programme, line) : null;
}

// ── CAREER ──────────────────────────────────────────────────────────────────

export interface CareerTier {
  season: number;
  label: StatusLabel;
}

/**
 * Earlier seasons' tiers at this programme, oldest first, from each earlier
 * season's own file. Seasons without a tier say nothing, and this season is
 * the TIER block's, not repeated here.
 *
 * Matched on the folded name and the shirt number, not the page id: the
 * source re-mints ids between seasons (player.ts playerIdOf), and the career
 * table above links its seasons by name for the same reason.
 */
export function earlierTiers(
  tiers: TiersFile,
  slug: string,
  player: TierPlayer,
  load: (season: number) => TiersFile | null = (y) => loadTiers(tiers.level, y, tiers.gender),
): CareerTier[] {
  const out: CareerTier[] = [];
  for (let y = tiers.season - EARLIER_SEASONS; y < tiers.season; y++) {
    const file = load(y);
    if (!file) continue;
    const e = tierFor(file, slug, {
      playerId: null,
      name: player.name,
      number: player.number ?? null,
    });
    if (e?.status === "tier") out.push({ season: y, label: statusLabel(e) });
  }
  return out;
}

/** "Earlier seasons: Tier 2 · Shooting and scoring in 2024; Team defence
 *  tier in 2025." Null when no earlier season holds a tier. */
export function careerTiersLine(items: readonly CareerTier[]): string | null {
  if (items.length === 0) return null;
  return `Earlier seasons: ${items.map((t) => `${labelText(t.label)} in ${t.season}`).join("; ")}.`;
}
