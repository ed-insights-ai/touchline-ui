// The squad as tenure: who is back, how long they have been here, and how much
// of last season's football walked out of the door with the players who left.
//
// The team page used to print this as one number — "19 + 11" — which says how
// many came back and nothing about who they were. A squad that returns its
// eleven starters and a squad that returns eleven freshmen print the same
// figure. So the shape is drawn instead: one square per player, inked by how
// long they have been on this roster, returners on one side of a rule and
// newcomers on the other.
//
// Two rules hold it honest:
//   • A square is only ever as dark as the roster says. A class year the
//     programme never published draws hollow — never a guessed step, and never
//     quietly dropped, because a missing class year is a fact about the
//     collection and not about the player.
//   • The minutes figure is about LAST season and the roster that played it.
//     It is the share of a line's published minutes still on this year's
//     roster, so a line that lost its everpresent reads low however many
//     bodies it kept. Where last season's statistics were never collected the
//     figure is absent and says so; it is never a zero.

import { loadRosters, loadStats } from "./data.ts";
import { type Season, squadOf } from "./derive.ts";
import { classAbbr, LINE_LABEL, LINE_ORDER, type Line, positionLine } from "./format.ts";
import { type Nation, originOf } from "./origin.ts";

/** The five steps of the ladder, palest first. */
export type TenureStep = "FR" | "SO" | "JR" | "SR" | "5Y";
export const TENURE_STEPS = ["FR", "SO", "JR", "SR", "5Y"] as const;

const WORD: Record<TenureStep, string> = {
  FR: "Freshman",
  SO: "Sophomore",
  JR: "Junior",
  SR: "Senior",
  "5Y": "Fifth year",
};

export interface Tenure {
  /** null when the roster published no class year, or published one this
   *  ladder does not place. The two are told apart by `published`. */
  step: TenureStep | null;
  /** Exactly what the roster printed, when it printed anything. */
  published: string | null;
}

/**
 * Read a published class year onto the ladder.
 *
 * classAbbr already normalises the forms a roster writes — "Freshman", "1st",
 * "First Year" — and hands back the roster's own words when it recognises
 * none. A graduate student is the one such word this data actually carries, 48
 * players of 923, and a graduate student is past a senior: the top step is the
 * true statement about their tenure, so they take it rather than draw hollow
 * as though nothing had been published about them. Anything else published and
 * unrecognised stays unplaced, which is a third state and not an absence.
 */
export function tenureOf(classYear: string | undefined): Tenure {
  const published = classYear?.trim() || null;
  const abbr = classAbbr(classYear);
  if (abbr === null) return { step: null, published: null };
  if ((TENURE_STEPS as readonly string[]).includes(abbr)) {
    return { step: abbr as TenureStep, published };
  }
  if (/\bgrad/i.test(abbr)) return { step: "5Y", published };
  return { step: null, published };
}

/** How a square says what it is, to a reader who hovers or listens. */
export function tenureWord(tenure: Tenure): string {
  if (tenure.step === null) {
    return tenure.published === null
      ? "class year not published"
      : `${tenure.published} — not a step this site places`;
  }
  const word = WORD[tenure.step];
  return tenure.published && tenure.published !== word ? `${word} (${tenure.published})` : word;
}

export interface Square {
  name: string;
  tenure: Tenure;
  returning: boolean;
  /** Set only where the published hometown is outside the United States — the
   *  same authored classification the squad rows mark with a flag. */
  nation: Nation | null;
  /** Name, tenure, whether they were here last year, and where they are from. */
  title: string;
}

/** Last season's minutes, and how many of them are still on the roster. */
export interface Minutes {
  returned: number;
  total: number;
}

export interface ShapeRow {
  key: Line | "UNL";
  label: string;
  returners: Square[];
  newcomers: Square[];
  /** null when the season before was never collected at all. */
  minutes: Minutes | null;
}

export interface TenureGrid {
  rows: ShapeRow[];
  size: number;
  /** null when the season before was never collected: with nothing to compare
   *  against, nobody on this roster is called new. */
  returning: number | null;
  fresh: number | null;
  minutes: Minutes | null;
  /** True when last season's roster is here and its statistics are not. */
  minutesUncollected: boolean;
  /** Players on last season's roster whose position this site cannot place
   *  onto a line, and the minutes they hold: inside the total, inside no row. */
  offLine: { players: number; minutes: number };
}

/** The four lines every page names, then the row that exists only when a
 *  roster writes a position this site cannot place onto one of them. */
const ROWS: readonly { key: Line | "UNL"; label: string }[] = [
  ...LINE_ORDER.map((key) => ({ key, label: LINE_LABEL[key] })),
  { key: "UNL", label: "UNLISTED" },
];

const RANK: Record<TenureStep, number> = { "5Y": 5, SR: 4, JR: 3, SO: 2, FR: 1 };
/** Longest tenure first; a square with no step sits last, not first. */
const byTenure = (a: Square, b: Square): number =>
  (b.tenure.step ? RANK[b.tenure.step] : 0) - (a.tenure.step ? RANK[a.tenure.step] : 0);

export function tenureGrid(s: Season, slug: string): TenureGrid {
  const squad = squadOf(s, slug);
  const year = s.fixtures.season - 1;
  const before = loadRosters(year, s.fixtures.gender, s.key)?.rosters[slug] ?? null;
  const stats = loadStats(year, s.fixtures.gender, s.key)?.teams[slug] ?? null;

  // A keeper is published in both tables. The two lines are the same minutes
  // written down twice, so a player's season is the larger of them — never the
  // sum, which would count a keeper's year against the roster twice.
  const minutesBy = new Map<string, number>();
  for (const line of [...(stats?.players ?? []), ...(stats?.keepers ?? [])]) {
    minutesBy.set(line.name, Math.max(minutesBy.get(line.name) ?? 0, line.minutes ?? 0));
  }

  const here = new Set(squad.map((m) => m.player.name));
  const lineOf = (position: string | undefined): Line | "UNL" => positionLine(position) ?? "UNL";

  const squareOf = (m: (typeof squad)[number]): Square => {
    const tenure = tenureOf(m.player.class_year);
    const origin = originOf(m.player.hometown);
    const nation = origin.kind === "abroad" ? origin.nation : null;
    // `isNew` is false when there is nothing to compare against, so the word
    // only appears where the comparison was actually possible.
    const returning = before !== null && !m.isNew;
    const standing = before === null ? null : returning ? "returning" : "new";
    return {
      name: m.player.name,
      tenure,
      returning,
      nation,
      title: [m.player.name, tenureWord(tenure), standing, nation?.name]
        .filter(Boolean)
        .join(" · "),
    };
  };

  const rows: ShapeRow[] = [];
  for (const { key, label } of ROWS) {
    const members = squad.filter((m) => (m.line ?? "UNL") === key);
    // The four lines are the page's own structure and print even when empty.
    // UNLISTED is not: it exists only because a roster named a position this
    // site cannot place, and drawing it empty would invent that problem.
    if (key === "UNL" && members.length === 0) continue;
    const squares = members.map(squareOf);
    let minutes: Minutes | null = null;
    if (before) {
      minutes = { returned: 0, total: 0 };
      for (const p of before.players) {
        if (lineOf(p.position) !== key) continue;
        const played = minutesBy.get(p.name) ?? 0;
        minutes.total += played;
        if (here.has(p.name)) minutes.returned += played;
      }
    }
    rows.push({
      key,
      label,
      returners: squares.filter((sq) => sq.returning).sort(byTenure),
      newcomers: squares.filter((sq) => !sq.returning).sort(byTenure),
      minutes,
    });
  }

  // The overall figure is the whole of last season, not the sum of the rows —
  // a prior roster can list a position this site cannot place, and those
  // minutes were still played. Where the rows do not account for all of them,
  // offLine is what the page has to say so out loud.
  const drawn = new Set(rows.map((r) => r.key));
  const offLine = { players: 0, minutes: 0 };
  let minutes: Minutes | null = null;
  if (before) {
    minutes = { returned: 0, total: 0 };
    for (const p of before.players) {
      const played = minutesBy.get(p.name) ?? 0;
      minutes.total += played;
      if (here.has(p.name)) minutes.returned += played;
      if (!drawn.has(lineOf(p.position))) {
        offLine.players++;
        offLine.minutes += played;
      }
    }
  }

  const fresh = before ? squad.filter((m) => m.isNew).length : null;
  return {
    rows,
    size: squad.length,
    returning: fresh === null ? null : squad.length - fresh,
    fresh,
    minutes,
    minutesUncollected: before !== null && stats === null,
    offLine,
  };
}

/** The share of a line's minutes still on the roster, or null when there is
 *  nothing to take a share of. A line nobody played is not nought per cent. */
export function returnedShare(minutes: Minutes | null): number | null {
  if (!minutes || minutes.total === 0) return null;
  return minutes.returned / minutes.total;
}
