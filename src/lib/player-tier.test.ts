// The tier's display: the publication gate, every sentence the sheet composes
// about a tier, and what may never reach a page. The sentences are pinned
// word for word here because they are fixed strings around figures from a
// frozen file; copy.test.ts holds the same sentences, composed for every real
// player, to the house's rules about form.

import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { tiersConfig, tiersEnabled } from "../tiers.config.ts";
import {
  activeTiers,
  basisLine,
  careerTiersLine,
  earlierTiers,
  goalsLine,
  holderLine,
  labelText,
  meaningLine,
  type SheetTier,
  seasonsPhrase,
  sheetTier,
  sourceLine,
  statusLabel,
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
  ...over,
});

function file(over: Partial<TiersFile> = {}): TiersFile {
  return {
    schema: "touchline-ui.tiers/1",
    level: "d2",
    season: 2026,
    gender: "men",
    spec: "player-tiers/0.6",
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
  const live = { published: true, correctionsContact: "corrections@example.org" };
  const rows: [string, string | undefined, typeof live | typeof tiersConfig, boolean][] = [
    // Division II: published with a contact, or the preview variable.
    ["d2", undefined, { published: false, correctionsContact: null }, false],
    ["d2", undefined, { published: true, correctionsContact: null }, false],
    ["d2", undefined, { published: true, correctionsContact: "   " }, false],
    ["d2", undefined, { published: false, correctionsContact: "corrections@example.org" }, false],
    ["d2", undefined, live, true],
    ["d2", "1", { published: false, correctionsContact: null }, true],
    ["d2", "1", live, true],
    ["d2", "0", { published: false, correctionsContact: null }, false],
    ["d2", "true", { published: false, correctionsContact: null }, false],
    ["d2", "", { published: false, correctionsContact: null }, false],
    // Any other level: nothing, in preview too.
    ["d1", undefined, live, false],
    ["d1", "1", live, false],
    ["d1", "1", { published: false, correctionsContact: null }, false],
    ["d3", "1", live, false],
  ];
  test.each(rows)("level %s, preview %p, %o → %p", (level, preview, config, open) => {
    expect(tiersEnabled(level, preview, config)).toBe(open);
  });

  test("ships closed: unpublished and with no contact", () => {
    expect(tiersConfig.published).toBe(false);
    expect(tiersConfig.correctionsContact).toBeNull();
    expect(tiersEnabled("d2", undefined)).toBe(false);
  });

  test("activeTiers is the season's file only with the gate open, and never for Division I", () => {
    expect(activeTiers("d2", 2026, "men", "0")).toBeNull();
    expect(activeTiers("d1", 2026, "men", "1")).toBeNull();
    expect(activeTiers("d2", 2026, "men", "1")?.season).toBe(2026);
    // No file for the season: nothing, even with the gate open.
    expect(activeTiers("d2", 2019, "men", "1")).toBeNull();
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
      "A tier needs 900 minutes this season, or 600 in each of the last two seasons at Calder State.",
    ],
    [
      "needs more minutes, midfielder",
      { status: "needs_minutes", tier: null, group: "M" },
      "A tier needs 900 minutes this season, or 600 in each of the last two seasons at Calder State.",
    ],
    [
      "needs more minutes, defender",
      { status: "needs_minutes", tier: null, group: "D", kind: "team_defence" },
      "The team defence tier needs a regular: 900 minutes and 70% of Calder State's minutes in a season.",
    ],
    [
      "needs more minutes, goalkeeper",
      { status: "needs_minutes", tier: null, group: "GK", kind: "team_defence" },
      "The team defence tier needs a regular: 600 minutes and 50% of Calder State's minutes in a season.",
    ],
    [
      "needs a second season",
      { status: "needs_second_season", tier: null, group: "GK", kind: "team_defence" },
      "A regular this season. The team defence tier needs two seasons in a row as a regular at Calder State.",
    ],
    [
      "incomplete, no minutes",
      { status: "incomplete", tier: null, reason: "no_minutes" },
      "Calder State's box scores print no minutes, so playing time cannot be counted.",
    ],
    [
      "incomplete, no position",
      { status: "incomplete", tier: null, reason: "no_position", group: null, kind: null },
      "Calder State's roster lists no position for this player.",
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

  test("the goals sentence rounds half up and spells numbers to twenty", () => {
    expect(goalsLine(team({ goals_conceded: 24, opponents_usual: 30.5 }))).toBe(
      "Gave up 24 goals where its opponents usually score 31.",
    );
    expect(goalsLine(team({ goals_conceded: 12, opponents_usual: 15.4 }))).toBe(
      "Gave up twelve goals where its opponents usually score fifteen.",
    );
    expect(goalsLine(team({ goals_conceded: 1, opponents_usual: 2.2 }))).toBe(
      "Gave up one goal where its opponents usually score two.",
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

  test("a Division I build renders none of it, in preview too", () => {
    expect(activeTiers("d1", 2026, "men", "1")).toBeNull();
    expect(tiersEnabled("d1", "1", { published: true, correctionsContact: "x@example.org" })).toBe(
      false,
    );
  });
});
