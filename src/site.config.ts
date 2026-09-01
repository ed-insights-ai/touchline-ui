// The whole site is described here. A conference is configuration — never a
// literal in code — so pointing Touchline at GSC or LSC is an edit to this
// file and nothing else.

export type Gender = "men" | "women";

export interface SiteConfig {
  season: number;
  gender: Gender;
  /** Conference file keys, in navigation order. These name the data files:
   *  `data/fixtures/{season}-{gender}-{key}.json`. */
  conferences: readonly string[];
  /** The conference the site root opens on. Must appear in `conferences`. */
  home: string;
  /** Build-time "today". Undefined means: use the date the data was collected,
   *  which is the only date the site can honestly claim to know about. */
  asOf?: string;
  /** Slug → display name, for opponents no collected file ever names. Used
   *  only after the published sources are exhausted (see lib/names.ts). */
  nameOverrides: Readonly<Record<string, string>>;
  /** Conference key → the conference's full name. The collected files carry
   *  only the abbreviation ("GAC"), and a reader meeting the site for the
   *  first time should not have to already know what that stands for. */
  conferenceNames: Readonly<Record<string, string>>;
  /** The division these conferences play in, named on the About page and in
   *  the national masthead's kicker. */
  division: string;
  /** The body that runs it. Named in the footer's disclaimer, and stripped
   *  from the division when the footer names the scope four words later — one
   *  string, two readings, rather than two strings that can disagree. */
  governingBody: string;
  /** Whose copyright the footer asserts. */
  publisher: string;
  /** How often the collector runs, in the words the About page uses. */
  cadence: string;
  /** How many conferences in this division sponsor this sport. CONTEXT, not a
   *  collected figure — nothing in the data home produces it, so it is never
   *  counted against the data and never sourced to the collect. It exists so
   *  the national map can say what share of the division this site follows. */
  divisionConferences: number;
}

export const site: SiteConfig = {
  season: Number(process.env.TOUCHLINE_SEASON ?? 2026),
  gender: (process.env.TOUCHLINE_GENDER ?? "men") as Gender,
  conferences: ["gac", "lsc", "gsc"],
  home: "gac",
  asOf: process.env.TOUCHLINE_AS_OF?.trim() || undefined,
  conferenceNames: {
    gac: "Great American Conference",
    lsc: "Lone Star Conference",
    gsc: "Gulf South Conference",
  },
  division: "NCAA Division II men's soccer",
  governingBody: "NCAA",
  publisher: "EDInsights.AI",
  cadence: "once a day",
  divisionConferences: 19,
  nameOverrides: {
    "ncaa-1st-and-2nd-round": "NCAA First & Second Rounds",
    "ncaa-first-and-second-rounds": "NCAA First & Second Rounds",
    "ncaa-3rd-round-and-quarter-finals": "NCAA Third Round & Quarterfinals",
    "ncaa-third-round-and-quarterfinals": "NCAA Third Round & Quarterfinals",
    "ncaa-semi-finals-and-finals": "NCAA Semifinals & Final",
    "ncaa-semifinals-and-final": "NCAA Semifinals & Final",
  },
};

/** The division without the governing body's name in front of it.
 *
 *  The footer's disclaimer names the NCAA four words before the scope token
 *  does, so the token reads "Division II men's soccer" — derived, never a
 *  second literal, because two strings for one fact are two strings that can
 *  come to disagree. A division whose name does not start with the body's
 *  falls through unchanged rather than being cut at a guess.
 */
export const divisionScope = (): string =>
  site.division.startsWith(`${site.governingBody} `)
    ? site.division.slice(site.governingBody.length + 1)
    : site.division;
