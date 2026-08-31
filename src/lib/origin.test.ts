/**
 * Where a squad member is from.
 *
 * The failure this file exists to prevent is a specific one, and it has already
 * happened once: a tail heuristic that recognised AP-style state abbreviations
 * ("Okla.", "Tenn.") but not bare USPS codes ("TX", "AL") reads every American
 * on a roster that writes "Mansfield, TX" as playing abroad. It is invisible on
 * a conference that writes AP style and total on one that does not — Dallas
 * Baptist, a roster of Texans, came out 39 of 39 international.
 *
 * So the real-data tests below do not pin counts. They assert the property that
 * heuristic violated: an American hometown is never marked.
 */

import { describe, expect, test } from "bun:test";
import { site } from "../site.config.ts";
import { loadSeason, squadByLine } from "./derive.ts";
import { positionLine } from "./format.ts";
import { countOrigins, originOf, trigramOf } from "./origin.ts";

const LINES = ["FWD", "MID", "DEF", "GK"] as const;
const seasons = site.conferences.map((k) => loadSeason(k));

/** Written out again here on purpose: an independent list, not an import. */
const USPS = `AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI
MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV
WI WY DC PR`.split(/\s+/);

describe("what the table reads", () => {
  test("a US hometown is never marked, in any form a roster writes it", () => {
    for (const tail of [
      "Wisc.",
      "SC",
      "Tex.",
      "Okla",
      "Okla.",
      "Kan.",
      "N.C.",
      "MIss.",
      "La",
      "Co.",
      "Texas",
      "Alabama",
      "North Dakota",
      "New York",
      "Georgia",
      "Utah",
      "MA",
    ]) {
      expect(trigramOf(`Somewhere, ${tail}`), tail).toBeNull();
      expect(originOf(`Somewhere, ${tail}`).kind, tail).toBe("home");
    }
    // and the country itself, however it is written
    for (const t of ["USA", "US", "United States", "U.S."])
      expect(trigramOf(`Houston, ${t}`)).toBeNull();
  });

  test("Puerto Rico is inside the United States, whatever FIFA does with it", () => {
    // The line this feeds says "outside the United States", and it is not.
    expect(trigramOf("Trujillo Alto, Puerto Rico")).toBeNull();
  });

  test("Canadian provinces are Canada", () => {
    for (const t of ["Ontario", "ON", "Quebec", "Québec", "QC", "British Columbia", "BC"]) {
      expect(trigramOf(`Somewhere, ${t}`), t).toBe("CAN");
    }
    expect(trigramOf("Toronto, ON, Canada")).toBe("CAN");
  });

  test("the home nations are four football nations, not one", () => {
    expect(trigramOf("Kings Hill, England")).toBe("ENG");
    expect(trigramOf("Motherwell, Scotland")).toBe("SCO");
    expect(trigramOf("Cardiff, Wales")).toBe("WAL");
    expect(trigramOf("Portadown, Northern Ireland")).toBe("NIR");
  });

  test("United Kingdom is GBR, unless a home nation is named too", () => {
    expect(trigramOf("Somewhere, United Kingdom")).toBe("GBR");
    // The football nation wins over the state, which is why this is not GBR.
    expect(trigramOf("Derby, England, United Kingdom")).toBe("ENG");
    expect(trigramOf("Glasgow, Scotland, United Kingdom")).toBe("SCO");
  });

  test("a place the table does not name is unmarked and counted out", () => {
    for (const h of ["Grayslake", "San Antonio", "Pordenone", "East London/Essex", "Surrey"]) {
      expect(trigramOf(h), h).toBeNull();
      expect(originOf(h).kind, h).toBe("unplaced");
    }
    const counts = countOrigins(["Grayslake", "Kings Hill, England", "Tulsa, Okla."]);
    expect(counts).toEqual({ abroad: 1, placed: 2, unplaced: 1, absent: 0 });
  });

  test("no published hometown is not a claim in either direction", () => {
    expect(originOf(undefined).kind).toBe("absent");
    expect(originOf("   ").kind).toBe("absent");
    expect(trigramOf(undefined)).toBeNull();
    expect(countOrigins([undefined, "Tulsa, Okla."])).toEqual({
      abroad: 0,
      placed: 1,
      unplaced: 0,
      absent: 1,
    });
  });

  test("the trailing segment decides, and a later one that resolves rescues it", () => {
    expect(trigramOf("Tatui, São Paulo, Brazil")).toBe("BRA");
    // Tail is a school; Norway is the last segment that names a nation.
    expect(trigramOf("Stavanger, Norway, St Svithun Videregaaende Skole")).toBe("NOR");
    expect(trigramOf("Trincity, Trinidad, and Tobago")).toBe("TRI");
    expect(trigramOf("Senegal, Africa")).toBe("SEN");
    // The comma a roster forgot.
    expect(trigramOf("Franklin TN")).toBeNull();
    expect(trigramOf("Lufkin Texas")).toBeNull();
  });
});

describe("against the rosters this site actually collects", () => {
  const rowsOf = (s: (typeof seasons)[number], slug: string) =>
    LINES.flatMap((l) => squadByLine(s, slug, l));

  test("an American hometown is never marked, on any roster", () => {
    // The regression, stated independently of the table: if the trailing
    // segment is a bare USPS code, the row must carry nothing.
    let checked = 0;
    for (const s of seasons) {
      for (const slug of Object.keys(s.rosters?.rosters ?? {})) {
        for (const m of rowsOf(s, slug)) {
          const h = (m.player.hometown ?? "").trim();
          if (!h) continue;
          const tail = (h.split(",").pop() ?? "").trim();
          if (USPS.includes(tail)) {
            checked++;
            expect(trigramOf(h), `${slug}: ${h}`).toBeNull();
          }
        }
      }
    }
    // The check must actually be looking at something.
    expect(checked).toBeGreaterThan(50);
  });

  test("every marker is a three-letter trigram", () => {
    for (const s of seasons) {
      for (const slug of Object.keys(s.rosters?.rosters ?? {})) {
        for (const m of rowsOf(s, slug)) {
          const t = trigramOf(m.player.hometown);
          if (t !== null) expect(t, `${slug}: ${m.player.hometown}`).toMatch(/^[A-Z]{3}$/);
        }
      }
    }
  });

  test("the printed count is the rows a reader can count by hand", () => {
    for (const s of seasons) {
      for (const slug of Object.keys(s.rosters?.rosters ?? {})) {
        const rows = rowsOf(s, slug);
        const counts = countOrigins(rows.map((m) => m.player.hometown));
        // Marked rows — including the ones folded behind "+ N more", since the
        // fold is a rendering of the same array.
        const marked = rows.filter((m) => trigramOf(m.player.hometown) !== null).length;
        expect(counts.abroad, slug).toBe(marked);
        // and the four buckets account for every row the page draws
        expect(counts.placed + counts.unplaced + counts.absent, slug).toBe(rows.length);
        expect(counts.abroad).toBeLessThanOrEqual(counts.placed);
      }
    }
  });

  test("rows the four lines do not draw are outside the count", () => {
    // A player whose position does not map to a line never appears in the
    // squad grid, so counting them would name players a reader cannot find.
    for (const s of seasons) {
      for (const slug of Object.keys(s.rosters?.rosters ?? {})) {
        const drawn = rowsOf(s, slug).length;
        const roster = s.rosters?.rosters[slug]?.players ?? [];
        const placeable = roster.filter((p) => positionLine(p.position) !== null).length;
        expect(drawn, slug).toBe(placeable);
      }
    }
  });

  test("this is not a rarity marker, and not a majority one either", () => {
    // A band, not a pin: the data moves every collect. It catches the two
    // catastrophes — nothing marked, or everything marked.
    let abroad = 0;
    let placed = 0;
    for (const s of seasons) {
      for (const slug of Object.keys(s.rosters?.rosters ?? {})) {
        const c = countOrigins(rowsOf(s, slug).map((m) => m.player.hometown));
        abroad += c.abroad;
        placed += c.placed;
      }
    }
    expect(placed).toBeGreaterThan(500);
    expect(abroad / placed).toBeGreaterThan(0.15);
    expect(abroad / placed).toBeLessThan(0.65);
  });
});
