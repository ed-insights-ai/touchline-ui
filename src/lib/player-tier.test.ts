// The tier's display: the publication gate, every sentence the sheet composes
// about a tier, and what may never reach a page. The sentences are pinned
// word for word here because they are fixed strings around figures from a
// frozen file; copy.test.ts holds the same sentences, composed for every real
// player, to the house's rules about form.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { levelShows, levelTiers, tiersConfig, tiersEnabled } from "../tiers.config.ts";
import {
  activeTiers,
  badgeLine,
  badgeYears,
  basisLine,
  basisNote,
  careerTiersLine,
  coverageLine,
  earlierTiers,
  goalsLine,
  holderLine,
  labelText,
  meaningLine,
  playedSince,
  type SheetTier,
  seasonLineOf,
  seasonsPhrase,
  sheetDefence,
  sheetTier,
  sourceLine,
  statusLabel,
  teamBadge,
  tierBlock,
  tierFigures,
} from "./player-tier.ts";
import { loadTiers, type TierEntry, type TiersFile, type TierTeam } from "./tiers.ts";

const ROOT = resolve(import.meta.dir, "..", "..");

function entry(over: Partial<TierEntry> = {}): TierEntry {
  return {
    name: "Tomas Ferreira",
    key: "tomasferreira",
    player_id: "101",
    number: "9",
    group: "F",
    kind: "shooting_scoring",
    status: "tier",
    tier: 1,
    reason: null,
    basis: { minutes: 1412, matches: 17, seasons: [2026], class_year: "Junior" },
    ...over,
  };
}

const team = (over: Partial<TierTeam> = {}): TierTeam => ({
  matches: 18,
  workload: "heavy",
  shots_faced_per_match: 16.4,
  pct_in: 8.1,
  goals_conceded: 24,
  opponents_usual: 30.6,
  badge: false,
  ...over,
});

function file(over: Partial<TiersFile> = {}): TiersFile {
  return {
    schema: "touchline-ui.tiers/2",
    level: "d2",
    season: 2026,
    gender: "men",
    spec: "player-tiers/0.8",
    frozen_at: "2026-11-16",
    data_commit: "ea45f891",
    division: { teams: 198, shots_faced_per_match: 12.3, pct_in: 12.8 },
    teams: { calder: team() },
    players: { calder: [entry()] },
    ...over,
  };
}

// ── The gate ────────────────────────────────────────────────────────────────

describe("the publication gate", () => {
  // A row's undefined preview means the variable is not set. An undefined
  // argument takes the parameter's default, which reads the environment, so
  // the variable is cleared here: the suite also runs with
  // TOUCHLINE_TIERS_PREVIEW=1, and these rows must not read it.
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.TOUCHLINE_TIERS_PREVIEW;
    delete process.env.TOUCHLINE_TIERS_PREVIEW;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.TOUCHLINE_TIERS_PREVIEW;
    else process.env.TOUCHLINE_TIERS_PREVIEW = saved;
  });

  const live = { published: true };
  const closed = { published: false };
  const rows: [string, string | undefined, typeof live | typeof tiersConfig, boolean][] = [
    // Division II: published, or the preview variable.
    ["d2", undefined, closed, false],
    ["d2", undefined, live, true],
    ["d2", "1", closed, true],
    ["d2", "1", live, true],
    ["d2", "0", closed, false],
    ["d2", "0", live, true],
    ["d2", "true", closed, false],
    ["d2", "", closed, false],
    // Division I: the same gate (what it shows is levelShows' business).
    ["d1", undefined, closed, false],
    ["d1", undefined, live, true],
    ["d1", "1", closed, true],
    // A level with no tiers: nothing, published or in preview.
    ["d3", undefined, live, false],
    ["d3", "1", live, false],
  ];
  test.each(rows)("level %s, preview %p, %o → %p", (level, preview, config, open) => {
    expect(tiersEnabled(level, preview, config)).toBe(open);
  });

  test("ships open: the owner published the tiers on 16 November 2026", () => {
    expect(tiersConfig.published).toBe(true);
    expect(tiersEnabled("d2", undefined)).toBe(true);
    expect(tiersEnabled("d1", undefined)).toBe(true);
  });

  test("activeTiers is the season's file while the tiers are published, at a level that has them", () => {
    // Published: the preview variable is not needed. A closed gate is the
    // truth table's business above; this reads the gate as it ships.
    expect(activeTiers("d2", 2026, "men", "0")?.season).toBe(2026);
    expect(activeTiers("d2", 2026, "men", "1")?.season).toBe(2026);
    expect(activeTiers("d1", 2026, "men", "0")?.level).toBe("d1");
    expect(activeTiers("d3", 2026, "men", "1")).toBeNull();
    // No Division I women's file: nothing.
    expect(activeTiers("d1", 2026, "women", "1")).toBeNull();
    // No file for the season: nothing, even with the gate open.
    expect(activeTiers("d2", 2019, "men", "1")).toBeNull();
  });
});

// ── What a level shows ──────────────────────────────────────────────────────

describe("what each level shows", () => {
  const mid = entry({ group: "M" });
  const fwd = entry({ group: "F" });
  const def = entry({ group: "D", kind: "team_defence", tier: null, status: "eligible" });
  const keeper = entry({ group: "GK", kind: "team_defence", tier: null, status: "eligible" });
  const unplaced = entry({
    group: null,
    kind: null,
    status: "incomplete",
    tier: null,
    reason: "no_position",
  });

  test("Division II shows shooting and scoring for both groups, and no defence tier", () => {
    for (const e of [mid, fwd, unplaced]) expect(levelShows("d2", e)).toBe(true);
    for (const e of [def, keeper]) expect(levelShows("d2", e)).toBe(false);
    expect(levelTiers("d2")).toMatchObject({ shooting: ["F", "M"], badge: true });
  });

  test("Division I shows midfielders' shooting and scoring only: the one group that passed T1 there", () => {
    expect(levelTiers("d1")).toMatchObject({ shooting: ["M"], badge: true });
    expect(levelShows("d1", mid)).toBe(true);
    expect(levelShows("d1", entry({ group: "M", status: "needs_minutes", tier: null }))).toBe(true);
    for (const e of [fwd, def, keeper, unplaced]) expect(levelShows("d1", e)).toBe(false);
    expect(levelShows("d3", mid)).toBe(false);
  });

  test("the coverage sentence says what another level shows, from config", () => {
    expect(coverageLine("Division I", levelTiers("d1"))).toBe(
      "Division I pages show the shooting and scoring tier for midfielders and the team defence badge.",
    );
    expect(coverageLine("Division II", levelTiers("d2"))).toBe(
      "Division II pages show the shooting and scoring tier for forwards and midfielders and the team defence badge.",
    );
    expect(coverageLine("Division III", levelTiers("d3"))).toBe("Division III pages show none.");
  });

  test("a level shows a group exactly when its measured reliability reaches the bar", () => {
    for (const level of ["d1", "d2"]) {
      const shown = levelTiers(level);
      for (const m of shown?.measured?.rows ?? []) {
        const on =
          m.group === "team_badge" ? shown?.badge : levelShows(level, entry({ group: m.group }));
        expect(`${level} ${m.group} shown ${on}`).toBe(`${level} ${m.group} shown ${m.r >= m.bar}`);
      }
    }
  });

  test("an entry the level does not show draws no block and no CAREER line", () => {
    const d1 = (e: TierEntry) => file({ level: "d1", players: { calder: [e] } });
    expect(sheetTier(d1(fwd), "calder", "Calder State", { name: "Tomas Ferreira" })).toBeNull();
    expect(sheetTier(d1(mid), "calder", "Calder State", { name: "Tomas Ferreira" })?.holder).toBe(
      "Tier 1, shooting and scoring",
    );
    const earlier = (e: TierEntry) => (y: number) =>
      y === 2025 ? file({ level: "d1", season: 2025, players: { calder: [e] } }) : null;
    expect(earlierTiers(d1(mid), "calder", { name: "Tomas Ferreira" }, earlier(fwd))).toEqual([]);
    expect(
      earlierTiers(d1(mid), "calder", { name: "Tomas Ferreira" }, earlier(mid)).map(
        (c) => c.season,
      ),
    ).toEqual([2025]);
  });
});

// ── The status ──────────────────────────────────────────────────────────────

describe("the status, as the sheet, the top line and the squad row say it", () => {
  test("a tier of shooting and scoring", () => {
    expect(statusLabel(entry())).toEqual({ head: "Tier 1", kind: "Shooting and scoring" });
    expect(labelText(statusLabel(entry({ tier: 2 })))).toBe("Tier 2 · Shooting and scoring");
    expect(holderLine(entry())).toBe("Tier 1, shooting and scoring");
    expect(holderLine(entry({ tier: 2 }))).toBe("Tier 2, shooting and scoring");
  });

  test("the team defence tier, with no workload group in its label", () => {
    const e = entry({ group: "D", kind: "team_defence" });
    expect(statusLabel(e)).toEqual({ head: "Team defence tier", kind: null });
    expect(holderLine(e)).toBe("Team defence tier");
  });

  test("every other status is named, and is no holder", () => {
    const cases: [Partial<TierEntry>, string][] = [
      [{ status: "eligible", tier: null }, "Eligible, no tier"],
      [{ status: "needs_minutes", tier: null }, "Needs more minutes"],
      [
        { status: "needs_second_season", tier: null, group: "GK", kind: "team_defence" },
        "Needs a second season",
      ],
      [{ status: "incomplete", tier: null, reason: "identity" }, "Incomplete records"],
    ];
    for (const [over, label] of cases) {
      const e = entry(over);
      expect(labelText(statusLabel(e))).toBe(label);
      expect(holderLine(e)).toBeNull();
    }
  });
});

describe("the meaning line, for every status and kind", () => {
  const P = "Calder State";
  const cases: [string, Partial<TierEntry>, string][] = [
    ["Tier 1", {}, "The top 5% of eligible forwards for shooting and scoring."],
    [
      "Tier 2, midfielder",
      { tier: 2, group: "M" },
      "The next 15% of eligible midfielders, after Tier 1, for shooting and scoring.",
    ],
    [
      "team defence tier",
      { group: "D", kind: "team_defence" },
      "Calder State's defending over the seasons counted, shared by every regular defender and goalkeeper with the same seasons. It describes the team, not one player.",
    ],
    [
      "eligible, shooting and scoring",
      { status: "eligible", tier: null, group: "M" },
      "Played enough this season to be compared with eligible midfielders for shooting and scoring.",
    ],
    [
      "eligible, team defence",
      { status: "eligible", tier: null, group: "GK", kind: "team_defence" },
      "A regular at Calder State for enough seasons in a row to be compared.",
    ],
    [
      "needs more minutes, forward",
      { status: "needs_minutes", tier: null },
      "A tier needs 900 minutes this season, or 600 in each of the last two seasons as a forward or midfielder at Calder State.",
    ],
    [
      "needs more minutes, midfielder",
      { status: "needs_minutes", tier: null, group: "M" },
      "A tier needs 900 minutes this season, or 600 in each of the last two seasons as a forward or midfielder at Calder State.",
    ],
    [
      "needs more minutes, defender under the floor",
      {
        status: "needs_minutes",
        tier: null,
        group: "D",
        kind: "team_defence",
        basis: { minutes: 635, matches: 9, seasons: [2026], class_year: "Senior" },
      },
      "The team defence tier needs a regular: 900 minutes and 70% of Calder State's minutes in a season.",
    ],
    [
      "needs more minutes, defender over the floor but under the share",
      {
        status: "needs_minutes",
        tier: null,
        group: "D",
        kind: "team_defence",
        basis: { minutes: 1080, matches: 16, seasons: [2026], class_year: "Junior" },
      },
      "The team defence tier needs a regular: 900 minutes and 70% of Calder State's minutes in a season. The 1,080 below clear the 900 but fall short of the 70%.",
    ],
    [
      "needs more minutes, goalkeeper under the floor",
      {
        status: "needs_minutes",
        tier: null,
        group: "GK",
        kind: "team_defence",
        basis: { minutes: 164, matches: 3, seasons: [2026], class_year: "Sophomore" },
      },
      "The team defence tier needs a regular: 600 minutes and 50% of Calder State's minutes in a season.",
    ],
    [
      "needs more minutes, goalkeeper over the floor but under the share",
      {
        status: "needs_minutes",
        tier: null,
        group: "GK",
        kind: "team_defence",
        basis: { minutes: 642, matches: 8, seasons: [2026], class_year: "Junior" },
      },
      "The team defence tier needs a regular: 600 minutes and 50% of Calder State's minutes in a season. The 642 below clear the 600 but fall short of the 50%.",
    ],
    [
      "needs a second season",
      { status: "needs_second_season", tier: null, group: "GK", kind: "team_defence" },
      "A regular in defence or goal at Calder State this season, but not the season before. The team defence tier needs two such seasons in a row.",
    ],
    [
      "incomplete, no minutes",
      { status: "incomplete", tier: null, reason: "no_minutes" },
      "Calder State's box scores print minutes for too few matches, and its season statistics give none for this player, so playing time cannot be counted.",
    ],
    [
      "incomplete, no position",
      { status: "incomplete", tier: null, reason: "no_position", group: null, kind: null },
      "Neither Calder State's roster nor its box scores give a position for this player.",
    ],
    [
      "incomplete, identity",
      { status: "incomplete", tier: null, reason: "identity", group: "M" },
      "The name could not be matched from one Calder State box score to the next, so the season cannot be counted fairly.",
    ],
    [
      "incomplete, few matches",
      { status: "incomplete", tier: null, reason: "few_matches", group: "D", kind: "team_defence" },
      "Fewer than twelve of Calder State's matches were collected, too few to compare its defending.",
    ],
  ];
  test.each(cases)("%s", (_, over, sentence) => {
    expect(meaningLine(entry(over), P)).toBe(sentence);
  });
});

// ── The basis ───────────────────────────────────────────────────────────────

describe("the basis line", () => {
  test("one season", () => {
    expect(basisLine(entry().basis)).toBe("1,412 minutes · 17 appearances · season 2026 · Junior");
  });
  test("two seasons, summed, and says seasons", () => {
    expect(
      basisLine({ minutes: 2744, matches: 35, seasons: [2025, 2026], class_year: "Senior" }),
    ).toBe("2,744 minutes · 35 appearances · seasons 2025 and 2026 · Senior");
  });
  test("three seasons, joined by 'to', never a hyphen", () => {
    expect(
      basisLine({ minutes: 4842, matches: 54, seasons: [2024, 2025, 2026], class_year: "Sr." }),
    ).toBe("4,842 minutes · 54 appearances · seasons 2024 to 2026 · Sr.");
  });
  test("no class year printed: the item is left out, never 'unknown'", () => {
    expect(basisLine({ minutes: 640, matches: 12, seasons: [2026], class_year: null })).toBe(
      "640 minutes · 12 appearances · season 2026",
    );
  });
  test("the class year reads as the sheet's bio reads it", () => {
    expect(basisLine({ minutes: 90, matches: 1, seasons: [2026], class_year: "3rd Year" })).toBe(
      "90 minutes · 1 appearance · season 2026 · Junior",
    );
    expect(
      basisLine({ minutes: 1, matches: 1, seasons: [2026], class_year: "Graduate Student" }),
    ).toBe("1 minute · 1 appearance · season 2026 · Graduate Student");
  });
  test("seasons that are not consecutive are listed, not spanned", () => {
    expect(seasonsPhrase([2022, 2024, 2026])).toBe("seasons 2022, 2024 and 2026");
  });
});

// ── The team figures ────────────────────────────────────────────────────────

describe("the team figures", () => {
  const division = { teams: 198, shots_faced_per_match: 12.3, pct_in: 12.8 };

  test("two rows beside the division's, one sentence, and the note", () => {
    const f = tierFigures({ team: team(), division }, "Calder State", 2026);
    expect(f?.caption).toEqual({
      head: "CALDER STATE'S DEFENCE, 2026",
      workload: "HEAVY WORKLOAD",
    });
    expect(f?.rows).toEqual([
      { label: "Shots faced a match", team: "16.4", division: "12.3", absent: null },
      { label: "Shots faced that went in", team: "8.1%", division: "12.8%", absent: null },
    ]);
    expect(f?.goals).toBe("Gave up 24 goals where its opponents usually score 31.");
    expect(f?.note).toBe("The same for every regular defender and goalkeeper at Calder State.");
  });

  test("a whole figure keeps its decimal", () => {
    const f = tierFigures(
      { team: team({ shots_faced_per_match: 12 }), division },
      "Calder State",
      2026,
    );
    expect(f?.rows[0]?.team).toBe("12.0");
  });

  test("pct_in null prints the site's dash, and says why to a screen reader", () => {
    const f = tierFigures({ team: team({ pct_in: null }), division }, "Calder State", 2026);
    expect(f?.rows[1]).toEqual({
      label: "Shots faced that went in",
      team: "—",
      division: "12.8%",
      absent: "No shots faced were recorded.",
    });
  });

  test("incomplete records print no basis line; every other status prints one", () => {
    const f = file();
    const block = (over: Partial<TierEntry>) => tierBlock(entry(over), f, "calder", "Calder State");
    // Minutes that cannot be counted fairly are not offered as what a status rests on.
    expect(block({ status: "incomplete", tier: null, reason: "identity" }).basis).toBeNull();
    expect(block({ status: "incomplete", tier: null, reason: "no_minutes" }).basis).toBeNull();
    expect(block({ status: "needs_minutes", tier: null }).basis).toBe(
      "1,412 minutes · 17 appearances · season 2026 · Junior",
    );
    expect(block({ status: "eligible", tier: null }).basis).not.toBeNull();
  });

  test("the season line is read off the sheet's own MINUTES note", () => {
    expect(seasonLineOf(null)).toBeNull();
    expect(
      seasonLineOf({ played: 1683, note: "1683 / 1800 · 20 appearances, 20 starts" }, 1679),
    ).toEqual({ played: 1683, appearances: 20, keeperTable: 1679, since: false });
    expect(
      seasonLineOf({ played: 56, note: "56 / 1620 · 1 appearance, 0 starts" }, null, true),
    ).toEqual({
      played: 56,
      appearances: 1,
      keeperTable: null,
      since: true,
    });
    // A note in another shape still gives its minutes; the appearances are not guessed.
    expect(seasonLineOf({ played: 90, note: "90 minutes" })?.appearances).toBeNull();
  });

  test("the basis says where its count comes from when it is not the MINUTES line's", () => {
    const one = (minutes: number, matches: number, over: Partial<TierEntry> = {}) =>
      entry({
        status: "needs_second_season",
        tier: null,
        group: "D",
        kind: "team_defence",
        basis: { minutes, matches, seasons: [2026], class_year: "Fr." },
        ...over,
      });
    const line = (
      played: number,
      appearances: number | null,
      keeperTable: number | null = null,
      since = false,
    ) => ({
      played,
      appearances,
      keeperTable,
      since,
    });
    // The two agree, or the sheet prints no line: nothing to say.
    expect(basisNote(one(1412, 17), line(1412, 17))).toBeNull();
    expect(basisNote(one(1412, 17), null)).toBeNull();
    // The stats page says 266 minutes in 3 matches; the box scores print 1,434 in 18.
    expect(basisNote(one(1434, 18), line(266, 3))).toBe(
      "Counted from the box scores, which differ from the stats page's totals above.",
    );
    // Fewer in the box scores than on the stats page is said the same way.
    expect(basisNote(one(1360, 21), line(1414, 22))).toBe(
      "Counted from the box scores, which differ from the stats page's totals above.",
    );
    // A keeper whose minutes are the goalkeeping table's, beside a bar that reads the player table.
    expect(basisNote(one(1620, 18, { group: "GK" }), line(90, 1, 1620))).toBe(
      "Counted from the stats page's goalkeeping table.",
    );
    // Minutes agree and appearances do not.
    expect(basisNote(one(1412, 19), line(1412, 17))).toBe(
      "Appearances are counted from the box scores, which differ from the stats page's count above.",
    );
    // A line that prints no appearances is compared on minutes alone.
    expect(basisNote(one(1412, 19), line(1412, null))).toBeNull();
    // A sum over seasons names its seasons and is not the season's line.
    expect(
      basisNote(
        entry({ basis: { minutes: 2390, matches: 41, seasons: [2025, 2026], class_year: "Jr." } }),
        line(1414, 22),
      ),
    ).toBeNull();
    // Incomplete records print no basis, so nothing to explain.
    expect(
      basisNote(one(736, 10, { status: "incomplete", reason: "no_minutes" }), line(300, 5)),
    ).toBeNull();
    // Once the programme has played since the tiers were set, a difference is
    // said as that: the line above has run on, and the source of a count
    // cannot be told apart from a later match.
    const since =
      "Counted to the day the tier was set; the line above includes matches played since.";
    expect(basisNote(one(1434, 18), line(1524, 19, null, true))).toBe(since);
    expect(basisNote(one(1412, 17), line(1412, 18, null, true))).toBe(since);
    expect(basisNote(one(1620, 18, { group: "GK" }), line(90, 1, 1620, true))).toBe(since);
    // Played since, and nothing differs: this player did not appear again.
    expect(basisNote(one(1412, 17), line(1412, 17, null, true))).toBeNull();
  });

  test("a programme has played since the freeze when a scored match is dated on or after it", () => {
    const fixtureOn = (date: string, scored: boolean) => ({
      date,
      home: "calder",
      away: "elsewhere",
      status: scored ? "final" : "scheduled",
      home_score: scored ? 1 : null,
      away_score: scored ? 0 : null,
    });
    const seasonOf = (...fixtures: ReturnType<typeof fixtureOn>[]) =>
      ({ fixtures: { fixtures } }) as unknown as Parameters<typeof playedSince>[0];
    // The freeze holds matches to the day before it.
    expect(playedSince(seasonOf(fixtureOn("2026-11-15", true)), "calder", "2026-11-16")).toBe(
      false,
    );
    expect(playedSince(seasonOf(fixtureOn("2026-11-16", true)), "calder", "2026-11-16")).toBe(true);
    expect(playedSince(seasonOf(fixtureOn("2026-11-20", true)), "calder", "2026-11-16")).toBe(true);
    // A match still to be played, or somebody else's, is not one.
    expect(playedSince(seasonOf(fixtureOn("2026-11-20", false)), "calder", "2026-11-16")).toBe(
      false,
    );
    expect(playedSince(seasonOf(fixtureOn("2026-11-20", true)), "nobody", "2026-11-16")).toBe(
      false,
    );
  });

  test("the block carries the note only when the page hands it the sheet's line", () => {
    const f = file();
    const e = entry({ status: "needs_minutes", tier: null });
    expect(tierBlock(e, f, "calder", "Calder State").basisNote).toBeNull();
    expect(
      tierBlock(e, f, "calder", "Calder State", {
        played: 1300,
        appearances: 17,
        keeperTable: null,
        since: false,
      }).basisNote,
    ).toBe("Counted from the box scores, which differ from the stats page's totals above.");
  });

  test("the goals sentence rounds half up and prints both counts as numerals", () => {
    expect(goalsLine(team({ goals_conceded: 24, opponents_usual: 30.5 }))).toBe(
      "Gave up 24 goals where its opponents usually score 31.",
    );
    expect(goalsLine(team({ goals_conceded: 12, opponents_usual: 15.4 }))).toBe(
      "Gave up 12 goals where its opponents usually score 15.",
    );
    expect(goalsLine(team({ goals_conceded: 1, opponents_usual: 2.2 }))).toBe(
      "Gave up 1 goal where its opponents usually score 2.",
    );
    expect(goalsLine(team({ opponents_usual: null }))).toBeNull();
  });

  test("no figures without a recorded match", () => {
    expect(
      tierFigures({ team: team({ shots_faced_per_match: null }), division }, "Calder State", 2026),
    ).toBeNull();
  });
});

// ── The block ───────────────────────────────────────────────────────────────

describe("the team defence badge", () => {
  const def = entry({ group: "D", kind: "team_defence", status: "eligible", tier: null });
  const badged = (over: Partial<TiersFile> = {}) =>
    file({ teams: { calder: team({ badge: true }) }, players: { calder: [def] }, ...over });

  test("a regular defender's sheet carries the team's figures, and the badge when the team holds it", () => {
    const d = sheetDefence(badged(), "calder", "Calder State", { name: "Tomas Ferreira" });
    expect(d?.badge).toBe(badgeLine("Calder State", 2026));
    expect(d?.figures.rows.map((r) => r.label)).toEqual([
      "Shots faced a match",
      "Shots faced that went in",
    ]);
    const plain = sheetDefence(file({ players: { calder: [def] } }), "calder", "Calder State", {
      name: "Tomas Ferreira",
    });
    expect(plain?.badge).toBeNull();
    expect(plain?.figures).not.toBeNull();
  });

  test("the defence entry is never drawn as a tier, on any level", () => {
    for (const level of ["d1", "d2"] as const) {
      expect(
        sheetTier(badged({ level }), "calder", "Calder State", { name: "Tomas Ferreira" }),
      ).toBeNull();
    }
  });

  test("no figures for a player who is not a regular, or for a forward", () => {
    for (const e of [
      entry({ group: "D", kind: "team_defence", status: "needs_minutes", tier: null }),
      entry({
        group: "D",
        kind: "team_defence",
        status: "incomplete",
        tier: null,
        reason: "few_matches",
      }),
      entry(),
    ]) {
      expect(
        sheetDefence(badged({ players: { calder: [e] } }), "calder", "Calder State", {
          name: "Tomas Ferreira",
        }),
      ).toBeNull();
    }
  });

  test("the team page names this season's badge and the earlier ones, oldest first", () => {
    const earlier = (held: number[]) => (y: number) =>
      file({ season: y, teams: { calder: team({ badge: held.includes(y) }) } });
    expect(teamBadge(badged(), "calder", "Calder State", earlier([2023, 2025]))).toEqual({
      line: badgeLine("Calder State", 2026),
      earlier: [2023, 2025],
    });
    expect(teamBadge(file(), "calder", "Calder State", earlier([2024]))).toEqual({
      line: null,
      earlier: [2024],
    });
    expect(teamBadge(file(), "calder", "Calder State", earlier([]))).toBeNull();
    expect(teamBadge(badged({ level: "d3" }), "calder", "Calder State", () => null)).toBeNull();
  });

  test("the earlier seasons in words", () => {
    expect(badgeYears([])).toBeNull();
    expect(badgeYears([2025])).toBe("2025");
    expect(badgeYears([2023, 2025])).toBe("2023 and 2025");
    expect(badgeYears([2022, 2024, 2025])).toBe("2022, 2024 and 2025");
  });
});

describe("the block", () => {
  const f = file();

  test("the source line carries the freeze date in the site's own form", () => {
    expect(sourceLine("2026-11-16")).toBe("Set on November 16 from the published box scores.");
    expect(sourceLine("2026-11-02")).toBe("Set on November 2 from the published box scores.");
  });

  test("figures only for regular defenders and goalkeepers", () => {
    const figs = (over: Partial<TierEntry>) =>
      tierBlock(entry(over), f, "calder", "Calder State").figures !== null;
    expect(figs({})).toBe(false);
    expect(figs({ status: "eligible", tier: null })).toBe(false);
    expect(figs({ group: "D", kind: "team_defence" })).toBe(true);
    expect(figs({ status: "eligible", tier: null, group: "GK", kind: "team_defence" })).toBe(true);
    expect(
      figs({ status: "needs_second_season", tier: null, group: "GK", kind: "team_defence" }),
    ).toBe(true);
    expect(figs({ status: "needs_minutes", tier: null, group: "D", kind: "team_defence" })).toBe(
      false,
    );
    expect(
      figs({
        status: "incomplete",
        tier: null,
        reason: "few_matches",
        group: "D",
        kind: "team_defence",
      }),
    ).toBe(false);
  });

  test("a sheet with no entry in the file shows no block", () => {
    expect(sheetTier(f, "calder", "Calder State", { name: "Nobody Here" })).toBeNull();
    expect(sheetTier(f, "elsewhere", "Elsewhere", { name: "Tomas Ferreira" })).toBeNull();
  });

  test("matched on the page id, the collector's fold of the name, and the number", () => {
    const byId = sheetTier(f, "calder", "Calder State", {
      name: "T. Ferreira",
      source_url: "https://example.edu/roster/tomas-ferreira/101",
    });
    expect(byId?.holder).toBe("Tier 1, shooting and scoring");
    // "Ferreira, Tomás" folds to the artifact's key; the site's own foldName
    // would not (it keeps the order and the space).
    const byName = sheetTier(
      file({ players: { calder: [entry({ player_id: null })] } }),
      "calder",
      "Calder State",
      { name: "Ferreira, Tomás", number: "09" },
    );
    expect(byName?.status.head).toBe("Tier 1");
  });
});

// ── CAREER ──────────────────────────────────────────────────────────────────

describe("the CAREER line", () => {
  test("one earlier tier", () => {
    expect(
      careerTiersLine([{ season: 2025, label: { head: "Team defence tier", kind: null } }]),
    ).toBe("Earlier seasons: Team defence tier in 2025.");
  });

  test("several, oldest first", () => {
    expect(
      careerTiersLine([
        { season: 2024, label: { head: "Tier 2", kind: "Shooting and scoring" } },
        { season: 2025, label: { head: "Tier 1", kind: "Shooting and scoring" } },
      ]),
    ).toBe(
      "Earlier seasons: Tier 2 · Shooting and scoring in 2024; Tier 1 · Shooting and scoring in 2025.",
    );
  });

  test("none says nothing", () => {
    expect(careerTiersLine([])).toBeNull();
  });

  test("read from the earlier seasons' own files, by name, and only where a tier is held", () => {
    const now = file();
    const earlier: Record<number, TiersFile> = {
      2023: file({
        season: 2023,
        players: { calder: [entry({ player_id: "7", status: "needs_minutes", tier: null })] },
      }),
      2024: file({ season: 2024, players: { calder: [entry({ player_id: "8", tier: 2 })] } }),
      2025: file({ season: 2025, players: { calder: [entry({ player_id: "9" })] } }),
    };
    const items = earlierTiers(
      now,
      "calder",
      { name: "Tomas Ferreira", number: "9" },
      (y) => earlier[y] ?? null,
    );
    expect(items.map((t) => t.season)).toEqual([2024, 2025]);
    expect(careerTiersLine(items)).toBe(
      "Earlier seasons: Tier 2 · Shooting and scoring in 2024; Tier 1 · Shooting and scoring in 2025.",
    );
  });
});

// ── What may never reach a page ─────────────────────────────────────────────

describe("a block prints only what section 10 holds", () => {
  const FORBIDDEN =
    /\b(score|scores|rank|ranks|ranking|estimate|estimates|percentile|percentiles|threat|record)\b/i;

  test("no block built from the real files carries a field named for one", () => {
    const keys = new Set<string>();
    const walk = (x: unknown): void => {
      if (Array.isArray(x)) x.forEach(walk);
      else if (x && typeof x === "object") {
        for (const [k, v] of Object.entries(x)) {
          keys.add(k);
          walk(v);
        }
      }
    };
    for (const gender of ["men", "women"]) {
      const t = loadTiers("d2", 2026, gender, ROOT) as TiersFile;
      for (const [slug, list] of Object.entries(t.players)) {
        for (const e of list) walk(tierBlock(e, t, slug, "Calder State") satisfies SheetTier);
      }
    }
    expect([...keys].filter((k) => FORBIDDEN.test(k))).toEqual([]);
  });

  test("a level with no tiers renders none of it, in preview too", () => {
    expect(activeTiers("d3", 2026, "men", "1")).toBeNull();
    expect(tiersEnabled("d3", "1", { published: true })).toBe(false);
  });
});
