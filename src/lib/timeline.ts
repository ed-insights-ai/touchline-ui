/**
 * The match strip: the game in a single glance, built from the play-by-play.
 *
 * The design system's sixth rule is "the timeline is the match", and this
 * module is where that rule is arithmetic rather than styling. Every mark on
 * the strip is one published play; every count the strip shows is a sum over
 * the play list; and a play the strip cannot place honestly — no published
 * clock, or no attributed side — is counted in a named note instead of being
 * guessed onto a minute. Nothing here re-orders or interprets the account:
 * document order is preserved inside a stack, and the published sentence
 * travels with every mark verbatim.
 *
 * THE MARK GRAMMAR (tui-641 — weight follows importance; one loud thing):
 *   goal    the only labeled mark: running score + scorer + minute
 *   shot    an unscored shot — including a missed or saved penalty
 *   corner  a corner kick
 *   foul / offside   the smallest marks
 *   card / red       the pip encoding shared with the cautions panel (tui-o4k)
 *   sub / roster     roster changes, not match action: substitutions, keeper
 *                    changes and lineup entries are OFF the strip by default,
 *                    behind one labeled toggle. The toggle's count is the
 *                    substitution count — the number the contract names.
 *
 * Ninety minutes are drawn to scale and a mark's position is its minute, so
 * two marks that share a drawn minute stack outward from their own lane —
 * home above the axis, away below — using the same grouping the single-band
 * timeline shipped with: a mark moved to make room is a mark drawn at the
 * wrong time.
 */

import { matchMinute } from "./format.ts";
import type { MatchDetail, MatchPlay } from "./model.ts";
import { goalScorer, type NameIndex, playerIndex } from "./plays.ts";

const EN = "–";
const MID = "·";

/** Marks the strip can draw. "roster" is a keeper change or a lineup entry —
 *  the same off-by-default layer substitutions live on. */
export type MarkKind =
  | "goal"
  | "shot"
  | "corner"
  | "foul"
  | "offside"
  | "card"
  | "red"
  | "sub"
  | "roster";

/** The kinds that are match action — on the strip by default. */
const ACTION: readonly MarkKind[] = ["goal", "shot", "corner", "foul", "offside", "card", "red"];

export interface StripMark {
  kind: MarkKind;
  /** Minute as drawn, rounded up from the published clock. Never null: a
   *  clock-less play becomes a note entry, not a mark. */
  minute: number;
  /** The clock as published, for the selected-event row. */
  clock: string;
  home: boolean;
  /** The side's abbreviation as the box score served it. */
  team: string | null;
  /** The published line, verbatim — what hover and selection show. */
  raw: string;
  /** Goals only: "1–0 · Ludwig · 65′", home side first. Null for every other
   *  kind — the goal is the only labeled mark. */
  label: string | null;
}

/** Marks sharing a lane and a drawn minute, piled outward from the axis. */
export interface LaneStack {
  minute: number;
  /** Percent along the band. */
  x: number;
  /** Nearest the axis first: the goal holds the axis, action piles over it,
   *  roster changes outermost so hiding them never moves a match action. */
  marks: StripMark[];
}

export interface GoalLabel {
  x: number;
  text: string;
  home: boolean;
  /** Which of the two stagger rows the label sits on, per lane. */
  tier: "a" | "b";
  /** Anchored inward at the ends so nothing hangs off the band. */
  align: "start" | "mid" | "end";
}

/** One line of the named note under the strip: plays that exist in the
 *  account but cannot sit on a timeline. The reason is named, never fixed. */
export interface StripNote {
  kind: MarkKind;
  count: number;
  reason: "no published clock" | "no attributed side";
}

export interface LanePair {
  home: number;
  away: number;
}

export interface MatchStrip {
  home: LaneStack[];
  away: LaneStack[];
  /** Goal hairlines and their labels, in document order. */
  goals: GoalLabel[];
  /** Plays counted, not drawn — see StripNote. */
  notes: StripNote[];
  /** Substitution plays behind the toggle — the count the toggle carries. */
  subCount: number;
  /** Keeper changes and lineup entries, also behind the toggle. */
  rosterCount: number;
  /** Marks on the default strip: the match actions. */
  actionCount: number;
  /** Headroom per lane with the toggle closed / open. */
  tallest: LanePair;
  tallestAll: LanePair;
  /** The clock the band is drawn against — ninety, or later if it ran on. */
  fullTime: number;
}

/** Which mark a play draws as, or null for the plays that are structure
 *  (period boundaries) or prose the collector did not type. A play carrying
 *  a score array is a goal whatever its type says — two of the four penalty
 *  plays in the 2026 data are misses, and a miss is a shot. */
export function markKindOf(play: MatchPlay): MarkKind | null {
  if (play.score) return "goal";
  switch (play.type) {
    case "shot":
    case "penalty":
      return "shot";
    case "corner":
      return "corner";
    case "foul":
      return "foul";
    case "offside":
      return "offside";
    case "yellow":
      return "card";
    case "red":
      return "red";
    case "sub":
      return "sub";
    case "goalie":
    case "lineup":
      return "roster";
    default:
      return null;
  }
}

/** "Jonas Ludwig" → "Ludwig" — the strip label has room for one name. */
const surname = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(" ") : name;
};

const NEAR_AXIS: Record<MarkKind, number> = {
  goal: 0,
  shot: 1,
  corner: 1,
  foul: 1,
  offside: 1,
  card: 1,
  red: 1,
  sub: 2,
  roster: 2,
};

/** Marks piled per (lane, drawn minute), document order kept inside a rank. */
function stacksOf(marks: StripMark[], at: (minute: number) => number): LaneStack[] {
  const byMinute = new Map<number, StripMark[]>();
  for (const m of marks) {
    const pile = byMinute.get(m.minute);
    if (pile) pile.push(m);
    else byMinute.set(m.minute, [m]);
  }
  return [...byMinute.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([minute, pile]) => ({
      minute,
      x: at(minute),
      marks: pile
        .map((m, i) => ({ m, i }))
        .sort((a, b) => NEAR_AXIS[a.m.kind] - NEAR_AXIS[b.m.kind] || a.i - b.i)
        .map(({ m }) => m),
    }));
}

const tallestOf = (stacks: LaneStack[], all: boolean): number =>
  Math.max(1, ...stacks.map((s) => s.marks.filter((m) => all || ACTION.includes(m.kind)).length));

/**
 * The strip, from a match's published play-by-play.
 *
 * `homeIndex` is required: without knowing which served side is home there is
 * no honest way to hand a lane to a mark, and the page does not render a
 * timeline for such a match at all.
 */
export function matchStrip(detail: MatchDetail, homeIndex: number): MatchStrip {
  const plays = detail.plays ?? [];
  const index: NameIndex = playerIndex(detail);
  const abbrOf = (team: number | undefined): string | null => {
    if (team === undefined) return null;
    const t = detail.teams[team];
    return t?.abbr ?? t?.name ?? null;
  };

  // First pass: classify, so the clock the band is drawn against is known
  // before any x is computed. Period boundaries stretch it too — a match that
  // ran to 110′ has its "End of period [110:00]" say so.
  interface Placed {
    kind: MarkKind;
    play: MatchPlay;
    minute: number;
    home: boolean;
  }
  const placed: Placed[] = [];
  const notes = new Map<string, StripNote>();
  const note = (kind: MarkKind, reason: StripNote["reason"]): void => {
    const key = `${kind}|${reason}`;
    const open = notes.get(key);
    if (open) open.count++;
    else notes.set(key, { kind, count: 1, reason });
  };

  let clockCeiling = 90;
  let running: [number, number] = [0, 0];
  const runningAt = new Map<MatchPlay, string>();

  for (const play of plays) {
    if (play.score) {
      running = [play.score[0], play.score[1]];
      runningAt.set(play, `${running[homeIndex]}${EN}${running[1 - homeIndex]}`);
    }
    const minute = matchMinute(play.clock?.trim() || undefined);
    if (play.type === "period") {
      if (minute !== null) clockCeiling = Math.max(clockCeiling, minute);
      continue;
    }
    const kind = markKindOf(play);
    if (kind === null) continue;
    // The honesty rules: a play with no published clock cannot sit on a
    // timeline, and a play with no attributed side has no lane. Both are
    // counted in the named note under the strip — never guessed.
    if (minute === null) {
      note(kind, "no published clock");
      continue;
    }
    if (play.team === undefined) {
      note(kind, "no attributed side");
      continue;
    }
    clockCeiling = Math.max(clockCeiling, minute);
    placed.push({ kind, play, minute, home: play.team === homeIndex });
  }

  const fullTime = clockCeiling;
  const at = (minute: number): number => Math.min(100, Math.max(0, (minute / fullTime) * 100));

  const marks: StripMark[] = placed.map(({ kind, play, minute, home }) => ({
    kind,
    minute,
    clock: play.clock?.trim() ?? "",
    home,
    team: abbrOf(play.team),
    raw: play.text,
    label:
      kind === "goal"
        ? [
            runningAt.get(play),
            surname(
              goalScorer(
                play,
                play.team === undefined ? undefined : detail.teams[play.team],
                index,
              ),
            ),
            `${minute}′`,
          ]
            .filter(Boolean)
            .join(` ${MID} `)
        : null,
  }));

  const home = stacksOf(
    marks.filter((m) => m.home),
    at,
  );
  const away = stacksOf(
    marks.filter((m) => !m.home),
    at,
  );

  // Goal labels stagger between two rows per lane, so two goals four minutes
  // apart do not print over each other; at the ends they anchor inward.
  const tiers: LanePair = { home: 0, away: 0 };
  const goals: GoalLabel[] = marks
    .filter((m) => m.kind === "goal")
    .map((m) => {
      const lane = m.home ? "home" : "away";
      const x = at(m.minute);
      return {
        x,
        text: m.label ?? `${m.minute}′`,
        home: m.home,
        tier: tiers[lane]++ % 2 === 1 ? "b" : "a",
        align: x > 88 ? "end" : x < 12 ? "start" : "mid",
      } as GoalLabel;
    });

  const count = (kinds: readonly MarkKind[]): number =>
    marks.filter((m) => kinds.includes(m.kind)).length;

  return {
    home,
    away,
    goals,
    notes: [...notes.values()],
    // The toggle carries the substitution count — every substitution play,
    // drawn or noted, because the label is a claim about the play list.
    subCount: plays.filter((p) => markKindOf(p) === "sub").length,
    rosterCount: plays.filter((p) => markKindOf(p) === "roster").length,
    actionCount: count(ACTION),
    tallest: { home: tallestOf(home, false), away: tallestOf(away, false) },
    tallestAll: { home: tallestOf(home, true), away: tallestOf(away, true) },
    fullTime,
  };
}

/**
 * The fallback for a box score that published no play-by-play: the strip is
 * drawn from the scoring summary and the cautions list instead, and every
 * count is a sum over those arrays. The 2026 collect has no such match, but
 * a reader is not the collector's keeper.
 */
export function summaryStrip(detail: MatchDetail, homeIndex: number): MatchStrip {
  const scoring = detail.scoring ?? [];
  const cards = detail.cards ?? [];
  const abbrOf = (team: number | undefined): string | null => {
    if (team === undefined) return null;
    const t = detail.teams[team];
    return t?.abbr ?? t?.name ?? null;
  };

  const notes = new Map<string, StripNote>();
  const note = (kind: MarkKind, reason: StripNote["reason"]): void => {
    const key = `${kind}|${reason}`;
    const open = notes.get(key);
    if (open) open.count++;
    else notes.set(key, { kind, count: 1, reason });
  };

  interface Seed {
    kind: MarkKind;
    minute: number;
    clock: string;
    home: boolean;
    team: string | null;
    raw: string;
    scorer?: string;
  }
  const seeds: Seed[] = [];
  const run: [number, number] = [0, 0];
  const runs: string[] = [];
  for (const g of scoring) {
    if (g.team === 0 || g.team === 1) run[g.team]++;
    runs.push(`${run[homeIndex]}${EN}${run[1 - homeIndex]}`);
  }
  scoring.forEach((g, i): void => {
    const minute = matchMinute(g.time);
    if (minute === null) {
      note("goal", "no published clock");
      return;
    }
    if (g.team === undefined) {
      note("goal", "no attributed side");
      return;
    }
    seeds.push({
      kind: "goal",
      minute,
      clock: g.time ?? "",
      home: g.team === homeIndex,
      team: abbrOf(g.team),
      raw: g.description ?? `${g.scorer}${g.assist ? ` (${g.assist})` : ""}`,
      scorer: `${runs[i]} ${MID} ${surname(g.scorer)} ${MID} ${minute}′`,
    });
  });
  for (const c of cards) {
    const kind: MarkKind = c.type === "red" ? "red" : "card";
    const minute = matchMinute(c.time);
    if (minute === null) {
      note(kind, "no published clock");
      continue;
    }
    if (c.team === undefined) {
      note(kind, "no attributed side");
      continue;
    }
    seeds.push({
      kind,
      minute,
      clock: c.time ?? "",
      home: c.team === homeIndex,
      team: abbrOf(c.team),
      raw: `${c.type === "red" ? "Red" : "Yellow"} card on ${c.player}`,
    });
  }

  const fullTime = Math.max(90, ...seeds.map((s) => s.minute));
  const at = (minute: number): number => Math.min(100, Math.max(0, (minute / fullTime) * 100));
  const marks: StripMark[] = seeds.map((s) => ({
    kind: s.kind,
    minute: s.minute,
    clock: s.clock,
    home: s.home,
    team: s.team,
    raw: s.raw,
    label: s.kind === "goal" ? (s.scorer ?? null) : null,
  }));

  const home = stacksOf(
    marks.filter((m) => m.home),
    at,
  );
  const away = stacksOf(
    marks.filter((m) => !m.home),
    at,
  );
  const tiers: LanePair = { home: 0, away: 0 };
  const goals: GoalLabel[] = marks
    .filter((m) => m.kind === "goal")
    .map((m) => {
      const lane = m.home ? "home" : "away";
      const x = at(m.minute);
      return {
        x,
        text: m.label ?? `${m.minute}′`,
        home: m.home,
        tier: tiers[lane]++ % 2 === 1 ? "b" : "a",
        align: x > 88 ? "end" : x < 12 ? "start" : "mid",
      } as GoalLabel;
    });

  return {
    home,
    away,
    goals,
    notes: [...notes.values()],
    subCount: 0,
    rosterCount: 0,
    actionCount: marks.length,
    tallest: { home: tallestOf(home, false), away: tallestOf(away, false) },
    tallestAll: { home: tallestOf(home, true), away: tallestOf(away, true) },
    fullTime,
  };
}

/** The strip for a match: from the play-by-play when one was published, from
 *  the scoring and cautions summaries when not. */
export function stripOf(detail: MatchDetail, homeIndex: number): MatchStrip {
  return (detail.plays ?? []).length > 0
    ? matchStrip(detail, homeIndex)
    : summaryStrip(detail, homeIndex);
}

/** Marks per kind across both lanes — what the tests hold against the play
 *  list's own sums. */
export function stripCounts(strip: MatchStrip): Partial<Record<MarkKind, number>> {
  const counts: Partial<Record<MarkKind, number>> = {};
  for (const lane of [strip.home, strip.away]) {
    for (const stack of lane) {
      for (const m of stack.marks) counts[m.kind] = (counts[m.kind] ?? 0) + 1;
    }
  }
  return counts;
}
