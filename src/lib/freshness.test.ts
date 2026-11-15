import { describe, expect, test } from "bun:test";
import { site } from "../site.config.ts";
import { collectionLine, lastLooked, loadSeason, type Season } from "./derive.ts";
import { freshness, LAG_HOURS, laggingOf, newestLook, spanLabel } from "./freshness.ts";
import { homeSeasons } from "./home.ts";

const base = loadSeason(site.conferences[0] as string);
/** A real season with only its key and its stamp changed. */
const at = (key: string, iso: string): Season => ({
  ...base,
  key,
  collectedAt: iso,
  lookedAt: undefined,
});
const nameOf = (s: Season): string => `Conf ${s.key.toUpperCase()}`;

describe("the footer's freshness", () => {
  test("one conference in scope prints its own stamp, exactly as before", () => {
    const one = [at("a", "2026-11-10T12:31:05+00:00")];
    expect(freshness(one, nameOf)).toEqual({
      line: collectionLine(one),
      lagging: [],
      lagLine: null,
    });
    expect(freshness(one, nameOf).line).toBe("Data collected Nov 10, 2026, 12:31 UTC");
  });

  test("several within a day print their date, and nobody is named", () => {
    const f = freshness(
      [at("a", "2026-11-15T19:22:30+00:00"), at("b", "2026-11-15T19:28:46+00:00")],
      nameOf,
    );
    expect(f.line).toBe("Data collected Nov 15, 2026");
    expect(f.lagLine).toBeNull();
  });

  test("a day spanning midnight prints both dates, which is true of each", () => {
    const f = freshness(
      [at("a", "2026-11-14T23:50:00+00:00"), at("b", "2026-11-15T09:00:00+00:00")],
      nameOf,
    );
    expect(f.line).toBe("Data collected Nov 14–15, 2026");
    expect(spanLabel("2026-11-30T23:00:00Z", "2026-12-01T01:00:00Z")).toBe("Nov 30 – Dec 1, 2026");
  });

  test("a conference more than a day behind is named, not hidden behind the newest", () => {
    const f = freshness(
      [
        at("a", "2026-11-15T19:22:30+00:00"),
        at("cc", "2026-11-10T12:31:05+00:00"),
        at("b", "2026-11-15T19:28:46+00:00"),
      ],
      nameOf,
    );
    expect(f.line).toBe("Data collected Nov 15, 2026");
    expect(f.lagLine).toBe("Conf CC last collected Nov 10");
    expect(f.lagging).toEqual([
      { key: "cc", name: "Conf CC", at: "2026-11-10T12:31:05+00:00", days: 5 },
    ]);
  });

  test("exactly the lag threshold is not lagging; a minute past it is", () => {
    const newest = "2026-11-15T12:00:00+00:00";
    const edge = new Date(Date.parse(newest) - LAG_HOURS * 3_600_000).toISOString();
    const past = new Date(Date.parse(newest) - LAG_HOURS * 3_600_000 - 60_000).toISOString();
    expect(laggingOf([at("a", newest), at("b", edge)], nameOf)).toEqual([]);
    expect(laggingOf([at("a", newest), at("b", past)], nameOf).map((l) => l.key)).toEqual(["b"]);
  });

  test("past two laggards the line counts them; About names them all", () => {
    const f = freshness(
      [
        at("a", "2026-11-15T19:00:00+00:00"),
        at("b", "2026-11-10T19:00:00+00:00"),
        at("c", "2026-11-11T19:00:00+00:00"),
        at("d", "2026-11-12T19:00:00+00:00"),
      ],
      nameOf,
    );
    expect(f.lagLine).toBe("3 conferences last collected earlier");
    expect(f.lagging.map((l) => l.key)).toEqual(["b", "c", "d"]);
  });

  test("on the live data the oldest stamp is still on the page, attributed", () => {
    const seasons = homeSeasons();
    const f = freshness(seasons, nameOf);
    const newest = newestLook(seasons) as string;
    for (const s of seasons) {
      const lag = Date.parse(newest) - Date.parse(lastLooked(s)) > LAG_HOURS * 3_600_000;
      expect(f.lagging.some((l) => l.key === s.key)).toBe(lag);
    }
    if (f.lagging.length > 0 && f.lagging.length <= 2) {
      for (const l of f.lagging) expect(f.lagLine).toContain(l.name);
    }
  });
});
