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
import {
  type DivisionCounts,
  type DivisionMatch,
  foldToMatches,
  type Sighting,
} from "./division.ts";
import { dayNumber, dayOfMonth, dowShort, monShort, shortDate, spell, toISO } from "./format.ts";
import { headlineForm, type NationalJournalFile } from "./journal.ts";
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

/** Every conference's record of the matches on a date that pass a test. The
 *  same match reaches this list twice when two conferences each collected it,
 *  which is why nothing that spans conferences may count the list itself. */
function sightingsOn(
  seasons: readonly Season[],
  date: string,
  admit: (f: Fixture) => boolean,
): Sighting[] {
  const out: Sighting[] = [];
  for (const s of seasons) {
    for (const f of s.fixtures.fixtures) {
      if (f.date !== date || !admit(f)) continue;
      out.push({ key: s.key, code: s.fixtures.conference, season: s, fixture: f });
    }
  }
  return out;
}

/** The ledger holds only finals WITH published scores. A silent final never
 *  enters it — silences are counted beside, in the sub-line and the strip —
 *  and a friendly is outside the record here as everywhere.
 *
 *  One row per MATCH, not per record. A non-conference match between two of
 *  these conferences is in both files, and the ledger printed it twice, under
 *  two codes, linking to two different pages (tui-y0q). It now wears both
 *  codes, because both are true, and resolves to the home side's conference. */
export function lastNightLedger(seasons: readonly Season[], date: string): DivisionMatch[] {
  return foldToMatches(sightingsOn(seasons, date, isScored)).sort(
    (a, b) => byKickoff(a.fixture, b.fixture) || a.codes.join(" ").localeCompare(b.codes.join(" ")),
  );
}

/** What the night left open: countable fixtures on the date that produced no
 *  published score and were not called off. A postponed or cancelled match is
 *  answered, not open. Folded like the ledger: the sub-line counts these, and
 *  a count of records would say two matches where one was played. */
export function lastNightOpen(seasons: readonly Season[], date: string): DivisionMatch[] {
  return foldToMatches(
    sightingsOn(
      seasons,
      date,
      (f) => isCountable(f) && !isScored(f) && f.status !== "cancelled" && f.status !== "postponed",
    ),
  ).sort((a, b) => byKickoff(a.fixture, b.fixture));
}

// The division's figures are NOT the sum of the columns. They used to be, and
// the sum counted a match between two of these conferences twice — see
// divisionCounts() in division.ts, which is where they come from now. Each
// column's own count is still exactly its season page's, and still right; it
// is only adding them up that stops being a count of matches.

const sentenceCase = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** The masthead's four altitudes, each answering to a different surface.
 *
 *  It used to be one paragraph at one altitude, and by the surface-
 *  responsibility doctrine almost all of it was restatement: the opener dates
 *  and the played counts it narrated are printed on the cards directly below
 *  it, and every score it stood over is in the ledger. Split into altitudes,
 *  each part can be held to its own contract — and the parts a surface below
 *  already carries can simply not be written.
 *
 *  Nothing here is a model call. The home page does not wait on a journal
 *  regeneration, and every figure in it is recomputable from the fixtures. */
export interface NationalLede {
  /** Scope and the national collect date — the same grammar as a season
   *  page's kicker, one altitude up, and now the only place this page names
   *  the division at all: it replaced a second small-caps row that said it
   *  twice, and the footer has since stopped saying it anywhere. */
  kicker: string;
  /** The division's lead story. Null here, always: the floor writes no
   *  headline rather than manufacture one out of figures the cards print.
   *  The field exists for the layer that will write it. */
  headline: string | null;
  /** One or two sentences at dek altitude. With no headline above it this is
   *  the openers in sequence — which the cards do each show, one at a time,
   *  and which only this line puts in order across the division. */
  dek: string | null;
  /** The hairline data row, in the order it is read. Every cell is
   *  unconditional — never rendered on one collect and dropped on the next.
   *  The silent-final count is not a cell by the owner's ruling: what the
   *  division is missing is not this page's lead information. The accounting
   *  survives where it is content — each season page, and the description
   *  this page publishes to surfaces that get no cards at all. */
  strip: string[];
  /** When the headline last changed — "UPDATED SEP 1". A standing line is
   *  displaced by something more newsworthy or by no longer being true, never
   *  by the cadence coming round again, so a reader meeting a sentence that
   *  did not move today is owed the day it last did. Null with no headline:
   *  nothing knows when the floor last changed, and the floor is not news. */
  stamp: string | null;
}

export function nationalLede(
  columns: readonly HomeColumn[],
  asOf: string,
  national: DivisionCounts,
): NationalLede {
  return {
    kicker: `${site.division} · ${dowShort(asOf)} ${shortDate(asOf)}`.toUpperCase(),
    headline: null,
    dek: openersSentence(columns),
    strip: [`${national.played} OF ${national.total} PLAYED`],
    stamp: null,
  };
}

/**
 * The masthead as the page renders it: the floor, with the division's journal
 * laid over the altitudes it wrote.
 *
 * The kicker and the strip are never the journal's — they are the page's own
 * scope, date and counts, and a model has nothing to add to any of them. Only
 * the headline and the dek are writing, and if there is no journal, or the
 * validator dropped its headline, what stands is exactly what stood before a
 * journal existed. Correctness over freshness: the masthead is never empty and
 * never waits on a model call.
 */
export function nationalMasthead(
  columns: readonly HomeColumn[],
  asOf: string,
  national: DivisionCounts,
  journal: NationalJournalFile | null,
): NationalLede {
  const floor = nationalLede(columns, asOf, national);
  if (!journal) return floor;
  return {
    ...floor,
    headline: headlineForm(journal.headline),
    // The floor's dek is the openers in order, written to stand alone under no
    // headline at all. Left under a story it did not come from it would be two
    // unrelated sentences pretending to be a lede, so a journal that writes a
    // headline and no dek gets no dek.
    dek: journal.dek ?? null,
    // Only when the headline is older than the dateline above it; on the day
    // it changed the kicker already says so.
    stamp:
      journal.updated && journal.updated !== asOf
        ? `UPDATED ${monShort(journal.updated).toUpperCase()} ${dayOfMonth(journal.updated)}`
        : null,
  };
}

/** The conferences still to open, named in the order they open. Null once
 *  they all have: the floor has nothing to say at this altitude then, and
 *  says nothing. */
function openersSentence(columns: readonly HomeColumn[]): string | null {
  const upcoming = columns.filter((c) => !c.live && c.opensOn !== null);
  const first = upcoming[0];
  if (!first?.opensOn) return null;
  const sentences = [
    `Conference play arrives first in the ${first.name} on ${shortDate(first.opensOn)}.`,
  ];
  const rest = upcoming.slice(1);
  const head = rest[0];
  if (head?.opensOn) {
    let follows = `The ${head.name} follows on ${shortDate(head.opensOn)}`;
    for (const c of rest.slice(1)) {
      if (c.opensOn) follows += `, the ${c.name} on ${shortDate(c.opensOn)}`;
    }
    sentences.push(`${follows}.`);
  }
  return sentences.join(" ");
}

/** The same facts as one paragraph of prose, for the page's description meta.
 *
 *  A share card and a search result have no cards and no strip beneath them —
 *  they are the surface, alone — so the sentence that dies on the page has to
 *  live here, and the silences have to be spelled rather than tallied. This is
 *  deliberately the string the lede used to be: the description is a stable
 *  identifier of the page as much as a summary of it. */
export function nationalDescription(
  columns: readonly HomeColumn[],
  national: DivisionCounts,
): string {
  const sentences: string[] = [];
  sentences.push(
    `${national.played} of ${national.total} matches played across ${spell(columns.length)} ${
      columns.length === 1 ? "conference" : "conferences"
    }.`,
  );
  const openers = openersSentence(columns);
  if (openers) sentences.push(openers);
  sentences.push(
    national.silentFinals === 0
      ? "No final stands without a published score."
      : `${sentenceCase(spell(national.silentFinals))} ${
          national.silentFinals === 1 ? "final stands" : "finals stand"
        } without a published score.`,
  );
  return sentences.join(" ");
}
