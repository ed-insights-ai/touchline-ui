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
  /** The NCAA division this build covers (TOUCHLINE_NCAA_DIVISION). */
  ncaaDivision: NcaaDivisionKey;
  /** The data home this build reads by default, "~" allowed. Each NCAA
   *  division is its own home; TOUCHLINE_DATA_DIR overrides it for one build
   *  (lib/data.ts dataRoot). */
  dataHome: string;
  /** This build's journal directory, under this repo's journal/ (or under
   *  TOUCHLINE_JOURNAL_DIR when set). Empty is journal/ itself, where
   *  Division II's journals have always been written. A build reads its own
   *  directory and no other (lib/journal.ts journalDirs). */
  journalSubdir: string;
  /** A member of `home` with a full record, which the tests and the deployed
   *  check sample a team page from. Config, so a division's checks never
   *  name another division's programme. */
  sampleProgramme: string;
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
  /** The home page's ledger prints this many of last night's results in the
   *  open; the rest fold into a native disclosure whose summary counts them
   *  all. At 390px sixty-odd rows put the conferences three screens down, and
   *  the ledger is still the thesis, so it keeps its place and its first rows
   *  — but not the whole night (tl-tav2). Applied at every width. */
  homeLedgerCap: number;
  /** Build-time "today". Undefined means: use the date a collect last looked
   *  at the conference (its file's stamp, or the cadence's recollected report
   *  when that is later), which is the only date the site can honestly claim
   *  to know about. */
  asOf?: string;
  /** The collect cadence's report of conferences it collected this run that
   *  came back unchanged, as "<key>=<collected_at> ...". Their board files keep
   *  the stamp of the collect that last changed them (the cadence rolls the
   *  fresh one back so a quiet day leaves no commit), so without this the
   *  freshness line reads a quiet conference as a stale one. Undefined for a
   *  hand-run build: the files' own stamps then stand alone. */
  recollected?: string;
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
  divisionConferences: number | undefined;
  /** Regions, in navigation order. A region groups conferences on the
   *  footprint map, the home page past its column cap, and the masthead menu.
   *  Config, never code: a later division adds rows here and nowhere else. */
  regions: readonly Region[];
  /** Conference key → region key. Every conference must name a region listed
   *  in `regions`; lib/regions.test.ts asserts it, and the test gate stands in
   *  front of every publish. */
  conferenceRegions: Readonly<Record<string, string>>;
}

/** The NCAA divisions, by key. Each is its own data home and its own set of
 *  static builds (one per gender it fields), served beside the others. */
export type NcaaDivisionKey = "d1" | "d2" | "d3";

/** What differs between one build and another: which conferences it follows,
 *  where it opens, what the division is called, where its data and its
 *  journal live, and the programme the checks sample. One per (NCAA division,
 *  gender) the site covers. Everything else (regions, names, cadence) is
 *  shared, because a conference sits in the same region whichever gender it
 *  fields and no conference key is used by two divisions. */
export type BuildProfile = Pick<
  SiteConfig,
  | "conferences"
  | "home"
  | "division"
  | "divisionConferences"
  | "dataHome"
  | "journalSubdir"
  | "sampleProgramme"
>;

const D2_HOME = "~/keelson/d2-soccer";
const D1_HOME = "~/keelson/d1-soccer";

export const profiles: Readonly<
  Record<NcaaDivisionKey, Readonly<Partial<Record<Gender, BuildProfile>>>>
> = {
  d2: {
    men: {
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
      division: "NCAA Division II men's soccer",
      divisionConferences: 19,
      dataHome: D2_HOME,
      journalSubdir: "",
      sampleProgramme: "harding",
    },
    // Every conference the rib has authored women's membership for: all
    // twenty-one Division II women's soccer conferences, 2026. Add a key here
    // only once its women's season files exist; a listed conference without a
    // fixtures file fails the build.
    women: {
      conferences: [
        "gac",
        "lsc",
        "gsc",
        "glvc",
        "miaa",
        "nsic",
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
      division: "NCAA Division II women's soccer",
      // NCAA, 2026 DII Women's Soccer Pre-Championship Manual, section 2.3:
      // "Twenty-one conferences have been granted Automatic Qualification".
      divisionConferences: 21,
      dataHome: D2_HOME,
      journalSubdir: "",
      sampleProgramme: "harding",
    },
  },
  // Division I, from its own data home (~/keelson/d1-soccer): every
  // conference with 2026 season files there, in key order.
  d1: {
    men: {
      conferences: [
        "a10",
        "aac",
        "acc",
        "ae",
        "asun",
        "b1g",
        "bigeast",
        "bigsouth",
        "bigwest",
        "caa",
        "horizon",
        "ivy",
        "maac",
        "mvc",
        "mw",
        "nec",
        "ovc",
        "pac12",
        "patriot",
        "socon",
        "summit",
        "sunbelt",
        "wcc",
      ],
      home: "a10",
      division: "NCAA Division I men's soccer",
      // The collector's 2026 census of Division I men's soccer sponsorship
      // (d1-soccer docs/onboarding-2026-11-15/conference-seasons.json):
      // twenty-three conferences sponsor the sport in 2026 (the WAC stopped
      // after 2025; the Mountain West began and the Pac-12 resumed in 2026).
      divisionConferences: 23,
      dataHome: D1_HOME,
      // Its own directory under journal/, so a Division I build can never
      // read Division II's journals (the national file names are the same).
      journalSubdir: "d1",
      sampleProgramme: "saint-louis",
    },
    women: {
      conferences: [
        "a10",
        "aac",
        "acc",
        "ae",
        "asun",
        "b1g",
        "big12",
        "bigeast",
        "bigsky",
        "bigsouth",
        "bigwest",
        "caa",
        "cusa",
        "horizon",
        "ivy",
        "maac",
        "mac",
        "mvc",
        "mw",
        "nec",
        "ovc",
        "pac12",
        "patriot",
        "sec",
        "socon",
        "southland",
        "summit",
        "sunbelt",
        "swac",
        "uac",
        "wcc",
      ],
      home: "a10",
      division: "NCAA Division I women's soccer",
      // Report of the NCAA DI Women's Soccer Oversight Committee, March 9,
      // 2026, item 3: "The following 31 conferences have been approved for
      // automatic qualification for the 2026 NCAA Division I Women's Soccer
      // Championship" (d1-soccer docs/onboarding-2026-11-20-women).
      divisionConferences: 31,
      dataHome: D1_HOME,
      // The men's directory: journal file names carry the gender.
      journalSubdir: "d1",
      sampleProgramme: "saint-louis",
    },
  },
  d3: {},
};

/** Where each gender's build is served, under its division's path. The men's
 *  site keeps the root it has always had, so no published URL moves; the
 *  women's site is a second build served beside it. The justfile builds into
 *  these same paths, so the two must agree (lib/scope.test.ts). */
export const genderPath: Readonly<Record<Gender, string>> = { men: "", women: "/women" };

/** Where each NCAA division's builds are served, under the deploy's root
 *  base: Division II at the root it has always had, Division I at /d1. A
 *  build's own path is its division's then its gender's: /d1, /women. */
export const divisionPath: Readonly<Record<NcaaDivisionKey, string>> = {
  d1: "/d1",
  d2: "",
  d3: "/d3",
};

/** The path of one build under the deploy's root base. */
export const buildPath = (division: NcaaDivisionKey, gender: Gender): string =>
  `${divisionPath[division]}${genderPath[gender]}`;

/** The NCAA divisions the header's switch names, in order. Each is a link the
 *  day its build publishes, and until then a row that says so, never a link
 *  to a page that does not exist. `published` is read from what this deploy
 *  builds (TOUCHLINE_NCAA_DIVISIONS), never set by hand. */
export interface NcaaDivision {
  key: NcaaDivisionKey;
  abbr: string;
  name: string;
  published: boolean;
}
const NCAA_DIVISIONS: readonly Omit<NcaaDivision, "published">[] = [
  { key: "d1", abbr: "D-I", name: "Division I" },
  { key: "d2", abbr: "D-II", name: "Division II" },
  { key: "d3", abbr: "D-III", name: "Division III" },
];

/** The order the switch prints the genders in. */
export const genderOrder: readonly Gender[] = ["men", "women"];

export function genderFromEnv(raw: string | undefined): Gender {
  const g = raw?.trim() || "men";
  if (g !== "men" && g !== "women") {
    throw new Error(`Touchline: TOUCHLINE_GENDER must be "men" or "women", not "${g}"`);
  }
  return g;
}

/** This build's NCAA division, from TOUCHLINE_NCAA_DIVISION. Unset is
 *  Division II, the site as it has always been. */
export function ncaaDivisionFromEnv(raw: string | undefined): NcaaDivisionKey {
  const d = raw?.trim() || "d2";
  if (d !== "d1" && d !== "d2" && d !== "d3") {
    throw new Error(`Touchline: TOUCHLINE_NCAA_DIVISION must be "d1", "d2" or "d3", not "${d}"`);
  }
  return d;
}

/** The genders this deploy publishes, from TOUCHLINE_GENDERS ("men,women").
 *  Unset means this build's gender alone, and a site that publishes one
 *  gender offers no switch: a link to a build that was never published would
 *  404. Always includes the build's own gender. */
export function publishedFromEnv(raw: string | undefined, own: Gender): Gender[] {
  const listed = (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => genderFromEnv(s));
  const set = new Set<Gender>([own, ...listed]);
  return genderOrder.filter((g) => set.has(g));
}

/** The NCAA divisions this deploy publishes, from TOUCHLINE_NCAA_DIVISIONS
 *  ("d2,d1"), on publishedFromEnv's terms: unset means this build's division
 *  alone, and the build's own division is always in it. A division with no
 *  profile at all is not published whatever the list says. */
export function publishedDivisionsFromEnv(
  raw: string | undefined,
  own: NcaaDivisionKey,
): NcaaDivisionKey[] {
  const listed = (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => ncaaDivisionFromEnv(s));
  const set = new Set<NcaaDivisionKey>([own, ...listed]);
  return NCAA_DIVISIONS.map((d) => d.key).filter(
    (k) => set.has(k) && Object.keys(profiles[k]).length > 0,
  );
}

/** The builds a deploy publishes: every (division, gender) both lists name
 *  that has a profile. A division with no profile for a gender adds no build
 *  for it. */
export function publishedBuilds(
  divisions: readonly NcaaDivisionKey[],
  genders: readonly Gender[],
): { division: NcaaDivisionKey; gender: Gender; path: string }[] {
  return divisions.flatMap((division) =>
    genders
      .filter((gender) => profiles[division][gender] !== undefined)
      .map((gender) => ({ division, gender, path: buildPath(division, gender) })),
  );
}

const gender = genderFromEnv(process.env.TOUCHLINE_GENDER);
const ncaaDivisionKey = ncaaDivisionFromEnv(process.env.TOUCHLINE_NCAA_DIVISION);

/** Every gender this deploy publishes in any division, in switch order. */
export const deployGenders: readonly Gender[] = publishedFromEnv(
  process.env.TOUCHLINE_GENDERS,
  gender,
);

/** The divisions this deploy publishes, in switch order. */
export const publishedDivisions: readonly NcaaDivisionKey[] = publishedDivisionsFromEnv(
  process.env.TOUCHLINE_NCAA_DIVISIONS,
  ncaaDivisionKey,
);

/** This build's division's profiles, by gender. */
export const divisions: Readonly<Partial<Record<Gender, BuildProfile>>> = profiles[ncaaDivisionKey];

/** The genders published beside this build in its own division, in switch
 *  order: the deploy's genders that this division fields. */
export const publishedGenders: readonly Gender[] = deployGenders.filter(
  (g) => divisions[g] !== undefined,
);

/** The switch's divisions, each published when this deploy builds it. */
export const ncaaDivisions: readonly NcaaDivision[] = NCAA_DIVISIONS.map((d) => ({
  ...d,
  published:
    publishedDivisions.includes(d.key) && publishedBuilds([d.key], deployGenders).length > 0,
}));

/** The division this build covers. */
export const ncaaDivision: NcaaDivisionKey = ncaaDivisionKey;
export const currentDivision: NcaaDivision = ncaaDivisions.find(
  (d) => d.key === ncaaDivision,
) as NcaaDivision;

const profile = divisions[gender];
if (!profile) {
  throw new Error(
    `Touchline: there is no ${ncaaDivision} ${gender}'s build (site.config profiles); ` +
      `set TOUCHLINE_NCAA_DIVISION and TOUCHLINE_GENDER to one that exists`,
  );
}

export const site: SiteConfig = {
  season: Number(process.env.TOUCHLINE_SEASON ?? 2026),
  gender,
  ncaaDivision: ncaaDivisionKey,
  ...profile,
  homeColumnCap: 6,
  homeLedgerCap: 8,
  asOf: process.env.TOUCHLINE_AS_OF?.trim() || undefined,
  recollected: process.env.TOUCHLINE_RECOLLECTED?.trim() || undefined,
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
    // Women only: the MIAA and the NSIC sponsor women's soccer and not men's.
    miaa: "Mid-America Intercollegiate Athletics Association",
    nsic: "Northern Sun Intercollegiate Conference",
    mec: "Mountain East Conference",
    "g-mac": "Great Midwest Athletic Conference",
    gliac: "Great Lakes Intercollegiate Athletic Conference",
    sac: "South Atlantic Conference",
    cc: "Conference Carolinas",
    pbc: "Peach Belt Conference",
    ccaa: "California Collegiate Athletic Association",
    pacwest: "Pacific West Conference",
    gnac: "Great Northwest Athletic Conference",
    // Division I. Each is the first name the Division I home's membership
    // reference lists for the code (conference_profiles), which is how the
    // conference names itself.
    a10: "Atlantic 10 Conference",
    aac: "American Athletic Conference",
    acc: "Atlantic Coast Conference",
    ae: "America East Conference",
    asun: "Atlantic Sun Conference",
    b1g: "Big Ten Conference",
    bigeast: "Big East Conference",
    bigsouth: "Big South Conference",
    bigwest: "The Big West",
    caa: "Coastal Athletic Association",
    horizon: "Horizon League",
    ivy: "Ivy League",
    maac: "Metro Atlantic Athletic Conference",
    mvc: "Missouri Valley Conference",
    mw: "Mountain West Conference",
    nec: "Northeast Conference",
    ovc: "Ohio Valley Conference",
    pac12: "Pac-12 Conference",
    patriot: "Patriot League",
    socon: "Southern Conference",
    summit: "The Summit League",
    sunbelt: "Sun Belt Conference",
    wcc: "West Coast Conference",
    // Division I, women only: these eight sponsor women's soccer and not men's.
    big12: "Big 12 Conference",
    bigsky: "Big Sky Conference",
    cusa: "Conference USA",
    mac: "Mid-American Conference",
    sec: "Southeastern Conference",
    southland: "Southland Conference",
    swac: "Southwestern Athletic Conference",
    uac: "United Athletic Conference",
  },
  governingBody: "NCAA",
  publisher: "EDInsights.AI",
  cadence: "once a day",
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
    miaa: "midwest",
    nsic: "midwest",
    mec: "mid-atlantic",
    "g-mac": "midwest",
    gliac: "midwest",
    sac: "southeast",
    cc: "southeast",
    pbc: "southeast",
    ccaa: "west",
    pacwest: "west",
    gnac: "west",
    // Division I, placed by where the members' towns are: each 2026 member's
    // gazetteer point (d1-soccer data/reference/programmes.json) takes the
    // region of the nearest Division II programme, and the conference takes
    // the region most of its members do. That put eight conferences in the
    // Northeast, and a band wears one hue per position and tokens.css holds
    // six (lib/home.ts), so the two with the strongest second region moved
    // to it: the Big East (six Midwest, six Northeast) to the Midwest, and
    // the Patriot League (six Northeast, four Mid-Atlantic) to the
    // Mid-Atlantic. The CAA's tie (five Northeast, five Southeast) went to
    // the earlier region in navigation order. The owner may move any.
    a10: "northeast",
    aac: "southeast",
    acc: "southeast",
    ae: "northeast",
    asun: "southeast",
    b1g: "midwest",
    bigeast: "midwest",
    bigsouth: "southeast",
    bigwest: "west",
    caa: "northeast",
    horizon: "midwest",
    ivy: "northeast",
    maac: "northeast",
    mvc: "midwest",
    mw: "west",
    nec: "northeast",
    ovc: "midwest",
    pac12: "west",
    patriot: "mid-atlantic",
    socon: "southeast",
    summit: "midwest",
    sunbelt: "southeast",
    wcc: "west",
    // Division I, women only, placed on the same terms, with the men's
    // placements above left where they are. The Northeast, the Southeast and
    // the Midwest already hold six each, so a conference whose members lean
    // to one of them goes to its strongest region with room: the Big 12 (five
    // West, five Midwest, four South Central) to the West, the SEC (ten
    // Southeast, three South Central) and Conference USA (six Southeast, two
    // South Central) and the SWAC (five Southeast, four South Central) to
    // South Central, and the MAC (nine Midwest, two Northeast, one
    // Mid-Atlantic) to the Mid-Atlantic. The UAC's tie (four South Central,
    // four Southeast) went to the region with room. Moving the Horizon League
    // (nine Midwest, three Mid-Atlantic) to the Mid-Atlantic would let the
    // MAC sit in the Midwest, at the cost of moving a men's band; the owner
    // may make that trade.
    big12: "west",
    bigsky: "west",
    cusa: "south-central",
    mac: "mid-atlantic",
    sec: "south-central",
    southland: "south-central",
    swac: "south-central",
    uac: "south-central",
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
