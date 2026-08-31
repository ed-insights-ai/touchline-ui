#!/usr/bin/env bash
# Pixel-diff the built site against a saved baseline.
#
# A refactor that changes no behaviour should change no pixels, and asserting
# that is not the same as checking it. This caught an abbreviation column sized
# in `ch` that truncated "FHSU" to "FH…" — a change nothing else noticed,
# because no test renders type.
#
#   scripts/visual.sh save     build, then keep the current render as truth
#   scripts/visual.sh check    build, then diff against it
#
# Pages are rendered inside fixed-width iframes: headless Chrome's
# --window-size does not reliably set the layout viewport, so a phone
# screenshot taken that way is the desktop layout cropped, which is worse than
# no check at all.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${TOUCHLINE_VISUAL_DIR:-${TMPDIR:-/tmp}/touchline-visual}"
BASE="$OUT/baseline"
CUR="$OUT/current"
PORT="${TOUCHLINE_VISUAL_PORT:-8795}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

PAGES=(
  "/gac/:season"
  "/lsc/:season-lsc"
  "/gac/team/harding/:team"
  "/gac/team/rogers-state/:team-keeper"
  "/gsc/team/spring-hill/:team-unplayed"
  "/gac/match/sidearm-fort-hays-state-14053/:match"
  "/gsc/match/sidearm-delta-state-14841/:match-messy"
  "/gac/match/sidearm-ouachita-baptist-6655/:match-silent"
)
WIDTHS=(1440 390)

mode="${1:-check}"
[[ "$mode" == "save" || "$mode" == "check" ]] || { echo "usage: visual.sh [save|check]" >&2; exit 2; }
command -v magick >/dev/null || { echo "visual.sh needs ImageMagick (brew install imagemagick)" >&2; exit 2; }
[[ -x "$CHROME" ]] || { echo "visual.sh needs Google Chrome" >&2; exit 2; }

cd "$ROOT"
bun run build >/dev/null

dest="$CUR"; [[ "$mode" == "save" ]] && dest="$BASE"
rm -rf "$dest"; mkdir -p "$dest"

python3 -m http.server "$PORT" --directory dist >/dev/null 2>&1 &
server=$!
trap 'kill $server 2>/dev/null || true' EXIT
for _ in $(seq 1 40); do curl -sf "http://localhost:$PORT/" >/dev/null && break; sleep 0.25; done

# One shot per width: every page in its own correctly-sized iframe, side by side.
for w in "${WIDTHS[@]}"; do
  frames=""
  for entry in "${PAGES[@]}"; do
    frames+="<iframe src=\"${entry%%:*}\" style=\"width:${w}px;height:2400px;border:0\"></iframe>"
  done
  cat > "dist/_visual.html" <<HTML
<!doctype html><meta charset=utf-8>
<body style="margin:0;display:flex;background:#888">$frames</body>
HTML
  total=$(( w * ${#PAGES[@]} ))
  "$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size="$total",2400 --virtual-time-budget=8000 \
    --screenshot="$dest/w$w.png" "http://localhost:$PORT/_visual.html" >/dev/null 2>&1
done
rm -f dist/_visual.html

if [[ "$mode" == "save" ]]; then
  echo "baseline saved to $BASE"
  exit 0
fi

[[ -d "$BASE" ]] || { echo "no baseline — run: scripts/visual.sh save" >&2; exit 2; }
fail=0
for w in "${WIDTHS[@]}"; do
  a="$BASE/w$w.png"; b="$CUR/w$w.png"
  if [[ ! -f "$a" ]]; then echo "  ${w}px  no baseline"; fail=1; continue; fi
  diff=$(magick compare -metric AE "$a" "$b" "$CUR/diff-$w.png" 2>&1 || true)
  px=${diff%% *}
  if [[ "$px" == "0" ]]; then
    echo "  ${w}px  identical"
  else
    echo "  ${w}px  $px pixels differ  →  $CUR/diff-$w.png"
    fail=1
  fi
done
exit $fail
