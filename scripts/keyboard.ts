/**
 * The player sheet is a dialog. Prove it with a keyboard.
 *
 * This is the only check on the site that presses keys. Everything else here
 * reads an artefact: links.ts resolves URLs, visual.sh compares pixels, the
 * unit tests recompute figures. None of them can see the defect this exists
 * for, because that defect renders perfectly — the sheet looked right, the
 * markup was valid, and Tab walked straight out of the panel into links behind
 * the scrim that a reader could reach, activate, and not see.
 *
 * It presses real keys. Chrome's Input.dispatchKeyEvent goes through the same
 * path a keyboard does, so Tab moves focus by the browser's own rules rather
 * than by ours; a trap that works only because the test called .focus() for it
 * is not a trap. Synthetic clicks would prove nothing at all.
 *
 * Deliberately NOT part of `just verify`, on the visual.sh precedent: it needs
 * Chrome and a served artefact, and it asks a behaviour question rather than a
 * question about the tree. Run it when the sheet, the squad grid, or the
 * island changes.
 *
 *   just keyboard          build, then check
 *   bun scripts/keyboard.ts <dist-dir> <base>
 *
 * The site is served under its REAL base, for the reason links.ts gives at
 * length: a page served at localhost root is a page whose URLs were never
 * tested.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

const [dist = "dist", rawBase = "/touchline-ui"] = process.argv.slice(2);
const base = rawBase.replace(/\/+$/, "");
const PORT = Number(process.env.TOUCHLINE_KEYBOARD_PORT ?? 8796);
const CDP = Number(process.env.TOUCHLINE_KEYBOARD_CDP ?? 9222);
const CHROME =
  process.env.TOUCHLINE_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/**
 * The pages that carry a player sheet, and why each one is here.
 *
 * A squad with keepers and a squad without gives the panel two different sets
 * of controls to cycle, and the panel's tab order is the thing under test.
 */
const PAGES = [
  "/gac/team/ouachita-baptist/", // a full squad, 31 sheets
  "/gsc/team/spring-hill/", // a programme with no match played yet
];

if (!existsSync(join(dist, "index.html"))) {
  console.error(`keyboard: no built site at ${dist}/ — run \`just build\` first`);
  process.exit(2);
}
if (!existsSync(CHROME)) {
  console.error(`keyboard: needs Google Chrome at ${CHROME} (set TOUCHLINE_CHROME)`);
  process.exit(2);
}

// ── The artefact, served where it will be served ────────────────────────────
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith(`${base}/`)) return new Response("not found", { status: 404 });
    const rest = url.pathname.slice(base.length);
    const file = Bun.file(join(dist, rest.endsWith("/") ? `${rest}index.html` : rest));
    return (await file.exists()) ? new Response(file) : new Response("not found", { status: 404 });
  },
});

// ── Chrome, and a wire to it ────────────────────────────────────────────────
const chrome = Bun.spawn(
  [
    CHROME,
    "--headless=new",
    `--remote-debugging-port=${CDP}`,
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${process.env.TMPDIR ?? "/tmp"}/touchline-keyboard`,
    "--window-size=1440,900",
    "about:blank",
  ],
  { stdout: "ignore", stderr: "ignore" },
);

async function wire(url: string) {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`http://localhost:${CDP}/json/version`)).ok) break;
    } catch {
      /* not up yet */
    }
    await Bun.sleep(250);
  }
  const target = (await (
    await fetch(`http://localhost:${CDP}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })
  ).json()) as { webSocketDebuggerUrl: string };
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => {
    ws.onopen = () => r(null);
  });
  let id = 0;
  const pending = new Map<number, (v: unknown) => void>();
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data)) as { id?: number };
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)?.(m);
      pending.delete(m.id);
    }
  };
  const send = (method: string, params: unknown = {}) =>
    new Promise<Record<string, never>>((res) => {
      const i = ++id;
      pending.set(i, res as (v: unknown) => void);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  return { ws, send };
}

const KEYS: Record<string, number> = { Tab: 9, Escape: 27, Enter: 13 };

interface Wire {
  send: (method: string, params?: unknown) => Promise<Record<string, never>>;
}

function driver(w: Wire) {
  const evaluate = async (expression: string): Promise<unknown> => {
    const r = (await w.send("Runtime.evaluate", { expression, returnByValue: true })) as {
      result?: { result?: { value?: unknown } };
    };
    return r.result?.result?.value;
  };
  const press = async (name: string, shift = false) => {
    const vk = KEYS[name] as number;
    const modifiers = shift ? 8 : 0;
    const common = { key: name, code: name, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
    await w.send("Input.dispatchKeyEvent", { type: "rawKeyDown", modifiers, ...common });
    if (name === "Enter")
      await w.send("Input.dispatchKeyEvent", { type: "char", key: name, text: "\r", modifiers });
    await w.send("Input.dispatchKeyEvent", { type: "keyUp", modifiers, ...common });
    await Bun.sleep(120);
  };
  const settle = async () => {
    for (let i = 0; i < 80; i++) {
      if ((await evaluate("document.readyState")) === "complete") break;
      await Bun.sleep(150);
    }
    await Bun.sleep(350);
  };
  return { evaluate, press, settle };
}

/** Where the keyboard is, and whether it is inside the panel. */
const WHERE = `(() => { const a = document.activeElement;
  if (!a) return '{"tag":"none","cls":"","txt":"","inPanel":false,"href":null}';
  const panel = a.closest ? a.closest(".sheet-panel") : null;
  return JSON.stringify({ tag: a.tagName, cls: a.className || "",
    txt: (a.textContent || "").trim().slice(0, 30), inPanel: !!panel,
    href: a.getAttribute ? a.getAttribute("href") : null }); })()`;

interface Focus {
  tag: string;
  cls: string;
  txt: string;
  inPanel: boolean;
  href: string | null;
}

const results: { ok: boolean; page: string; what: string }[] = [];
let page = "";
const check = (ok: boolean, what: string) => results.push({ ok, page, what });

const { ws, send } = await wire("about:blank");
const { evaluate, press, settle } = driver({ send });

for (const path of PAGES) {
  page = path;
  const url = `http://localhost:${PORT}${base}${path}`;
  await send("Emulation.setScriptExecutionDisabled", { value: false });
  await send("Page.navigate", { url });
  await settle();

  // ── Open a sheet the way a keyboard does ─────────────────────────────────
  const row = (await evaluate(
    `(() => { const r = document.querySelector("a.squad-row"); if (!r) return null;
      r.focus(); return r.getAttribute("href"); })()`,
  )) as string | null;
  if (!row) {
    check(false, "the squad grid offers a row to open");
    continue;
  }
  await press("Enter");
  let at = JSON.parse((await evaluate(WHERE)) as string) as Focus;
  check((await evaluate("location.hash")) === row, `Enter on a squad row opens ${row}`);
  check(at.inPanel && at.cls.includes("sheet-panel"), "focus moves into the panel");
  check(
    (await evaluate(`document.querySelector("${row} .sheet-panel").getAttribute("aria-modal")`)) ===
      "true",
    "aria-modal is claimed once the trap is live",
  );

  // ── The trap ─────────────────────────────────────────────────────────────
  let escaped = false;
  for (let i = 0; i < 25 && !escaped; i++) {
    await press("Tab");
    at = JSON.parse((await evaluate(WHERE)) as string) as Focus;
    if (!at.inPanel) escaped = true;
  }
  check(!escaped, "Tab twenty-five times never leaves the panel");

  await evaluate(
    `(() => { const p = document.querySelector("${row} .sheet-panel");
      const f = p.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (f[0]) f[0].focus(); })()`,
  );
  await press("Tab", true);
  at = JSON.parse((await evaluate(WHERE)) as string) as Focus;
  check(at.inPanel, "Shift+Tab from the first control wraps inside");

  // ── Closing hands the keyboard back ──────────────────────────────────────
  await press("Escape");
  at = JSON.parse((await evaluate(WHERE)) as string) as Focus;
  check((await evaluate("location.hash")) === "#squad", "Escape closes to #squad");
  check(at.cls.includes("squad-row") && at.href === row, "focus returns to the row that opened it");
  check(
    (await evaluate(`document.querySelector("${row} .sheet-panel").hasAttribute("aria-modal")`)) ===
      false,
    "aria-modal is dropped when the trap goes",
  );
  check(
    (await evaluate(`getComputedStyle(document.querySelector("${row}")).display`)) === "none",
    "the sheet is closed",
  );

  // The × is the pointer's way out and the keyboard's second one. It must
  // hand focus back exactly as Escape does, or the two disagree.
  await evaluate(`document.querySelector("a.squad-row").focus()`);
  await press("Enter");
  await evaluate(`document.querySelector("${row} .sheet-close").focus()`);
  await press("Enter");
  at = JSON.parse((await evaluate(WHERE)) as string) as Focus;
  check(at.cls.includes("squad-row"), "the close control returns focus the same way Escape does");

  // ── With scripting off, exactly the site that shipped before the island ──
  await send("Emulation.setScriptExecutionDisabled", { value: true });
  await send("Page.navigate", { url: url + row });
  await settle();
  check(
    (await evaluate(`getComputedStyle(document.querySelector("${row}")).display`)) === "block",
    "with scripting off the :target overlay still opens",
  );
  check(
    (await evaluate(`document.querySelector("${row} .sheet-panel").hasAttribute("aria-modal")`)) ===
      false,
    "with scripting off no modality is promised",
  );
  check(
    (await evaluate(`document.querySelector("${row} .sheet-panel").getAttribute("role")`)) ===
      "dialog",
    "role=dialog stands either way",
  );
}

ws.close();
chrome.kill();
server.stop(true);

const failed = results.filter((r) => !r.ok);
for (const r of failed) console.log(`  FAIL  ${r.page}  ${r.what}`);
console.log(
  `keyboard: ${results.length - failed.length}/${results.length} checks on ${PAGES.length} pages — ${
    failed.length === 0 ? "the dialog holds the keyboard" : `${failed.length} failing`
  }`,
);
process.exit(failed.length === 0 ? 0 : 1);
