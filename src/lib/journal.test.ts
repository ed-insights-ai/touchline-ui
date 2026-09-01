/**
 * The parts of the season page that stopped being writing.
 *
 * A journal file may still carry a kicker and a chart caption — every file on
 * disk when this was written did — and the page renders neither. Both were
 * slots where a model was asked for a fact the page already held, and both
 * went wrong in the same week: three journals wrote three vocabularies for one
 * table state on a single morning, and a caption dated a chart "through
 * September 1" beside a chip that dated it "through Aug 31".
 *
 * So these tests hold two lines. The composed strings are the page's own and
 * are checked here; the tolerance is checked too, because a journal that no
 * longer parses is a page that falls back to its floor, and dropping a field
 * from the schema would do that to every file already written.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { site } from "../site.config.ts";
import {
  fixtureCount,
  loadSeason,
  outsideRecord,
  type Season,
  scoredCount,
  tableIsLive,
} from "./derive.ts";
import { dayOfMonth, dowShort, monShort } from "./format.ts";
import {
  CHART_CAPTION,
  defaultKicker,
  editorial,
  headlineForm,
  type JournalFile,
  journalFileSchema,
  loadJournal,
  PHASE_BEFORE,
  PHASE_LIVE,
  seasonStrip,
} from "./journal.ts";

const seasons = site.conferences.map((k) => loadSeason(k));
const anySeason = seasons[0] as Season;
/** A real journal, to lay over a season with fields changed. */
const anyJournal = seasons.map((s) => loadJournal(s)).find((j) => j !== null) as JournalFile;

/** A season with one member-vs-member final counted as a conference match,
 *  which is the only difference between the two table phases.
 *
 *  Copied, never mutated: loadSeason hands out a cached object, and a season
 *  edited in place would follow every other test in this file. The conditions
 *  are computeTable's own — a final, not an exhibition, both sides members,
 *  both scores present — because a fixture failing any of them would leave the
 *  table empty and the test asserting the live phrase against a dead season. */
function madeLive(): Season {
  for (const s of seasons) {
    if (tableIsLive(s)) return s;
    const members = new Set(s.fixtures.programmes.map((p) => p.slug));
    const target = s.fixtures.fixtures.find(
      (f) =>
        f.status === "final" &&
        f.match_type !== "exhibition" &&
        members.has(f.home) &&
        members.has(f.away) &&
        typeof f.home_score === "number" &&
        typeof f.away_score === "number",
    );
    if (!target) continue;
    return {
      ...s,
      fixtures: {
        ...s.fixtures,
        fixtures: s.fixtures.fixtures.map((f) =>
          f.id === target.id ? { ...f, conference_game: true } : f,
        ),
      },
    };
  }
  throw new Error("no collected conference has a member-vs-member final to make a table from");
}

describe("the kicker is the page's own, in one vocabulary", () => {
  test("before the table, it names the phase and the collect date", () => {
    for (const s of seasons) {
      if (tableIsLive(s)) continue;
      expect(defaultKicker(s)).toBe(
        `${s.fixtures.conference} · ${PHASE_BEFORE} · ${dowShort(s.asOf)} ${monShort(s.asOf)} ${dayOfMonth(s.asOf)}`.toUpperCase(),
      );
    }
  });

  test("with the table live, it says what the national cards say", () => {
    // Not "NON-CONFERENCE", not "22 DAYS TO CONFERENCE" — the two other
    // phrases three journals reached for on the morning this was written. The
    // phase is a fact about the table, and one string serves both surfaces.
    const live = madeLive();
    expect(tableIsLive(live)).toBe(true);
    expect(defaultKicker(live)).toContain(PHASE_LIVE);
    expect(defaultKicker(live)).not.toContain(PHASE_BEFORE);
  });

  test("a journal's own kicker is parsed and ignored", () => {
    const journal = { ...anyJournal, kicker: "ANYTHING AT ALL · WHENEVER" };
    expect(journalFileSchema.parse(journal).kicker).toBe("ANYTHING AT ALL · WHENEVER");
    expect(editorial(anySeason, journal).kicker).toBe(defaultKicker(anySeason));
  });
});

describe("the chart's caption is the page's own", () => {
  test("it carries no date, because the chip above it does", () => {
    expect(CHART_CAPTION).not.toMatch(/\d/);
    expect(CHART_CAPTION).not.toMatch(/through/i);
  });

  test("the page reads no caption from the journal", () => {
    // The surface is an .astro file this test cannot import, so it is read.
    // Reintroducing the journal's caption is exactly the regression the
    // treatment exists to prevent, and it would be invisible to every other
    // test here: the journals on disk still carry one.
    const page = readFileSync(join(import.meta.dir, "../pages/[conference]/index.astro"), "utf8");
    expect(page).toMatch(/<figcaption[^>]*>\{CHART_CAPTION\}<\/figcaption>/);
    expect(page).not.toMatch(/\.caption/);
  });
});

describe("the lede's stamp is a fact about the sentence", () => {
  test("a journal with a stamp renders the day the lede last changed", () => {
    expect(editorial(anySeason, { ...anyJournal, lede_updated: "2026-08-27" }).stamp).toBe(
      "UPDATED AUG 27",
    );
  });

  test("a lede that changed on the collect date carries no stamp: the dateline says it", () => {
    expect(editorial(anySeason, { ...anyJournal, lede_updated: anySeason.asOf }).stamp).toBe(null);
  });

  test("a journal with no stamp renders none, rather than today", () => {
    const { lede_updated, ...without } = anyJournal;
    expect(editorial(anySeason, without as JournalFile).stamp).toBe(null);
  });

  test("the data-only page never carries one", () => {
    // Its headline is recomputed from the fixtures on every collect, so a tag
    // saying it changed today would be true every day and mean nothing.
    const floor = editorial(anySeason, null);
    expect(floor.fromJournal).toBe(false);
    expect(floor.stamp).toBe(null);
  });
});

describe("a headline is not a sentence", () => {
  test("a trailing full stop comes off, and only that", () => {
    expect(headlineForm("Gulf South sides break even outside the conference.")).toBe(
      "Gulf South sides break even outside the conference",
    );
    // A question mark was meant; an abbreviation's stop is not the end.
    expect(headlineForm("Nobody at home yet?")).toBe("Nobody at home yet?");
    expect(headlineForm("St. Mary's still winless")).toBe("St. Mary's still winless");
    expect(headlineForm("  Two unbeaten sides left.  ")).toBe("Two unbeaten sides left");
  });

  test("the page applies it to the journal's headline and never to the dek", () => {
    const lede = editorial(anySeason, {
      ...anyJournal,
      headline: "A sentence with a stop.",
      dek: "The dek keeps its stops. Both of them.",
    });
    expect(lede.headline).toBe("A sentence with a stop");
    expect(lede.dek).toBe("The dek keeps its stops. Both of them.");
  });

  test("the data-only headline keeps the form on its own", () => {
    expect(editorial(anySeason, null).headline).not.toMatch(/\.$/);
  });
});

describe("the season page's order and keys", () => {
  const page = readFileSync(join(import.meta.dir, "../pages/[conference]/index.astro"), "utf8");

  test("the week's docket sits under the featured pair, not under the season line", () => {
    const spine = page.indexOf("<SeasonSpine");
    const featured = page.indexOf('<section class="featured">');
    const week = page.indexOf("<TheWeek");
    const players = page.indexOf("PLAYERS TO WATCH");
    expect(spine).toBeGreaterThan(-1);
    expect(week).toBeGreaterThan(featured);
    expect(week).toBeLessThan(players);
  });

  test("the pattern's head keys the chips where a reader first meets them", () => {
    expect(page).toContain("●●●</i>observed");
    expect(page).toContain("●●○</i>derived");
    expect(page).toMatch(/open a line for its figures/);
  });

  test("the dek is the story's opening paragraph, and reads in serif on both surfaces", () => {
    const mast = readFileSync(join(import.meta.dir, "../components/SeasonMasthead.astro"), "utf8");
    expect(mast).toContain('class="dek serif"');
    const home = readFileSync(join(import.meta.dir, "../pages/index.astro"), "utf8");
    // Only a journal writes a headline, so a headline is the tell that the
    // dek beneath it is story rather than the floor's openers.
    expect(home).toMatch(/lede\.headline \? "nat-dek nat-lede serif" : "nat-dek"/);
  });

  test("the season line keys its marks with the legend and prints no caption", () => {
    const spine = readFileSync(join(import.meta.dir, "../components/SeasonSpine.astro"), "utf8");
    expect(spine).toContain("sp-legend");
    expect(spine).not.toContain("sp-note");
    expect(spine).not.toContain("A mark for each playing date");
  });
});

describe("the figures strip is the page's own", () => {
  test("the played count leads, and the cells add up", () => {
    for (const s of seasons) {
      const cells = seasonStrip(s);
      expect(cells[0]).toBe(`${scoredCount(s)} OF ${fixtureCount(s)} PLAYED`);
      const out = outsideRecord(s);
      const between = scoredCount(s) - out.played;
      if (out.played > 0) {
        expect(cells).toContain(
          `${out.won}–${out.drawn}–${out.lost} AGAINST NON-CONFERENCE OPPONENTS`,
        );
        expect(cells).toContain(`${out.goalsFor} SCORED, ${out.goalsAgainst} CONCEDED`);
      }
      // A reader adding the record to the between-members cell reaches the
      // played count; the cell prints only when there is something to add.
      const betweenCell = cells.find((c) => c.endsWith(`BETWEEN ${s.fixtures.conference} SIDES`));
      if (between > 0)
        expect(betweenCell).toBe(`${between} BETWEEN ${s.fixtures.conference} SIDES`);
      else expect(betweenCell).toBeUndefined();
    }
  });

  test("no silent-final count, by ruling: the season line carries them", () => {
    for (const s of seasons) for (const c of seasonStrip(s)) expect(c).not.toMatch(/SILENT/);
    const mast = readFileSync(join(import.meta.dir, "../components/SeasonMasthead.astro"), "utf8");
    expect(mast).not.toContain("SILENT");
    // The coverage line no longer prints the count; the gaps panel's own
    // heading still says "matches played", which is a different sentence.
    expect(mast).not.toContain("{counts.played} OF {counts.total}");
    expect(mast).toContain('class="strip num"');
    const spine = readFileSync(join(import.meta.dir, "../components/SeasonSpine.astro"), "utf8");
    expect(spine).toContain("score gap");
    expect(spine).toContain("in the books");
    expect(spine).not.toContain("gone by");
    expect(spine).not.toContain("a silence stands");
  });
});

describe("every journal already written still parses", () => {
  const dir = join(import.meta.dir, "../../journal");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.includes("validation"));

  test("there are journals here to check", () => {
    // Without this the loop below passes on an empty directory, which is the
    // shape a tolerance test fails in silently.
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    test(`${file} parses, ignored fields and all`, () => {
      const raw = JSON.parse(readFileSync(join(dir, file), "utf8"));
      if (raw.schema !== "touchline.journal/1") return;
      expect(() => journalFileSchema.parse(raw)).not.toThrow();
    });
  }
});
