/**
 * The play parser's traps.
 *
 * Each case here is a sentence the 2026 data actually publishes and an
 * obvious reading that gets it wrong. They are regression tests in the
 * literal sense: every one of them was a bug before it was a test.
 */

import { describe, expect, test } from "bun:test";
import type { MatchDetail } from "./model.ts";
import { ledgerRows, type PlayRow } from "./plays.ts";

/** A two-side box score with just enough teamsheet to resolve names. */
function detail(overrides: Partial<MatchDetail> = {}): MatchDetail {
  return {
    source_url: "https://example.test/box",
    home_index: 1,
    teams: [
      {
        name: "Rockhurst",
        abbr: "RU",
        periods: [0, 1],
        players: [
          { name: "Sam McIntosh" },
          { name: "Rhys Laws" },
          { name: "Blake Barrick" },
          { name: "Hugo John Holmberg Nordenberg" },
        ],
      },
      {
        name: "Fort Hays St.",
        abbr: "FHSU",
        periods: [2, 2],
        players: [
          { name: "Juan Linares" },
          { name: "Filippo Moncada" },
          { name: "Francisco Degiorgi" },
          { name: "Philip Bölk" },
        ],
        keepers: [{ name: "Payton Roehrich" }],
      },
    ],
    ...overrides,
  } as MatchDetail;
}

const rowsOf = (plays: MatchDetail["plays"], d: MatchDetail = detail()): PlayRow[] =>
  ledgerRows({ ...d, plays }, d.home_index).filter((r): r is PlayRow => r.kind === "play");

const shown = (r: PlayRow): string =>
  r.goalLabel ? `${r.goalLabel} — ${r.scorer}${r.assists ? ` ${r.assists}` : ""}` : r.text;

describe("a goal is a play carrying a score array", () => {
  test("a penalty MISS is not a goal", () => {
    const [row] = rowsOf([
      {
        period: "2",
        clock: "61:33",
        team: 1,
        type: "penalty",
        text: "FHSU Juan Linares PENALTY KICK MISS, saved by Roehrich, Payton.",
      },
    ]);
    expect(row?.goalLabel).toBeNull();
    expect(row?.running).toBeNull();
    expect(shown(row as PlayRow)).toBe("Penalty missed — Juan Linares — saved by Payton Roehrich");
  });

  test("a penalty GOAL is a goal, and the score reads home-first", () => {
    // score is in teams order; teams[1] is home, so [0,1] displays as 1–0.
    const [row] = rowsOf([
      {
        period: "1",
        clock: "17:40",
        team: 1,
        type: "penalty",
        text: "FHSU Juan Linares PENALTY KICK GOAL.",
        score: [0, 1],
      },
    ]);
    expect(row?.goalLabel).toBe("GOAL · PENALTY");
    expect(row?.scorer).toBe("Juan Linares");
    expect(row?.running).toBe("1–0");
  });

  test("a penalty the source calls a GOAL with no score on its row is a goal, not a miss", () => {
    // presto:bridgeport:rfewqtmomyyhqw8t — Bridgeport's 69:30 winner. The
    // Presto page prints "BPT Ata Akgun PENALTY KICK GOAL." with no running
    // score beside it; read by the score alone it was published as
    // "Penalty missed". It is a goal, and its row prints no running score,
    // because the source printed none.
    const [row] = rowsOf([
      {
        period: "2",
        clock: "69:30",
        team: 1,
        type: "penalty",
        text: "FHSU Juan Linares PENALTY KICK GOAL.",
      },
    ]);
    expect(row?.goalLabel).toBe("GOAL · PENALTY");
    expect(row?.scorer).toBe("Juan Linares");
    expect(row?.running).toBeNull();
    expect(row?.filters).toEqual(["goals", "set"]);
  });

  test("after an unscored goal the dividers print no score until a published one returns", () => {
    const d = detail();
    const rows = ledgerRows(
      {
        ...d,
        plays: [
          {
            period: "1",
            clock: "10:00",
            team: 1,
            type: "goal",
            text: "GOAL by FHSU Linares, Juan.",
            score: [0, 1],
          },
          { period: "1", clock: "45:00", type: "period", text: "End of period [45:00]." },
          {
            period: "2",
            clock: "69:30",
            team: 1,
            type: "penalty",
            text: "FHSU Juan Linares PENALTY KICK GOAL.",
          },
          { period: "2", clock: "90:00", type: "period", text: "End of period [90:00]." },
        ],
      },
      d.home_index,
    );
    const dividers = rows.filter((r) => r.kind === "divider");
    expect(dividers.map((r) => r.score)).toEqual(["FHSU 1 – 0 RU", null]);
  });

  test("a penalty whose words say neither GOAL nor MISS is a penalty kick, not a miss", () => {
    const [row] = rowsOf([
      {
        period: "2",
        clock: "61:33",
        team: 1,
        type: "penalty",
        text: "FHSU Juan Linares PENALTY KICK.",
      },
    ]);
    expect(row?.goalLabel).toBeNull();
    expect(shown(row as PlayRow)).toBe("Penalty kick — Juan Linares");
  });
});

describe("the play-by-play is held to the box score's record (tui-hsl)", () => {
  // The record — the box score's final and its scoring summary — agrees with
  // the schedule; the stat crew's running log sometimes does not.
  const scored = (time: string, team: number, scorer: string) => ({ time, team, scorer });

  test("an AWARDED penalty is not a goal, whatever score rides on its row", () => {
    // sidearm:menlo:8137, a 0–0 match: "MC by TEAM PENALTY KICK AWARDED." [0,1]
    const d = detail({ teams: detail().teams.map((t) => ({ ...t, score: 0, periods: [0, 0] })) });
    const rows = ledgerRows(
      {
        ...d,
        plays: [
          {
            period: "2",
            clock: "64:46",
            team: 1,
            type: "penalty",
            text: "FHSU by TEAM PENALTY KICK AWARDED.",
            score: [0, 1],
          },
          { period: "2", clock: "90:00", type: "period", text: "End of period [90:00]." },
        ],
      },
      d.home_index,
    );
    const [row, divider] = rows;
    expect(row?.kind === "play" && row.goalLabel).toBeNull();
    expect(row?.kind === "play" && row.text).toBe("Penalty awarded");
    expect(row?.kind === "play" && row.running).toBeNull();
    // the stamped score is off the record, so nothing after it prints one
    expect(divider?.kind === "divider" && divider.score).toBeNull();
  });

  test("a goal line the scoring summary has no entry for is set aside when that lands on the final", () => {
    // sidearm:westmont:15905: the log carries a Westmont goal at 79:54 and
    // runs to 2–5; the box score, its scoring summary and both schedules say 1–5.
    const d = detail({
      teams: [
        { ...detail().teams[0], score: 0, periods: [0, 0] },
        { ...detail().teams[1], score: 1, periods: [1, 0] },
      ] as MatchDetail["teams"],
      scoring: [scored("11:06", 1, "Filippo Moncada")],
    });
    const rows = ledgerRows(
      {
        ...d,
        plays: [
          {
            period: "1",
            clock: "07:47",
            team: 1,
            type: "goal",
            text: "GOAL by FHSU Linares, Juan.",
            score: [0, 1],
          },
          {
            period: "1",
            clock: "11:06",
            team: 1,
            type: "goal",
            text: "GOAL by FHSU Moncada, Filippo.",
            score: [0, 2],
          },
          { period: "1", clock: "45:00", type: "period", text: "End of period [45:00]." },
        ],
      },
      d.home_index,
    );
    const plays = rows.filter((r): r is PlayRow => r.kind === "play");
    // the unlisted line stays, as published, never as a goal
    expect(plays[0]?.goalLabel).toBeNull();
    expect(plays[0]?.uncounted).toBe(true);
    expect(plays[0]?.text).toBe("GOAL by FHSU Linares, Juan");
    expect(plays[0]?.filters).not.toContain("goals");
    // the listed goal counts, but the log's 0–2 beside it is off the record
    expect(plays[1]?.goalLabel).toBe("GOAL");
    expect(plays[1]?.uncounted).toBe(false);
    expect(plays[1]?.running).toBeNull();
    expect(rows.find((r) => r.kind === "divider")?.score ?? null).toBeNull();
  });

  test("a log that cannot be reconciled keeps every goal and prints no running score", () => {
    // Two unlisted goals where setting one aside would land on the final:
    // there is no single reading, so nothing is set aside.
    const d = detail({
      teams: [
        { ...detail().teams[0], score: 0, periods: [0, 0] },
        { ...detail().teams[1], score: 1, periods: [1, 0] },
      ] as MatchDetail["teams"],
      scoring: [scored("30:00", 1, "Filippo Moncada")],
    });
    const plays = rowsOf(
      [
        {
          period: "1",
          clock: "07:47",
          team: 1,
          type: "goal",
          text: "GOAL by FHSU Linares, Juan.",
          score: [0, 1],
        },
        {
          period: "1",
          clock: "11:06",
          team: 1,
          type: "goal",
          text: "GOAL by FHSU Moncada, Filippo.",
          score: [0, 2],
        },
      ],
      d,
    );
    expect(plays.map((p) => p.goalLabel)).toEqual(["GOAL", "GOAL"]);
    expect(plays.map((p) => p.uncounted)).toEqual([false, false]);
    expect(plays.map((p) => p.running)).toEqual([null, null]);
  });

  test("a log that agrees with the record is untouched", () => {
    const d = detail({
      teams: [
        { ...detail().teams[0], score: 0, periods: [0, 0] },
        { ...detail().teams[1], score: 1, periods: [1, 0] },
      ] as MatchDetail["teams"],
      scoring: [scored("07:47", 1, "Juan Linares")],
    });
    const [row] = rowsOf(
      [
        {
          period: "1",
          clock: "07:47",
          team: 1,
          type: "goal",
          text: "GOAL by FHSU Linares, Juan.",
          score: [0, 1],
        },
      ],
      d,
    );
    expect(row?.goalLabel).toBe("GOAL");
    expect(row?.running).toBe("1–0");
    expect(row?.uncounted).toBe(false);
  });
});

describe("names are cut at connectives, never the first comma", () => {
  test("an unrostered scorer does not swallow the assist clause", () => {
    // Neither name is on the teamsheet, so both fall back to a comma flip —
    // and flipping the WHOLE remainder yields a scorer called
    // "Lawrence Assist by Hernandez".
    const [row] = rowsOf([
      {
        period: "2",
        clock: "50:00",
        team: 1,
        type: "goal",
        text: "GOAL by FHSU Doe, Lawrence Assist by Hernandez, Victor.",
        score: [0, 1],
      },
    ]);
    expect(row?.scorer).toBe("Lawrence Doe");
    expect(row?.assists).toBe("(Victor Hernandez)");
  });

  test("a shot's placement clause is not read as a forename", () => {
    const [row] = rowsOf([
      {
        period: "1",
        clock: "05:01",
        team: 1,
        type: "shot",
        text: "Shot by FHSU Linares, Juan, out top left.",
      },
    ]);
    expect(shown(row as PlayRow)).toBe("Shot — Juan Linares, out top left");
  });

  test("a four-word name survives, and the keeper clause splits off", () => {
    const [row] = rowsOf([
      {
        period: "1",
        clock: "30:00",
        team: 0,
        type: "shot",
        text: "Shot by RU Holmberg Nordenberg, Hugo John, bottom center, saved by Roehrich, Payton.",
      },
    ]);
    expect(shown(row as PlayRow)).toBe(
      "Shot — Hugo John Holmberg Nordenberg, bottom center — saved by Payton Roehrich",
    );
  });

  test("two assists are both credited", () => {
    const [row] = rowsOf([
      {
        period: "1",
        clock: "10:00",
        team: 1,
        type: "goal",
        text: "GOAL by FHSU Moncada, Filippo Assist by Degiorgi, Francisco and Linares, Juan.",
        score: [0, 1],
      },
    ]);
    expect(row?.assists).toBe("(Francisco Degiorgi, Juan Linares)");
  });
});

describe("the box score is the name authority", () => {
  test("a name published without its diacritics resolves to the roster spelling", () => {
    const [row] = rowsOf([
      { period: "1", clock: "12:00", team: 1, type: "shot", text: "Shot by FHSU Bolk, Philip." },
    ]);
    expect(shown(row as PlayRow)).toBe("Shot — Philip Bölk");
  });

  test("a name the teamsheet does not carry is left as published", () => {
    const [row] = rowsOf([
      {
        period: "1",
        clock: "12:00",
        team: 1,
        type: "sub",
        text: "FHSU substitution: unknown player for Linares, Juan.",
      },
    ]);
    expect(shown(row as PlayRow)).toBe("Substitution — unknown player for Juan Linares");
  });
});

describe("stripping a side's own tag needs a word boundary", () => {
  test("an abbreviation that prefixes the published name is not stripped", () => {
    // teams[0].abbr is "DELTA ST" and the text says "Delta State Samuel
    // Fitschen" — a prefix strip leaves a player called "ate Samuel Fitschen".
    const d = detail({
      home_index: 1,
      teams: [
        {
          name: "Delta State",
          abbr: "DELTA ST",
          periods: [0],
          players: [{ name: "Samuel Fitschen" }],
        },
        { name: "Central Baptist (AR)", abbr: "CBC", periods: [2], players: [] },
      ],
    } as Partial<MatchDetail>);
    const [row] = rowsOf(
      [
        {
          period: "1",
          clock: "27:12",
          team: 0,
          type: "shot",
          text: "Shot by Delta State Samuel Fitschen, High.",
        },
      ],
      d,
    );
    expect(shown(row as PlayRow)).toBe("Shot — Samuel Fitschen, High");
  });

  test("a play attributed to the side keeps the side's name", () => {
    const d = detail({
      home_index: 1,
      teams: [
        { name: "Delta State", abbr: "DELTA ST", periods: [0], players: [] },
        { name: "Central Baptist (AR)", abbr: "CBC", periods: [2], players: [] },
      ],
    } as Partial<MatchDetail>);
    const [row] = rowsOf([{ period: "1", team: 0, type: "foul", text: "Foul on Delta State." }], d);
    expect(shown(row as PlayRow)).toBe("Foul on Delta State");
  });
});

describe("a side tag the box score does not spell is stripped only on the teamsheet's word", () => {
  // Tampa v West Alabama, 2026-08-27 (tampaspartans.com, 20260827_k1ap): the
  // box score names the side "Tampa" and abbreviates it "Tampa", the plays
  // tag it "UT". A tag nobody strips is flipped into the name — the site
  // printed "Manuel UT Carmona".
  const tampa = (players: { name: string }[]) =>
    detail({
      home_index: 1,
      teams: [
        {
          name: "Tampa",
          abbr: "Tampa",
          periods: [1, 2],
          players,
          keepers: [{ name: "Alex Hare" }],
        },
        {
          name: "West Alabama",
          abbr: "West Ala.",
          periods: [2, 0],
          players: [{ name: "Dan Erez" }],
          keepers: [{ name: "Dan Erez" }],
        },
      ],
    } as Partial<MatchDetail>);
  const roster = [
    { name: "Manuel Carmona" },
    { name: "Tassilo Koerner" },
    { name: "Dagur Hafthorsson" },
    { name: "Felix Poschmann" },
  ];
  const plays: MatchDetail["plays"] = [
    {
      period: "2",
      clock: "48:08",
      team: 0,
      type: "goal",
      text: "GOAL by UT Carmona, Manuel Assist by Hafthorsson, Dagur.",
      score: [1, 2],
    },
    {
      period: "1",
      clock: "34:37",
      team: 0,
      type: "shot",
      text: "Shot by UT Koerner, Tassilo, out top right.",
    },
    {
      period: "2",
      clock: "83:32",
      team: 0,
      type: "yellow",
      text: "Yellow card on UT Carmona, Manuel.",
    },
    { period: "2", clock: "45:53", team: 0, type: "yellow", text: "Yellow card on UT TEAM." },
    {
      period: "2",
      clock: "84:38",
      team: 0,
      type: "sub",
      text: "UT substitution: Carmona, Manuel for Poschmann, Felix.",
    },
  ];

  test("the tag is stripped when the lineup vouches it names nobody", () => {
    const rows = rowsOf(plays, tampa(roster));
    expect(rows.map(shown)).toEqual([
      "GOAL — Manuel Carmona (Dagur Hafthorsson)",
      "Shot — Tassilo Koerner, out top right",
      "Yellow card — Manuel Carmona",
      "Yellow card — TEAM",
      "Substitution — Manuel Carmona for Felix Poschmann",
    ]);
  });

  test("a tag that is a word of a lineup name is never stripped", () => {
    // A side whose plays are tagged "UT" and whose teamsheet carries a player
    // called Ut: the parser cannot tell the two apart, so it leaves the line
    // as the old behaviour would.
    const rows = rowsOf(
      [
        {
          period: "1",
          clock: "34:37",
          team: 0,
          type: "shot",
          text: "Shot by UT Koerner, Tassilo, out top right.",
        },
      ],
      tampa([...roster, { name: "Bao Ut" }]),
    );
    expect(rows.map(shown)).toEqual(["Shot — Tassilo UT Koerner, out top right"]);
  });

  test("without a teamsheet nothing is guessed", () => {
    const rows = rowsOf(
      [
        {
          period: "1",
          clock: "34:37",
          team: 0,
          type: "shot",
          text: "Shot by UT Koerner, Tassilo, out top right.",
        },
      ],
      detail({
        home_index: 1,
        teams: [
          { name: "Tampa", abbr: "Tampa", periods: [1, 2] },
          { name: "West Alabama", abbr: "West Ala.", periods: [2, 0] },
        ],
      } as Partial<MatchDetail>),
    );
    expect(rows.map(shown)).toEqual(["Shot — Tassilo UT Koerner, out top right"]);
  });

  test("a sentence's own capitalised opener is not a tag", () => {
    // "GOAL by …" leads every goal line; "GOAL" is on no teamsheet either.
    const [row] = rowsOf(
      [
        {
          period: "2",
          clock: "48:08",
          team: 0,
          type: "goal",
          text: "GOAL by UT TEAM.",
          score: [1, 2],
        },
      ],
      tampa(roster),
    );
    expect(row?.scorer).toBe("no player credited");
  });
});

describe("absence keeps its place", () => {
  test("a play with no clock renders one and is not reordered", () => {
    const rows = rowsOf([
      { period: "1", clock: "13:26", team: 1, type: "shot", text: "Shot by FHSU Linares, Juan." },
      { period: "1", team: 0, type: "foul", text: "Foul on Barrick, Blake" },
      { period: "1", clock: "17:40", team: 1, type: "foul", text: "Foul on Linares, Juan." },
    ]);
    expect(rows.map((r) => r.clock)).toEqual(["13:26", null, "17:40"]);
  });

  test("no end-of-second-period play means no FULL TIME divider", () => {
    const rows = ledgerRows(
      {
        ...detail(),
        plays: [
          { period: "1", clock: "45:00", type: "period", text: "End of period [45:00]." },
          { period: "2", clock: "45:00", type: "period", text: "Start of 2nd period [45:00]." },
        ],
      },
      1,
    ).filter((r) => r.kind === "divider");
    expect(rows.map((r) => (r.kind === "divider" ? r.label : ""))).toEqual(["HALF-TIME"]);
  });

  test("a team-credited goal names no player", () => {
    const [row] = rowsOf([
      {
        period: "1",
        clock: "20:00",
        team: 1,
        type: "goal",
        text: "GOAL by FHSU TEAM.",
        score: [0, 1],
      },
    ]);
    expect(row?.scorer).toBe("no player credited");
  });
});
