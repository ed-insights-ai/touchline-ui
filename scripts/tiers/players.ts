// ALGORITHM.md section 4 (version 2.2): a player-season.
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

import type { Player, PlayerRefSource, PlayerStats } from "../../src/lib/model.ts";
import { foldLetters, foldName, foldSurname, shirtNumber } from "../../src/lib/tiers.ts";
import type { Venue } from "./opponents.ts";
import { givenInitial } from "./penalties.ts";

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
  /** 4.5: the name, number and page id the entry prints, and the key. */
  name: string;
  key: string;
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
  matches: number;
  starts: number;
  /** Penalty goals and attempts found in the play-by-play, over the lines
   *  that count (4.6). */
  penGoals: number;
  penAttempts: number;
  /** Penalty goals and attempts the play-by-play credits to the player on
   *  records where none of his lines prints minutes: skipped by 4.6, so not
   *  "found above" when the stats file is compared. Measured, never used. */
  skippedPenGoals: number;
  skippedPenAttempts: number;
  /** Σ g and Σ s over the season, before the opponent adjustment. */
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
    const tiedTo = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const t = tie[find(i)];
      if (t && !tiedTo.has(t)) tiedTo.set(t, find(i));
    }
    flat.forEach(({ line }, i) => {
      if (line.ref && line.ref.source !== "key") return;
      const found = rosterLookup(roster, line.name, line.number);
      if (found === null) return;
      measures.rosterFound++;
      const r = find(i);
      if (tie[r] === found) return;
      if (tie[r] !== null) {
        measures.rosterConflicts++;
        return;
      }
      const held = tiedTo.get(found);
      if (held === undefined) {
        tie[r] = found;
        tiedTo.set(found, r);
      } else if (merge(i, held)) {
        tiedTo.set(found, find(i));
      } else {
        measures.blocked++;
      }
    });
  }
  pass(({ line }) => foldName(line.name) || null);

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const g = groups.get(r);
    if (g) g.push(i);
    else groups.set(r, [i]);
  }
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
  measures: JoinMeasures = { blocked: 0, rosterFound: 0, rosterConflicts: 0 },
): PlayerSeason[] {
  const flat: Flat[] = [];
  for (const sheet of sheets) {
    sheet.lines.forEach((line, index) => {
      flat.push({ sheet, index, line });
    });
  }
  const index = rosterIndex(roster);
  const { groups, tie } = join(flat, index, options, measures);

  const out: PlayerSeason[] = [];
  groups.forEach((members, gi) => {
    const entries = members.map((i) => flat[i] as Flat);
    const lines = entries.map((e) => e.line);
    const name = mostCommon(lines.map((l) => l.name)) as string;
    const entry = tie[gi] ?? null;
    const p: PlayerSeason = {
      programme,
      season,
      name,
      key: foldName(name),
      playerId: mostCommon(lines.flatMap((l) => (l.playerId ? [l.playerId] : []))),
      number: mostCommon(lines.flatMap((l) => (l.number ? [l.number] : []))),
      numbers: new Set(lines.map((l) => shirtNumber(l.number)).filter(Boolean)),
      sheets: new Set(entries.map((e) => e.sheet.identity)),
      labels: lines.map((l) => l.position),
      lineCount: lines.length,
      roster: entry === null ? null : (index.entries.get(entry) ?? null),
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
      if (chosen === null) {
        p.skippedPenGoals += penG;
        p.skippedPenAttempts += penA;
        continue;
      }
      const minutes = chosen.minutes as number;
      const g = Math.max(chosen.goals - penG, 0);
      const s = Math.max(chosen.shots - penA, 0);
      const k = scale(sheet);
      p.adjG += g / k.goals;
      p.adjS += s / k.shots;
      p.G += g;
      p.S += s;
      p.penGoals += penG;
      p.penAttempts += penA;
      p.minutes += minutes;
      if (minutes > 0) p.matches += 1;
      if (chosen.started) p.starts += 1;
    }
    out.push(p);
  });
  return out;
}

// ── 4.6, second: the season statistics ─────────────────────────────────────

/** The player's row in the stats file: by page id, else by folded name; null
 *  when neither singles one out. */
export function statsRowFor(p: PlayerSeason, rows: readonly PlayerStats[]): PlayerStats | null {
  if (p.playerId !== null) {
    const byId = rows.filter((r) => r.player_id === p.playerId);
    if (byId.length === 1) return byId[0] ?? null;
    if (byId.length > 1) return null;
  }
  const byName = rows.filter((r) => foldName(r.name) === p.key);
  return byName.length === 1 ? (byName[0] ?? null) : null;
}

/**
 * Scale adjG and adjS down where the row shows more penalty goals or attempts
 * than the play-by-play: by max(G − e, 0) / G and max(S − e, 0) / S (zero when
 * G or S is zero). Mutates `p`; returns what it did, or null when nothing.
 */
export function applyStatsPenalties(
  p: PlayerSeason,
  row: PlayerStats | null,
): StatsPenaltyChange | null {
  if (row === null) return null;
  const factor = (excess: number, total: number) =>
    total === 0 ? 0 : Math.max(total - excess, 0) / total;
  const eG = row.penalty_goals === undefined ? 0 : row.penalty_goals - p.penGoals;
  const eS = row.penalty_attempts === undefined ? 0 : row.penalty_attempts - p.penAttempts;
  const goalsFactor = eG > 0 ? factor(eG, p.G) : 1;
  const shotsFactor = eS > 0 ? factor(eS, p.S) : 1;
  if (eG <= 0 && eS <= 0) return null;
  p.adjG *= goalsFactor;
  p.adjS *= shotsFactor;
  return {
    playByPlayGoals: p.penGoals,
    statsGoals: row.penalty_goals ?? null,
    playByPlayAttempts: p.penAttempts,
    statsAttempts: row.penalty_attempts ?? null,
    skippedGoals: p.skippedPenGoals,
    skippedAttempts: p.skippedPenAttempts,
    goalsFactor,
    shotsFactor,
  };
}

// ── 4.3: split spellings ────────────────────────────────────────────────────

const intersects = <T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean => {
  for (const x of a) if (b.has(x)) return true;
  return false;
};

/**
 * The unresolved pairs of one programme-season, after the join: a shirt
 * number in common (leading zeros dropped), the same folded surname, the same
 * first letter of the folded given name, and no record in which both have a
 * line. Index pairs into `players`; both halves are incomplete (identity).
 */
export function splitSpellingPairs(players: readonly PlayerSeason[]): [number, number][] {
  const parts = players.map((p) => ({
    surname: foldSurname(p.name),
    initial: givenInitial(p.name),
  }));
  const pairs: [number, number][] = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i] as PlayerSeason;
      const b = players[j] as PlayerSeason;
      const pa = parts[i] as { surname: string; initial: string };
      const pb = parts[j] as { surname: string; initial: string };
      if (!pa.surname || pa.surname !== pb.surname) continue;
      if (!pa.initial || pa.initial !== pb.initial) continue;
      if (!intersects(a.numbers, b.numbers)) continue;
      if (intersects(a.sheets, b.sheets)) continue;
      pairs.push([i, j]);
    }
  }
  return pairs;
}

// ── 4.4: across seasons ─────────────────────────────────────────────────────

/** [v2.2] Whether two home towns clearly differ: fold each whole town and
 *  its first word by steps 2 to 4 of 4.1; they differ only when the first
 *  words differ and neither whole fold begins with the other. An empty
 *  whole fold never contradicts. The town is read here and nowhere else, and
 *  never stored. */
export function townsDiffer(earlier: string | undefined, later: string | undefined): boolean {
  const whole = (t: string | undefined) => foldLetters(t ?? "");
  const first = (t: string | undefined) => foldLetters((t ?? "").trim().split(/\s+/)[0] ?? "");
  const a = whole(earlier);
  const b = whole(later);
  if (a === "" || b === "") return false;
  if (first(earlier) === first(later)) return false;
  return !a.startsWith(b) && !b.startsWith(a);
}

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

/** Whether two roster lines contradict a same-key link: the home towns
 *  clearly differ (townsDiffer), or the class year falls by two or more
 *  steps. */
export function contradicts(earlier: Player | null, later: Player | null): boolean {
  if (!earlier || !later) return false;
  if (townsDiffer(earlier.hometown, later.hometown)) return true;
  const ra = classStep(earlier.class_year);
  const rb = classStep(later.class_year);
  return ra !== null && rb !== null && rb <= ra - 2;
}

/** The player at the season before with the same key; when several have it,
 *  the one with the same shirt number (leading zeros dropped); else null. */
export function sameName(
  current: PlayerSeason,
  earlier: readonly PlayerSeason[],
): PlayerSeason | null {
  const byKey = earlier.filter((p) => p.key === current.key);
  if (byKey.length <= 1) return byKey[0] ?? null;
  const shirt = shirtNumber(current.number);
  if (!shirt) return null;
  const byNumber = byKey.filter((p) => shirtNumber(p.number) === shirt);
  return byNumber.length === 1 ? (byNumber[0] ?? null) : null;
}
