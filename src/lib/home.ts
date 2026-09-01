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
import { dayNumber, dowShort, plural, shortDate, spell, toISO } from "./format.ts";
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
   *  page's kicker, one altitude up, and the only place the division is named
   *  above the footer. It replaced a second small-caps row that said the
   *  division a second time. */
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
   *  unconditional: a clean collect reads 0 SILENT FINALS, because a reader
   *  must never have to infer a zero from a sentence we chose not to write.
   *  That doctrine used to live in the prose; it lives here now. */
  strip: string[];
}

export function nationalLede(
  columns: readonly HomeColumn[],
  asOf: string,
  national: NationalCounts = nationalCounts(columns),
): NationalLede {
  return {
    kicker: `${site.division} · ${dowShort(asOf)} ${shortDate(asOf)}`.toUpperCase(),
    headline: null,
    dek: openersSentence(columns),
    strip: [
      `${national.played} OF ${national.total} PLAYED`,
      `${national.silentFinals} SILENT ${plural(national.silentFinals, "FINAL", "FINALS")}`,
    ],
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
  national: NationalCounts = nationalCounts(columns),
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
