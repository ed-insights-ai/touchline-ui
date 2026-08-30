# Touchline UI — Architecture Concept

The site is a **static season journal rebuilt on every data collect**, with an
AI editorial step that writes the stories and a validator that keeps the AI
honest. No server, no database at runtime.

```
launchd (daily 06:30, exists today)
  └─ touchline-collect ──────────► data home JSON (source of truth)
        ~/keelson/d2-soccer/data/{fixtures,rosters,stats,matches,coverage}
        versioned contracts: touchline.fixtures/2, rosters/1, stats/1, matches/1

  └─ journal step (NEW, AI) ─────► journal-{season}-{gender}-{conf}.json
        input:  current data home state (+ previous journal for continuity)
        output: headline, dek, findings[], players_to_watch[], featured matches
        guardrail: a VALIDATOR recomputes every OBSERVED/DERIVED claim against
        the data and drops anything it cannot verify (same pattern as the rib's
        validate-narrative step in touchline-report). SIGNAL/PROJECTED pass on
        schema only. The AI writes *inside* the evidence grammar, never around it.

  └─ site build (SSG) ───────────► static HTML/CSS/JS
        renders data JSON + journal JSON into the Scorebook pages
        recommendation: Astro (already the house tool — docs site is
        Astro/Starlight), static output, islands later for drawers/sheets

  └─ deploy ─────────────────────► public URL
        static dir → GitHub Pages / Cloudflare Pages / Netlify — pick one,
        all are "push and it's live". Simplest first loop: a GitHub Action on
        the data repo (or a `deploy` branch of this repo) that runs build +
        publishes Pages. The launchd job just commits/pushes after collect.
```

## Why static

- Data changes at most a few times a day (collect cadence), not per-request.
- Pages are read-heavy, content-shaped, and must be cheap/easy to publish.
- "Editorial at rest, analytical on intent": rest = prerendered HTML;
  intent = small client-side islands (player sheet, drawers, hovers) reading
  the same JSON, added in phase 2. No backend needed until much later.

## The journal contract (the AI seam)

See `reference/journal.sample.json` — real content for Aug 30, 2026.
Key properties:

- One journal file per (season, gender, conference). Regenerated per collect;
  prior versions retained (append-only history → enables "season rewind").
- Every finding carries `label` (observed|derived|signal|projected|context),
  `text`, and `basis` (the numbers/refs the claim rests on) so the validator
  can recheck it and the UI can expose provenance on click.
- The build must not break if the journal is missing/stale: pages render from
  data alone with a neutral headline fallback. AI enhances; it is never a
  runtime dependency.

## Ground rules

1. **The data home is read-only to this repo.** Resolve it via `TOUCHLINE_DATA_DIR`
   (default `~/keelson/d2-soccer`). Never write into it.
2. **Conference-agnostic.** GAC is config, not code. Conferences/programmes come
   from the data files (`fixtures/{season}-{gender}-{conf}.json` envelopes).
   The UI must render GSC/LSC by switching config alone.
3. **Contracts over scraping.** Consume the versioned JSON shapes (the rib's
   `src/model.ts` is the authority: Fixture, Player, PlayerStats, KeeperStats,
   MatchDetail, TableRow/computeTable, coverage cells). Port the small pure
   helpers (computeTable, isPlayed, groupByDate) or vendor them.
4. **Honesty states are first-class.** Score-less finals, past-date silences,
   coverage gaps each have designed states (see mocks). 3-state truth:
   not collected ≠ not published ≠ no collector.
5. **Every number on a page must be recomputable from the data home.** No
   hand-tuned figures in templates.

## Suggested build order

1. Scaffold (Astro, TypeScript strict, no UI framework yet) + tokens.css from
   DESIGN-SYSTEM.md.
2. Data adapter package: load + type the four JSON files, port computeTable,
   derive the aggregates the Season page needs (records, GF/GA, form,
   unresolved-fixture counts, week-of-season).
3. Season page from real data, pixel-matched to `mocks/season.html`.
4. Team page (`/team/{slug}`) matched to `mocks/team.html`.
5. Match Centre (`/match/{id}`) matched to `mocks/match.html` +
   `mocks/match-silent.html` for the no-score state.
6. Journal integration: render `journal.sample.json`; then the generator CLI
   (prompt template + validator) as a separate script — model-agnostic,
   invoked by the collect pipeline, committed output.
7. Deploy loop (Pages) with a Makefile/justfile target: `collect → journal →
   build → publish`.

Player sheet is an island (phase 2) — design is final in `mocks/player.html`.
