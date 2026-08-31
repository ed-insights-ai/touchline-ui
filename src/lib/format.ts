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
export const LINE_ORDER = ["GK", "DEF", "MID", "FWD"] as const;
export const LINE_LABEL: Record<Line, string> = {
  GK: "IN GOAL",
  DEF: "BACK LINE",
  MID: "MIDFIELD",
  FWD: "FRONT LINE",
};
export function positionLine(position: string | undefined): Line | null {
  if (!position) return null;
  const s = position.toLowerCase();
  if (s.startsWith("g")) return "GK";
  if (s.startsWith("d")) return "DEF";
  if (s.startsWith("m")) return "MID";
  if (s.startsWith("f")) return "FWD";
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
