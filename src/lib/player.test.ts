/**
 * What a player card is allowed to say about a player.
 *
 * The failure this file exists to prevent has a shape worth naming, because it
 * looked correct on the page for as long as it shipped: the card read a
 * player's ABSENCE FROM THE ROSTER ARCHIVE as a fact about the player, and
 * printed "A true freshman — no earlier seasons in the archive."
 *
 * The archive is not a birth certificate. It begins in 2022 for the LSC and
 * 2016 for the GAC and GSC, it holds three conferences and no others, and a
 * transfer from a fourth is archive-new on the day he arrives however many
 * seasons he has played. Ryan Armijo of Ouachita Baptist appears in no earlier
 * roster file and the 2026 roster publishes him a Junior; the card called him a
 * freshman, contradicting a published figure printed six lines above it.
 *
 * So the rule these tests hold: the derived copy states what the archive holds
 * and never what it implies. A class year belongs to the programme that
 * published it, and appears on the card only where the card is quoting it.
 *
 * Counts are not pinned, per the house rule — the data is re-collected daily
 * and a pinned figure would fail on the collect rather than on the code. The
 * one census below is a floor, and it is there so the sweep cannot pass by
 * finding nothing to sweep.
 */

import { describe, expect, test } from "bun:test";
import { site } from "../site.config.ts";
import { cleanSheetsOf, type Fixture, loadSeason, resultsOf, squadOf } from "./derive.ts";
import { classAbbr } from "./format.ts";
import type { MatchesFile } from "./model.ts";
import {
  cleanSheetFigure,
  countCleanSheets,
  keeperSentence,
  playerCard,
  strikeSentence,
  sumColumn,
} from "./player.ts";

const ARCHIVE_NEW = "First season in this programme's archive";

/** Every rostered player in every conference, with the copy the card derives
 *  for them held apart from the copy it quotes off the roster. */
const everyCard = site.conferences.flatMap((key) => {
  const s = loadSeason(key);
  return Object.keys(s.rosters?.rosters ?? {}).flatMap((slug) =>
    squadOf(s, slug).map((m) => {
      const card = playerCard(s, slug, m.player, m.stats, m.keeper);
      return {
        key,
        slug,
        card,
        published: m.player.class_year,
        // The three sentences the card composes for itself. The bio is not
        // among them: it is the roster's own class year, quoted.
        derived: [card.tenure, card.career.note, card.finding?.text]
          .filter(Boolean)
          .join(" | ")
          .toLowerCase(),
      };
    }),
  );
});

const CLASS_WORDS = ["freshman", "sophomore", "junior", "senior"] as const;

describe("a card never claims a class year", () => {
  test("no derived sentence names a class the programme published otherwise", () => {
    const offenders = everyCard.filter((c) =>
      CLASS_WORDS.some(
        (word) => c.derived.includes(word) && !(c.published ?? "").toLowerCase().includes(word),
      ),
    );
    expect(
      offenders.map((c) => `${c.card.name} (${c.slug}): published ${c.published} — ${c.derived}`),
    ).toEqual([]);
  });

  test("the archive-new copy speaks about the archive, not about the player", () => {
    const archiveNew = everyCard.filter((c) => c.card.tenure === ARCHIVE_NEW);
    for (const c of archiveNew) {
      expect(c.derived).not.toContain("freshman");
      // The note is absent where the career table already has rows to show —
      // which an archive-new player can have, when an earlier season collected
      // a statistics line for a roster file it never collected.
      if (c.card.career.note !== null) expect(c.card.career.note).toContain("archive");
    }
  });

  test("archive-new is common enough that the sweep has something to sweep", () => {
    // The floor, not the figure: the LSC archive starts in 2022 and every
    // transfer from outside these three conferences lands here, so this set is
    // large by construction. On the 2026 men's collect it was 504 of 923
    // rostered players, 245 of whom publish a class above Freshman.
    const archiveNew = everyCard.filter((c) => c.card.tenure === ARCHIVE_NEW);
    const contradicted = archiveNew.filter((c) => {
      const ab = classAbbr(c.published);
      return ab !== null && ab !== "FR";
    });
    expect(archiveNew.length).toBeGreaterThan(0);
    expect(contradicted.length).toBeGreaterThan(0);
  });
});

describe("the three sites that read the archive cannot drift apart", () => {
  test("an archive-new player is never told how long they have been here", () => {
    // player.ts once gated this finding on a magic string equal to the tenure
    // line. Two copies of one sentence, and either could have been reworded.
    for (const c of everyCard.filter((c) => c.card.tenure === ARCHIVE_NEW)) {
      expect(c.card.finding?.label === "context" ? c.card.finding.text : "").not.toContain(
        "every season since",
      );
    }
  });

  test("a returning player's tenure names the year, never the archive", () => {
    for (const c of everyCard.filter(
      (c) => c.card.tenure !== null && c.card.tenure !== ARCHIVE_NEW,
    )) {
      expect(c.card.tenure).toMatch(/^On the roster since \d{4}$/);
    }
  });
});

/**
 * The card's two composed sentences, at the count that broke them.
 *
 * "One shots on target faced" is what the keeper sentence printed for every
 * keeper who had faced exactly one — the reading every keeper's season passes
 * through on its way to the second. The house spells its figures and keeps
 * doing so; only the noun moves.
 */
describe("the composed sentences agree with their own figures", () => {
  test("one shot on target is a shot", () => {
    expect(keeperSentence(1, 1, 1, false)).toBe(
      "One shot on target faced across one match; one stopped.",
    );
  });

  test("more than one keeps the plural, and the perfect-minutes clause", () => {
    expect(keeperSentence(4, 3, 3, false)).toBe(
      "Four shots on target faced across three matches; three stopped.",
    );
    expect(keeperSentence(9, 5, 7, true)).toBe(
      "Nine shots on target faced across five matches; seven stopped — and every countable minute in goal so far.",
    );
  });

  test("a striker's one shot is a shot", () => {
    expect(strikeSentence(1, 1)).toBe("One from one shot — 100.0% of what they struck.");
    expect(strikeSentence(3, 10)).toBe("Three from ten shots — 30.0% of what they struck.");
  });

  test("no card on the site prints a figure against the wrong noun", () => {
    // The sweep the unit cases cannot do: whatever the collect holds today,
    // no rendered sentence pairs "one" with a plural.
    for (const c of everyCard) {
      const text = c.card.finding?.text ?? "";
      expect(text).not.toMatch(/\bone (shots|matches|goals)\b/i);
      expect(c.card.minutes?.note ?? "").not.toMatch(/\b1 (appearances|starts)\b/);
    }
  });
});

describe("the match log carries the box score's minutes", () => {
  const rows = everyCard.flatMap(({ card }) => card.log);
  const withBox = rows.filter((r) => r.line !== null);

  test("a row with a box line reads its minutes off the same line, never invents them", () => {
    // Minutes come only from a box score the player is on: no line, no minutes.
    for (const r of rows.filter((r) => r.line === null)) {
      expect(r.minutes).toBeNull();
      expect(r.sub).toBeNull();
    }
    // Every minute figure is a whole number inside one match.
    for (const r of withBox.filter((r) => r.minutes !== null)) {
      expect(Number.isInteger(r.minutes)).toBe(true);
      expect(r.minutes as number).toBeGreaterThanOrEqual(0);
      expect(r.minutes as number).toBeLessThanOrEqual(150);
    }
  });

  test("the boxes print minutes often enough for the column to be worth a reader's eye", () => {
    // Every SideArm and PrestoSports skin the site reads prints a minutes
    // column; a collapse to zero would mean the parser stopped reading it.
    const printed = withBox.filter((r) => r.minutes !== null).length;
    expect(withBox.length).toBeGreaterThan(0);
    expect(printed / withBox.length).toBeGreaterThan(0.9);
  });

  test("a substitute is marked only when the box says they did not start", () => {
    const subs = withBox.filter((r) => r.sub === true);
    const starters = withBox.filter((r) => r.sub === false);
    expect(subs.length).toBeGreaterThan(0);
    expect(starters.length).toBeGreaterThan(0);
  });
});

/**
 * Clean sheets, counted where the programme printed none.
 *
 * Two programmes in five publish the column as "SHO/CBO" ("10/2"), which the
 * collector does not read, so the card counts them from the box scores. The
 * rule that has to hold is the publisher's: a shutout is a keeper's alone only
 * when nobody else kept goal in that match. The predicate to audit is "which
 * match does this throw away", and the answers are named below: a forfeit, a
 * disputed score, and a keeper named on the bench who never came on.
 */
describe("clean sheets are counted the way the publisher credits them", () => {
  const fx = (
    id: string,
    home: string,
    away: string,
    hs: number,
    as: number,
    extra = {},
  ): Fixture =>
    ({
      id,
      date: `2026-09-${id.padStart(2, "0")}`,
      home,
      away,
      status: "final",
      source_url: "x",
      conference_game: false,
      home_score: hs,
      away_score: as,
      ...extra,
    }) as Fixture;
  const keeper = (name: string, minutes: number) => ({ name, minutes });
  const box = (keepers: { name: string; minutes: number }[]) => ({
    home_index: 0,
    teams: [
      { name: "Us", players: [], keepers },
      { name: "Them", players: [], keepers: [keeper("Other", 90)] },
    ],
  });
  const fixtures = [
    fx("1", "us", "a", 1, 0), // alone, 90'
    fx("2", "us", "b", 2, 0), // shared: replaced at 80'
    fx("3", "us", "c", 0, 0), // alone, with the backup named at 0'
    fx("4", "us", "d", 1, 0), // no box score: unseen
    fx("5", "us", "e", 1, 0, { forfeit: "awarded" }), // a forfeit is no clean sheet
    fx("6", "us", "f", 3, 1), // conceded
    fx("7", "us", "g", 1, 0, { match_type: "exhibition" }), // a friendly counts toward nothing
    fx("8", "us", "h", 2, 0), // disputed
  ];
  const matches = {
    matches: {
      "1": box([keeper("Maysa Willis", 90)]),
      "2": box([keeper("Maysa Willis", 80), keeper("Backup Keeper", 10)]),
      "3": box([keeper("Maysa Willis", 90), keeper("Backup Keeper", 0)]),
      "5": box([keeper("Maysa Willis", 90)]),
      "6": box([keeper("Maysa Willis", 90)]),
      "7": box([keeper("Maysa Willis", 90)]),
      "8": box([keeper("Maysa Willis", 90)]),
    },
  } as unknown as MatchesFile;
  const disputed = new Set(["2026-09-08 h v us"]);

  test("alone, shared and unseen are each the match they name, and nothing else", () => {
    expect(countCleanSheets(fixtures, matches, disputed, "us", null, "maysa willis")).toEqual({
      alone: 2,
      shared: 1,
      unseen: 1,
    });
  });

  test("the keeper who finished the shared match shares it too", () => {
    expect(countCleanSheets(fixtures, matches, disputed, "us", null, "backup keeper")).toEqual({
      alone: 0,
      shared: 1,
      unseen: 1,
    });
  });

  test("a published figure is printed as published; a count with gaps is a floor", () => {
    const counted = { alone: 2, shared: 1, unseen: 1 };
    expect(cleanSheetFigure(7, counted)).toEqual({ n: 7, atLeast: false });
    expect(cleanSheetFigure(undefined, counted)).toEqual({ n: 2, atLeast: true });
    expect(cleanSheetFigure(undefined, { ...counted, unseen: 0 })).toEqual({
      n: 2,
      atLeast: false,
    });
    // "0+" says nothing a dash does not.
    expect(cleanSheetFigure(undefined, { alone: 0, shared: 1, unseen: 2 })).toBeNull();
  });

  test("a career total adds what is printed, skips a dash, and carries a floor", () => {
    const n = (v: number, atLeast = false) => ({ n: v, atLeast });
    expect(sumColumn([n(9), n(18), null, n(7)])).toEqual(n(34));
    expect(sumColumn([n(9), n(2, true)])).toEqual(n(11, true));
    expect(sumColumn([null, null])).toBeNull();
  });
});

describe("every card's clean sheets and career agree with the season", () => {
  const keepers = everyCard.filter((c) => c.card.keeper);

  test("a keeper's clean sheets are never more than the matches the side kept one", () => {
    expect(keepers.length).toBeGreaterThan(0);
    for (const { key, slug, card } of keepers) {
      const value = card.triad.find((f) => f.label === "CLEAN SHEETS")?.value ?? "—";
      if (value === "—") continue;
      const team = cleanSheetsOf(loadSeason(key), slug);
      expect(Number.parseInt(value, 10), `${key}/${slug} ${card.name}`).toBeLessThanOrEqual(
        // A published figure can run a match ahead of a collect.
        team + 1,
      );
    }
  });

  test("counting fills the clean sheets the statistics did not print", () => {
    // Before the count, every SHO/CBO programme's keepers printed a dash.
    const shown = keepers.filter(
      (c) => c.card.triad.find((f) => f.label === "CLEAN SHEETS")?.value !== "—",
    ).length;
    expect(shown / keepers.length).toBeGreaterThan(0.9);
  });

  test("a team's clean sheets are its results with nothing conceded, forfeits aside", () => {
    for (const key of site.conferences) {
      const s = loadSeason(key);
      for (const p of s.fixtures.programmes) {
        const results = resultsOf(s, p.slug);
        const cs = cleanSheetsOf(s, p.slug);
        expect(cs).toBeLessThanOrEqual(results.length);
        expect(cs).toBe(results.filter((r) => r.goalsAgainst === 0 && !r.forfeit).length);
      }
    }
  });

  test("the career total is the column above it, added", () => {
    const withTotal = everyCard.filter((c) => c.card.career.total);
    expect(withTotal.length).toBeGreaterThan(0);
    for (const { card } of withTotal) {
      const total = card.career.total;
      if (!total) continue;
      expect(card.career.rows.length).toBeGreaterThan(1);
      card.career.columns.forEach((col, i) => {
        const cells = card.career.rows.map((r) => r.values[i] ?? "—").filter((v) => v !== "—");
        const sum = cells.reduce((t, v) => t + Number.parseInt(v, 10), 0);
        const printed = total.values[i] ?? "—";
        if (cells.length === 0) expect(printed, `${card.name} ${col}`).toBe("—");
        else expect(Number.parseInt(printed, 10), `${card.name} ${col}`).toBe(sum);
      });
    }
  });
});
