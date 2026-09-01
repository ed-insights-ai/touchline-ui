// The cross-conference home page's figures, every one derived from the
// collected files through the same functions the season pages read. There is
// no cross-conference competition, so nothing here invents a combined
// standing: the page is N conferences side by side, a shared ledger of last
// night's published finals, and sums whose every addend equals what the
// linked season page shows. That reconciliation used to be printed at the
// foot of the page as a list of addends; it is enforced in home.test.ts now
// and displayed nowhere, because it was the accounting, not the news.
//
// The lede is assembled deterministically from counts and opener dates. It is
// never a model call: the home page does not wait on a journal regeneration.

import { site } from "../site.config.ts";
import {
  byKickoff,
  conferenceOpensOn,
  exhibitionsOf,
  isCountable,
  isScored,
  loadSeason,
  memberSlugs,
  type Season,
  type SeasonCounts,
  seasonCounts,
  tableIsLive,
} from "./derive.ts";
import { dayNumber, shortDate, spell, toISO } from "./format.ts";
import type { Fixture } from "./model.ts";

/** Every configured conference the data home has actually collected, in
 *  config order. One that failed to collect contributes nothing rather than
 *  a broken column — the same manners as the site header's tabs. */
export function homeSeasons(): Season[] {
  const out: Season[] = [];
  for (const key of site.conferences) {
    try {
      out.push(loadSeason(key));
    } catch {
      // A conference the data home has not collected simply does not appear.
    }
  }
  if (out.length === 0) {
    throw new Error("Touchline: no configured conference could be loaded from the data home.");
  }
  return out;
}

/** The national "today": the most recent collect date across the conferences.
 *  They collect at different times, so the page stands on the freshest one and
 *  the footer names each conference's own stamp. */
export function nationalAsOf(seasons: readonly Season[]): string {
  const dates = seasons.map((s) => s.asOf).sort();
  const last = dates[dates.length - 1];
  if (!last) throw new Error("Touchline: nationalAsOf needs at least one season.");
  return last;
}

/** The next league kickoff: the first fixture that counts in the conference
 *  table, on or after the conference's own collect date. Before the season
 *  opens this is the opener; mid-season it is the next conference game; after
 *  the last one it is null, and the column sorts last. */
export function nextLeagueKickoff(s: Season): string | null {
  const members = memberSlugs(s);
  const dates = s.fixtures.fixtures
    .filter(
      (f) =>
        isCountable(f) &&
        f.conference_game !== false &&
        members.has(f.home) &&
        members.has(f.away) &&
        f.status !== "cancelled" &&
        f.date >= s.asOf,
    )
    .map((f) => f.date)
    .sort();
  return dates[0] ?? null;
}

export interface HomeColumn {
  key: string;
  /** The published abbreviation ("GAC") — what the ledger and the column wear. */
  code: string;
  /** The configured full name a first-time reader is owed. */
  name: string;
  season: Season;
  /** The same counts the season page's masthead prints, from the same function. */
  counts: SeasonCounts;
  /** Friendlies, outside the record everywhere — counted beside, never in.
   *  No surface prints it. It stays because `counts.total + exhibitions` is
   *  every fixture in the file, and
   *  home.test.ts holds the data to that. A fixture in neither bucket is a
   *  collector bug nothing else would catch. */
  exhibitions: number;
  /** The first fixture that counts in the table — what the season page names. */
  opensOn: string | null;
  /** The ordering key: the next league kickoff on or after the collect. */
  kickoff: string | null;
  live: boolean;
}

/** One column per collected conference, ordered by next league kickoff, most
 *  imminent first. A conference with no kickoff left sorts last; ties keep
 *  config order. Never hardcoded: the list is site.conferences' own. */
export function homeColumns(seasons: readonly Season[]): HomeColumn[] {
  const order = new Map(site.conferences.map((k, i) => [k, i]));
  return seasons
    .map((season) => ({
      key: season.key,
      code: season.fixtures.conference,
      name: site.conferenceNames[season.key] ?? season.fixtures.conference,
      season,
      counts: seasonCounts(season),
      exhibitions: exhibitionsOf(season).length,
      opensOn: conferenceOpensOn(season),
      kickoff: nextLeagueKickoff(season),
      live: tableIsLive(season),
    }))
    .sort(
      (a, b) =>
        (a.kickoff ?? "9999-99-99").localeCompare(b.kickoff ?? "9999-99-99") ||
        (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0),
    );
}

/** Exactly one opener wears purple: the soonest league kickoff still ahead.
 *  A tie on the date falls back to config order, so the answer is one key. */
export function mostImminentKey(columns: readonly HomeColumn[]): string | null {
  return columns.find((c) => c.kickoff !== null)?.key ?? null;
}

/** Last night, literally: the calendar day before the national asOf. */
export const lastNightOf = (asOf: string): string => toISO(dayNumber(asOf) - 1);

export interface LedgerRow {
  key: string;
  code: string;
  season: Season;
  fixture: Fixture;
}

/** The ledger holds only finals WITH published scores. A silent final never
 *  enters it — silences are counted beside, in the sub-line and the lede —
 *  and a friendly is outside the record here as everywhere. */
export function lastNightLedger(seasons: readonly Season[], date: string): LedgerRow[] {
  const rows: LedgerRow[] = [];
  for (const s of seasons) {
    for (const f of s.fixtures.fixtures) {
      if (f.date !== date || !isScored(f)) continue;
      rows.push({ key: s.key, code: s.fixtures.conference, season: s, fixture: f });
    }
  }
  return rows.sort((a, b) => byKickoff(a.fixture, b.fixture) || a.code.localeCompare(b.code));
}

/** What the night left open: countable fixtures on the date that produced no
 *  published score and were not called off. A postponed or cancelled match is
 *  answered, not open. */
export function lastNightOpen(seasons: readonly Season[], date: string): Fixture[] {
  const out: Fixture[] = [];
  for (const s of seasons) {
    for (const f of s.fixtures.fixtures) {
      if (f.date !== date || !isCountable(f) || isScored(f)) continue;
      if (f.status === "cancelled" || f.status === "postponed") continue;
      out.push(f);
    }
  }
  return out.sort(byKickoff);
}

export interface NationalCounts extends SeasonCounts {
  exhibitions: number;
}

/** The division's sums. Each addend is a column's own count, which is the
 *  season page's own count, so the lede and the linked pages cannot disagree
 *  — and home.test.ts recounts both from the fixtures to keep it that way. */
export function nationalCounts(columns: readonly HomeColumn[]): NationalCounts {
  const nat: NationalCounts = { played: 0, silentFinals: 0, gaps: 0, total: 0, exhibitions: 0 };
  for (const c of columns) {
    nat.played += c.counts.played;
    nat.silentFinals += c.counts.silentFinals;
    nat.gaps += c.counts.gaps;
    nat.total += c.counts.total;
    nat.exhibitions += c.exhibitions;
  }
  return nat;
}

const sentenceCase = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** The national lede: derived prose, assembled deterministically from counts
 *  and opener dates, in the data-only voice — a count, a date, a state, and
 *  no metaphor ever. Every numeral in it is recomputable from the fixtures. */
export function nationalLede(
  columns: readonly HomeColumn[],
  national: NationalCounts = nationalCounts(columns),
): string {
  const sentences: string[] = [];
  sentences.push(
    `${national.played} of ${national.total} matches played across ${spell(columns.length)} ${
      columns.length === 1 ? "conference" : "conferences"
    }.`,
  );
  const upcoming = columns.filter((c) => !c.live && c.opensOn !== null);
  const first = upcoming[0];
  if (first?.opensOn) {
    sentences.push(
      `Conference play arrives first in the ${first.name} on ${shortDate(first.opensOn)}.`,
    );
    const rest = upcoming.slice(1);
    const head = rest[0];
    if (head?.opensOn) {
      let follows = `The ${head.name} follows on ${shortDate(head.opensOn)}`;
      for (const c of rest.slice(1)) {
        if (c.opensOn) follows += `, the ${c.name} on ${shortDate(c.opensOn)}`;
      }
      sentences.push(`${follows}.`);
    }
  }
  // Unconditional. A division with nothing silent has been checked and found
  // clean, which is a fact about the collect; leaving the sentence out would
  // make the reader infer the zero from a silence of our own.
  sentences.push(
    national.silentFinals === 0
      ? "No final stands without a published score."
      : `${sentenceCase(spell(national.silentFinals))} ${
          national.silentFinals === 1 ? "final stands" : "finals stand"
        } without a published score.`,
  );
  return sentences.join(" ");
}
