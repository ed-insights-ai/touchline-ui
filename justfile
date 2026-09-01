# Touchline — the publish loop.
#
#   just            collect → journal → build → publish
#   just verify     types, lint, build (what CI would run)
#
# Every step is separately runnable, because they fail for different reasons
# and only one of them costs anything.

set shell := ["bash", "-uc"]

# How a collect is invoked. The launchd cadence script is the source of truth
# for that command; this delegates rather than restating it.
collect_cmd := env_var_or_default("TOUCHLINE_COLLECT_CMD", "sh " + env_var('HOME') + "/.keelson/scripts/touchline-collect-cadence.sh")

# Where the built site is published from, and to.
branch := env_var_or_default("PUBLISH_BRANCH", "gh-pages")

# Where the built site will be SERVED from. A GitHub project page serves under
# /<repo>/, so every href and asset URL has to carry that prefix — a build
# without it produces a site whose pages exist and whose every link and
# stylesheet 404s, which is exactly what shipped until this was set. Override
# both for a custom domain (SITE_BASE="" SITE_URL=https://example.com).
site_base := env_var_or_default("SITE_BASE", "/touchline-ui")
site_url := env_var_or_default("SITE_URL", "https://ed-insights-ai.github.io")

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
gate:
    @echo "→ gate"
    bun test

# Ask the sources for today's record. Costs network and time; nothing else does.
collect:
    @echo "→ collect"
    {{collect_cmd}}

# Write the season's journal, then drop every claim the data cannot support.
# The national run comes AFTER the conferences: its brief reads the cards'
# lines and the wires, so it must see today's conference journals, not
# yesterday's.
journal:
    # --strict is deliberately absent: a dropped claim is the system working.
    @echo "→ journal"
    bun run journal run --all
    bun run journal validate --all --write
    bun run journal run --national
    bun run journal validate --national --write

# Vendor the flag artwork the origin table places, and only that.
#
# Deliberately NOT part of `build` or `verify`: the copy is a checked-in
# artefact, so a build needs neither node_modules full of flags nor a network,
# and a test holds the vendored set equal to the table in both directions. Run
# this when the origin table gains a nation.
flags:
    @echo "→ flags"
    bun scripts/flags.ts

# Render the static site from the data home.
build:
    @echo "→ build  (base {{site_base}})"
    TOUCHLINE_STRICT_BASE=1 SITE_BASE="{{site_base}}" SITE_URL="{{site_url}}" bun run build

# Types, lint, tests, and a clean build — the gate before publishing.
verify:
    bunx tsc --noEmit -p tsconfig.json
    bun run check
    bun test
    TOUCHLINE_STRICT_BASE=1 SITE_BASE="{{site_base}}" SITE_URL="{{site_url}}" bun run build
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
# path it is about to serve them from.
publish: _require-git gate build
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

# Publishing needs somewhere to publish to; say so rather than half-doing it.
_require-git:
    @git rev-parse --is-inside-work-tree >/dev/null 2>&1 || \
      (echo "not a git repository — run 'git init', commit, and add a remote before publishing" && exit 1)
    @git remote get-url origin >/dev/null 2>&1 || \
      (echo "no 'origin' remote — add one before publishing" && exit 1)

# Preview the built site exactly as it will be served.
preview: build
    bun run preview
