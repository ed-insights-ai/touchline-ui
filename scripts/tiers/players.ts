// ALGORITHM.md section 4 (version 2.2, with the contract 2.3 rulings N1 and
// N2 of ALGORITHM-2.3-rulings.md): a player-season.
//
// 4.2 joins a programme-season's `players` lines into people in four passes,
// each merging the groups the earlier passes formed: the collector's
// `player_ref` (not the synthetic `key` route), the page `player_id`, the
// roster (for lines the collector did not resolve), and the folded name. No
// pass merges two groups that hold different page ids or different roster
// entries. 4.3 then finds the split spellings, 4.4 links a player to the
// season before, 4.5 says which name, number and id an entry prints, and 4.6
// sums minutes, goals and shots, a doubled line counted once, with penalties
// stripped and, second, scaled down where the season statistics show more.
//
// The roster lookup makes the collector's two tests (`_lookup` in
// keelson-rib-touchline pipeline/src/identity.py), but [v2.2] over every
// entry on the roster, with or without a bio id. A group is also tied to the
// entry whose bio id equals any of its page, twin or roster `player_ref` ids
// or its page `player_id`s; that entry is the player's roster line.
//
// [N2] One person, one entry. Pass 3 also looks up every line of a group that
// passes 1 and 2 left untied (N2e); a group whose every line prints a team
// row is dropped (N2d); a fifth pass joins an untied group to the only roster
// player whose name is close and who shares a number or, for a close name,
// to one printing none (N2a); the name printed is the roster line's, else the
// stats row's (N2d); the split-spelling flag reads close names (N2b); a link
// across seasons may go by a close name (N2c), and a home town no longer
// contradicts one.

import type { Player, PlayerRefSource, PlayerStats } from "../../src/lib/model.ts";
import {
  foldLetters,
  foldName,
  foldSurname,
  givenFirst,
  shirtNumber,
} from "../../src/lib/tiers.ts";
import type { Venue } from "./opponents.ts";
import { givenFolded, givenInitial } from "./penalties.ts";

/** One line of a `players` list, as the build reads it. */
export interface SheetLine {
  name: string;
  /** The page `player_id` field, as printed. */
  playerId: string | null;
  ref: { id: string; source: PlayerRefSource } | null;
  number: string | null;
  position: string | null;
  started: boolean;
  /** Null when the line prints no minutes: such a line is skipped whole. */
  minutes: number | null;
  /** As printed; an unprinted count reads as 0. */
  goals: number;
  shots: number;
}

/** One programme's side of one record. */
export interface Sheet {
  identity: string;
  date: string;
  opponent: string;
  venue: Venue;
  /** The side's `players` list, in printed order. */
  lines: SheetLine[];
  /** Penalty attempts credited to this side, by line index (penalties.ts). */
  credits: { lines: number[]; goal: boolean }[];
}

/** The two divisors a sheet's goals and shots are adjusted by:
 *  dfn[opponent] × h, from the goals model and the shots model. */
export interface Scale {
  goals: number;
  shots: number;
}

/** What the second penalty source did to one player-season. */
export interface StatsPenaltyChange {
  playByPlayGoals: number;
  statsGoals: number | null;
  playByPlayAttempts: number;
  statsAttempts: number | null;
  /** Of the excess, the penalties the play-by-play did credit to the player,
   *  on records 4.6 skipped for printing no minutes (measured, not used). */
  skippedGoals: number;
  skippedAttempts: number;
  /** The factors adjG and adjS were multiplied by (1 when untouched). */
  goalsFactor: number;
  shotsFactor: number;
}

export interface PlayerSeason {
  programme: string;
  season: number;
  /** 4.5: the name, number and page id the entry prints, and the key.
   *  [N2d] The name is the roster line's, else the joined stats row's, else
   *  the value on the most lines (`lineName`). */
  name: string;
  key: string;
  lineName: string;
  nameSource: "roster" | "stats" | "lines";
  /** [N2d] The folded name the stats file is joined by after the page id: the
   *  roster line's name when there is one, else `lineName`. */
  joinKey: string;
  playerId: string | null;
  number: string | null;
  /** Every shirt number the lines print, leading zeros dropped. */
  numbers: Set<string>;
  /** The records the player has a line in. */
  sheets: Set<string>;
  /** Every line's position label, in date order. */
  labels: (string | null)[];
  lineCount: number;
  /** The roster line 4.2 tied the player to, and its entry key (rosterIndex). */
  roster: Player | null;
  rosterEntry: string | null;
  /** Records where one sheet carries two or more of the player's lines. */
  doubled: number;
  minutes: number;
  /** [M3] Appearances: lines with minutes above zero in records printing
   *  minutes for the side, and his lines in records printing none (one per
   *  record). In stats mode, the larger of these and the row's games played. */
  matches: number;
  starts: number;
  /** Penalty goals and attempts found in the play-by-play, over the lines
   *  that count (4.6). */
  penGoals: number;
  penAttempts: number;
  /** Penalty goals and attempts the play-by-play credits to the player on
   *  records where none of his lines prints minutes. 4.6 skips those records,
   *  but [R-E] counts them as found when the stats file is compared. */
  skippedPenGoals: number;
  skippedPenAttempts: number;
  /** Σ g and Σ s over the season, before the opponent adjustment. */
  G: number;
  S: number;
  adjG: number;
  adjS: number;
  /** The records the player has a line in (a doubled line counted once). */
  records: number;
  /** [N1, contract 2.3] The same sums over every record with a line, whether
   *  or not it prints minutes: the doubled line chosen as above, else the
   *  first printed. Read when the minutes of record are the season total. */
  everyRecord: SeasonSums;
}

/** Goals and shots summed over a set of records (penalties stripped). */
export interface SeasonSums {
  starts: number;
  G: number;
  S: number;
  adjG: number;
  adjS: number;
}

// ── 4.5: the value on the most lines ────────────────────────────────────────

/** The value that appears most often; a tie goes to the lexicographically
 *  smallest (code-unit order). Null for no values. */
export function mostCommon(values: readonly string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount || (c === bestCount && best !== null && v < best)) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

const intersects = <T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean => {
  for (const x of a) if (b.has(x)) return true;
  return false;
};

// ── [N2] Close names ────────────────────────────────────────────────────────

/** Plain unit-cost edit distance (insert, delete, substitute). */
export function levenshtein(a: string, b: string): number {
  const [x, y] = a.length < b.length ? [b, a] : [a, b];
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) {
      const sub = (prev[j - 1] as number) + (x[i - 1] === y[j - 1] ? 0 : 1);
      cur.push(Math.min((prev[j] as number) + 1, (cur[j - 1] as number) + 1, sub));
    }
    prev = cur;
  }
  return prev[y.length] as number;
}

/** The words of the given name: after the comma in "Last, First", else every
 *  word before the last. */
export function givenWords(name: string): string[] {
  const comma = name.indexOf(",");
  const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);
  return comma >= 0 ? words(name.slice(comma + 1)) : words(name).slice(0, -1);
}

/** (ii)'s words: given names first (4.1 step 1), each word folded by steps 2
 *  to 4; words that fold to nothing dropped. */
export function nameWords(name: string): Set<string> {
  return new Set(givenFirst(name).split(/\s+/).map(foldLetters).filter(Boolean));
}

export type CloseTest = "i" | "ii" | "iii" | "iv" | "v";

/**
 * The closeness tests two names pass, on names folded as in 4.1: (i) the edit
 * distance of the folded full names is at most 2, or at most 15% of the longer
 * one's length; (ii) every folded word of one is a folded word of the other;
 * (iv) the folded surnames are equal and the folded given names begin with the
 * same letter; (v) the folded surnames are equal and the folded given names
 * begin with the same three letters (each at least three letters long);
 * (iii) the first given-name words fold the same. A test on an empty fold
 * never holds.
 */
export function closeTests(a: string, b: string): Set<CloseTest> {
  const out = new Set<CloseTest>();
  const fa = foldName(a);
  const fb = foldName(b);
  if (fa && fb) {
    const d = levenshtein(fa, fb);
    if (d <= 2 || 20 * d <= 3 * Math.max(fa.length, fb.length)) out.add("i");
  }
  const wa = nameWords(a);
  const wb = nameWords(b);
  const within = (x: Set<string>, y: Set<string>) => [...x].every((w) => y.has(w));
  if (wa.size > 0 && wb.size > 0 && (within(wa, wb) || within(wb, wa))) out.add("ii");
  const sa = foldSurname(a);
  const ia = givenInitial(a);
  if (sa && sa === foldSurname(b) && ia && ia === givenInitial(b)) out.add("iv");
  const fga = givenFolded(a);
  const fgb = givenFolded(b);
  if (
    sa &&
    sa === foldSurname(b) &&
    fga.length >= 3 &&
    fgb.length >= 3 &&
    fga.slice(0, 3) === fgb.slice(0, 3)
  )
    out.add("v");
  const ga = foldLetters(givenWords(a)[0] ?? "");
  if (ga && ga === foldLetters(givenWords(b)[0] ?? "")) out.add("iii");
  return out;
}

/** Close: (i), (ii) or (iv). */
export const isClose = (a: string, b: string): boolean => {
  const t = closeTests(a, b);
  return t.has("i") || t.has("ii") || t.has("iv");
};

/** [IR-18] The shirt numbers a roster line prints: its number split on "/",
 *  each part kept when it is all digits once trimmed, leading zeros dropped
 *  ("29/28" gives 29 and 28; "RS", "DP", "5A" and "" give none). A player's
 *  shirt numbers are his box-score lines' and these. */
export function rosterNumbers(row: Player | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const part of (row?.number ?? "").split("/")) {
    const t = part.trim();
    if (/^[0-9]+$/.test(t)) out.add(shirtNumber(t));
  }
  return out;
}

/** [N2d] The name an entry prints: runs of white space collapse to one space
 *  and the ends are trimmed. Nothing else about the name changes, and the key
 *  (4.1's fold, letters only) is the same either way. */
export const printedName = (name: string): string => name.replace(/\s+/g, " ").trim();

/** [N2d] A line that prints a team row, not a person: TEAM, TEAM TEAM, or the
 *  programme's own nickname (folded) with no minutes (null or zero). */
export function isTeamRow(line: SheetLine, nicknameFold: string): boolean {
  const f = foldName(line.name);
  if (f === "team" || f === "teamteam") return true;
  return nicknameFold !== "" && f === nicknameFold && (line.minutes === null || line.minutes === 0);
}

// ── The roster, read the collector's way ────────────────────────────────────

/** A roster row's bio id (the collector's `roster_player_id`): its
 *  `player_id` when the file carries one, else the trailing number of its
 *  bio URL; empty when it has neither. */
export function rosterBioId(player: Player): string {
  const explicit = String((player as { player_id?: unknown }).player_id ?? "").trim();
  if (explicit) return explicit;
  return /\/(\d+)\/?$/.exec(player.source_url ?? "")?.[1] ?? "";
}

export interface RosterIndex {
  /** Folded full name → entry keys. */
  byName: Map<string, string[]>;
  /** Shirt number and folded surname → entry keys. */
  byNumberSurname: Map<string, string[]>;
  /** Entry key → the roster row. */
  entries: Map<string, Player>;
  /** Bio id → entry key, for the rows that have one. */
  byBio: Map<string, string>;
}

/** [v2.2] Every roster row with a name, with or without a bio id. A row is
 *  keyed by its bio id when it has one (two rows with one bio id are one
 *  entry, as the collector's index has it), else by its place in the list. */
export function rosterIndex(players: readonly Player[]): RosterIndex {
  const index: RosterIndex = {
    byName: new Map(),
    byNumberSurname: new Map(),
    entries: new Map(),
    byBio: new Map(),
  };
  const push = (m: Map<string, string[]>, k: string, v: string) => {
    const list = m.get(k);
    if (list) list.push(v);
    else m.set(k, [v]);
  };
  players.forEach((p, i) => {
    if (!p.name) return;
    const id = rosterBioId(p);
    const key = id ? `bio:${id}` : `row:${i}`;
    if (!index.entries.has(key)) index.entries.set(key, p);
    if (id && !index.byBio.has(id)) index.byBio.set(id, key);
    push(index.byName, foldName(p.name), key);
    const number = shirtNumber(p.number);
    if (number) push(index.byNumberSurname, `${number}\u0000${foldSurname(p.name)}`, key);
  });
  return index;
}

const distinct = (ids: readonly string[] | undefined): string[] => [...new Set(ids ?? [])].sort();

/** The collector's two tests: the roster entry with the same folded full
 *  name, if exactly one has it; else the one with the same shirt number and
 *  folded surname, if exactly one has both. Its entry key, or null. */
export function rosterLookup(
  index: RosterIndex,
  name: string,
  number: string | null,
): string | null {
  if (!name || index.byName.size === 0) return null;
  const byName = distinct(index.byName.get(foldName(name)));
  if (byName.length === 1) return byName[0] ?? null;
  const shirt = shirtNumber(number);
  if (!shirt) return null;
  const byNumber = distinct(index.byNumberSurname.get(`${shirt}\u0000${foldSurname(name)}`));
  return byNumber.length === 1 ? (byNumber[0] ?? null) : null;
}

/** [v2.2] The roster entry a line ties its group to by a bio id: its page,
 *  twin or roster `player_ref` id, else its page `player_id`. */
export function bioTie(line: SheetLine, index: RosterIndex): string | null {
  const refId = line.ref && line.ref.source !== "key" ? line.ref.id : null;
  if (refId) {
    const byRef = index.byBio.get(refId);
    if (byRef) return byRef;
  }
  return line.playerId ? (index.byBio.get(line.playerId) ?? null) : null;
}

// ── 4.2: joining lines ──────────────────────────────────────────────────────

export interface JoinOptions {
  /** Pass 3. Off only to measure what it recovers (acceptance 11.4). */
  rosterPass: boolean;
}

export interface JoinMeasures {
  /** Merges a pass wanted and the page-id or roster rule refused. */
  blocked: number;
  /** Lines pass 3 sent to a roster row. */
  rosterFound: number;
  /** Lines pass 3 sent to a roster row other than the one their group is
   *  already tied to: the earlier tie stands. */
  rosterConflicts: number;
  /** [N2e] Of rosterFound, lines with a page, twin or roster ref, looked up
   *  because passes 1 and 2 left their group untied. */
  rosterFoundUntied: number;
  /** [N2d] Players dropped as team rows. */
  teamRows: number;
  /** [N2a] Players joined to a roster player; refused by the page-id rule;
   *  left alone because two or more roster players qualified. */
  closeJoined: number;
  closeRefused: number;
  closeAmbiguous: number;
}

export const emptyJoinMeasures = (): JoinMeasures => ({
  blocked: 0,
  rosterFound: 0,
  rosterConflicts: 0,
  rosterFoundUntied: 0,
  teamRows: 0,
  closeJoined: 0,
  closeRefused: 0,
  closeAmbiguous: 0,
});

/** What the join reads beyond the lines and the roster [N2]. */
export interface SeasonContext {
  /** The stats file's players list for the programme-season (N2d names). */
  statsRows: readonly PlayerStats[];
  /** The programme's nickname, folded (N2d team rows). */
  nicknameFold: string;
}

interface Flat {
  sheet: Sheet;
  index: number;
  line: SheetLine;
}

/**
 * The join of 4.2 over one programme-season's sheets (in date order). Returns
 * the groups of line positions in `flat` order, and each group's roster tie.
 */
function join(
  flat: readonly Flat[],
  roster: RosterIndex,
  options: JoinOptions,
  measures: JoinMeasures,
  context: SeasonContext,
): { groups: number[][]; tie: (string | null)[] } {
  const n = flat.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const page: (string | null)[] = flat.map((f) => f.line.playerId);
  const tie: (string | null)[] = flat.map(({ line }) => bioTie(line, roster));
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r] as number;
    let x = i;
    while (parent[x] !== r) {
      const next = parent[x] as number;
      parent[x] = r;
      x = next;
    }
    return r;
  };
  const differ = (a: string | null | undefined, b: string | null | undefined) =>
    a != null && b != null && a !== b;
  /** Merge the groups of a and b unless the page-id or roster rule forbids
   *  it; the merged group keeps whichever page id and tie either held. */
  const merge = (a: number, b: number): boolean => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return true;
    if (differ(page[ra], page[rb]) || differ(tie[ra], tie[rb])) return false;
    const [root, child] = ra < rb ? [ra, rb] : [rb, ra];
    parent[child] = root;
    page[root] = page[root] ?? page[child] ?? null;
    tie[root] = tie[root] ?? tie[child] ?? null;
    return true;
  };
  /** One pass: lines sharing a key join the first group holding that key
   *  that will take them. */
  const pass = (keyOf: (f: Flat) => string | null) => {
    const holders = new Map<string, number[]>();
    flat.forEach((f, i) => {
      const k = keyOf(f);
      if (!k) return;
      const list = holders.get(k);
      if (!list) {
        holders.set(k, [i]);
        return;
      }
      if (list.some((j) => merge(i, j))) return;
      measures.blocked++;
      list.push(i);
    });
  };

  pass(({ line }) => (line.ref && line.ref.source !== "key" ? line.ref.id : null));
  pass(({ line }) => line.playerId);
  if (options.rosterPass) {
    // Each line with no ref, or a key ref, looks up its roster entry; [N2e] so
    // does every line of a group passes 1 and 2 left untied, whatever ref it
    // carries. Its group takes that tie unless it already holds another.
    const untied = flat.map((_, i) => tie[find(i)] === null);
    flat.forEach(({ line }, i) => {
      const resolved = line.ref !== null && line.ref.source !== "key";
      if (resolved && !untied[i]) return;
      const found = rosterLookup(roster, line.name, line.number);
      if (found === null) return;
      measures.rosterFound++;
      if (resolved) measures.rosterFoundUntied++;
      const r = find(i);
      if (tie[r] === found) return;
      if (tie[r] !== null) {
        measures.rosterConflicts++;
        return;
      }
      tie[r] = found;
    });
    // "Lines that find the same roster entry are merged, and merged with ANY
    // group already tied to that roster entry": every group tied to one entry,
    // by a bio id or by the lookup, joins the first, in line order. (Before
    // the reconciliation a found line joined only the first tied group, so a
    // page-id group and a twin-ref group of one player could stay apart.)
    const firstOf = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const t = tie[find(i)];
      if (!t) continue;
      const held = firstOf.get(t);
      if (held === undefined) firstOf.set(t, i);
      else if (!merge(held, i)) measures.blocked++;
    }
  }
  pass(({ line }) => foldName(line.name) || null);

  const dropped = new Set<number>();
  const collect = () => {
    const out = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      if (dropped.has(i)) continue;
      const r = find(i);
      const g = out.get(r);
      if (g) g.push(i);
      else out.set(r, [i]);
    }
    return out;
  };
  let groups = collect();

  // [N2d] A player whose every line prints a team row is not a person.
  for (const [r, idx] of groups) {
    if (!idx.every((i) => isTeamRow((flat[i] as Flat).line, context.nicknameFold))) continue;
    for (const i of idx) dropped.add(i);
    groups.delete(r);
    measures.teamRows++;
  }

  // [N2a] The fifth pass, over the groups pass 4 left, every pair judged
  // before any is merged: an untied group joins the only tied one it shares
  // no record with, whose name is loosely close, and with which it shares a
  // shirt number, or, for a close name, when it prints none. [IR-18] A tied
  // group's numbers are its lines' and its roster line's.
  const printed = (r: number, idx: readonly number[]): string => {
    const entry = tie[r];
    const row = entry ? roster.entries.get(entry) : undefined;
    if (row?.name) return row.name;
    const lineName = mostCommon(idx.map((i) => (flat[i] as Flat).line.name)) as string;
    return statsRowOf(context.statsRows, page[r] ?? null, foldName(lineName))?.name ?? lineName;
  };
  const info = new Map<number, { records: Set<string>; numbers: Set<string>; name: string }>();
  for (const [r, idx] of groups) {
    const entry = tie[r];
    const numbers = new Set(
      idx.map((i) => shirtNumber((flat[i] as Flat).line.number)).filter(Boolean),
    );
    for (const n of rosterNumbers(entry ? roster.entries.get(entry) : undefined)) numbers.add(n);
    info.set(r, {
      records: new Set(idx.map((i) => (flat[i] as Flat).sheet.identity)),
      numbers,
      name: printed(r, idx),
    });
  }
  const byRoot = (a: number, b: number) => a - b;
  const tied = [...info.keys()].filter((r) => tie[r] !== null).sort(byRoot);
  const plan: [number, number][] = [];
  for (const b of [...info.keys()].filter((r) => tie[r] === null).sort(byRoot)) {
    const ib = info.get(b) as { records: Set<string>; numbers: Set<string>; name: string };
    const found = tied.filter((a) => {
      const ia = info.get(a) as { records: Set<string>; numbers: Set<string>; name: string };
      if (intersects(ia.records, ib.records)) return false;
      const t = closeTests(ia.name, ib.name);
      if (t.size === 0) return false;
      const close = t.has("i") || t.has("ii") || t.has("iv");
      return intersects(ia.numbers, ib.numbers) || (ib.numbers.size === 0 && close);
    });
    if (found.length === 1) plan.push([b, found[0] as number]);
    else if (found.length > 1) measures.closeAmbiguous++;
  }
  for (const [b, a] of plan) {
    if (merge(a, b)) measures.closeJoined++;
    else measures.closeRefused++;
  }
  if (plan.length > 0) groups = collect();
  const roots = [...groups.keys()];
  return {
    groups: roots.map((r) => groups.get(r) as number[]),
    tie: roots.map((r) => tie[r] ?? null),
  };
}

/**
 * One programme-season's players: the join of 4.2 and the sums of 4.6.
 *
 * `sheets` must be in date order: the labels keep it, for section 3's tie.
 * `scale` gives the two divisors for a sheet.
 */
export function playerSeasons(
  programme: string,
  season: number,
  sheets: readonly Sheet[],
  roster: readonly Player[],
  scale: (sheet: Sheet) => Scale,
  options: JoinOptions = { rosterPass: true },
  measures: JoinMeasures = emptyJoinMeasures(),
  context: SeasonContext = { statsRows: [], nicknameFold: "" },
): PlayerSeason[] {
  const flat: Flat[] = [];
  for (const sheet of sheets) {
    sheet.lines.forEach((line, index) => {
      flat.push({ sheet, index, line });
    });
  }
  const index = rosterIndex(roster);
  const { groups, tie } = join(flat, index, options, measures, context);

  const out: PlayerSeason[] = [];
  groups.forEach((members, gi) => {
    const entries = members.map((i) => flat[i] as Flat);
    const lines = entries.map((e) => e.line);
    const lineName = mostCommon(lines.map((l) => l.name)) as string;
    const entry = tie[gi] ?? null;
    const rosterRow = entry === null ? null : (index.entries.get(entry) ?? null);
    const playerId = mostCommon(lines.flatMap((l) => (l.playerId ? [l.playerId] : [])));
    // [N2d] The roster line's name; else the stats row's, joined by page id,
    // then by the folded name; else the value on the most lines.
    const joinName = rosterRow?.name ? rosterRow.name : lineName;
    const row = rosterRow?.name
      ? null
      : statsRowOf(context.statsRows, playerId, foldName(joinName));
    const [name, nameSource] = rosterRow?.name
      ? [rosterRow.name, "roster" as const]
      : row
        ? [row.name, "stats" as const]
        : [lineName, "lines" as const];
    const p: PlayerSeason = {
      programme,
      season,
      name,
      key: foldName(name),
      lineName,
      nameSource,
      joinKey: foldName(joinName),
      playerId,
      // [M4] The number follows the name: the roster line's number field,
      // trimmed, when IR-22 reads a number in it; else the lines' most common.
      number:
        rosterRow && rosterNumbers(rosterRow).size > 0
          ? (rosterRow.number as string).trim()
          : mostCommon(lines.flatMap((l) => (l.number ? [l.number] : []))),
      // [IR-18] The box-score lines' numbers and the roster line's.
      numbers: new Set([
        ...lines.map((l) => shirtNumber(l.number)).filter(Boolean),
        ...rosterNumbers(rosterRow),
      ]),
      sheets: new Set(entries.map((e) => e.sheet.identity)),
      labels: lines.map((l) => l.position),
      lineCount: lines.length,
      roster: rosterRow,
      rosterEntry: entry,
      doubled: 0,
      minutes: 0,
      matches: 0,
      starts: 0,
      penGoals: 0,
      penAttempts: 0,
      skippedPenGoals: 0,
      skippedPenAttempts: 0,
      G: 0,
      S: 0,
      adjG: 0,
      adjS: 0,
      records: 0,
      everyRecord: { starts: 0, G: 0, S: 0, adjG: 0, adjS: 0 },
    };
    // 4.6, one record at a time.
    const bySheet = new Map<Sheet, Flat[]>();
    for (const e of entries) {
      const list = bySheet.get(e.sheet);
      if (list) list.push(e);
      else bySheet.set(e.sheet, [e]);
    }
    for (const [sheet, mine] of bySheet) {
      if (mine.length > 1) p.doubled++;
      let chosen: SheetLine | null = null;
      for (const { line } of mine) {
        if (line.minutes === null) continue;
        if (chosen === null || line.minutes > (chosen.minutes as number)) chosen = line;
      }
      const indices = new Set(mine.map((e) => e.index));
      let penG = 0;
      let penA = 0;
      for (const c of sheet.credits) {
        if (!indices.has(c.lines[0] as number)) continue;
        penA += 1;
        if (c.goal) penG += 1;
      }
      const k = scale(sheet);
      p.records += 1;
      // [M3] An appearance: a line with minutes above zero in a record that
      // prints minutes for the side, or any line of his in a record that prints
      // none. A doubled line counts once: one per record, as 4.6 takes it.
      const sidePrints = sheet.lines.some((l) => l.minutes !== null);
      if (!sidePrints || (chosen !== null && (chosen.minutes as number) > 0)) p.matches += 1;
      const any = chosen ?? (mine[0] as Flat).line;
      const anyG = Math.max(any.goals - penG, 0);
      const anyS = Math.max(any.shots - penA, 0);
      p.everyRecord.adjG += anyG / k.goals;
      p.everyRecord.adjS += anyS / k.shots;
      p.everyRecord.G += anyG;
      p.everyRecord.S += anyS;
      if (any.started) p.everyRecord.starts += 1;
      if (chosen === null) {
        p.skippedPenGoals += penG;
        p.skippedPenAttempts += penA;
        continue;
      }
      const minutes = chosen.minutes as number;
      const g = Math.max(chosen.goals - penG, 0);
      const s = Math.max(chosen.shots - penA, 0);
      p.adjG += g / k.goals;
      p.adjS += s / k.shots;
      p.G += g;
      p.S += s;
      p.penGoals += penG;
      p.penAttempts += penA;
      p.minutes += minutes;
      if (chosen.started) p.starts += 1;
    }
    out.push(p);
  });
  return out;
}

// ── 4.6, second: the season statistics ─────────────────────────────────────

/** The player's row in the stats file: by page id, else by folded name; null
 *  when neither singles one out. [Ruling S4, reconciliation] "Then by folded
 *  name" applies whenever the page id does not single out one row, two rows
 *  as well as none. Read against the players list, and [N1] the keepers list. */
export function statsRowFor<T extends { name: string; player_id?: string }>(
  p: PlayerSeason,
  rows: readonly T[],
): T | null {
  return statsRowOf(rows, p.playerId, p.joinKey);
}

/** The row with the page id, if exactly one has it; else the row whose
 *  folded name is `key`, if exactly one has it; else null. */
export function statsRowOf<T extends { name: string; player_id?: string }>(
  rows: readonly T[],
  playerId: string | null,
  key: string,
): T | null {
  if (playerId !== null) {
    const byId = rows.filter((r) => r.player_id === playerId);
    if (byId.length === 1) return byId[0] ?? null;
  }
  const byName = rows.filter((r) => foldName(r.name) === key);
  return byName.length === 1 ? (byName[0] ?? null) : null;
}

/**
 * Scale adjG and adjS down where the row shows more penalty goals or attempts
 * than the play-by-play: by max(G − e, 0) / G and max(S − e, 0) / S (zero when
 * G or S is zero). Mutates `p`; returns what it did, or null when nothing.
 *
 * [R-E] The row is compared with EVERY penalty the play-by-play credits to the
 * player that season, on records whose lines print minutes or not. A penalty
 * on a record 4.6 skips was never in G, so counting it as missing from the
 * play-by-play would take it off a second time.
 */
export function applyStatsPenalties(
  p: PlayerSeason,
  row: PlayerStats | null,
): StatsPenaltyChange | null {
  if (row === null) return null;
  const factor = (excess: number, total: number) =>
    total === 0 ? 0 : Math.max(total - excess, 0) / total;
  const foundGoals = p.penGoals + p.skippedPenGoals;
  const foundAttempts = p.penAttempts + p.skippedPenAttempts;
  const eG = row.penalty_goals === undefined ? 0 : row.penalty_goals - foundGoals;
  const eS = row.penalty_attempts === undefined ? 0 : row.penalty_attempts - foundAttempts;
  const goalsFactor = eG > 0 ? factor(eG, p.G) : 1;
  const shotsFactor = eS > 0 ? factor(eS, p.S) : 1;
  if (eG <= 0 && eS <= 0) return null;
  p.adjG *= goalsFactor;
  p.adjS *= shotsFactor;
  return {
    playByPlayGoals: foundGoals,
    statsGoals: row.penalty_goals ?? null,
    playByPlayAttempts: foundAttempts,
    statsAttempts: row.penalty_attempts ?? null,
    skippedGoals: p.skippedPenGoals,
    skippedAttempts: p.skippedPenAttempts,
    goalsFactor,
    shotsFactor,
  };
}

// ── 4.3: split spellings ────────────────────────────────────────────────────

/**
 * [N2b] The unresolved pairs of one programme-season, after the join and
 * N2a: a shirt number in common (leading zeros dropped), names close by (i),
 * (ii) or (iv), and no record in which both have a line. Index pairs into
 * `players`; both halves are incomplete (identity).
 */
export function splitSpellingPairs(players: readonly PlayerSeason[]): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i] as PlayerSeason;
      const b = players[j] as PlayerSeason;
      if (!intersects(a.numbers, b.numbers)) continue;
      if (intersects(a.sheets, b.sheets)) continue;
      if (!isClose(a.name, b.name)) continue;
      pairs.push([i, j]);
    }
  }
  return pairs;
}

// ── 4.4: across seasons ─────────────────────────────────────────────────────

const STEPS: readonly (readonly [number, readonly string[]])[] = [
  [1, ["fr", "freshman", "first year", "1st year", "first", "1st", "fy"]],
  [2, ["so", "soph", "sophomore", "second year", "2nd year", "second", "2nd"]],
  [3, ["jr", "junior", "third year", "3rd year", "third", "3rd"]],
  [4, ["sr", "senior", "fourth year", "4th year", "fourth", "4th"]],
  [
    5,
    [
      "fifth year",
      "5th year",
      "fifth",
      "5th",
      "gr",
      "grad",
      "graduate",
      "graduate student",
      "gs",
      "grad student",
    ],
  ],
  [6, ["sixth year", "6th year", "sixth", "6th"]],
];
const STEP_OF = new Map<string, number>(STEPS.flatMap(([n, forms]) => forms.map((f) => [f, n])));
const REDSHIRT = ["redshirt", "rs", "r"] as const;

/**
 * A class year's step: first year 1, sophomore 2, junior 3, senior 4, fifth
 * year or graduate 5, sixth year 6. Read with full stops dropped and case
 * ignored, word by word from the left; the first year it names is the step
 * [v2.2: a string naming two years takes the first, so "Senior (Fifth Year)"
 * is 4]. A redshirt word is ignored wherever it stands ("Redshirt Freshman",
 * "R-Fr.", "RSo", "Freshman (Redshirt)"). Null for a string that names no
 * year, which never contradicts.
 */
export function classStep(year: string | undefined): number | null {
  const words = (year ?? "")
    .toLowerCase()
    .replaceAll(".", "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    const two = i + 1 < words.length ? STEP_OF.get(`${words[i]} ${words[i + 1]}`) : undefined;
    if (two !== undefined) return two;
    const w = words[i] as string;
    const one = STEP_OF.get(w);
    if (one !== undefined) return one;
    // A redshirt prefix run into the year: "rso", "rfr", "redshirtfreshman".
    for (const prefix of REDSHIRT) {
      if (w.length <= prefix.length || !w.startsWith(prefix)) continue;
      const step = STEP_OF.get(w.slice(prefix.length));
      if (step !== undefined) return step;
    }
  }
  return null;
}

/** Whether two roster lines contradict a link: the class year falls by two
 *  or more steps. [N2c] A home town is evidence for a link, never against. */
export function contradicts(earlier: Player | null, later: Player | null): boolean {
  if (!earlier || !later) return false;
  const ra = classStep(earlier.class_year);
  const rb = classStep(later.class_year);
  return ra !== null && rb !== null && rb <= ra - 2;
}

/** The player at the season before with the same key; when several have it,
 *  the only one who shares a shirt number with him [IR-18: the numbers on his
 *  box-score lines and on his roster line]; else null. */
export function sameName(
  current: PlayerSeason,
  earlier: readonly PlayerSeason[],
): PlayerSeason | null {
  const byKey = earlier.filter((p) => p.key === current.key);
  if (byKey.length <= 1) return byKey[0] ?? null;
  const byNumber = byKey.filter((p) => intersects(p.numbers, current.numbers));
  return byNumber.length === 1 ? (byNumber[0] ?? null) : null;
}

/**
 * [N2c] When no player at the season before has his key: the only player
 * there, at the programme, who (1) is not the same-key link of a player this
 * season (he does not continue under his own name; `keyLinked`), (2) shares a
 * shirt number with him (IR-18: lines and roster line), (3) is close by (i),
 * (ii) or (v), and (4) is not refused by the class-year rule; else null. A
 * home town is neither evidence for a link nor against one.
 */
export function closeLink(
  current: PlayerSeason,
  earlier: readonly PlayerSeason[],
  keyLinked: ReadonlySet<PlayerSeason> = new Set(),
): PlayerSeason | null {
  const found = earlier.filter((p) => {
    if (keyLinked.has(p) || !intersects(p.numbers, current.numbers)) return false;
    const t = closeTests(p.name, current.name);
    if (!t.has("i") && !t.has("ii") && !t.has("v")) return false;
    return !contradicts(p.roster, current.roster);
  });
  return found.length === 1 ? (found[0] ?? null) : null;
}
