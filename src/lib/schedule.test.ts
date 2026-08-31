// The schedule surfaces, recounted.
//
// The rule these tests enforce is the one the surfaces promise: every figure
// printed is a recount of the same store, so a number on the page and a number
// derived from the fixture list cannot disagree. Each count here is recomputed
// independently — from `season.fixtures.fixtures`, not from the function under
// test — and then required to match.

import { describe, expect, test } from "bun:test";
import { site } from "../site.config.ts";
import { type Fixture, hasScore, loadSeason } from "./derive.ts";
import { dayNumber, dowIndex, toISO } from "./format.ts";
import {
  byDay,
  isPlaceholder,
  isSilentFinal,
  kickoff,
  matchesOf,
  placeholdersOf,
  scheduleCounts,
  spineOf,
  weekOf,
  weekSummary,
  weekWindow,
  weightOf,
} from "./schedule.ts";

const seasons = site.conferences.map((k) => loadSeason(k));
const gac = loadSeason(site.conferences[0] as string);

/** An independent recount, written the long way on purpose. */
function recount(raw: readonly Fixture[], asOf: string) {
  const kept = raw.filter(
    (f) => f.match_type !== "exhibition" && !/^ncaa-/.test(f.home) && !/^ncaa-/.test(f.away),
  );
  const dates = new Set<string>();
  let gone = 0;
  let finals = 0;
  let scored = 0;
  let silent = 0;
  let stillScheduled = 0;
  let league = 0;
  for (const f of kept) {
    dates.add(f.date);
    if (f.conference_game) league++;
    if (f.date < asOf) {
      gone++;
      if (f.status === "final") {
        finals++;
        if (
          f.home_score !== null &&
          f.home_score !== undefined &&
          f.away_score !== null &&
          f.away_score !== undefined
        )
          scored++;
        else silent++;
      } else if (f.status === "scheduled") stillScheduled++;
    }
  }
  return {
    matches: kept.length,
    dates: dates.size,
    gone,
    finals,
    scored,
    silent,
    stillScheduled,
    league,
  };
}

describe("what counts as a match", () => {
  test("NCAA placeholder rows name a round, not an opponent, and stay off", () => {
    for (const s of seasons) {
      const placeholders = placeholdersOf(s);
      for (const f of placeholders) expect(isPlaceholder(f)).toBe(true);
      const shown = matchesOf(s);
      expect(shown.filter(isPlaceholder)).toEqual([]);
      // and they are not silently lost: shown + placeholders + exhibitions is the whole list
      const exhibitions = s.fixtures.fixtures.filter((f) => f.match_type === "exhibition");
      const exhibitionPlaceholders = exhibitions.filter(isPlaceholder).length;
      expect(shown.length + placeholders.length + exhibitions.length - exhibitionPlaceholders).toBe(
        s.fixtures.fixtures.length,
      );
    }
  });

  test("exhibitions stay outside the record here as everywhere else", () => {
    for (const s of seasons) {
      expect(matchesOf(s).filter((f) => f.match_type === "exhibition")).toEqual([]);
    }
  });

  test("a placeholder is recognised on either side of the fixture", () => {
    const f = { home: "ncaa-1st-and-2nd-round", away: "harding" } as unknown as Fixture;
    const g = { home: "harding", away: "ncaa-semifinals-and-final" } as unknown as Fixture;
    const h = { home: "harding", away: "newman" } as unknown as Fixture;
    expect(isPlaceholder(f)).toBe(true);
    expect(isPlaceholder(g)).toBe(true);
    expect(isPlaceholder(h)).toBe(false);
  });
});

describe("every printed count is a recount of the same store", () => {
  test("scheduleCounts matches an independent recomputation", () => {
    for (const s of seasons) {
      const mine = recount(s.fixtures.fixtures, s.asOf);
      const c = scheduleCounts(s);
      expect(c.matches).toBe(mine.matches);
      expect(c.dates).toBe(mine.dates);
      expect(c.finals).toBe(mine.finals);
      expect(c.scored).toBe(mine.scored);
      expect(c.silent).toBe(mine.silent);
      expect(c.stillScheduled).toBe(mine.stillScheduled);
      expect(c.league).toBe(mine.league);
      // the finals split has to close: nothing may fall between scored and silent
      expect(c.scored + c.silent).toBe(c.finals);
    }
  });

  test("day groups hold every match exactly once", () => {
    for (const s of seasons) {
      const matches = matchesOf(s);
      const groups = byDay(matches);
      expect(groups.reduce((n, g) => n + g.matches.length, 0)).toBe(matches.length);
      expect(new Set(groups.map((g) => g.date)).size).toBe(groups.length);
      const ids = groups.flatMap((g) => g.matches.map((f) => f.id));
      expect(new Set(ids).size).toBe(matches.length);
      // and they come out in date order
      expect(groups.map((g) => g.date)).toEqual([...groups.map((g) => g.date)].sort());
    }
  });
});

describe("the spine", () => {
  test("one mark per playing date, weighted by that day's matches", () => {
    for (const s of seasons) {
      const spine = spineOf(s);
      const groups = byDay(matchesOf(s));
      if (groups.length === 0) {
        expect(spine).toBeNull();
        continue;
      }
      expect(spine).not.toBeNull();
      if (!spine) continue;
      expect(spine.marks.length).toBe(groups.length);
      for (const [i, m] of spine.marks.entries()) {
        expect(m.date).toBe(groups[i]?.date as string);
        expect(m.count).toBe(groups[i]?.matches.length as number);
      }
      expect(spine.marks.reduce((n, m) => n + m.count, 0)).toBe(matchesOf(s).length);
    }
  });

  test("colour says league, else whether the date is gone by — never whether it was played", () => {
    for (const s of seasons) {
      const spine = spineOf(s);
      if (!spine) continue;
      for (const m of spine.marks) {
        const day = byDay(matchesOf(s)).find((g) => g.date === m.date);
        const league = day?.matches.some((f) => f.conference_game) ?? false;
        if (league) expect(m.tone).toBe("league");
        else if (m.date < s.asOf) expect(m.tone).toBe("gone");
        else expect(m.tone).toBe("come");
      }
      // The honesty this encodes: an ink date may hold a match nobody scored.
      const inkWithSilence = spine.marks.filter((m) => m.tone === "gone" && m.silence);
      for (const m of inkWithSilence) expect(m.date < s.asOf).toBe(true);
    }
  });

  test("a silence dot marks a date carrying a final with no published score", () => {
    for (const s of seasons) {
      const spine = spineOf(s);
      if (!spine) continue;
      const silentDates = new Set(
        matchesOf(s)
          .filter(isSilentFinal)
          .map((f) => f.date),
      );
      expect(new Set(spine.marks.filter((m) => m.silence).map((m) => m.date))).toEqual(silentDates);
    }
  });

  test("positions run 0 to 1 across the season, in order", () => {
    for (const s of seasons) {
      const spine = spineOf(s);
      if (!spine || spine.marks.length < 2) continue;
      expect(spine.marks[0]?.at).toBeCloseTo(0, 10);
      expect(spine.marks[spine.marks.length - 1]?.at).toBeCloseTo(1, 10);
      const ats = spine.marks.map((m) => m.at);
      expect(ats).toEqual([...ats].sort((a, b) => a - b));
      for (const a of ats) {
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(1);
      }
    }
  });

  test("league opens on the first date a league match is played", () => {
    for (const s of seasons) {
      const spine = spineOf(s);
      if (!spine) continue;
      const league = matchesOf(s)
        .filter((f) => f.conference_game)
        .map((f) => f.date)
        .sort();
      expect(spine.leagueOpensOn).toBe(league[0] ?? null);
    }
  });
});

describe("the week", () => {
  test("windows Monday to Sunday around any day of the week", () => {
    // A whole week of inputs must all land on the same Monday–Sunday window.
    const monday = "2026-08-31";
    for (let i = 0; i < 7; i++) {
      const day = toISO(dayNumber(monday) + i);
      const w = weekWindow(day);
      expect(w.start).toBe(monday);
      expect(w.end).toBe(toISO(dayNumber(monday) + 6));
    }
    // and the day before that Monday belongs to the previous week
    expect(weekWindow(toISO(dayNumber(monday) - 1)).start).toBe(toISO(dayNumber(monday) - 7));
    // the window always starts on a Monday: dowIndex 1
    for (const iso of ["2026-01-01", "2026-06-15", "2026-12-31", "2027-02-28"]) {
      expect(dowIndex(weekWindow(iso).start)).toBe(1);
    }
  });

  test("prints all seven days, including the empty ones", () => {
    for (const s of seasons) {
      const w = weekOf(s);
      expect(w.days.length).toBe(7);
      expect(w.days[0]?.date).toBe(w.start);
      expect(w.days[6]?.date).toBe(w.end);
      expect(w.playingDays).toBe(w.days.filter((d) => d.matches.length > 0).length);
      expect(w.days.reduce((n, d) => n + d.matches.length, 0)).toBe(w.matches.length);
    }
  });

  test("an empty week is a valid week, not a missing one", () => {
    // Deep in the off-season this conference plays nothing at all.
    const w = weekOf(gac, "2026-02-02");
    expect(w.days.length).toBe(7);
    expect(w.matches.length).toBe(0);
    expect(w.playingDays).toBe(0);
    expect(w.days.every((d) => d.matches.length === 0)).toBe(true);
  });

  test("the closed summary counts exactly what the open docket shows", () => {
    // The fold's whole risk: a reader who never expands sees only this line, so
    // it may not disagree with the rows underneath it. Recounted from the day
    // groups the docket renders, not from the function that wrote the line.
    for (const s2 of seasons) {
      const w = weekOf(s2);
      const line = weekSummary(w);
      const rows = w.days.reduce((n, d) => n + d.matches.length, 0);
      const playing = w.days.filter((d) => d.matches.length > 0).length;
      if (rows === 0) {
        expect(line).toBe("No matches.");
        continue;
      }
      const m = /^(\d+) match(?:es)? across (\d+) days?$/.exec(line);
      expect(m, `${s2.key}: ${line}`).not.toBeNull();
      expect(Number(m?.[1])).toBe(rows);
      expect(Number(m?.[2])).toBe(playing);
      // and the rows it counts are the ones the page renders
      expect(rows).toBe(w.matches.length);
    }
  });

  test("an empty week says so on the summary row, never behind the expander", () => {
    expect(weekSummary(weekOf(gac, "2026-02-02"))).toBe("No matches.");
  });

  test("one match on one day is not pluralised", () => {
    const one = { days: [{ date: "2026-09-01", matches: [{} as unknown as Fixture] }] };
    expect(weekSummary(one as never)).toBe("1 match across 1 day");
  });

  test("holds only matches inside its own window", () => {
    for (const s of seasons) {
      const w = weekOf(s);
      for (const f of w.matches) {
        expect(f.date >= w.start).toBe(true);
        expect(f.date <= w.end).toBe(true);
      }
      const outside = matchesOf(s).filter((f) => f.date >= w.start && f.date <= w.end);
      expect(w.matches.length).toBe(outside.length);
    }
  });
});

describe("how a row is weighted", () => {
  test("the winner carries it, the loser goes quiet, a draw favours neither", () => {
    const win = { home_score: 2, away_score: 1 } as unknown as Fixture;
    expect(weightOf(win, "home")).toBe("strong");
    expect(weightOf(win, "away")).toBe("quiet");
    const loss = { home_score: 0, away_score: 3 } as unknown as Fixture;
    expect(weightOf(loss, "away")).toBe("strong");
    expect(weightOf(loss, "home")).toBe("quiet");
    const draw = { home_score: 1, away_score: 1 } as unknown as Fixture;
    expect(weightOf(draw, "home")).toBe("even");
    expect(weightOf(draw, "away")).toBe("even");
  });

  test("a match with no score weights neither side", () => {
    const silent = { status: "final" } as unknown as Fixture;
    expect(weightOf(silent, "home")).toBe("even");
    expect(weightOf(silent, "away")).toBe("even");
  });

  test("every scored match in the data weights exactly one side, or neither", () => {
    for (const s of seasons) {
      for (const f of matchesOf(s).filter(hasScore)) {
        const pair = [weightOf(f, "home"), weightOf(f, "away")].sort().join("/");
        expect(["even/even", "quiet/strong"]).toContain(pair);
      }
    }
  });

  test("a silent final is a final with nothing published", () => {
    for (const s of seasons) {
      for (const f of matchesOf(s)) {
        expect(isSilentFinal(f)).toBe(f.status === "final" && !hasScore(f));
      }
    }
  });
});

describe("kickoff times", () => {
  test("render as the home programme's clock, lower case", () => {
    expect(kickoff("15:30")).toBe("3:30 pm");
    expect(kickoff("00:05")).toBe("12:05 am");
    expect(kickoff("12:00")).toBe("12:00 pm");
    expect(kickoff("09:00")).toBe("9:00 am");
    expect(kickoff(undefined)).toBeNull();
    expect(kickoff("nonsense")).toBeNull();
  });
});
