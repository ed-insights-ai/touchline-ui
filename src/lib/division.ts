// The division: what is true across the conferences, rather than inside one.
//
// A conference's fixture file is that conference's record of its own members'
// matches, so a match between two of the conferences this site follows appears
// in TWO files — once from each member's published schedule. The two records
// agree on everything a reader can see: the date, both slugs, which side is at
// home, the score, the status — or, for a night, one of them has posted the
// score and the other has not yet (foldToMatches says how that lag is read).
// What they do not share is an id, because an id is the collector's own key
// and each collector made its own.
//
// That is why nothing here identifies a match by its id. Any list or figure
// that spans conferences has to fold the sightings back into one match first —
// the national page's ledger printed one match twice, under two codes, linking
// to two different pages, for as long as it did not (tui-y0q).
//
// Nothing INSIDE a conference needs this: no fixture is duplicated within a
// file, and a season page counting its own conference's matches is counting
// the right things.

import { site } from "../site.config.ts";
import {
  boxScoreGaps,
  hasResult,
  hasScore,
  isCountable,
  isExhibition,
  isScored,
  matchIdentity,
  memberSlugs,
  type Season,
  scoresDisagree,
} from "./derive.ts";
import { dayOfMonth, monShort } from "./format.ts";
import { type Fixture, isForfeit, isPlayed } from "./model.ts";

/** The identity lives in derive.ts now, beside the disputed-score rule that
 *  the per-season figures read; it is re-exported here because this is where
 *  every caller learned it, and because the day it stops being true this
 *  fold silently starts counting one match as two again. */
export { matchIdentity };

/** One record's score of a disputed match, with the source it came from:
 *  the conference file that holds it and the host that published it. */
export interface DisputedScore {
  key: string;
  code: string;
  /** The publishing host ("uiupeacocks.com"), or the code when the record
   *  carries no source URL. */
  source: string;
  home_score: number;
  away_score: number;
}

/** One conference's record of a match. */
export interface Sighting {
  key: string;
  /** The published abbreviation — what the ledger wears. */
  code: string;
  season: Season;
  fixture: Fixture;
}

/**
 * One real-world match, and every conference that collected it.
 *
 * The canonical record — key, season, fixture — is the HOME side's conference,
 * not the first one seen. Both answers are one row; only one of them is the
 * same row tomorrow. "First seen" is the order the seasons arrived in, which
 * is the home page's column order, which sorts by next kickoff and moves as
 * the season advances: the link under a result would change conference
 * mid-season for no reason a reader could see.
 */
export interface DivisionMatch {
  /** The identity every sighting of this match shares. */
  identity: string;
  /** The codes that collected it, in CONFIG order. One for a match inside a
   *  conference; two for a match between them, and both are true.
   *
   *  Config order, never the caller's: the national page hands its seasons
   *  over in config order today, but its columns sort by next kickoff, and a
   *  fold that inherited the caller's order would quietly reorder "LSC · GSC"
   *  to "GSC · LSC" as the season advanced. Identity is keyed to the stable
   *  list, the same rule the footprint band's hues are held to. */
  codes: string[];
  key: string;
  season: Season;
  fixture: Fixture;
  /** Every record of it, the canonical one included. */
  sightings: Sighting[];
  /** The records disagree on which side was at home and agree on everything
   *  else: a neutral-site match, each site having written itself as the home
   *  side (the 2026 Rogers State tournament in Claremore, Okla. is the case
   *  this was measured on). It is one match, counted once and for both
   *  records; it carries no home side, and a surface must not print one. */
  neutral: boolean;
  /** The score rests on ONE record: one file holds a scored final and the
   *  other still holds the row as not yet played (scheduled or postponed).
   *  A lag, not a disagreement — one programme's page posts the result the
   *  same night and the opponent's page catches up a day later (2026-09-03
   *  Cedarville v McKendree: G-MAC's file had Cedarville's final eighteen
   *  hours before GLVC's file had McKendree's). The folded match wears the
   *  final and its score, and says so wherever a surface names its silences:
   *  the reader is owed the fact that only one source has spoken. */
  oneSided: boolean;
  /** The records DISAGREE on the final score: two sources, two facts, and
   *  the fold refuses to choose between them silently, but it no longer
   *  refuses to build. The folded match wears the home programme's record
   *  and score, marked disputed wherever a score is printed; both scores
   *  stand in `scores` with their sources; and no record, tally or table
   *  counts it until the sources agree (derive.ts isCounted). A final
   *  against a cancelled twin is not a dispute and still fails the fold. */
  disputed: boolean;
  /** Each posted score with its source, in config order. Empty unless
   *  disputed. */
  scores: DisputedScore[];
}

/** The status as the fold compares it. Cancelled, postponed and scheduled
 *  are one unplayed shape: two collectors reading one unplayed match may call
 *  it by different words (ECC's file said postponed and NE10's said cancelled
 *  of the same 2026-08-27 Staten Island v Assumption row; CACC said postponed
 *  and ECC still said scheduled of 2026-09-02 Caldwell v Molloy), and that is
 *  a difference of flavour, not of fact: no result either way. Which word the
 *  folded match wears is the home conference's, decided where the canonical
 *  record is chosen. Final and live stay their own shapes. */
const UNPLAYED: ReadonlySet<Fixture["status"]> = new Set(["scheduled", "postponed", "cancelled"]);
const shapeStatus = (f: Fixture): string => (UNPLAYED.has(f.status) ? "unplayed" : f.status);

/** The two unplayed words that mean NOT YET: a page that still says scheduled
 *  or postponed has said nothing about the result. Cancelled is not among
 *  them — it is a positive claim that no match happened, and against a scored
 *  final that is a real disagreement, not a lag. */
const PENDING: ReadonlySet<Fixture["status"]> = new Set(["scheduled", "postponed"]);
const isPending = (f: Fixture): boolean => PENDING.has(f.status) && !hasScore(f);

/** The facts two records of one match must agree on once the home side is
 *  set aside: the unordered score and whether the match was played. Order-free
 *  so that two sites each calling itself the home side still compare equal. */
const sideFreeShape = (f: Fixture): string => {
  const scored = [
    [f.home, f.home_score ?? "-"],
    [f.away, f.away_score ?? "-"],
  ].sort(([a], [b]) => String(a).localeCompare(String(b)));
  return `${scored.map(([slug, score]) => `${slug}=${score}`).join("|")}|${shapeStatus(f)}`;
};

/** Fold sightings into matches, keeping the order of first appearance. */
export function foldToMatches(sightings: readonly Sighting[]): DivisionMatch[] {
  const groups = new Map<string, Sighting[]>();
  for (const sighting of sightings) {
    const identity = matchIdentity(sighting.fixture);
    const seen = groups.get(identity);
    if (seen) seen.push(sighting);
    else groups.set(identity, [sighting]);
  }
  const order = new Map(site.conferences.map((k, i) => [k, i]));
  const rank = (s: Sighting): number => order.get(s.key) ?? site.conferences.length;
  const out: DivisionMatch[] = [];
  for (const [identity, group] of groups) {
    group.sort((a, b) => rank(a) - rank(b));
    // The home side belongs to exactly one of the conferences that collected
    // this match — that is what makes the choice deterministic. The fallback
    // is for the shape the data has never taken: a match whose home side plays
    // in a conference this site does not follow, which can only reach one file
    // and so can only be one sighting anyway.
    const first = group[0];
    if (!first) continue;
    // Two records may disagree on the home side (a neutral site, each site
    // writing itself as home) and still be one match. They may not disagree
    // on the score: that is two collectors publishing different facts, and
    // the fold refuses to choose between them silently. The flavour of
    // unplayed (scheduled, postponed, cancelled) is not a fact they must
    // share; the folded match wears the home conference's word, because the
    // canonical record below is the home conference's own.
    //
    // Played versus NOT YET is a lag rather than a fact in dispute. The
    // split, every time it has been measured (Harding v Dallas Baptist and
    // Cedarville v McKendree on 2026-09-03, Findlay v Indianapolis on 09-02),
    // is one programme's page posting the score the same night while the
    // opponent's page stays scheduled for eighteen hours or more. A scored
    // final therefore beats a scheduled or postponed twin: the folded match
    // takes the final and its score, and is marked one-sided so a surface can
    // say which page has not spoken. Cancelled is not "not yet" — it is a
    // claim that no match happened — so a final against cancelled still
    // throws. (A scoreless final does not reach this fold: the collector
    // stores it as scheduled since rib #85.)
    //
    // Two scored finals printing DIFFERENT scores are a dispute (owner's
    // ruling, tl-wyv): the fold keeps the row, marks it, keeps both scores
    // with their sources, and lets the build stand. Every record must still
    // be a final or a not-yet: a cancelled twin beside any final is the one
    // disagreement that is not about the score, and it still throws.
    const shapes = new Set(group.map((s) => sideFreeShape(s.fixture)));
    const posted = group.filter((s) => hasResult(s.fixture));
    const spoken = group.every((s) => hasResult(s.fixture) || isPending(s.fixture));
    const disputed = scoresDisagree(group.map((s) => s.fixture)) && spoken;
    const oneSided =
      shapes.size > 1 &&
      posted.length > 0 &&
      new Set(posted.map((s) => sideFreeShape(s.fixture))).size === 1 &&
      spoken;
    if (shapes.size > 1 && !oneSided && !disputed) {
      throw new Error(
        `Touchline: the records of ${identity} disagree on the score or status: ${group
          .map((s) => `${s.key} ${sideFreeShape(s.fixture)} (${s.fixture.status})`)
          .join("  vs  ")}`,
      );
    }
    const neutral = new Set(group.map((s) => s.fixture.home)).size > 1;
    // Only a record that holds the score may be canonical: the key and the
    // fixture travel together (the link under a result is the key's own
    // match page), so a one-sided or disputed match resolves to a record
    // that posted. Where one record marks a forfeit and another prints the
    // bare score, the forfeit is the fuller fact and the fold takes it.
    const scored = oneSided || disputed ? posted : group;
    const awarded = scored.filter((s) => isForfeit(s.fixture));
    const eligible = awarded.length > 0 ? awarded : scored;
    const lead = eligible[0] ?? first;
    // With a home side, the canonical record is the home side's own
    // conference, which exactly one of the sightings is. Without one, the
    // first in config order: deterministic, and keyed to the stable list.
    const canonical = neutral
      ? lead
      : (eligible.find((s) => memberSlugs(s.season).has(s.fixture.home)) ?? lead);
    out.push({
      identity,
      codes: group.map((s) => s.code),
      key: canonical.key,
      season: canonical.season,
      fixture: canonical.fixture,
      sightings: group,
      neutral,
      oneSided,
      disputed,
      scores: disputed
        ? posted.map((s) => ({
            key: s.key,
            code: s.code,
            source: hostOf(s.fixture.source_url) ?? s.code,
            home_score: s.fixture.home_score as number,
            away_score: s.fixture.away_score as number,
          }))
        : [],
    });
  }
  return out;
}

/** "uiupeacocks.com" from a record's source URL, or null when it has none. */
function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** Every match the division holds two scores for, in fold order. */
export function disputedFinals(seasons: readonly Season[]): DivisionMatch[] {
  return foldToMatches(allSightings(seasons)).filter((m) => m.disputed);
}

/** The programme whose page has NOT posted the score of a one-sided match:
 *  the member side of each record that still reads as not yet played, named
 *  by its own conference's file. Empty for a match that is not one-sided.
 *  Named by slug and by the name the site prints, so a surface composes its
 *  note from the same name every other line uses. */
export function unpostedSides(m: DivisionMatch): { slug: string; name: string; key: string }[] {
  if (!m.oneSided) return [];
  const out: { slug: string; name: string; key: string }[] = [];
  for (const s of m.sightings) {
    if (hasResult(s.fixture)) continue;
    const members = memberSlugs(s.season);
    const slug = [s.fixture.home, s.fixture.away].find((x) => members.has(x)) ?? s.fixture.home;
    out.push({ slug, name: s.season.names.name(slug), key: s.key });
  }
  return out;
}

/** The record that DID post the score of a one-sided match: the canonical
 *  one, by construction. Its member side is the programme whose page spoke. */
export function postedSide(m: DivisionMatch): { slug: string; name: string; key: string } {
  const members = memberSlugs(m.season);
  const slug = [m.fixture.home, m.fixture.away].find((x) => members.has(x)) ?? m.fixture.home;
  return { slug, name: m.season.names.name(slug), key: m.key };
}

/** Every match the division holds on one source only, in fold order. A
 *  conference's own listing is the subset one of its own records is in:
 *  the match belongs to both conferences, and each page names the silence. */
export function oneSidedFinals(seasons: readonly Season[]): DivisionMatch[] {
  return foldToMatches(allSightings(seasons)).filter((m) => m.oneSided);
}

/** The label a listing prints for a match: "Sep 3 · Cedarville v McKendree",
 *  the box-score gaps' own form, so the two disclosures read alike. */
export const matchLabel = (m: DivisionMatch): string =>
  `${monShort(m.fixture.date)} ${dayOfMonth(m.fixture.date)} · ${m.season.names.name(m.fixture.home)} v ${m.season.names.name(m.fixture.away)}`;

/** Every conference's record of every match it collected, in config order. */
export function allSightings(seasons: readonly Season[]): Sighting[] {
  const order = new Map(site.conferences.map((k, i) => [k, i]));
  return [...seasons]
    .sort(
      (a, b) =>
        (order.get(a.key) ?? site.conferences.length) -
        (order.get(b.key) ?? site.conferences.length),
    )
    .flatMap((season) =>
      season.fixtures.fixtures.map((fixture) => ({
        key: season.key,
        code: season.fixtures.conference,
        season,
        fixture,
      })),
    );
}

/** The figures a division-level surface may print. */
export interface DivisionFigures {
  played: number;
  silentFinals: number;
  gaps: number;
  total: number;
  exhibitions: number;
}

export interface DivisionCounts extends DivisionFigures {
  /**
   * How many EXTRA records the conferences' own counts hold for each figure.
   *
   * A match two of them collected is in two files, so any sum of their counts
   * holds it twice. Every figure above reconciles exactly —
   *
   *     sum of the columns − duplicated = the figure
   *
   * — and the term is here so that reconciliation stands on a number rather
   * than on a subtraction nobody can check. It is a count of extra RECORDS,
   * not of shared matches, so it stays right if a match ever reaches three
   * files rather than two.
   */
  duplicated: DivisionFigures;
}

/**
 * The division's counts, every one of them a count of MATCHES.
 *
 * Each definition is the season page's own — played is a final with a
 * published score, a silent final is one without, a gap is a played match
 * whose box score the collector could not reach, and a friendly is outside all
 * of it — applied to the FOLDED list rather than to the files. Summing the
 * conferences instead counts a match between two of them twice, which is what
 * "48 of 363 matches played" was doing on the published site (tui-2l6).
 *
 * The fold is structural, not conditional. It runs over every figure whether
 * or not today's data happens to duplicate that one: on the collect this was
 * written against only the total and the played count were affected, and a
 * design that folded just those two would start lying the first day two
 * conferences both went silent on the same match.
 */
export function divisionCounts(seasons: readonly Season[]): DivisionCounts {
  const zero = (): DivisionFigures => ({
    played: 0,
    silentFinals: 0,
    gaps: 0,
    total: 0,
    exhibitions: 0,
  });
  const figures = zero();
  const duplicated = zero();
  const count = (key: keyof DivisionFigures, records: number): void => {
    figures[key]++;
    duplicated[key] += records - 1;
  };

  // A folded match is what its canonical sighting says it is: the fold has
  // already chosen the record that decides the score (posted record first,
  // home side as the tiebreak), and the same record decides the match type.
  // The 2026 Lander pre-season pair is the case this was measured on: PBC's
  // file marks both as exhibitions and posts the scores, CC's and SAC's still
  // hold them as scheduled league fixtures. The match is a friendly, because
  // the canonical sighting says so, and it is not in the total.
  //
  // The duplicate term is then whatever the columns carried under a figure
  // that the folded match does not: every sighting whose OWN row meets the
  // figure's definition, less the one the folded match counts if its
  // canonical row meets it. Computed per figure rather than per match, so
  // that "sum of the columns less duplicated" reconciles by construction
  // even where the records classify one match differently, as the Lander
  // pair does: its CC and SAC rows are extra total records, and its PBC row
  // is the one exhibition record the fold counts.
  const rowIsSilentFinal = (x: Fixture): boolean => isCountable(x) && isPlayed(x) && !hasScore(x);
  const figureOf = (x: Fixture): keyof DivisionFigures | null => {
    if (isExhibition(x)) return "exhibitions";
    if (isScored(x)) return "played";
    if (rowIsSilentFinal(x)) return "silentFinals";
    return null;
  };
  for (const m of foldToMatches(allSightings(seasons))) {
    const canonical = figureOf(m.fixture);
    const rows = m.sightings.map((s) => s.fixture);
    const carried = (admit: (x: Fixture) => boolean): number =>
      rows.filter(admit).length - (admit(m.fixture) ? 1 : 0);
    if (canonical !== null) figures[canonical]++;
    if (isCountable(m.fixture)) figures.total++;
    duplicated.total += carried(isCountable);
    duplicated.exhibitions += carried(isExhibition);
    duplicated.played += carried(isScored);
    duplicated.silentFinals += carried(rowIsSilentFinal);
  }

  // A gap is named by the collector that could not reach the box score, so it
  // folds by the match it belongs to. One whose fixture the collector could
  // not resolve either cannot fold at all, and is counted where it stands
  // rather than guessed at.
  const gaps = new Map<string, number>();
  for (const s of seasons) {
    for (const g of boxScoreGaps(s)) {
      const id = g.fixture ? matchIdentity(g.fixture) : `unresolved:${s.key}:${g.fixtureId}`;
      gaps.set(id, (gaps.get(id) ?? 0) + 1);
    }
  }
  for (const records of gaps.values()) count("gaps", records);

  return { ...figures, duplicated };
}
