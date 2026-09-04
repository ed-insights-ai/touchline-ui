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

import { type SiteConfig, site } from "../site.config.ts";
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
import {
  dayNumber,
  dayOfMonth,
  dowShort,
  longDate,
  monShort,
  shortDate,
  spell,
  toISO,
} from "./format.ts";
import { headlineForm, type NationalJournalFile, PHASE_LIVE } from "./journal.ts";
import type { Fixture } from "./model.ts";
import { byRegion, type Region, type RegionConfig } from "./regions.ts";

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
export function mostImminentKey(
  columns: readonly { key: string; kickoff: string | null }[],
): string | null {
  return columns.find((c) => c.kickoff !== null)?.key ?? null;
}

// ── The card and how the cards are laid out ─────────────────────────────────
//
// Up to the configured cap the page is one column per conference, in kickoff
// order. Past it the SAME view flows into region bands beside the map, one
// band per region in site.regions order, one conference per ledger row, and
// exactly one band open at rest (openBandIndex, below). The cap is config
// (site.homeColumnCap) and the regions come through byRegion, so no component
// here decides anything from a conference or a region by name.

/** What a card prints, and nothing a Season is needed for: a synthetic set
 *  (lib/fixtures/density.ts) renders the same component the live page does. */
export interface CardView {
  key: string;
  /** The published abbreviation ("GAC"). */
  code: string;
  /** The configured full name. */
  name: string;
  /** The opens line, already worded: see opensLine(). */
  opens: string;
  /** Whether this card's opens line wears the one purple. */
  imminent: boolean;
  played: number;
  total: number;
  /** The wire, or the headline it falls back to. */
  line: string | null;
  /** "UPDATED SEP 1" when the line is older than the data it sits on. */
  stamp: string | null;
  href: string;
}

/** The little a band needs to know about a column to head itself. */
export interface BandColumn {
  key: string;
  live: boolean;
  opensOn: string | null;
  kickoff: string | null;
}

/** A date as the cards and the band heads print it: "SEP 12". */
export const opensStamp = (iso: string): string =>
  `${monShort(iso).toUpperCase()} ${dayOfMonth(iso)}`;

/** The card's opens line: the phase word while the table is live, the opener
 *  once one is published, the plain absence otherwise. The band heads reuse
 *  the same words (bandMeta), so the two surfaces cannot drift. */
export function opensLine(c: { live: boolean; opensOn: string | null }): string {
  return c.live
    ? PHASE_LIVE
    : c.opensOn
      ? `OPENS ${opensStamp(c.opensOn)}`
      : "NO CONFERENCE DATE PUBLISHED";
}

export type HomeLayout = "columns" | "bands";
export type LayoutConfig = Pick<SiteConfig, "homeColumnCap">;

/** Columns up to the cap, bands past it. The cap is the config's, never a
 *  literal here; the count is the conference list's. */
export function homeLayout(count: number, cfg: LayoutConfig = site): HomeLayout {
  return count <= cfg.homeColumnCap ? "columns" : "bands";
}

export interface HomeBand<T> {
  region: Region;
  /** The band's cards, in the order they were given (kickoff order). */
  columns: T[];
  /** How many of them are under way. */
  live: number;
  /** The earliest published opener among those not yet under way. */
  nextOpens: string | null;
  /** The band whose card wears the one purple; at most one band, none once
   *  the next kickoff belongs to a conference already under way. Purple marks
   *  one thing, and a head with no purple card under it is a false signal
   *  (tl-4an.19). */
  imminent: boolean;
}

/** The columns grouped by region, in site.regions order, input order kept
 *  inside each band (so pass them already in kickoff order); regions with no
 *  column are dropped. Every column must name a listed region. */
export function homeBands<T extends BandColumn>(
  columns: readonly T[],
  cfg: RegionConfig = site,
): HomeBand<T>[] {
  const imminent = mostImminentKey(columns);
  return byRegion(columns, cfg).map(({ region, items }) => ({
    region,
    columns: items,
    live: items.filter((c) => c.live).length,
    nextOpens:
      items
        .filter((c) => !c.live && c.opensOn !== null)
        .map((c) => c.opensOn as string)
        .sort()[0] ?? null,
    // The card's own rule (pages/index.astro): the most imminent key, and not
    // live. A live conference's card wears the phase word, not purple, so its
    // band's head must not either.
    imminent: imminent !== null && items.some((c) => c.key === imminent && !c.live),
  }));
}

// ── Which band is open at rest ──────────────────────────────────────────────
//
// Exactly one band is open, at every width, before any script runs (tl-38t).
// Chosen in order: the region of the conference the division's headline is
// about; else the imminent band; else the first. The headline names its
// programme in the journal's basis, so the region is COMPUTED from a slug —
// slug to the followed conference that lists it, conference to band — and
// never matched out of the sentence.

/** The programme the division's headline is about, as the journal's basis
 *  names it, or null when the journal is absent or its basis names none. The
 *  basis is a free record by schema; only a non-empty string counts. */
export function headlineProgrammeOf(journal: NationalJournalFile | null): string | null {
  const slug = journal?.basis?.programme;
  return typeof slug === "string" && slug.length > 0 ? slug : null;
}

/** The followed conference whose members list the slug, or null for a
 *  programme no followed season lists — the same member index the tables and
 *  the ledger fold by (derive.ts memberSlugs), never a name match. Seasons
 *  are searched in the order given (config order), so a programme two files
 *  list — none does today — resolves to the first. */
export function conferenceOfProgramme(seasons: readonly Season[], slug: string): string | null {
  for (const s of seasons) if (memberSlugs(s).has(slug)) return s.key;
  return null;
}

/** The band open at rest: the headline's region, else the imminent band,
 *  else the first (the top of the page, site.regions order). -1 with no
 *  bands. Pure: `conferenceOf` is the slug-to-conference resolver, and the
 *  bands' own columns carry the conference-to-region step. A headline about
 *  a programme no band holds falls through to the imminent leg. */
export function openBandIndex<T extends { key: string }>(
  bands: readonly { imminent: boolean; columns: readonly T[] }[],
  headlineProgramme: string | null,
  conferenceOf: (slug: string) => string | null,
): number {
  if (bands.length === 0) return -1;
  const key = headlineProgramme === null ? null : conferenceOf(headlineProgramme);
  if (key !== null) {
    const at = bands.findIndex((b) => b.columns.some((c) => c.key === key));
    if (at >= 0) return at;
  }
  const at = bands.findIndex((b) => b.imminent);
  return at < 0 ? 0 : at;
}

/** Each band's open flag, exactly one true when there are bands: what the
 *  markup writes as data-open and aria-expanded, so the no-script read is
 *  the chooser's answer. */
export function bandOpenFlags(count: number, open: number): boolean[] {
  return Array.from({ length: count }, (_, i) => i === open);
}

/** The chip row: one per band, in the order the bands come (site.regions
 *  order, regions with no conference dropped — byRegion's own). The chips
 *  are the map's region labels for thumbs, so they follow the same table
 *  and never a hand-typed list (tl-4an.21). */
export function regionChips(
  bands: readonly HomeBand<unknown>[],
): { key: string; name: string; count: number }[] {
  return bands.map((b) => ({ key: b.region.key, name: b.region.name, count: b.columns.length }));
}

/** The conference a band's lead line speaks for: the one wearing the purple,
 *  else the first under way, else the first in the band. */
function bandLead<T extends CardView & BandColumn>(band: HomeBand<T>): T | null {
  return (
    band.columns.find((c) => c.imminent) ??
    band.columns.find((c) => c.live) ??
    band.columns[0] ??
    null
  );
}

/** What a conference is doing, in one clause: "the GLVC opens Friday,
 *  September 4", "the GAC is in conference play", or the absence. */
function doingClause(c: CardView & BandColumn): string {
  if (c.live) return `the ${c.code} is in conference play`;
  if (c.opensOn) return `the ${c.code} opens ${longDate(c.opensOn)}`;
  return `the ${c.code} has published no conference date`;
}

/** The line under the section head, for the band that is open.
 *
 *  Plain: the region and what its lead conference is doing — "Midwest: the
 *  GLVC opens Friday, September 4." The headline band, while it is the one
 *  pinned, says instead why it is open: "Open for the headline: Southwest
 *  Baptist, of the GLVC. The GLVC opens Friday, September 4." The rows
 *  beneath carry each conference's own line, so this line restates none of
 *  them — a surface says what only it can say (the site's rule). */
export function leadLine<T extends CardView & BandColumn>(
  band: HomeBand<T>,
  headline: { programme: string; code: string } | null,
): string {
  const lead = bandLead(band);
  if (!lead) return `${band.region.name}.`;
  if (headline) {
    const about = band.columns.find((c) => c.code === headline.code) ?? lead;
    return `Open for the headline: ${headline.programme}, of the ${headline.code}. ${sentenceCase(doingClause(about))}.`;
  }
  return `${band.region.name}: ${doingClause(lead)}.`;
}

/** The head's meta, one wording for the band head and the tests:
 *  "2 LIVE · NEXT OPENS SEP 19", "OPENS SEP 5", or the absence. */
export function bandMeta(band: HomeBand<BandColumn>): string {
  if (band.live > 0) {
    return `${band.live} LIVE${band.nextOpens ? ` · NEXT OPENS ${opensStamp(band.nextOpens)}` : ""}`;
  }
  return band.nextOpens ? `OPENS ${opensStamp(band.nextOpens)}` : "NO CONFERENCE DATE PUBLISHED";
}

/** The band head: "3 CONFERENCES · OPENS SEP 12". */
export function bandHead(band: HomeBand<BandColumn>): string {
  const n = band.columns.length;
  return `${n} ${n === 1 ? "CONFERENCE" : "CONFERENCES"} · ${bandMeta(band)}`;
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
      ? "No score gap stands: every final carries a published score."
      : `${sentenceCase(spell(national.silentFinals))} score ${
          national.silentFinals === 1 ? "gap stands, a final" : "gaps stand, finals"
        } without a published score.`,
  );
  return sentences.join(" ");
}
