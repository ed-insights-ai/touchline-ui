/**
 * Verify the DEPLOYED site, by asking the host for real status codes.
 *
 * Everything else in this repo checks an artefact: the tests check functions,
 * links.ts checks the built files against each other, visual.sh renders them.
 * All of that passed for weeks against a deployment where every stylesheet and
 * every link returned 404, because the pages were built to /touchline-ui/gac/
 * and their URLs said /gac/. Served locally at root the site was perfect;
 * served at its real address it had no CSS and no working navigation.
 *
 * A string in the HTML is not a URL that resolves. This is the only check in
 * the repo that knows the difference, so it runs after publish and not before.
 *
 *   bun scripts/deployed.ts https://ed-insights-ai.github.io/touchline-ui/
 */

export {};

const root = (process.argv[2] ?? "").replace(/\/+$/, "");
if (!root) {
  console.error("usage: bun scripts/deployed.ts <deployed-url>");
  process.exit(2);
}

interface Result {
  url: string;
  status: number | string;
  why: string;
}

const results: Result[] = [];

async function head(url: string, why: string): Promise<number | string> {
  try {
    // Some static hosts answer HEAD differently from GET; ask the way a
    // browser asks, and read only the headers we need.
    const r = await fetch(url, { redirect: "follow" });
    results.push({ url, status: r.status, why });
    return r.status;
  } catch (e) {
    results.push({ url, status: `error: ${(e as Error).message}`, why });
    return "error";
  }
}

async function body(url: string): Promise<string> {
  const r = await fetch(url, { redirect: "follow" });
  results.push({ url, status: r.status, why: "page" });
  return r.status === 200 ? await r.text() : "";
}

const abs = (u: string): string => (u.startsWith("http") ? u : new URL(u, root).href);

// The pages a reader actually arrives at, one of each kind.
const PAGES = [
  "/",
  "/gac/",
  "/about/",
  "/gac/team/harding/",
  "/gac/match/sidearm-fort-hays-state-14053/",
];

// A static host takes a little while to serve what was just pushed, so the
// check waits for the deploy to appear rather than racing it. It waits for a
// STAMP the caller names — otherwise it would happily verify the previous
// deploy and call it green.
const stamp = process.argv[3];
if (stamp) {
  const deadline = Date.now() + 180_000;
  process.stdout.write(`  waiting for the deploy to carry ${stamp} `);
  for (;;) {
    const html = await fetch(`${root}/`, { redirect: "follow" })
      .then((r) => (r.ok ? r.text() : ""))
      .catch(() => "");
    if (html.includes(stamp)) {
      console.log("— live");
      break;
    }
    if (Date.now() > deadline) {
      console.log("— TIMED OUT; checking whatever is being served");
      break;
    }
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, 5000));
  }
}

console.log(`deployed check: ${root}`);

// 1. The root, and the redirect target it names. A meta-refresh URL is not an
//    href and not followed by a plain fetch — it was the first symptom anyone
//    saw and the last thing any crawler looked at.
const rootHtml = await body(`${root}/`);
const refresh = /http-equiv="refresh"[^>]*content="[^"]*?url=([^";]+)"/i.exec(rootHtml)?.[1];
if (refresh) {
  console.log(`  redirect target: ${refresh}`);
  await head(abs(refresh), "meta-refresh target");
} else if (rootHtml) {
  console.log("  (root carries no meta refresh)");
}

// 2. Every stylesheet and script the pages ask for, plus a sample of links.
const seen = new Set<string>();
for (const page of PAGES) {
  const html = page === "/" ? rootHtml : await body(`${root}${page}`);
  if (!html) continue;
  const assets = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(
    (m) => m[1],
  );
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  const links = [...html.matchAll(/\shref="(\/[^"#?]*)"/g)].map((m) => m[1]);
  for (const a of [...assets, ...scripts]) {
    if (!a || a.startsWith("http") || seen.has(a)) continue;
    seen.add(a);
    await head(abs(a), `asset on ${page}`);
  }
  // A sample, not all of them: enough to prove the shape is right.
  for (const l of links.slice(0, 4)) {
    if (!l || seen.has(l)) continue;
    seen.add(l);
    await head(abs(l), `link on ${page}`);
  }
}

const bad = results.filter((r) => r.status !== 200);
for (const r of results) {
  const mark = r.status === 200 ? "  ok  " : "  FAIL";
  if (r.status !== 200) console.log(`${mark} ${String(r.status).padEnd(5)} ${r.url}   (${r.why})`);
}
console.log(`  ${results.length} URLs requested, ${bad.length} not 200`);
process.exit(bad.length === 0 ? 0 : 1);
