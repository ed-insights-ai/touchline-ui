// Formatting. Dates are handled as three integers, never as a Date, because a
// fixture's date is local to its venue and parsing it as a timestamp is how a
// site quietly moves a Saturday match to Friday.

const MON_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const MON_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface YMD {
  y: number;
  m: number; // 1-12
  d: number;
}

export function parseISO(iso: string): YMD {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Touchline: not an ISO date: ${iso}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

/** Days since 1970-01-01 for a calendar date, with no timezone in sight. */
export function dayNumber(iso: string): number {
  const { y, m, d } = parseISO(iso);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function toISO(dayNo: number): string {
  const dt = new Date(dayNo * 86_400_000);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function daysBetween(fromISO: string, toISODate: string): number {
  return dayNumber(toISODate) - dayNumber(fromISO);
}

/** 0 = Sunday. 1970-01-01 was a Thursday. */
export function dowIndex(iso: string): number {
  return (((dayNumber(iso) + 4) % 7) + 7) % 7;
}

export const monShort = (iso: string): string => MON_SHORT[parseISO(iso).m - 1] as string;
export const monLong = (iso: string): string => MON_LONG[parseISO(iso).m - 1] as string;
export const dowShort = (iso: string): string => DOW_SHORT[dowIndex(iso)] as string;
export const dowLong = (iso: string): string => DOW_LONG[dowIndex(iso)] as string;
export const dayOfMonth = (iso: string): number => parseISO(iso).d;

/** "Aug 29" */
export const shortDate = (iso: string): string => `${monShort(iso)} ${dayOfMonth(iso)}`;
/** "SAT AUG 29" */
export const stampDate = (iso: string): string =>
  `${dowShort(iso)} ${monShort(iso)} ${dayOfMonth(iso)}`.toUpperCase();
/** "Saturday, August 15" */
export const longDate = (iso: string): string =>
  `${dowLong(iso)}, ${monLong(iso)} ${dayOfMonth(iso)}`;
/** "9/17" — the compact form the season strip uses. */
export const numericDate = (iso: string): string => `${parseISO(iso).m}/${dayOfMonth(iso)}`;

/** "19:00" → "7:00 PM". Absent time means the source published none. */
export function clockTime(hhmm: string | undefined): string | null {
  if (!hhmm) return null;
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h24 = Number(m[1]);
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${m[2]} ${h24 < 12 ? "AM" : "PM"}`;
}

/** "15:30" → "3:30" — the meridiem dropped where the column is too tight. */
export function clockTimeBare(hhmm: string | undefined): string | null {
  const full = clockTime(hhmm);
  return full ? full.replace(/ [AP]M$/, "") : null;
}

/** A box score's "17:40" is 18 minutes played. Round up: the minute a thing
 *  happened in is the minute the report prints. */
export function matchMinute(clock: string | undefined): number | null {
  if (!clock) return null;
  const m = /^(\d{1,3}):(\d{2})$/.exec(clock);
  if (!m) return null;
  return Math.ceil(Number(m[1]) + Number(m[2]) / 60);
}

/** A number spelled the way the house voice spells it, up to twenty. */
const WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
];
export const spell = (n: number): string => (n >= 0 && n <= 20 ? (WORDS[n] as string) : String(n));

/** "Davis Weir" → "D. Weir", the form the ruled lists use. */
export function initialLast(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  const first = parts[0] as string;
  return `${first.slice(0, 1)}. ${parts.slice(1).join(" ")}`;
}

/** "Fifth Year" → "FR"/"SO"/"JR"/"SR"/"5Y". The rosters print prose; the
 *  chips need two characters. An unrecognised phrase is passed through. */
export function classAbbr(classYear: string | undefined): string | null {
  if (!classYear) return null;
  const s = classYear.toLowerCase();
  if (s.includes("fifth") || s.startsWith("5")) return "5Y";
  if (s.includes("fourth") || s.includes("senior") || s.startsWith("4")) return "SR";
  if (s.includes("third") || s.includes("junior") || s.startsWith("3")) return "JR";
  if (s.includes("second") || s.includes("sophomore") || s.startsWith("2")) return "SO";
  if (s.includes("first") || s.includes("freshman") || s.startsWith("1")) return "FR";
  return classYear;
}

/** A roster's "Goalkeeper"/"Midfielder" and a box score's "MID" both land on
 *  the four lines the design colours. Anything else stays unclassified. */
export type Line = "GK" | "DEF" | "MID" | "FWD";

/**
 * What a page calls each line, and the order a team sheet reads them in: from
 * the goal outwards.
 *
 * One list, in one place, because the team page names these four sets of
 * players twice — once in the squad's shape and once in the squad itself — and
 * a page that names them twice in two files is a page that will eventually
 * name them differently. It did: the shape said BACK LINE while the section
 * below it said DEFENSE.
 */
/**
 * The reader's word for a match played outside the record, and the only place
 * it is spelled.
 *
 * The data calls these exhibitions. That is the collector's word, kept in
 * match_type and nowhere a reader can see — the same split the Fixture type
 * keeps while every page says match. Three surfaces print this noun and each
 * used to pluralize it for itself, which is three chances to write
 * "friendlys".
 */
export const friendlies = (n: number): string => (n === 1 ? "friendly" : "friendlies");

/**
 * A noun that agrees with the count in front of it.
 *
 * Every composed sentence on this site interpolates a figure and then a noun,
 * and a sentence written while looking at a season's worth of data is written
 * against the plural: "One shots on target faced", "1 box-score gaps across
 * the conference". Both shipped. The count of one is not an edge case here —
 * it is the first match of a season, the only silent final, the single gap
 * left after a good collect — so it is the reading a figure arrives at exactly
 * when someone is most likely to be looking at it.
 *
 * The house spells figures up to twenty (see `spell`); this only settles the
 * noun, and it takes both forms rather than appending an "s", because the
 * forms the pages need are not all regular — "final stands" against "finals
 * stand" moves the s from one word to the next.
 */
export const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

export const LINE_ORDER = ["GK", "DEF", "MID", "FWD"] as const;
export const LINE_LABEL: Record<Line, string> = {
  GK: "IN GOAL",
  DEF: "BACK LINE",
  MID: "MIDFIELD",
  FWD: "FRONT LINE",
};
/**
 * The published vocabulary, in the order it has to be read.
 *
 * Order is the whole design here, because these words nest. A DEFENSIVE
 * MIDFIELDER is a midfielder, so midfield is read before the lines on either
 * side of it — reading the first letter instead put one on the back line for
 * as long as this file has existed. A WING BACK is a back and not a winger, so
 * "back" is read before "wing". Everything else is a plain phrase match.
 *
 * The table is authored and conference-agnostic: it maps words a roster
 * prints, never a programme. It widens what is RECOGNISED and never guesses —
 * a word not in it leaves the player unlisted, which is a fact about what was
 * published and not a claim about where they play.
 */
const POSITIONS: readonly [RegExp, Line][] = [
  // Nothing else in the vocabulary contains "keeper".
  // "GKP" is Shorter's 2021 code (gsc/shorter); Truman 2022 writes "Goalie".
  [/keeper|goalie|^gkp$|^gk$|^g$/, "GK"],
  // "CM" is centre midfield on Lewis's 2026 roster, beside "MF". Southwest
  // Baptist's 2023 roster (glvc/southwest-baptist) writes the whole squad in
  // positional codes: CM, CDM and CAM are the three midfield roles.
  // "Mid" as its own word covers Shorter 2021's "Center Mid" and Ouachita
  // Baptist 2019's "Mid Fielder". Saint Edward's 2023 (lsc/saint-edwards)
  // codes its midfield ACM, AM and HCM: attacking and holding centre mids.
  // "LM/RM" is Tiffin's left-or-right midfielder, 2022 through 2024
  // (g-mac/tiffin), beside "Midfielder" on the same roster.
  [/midfield|miidfield|\bmid\b|^mf$|^m$|^cm$|^cdm$|^cam$|^acm$|^am$|^hcm$|^lm$|^rm$/, "MID"],
  // "B" is Missouri S&T's own initial for a back (2026 roster), beside "M-B".
  // RB, CB and LB are Southwest Baptist 2023's right, centre and left backs.
  // "DF" is Christian Brothers 2020 (gsc/christian-brothers); "FB" is a full
  // back on Saint Edward's 2023; "OB" is an outside back on Adams State 2026
  // (rmac/adams-state), beside "RB/ST/CDM" and "Center Back".
  [/back|defen|^def$|^df$|^d$|^b$|^rb$|^cb$|^lb$|^fb$|^ob$/, "DEF"],
  // LW, RW and ST are Southwest Baptist 2023's wings and striker.
  // "FW" is Newman 2022 and Christian Brothers 2020; "FOR" is Shorter 2021;
  // "S" is the striker beside "W" and "W/S" on Saint Edward's 2023. "A" is
  // the attacker beside GK, D, M and F on Saint Leo 2025 (ssc/saint-leo) and
  // Pace 2025 (ne10/pace).
  // "CF" is the centre forward on North Greenville 2023 (cc/north-greenville),
  // beside CAM and LW.
  [/forward|foward|strik|wing|attack|^fwd$|^fw$|^for$|^f$|^w$|^lw$|^rw$|^st$|^cf$|^s$|^a$/, "FWD"],
];

/**
 * Pace 2025 (ne10/pace) printed the position and the player's club in one
 * field: "F Pathfinder", "GK East Fishkill", "D Real Ole", "A/M East Meadow
 * Soccer Club ECNL". The leading initials are the position and the club is
 * not read. Barton 2023 and 2026 (cc/barton) print the same shape with the
 * two-letter token: "MF Radford Univ.", "GK Richmond Hill HS". Only that
 * shape: one initial (or GK, or MF), or two joined by a slash, then at least
 * one more word.
 */
const CLUB_AFTER_INITIALS = /^((?:gk|mf|[fmda])(?:\/(?:gk|mf|[fmda]))?)\s+\S/i;

/**
 * Published misspellings that are evidently one known position, mapped to it
 * explicitly. Never fuzzy: each entry names the roster it was seen on, and a
 * string that is not in this list and matches no vocabulary word places
 * nobody. The published string itself is never rewritten in data.
 */
const PUBLISHED_TYPOS: Readonly<Record<string, string>> = {
  // Drury men's roster, collected 2026-09-01 (glvc/drury): "Midielder".
  midielder: "midfielder",
  // Lincoln (Mo.) men's roster, collected 2026-09-01 (glvc/lincoln): one
  // player's position is cut to "De" where every other back reads "Defender".
  de: "defender",
  // McKendree men's roster, collected 2026-09-01 (glvc/mckendree): "Midfeidler";
  // McKendree 2024: "Derfender".
  midfeidler: "midfielder",
  derfender: "defender",
  // Upper Iowa 2023 (glvc/upper-iowa): "Milfielder".
  milfielder: "midfielder",
  // Ouachita Baptist 2019 (gac/ouachita-baptist): "Center Middlefielder".
  middlefielder: "midfielder",
  // Shorter 2020 (gsc/shorter): "Midfilder/Forward".
  midfilder: "midfielder",
  // Montevallo 2022 through 2024 (gsc/montevallo): "Midifelder".
  midifelder: "midfielder",
  // AUM 2021 (gsc/aum): one "MD" on a roster where every other midfielder is "MID".
  md: "midfielder",
  // William Jewell 2023 (glvc/william-jewell): "Goalkeper".
  goalkeper: "goalkeeper",
  // New Haven 2026 (ne10/new-haven): "Goalkeeer".
  goalkeeer: "goalkeeper",
  // Mercyhurst 2023 (psac/mercyhurst): "Froward".
  froward: "forward",
  // West Virginia Wesleyan 2026 (mec/west-virginia-wesleyan): "Miedfielder/Defender".
  miedfielder: "midfielder",
  // Lincoln Memorial 2026 (sac/lincoln-memorial): "Midfelder".
  midfelder: "midfielder",
  // Clayton State 2025 (pbc/clayton-state): "Mdifielder".
  mdifielder: "midfielder",
};

/**
 * Published strings whose slash is not a second position but part of one:
 * "C/B" is a centre back, "Left/Right Forward" one forward. Read whole,
 * before the slash rule, and only for the exact forms a roster has printed.
 */
const PUBLISHED_FORMS: Readonly<Record<string, string>> = {
  // Shorter 2021 (gsc/shorter): "C/B", "C/M", "L/B" beside "Center Back".
  "c/b": "center back",
  "c/m": "center mid",
  "l/b": "left back",
  // Oklahoma Christian 2022 and 2023 (lsc/oklahoma-christian).
  "left/right forward": "forward",
  "l/r forward": "forward",
  // Westminster 2026 (rmac/westminster): "Center/ Midfieler" — a centre
  // midfielder whose slash is a stray, not a second position.
  "center/ midfieler": "center midfielder",
};

export function positionLine(position: string | undefined): Line | null {
  if (!position) return null;
  const whole = PUBLISHED_FORMS[position.trim().toLowerCase()] ?? position;
  const initialsOnly = CLUB_AFTER_INITIALS.exec(whole.trim())?.[1] ?? whole;
  // A roster that lists two positions lists the first one first: "Midfielder/
  // Defender" is a midfielder who covers. Read the first and ignore the rest,
  // which is what these pages have always printed. North Greenville 2023
  // (cc/north-greenville) joins the two with a comma instead: "CAM,LW".
  const first = initialsOnly.split(/[/,]/)[0] ?? "";
  const word = first
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!word) return null;
  // Single-letter positions joined by a hyphen — "F-M", "M-B" on Missouri
  // S&T's 2026 roster — are the two-position form again in initials, and
  // the first listed is the position. The hyphen is already a space here.
  // Francis Marion (cc/francis-marion) joins the two-letter token the same
  // way: "MF-D" in 2023, "F-MF" in 2025.
  const initials = /^(?:gk|mf|[a-z])(?: (?:gk|mf|[a-z]))+$/.test(word)
    ? (word.split(" ")[0] as string)
    : word;
  // Word by word, so "Center Middlefielder" is corrected the same as "Middlefielder".
  const spelled = initials
    .split(" ")
    .map((w) => PUBLISHED_TYPOS[w] ?? w)
    .join(" ");
  for (const [published, line] of POSITIONS) if (published.test(spelled)) return line;
  return null;
}

/** ".909" — a rate printed the way a box score prints it, leading zero cut. */
export function rate3(value: number | undefined): string | null {
  if (value === undefined || Number.isNaN(value)) return null;
  const s = value.toFixed(3);
  return s.startsWith("0.") ? s.slice(1) : s;
}

export function pct1(value: number | undefined): string | null {
  if (value === undefined || Number.isNaN(value)) return null;
  return `${(value * 100).toFixed(1)}%`;
}
