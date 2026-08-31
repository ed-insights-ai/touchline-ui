/**
 * The strip's grammar, held against constructed plays and the real data home.
 *
 * The tui-641 contract's honesty rule is arithmetic: every count the strip
 * shows must equal what the play list sums to, a clock-less play never sits
 * on a timeline, and the goal is the only labeled mark. The constructed
 * fixtures prove each rule exists even when the collected data happens not to
 * exercise it; the live tests recount every 2026 box score from its own play
 * list, so nothing here is pinned to a snapshot except the one contract
 * reference that is deliberately named as such.
 */

import { describe, expect, test } from "bun:test";
import { loadSeason, matchDetailOf } from "./derive.ts";
import { matchMinute } from "./format.ts";
import type { MatchDetail, MatchPlay } from "./model.ts";
import {
  cardPlayer,
  type MarkKind,
  markKindOf,
  matchStrip,
  stripCounts,
  stripOf,
  summaryStrip,
} from "./timeline.ts";

// ── Constructed fixtures ────────────────────────────────────────────────────

const detailOf = (plays: MatchPlay[], over: Partial<MatchDetail> = {}): MatchDetail => ({
  source_url: "constructed://test",
  teams: [
    { name: "Home FC", abbr: "HOM", periods: [0, 0] },
    { name: "Away FC", abbr: "AWY", periods: [0, 0] },
  ],
  home_index: 0,
  plays,
  ...over,
});

const play = (
  type: string | undefined,
  clock: string | undefined,
  team: number | undefined,
  text: string,
  extra: Partial<MatchPlay> = {},
): MatchPlay => ({ period: "1", clock, team, text, type, ...extra });

const allMarks = (strip: ReturnType<typeof matchStrip>) =>
  [...strip.home, ...strip.away].flatMap((s) => s.marks);

describe("which mark a play draws as", () => {
  test("a play carrying a score is a goal whatever its type says", () => {
    expect(
      markKindOf(
        play("penalty", "10:00", 0, "HOM Doe, John PENALTY KICK GOAL.", { score: [1, 0] }),
      ),
    ).toBe("goal");
    expect(markKindOf(play("goal", "10:00", 0, "GOAL by HOM Doe, John.", { score: [1, 0] }))).toBe(
      "goal",
    );
  });

  test("an unscored penalty is a shot — two of the four 2026 penalties are misses", () => {
    expect(markKindOf(play("penalty", "10:00", 0, "HOM Doe, John PENALTY KICK saved."))).toBe(
      "shot",
    );
  });

  test("roster changes share one kind, and structure draws nothing", () => {
    expect(markKindOf(play("goalie", "00:00", 0, "Doe, John at goalie for Home FC."))).toBe(
      "roster",
    );
    expect(markKindOf(play("lineup", "00:00", 0, "FOR HOM: , #1 Doe, John."))).toBe("roster");
    expect(markKindOf(play("period", "45:00", undefined, "End of period [45:00]."))).toBeNull();
    expect(
      markKindOf(play(undefined, "12:00", 0, "Free prose the collector did not type.")),
    ).toBeNull();
  });
});

describe("the goal is the only labeled mark", () => {
  const strip = matchStrip(
    detailOf([
      play("shot", "05:00", 0, "Shot by HOM Doe, John, wide."),
      play("corner", "08:00", 1, "Corner kick [08:00]."),
      play("foul", "09:00", 1, "Foul on Roe, Rick."),
      play("yellow", "09:30", 1, "Yellow card on AWY Roe, Rick."),
      play("goal", "10:30", 0, "GOAL by HOM Doe, John.", { score: [1, 0] }),
      play("sub", "60:00", 0, "HOM substitution: Poe, Edgar for Doe, John."),
    ]),
    0,
  );

  test("every label belongs to a goal, and every goal has one", () => {
    for (const m of allMarks(strip)) {
      expect(
        m.label !== null,
        `${m.kind} must ${m.kind === "goal" ? "" : "not "}carry a label`,
      ).toBe(m.kind === "goal");
    }
  });

  test("the label is running score + scorer + minute, home side first", () => {
    const goal = allMarks(strip).find((m) => m.kind === "goal");
    expect(goal?.label).toBe("1–0 · Doe · 11′");
  });

  test("the away side's running score still reads home-first", () => {
    const s = matchStrip(
      detailOf([play("goal", "20:00", 1, "GOAL by AWY Roe, Rick.", { score: [0, 1] })]),
      0,
    );
    expect(allMarks(s)[0]?.label).toBe("0–1 · Roe · 20′");
  });

  test("when the served order is not home-first, the label still is", () => {
    // teams[0] is the away side here: homeIndex 1, so a goal by teams[1]
    // makes the tuple [0, 1] and the label must read 1–0.
    const s = matchStrip(
      detailOf([play("goal", "20:00", 1, "GOAL by AWY Doe, John.", { score: [0, 1] })]),
      1,
    );
    expect(allMarks(s)[0]?.label).toBe("1–0 · Doe · 20′");
  });
});

describe("lanes and same-minute stacking", () => {
  test("marks sharing a drawn minute pile in one stack; the goal holds the axis, roster changes pile outermost", () => {
    const strip = matchStrip(
      detailOf([
        play("sub", "29:10", 0, "HOM substitution: Poe, Edgar for Doe, John."),
        play("foul", "29:30", 0, "Foul on Doe, John."),
        play("goal", "30:00", 0, "GOAL by HOM Doe, John.", { score: [1, 0] }),
      ]),
      0,
    );
    expect(strip.home).toHaveLength(1);
    expect(strip.home[0]!.minute).toBe(30);
    expect(strip.home[0]!.marks.map((m) => m.kind)).toEqual(["goal", "foul", "sub"]);
    expect(strip.away).toHaveLength(0);
  });

  test("the same minute on opposite sides is two stacks in two lanes", () => {
    const strip = matchStrip(
      detailOf([
        play("foul", "40:00", 0, "Foul on Doe, John."),
        play("offside", "40:00", 1, "Offside against Away FC."),
      ]),
      0,
    );
    expect(strip.home).toHaveLength(1);
    expect(strip.away).toHaveLength(1);
  });

  test("headroom is counted without the roster layer, and again with it", () => {
    const strip = matchStrip(
      detailOf([
        play("foul", "50:00", 0, "Foul on Doe, John."),
        play("sub", "50:00", 0, "HOM substitution: A, B for C, D."),
        play("sub", "49:30", 0, "HOM substitution: E, F for G, H."),
      ]),
      0,
    );
    expect(strip.tallest.home).toBe(1);
    expect(strip.tallestAll.home).toBe(3);
  });
});

describe("the honesty rules", () => {
  test("a clock-less play is counted in the named note, never drawn", () => {
    const strip = matchStrip(
      detailOf([
        play("foul", undefined, 0, "Foul on Doe, John."),
        play("foul", "12:00", 0, "Foul on Roe, Rick."),
      ]),
      0,
    );
    expect(stripCounts(strip).foul).toBe(1);
    expect(strip.notes).toEqual([{ kind: "foul", count: 1, reason: "no published clock" }]);
  });

  test("a play with no attributed side has no lane, and says so", () => {
    const strip = matchStrip(
      detailOf([play("foul", "12:00", undefined, "Foul on somebody the page never sided.")]),
      0,
    );
    expect(stripCounts(strip).foul).toBeUndefined();
    expect(strip.notes).toEqual([{ kind: "foul", count: 1, reason: "no attributed side" }]);
  });

  test("a clock-less substitution still counts toward the toggle's label", () => {
    const strip = matchStrip(
      detailOf([
        play("sub", undefined, 0, "HOM substitution: A, B for C, D."),
        play("sub", "60:00", 0, "HOM substitution: E, F for G, H."),
      ]),
      0,
    );
    expect(strip.subCount).toBe(2);
    expect(strip.notes).toEqual([{ kind: "sub", count: 1, reason: "no published clock" }]);
  });

  test("a sending-off keeps its own kind through the strip", () => {
    const strip = matchStrip(detailOf([play("red", "77:00", 1, "Red card on AWY Roe, Rick.")]), 0);
    expect(allMarks(strip).map((m) => m.kind)).toEqual(["red"]);
  });
});

describe("the clock the band is drawn against", () => {
  test("ninety, or later if the record ran on", () => {
    const ninety = matchStrip(
      detailOf([play("shot", "44:00", 0, "Shot by HOM Doe, John, wide.")]),
      0,
    );
    expect(ninety.fullTime).toBe(90);
    const overtime = matchStrip(
      detailOf([
        play("period", "105:00", undefined, "End of period [105:00]."),
        play("goal", "98:30", 0, "GOAL by HOM Doe, John.", { score: [1, 0] }),
      ]),
      0,
    );
    expect(overtime.fullTime).toBe(105);
    expect(overtime.home[0]!.x).toBeCloseTo((99 / 105) * 100);
  });
});

describe("the fallback for a box score without a play-by-play", () => {
  const detail = detailOf([], {
    plays: [],
    scoring: [
      { time: "17:40", team: 0, scorer: "John Doe" },
      { time: "80:00", team: 1, scorer: "Rick Roe" },
    ],
    cards: [{ time: "55:00", team: 1, type: "red", player: "Rick Roe" }],
  });

  test("marks come from the summaries, and every count is their sum", () => {
    const strip = stripOf(detail, 0);
    expect(stripCounts(strip)).toEqual({ goal: 2, red: 1 });
    expect(strip.subCount).toBe(0);
    expect(strip.actionCount).toBe(3);
  });

  test("the goal is still the only labeled mark, running score home-first", () => {
    const strip = summaryStrip(detail, 0);
    const labels = allMarks(strip)
      .filter((m) => m.label !== null)
      .map((m) => [m.kind, m.label]);
    expect(labels).toEqual([
      ["goal", "1–0 · Doe · 18′"],
      ["goal", "1–1 · Roe · 80′"],
    ]);
  });
});

describe("a caution the source named nobody for", () => {
  test("'0' is a placeholder, not a person, and neither is an empty field", () => {
    expect(cardPlayer("0")).toBeNull();
    expect(cardPlayer("")).toBeNull();
    expect(cardPlayer("   ")).toBeNull();
    expect(cardPlayer(undefined)).toBeNull();
  });

  test("a published name survives, including one a real #0 could carry", () => {
    expect(cardPlayer("Keegan O'Brien")).toBe("Keegan O'Brien");
    expect(cardPlayer("Bolk, Philip")).toBe("Bolk, Philip");
    // Only the bare placeholder goes; a number inside a name is not one.
    expect(cardPlayer("Player 10")).toBe("Player 10");
  });

  test("the strip label names the silence and never prints the placeholder", () => {
    const detail = detailOf([], {
      plays: [],
      scoring: [],
      cards: [{ time: "48:29", team: 0, type: "yellow", player: "0" }],
    });
    const strip = summaryStrip(detail, 0);
    const raws = [...strip.home, ...strip.away].flatMap((s) => s.marks.map((m) => m.raw));
    expect(raws).toHaveLength(1);
    expect(raws[0]).toContain("no name published");
    expect(raws[0]).not.toMatch(/\bon 0\b/);
  });

  test("the card still counts — only the identity is missing", () => {
    const named = detailOf([], {
      plays: [],
      scoring: [],
      cards: [{ time: "48:29", team: 0, type: "yellow", player: "Someone Real" }],
    });
    const unnamed = detailOf([], {
      plays: [],
      scoring: [],
      cards: [{ time: "48:29", team: 0, type: "yellow", player: "0" }],
    });
    expect(stripCounts(summaryStrip(unnamed, 0))).toEqual(stripCounts(summaryStrip(named, 0)));
  });
});

// ── The real data home ──────────────────────────────────────────────────────

const CONFERENCES = ["gac", "lsc", "gsc"] as const;
const seasons = CONFERENCES.map((key) => ({ key, season: loadSeason(key) }));

interface RealMatch {
  key: string;
  id: string;
  detail: MatchDetail;
  homeIndex: number;
}
const realMatches: RealMatch[] = seasons.flatMap(({ key, season }) =>
  season.fixtures.fixtures.flatMap((f) => {
    const detail = matchDetailOf(season, f.id);
    return detail && detail.home_index !== undefined
      ? [{ key, id: f.id, detail, homeIndex: detail.home_index }]
      : [];
  }),
);

/** The test's own reading of a play list: what should be drawn, what noted. */
function recount(detail: MatchDetail) {
  const drawn: Partial<Record<MarkKind, number>> = {};
  const noted: Partial<Record<MarkKind, number>> = {};
  for (const p of detail.plays ?? []) {
    const kind = markKindOf(p);
    if (kind === null) continue;
    const placeable = matchMinute(p.clock?.trim() || undefined) !== null && p.team !== undefined;
    const bucket = placeable ? drawn : noted;
    bucket[kind] = (bucket[kind] ?? 0) + 1;
  }
  return { drawn, noted };
}

describe("every 2026 strip, against its own play list", () => {
  test("the collect carries matches to hold this against", () => {
    expect(realMatches.length).toBeGreaterThan(0);
    for (const m of realMatches) {
      expect((m.detail.plays ?? []).length, `${m.id} should carry plays`).toBeGreaterThan(0);
    }
  });

  test("per-kind mark counts equal the play list's sums, drawn plus noted", () => {
    for (const { id, detail, homeIndex } of realMatches) {
      const strip = matchStrip(detail, homeIndex);
      const { drawn, noted } = recount(detail);
      expect(stripCounts(strip), `${id}: drawn marks`).toEqual(drawn);
      const notedByKind: Partial<Record<MarkKind, number>> = {};
      for (const n of strip.notes) notedByKind[n.kind] = (notedByKind[n.kind] ?? 0) + n.count;
      expect(notedByKind, `${id}: noted plays`).toEqual(noted);
      expect(strip.subCount, `${id}: toggle count`).toBe(
        (detail.plays ?? []).filter((p) => markKindOf(p) === "sub").length,
      );
    }
  });

  test("the goal is the only labeled mark on every strip", () => {
    for (const { id, detail, homeIndex } of realMatches) {
      for (const m of allMarks(matchStrip(detail, homeIndex))) {
        expect(m.label !== null, `${id}: a ${m.kind} mark`).toBe(m.kind === "goal");
      }
    }
  });

  test("some 2026 sending-off reaches a strip as its own mark", () => {
    const reds = realMatches.filter(({ detail }) =>
      (detail.plays ?? []).some((p) => markKindOf(p) === "red"),
    );
    expect(reds.length).toBeGreaterThan(0);
    for (const { id, detail, homeIndex } of reds) {
      const drawn = stripCounts(matchStrip(detail, homeIndex)).red ?? 0;
      const placeableReds = (detail.plays ?? []).filter(
        (p) =>
          markKindOf(p) === "red" &&
          matchMinute(p.clock?.trim() || undefined) !== null &&
          p.team !== undefined,
      ).length;
      expect(drawn, id).toBe(placeableReds);
    }
  });
});

describe("the collected placeholder cautions (tui-mvc)", () => {
  // Every card in the 2026 collect, with the box score it came from, so the
  // count below is the data's own and not a number copied off a bead.
  const allCards = realMatches.flatMap(({ id, detail }) =>
    (detail.cards ?? []).map((c) => ({ id, card: c })),
  );
  const placeholders = allCards.filter(({ card }) => cardPlayer(card.player) === null);

  test("the collect still carries the trap this rule exists for", () => {
    expect(allCards.length).toBeGreaterThan(0);
    expect(placeholders.length).toBeGreaterThan(0);
    // Both of the ruling's decisive box scores, recomputed rather than pinned.
    const forMatch = (id: string) => placeholders.filter((p) => p.id === id).length;
    expect(forMatch("sidearm:uah:13290")).toBe(2);
    expect(forMatch("sidearm:saint-edwards:8618")).toBe(2);
  });

  test("no strip label anywhere prints the placeholder as a name", () => {
    for (const { id, detail, homeIndex } of realMatches) {
      const strip = stripOf(detail, homeIndex);
      for (const stack of [...strip.home, ...strip.away]) {
        for (const mark of stack.marks) {
          expect(mark.raw, `${id} card label`).not.toMatch(/\bcard on 0\b/);
        }
      }
    }
  });

  test("an unnamed caution is still counted, on the strip and in the panel", () => {
    for (const { id, detail, homeIndex } of realMatches) {
      const cards = detail.cards ?? [];
      if (cards.length === 0) continue;
      // What the panel lists is every collected card, placeholders included:
      // the identity is missing, the caution is not.
      const placeable = cards.filter(
        (c) => matchMinute(c.time?.trim() || undefined) !== null && c.team !== undefined,
      );
      const strip = summaryStrip(detail, homeIndex);
      const drawn = (stripCounts(strip).card ?? 0) + (stripCounts(strip).red ?? 0);
      expect(drawn, `${id} cards drawn`).toBe(placeable.length);
    }
  });
});

describe("the contract's reference arithmetic (tui-641)", () => {
  // Deliberately pinned: these are the binding contract's own figures for the
  // NSU–Lincoln record of Aug 30, recomputed from the live play list before
  // this shipped and equal on that day. If a recollect ever moves this
  // record, the discrepancy goes to the bead — do not patch the numbers here
  // without taking it there first.
  test("NSU–Lincoln: 45 match actions (1+15+6+18+3+2), 35 substitutions, 87 lines", () => {
    const season = loadSeason("gac");
    const detail = matchDetailOf(season, "sidearm:northeastern-state:14385");
    expect(detail).not.toBeNull();
    if (!detail || detail.home_index === undefined)
      throw new Error("reference match lost its home");
    expect(detail.plays ?? []).toHaveLength(87);
    const strip = matchStrip(detail, detail.home_index);
    expect(stripCounts(strip)).toEqual({
      goal: 1,
      shot: 15,
      corner: 6,
      foul: 18,
      offside: 3,
      card: 2,
      sub: 35,
      roster: 4,
    });
    expect(strip.actionCount).toBe(45);
    expect(strip.subCount).toBe(35);
    expect(strip.notes).toEqual([]);
  });

  test("Fort Hays–Rockhurst: the clock-less foul is in the note, never on the strip", () => {
    const season = loadSeason("gac");
    const detail = matchDetailOf(season, "sidearm:fort-hays-state:14053");
    expect(detail).not.toBeNull();
    if (!detail || detail.home_index === undefined)
      throw new Error("test-case match lost its home");
    const clockless = (detail.plays ?? []).filter(
      (p) => markKindOf(p) === "foul" && matchMinute(p.clock?.trim() || undefined) === null,
    ).length;
    // The contract names this record as the real test case; assert the trap
    // still exists, then recount rather than pin.
    expect(clockless).toBeGreaterThan(0);
    const strip = matchStrip(detail, detail.home_index);
    const note = strip.notes.find((n) => n.kind === "foul" && n.reason === "no published clock");
    expect(note?.count).toBe(clockless);
    const totalFouls = (detail.plays ?? []).filter((p) => markKindOf(p) === "foul").length;
    expect(stripCounts(strip).foul).toBe(totalFouls - clockless);
  });
});
