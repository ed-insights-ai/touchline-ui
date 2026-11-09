# Touchline — the publish loop.
#
#   just            collect → journal → build → publish
#   just verify     types, lint, build (what CI would run)
#
# Every step is separately runnable, because they fail for different reasons
# and only one of them costs anything.

set shell := ["bash", "-uc"]

# How a collect is invoked. The rib's bin/touchline-collect-cadence.sh (installed
# behind a launchd shim) is the source of truth
# for that command; this delegates rather than restating it. It is passed its
# `collect` mode — collect and detect only — because with no argument the
# script runs its FULL loop (collect, journal, commit, publish), and `just all`
# runs journal, build and publish itself right after this step: the default
# would journal and publish twice, the first time behind `all`'s back (tl-u2kt).
# TOUCHLINE_COLLECT_CMD overrides the whole command, mode included.
collect_cmd := env_var_or_default("TOUCHLINE_COLLECT_CMD", "sh " + env_var('HOME') + "/.keelson/scripts/touchline-collect-cadence.sh collect")

# Where the built site is published from, and to.
branch := env_var_or_default("PUBLISH_BRANCH", "gh-pages")

# Where the built site will be SERVED from. A GitHub project page serves under
# /<repo>/, so every href and asset URL has to carry that prefix — a build
# without it produces a site whose pages exist and whose every link and
# stylesheet 404s, which is exactly what shipped until this was set. Override
# both for a custom domain (SITE_BASE="" SITE_URL=https://example.com).
site_base := env_var_or_default("SITE_BASE", "/touchline-ui")
site_url := env_var_or_default("SITE_URL", "https://ed-insights-ai.github.io")

# The divisions this deploy publishes, comma-separated. The men's site is
# always built, at site_base as it always was; "women" adds a second build
# served beside it at {{site_base}}/women (src/site.config.ts genderPath), and
# with both listed every page's header carries the Men / Women switch.
#
# A publish replaces the whole branch, so a publish that leaves a division out
# takes it off the live site. The list is therefore a property of the
# deployment, not of whoever runs `just publish`: TOUCHLINE_GENDERS when set,
# else the rib config's "genders" (the same list the daily cadence follows),
# else the men's site alone. A cadence run pinned to one gender
# (TOUCHLINE_GENDER=men) still publishes every division.
genders := env_var_or_default("TOUCHLINE_GENDERS", `jq -r '(.genders // ["men"]) | join(",")' "$HOME/.keelson/rib-touchline/config.json" 2>/dev/null || echo men`)
with_women := if genders =~ '(^|,)\s*women\s*(,|$)' { "1" } else { "" }

default: all

# The whole loop, in the order the pipeline runs it.
all: collect journal build publish

# The tests, standing between the model-composed journal and any publish.
# A dependency of `publish` itself — not a step in `all` — because the
# cadence script calls `just publish` directly and every other path here
# ends the same way: whoever publishes, the gate stands in front of them.
# A regeneration that fails the copy properties stops the loop and the site
# keeps serving yesterday's build, which is the correct failure —
# correctness over freshness, by the owner's ruling (tui-9ue).
#
# The tests describe the men's configuration (19 conferences, the men's
# journals), so they always run under it: the women's cadence run calls
# `just publish` with TOUCHLINE_GENDER=women in its environment, and the gate
# must hold the same tree to the same tests whichever division's run calls it.
gate:
    @echo "→ gate"
    TOUCHLINE_GENDER=men bun test

# Ask the sources for today's record. Costs network and time; nothing else does.
# Collect only: the journal and the publish are the recipes below, not the
# script's own loop.
collect:
    @echo "→ collect"
    {{collect_cmd}}

# Write the season's journal, then drop every claim the data cannot support.
# The conferences run side by side, at most four at a time (`--concurrency N`
# on the first line changes that), each validated as soon as its own reply is
# in. The national run comes AFTER the conferences: its brief reads the cards'
# lines and the wires, so it must see today's conference journals, not
# yesterday's.
journal:
    # --strict is deliberately absent: a dropped claim is the system working.
    @echo "→ journal"
    bun run journal run --all --write
    bun run journal run --national --write
    if [ -n "{{with_women}}" ]; then \
      echo "→ journal (women)"; \
      TOUCHLINE_GENDER=women bun run journal run --all --write && \
      TOUCHLINE_GENDER=women bun run journal run --national --write; \
    fi

# Vendor the flag artwork the origin table places, and only that.
#
# Deliberately NOT part of `build` or `verify`: the copy is a checked-in
# artefact, so a build needs neither node_modules full of flags nor a network,
# and a test holds the vendored set equal to the table in both directions. Run
# this when the origin table gains a nation.
flags:
    @echo "→ flags"
    bun scripts/flags.ts

# Render the static site from the data home. The men's build goes first because
# Astro empties its outDir, and dist/ is the men's; the women's build then
# writes dist/women/, so one dist/ holds the whole deploy.
build:
    @echo "→ build  (base {{site_base}}, divisions {{genders}})"
    TOUCHLINE_STRICT_BASE=1 TOUCHLINE_GENDER=men TOUCHLINE_GENDERS="{{genders}}" SITE_BASE="{{site_base}}" SITE_URL="{{site_url}}" bun run build
    if [ -n "{{with_women}}" ]; then \
      echo "→ build  (base {{site_base}}/women)"; \
      TOUCHLINE_STRICT_BASE=1 TOUCHLINE_GENDER=women TOUCHLINE_GENDERS="{{genders}}" TOUCHLINE_OUT_DIR=dist/women SITE_BASE="{{site_base}}/women" SITE_URL="{{site_url}}" bun run build; \
    fi

# Types, lint, a clean build, then the tests — the gate before publishing.
# The build comes BEFORE the tests because home.test reads dist/index.html
# and holds it to the current source; testing first holds yesterday's build
# to today's tree (tl-om7). `publish` orders its own build and gate the same
# way.
verify:
    bunx tsc --noEmit -p tsconfig.json
    bun run check
    just build
    TOUCHLINE_GENDER=men bun test
    bun scripts/links.ts dist "{{site_base}}"

# Pixel-diff the built site against a saved baseline, at desktop and phone
# width. Deliberately NOT part of `verify`: it needs Chrome and ImageMagick,
# and a refactor's baseline is a judgement about intent, not a fact about the
# tree. Run `just visual-save` when the current render IS the intent, then
# `just visual` after a change that should not have moved anything.
visual:
    ./scripts/visual.sh check

visual-save:
    ./scripts/visual.sh save

# Press keys at the player sheet and check the dialog holds them.
#
# Deliberately NOT part of `verify`, on the same terms as `visual`: it needs
# Chrome and a served artefact, and it asks a behaviour question rather than a
# question about the tree. It is the only check here that presses a key, which
# is the only way to see the defect it exists for — focus walking out of an
# overlay into links behind it renders perfectly and breaks nothing else.
keyboard: build
    bun scripts/keyboard.ts dist "{{site_base}}"

# Ask the LIVE host for status codes. Everything else in this repo checks an
# artefact; this is the only check that knows the difference between a string
# in the HTML and a URL that resolves, which is the difference that shipped a
# site with no stylesheet for weeks.
deployed stamp="":
    bun scripts/deployed.ts "{{site_url}}{{site_base}}/" "{{stamp}}"

# Push dist/ to the publish branch, which the host serves verbatim.
# Publishing rebuilds. dist/ on disk may have been built by any command, with
# or without the base path, and a base-less build deploys a site whose pages
# all exist and whose every link and stylesheet 404s — which is not visible
# from a local server, where root-relative URLs resolve. So the deploy builds
# its own artefact and refuses to ship one whose links do not resolve at the
# path it is about to serve them from. The gate runs AFTER that build, on the
# same terms as `verify`: home.test reads the built page, and a gate before
# the build is holding the previous deploy's page to this tree (tl-om7). The
# gate still stands in front of the push — a failing test stops the publish
# with the artefact built and unshipped.
publish: _require-git build gate
    @echo "→ publish to {{branch}}"
    @test -d dist || (echo "dist/ is missing — run \`just build\` first" && exit 1)
    bun scripts/links.ts dist "{{site_base}}"
    touch dist/.nojekyll
    git worktree remove --force .publish 2>/dev/null || true
    # Continue the published branch where it left off, so every deploy is a
    # commit on top of the last one and the branch is a record of what was
    # live when. Starting it fresh each time makes the push a non-fast-forward.
    git fetch -q origin {{branch}} 2>/dev/null || true
    if git rev-parse --verify -q refs/remotes/origin/{{branch}} >/dev/null; then \
      git worktree add -q --force -B {{branch}} .publish origin/{{branch}}; \
    else \
      git worktree add -q --force --orphan -B {{branch}} .publish; \
    fi
    find .publish -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
    cp -R dist/. .publish/
    cd .publish && git add -A && \
      (git diff --cached --quiet || git commit -q -m "chore(site): publish $(date -u '+%Y-%m-%dT%H:%M:%SZ')") && \
      git push -q origin {{branch}}
    git worktree remove --force .publish
    @echo "  published {{branch}}"
    # A publish is not finished until the host serves it correctly. The stamp
    # is THIS build's timestamp, read back out of the artefact just pushed, so
    # deployed.ts waits for this deploy and cannot green-light the previous
    # one. If the artefact somehow lacks the meta tag, fall back to the base
    # path, which still catches a base-less build.
    stamp="$(sed -n 's/.*name="touchline-build" content="\([^"]*\)".*/\1/p' dist/index.html | head -n1)"; just deployed "${stamp:-{{site_base}}/}"
    # The women's build is held to the same check over its own sample: the
    # default sample names a men's match id, which the women's build never has.
    # Its match page is the first one this very build wrote.
    if [ -n "{{with_women}}" ]; then \
      stamp="$(sed -n 's/.*name="touchline-build" content="\([^"]*\)".*/\1/p' dist/women/index.html | head -n1)"; \
      match="$(find dist/women/gac/match -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort | head -n1 | sed 's#.*/##')"; \
      pages="/,/gac/,/about/,/gac/team/harding/${match:+,/gac/match/$match/}"; \
      bun scripts/deployed.ts "{{site_url}}{{site_base}}/women/" "${stamp:-{{site_base}}/women/}" "$pages"; \
    fi

# Publishing needs somewhere to publish to; say so rather than half-doing it.
_require-git:
    @git rev-parse --is-inside-work-tree >/dev/null 2>&1 || \
      (echo "not a git repository — run 'git init', commit, and add a remote before publishing" && exit 1)
    @git remote get-url origin >/dev/null 2>&1 || \
      (echo "no 'origin' remote — add one before publishing" && exit 1)

# Preview the built site exactly as it will be served.
preview: build
    bun run preview
