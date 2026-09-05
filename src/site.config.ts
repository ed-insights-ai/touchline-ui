// The whole site is described here. A conference is configuration — never a
// literal in code — so pointing Touchline at GSC or LSC is an edit to this
// file and nothing else.

export type Gender = "men" | "women";

/** A region: the one grouping the site draws above the conference. */
export interface Region {
  key: string;
  name: string;
  /** Where the region's map label sits, as an offset in basemap viewBox
   *  units from the centroid of the region's placed dots, so a label never
   *  covers its own dots. Tuned by eye against the rendered map; a region
   *  without one is labelled at its centroid. */
  label?: { dx: number; dy: number };
}

export interface SiteConfig {
  season: number;
  gender: Gender;
  /** Conference file keys, in navigation order. These name the data files:
   *  `data/fixtures/{season}-{gender}-{key}.json`. */
  conferences: readonly string[];
  /** The conference the site root opens on. Must appear in `conferences`. */
  home: string;
  /** Up to this many conferences the home page shows one column each, in
   *  kickoff order. Past it the same cards flow into region bands, one per
   *  region in `regions` order (lib/home.ts `homeLayout`). The page grows by
   *  rows, never by narrower columns. */
  homeColumnCap: number;
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
  regions: readonly Region[];
  /** Conference key → region key. Every conference must name a region listed
   *  in `regions`; lib/regions.test.ts asserts it, and the test gate stands in
   *  front of every publish. */
  conferenceRegions: Readonly<Record<string, string>>;
}

export const site: SiteConfig = {
  season: Number(process.env.TOUCHLINE_SEASON ?? 2026),
  gender: (process.env.TOUCHLINE_GENDER ?? "men") as Gender,
  conferences: [
    "gac",
    "lsc",
    "gsc",
    "glvc",
    "rmac",
    "ssc",
    "ne10",
    "cacc",
    "ecc",
    "psac",
    "mec",
    "g-mac",
    "gliac",
    "sac",
    "cc",
    "pbc",
    "ccaa",
    "pacwest",
    "gnac",
  ],
  home: "gac",
  homeColumnCap: 6,
  asOf: process.env.TOUCHLINE_AS_OF?.trim() || undefined,
  conferenceNames: {
    gac: "Great American Conference",
    lsc: "Lone Star Conference",
    gsc: "Gulf South Conference",
    glvc: "Great Lakes Valley Conference",
    rmac: "Rocky Mountain Athletic Conference",
    ssc: "Sunshine State Conference",
    ne10: "Northeast-10 Conference",
    cacc: "Central Atlantic Collegiate Conference",
    ecc: "East Coast Conference",
    psac: "Pennsylvania State Athletic Conference",
    mec: "Mountain East Conference",
    "g-mac": "Great Midwest Athletic Conference",
    gliac: "Great Lakes Intercollegiate Athletic Conference",
    sac: "South Atlantic Conference",
    cc: "Conference Carolinas",
    pbc: "Peach Belt Conference",
    ccaa: "California Collegiate Athletic Association",
    pacwest: "Pacific West Conference",
    gnac: "Great Northwest Athletic Conference",
  },
  division: "NCAA Division II men's soccer",
  governingBody: "NCAA",
  publisher: "EDInsights.AI",
  cadence: "once a day",
  divisionConferences: 19,
  regions: [
    { key: "northeast", name: "Northeast", label: { dx: -70, dy: -50 } },
    { key: "mid-atlantic", name: "Mid-Atlantic", label: { dx: -4, dy: 62 } },
    { key: "midwest", name: "Midwest", label: { dx: -19, dy: -113 } },
    { key: "southeast", name: "Southeast", label: { dx: 140, dy: -28 } },
    { key: "south-central", name: "South Central", label: { dx: 64, dy: 83 } },
    { key: "west", name: "West", label: { dx: -10, dy: -70 } },
  ],
  conferenceRegions: {
    gac: "south-central",
    lsc: "south-central",
    gsc: "southeast",
    glvc: "midwest",
    rmac: "west",
    ssc: "southeast",
    ne10: "northeast",
    cacc: "northeast",
    ecc: "northeast",
    psac: "mid-atlantic",
    mec: "mid-atlantic",
    "g-mac": "midwest",
    gliac: "midwest",
    sac: "southeast",
    cc: "southeast",
    pbc: "southeast",
    ccaa: "west",
    pacwest: "west",
    gnac: "west",
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
