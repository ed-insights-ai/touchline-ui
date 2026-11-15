// The Match Centre's glue: what the page says about each side before a match
// (the preview's "The sides"), and the box score's lines once it is played
// (lineups, the player-sheet links, who published the box score).
//
// Nothing here is a new figure. The record, the form, the table row, the lead
// keeper and the postseason ties are the derivations every other surface
// reads (derive.ts, postseason.ts); this module only picks them for one side
// and joins a box-score line to the sheet the team page already draws.

import {
  type Fixture,
  formOf,
  hasScore,
  isScored,
  leadKeeper,
  markOf,
  matchHref,
  matchIdentity,
  type Result,
  recordOf,
  resultFor,
  type Season,
  table,
} from "./derive.ts";
import type { KeeperStats, MatchPlayerLine, MatchTeam, Player, PlayerStats } from "./model.ts";
import { foldName, playerIdOf } from "./player.ts";
import { type Postseason, stageTag, type Tie } from "./postseason.ts";

// ── Whose season a side is ──────────────────────────────────────────────────

/** The season a programme is a member of: the first configured conference
 *  that lists it, the same rule teamPageHref resolves a team page by, so a
 *  side's figures and its team page come from the same file. Null for a side
 *  outside every collected conference. */
export function memberSeasonOf(seasons: readonly Season[], slug: string): Season | null {
  return seasons.find((s) => s.fixtures.programmes.some((p) => p.slug === slug)) ?? null;
}

// ── One side, so far this season ────────────────────────────────────────────

export interface Scorer {
  name: string;
  goals: number;
  assists: number;
  /** For the sheet lookup: the stats row's own id, when published. */
  player_id?: string;
}

export interface SideSummary {
  slug: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  /** The side's conference table row, when it has played a conference match
   *  or the table is the one its file draws (code is the file's own). */
  conference: { code: string; won: number; drawn: number; lost: number; played: number } | null;
  form: Result[];
  /** Most goals, then most assists; null when nobody has scored. */
  topScorer: Scorer | null;
  keeper: KeeperStats | null;
  /** Whether a season statistics file was collected for this side at all, so
   *  an absent scorer can be told apart from an absent file. */
  hasStats: boolean;
}

/** The leading scorer from the season statistics as published. */
export function topScorerOf(players: readonly PlayerStats[]): Scorer | null {
  const ranked = players
    .filter((p) => (p.goals ?? 0) > 0)
    .sort(
      (a, b) =>
        (b.goals ?? 0) - (a.goals ?? 0) ||
        (b.assists ?? 0) - (a.assists ?? 0) ||
        a.name.localeCompare(b.name),
    );
  const top = ranked[0];
  if (!top) return null;
  return {
    name: top.name,
    goals: top.goals ?? 0,
    assists: top.assists ?? 0,
    ...(top.player_id ? { player_id: top.player_id } : {}),
  };
}

export function sideSummary(s: Season, slug: string): SideSummary {
  const rec = recordOf(s, slug);
  const row = table(s).find((r) => r.slug === slug);
  const team = s.stats?.teams[slug];
  return {
    slug,
    played: rec.played,
    won: rec.won,
    drawn: rec.drawn,
    lost: rec.lost,
    goalsFor: rec.goalsFor,
    goalsAgainst: rec.goalsAgainst,
    conference: row
      ? {
          code: s.fixtures.conference,
          won: row.won,
          drawn: row.drawn,
          lost: row.lost,
          played: row.played,
        }
      : null,
    form: formOf(s, slug),
    topScorer: topScorerOf(team?.players ?? []),
    keeper: leadKeeper(s, slug),
    hasStats: team !== undefined,
  };
}

// ── The postseason route so far ─────────────────────────────────────────────

export interface RouteStep {
  tie: Tie;
  /** "GAC SF", "NCAA R1": the tag every ledger row wears. */
  tag: string;
  opponent: string;
  date: string;
  /** From this side's end, "3–0"; null until a score is published. */
  line: string | null;
  /** W/D/L from this side's end; null when unscored or disputed. */
  result: Result | null;
  /** Penalties from this side's end, "4–3", when a shootout was collected. */
  pens: string | null;
  /** "disputed" / "by forfeit": the mark every surface prints. */
  mark: string | null;
  href: string;
}

/** The ties this side has played or is drawn in this postseason, before the
 *  match on the page and in date order. A tie that is the page's own match is
 *  not part of the route to it. */
export function routeOf(p: Postseason, slug: string, current: Fixture): RouteStep[] {
  const here = matchIdentity(current);
  return [...p.byIdentity.values()]
    .filter((t) => t.identity !== here && (t.fixture.home === slug || t.fixture.away === slug))
    .filter((t) => t.fixture.date <= current.date)
    .sort((a, b) => a.fixture.date.localeCompare(b.fixture.date))
    .map((t) => {
      const f = t.fixture;
      const home = f.home === slug;
      const scored = !t.disputed && f.status === "final" && hasScore(f);
      const sh = t.shootout;
      return {
        tie: t,
        tag: stageTag(p, t.identity)?.text.trim() ?? "",
        opponent: home ? f.away : f.home,
        date: f.date,
        line: scored
          ? home
            ? `${f.home_score}–${f.away_score}`
            : `${f.away_score}–${f.home_score}`
          : null,
        result: scored ? resultFor(f, home ? "home" : "away") : null,
        pens: sh && !t.disputed ? (home ? `${sh.home}–${sh.away}` : `${sh.away}–${sh.home}`) : null,
        mark: t.disputed ? "disputed" : markOf(t.match.season, f),
        href: matchHref(t.match.key, f.id),
      };
    });
}

// ── Where a side joins the knockout ────────────────────────────────────────

const ORDINAL = ["first", "second", "third", "fourth", "fifth", "sixth"];
const STAGE_WORD: Record<string, string> = {
  QF: "the quarterfinals",
  SF: "the semifinals",
  FINAL: "the final",
};

export interface Entry {
  /** The round of the page's own tie, which is the side's first. */
  round: number;
  /** "Enters in the second round". */
  text: string;
  /** "NCAA" or the conference tournament's codes, for the line's tag. */
  owner: string;
}

/** The round a side joins this tournament in, when the page's tie is later
 *  than the first round and the record shows the side played no earlier one:
 *  a first-round bye, said as what it is, never as a word the source did not
 *  print. Every condition is one the archive can prove or the claim is not
 *  made — the tie is placed and undisputed, the first round is collected,
 *  the side's own schedule is collected (a side outside every conference has
 *  no file whose silence would mean anything), and that schedule holds no
 *  match since the first round that no record calls a tie. */
export function entryOf(
  p: Postseason,
  member: Season | null,
  slug: string,
  current: Fixture,
): Entry | null {
  const here = matchIdentity(current);
  const tie = p.byIdentity.get(here);
  const tournament = p.tournamentOf.get(here);
  if (!tie || !tournament || tie.disputed || tie.round <= 1 || !member) return null;
  if (!p.conferenceOf.has(slug)) return null;
  const firstRound = tournament.ties.filter((t) => t.round === 1);
  if (firstRound.length === 0) return null;
  const mine = tournament.ties.filter(
    (t) => t.identity !== here && (t.fixture.home === slug || t.fixture.away === slug),
  );
  // An unplaced tie of this side might be the earlier round; say nothing.
  if (mine.some((t) => t.round === 0 || t.round < tie.round)) return null;
  const opened = firstRound.map((t) => t.fixture.date).sort()[0] ?? current.date;
  // A match in the window that no record calls a tie could be the earlier
  // round, published without its stage; the claim waits for it.
  const unstaged = member.fixtures.fixtures.some(
    (f) =>
      (f.home === slug || f.away === slug) &&
      f.date >= opened &&
      f.date < current.date &&
      !p.byIdentity.has(matchIdentity(f)),
  );
  if (unstaged) return null;
  // The tie's own label where it names a stage ("SF"), else the round count.
  const word =
    STAGE_WORD[tie.label] ??
    (ORDINAL[tie.round - 1] ? `the ${ORDINAL[tie.round - 1]} round` : null);
  if (!word) return null;
  const owner = tie.competition === "ncaa" ? "NCAA" : tournament.codes.join("/") || "CONF";
  return { round: tie.round, text: `Enters in ${word}`, owner };
}

// ── Met this season ─────────────────────────────────────────────────────────

export interface Meeting {
  fixture: Fixture;
  /** The score from the first-named side's end. */
  line: string;
  /** W/D/L for the first-named side; null on a disputed score. */
  result: Result | null;
  mark: string | null;
  href: string;
}

/** Earlier meetings of the two sides that count, scored, from the page's own
 *  file (a match between them always involves its member side, so the file
 *  holds every one). Read from `a`'s end. */
export function meetingsOf(s: Season, a: string, b: string, current: Fixture): Meeting[] {
  return s.fixtures.fixtures
    .filter(
      (f) =>
        f.id !== current.id &&
        matchIdentity(f) !== matchIdentity(current) &&
        ((f.home === a && f.away === b) || (f.home === b && f.away === a)) &&
        isScored(f) &&
        hasScore(f),
    )
    .sort((x, y) => x.date.localeCompare(y.date))
    .map((f) => {
      const home = f.home === a;
      const mark = markOf(s, f);
      return {
        fixture: f,
        line: home ? `${f.home_score}–${f.away_score}` : `${f.away_score}–${f.home_score}`,
        result: mark === "disputed" ? null : resultFor(f, home ? "home" : "away"),
        mark,
        href: matchHref(s.key, f.id),
      };
    });
}

// ── Lineups ─────────────────────────────────────────────────────────────────

export interface Lineup {
  starters: MatchPlayerLine[];
  substitutes: MatchPlayerLine[];
  /** Lines whose page printed no starter flag: listed as published, unsplit. */
  unmarked: MatchPlayerLine[];
}

/** One side's player lines, starters then substitutes, each in the order the
 *  box score printed them. A line with no starter flag is not guessed into
 *  either group. */
export function lineupOf(team: MatchTeam | undefined): Lineup {
  const lines = team?.players ?? [];
  return {
    starters: lines.filter((l) => l.started === true),
    substitutes: lines.filter((l) => l.started === false),
    unmarked: lines.filter((l) => l.started === undefined),
  };
}

// ── The player sheet a name may link to ─────────────────────────────────────

/** The sheet's anchor on the team page, exactly as playerCard mints it. */
export const sheetAnchor = (slug: string, player: Player): string =>
  `p-${slug}-${playerIdOf(player) ?? foldName(player.name).replace(/\s+/g, "-")}`;

/** Anything that names a player: a box-score line, a stats row, a bare name. */
export interface Named {
  name: string;
  player_id?: string;
  player_ref?: { id: string; source: string };
}

/** A lookup from a named player to the anchor of the sheet the team page
 *  draws for them, over that team page's roster. Joined by the published id
 *  where one is carried, else by the folded name; a key-only line (the rib
 *  could not resolve it) joins by name or not at all. No sheet, no anchor. */
export function sheetIndex(slug: string, roster: readonly Player[]): (who: Named) => string | null {
  const byId = new Map<string, Player>();
  const byName = new Map<string, Player | null>();
  for (const p of roster) {
    const id = playerIdOf(p);
    if (id) byId.set(id, p);
    const folded = foldName(p.name);
    // Two roster players folding to one name cannot be told apart by name.
    byName.set(folded, byName.has(folded) ? null : p);
  }
  return (who) => {
    const refId = who.player_ref && who.player_ref.source !== "key" ? who.player_ref.id : undefined;
    const id = who.player_id ?? refId;
    const hit = (id ? byId.get(id) : undefined) ?? byName.get(foldName(who.name)) ?? null;
    return hit ? sheetAnchor(slug, hit) : null;
  };
}

/** A box-score name (a scorer, an assist) resolved to its line on that side. */
export function lineByName(team: MatchTeam | undefined, name: string): MatchPlayerLine | null {
  const lines = [...(team?.players ?? []), ...(team?.keepers ?? [])];
  return (
    lines.find((l) => l.name === name) ??
    lines.find((l) => foldName(l.name) === foldName(name)) ??
    null
  );
}

// ── Who published the box score ─────────────────────────────────────────────

const hostOf = (url: string | undefined): string | null => {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

const hostIndexes = new WeakMap<readonly Season[], Map<string, Map<string, Season>>>();

/** Host → the programmes whose own schedule pages it serves, built once per
 *  set of seasons: every match page asks, and the fixtures are thousands. */
function hostIndex(seasons: readonly Season[]): Map<string, Map<string, Season>> {
  const hit = hostIndexes.get(seasons);
  if (hit) return hit;
  const index = new Map<string, Map<string, Season>>();
  const seen = new Map<string, string | null>();
  for (const s of seasons) {
    for (const f of s.fixtures.fixtures) {
      const url = f.source_url;
      if (!url) continue;
      let host = seen.get(url);
      if (host === undefined) {
        host = hostOf(url);
        seen.set(url, host);
      }
      if (!host) continue;
      const owner = f.id.split(":")[1];
      if (!owner || (f.home !== owner && f.away !== owner)) continue;
      const owners = index.get(host) ?? new Map<string, Season>();
      if (!owners.has(owner)) owners.set(owner, s);
      index.set(host, owners);
    }
  }
  hostIndexes.set(seasons, index);
  return index;
}

/** The programme whose site served this box score: the one collected
 *  programme whose schedule page is on the same host. A box score is often
 *  the opponent's (a twin), so the fixture's own owner is not assumed. Null
 *  when the host belongs to no collected programme, or to more than one. */
export function boxScorePublisher(
  seasons: readonly Season[],
  url: string,
): { slug: string; name: string; host: string } | null {
  const host = hostOf(url);
  if (!host) return null;
  const owners = hostIndex(seasons).get(host);
  const only = owners?.size === 1 ? [...owners][0] : undefined;
  if (!only) return null;
  const [slug, s] = only;
  return { slug, name: s.names.name(slug), host };
}

/** "uiupeacocks.com" for a quiet fallback line. */
export const boxScoreHost = (url: string): string | null => hostOf(url);
