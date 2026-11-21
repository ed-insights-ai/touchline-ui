// The titles a season has decided, for the marks beside a team's name: a
// ribbon for a conference title (the regular season, the tournament, or both),
// a trophy for the national championship. Titles are results, not tiers, so
// they are drawn whether or not tiers are on.
//
// Nothing is decided here that the data does not decide. The regular-season
// title is the top of the conference table once the table is final (the
// conference tournament has begun, so its games are no longer the regular
// season's) and only when that team stands alone on points: where two finish
// level a conference's own tiebreak names its champion, and Touchline does
// not apply one. A conference that prints its standings in divisions crowns
// division winners Touchline does not name, so it gets no regular-season
// title. The tournament and national titles are the decided finals the
// postseason fold names (lib/postseason.ts).

import type { TableRow } from "./derive.ts";

export interface Titles {
  /** The regular-season champion's slug, or null. */
  regular: string | null;
  /** The conference tournament champion's slug, or null. */
  tournament: string | null;
  /** The national champion's slug, or null. */
  national: string | null;
}

export type TitleKind = "ribbon" | "trophy";

export interface TitleMark {
  kind: TitleKind;
  /** The title in words, in sentence case: "Regular-season champion". */
  words: string;
  /** The table's few words, in caps beside the mark: "SEASON CHAMPION". */
  short: string;
}

/** The regular-season champion of a final, undivided table: the top row,
 *  when it stands alone on points. */
export const regularChampion = (
  rows: readonly TableRow[],
  final: boolean,
  divisional: boolean,
): string | null => {
  if (!final || divisional) return null;
  const [first, second] = rows;
  if (!first) return null;
  if (second && second.points >= first.points) return null;
  return first.slug;
};

/** A team's titles, as marks: one ribbon for its conference titles (a double
 *  is one ribbon with both in words), then the trophy. */
export const titleMarks = (t: Titles, slug: string): TitleMark[] => {
  const marks: TitleMark[] = [];
  const regular = t.regular === slug;
  const tournament = t.tournament === slug;
  if (regular && tournament) {
    marks.push({
      kind: "ribbon",
      words: "Regular-season and tournament champion",
      short: "SEASON & TOURNAMENT",
    });
  } else if (regular) {
    marks.push({ kind: "ribbon", words: "Regular-season champion", short: "SEASON CHAMPION" });
  } else if (tournament) {
    marks.push({ kind: "ribbon", words: "Tournament champion", short: "TOURNAMENT CHAMPION" });
  }
  if (t.national === slug) {
    marks.push({ kind: "trophy", words: "National champion", short: "NATIONAL CHAMPION" });
  }
  return marks;
};
