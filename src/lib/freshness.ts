// When the site last looked, as the footer and the About page print it.
//
// One conference in scope: the footer prints that conference's own stamp,
// exactly as derive.ts collectionLine always has. Several in scope: the line
// used to print the OLDEST stamp, which is true of every figure on the page
// but read as a stale site — "Data collected Nov 10" under a Nov 15 dateline,
// because one conference of nineteen had not collected since. It now prints
// the day the rest were collected and NAMES each conference that lags, so the
// spread is still on the page, attributed to the conference it belongs to,
// and the About page lists every stamp beside the one it lags.
//
// A conference lags when its last look is more than LAG_HOURS before the
// newest. Within that window the conferences are one day's collect, and the
// line prints their date span ("Nov 15", or "Nov 14–15" across midnight UTC),
// which is literally true of each of them.

import { collectionLine, lastLooked, type Season } from "./derive.ts";
import { dayOfMonth, daysBetween, monShort } from "./format.ts";

/** More than this many hours behind the newest look, a conference is named. */
export const LAG_HOURS = 24;

export interface Lagging {
  key: string;
  /** The configured full name, as the About page lists it. */
  name: string;
  /** Its last look, ISO. */
  at: string;
  /** Whole calendar days between its look and the newest (UTC dates). */
  days: number;
}

export interface Freshness {
  /** "Data collected Nov 15, 2026" — or one conference's full stamp. */
  line: string;
  /** Each conference more than LAG_HOURS behind the newest, oldest first. */
  lagging: Lagging[];
  /** The footer's second line naming them, or null when none lags. */
  lagLine: string | null;
}

const ms = (iso: string): number => Date.parse(iso);
const day = (iso: string): string => iso.slice(0, 10);
const md = (iso: string): string => `${monShort(day(iso))} ${dayOfMonth(day(iso))}`;

/** The newest last-look across the seasons, or null with none parseable. */
export function newestLook(seasons: readonly Season[]): string | null {
  const stamps = seasons.map(lastLooked).filter((s) => !Number.isNaN(ms(s)));
  return stamps.length === 0 ? null : stamps.reduce((a, b) => (ms(b) > ms(a) ? b : a));
}

/** The conferences more than LAG_HOURS behind the newest, oldest first. */
export function laggingOf(seasons: readonly Season[], nameOf: (s: Season) => string): Lagging[] {
  const newest = newestLook(seasons);
  if (newest === null) return [];
  return seasons
    .map((s) => ({ s, at: lastLooked(s) }))
    .filter(({ at }) => !Number.isNaN(ms(at)) && ms(newest) - ms(at) > LAG_HOURS * 3_600_000)
    .sort((a, b) => ms(a.at) - ms(b.at))
    .map(({ s, at }) => ({
      key: s.key,
      name: nameOf(s),
      at,
      days: daysBetween(day(at), day(newest)),
    }));
}

/** "Nov 15, 2026", "Nov 14–15, 2026", "Nov 30 – Dec 1, 2026". */
export function spanLabel(fromISO: string, toISO: string): string {
  const a = day(fromISO);
  const b = day(toISO);
  const year = b.slice(0, 4);
  if (a === b) return `${md(a)}, ${year}`;
  if (a.slice(0, 7) === b.slice(0, 7)) return `${md(a)}–${dayOfMonth(b)}, ${year}`;
  return `${md(a)} – ${md(b)}, ${year}`;
}

/** The footer's freshness for the conferences a page speaks for. */
export function freshness(seasons: readonly Season[], nameOf: (s: Season) => string): Freshness {
  // One conference: its own stamp, to the minute, exactly as before.
  if (seasons.length <= 1) return { line: collectionLine(seasons), lagging: [], lagLine: null };
  const newest = newestLook(seasons);
  if (newest === null) return { line: collectionLine(seasons), lagging: [], lagLine: null };
  const lagging = laggingOf(seasons, nameOf);
  const behind = new Set(lagging.map((l) => l.key));
  const current = seasons
    .filter((s) => !behind.has(s.key))
    .map(lastLooked)
    .filter((s) => !Number.isNaN(ms(s)))
    .sort((a, b) => ms(a) - ms(b));
  const line = `Data collected ${spanLabel(current[0] ?? newest, newest)}`;
  // Two names fit a footer line; past that the count, and the About page
  // carries every name beside its stamp.
  const lagLine =
    lagging.length === 0
      ? null
      : lagging.length <= 2
        ? lagging.map((l) => `${l.name} last collected ${md(l.at)}`).join(" · ")
        : `${lagging.length} conferences last collected earlier`;
  return { line, lagging, lagLine };
}
