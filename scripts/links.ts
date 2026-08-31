/**
 * Every URL the built site asks a browser for must resolve, at the path the
 * site is actually served from.
 *
 * This exists because a crawl that did not know about the base path passed
 * cleanly on a site whose every link and stylesheet 404'd in production. The
 * pages were built to /touchline-ui/gac/ and the hrefs said /gac/; served at
 * localhost root the site was perfect, and served at its real URL it had no
 * CSS and no working navigation. Three rounds of verification missed it
 * because all of them either checked the wrong root or grepped the HTML for
 * strings, and a string is present whether or not it resolves.
 *
 * So: resolve against the deployed prefix, and follow everything a browser
 * follows — hrefs, stylesheets, scripts, images, AND meta-refresh targets,
 * which are none of the above and were the first symptom anybody saw.
 *
 *   bun scripts/links.ts <dist-dir> <base>
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const [dist = "dist", rawBase = ""] = process.argv.slice(2);
const base = rawBase.replace(/\/+$/, "");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = walk(dist);
const pages = files.filter((f) => f.endsWith(".html"));

/** Every path the built site can serve, as a browser would ask for it. */
const served = new Set<string>();
for (const f of files) {
  const rel = `/${relative(dist, f).split("\\").join("/")}`;
  served.add(base + rel);
  if (rel.endsWith("/index.html")) served.add(base + rel.slice(0, -"index.html".length));
}

interface Broken {
  page: string;
  url: string;
  kind: string;
}
const broken: Broken[] = [];
let checked = 0;

const REFS: [RegExp, string][] = [
  [/\shref="(\/[^"#?]*)"/g, "href"],
  [/\ssrc="(\/[^"#?]*)"/g, "src"],
  // The one a link crawler never sees: not an element, not an attribute a
  // crawler indexes, and not followed by curl unless asked.
  [/http-equiv="refresh"[^>]*content="[^"]*?url=([^";]+)"/gi, "meta-refresh"],
];

for (const page of pages) {
  const html = readFileSync(page, "utf8");
  const where = `/${relative(dist, page).split("\\").join("/")}`;
  for (const [pattern, kind] of REFS) {
    for (const m of html.matchAll(pattern)) {
      const url = (m[1] ?? "").trim();
      if (!url || !url.startsWith("/")) continue;
      checked++;
      if (!served.has(url)) broken.push({ page: where, url, kind });
    }
  }
  // A site served under a base must not emit root-absolute URLs that skip it:
  // those resolve to the host apex and 404, which is how this shipped.
  if (base) {
    for (const [pattern, kind] of REFS) {
      for (const m of html.matchAll(pattern)) {
        const url = (m[1] ?? "").trim();
        if (url.startsWith("/") && !url.startsWith(`${base}/`) && url !== base) {
          broken.push({ page: where, url, kind: `${kind} misses base` });
        }
      }
    }
  }
}

const unique = [...new Map(broken.map((b) => [`${b.page}|${b.url}|${b.kind}`, b])).values()];
console.log(
  `links: ${pages.length} pages, ${checked} references checked against base "${base || "/"}" — ${unique.length} broken`,
);
for (const b of unique.slice(0, 20)) console.log(`  ${b.kind.padEnd(18)} ${b.url}   in ${b.page}`);
if (unique.length > 20) console.log(`  … and ${unique.length - 20} more`);
if (!existsSync(dist)) console.log(`  (no ${dist} directory)`);
process.exit(unique.length === 0 ? 0 : 1);
