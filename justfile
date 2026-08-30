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

default: all

# The whole loop, in the order the pipeline runs it.
all: collect journal build publish

# Ask the sources for today's record. Costs network and time; nothing else does.
collect:
    @echo "→ collect"
    {{collect_cmd}}

# Write the season's journal, then drop every claim the data cannot support.
journal:
    # --strict is deliberately absent: a dropped claim is the system working.
    @echo "→ journal"
    bun run journal run --all
    bun run journal validate --all --write

# Render the static site from the data home.
build:
    @echo "→ build"
    bun run build

# Types, lint, and a clean build — the gate before publishing.
verify:
    bunx tsc --noEmit -p tsconfig.json
    bun run check
    bun run build

# Push dist/ to the publish branch, which the host serves verbatim.
publish: _require-git
    @echo "→ publish to {{branch}}"
    @test -d dist || (echo "dist/ is missing — run \`just build\` first" && exit 1)
    touch dist/.nojekyll
    git worktree remove --force .publish 2>/dev/null || true
    git worktree add --force -B {{branch}} .publish
    find .publish -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
    cp -R dist/. .publish/
    cd .publish && git add -A && \
      (git diff --cached --quiet || git commit -q -m "chore(site): publish $(date -u '+%Y-%m-%dT%H:%M:%SZ')") && \
      git push -q origin {{branch}}
    git worktree remove --force .publish
    @echo "  published {{branch}}"

# Publishing needs somewhere to publish to; say so rather than half-doing it.
_require-git:
    @git rev-parse --is-inside-work-tree >/dev/null 2>&1 || \
      (echo "not a git repository — run 'git init', commit, and add a remote before publishing" && exit 1)
    @git remote get-url origin >/dev/null 2>&1 || \
      (echo "no 'origin' remote — add one before publishing" && exit 1)

# Preview the built site exactly as it will be served.
preview: build
    bun run preview
