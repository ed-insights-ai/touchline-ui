/**
 * The match timeline's marks, grouped for drawing.
 *
 * Ninety minutes are drawn to scale and a mark's position is its minute, so
 * two marks that share a minute cannot be nudged apart — a mark moved to make
 * room is a mark drawn at the wrong time. They are grouped instead, and the
 * component piles the group vertically.
 *
 * This is not a rare case. Nineteen of the 2026 season's thirty-nine collected
 * box scores repeat a minute somewhere; one 2019 match put eight cautions
 * inside a single minute of extra time.
 */

export type MarkKind = "goal" | "card";

export interface Mark {
  /** Minutes as drawn, already rounded up from the published clock. */
  minute: number | null;
  /** Who it was, for the hover panel: "23′ Alex Boakye". */
  label: string;
  /** The home side's marks read in the accent, the away side's in gray. */
  home: boolean;
}

export type PlacedMark = Mark & { kind: MarkKind };

export interface Stack {
  minute: number | null;
  marks: PlacedMark[];
  /** Percent along the band. */
  x: number;
  /** The label that names the pile, or null when the pile is one caution. */
  label: string | null;
  /** Which of the two label rows above the stack this label sits on. */
  tier: "a" | "b";
  /** How the label is anchored to its stack: centred, except at the ends. */
  align: "start" | "mid" | "end";
  /** A pile with no home goal in it is labelled in the quieter gray. */
  quiet: boolean;
}

export interface Timeline {
  stacks: Stack[];
  /** The most marks any one minute holds — the headroom the band reserves. */
  tallest: number;
}

export function timeline(goals: Mark[], cards: Mark[], fullTime: number): Timeline {
  const at = (minute: number | null): number =>
    minute === null ? 0 : Math.min(100, Math.max(0, (minute / fullTime) * 100));

  // Goals and cards arrive as two arrays and land on one axis, so a goal and a
  // caution in the same minute collide exactly as two cautions do. They are
  // merged before grouping, and grouped by the minute AS DRAWN: 84:10 and
  // 84:55 are half a pixel apart and both read 85′.
  //
  // The sort is stable and goals are listed first, so a goal holds the bottom
  // of a mixed pile — the position on the axis — and cautions pile above it.
  const merged: PlacedMark[] = [
    ...goals.map((g): PlacedMark => ({ ...g, kind: "goal" })),
    ...cards.map((c): PlacedMark => ({ ...c, kind: "card" })),
  ].sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));

  const grouped: { minute: number | null; marks: PlacedMark[] }[] = [];
  for (const m of merged) {
    const open = grouped[grouped.length - 1];
    if (open && open.minute === m.minute) open.marks.push(m);
    else grouped.push({ minute: m.minute, marks: [m] });
  }

  // A label names a pile. One caution keeps none — its shape says what it is
  // and the cautions panel below names it — but two of anything at the same
  // minute needs the count said out loud, or the reader is left counting pips.
  //
  // Labels stagger between two rows, both ABOVE their own stack. They used to
  // alternate above and below, and the row below the axis is the row the 0′/
  // HT/full-time labels live on: "87′ ×4" and "90′" printed as "87′ ×490′".
  let labelled = 0;
  const stacks = grouped.map((g): Stack => {
    const n = g.marks.length;
    const lone = n === 1 ? g.marks[0] : undefined;
    const label = lone?.kind === "card" ? null : n === 1 ? `${g.minute}′` : `${g.minute}′ ×${n}`;
    const x = at(g.minute);
    return {
      minute: g.minute,
      marks: g.marks,
      x,
      label,
      tier: label !== null && labelled++ % 2 === 1 ? "b" : "a",
      // Centred on its stack except at the very ends, where half a label hangs
      // off the band — and above 720px the band has no scroller to catch it.
      align: x > 92 ? "end" : x < 8 ? "start" : "mid",
      quiet: !g.marks.some((m) => m.kind === "goal" && m.home),
    };
  });

  return { stacks, tallest: Math.max(1, ...stacks.map((s) => s.marks.length)) };
}
