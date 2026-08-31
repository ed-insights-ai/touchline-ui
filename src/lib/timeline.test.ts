/**
 * What the timeline does when the clock repeats itself.
 *
 * Every minute here is one the collected data actually publishes: the four
 * cautions UAH took inside 87′, the goal and the caution Rogers State shared
 * at 80′, and the pair three minutes apart at Fort Hays that the stagger
 * exists to keep legible.
 */

import { describe, expect, test } from "bun:test";
import { type CardMark, type Mark, timeline } from "./timeline.ts";

const goal = (minute: number, who: string, home = true): Mark => ({
  minute,
  label: `${minute}′ ${who}`,
  home,
});
const card = (minute: number, who: string, home = true): CardMark => ({
  minute,
  label: `${minute}′ ${who}`,
  home,
});
const red = (minute: number, who: string, home = true): CardMark => ({
  ...card(minute, who, home),
  red: true,
});

describe("grouping", () => {
  test("distinct minutes stay distinct", () => {
    const { stacks, tallest } = timeline([goal(18, "Linares"), goal(21, "Moncada")], [], 90);
    expect(stacks.map((s) => s.minute)).toEqual([18, 21]);
    expect(stacks.every((s) => s.marks.length === 1)).toBe(true);
    expect(tallest).toBe(1);
  });

  test("UAH's four cautions inside 87′ are one stack", () => {
    const { stacks, tallest } = timeline(
      [],
      [card(87, "Selemani"), card(87, "0"), card(87, "Nabil"), card(87, "Orzechowski")],
      90,
    );
    expect(stacks).toHaveLength(1);
    expect(stacks[0]!.marks).toHaveLength(4);
    expect(stacks[0]!.label).toBe("87′ ×4");
    expect(tallest).toBe(4);
  });

  test("a goal and a caution in the same minute share a stack, goal underneath", () => {
    const { stacks } = timeline([goal(80, "Fulnek", false)], [card(80, "Horsley")], 90);
    expect(stacks).toHaveLength(1);
    expect(stacks[0]!.marks.map((m) => m.kind)).toEqual(["goal", "card"]);
    expect(stacks[0]!.label).toBe("80′ ×2");
  });

  test("marks come out in minute order however the arrays arrived", () => {
    const { stacks } = timeline([goal(73, "Degiorgi")], [card(19, "Heffernan")], 90);
    expect(stacks.map((s) => s.minute)).toEqual([19, 73]);
  });

  test("an empty match has no stacks and still reserves one row", () => {
    const { stacks, tallest } = timeline([], [], 90);
    expect(stacks).toEqual([]);
    expect(tallest).toBe(1);
  });

  test("a red card keeps its kind through the pile — Selemani inside UAH's 87′", () => {
    // The real shape of sidearm-uah-13290: three cautions and a sending-off
    // sharing the drawn minute. The pile is one stack and the red is not
    // flattened into the amber.
    const { stacks } = timeline(
      [],
      [
        card(87, "0", false),
        card(87, "Quickfall"),
        card(87, "Atoyebi"),
        red(87, "Selemani", false),
      ],
      90,
    );
    expect(stacks).toHaveLength(1);
    expect(stacks[0]!.marks.map((m) => m.kind)).toEqual(["card", "card", "card", "red"]);
    expect(stacks[0]!.label).toBe("87′ ×4");
  });
});

describe("labels", () => {
  test("a lone caution is not labelled — its shape and the panel below say it", () => {
    const { stacks } = timeline([], [card(49, "Orzechowski")], 90);
    expect(stacks[0]!.label).toBeNull();
  });

  test("a lone red card is not labelled either — same rule, its own shape", () => {
    const { stacks } = timeline([], [red(54, "Arthur")], 90);
    expect(stacks[0]!.marks[0]!.kind).toBe("red");
    expect(stacks[0]!.label).toBeNull();
  });

  test("a lone goal is labelled with its minute and no count", () => {
    expect(timeline([goal(26, "Selemani")], [], 90).stacks[0]!.label).toBe("26′");
  });

  test("two cautions in a minute are labelled, because a pile needs saying", () => {
    expect(timeline([], [card(28, "A"), card(28, "B")], 90).stacks[0]!.label).toBe("28′ ×2");
  });

  test("labels stagger across two rows, and unlabelled stacks do not take a turn", () => {
    const { stacks } = timeline(
      [goal(18, "Linares"), goal(21, "Moncada"), goal(73, "Degiorgi")],
      [card(49, "nobody")],
      90,
    );
    expect(stacks.map((s) => [s.minute, s.label, s.tier])).toEqual([
      [18, "18′", "a"],
      [21, "21′", "b"],
      [49, null, "a"],
      [73, "73′", "a"],
    ]);
  });
});

describe("placement", () => {
  test("x is the minute's share of the clock the band is drawn against", () => {
    expect(timeline([goal(45, "x")], [], 90).stacks[0]!.x).toBe(50);
    expect(timeline([goal(45, "x")], [], 120).stacks[0]!.x).toBe(37.5);
  });

  test("a label at either end anchors inward rather than hanging off the band", () => {
    // 87′ of 90′ is 96.7% — the label is "87′ ×4" and the 90′ tick is right there.
    expect(timeline([], [card(87, "a"), card(87, "b")], 90).stacks[0]!.align).toBe("end");
    expect(timeline([goal(2, "a")], [], 90).stacks[0]!.align).toBe("start");
    expect(timeline([goal(45, "a")], [], 90).stacks[0]!.align).toBe("mid");
  });

  test("a minute with no home goal in it is labelled quietly", () => {
    expect(timeline([goal(26, "a", true)], [], 90).stacks[0]!.quiet).toBe(false);
    expect(timeline([goal(26, "a", false)], [], 90).stacks[0]!.quiet).toBe(true);
    expect(timeline([], [card(28, "a"), card(28, "b")], 90).stacks[0]!.quiet).toBe(true);
    // A caution does not quiet the home goal it shares a minute with.
    expect(timeline([goal(80, "a", true)], [card(80, "b", false)], 90).stacks[0]!.quiet).toBe(
      false,
    );
  });

  test("a mark past the clock is pinned to the end rather than drawn off it", () => {
    expect(timeline([goal(120, "a")], [], 90).stacks[0]!.x).toBe(100);
  });
});
