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
  /** The body that runs it, named in the footer's disclaimer. */
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
  /** Regions, in navigation order. A region groups conferences on the
   *  footprint map, the home page past its column cap, and the masthead menu.
   *  Config, never code: a later division adds rows here and nowhere else. */
  regions: readonly { key: string; name: string }[];
  /** Conference key → region key. Every conference must name a region listed
   *  in `regions`; lib/regions.test.ts asserts it, and the test gate stands in
   *  front of every publish. */
  conferenceRegions: Readonly<Record<string, string>>;
}

export const site: SiteConfig = {
  season: Number(process.env.TOUCHLINE_SEASON ?? 2026),
  gender: (process.env.TOUCHLINE_GENDER ?? "men") as Gender,
  conferences: ["gac", "lsc", "gsc", "glvc", "rmac", "ssc"],
  home: "gac",
  asOf: process.env.TOUCHLINE_AS_OF?.trim() || undefined,
  conferenceNames: {
    gac: "Great American Conference",
    lsc: "Lone Star Conference",
    gsc: "Gulf South Conference",
    glvc: "Great Lakes Valley Conference",
    rmac: "Rocky Mountain Athletic Conference",
    ssc: "Sunshine State Conference",
  },
  division: "NCAA Division II men's soccer",
  governingBody: "NCAA",
  publisher: "EDInsights.AI",
  cadence: "once a day",
  divisionConferences: 19,
  regions: [
    { key: "northeast", name: "Northeast" },
    { key: "mid-atlantic", name: "Mid-Atlantic" },
    { key: "midwest", name: "Midwest" },
    { key: "southeast", name: "Southeast" },
    { key: "south-central", name: "South Central" },
    { key: "west", name: "West" },
  ],
  conferenceRegions: {
    gac: "south-central",
    lsc: "south-central",
    gsc: "southeast",
    glvc: "midwest",
    rmac: "west",
    ssc: "southeast",
  },
  nameOverrides: {
    "ncaa-1st-and-2nd-round": "NCAA First & Second Rounds",
    "ncaa-first-and-second-rounds": "NCAA First & Second Rounds",
    "ncaa-3rd-round-and-quarter-finals": "NCAA Third Round & Quarterfinals",
    "ncaa-third-round-and-quarterfinals": "NCAA Third Round & Quarterfinals",
    "ncaa-semi-finals-and-finals": "NCAA Semifinals & Final",
    "ncaa-semifinals-and-final": "NCAA Semifinals & Final",
    // The collector slugs the University of Mobile as "of-mobile", which the
    // title-caser would print as "Of Mobile".
    "of-mobile": "Mobile",
  },
};
