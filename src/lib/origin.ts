// Where a squad member is from, as the programme published it.
//
// The fact is narrow on purpose. A roster prints a hometown; this reads the
// place at the end of it and, when that place names a football nation other
// than the United States, gives the row a trigram. That is the whole claim:
// ORIGIN BY PUBLISHED HOMETOWN. It is not a nationality, not a passport, and
// above all not a cap — in football an "England international" is a player who
// has played for England, so the word international never appears on a row and
// never appears here.
//
// Three rules keep it honest:
//   • The table is AUTHORED and conference-agnostic. It maps place names, never
//     a programme or a conference. Adding a conference must not mean editing it.
//   • An unmarked row is not a claim that a player is American. It means the
//     published hometown ended in a place this table does not name — a region,
//     a bare city, a school. Those are counted out of both sides of the total
//     rather than guessed at.
//   • Puerto Rico and the other US territories resolve as the United States,
//     because the sentence the squad prints says "outside the United States"
//     and they are not. FIFA would call PUR its own nation; that is a different
//     question from the one this line answers.

/** A football nation, as FIFA writes it. */
export interface Nation {
  name: string;
  trigram: string;
  /** Which flag the row draws, named as the vendored set names its file:
   *  lowercase ISO 3166-1 alpha-2, except the home nations, which the set
   *  files under the subdivision codes a football reader expects to see. */
  iso: string;
}

const nations = (
  rows: readonly (readonly [string, string, string, ...string[]])[],
): Map<string, Nation> => {
  const out = new Map<string, Nation>();
  for (const [name, trigram, iso, ...aliases] of rows) {
    for (const key of [name, ...aliases]) out.set(normalise(key), { name, trigram, iso });
  }
  return out;
};

/**
 * Every place the data actually ends a hometown with, plus the standard forms
 * of each, so a programme that starts publishing "Deutschland" or "Éire" is a
 * one-line change here rather than a silent gap on a page.
 */
const NATIONS = nations([
  // The home nations are separate FIFA nations and separate footballing
  // countries, so they are never folded into GBR. GBR is what is left when a
  // hometown says only "United Kingdom". They fly their own flags for the same
  // reason: a player from Derby draws St George's cross, not the Union Jack.
  ["England", "ENG", "gb-eng"],
  ["Scotland", "SCO", "gb-sct"],
  ["Wales", "WAL", "gb-wls"],
  ["Northern Ireland", "NIR", "gb-nir"],
  ["United Kingdom", "GBR", "gb", "Great Britain", "UK", "Britain"],

  ["Ireland", "IRL", "ie", "Republic of Ireland", "Eire"],
  ["Germany", "GER", "de", "Deutschland"],
  ["Spain", "ESP", "es", "España", "Espana"],
  ["France", "FRA", "fr"],
  ["Italy", "ITA", "it", "Italia"],
  ["Portugal", "POR", "pt"],
  ["Netherlands", "NED", "nl", "The Netherlands", "Holland"],
  ["Belgium", "BEL", "be"],
  ["Switzerland", "SUI", "ch"],
  ["Austria", "AUT", "at"],
  ["Poland", "POL", "pl"],
  ["Czech Republic", "CZE", "cz", "Czechia"],
  ["Lithuania", "LTU", "lt"],
  ["Serbia", "SRB", "rs"],
  ["Montenegro", "MNE", "me"],
  ["Greece", "GRE", "gr"],
  ["Cyprus", "CYP", "cy"],
  ["Turkey", "TUR", "tr", "Türkiye", "Turkiye"],
  ["Sweden", "SWE", "se"],
  ["Norway", "NOR", "no"],
  ["Denmark", "DEN", "dk"],
  ["Finland", "FIN", "fi"],

  ["Brazil", "BRA", "br", "Brasil"],
  ["Argentina", "ARG", "ar"],
  ["Chile", "CHI", "cl"],
  ["Colombia", "COL", "co"],
  ["Venezuela", "VEN", "ve"],
  ["Ecuador", "ECU", "ec"],
  ["Bolivia", "BOL", "bo"],
  ["Paraguay", "PAR", "py"],
  ["Uruguay", "URU", "uy"],
  ["Peru", "PER", "pe"],
  ["Mexico", "MEX", "mx", "México"],
  ["Costa Rica", "CRC", "cr"],
  ["Panama", "PAN", "pa", "Panamá"],
  ["Jamaica", "JAM", "jm"],
  ["Bahamas", "BAH", "bs", "The Bahamas"],
  ["Dominican Republic", "DOM", "do"],
  ["Trinidad and Tobago", "TRI", "tt", "Trinidad & Tobago", "Trinidad"],
  ["Antigua and Barbuda", "ATG", "ag", "Antigua"],
  // Published misspelled on one roster; the table records the place, and the
  // roster's spelling is what has to be matched.
  [
    "St. Vincent and the Grenadines",
    "VIN",
    "vc",
    "St Vincent and the Grenadines",
    "St. Vincent and Grenadies",
  ],

  ["Canada", "CAN", "ca"],
  ["Australia", "AUS", "au"],
  ["New Zealand", "NZL", "nz"],
  ["Japan", "JPN", "jp"],
  ["South Korea", "KOR", "kr", "Korea Republic", "Republic of Korea"],
  // The trigram is the FIFA one and the flag is the country's own; the set
  // has no Chinese Taipei olympic flag, and the name this table prints is
  // Taiwan, which is what the flag shows.
  ["Taiwan", "TPE", "tw", "Chinese Taipei"],
  ["Pakistan", "PAK", "pk"],
  ["Israel", "ISR", "il"],
  ["United Arab Emirates", "UAE", "ae", "UAE"],
  ["Bahrain", "BHR", "bh"],
  ["Azerbaijan", "AZE", "az"],

  ["South Africa", "RSA", "za"],
  ["Zimbabwe", "ZIM", "zw"],
  ["Zambia", "ZAM", "zm"],
  ["Senegal", "SEN", "sn"],
  ["Sierra Leone", "SLE", "sl"],
  ["Cameroon", "CMR", "cm"],
]);

/**
 * Every nation this table can put on a row, once each.
 *
 * The vendored flag set is exactly this list — `bun scripts/flags.ts` copies
 * these and deletes anything else, and a test holds the two equal in both
 * directions. So a nation added above without artwork fails the build instead
 * of shipping a broken image, and artwork nothing places never ships at all.
 */
export const PLACED_NATIONS: readonly Nation[] = (() => {
  const byIso = new Map<string, Nation>();
  for (const nation of NATIONS.values()) {
    const seen = byIso.get(nation.iso);
    // Two nations sharing one asset key would silently drop a country from the
    // vendored set — and only the country nobody on any roster is from would
    // stay unnoticed. Fail at load instead.
    if (seen && seen.name !== nation.name) {
      throw new Error(`${seen.name} and ${nation.name} both claim the flag "${nation.iso}"`);
    }
    byIso.set(nation.iso, nation);
  }
  return [...byIso.values()].sort((a, b) => a.iso.localeCompare(b.iso));
})();

/** Canadian provinces and territories, which end a hometown as often as the
 *  country does ("Ajax, Ontario", "Toronto, ON, Canada"). */
const CANADA: Nation = { name: "Canada", trigram: "CAN", iso: "ca" };
const CANADIAN = new Set(
  [
    "Alberta",
    "AB",
    "British Columbia",
    "BC",
    "Manitoba",
    "MB",
    "New Brunswick",
    "NB",
    "Newfoundland and Labrador",
    "Newfoundland",
    "NL",
    "Nova Scotia",
    "NS",
    "Ontario",
    "ON",
    "Prince Edward Island",
    "PE",
    "PEI",
    "Quebec",
    "Québec",
    "QC",
    "Saskatchewan",
    "SK",
    "Northwest Territories",
    "NT",
    "Nunavut",
    "NU",
    "Yukon",
    "YT",
  ].map(normalise),
);

/**
 * The United States, in every form these rosters write it: full names, USPS
 * codes, AP abbreviations, and the ones that are simply nonstandard ("Wisc.",
 * "Co.", "MIss.", "La"). A hometown ending here gets no marker at all.
 *
 * Note "Georgia": as the tail of an American roster's hometown this is the
 * state, and reading it as the state can only ever fail by leaving a player
 * from Tbilisi unmarked — an omission, never a false mark. That is the
 * direction every ambiguity here is resolved in.
 */
const US_PLACES = new Set(
  [
    "United States",
    "United States of America",
    "USA",
    "US",
    "U.S.",
    "U.S.A.",
    "America",
    "Alabama",
    "AL",
    "Ala.",
    "Alaska",
    "AK",
    "Arizona",
    "AZ",
    "Ariz.",
    "Arkansas",
    "AR",
    "Ark.",
    "California",
    "CA",
    "Calif.",
    "Colorado",
    "CO",
    "Colo.",
    "Connecticut",
    "CT",
    "Conn.",
    "Delaware",
    "DE",
    "Del.",
    "District of Columbia",
    "DC",
    "D.C.",
    "Washington DC",
    "Washington D.C.",
    "Florida",
    "FL",
    "Fla.",
    "Georgia",
    "GA",
    "Ga.",
    "Hawaii",
    "HI",
    "Idaho",
    "ID",
    "Illinois",
    "IL",
    "Ill.",
    "Indiana",
    "IN",
    "Ind.",
    "Iowa",
    "IA",
    "Kansas",
    "KS",
    "Kan.",
    "Kans.",
    "Kentucky",
    "KY",
    "Ky.",
    "Louisiana",
    "LA",
    "La.",
    "Maine",
    "ME",
    "Maryland",
    "MD",
    "Md.",
    "Massachusetts",
    "MA",
    "Mass.",
    "Michigan",
    "MI",
    "Mich.",
    "Minnesota",
    "MN",
    "Minn.",
    "Mississippi",
    "MS",
    "Miss.",
    "Missouri",
    "MO",
    "Mo.",
    "Montana",
    "MT",
    "Mont.",
    "Nebraska",
    "NE",
    "Neb.",
    "Nebr.",
    "Nevada",
    "NV",
    "Nev.",
    "New Hampshire",
    "NH",
    "N.H.",
    "New Jersey",
    "NJ",
    "N.J.",
    "New Mexico",
    "NM",
    "N.M.",
    "New York",
    "NY",
    "N.Y.",
    "North Carolina",
    "NC",
    "N.C.",
    "North Dakota",
    "ND",
    "N.D.",
    "Ohio",
    "OH",
    "Oklahoma",
    "OK",
    "Okla.",
    "Oregon",
    "OR",
    "Ore.",
    "Pennsylvania",
    "PA",
    "Pa.",
    "Rhode Island",
    "RI",
    "R.I.",
    "South Carolina",
    "SC",
    "S.C.",
    "South Dakota",
    "SD",
    "S.D.",
    "Tennessee",
    "TN",
    "Tenn.",
    "Texas",
    "TX",
    "Tex.",
    "Utah",
    "UT",
    "Vermont",
    "VT",
    "Vt.",
    "Virginia",
    "VA",
    "Va.",
    "Washington",
    "WA",
    "Wash.",
    "West Virginia",
    "WV",
    "W.Va.",
    "W. Va.",
    "Wisconsin",
    "WI",
    "Wis.",
    "Wisc.",
    "Wyoming",
    "WY",
    "Wyo.",
    // Territories: inside the United States, whatever FIFA does with them.
    "Puerto Rico",
    "PR",
    "Guam",
    "GU",
    "American Samoa",
    "AS",
    "US Virgin Islands",
    "U.S. Virgin Islands",
    "Virgin Islands",
    "VI",
    "Northern Mariana Islands",
    "MP",
  ].map(normalise),
);

/** Case, punctuation and spacing folded away, so "N.C.", "NC" and "nc" are one
 *  key and "Okla." matches "okla". */
function normalise(place: string): string {
  return place
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type Origin =
  /** No hometown was published. Not a claim either way. */
  | { kind: "absent" }
  /** Published, and it ends in the United States. No marker. */
  | { kind: "home" }
  /** Published, and it ends somewhere this table does not name. No marker. */
  | { kind: "unplaced"; tail: string }
  /** Published, and it names a football nation other than the United States. */
  | { kind: "abroad"; nation: Nation };

/** One comma-separated piece of a hometown, resolved or not. */
function resolveSegment(segment: string): Nation | "us" | null {
  const key = normalise(segment);
  if (!key) return null;
  if (US_PLACES.has(key)) return "us";
  if (CANADIAN.has(key)) return CANADA;
  const nation = NATIONS.get(key);
  if (nation) return nation;
  // "Franklin TN", "Lufkin Texas" — the same segment with the comma missing.
  // Only the last word is tried, and only against the same tables, so this
  // widens what is recognised without widening what is guessed.
  const word = key.slice(key.lastIndexOf(" ") + 1);
  if (word !== key) {
    if (US_PLACES.has(word)) return "us";
    if (CANADIAN.has(word)) return CANADA;
    return NATIONS.get(word) ?? null;
  }
  return null;
}

/**
 * Read a published hometown.
 *
 * The trailing segment decides, because that is where a roster puts the place:
 * "Tatui, São Paulo, Brazil" is Brazilian and "Chandler, Ariz." is not. Where
 * the trailing segment names nothing this table knows — a school, a region, a
 * bare city — the last segment that DOES resolve is used, which is what makes
 * "Trincity, Trinidad, and Tobago" and "Senegal, Africa" come out right instead
 * of coming out empty.
 *
 * The one place that order is overridden is the United Kingdom: a hometown that
 * names a home nation and then the country ("Derby, England, United Kingdom")
 * is English, not British, because England is the football nation.
 */
export function originOf(hometown: string | undefined): Origin {
  const raw = (hometown ?? "").trim();
  if (!raw) return { kind: "absent" };
  const segments = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const resolved = segments.map(resolveSegment);

  let pick: Nation | "us" | null = null;
  for (const r of resolved) if (r !== null) pick = r;

  if (pick === null) {
    return { kind: "unplaced", tail: segments[segments.length - 1] ?? raw };
  }
  if (pick === "us") return { kind: "home" };
  if (pick.trigram === "GBR") {
    const home = resolved.find(
      (r): r is Nation =>
        r !== null && r !== "us" && ["ENG", "SCO", "WAL", "NIR"].includes(r.trigram),
    );
    if (home) return { kind: "abroad", nation: home };
  }
  return { kind: "abroad", nation: pick };
}

/** The trigram a squad row prints, or null when the row prints nothing. */
export function trigramOf(hometown: string | undefined): string | null {
  const origin = originOf(hometown);
  return origin.kind === "abroad" ? origin.nation.trigram : null;
}

export interface OriginCounts {
  /** Rows carrying a trigram. */
  abroad: number;
  /** Rows whose hometown resolved at all — the population the line describes. */
  placed: number;
  /** Published a hometown this table could not place. */
  unplaced: number;
  /** Published no hometown. */
  absent: number;
}

export function countOrigins(hometowns: readonly (string | undefined)[]): OriginCounts {
  const counts: OriginCounts = { abroad: 0, placed: 0, unplaced: 0, absent: 0 };
  for (const h of hometowns) {
    const origin = originOf(h);
    if (origin.kind === "absent") counts.absent++;
    else if (origin.kind === "unplaced") counts.unplaced++;
    else {
      counts.placed++;
      if (origin.kind === "abroad") counts.abroad++;
    }
  }
  return counts;
}
