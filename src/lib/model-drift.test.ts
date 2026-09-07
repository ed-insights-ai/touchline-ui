// model.ts against the rib's contract, key by key.
//
// model.ts descends from the rib's src/model.ts but is this site's own file
// (its header says why), so nothing holds it to the rib by text. What holds
// it is the contract the rib publishes: one sample document per season-file
// schema under contracts/, each cut to exercise every field, every optional,
// and every enumerated value the writer can emit, and held to the writer by
// the rib's own CI (pipeline/src/contracts.py reduces writer output to
// (path, kind) facts and refuses any fact the fixture lacks). So the fixture
// IS the rib's field inventory, and this file compares it with ours.
//
// Both directions are asserted. A key the fixture carries that no schema
// here declares is a rib addition this site would refuse outright (every
// object schema is strict); contracts.test.ts would fail on it too, but as a
// zod error, not a named key. A key declared here that no fixture carries is
// either a site invention the rib never promised or a rib field its fixture
// does not exercise; the ones known today are listed, exactly, so a new one
// fails with its name and a listed one the fixture starts to carry fails too.
//
// Paths follow the rib's own convention: a record's keys are data, so they
// collapse to `*`, and an array's items to `[]`. The rib checkout is read
// only where it exists; otherwise the suite skips, naming the path.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { z } from "zod";
import { contractsDir, contractsPresent } from "./contracts-dir.ts";
import {
  FIXTURES_SCHEMA,
  fixturesFileSchema,
  MATCHES_SCHEMA,
  matchesFileSchema,
  ROSTERS_SCHEMA,
  rostersFileSchema,
  STATS_SCHEMA,
  statsFileSchema,
} from "./model.ts";

const KEY = "*";
const ITEM = "[]";

/** The zod 4 definition of a schema, whatever wrapper it arrived in. */
type Def = {
  type: string;
  innerType?: z.ZodType;
  element?: z.ZodType;
  valueType?: z.ZodType;
  items?: readonly z.ZodType[];
  shape?: Record<string, z.ZodType>;
};
const defOf = (s: z.ZodType): Def => (s as unknown as { def: Def }).def;

/** Every key path a schema declares, in the rib's path convention. */
export function declaredPaths(
  schema: z.ZodType,
  prefix = "",
  out = new Set<string>(),
): Set<string> {
  const d = defOf(schema);
  switch (d.type) {
    case "optional":
    case "nullable":
    case "default":
    case "readonly":
      if (d.innerType) declaredPaths(d.innerType, prefix, out);
      break;
    case "object":
      for (const [key, child] of Object.entries(d.shape ?? {})) {
        const path = prefix ? `${prefix}.${key}` : key;
        out.add(path);
        declaredPaths(child, path, out);
      }
      break;
    case "array":
      if (d.element) declaredPaths(d.element, `${prefix}.${ITEM}`, out);
      break;
    case "record":
      if (d.valueType) declaredPaths(d.valueType, `${prefix}.${KEY}`, out);
      break;
    case "tuple":
      for (const item of d.items ?? []) declaredPaths(item, `${prefix}.${ITEM}`, out);
      break;
    default:
      // A leaf: string, number, boolean, literal, enum. Nothing beneath it.
      break;
  }
  return out;
}

/** Which paths the schema declares as records, so a document's keys there
 *  read as data rather than as field names. */
function recordPaths(schema: z.ZodType, prefix = "", out = new Set<string>()): Set<string> {
  const d = defOf(schema);
  switch (d.type) {
    case "optional":
    case "nullable":
    case "default":
    case "readonly":
      if (d.innerType) recordPaths(d.innerType, prefix, out);
      break;
    case "object":
      for (const [key, child] of Object.entries(d.shape ?? {})) {
        recordPaths(child, prefix ? `${prefix}.${key}` : key, out);
      }
      break;
    case "array":
      if (d.element) recordPaths(d.element, `${prefix}.${ITEM}`, out);
      break;
    case "record":
      out.add(prefix);
      if (d.valueType) recordPaths(d.valueType, `${prefix}.${KEY}`, out);
      break;
    case "tuple":
      for (const item of d.items ?? []) recordPaths(item, `${prefix}.${ITEM}`, out);
      break;
    default:
      break;
  }
  return out;
}

/** Every key path a document carries, in the same convention. */
export function presentPaths(
  doc: unknown,
  records: Set<string>,
  prefix = "",
  out = new Set<string>(),
): Set<string> {
  if (Array.isArray(doc)) {
    for (const item of doc) presentPaths(item, records, `${prefix}.${ITEM}`, out);
  } else if (doc !== null && typeof doc === "object") {
    const isRecord = records.has(prefix);
    for (const [key, value] of Object.entries(doc)) {
      const path = isRecord ? `${prefix}.${KEY}` : prefix ? `${prefix}.${key}` : key;
      if (!isRecord) out.add(path);
      presentPaths(value, records, path, out);
    }
  }
  return out;
}

const dir = contractsDir();

/** The four season files, the schemas model.ts reads them with, and the keys
 *  each declares that the rib's fixture does not exercise as of its contract
 *  changelog of 2026-09-07. Every one of these is declared by the rib's own
 *  src/model.ts as well, so none is a site invention: `clock` is the live
 *  fixture's minute, and no collect has caught a live row; `offsides` is a
 *  box-score team line the fixture's pages did not print; and the match line
 *  schema is shared between outfield players and keepers, so the keeper-only
 *  fields never appear on a player row and the outfield fields never on a
 *  keeper row. A key leaving this list means the rib's fixture now carries
 *  it; a key joining it needs the same reasoning written here. */
const seasonFiles = [
  {
    file: "fixtures-2.json",
    schema: FIXTURES_SCHEMA,
    shape: fixturesFileSchema,
    unexercised: ["fixtures.[].clock"],
  },
  { file: "rosters-1.json", schema: ROSTERS_SCHEMA, shape: rostersFileSchema, unexercised: [] },
  { file: "stats-1.json", schema: STATS_SCHEMA, shape: statsFileSchema, unexercised: [] },
  {
    file: "matches-2.json",
    schema: MATCHES_SCHEMA,
    shape: matchesFileSchema,
    unexercised: [
      "matches.*.teams.[].keepers.[].assists",
      "matches.*.teams.[].keepers.[].goals",
      "matches.*.teams.[].keepers.[].shots",
      "matches.*.teams.[].keepers.[].sog",
      "matches.*.teams.[].keepers.[].started",
      "matches.*.teams.[].offsides",
      "matches.*.teams.[].players.[].goals_against",
      "matches.*.teams.[].players.[].saves",
    ],
  },
] as const;

const sorted = (s: Set<string>) => [...s].sort();
const except = (a: Set<string>, b: Set<string>) => sorted(new Set([...a].filter((p) => !b.has(p))));

describe("model.ts declares exactly the keys the rib's contract fixtures carry", () => {
  if (!contractsPresent(dir)) {
    test.skip(`skipped: no rib contracts directory at ${dir} (set TOUCHLINE_CONTRACTS_DIR)`, () => {});
    return;
  }

  for (const c of seasonFiles) {
    const doc: unknown = JSON.parse(readFileSync(join(dir, c.file), "utf8"));
    const declared = declaredPaths(c.shape);
    const present = presentPaths(doc, recordPaths(c.shape));

    test(`${c.schema}: every key the rib's ${c.file} carries is one model.ts declares`, () => {
      // A key here is a rib addition this site would refuse: the schemas are
      // strict. The name is the finding; fix model.ts, and the rib's contract
      // changelog says what the key means.
      expect(except(present, declared)).toEqual([]);
    });

    test(`${c.schema}: every key model.ts declares is one the rib's ${c.file} exercises, or is listed`, () => {
      // A new key here is one the rib never promised to write, or promised
      // and whose fixture was not updated. Either way the two files disagree.
      expect(except(declared, present)).toEqual([...c.unexercised].sort());
    });
  }
});
