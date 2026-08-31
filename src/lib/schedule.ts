// The season as a schedule: the spine, the week, and the Matches page.
//
// One idea holds the three surfaces together — a match carries its kickoff
// until a score replaces it, so the schedule and the record are one object and
// never two lists that can disagree.
//
// What counts as a match here, and why:
//   • Exhibitions stay outside the record everywhere else on this site, so they
//     stay outside it here. They are named in a note, not silently dropped.
//   • NCAA placeholder rows name a ROUND, not an opponent — "ncaa-1st-and-2nd-
//     round" is not a programme anyone plays. Drawing one as a match would put
//     a fixture on the page that nobody has been drawn into yet. They stay off,
//     and are counted in a named note until they name both sides.
//
// Every figure a surface prints comes from here, recomputed from the fixture
// list, so a rendered count and a recomputed one cannot drift apart.

import {
  byKickoff,
  type Fixture,
  hasScore,
  isCountable,
  isExhibition,
  type Season,
} from "./derive.ts";
import { dayNumber, dowIndex, toISO } from "./format.ts";

/**
 * A row whose home or away slug names an NCAA round rather than a programme.
 * The collect publishes these as placeholders before the bracket is drawn.
 */
export const isPlaceholder = (f: Fixture): boolean =>
  /^ncaa-/.test(f.home) || /^ncaa-/.test(f.away);

/** Every match the schedule surfaces show, in kickoff order. */
export function matchesOf(s: Season): Fixture[] {
  return s.fixtures.fixtures
    .filter((f) => isCountable(f) && !isPlaceholder(f))
    .slice()
    .sort(byKickoff);
}

export const placeholdersOf = (s: Season): Fixture[] =>
  s.fixtures.fixtures.filter(isPlaceholder).slice().sort(byKickoff);

/** A final the programme marked played and never put a score to. */
export const isSilentFinal = (f: Fixture): boolean => f.status === "final" && !hasScore(f);

// ── Day groups ─────────────────────────────────────────────────────────────

export interface DayGroup {
  date: string;
  matches: Fixture[];
}

export function byDay(matches: readonly Fixture[]): DayGroup[] {
  const groups = new Map<string, Fixture[]>();
  for (const f of matches) {
    const day = groups.get(f.date);
    if (day) day.push(f);
    else groups.set(f.date, [f]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, day]) => ({ date, matches: day.slice().sort(byKickoff) }));
}

// ── The week ───────────────────────────────────────────────────────────────

export interface Week {
  start: string;
  end: string;
  /** Every day Monday–Sunday, including the ones with nothing on them. */
  days: DayGroup[];
  matches: Fixture[];
  /** Days that actually carry a match. */
  playingDays: number;
  leagueMatches: number;
}

/** The Monday–Sunday week containing `date`. */
export function weekWindow(date: string): { start: string; end: string } {
  // dowIndex is 0=Sunday; a week that starts on Monday puts Sunday last.
  const back = (dowIndex(date) + 6) % 7;
  const start = dayNumber(date) - back;
  return { start: toISO(start), end: toISO(start + 6) };
}

export function weekOf(s: Season, date: string = s.asOf): Week {
  const { start, end } = weekWindow(date);
  const inWeek = matchesOf(s).filter((f) => f.date >= start && f.date <= end);
  const grouped = new Map(byDay(inWeek).map((g) => [g.date, g.matches]));
  const days: DayGroup[] = [];
  for (let n = dayNumber(start); n <= dayNumber(end); n++) {
    const iso = toISO(n);
    days.push({ date: iso, matches: grouped.get(iso) ?? [] });
  }
  return {
    start,
    end,
    days,
    matches: inWeek,
    playingDays: days.filter((d) => d.matches.length > 0).length,
    leagueMatches: inWeek.filter((f) => f.conference_game).length,
  };
}

/**
 * What the collapsed week says about itself.
 *
 * The rule: this line is the only thing a reader sees before expanding, so it
 * is recomputed from the very days the docket renders — never from a separate
 * query that could drift from them. A week with nothing in it says so here,
 * because absence must not hide behind a closed expander.
 */
export function weekSummary(w: Week): string {
  const n = w.days.reduce((total, d) => total + d.matches.length, 0);
  if (n === 0) return "No matches.";
  const days = w.days.filter((d) => d.matches.length > 0).length;
  return `${n} ${n === 1 ? "match" : "matches"} across ${days} ${days === 1 ? "day" : "days"}`;
}

// ── The spine ──────────────────────────────────────────────────────────────

export type SpineTone = "gone" | "come" | "league";

export interface SpineMark {
  date: string;
  count: number;
  tone: SpineTone;
  /** A final on this date carries no published score. */
  silence: boolean;
  /** 0–1 across the season window; the surface turns this into a position. */
  at: number;
}

export interface Spine {
  marks: SpineMark[];
  first: string;
  last: string;
  /** 0–1, or null when the collect date sits outside the season window. */
  todayAt: number | null;
  today: string;
  /** The first date a league match is played, and where it falls. */
  leagueOpensOn: string | null;
  leagueOpensAt: number | null;
  /** Month boundaries to label, as 0–1 positions. */
  months: { label: string; at: number }[];
}

const MONTHS = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];

export function spineOf(s: Season): Spine | null {
  const groups = byDay(matchesOf(s));
  if (groups.length === 0) return null;
  const first = groups[0]?.date as string;
  const last = groups[groups.length - 1]?.date as string;
  const from = dayNumber(first);
  const span = Math.max(1, dayNumber(last) - from);
  const at = (iso: string): number => (dayNumber(iso) - from) / span;

  const marks = groups.map((g) => ({
    date: g.date,
    count: g.matches.length,
    // A league date wears the league colour whether or not it has been played;
    // ink and light say only whether the date is gone by.
    tone: (g.matches.some((f) => f.conference_game)
      ? "league"
      : g.date < s.asOf
        ? "gone"
        : "come") as SpineTone,
    silence: g.matches.some(isSilentFinal),
    at: at(g.date),
  }));

  const league = groups.find((g) => g.matches.some((f) => f.conference_game));
  const months: { label: string; at: number }[] = [];
  for (const g of groups) {
    const label = MONTHS[Number(g.date.slice(5, 7)) - 1] as string;
    if (months.length === 0 || months[months.length - 1]?.label !== label) {
      months.push({ label, at: at(g.date) });
    }
  }

  return {
    marks,
    first,
    last,
    today: s.asOf,
    todayAt: s.asOf >= first && s.asOf <= last ? at(s.asOf) : null,
    leagueOpensOn: league?.date ?? null,
    leagueOpensAt: league ? at(league.date) : null,
    months,
  };
}

// ── The counts every surface prints ────────────────────────────────────────

export interface ScheduleCounts {
  matches: number;
  dates: number;
  /** Dates that have passed, whether or not their matches were played. */
  datesGoneBy: number;
  finals: number;
  scored: number;
  silent: number;
  /** Dates gone by that the sites still list as scheduled. */
  stillScheduled: number;
  league: number;
  leagueOpensOn: string | null;
  exhibitions: number;
  placeholders: number;
  placeholderDates: string[];
  first: string | null;
  last: string | null;
}

export function scheduleCounts(s: Season): ScheduleCounts {
  const matches = matchesOf(s);
  const dates = [...new Set(matches.map((f) => f.date))].sort();
  const gone = matches.filter((f) => f.date < s.asOf);
  const finals = gone.filter((f) => f.status === "final");
  const league = matches.filter((f) => f.conference_game);
  const placeholders = placeholdersOf(s);
  return {
    matches: matches.length,
    dates: dates.length,
    datesGoneBy: dates.filter((d) => d < s.asOf).length,
    finals: finals.length,
    scored: finals.filter(hasScore).length,
    silent: finals.filter((f) => !hasScore(f)).length,
    stillScheduled: gone.filter((f) => f.status === "scheduled").length,
    league: league.length,
    leagueOpensOn: league.length > 0 ? (league.map((f) => f.date).sort()[0] as string) : null,
    exhibitions: s.fixtures.fixtures.filter(isExhibition).length,
    placeholders: placeholders.length,
    placeholderDates: [...new Set(placeholders.map((f) => f.date))].sort(),
    first: dates[0] ?? null,
    last: dates[dates.length - 1] ?? null,
  };
}

/** "15:30" → "3:30 pm", the form the schedule surfaces print. */
export function kickoff(hhmm: string | undefined): string | null {
  if (!hhmm) return null;
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h24 = Number(m[1]);
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${m[2]} ${h24 < 12 ? "am" : "pm"}`;
}

/** Which side, if either, the reader's eye should rest on. */
export function weightOf(f: Fixture, side: "home" | "away"): "strong" | "quiet" | "even" {
  if (!hasScore(f)) return "even";
  if (f.home_score === f.away_score) return "even";
  const winner = (f.home_score as number) > (f.away_score as number) ? "home" : "away";
  return side === winner ? "strong" : "quiet";
}
