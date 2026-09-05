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
import { loadSeason, squadOf } from "./derive.ts";
import { classAbbr } from "./format.ts";
import { keeperSentence, playerCard, strikeSentence } from "./player.ts";

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
