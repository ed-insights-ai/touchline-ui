// ALGORITHM.md section 4: a player-season, with penalties stripped.
//
// A player-season is one person at one programme in one season. Inside a
// season a person's box-score lines are joined by the collector's
// `player_ref`, then the page `player_id`, then the folded name: every line
// is linked to every other line that shares any of the three, so a player
// whose own page links a bio and whose opponents' pages do not is one person,
// not two. Ids from `player_ref` routes that name a page (page, twin, roster)
// share one namespace with `player_id`, because the collector's contract says
// they are the same Sidearm id; the synthetic `key` route's ids are their own.

import type { Player, PlayerRefSource } from "../../src/lib/model.ts";
import { playerIdOf } from "../../src/lib/player.ts";
import { tenureOf } from "../../src/lib/tenure.ts";
import { foldKey } from "../../src/lib/tiers.ts";
import type { Venue } from "./opponents.ts";

/** One box-score line, as the build reads it. */
export interface SheetLine {
  name: string;
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
  /** From the play-by-play (penalties.ts). */
  penGoals: number;
  penAttempts: number;
}

/** One programme's side of one physical match. */
export interface Sheet {
  identity: string;
  date: string;
  opponent: string;
  venue: Venue;
  lines: SheetLine[];
}

export interface PlayerSeason {
  programme: string;
  season: number;
  /** The printed name the entry carries, and its fold. */
  name: string;
  key: string;
  playerId: string | null;
  number: string | null;
  /** Every fold, page id, number and match the joined lines carry. */
  keys: Set<string>;
  ids: Set<string>;
  numbers: Set<string>;
  sheets: Set<string>;
  /** Every line's position label, in match order. */
  labels: (string | null)[];
  lineCount: number;
  /** True when any of the person's lines prints minutes. */
  printedMinutes: boolean;
  minutes: number;
  matches: number;
  starts: number;
  /** Over every line, for the penalty check (not only the lines with minutes). */
  penGoals: number;
  penAttempts: number;
  adjG: number;
  adjS: number;
}

/** The two divisors a sheet's goals and shots are adjusted by:
 *  dfn[opponent] × h, from the goals model and the shots model. */
export interface Scale {
  goals: number;
  shots: number;
}

const PAGE_ROUTES: ReadonlySet<PlayerRefSource> = new Set(["page", "twin", "roster"]);

/** The most common value; a tie goes to the first in code-unit order. */
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

/** The join keys of one line. */
export function joinKeys(line: SheetLine): string[] {
  const keys: string[] = [];
  if (line.ref) keys.push(line.ref.source === "key" ? `ref:${line.ref.id}` : `id:${line.ref.id}`);
  if (line.playerId) keys.push(`id:${line.playerId}`);
  const k = foldKey(line.name);
  if (k) keys.push(`name:${k}`);
  return keys;
}

/** The page ids a line carries. */
function pageIds(line: SheetLine): string[] {
  const out: string[] = [];
  if (line.playerId) out.push(line.playerId);
  if (line.ref && PAGE_ROUTES.has(line.ref.source)) out.push(line.ref.id);
  return out;
}

/**
 * Join one programme-season's lines into player-seasons and total them.
 *
 * `scale` gives the two divisors for a sheet. Only lines that print minutes
 * count toward minutes, appearances, starts and the adjusted goals and shots;
 * every line counts toward who the person is.
 */
export function playerSeasons(
  programme: string,
  season: number,
  sheets: readonly Sheet[],
  scale: (sheet: Sheet) => Scale,
): PlayerSeason[] {
  const flat: { sheet: Sheet; line: SheetLine }[] = [];
  for (const sheet of sheets) for (const line of sheet.lines) flat.push({ sheet, line });

  const parent = flat.map((_, i) => i);
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
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  const seen = new Map<string, number>();
  flat.forEach(({ line }, i) => {
    for (const key of joinKeys(line)) {
      const at = seen.get(key);
      if (at === undefined) seen.set(key, i);
      else union(i, at);
    }
  });

  const groups = new Map<number, number[]>();
  flat.forEach((_, i) => {
    const r = find(i);
    const g = groups.get(r);
    if (g) g.push(i);
    else groups.set(r, [i]);
  });

  const out: PlayerSeason[] = [];
  for (const members of groups.values()) {
    const entries = members.map((i) => flat[i] as { sheet: Sheet; line: SheetLine });
    const lines = entries.map((e) => e.line);
    const ownPage = lines.filter((l) => l.playerId !== null).map((l) => l.name);
    const name = (mostCommon(ownPage) ?? mostCommon(lines.map((l) => l.name))) as string;
    const p: PlayerSeason = {
      programme,
      season,
      name,
      key: foldKey(name),
      playerId: mostCommon(lines.flatMap(pageIds)),
      number: mostCommon(lines.flatMap((l) => (l.number ? [l.number] : []))),
      keys: new Set(lines.map((l) => foldKey(l.name)).filter(Boolean)),
      ids: new Set(lines.flatMap(pageIds)),
      numbers: new Set(lines.flatMap((l) => (l.number ? [l.number] : []))),
      sheets: new Set(entries.map((e) => e.sheet.identity)),
      labels: lines.map((l) => l.position),
      lineCount: lines.length,
      printedMinutes: lines.some((l) => l.minutes !== null),
      minutes: 0,
      matches: 0,
      starts: 0,
      penGoals: 0,
      penAttempts: 0,
      adjG: 0,
      adjS: 0,
    };
    for (const { sheet, line } of entries) {
      p.penGoals += line.penGoals;
      p.penAttempts += line.penAttempts;
      if (line.minutes === null) continue;
      const s = scale(sheet);
      const g = Math.max(line.goals - line.penGoals, 0);
      const sh = Math.max(line.shots - line.penAttempts, 0);
      p.adjG += g / s.goals;
      p.adjS += sh / s.shots;
      p.minutes += line.minutes;
      if (line.minutes > 0) p.matches += 1;
      if (line.started) p.starts += 1;
    }
    out.push(p);
  }
  return out;
}

// ── Split spellings ─────────────────────────────────────────────────────────

/** First initial and surname of a printed name, folded: "Laws, Rhys" and
 *  "Rhys Laws" both give { initial: "r", surname: "laws" }. The surname is the
 *  last word (or the part before a comma); null for a one-word name. */
export function nameParts(name: string): { initial: string; surname: string } | null {
  const trimmed = name.trim();
  let first: string;
  let last: string;
  const comma = trimmed.indexOf(",");
  if (comma >= 0) {
    last = trimmed.slice(0, comma);
    first =
      trimmed
        .slice(comma + 1)
        .trim()
        .split(/\s+/)[0] ?? "";
  } else {
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length < 2) return null;
    first = words[0] as string;
    last = words[words.length - 1] as string;
  }
  const initial = foldKey(first).slice(0, 1);
  const surname = foldKey(last);
  return initial && surname ? { initial, surname } : null;
}

const intersects = <T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean => {
  for (const x of a) if (b.has(x)) return true;
  return false;
};

/**
 * The unresolved pairs of one programme-season: two folded names that share a
 * shirt number, a surname and a first initial, and never appear on the same
 * team sheet. Returned as index pairs into `players`; both halves of a pair
 * are incomplete (reason identity) and are not merged.
 */
export function splitSpellingPairs(players: readonly PlayerSeason[]): [number, number][] {
  const parts = players.map((p) => nameParts(p.name));
  const pairs: [number, number][] = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i] as PlayerSeason;
      const b = players[j] as PlayerSeason;
      const pa = parts[i];
      const pb = parts[j];
      if (!pa || !pb || a.key === b.key) continue;
      if (pa.surname !== pb.surname || pa.initial !== pb.initial) continue;
      if (!intersects(a.numbers, b.numbers)) continue;
      if (intersects(a.sheets, b.sheets)) continue;
      pairs.push([i, j]);
    }
  }
  return pairs;
}

// ── The roster entry ────────────────────────────────────────────────────────

function settleByNumber(candidates: readonly Player[], p: PlayerSeason): Player | null {
  if (candidates.length === 1) return candidates[0] ?? null;
  const byNumber = candidates.filter((r) => r.number !== undefined && p.numbers.has(r.number));
  return byNumber.length === 1 ? (byNumber[0] ?? null) : null;
}

/** The player-season's entry on its programme's roster for the season: by page
 *  id, else by folded name (the entry's own key first), with the shirt number
 *  settling a tie. Null when nothing matches or a tie stays unsettled. */
export function rosterEntryFor(p: PlayerSeason, roster: readonly Player[]): Player | null {
  const byId = roster.filter((r) => {
    const id = playerIdOf(r);
    return id !== null && p.ids.has(id);
  });
  if (byId.length > 0) return settleByNumber(byId, p);
  for (const key of [p.key, ...[...p.keys].filter((k) => k !== p.key).sort()]) {
    const byName = roster.filter((r) => foldKey(r.name) === key);
    if (byName.length > 0) return settleByNumber(byName, p);
  }
  return null;
}

// ── Across seasons at one programme ─────────────────────────────────────────

const STEP_RANK: Readonly<Record<string, number>> = { FR: 1, SO: 2, JR: 3, SR: 4, "5Y": 5 };

/** Whether two rosters contradict a same-name link: both list a home town and
 *  the towns differ (compared by the fold), or the class year goes backwards
 *  (read on the site's tenure ladder; a year it does not place contradicts
 *  nothing). The home town is read here and nowhere else, and never stored. */
export function contradicts(earlier: Player | null, later: Player | null): boolean {
  if (!earlier || !later) return false;
  const a = earlier.hometown?.trim();
  const b = later.hometown?.trim();
  if (a && b && foldKey(a) !== foldKey(b)) return true;
  const ra = STEP_RANK[tenureOf(earlier.class_year).step ?? ""];
  const rb = STEP_RANK[tenureOf(later.class_year).step ?? ""];
  return ra !== undefined && rb !== undefined && rb < ra;
}

/** The same folded name at the same programme the season before, if exactly
 *  one player-season there carries it (a shared shirt number settles two). */
export function sameName(
  current: PlayerSeason,
  earlier: readonly PlayerSeason[],
): PlayerSeason | null {
  const byKey = earlier.filter((p) => p.key === current.key);
  if (byKey.length <= 1) return byKey[0] ?? null;
  const byNumber = byKey.filter((p) => intersects(p.numbers, current.numbers));
  return byNumber.length === 1 ? (byNumber[0] ?? null) : null;
}
