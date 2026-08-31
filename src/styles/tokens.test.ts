/**
 * The claim tokens.css makes about its own two faintest inks, held.
 *
 * The file says --faint and --fainter set no type at all. It has said
 * something like that before and been wrong for months: the comment claimed
 * --fainter never set type while --fainter was setting type in five places,
 * and it licensed --faint for "text that duplicates something already on the
 * page" while --faint carried the play-by-play's own sentences on 4,222 rows
 * (tui-4hr, tui-mmt). A sentence in a comment is not a rule. This is.
 *
 * Two things it does that a grep for `var(--faint)` cannot:
 *
 *   • It reads the VALUE, not the name. #8b9096 was reachable through
 *     --chip-context-fg and --muted-mark, two aliases the tui-4hr sweep went
 *     straight past, and one of them was the away side's score (tui-p54). A
 *     new alias holding the same hex fails here on the day it is written.
 *   • It reads every stylesheet the site actually ships — tokens.css,
 *     base.css, and the scoped <style> block of every component and page —
 *     rather than the one file someone remembered to check.
 *
 * It governs type only. --faint still draws the foul pips, the legend swatch
 * that has to match them, the dotted rule under the gap count and the hollow
 * square for a class year no roster published; those are marks, and the type
 * floor is not the question a mark answers.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";

const SRC = new URL("..", import.meta.url).pathname;

/** CSS comments are prose about the rules, not rules. The doctrine comment in
 *  tokens.css names both tokens in a sentence, and reading it as a
 *  declaration would fail this test on its own explanation of itself. */
const uncommented = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

/** Every stylesheet the built site carries: the two .css files, and the scoped
 *  block of every .astro component and page. */
function stylesheets(): { file: string; css: string }[] {
  const out: { file: string; css: string }[] = [];
  for (const file of walk(SRC)) {
    const ext = extname(file);
    const text = readFileSync(file, "utf8");
    if (ext === ".css") out.push({ file, css: uncommented(text) });
    else if (ext === ".astro") {
      for (const m of text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
        out.push({ file, css: uncommented(m[1] ?? "") });
      }
    }
  }
  return out;
}

/** name → the hex it ends up at, following one token to another. */
function tokenValues(): Map<string, string> {
  const css = uncommented(readFileSync(join(SRC, "styles/tokens.css"), "utf8"));
  const raw = new Map<string, string>();
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    raw.set((m[1] as string).trim(), (m[2] as string).trim());
  }
  const resolve = (v: string, depth = 0): string => {
    const ref = /^var\(\s*(--[\w-]+)/.exec(v);
    if (!ref || depth > 8) return v.toLowerCase();
    return resolve(raw.get(ref[1] as string) ?? v, depth + 1);
  };
  return new Map([...raw].map(([k, v]) => [k, resolve(v)]));
}

/** Every declaration that puts ink on a glyph, with the hex it resolves to. */
function typeInk(): { file: string; rule: string; value: string; hex: string | null }[] {
  const tokens = tokenValues();
  const out: { file: string; rule: string; value: string; hex: string | null }[] = [];
  for (const { file, css } of stylesheets()) {
    for (const m of css.matchAll(/(^|[{;\s])(-webkit-text-fill-color|color)\s*:\s*([^;}]+)/g)) {
      const value = (m[3] as string).trim();
      const ref = /^var\(\s*(--[\w-]+)/.exec(value);
      const hex = ref ? (tokens.get(ref[1] as string) ?? null) : value.toLowerCase();
      // The selector this sits in, for a failure that says where to look.
      const at = m.index ?? 0;
      const rule = (css.slice(0, at).match(/([^{};]*)\{[^{}]*$/)?.[1] ?? "").trim().slice(-70);
      out.push({ file: file.replace(SRC, ""), rule, value, hex });
    }
  }
  return out;
}

describe("the faintest inks set no type", () => {
  const tokens = tokenValues();
  const banned = new Map(
    (["--faint", "--fainter"] as const).map((n) => [tokens.get(n) as string, n]),
  );

  test("both tokens are still defined, and still distinct values", () => {
    expect(tokens.get("--faint")).toMatch(/^#[0-9a-f]{6}$/);
    expect(tokens.get("--fainter")).toMatch(/^#[0-9a-f]{6}$/);
    expect(tokens.get("--faint")).not.toBe(tokens.get("--fainter"));
  });

  test("no rule anywhere gives a glyph --faint or --fainter, by name or by value", () => {
    const offenders = typeInk()
      .filter((d) => d.hex !== null && banned.has(d.hex))
      .map(
        (d) =>
          `${d.file}  {${d.rule}}  color: ${d.value}  → ${d.hex} (${banned.get(d.hex as string)})`,
      );
    expect(offenders).toEqual([]);
  });

  test("the sweep is actually reading the stylesheets", () => {
    // A test that silently stops finding anything is worse than no test. The
    // ledger's play text is the rule tui-4hr moved, so it is the canary.
    const ink = typeInk();
    expect(ink.length).toBeGreaterThan(150);
    expect(ink.some((d) => d.file.includes("PlayLedger") && d.hex === tokens.get("--quiet"))).toBe(
      true,
    );
  });
});
