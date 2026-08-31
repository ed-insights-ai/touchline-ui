#!/usr/bin/env bash
# Pixel-diff the built site against a saved baseline.
#
# A refactor that changes no behaviour should change no pixels, and asserting
# that is not the same as checking it. This caught an abbreviation column sized
# in `ch` that truncated "FHSU" to "FH…" — a change nothing else noticed,
# because no test renders type.
#
#   scripts/visual.sh save     build, then keep the current render as truth
#   scripts/visual.sh check    build, then diff against it AND assert that no
#                              page scrolls sideways at any width
#
# The pixel diff is a baseline question — did this change move something it
# should not have. The overflow assertion is not: a page that scrolls sideways
# is wrong at every width, with no baseline to consult. It is here because two
# separate invisible elements have broken it — an absolutely positioned
# visually-hidden span, and a hover label at opacity zero — and both times it
# was found by accident rather than by asking.
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

# ── The invariant: the page body never scrolls sideways ──────────────────────
cat > "dist/_overflow.html" <<'HTML'
<!doctype html><meta charset=utf-8><body style="font:12px monospace;white-space:pre" id=o>...</body>
<script>
const PAGES=window.__PAGES,WIDTHS=[320,390,430,768,1024,1440];
(async()=>{const L=[];let bad=0;
for(const w of WIDTHS)for(const p of PAGES){
  const f=document.createElement("iframe");
  f.style.cssText=`width:${w}px;height:900px;border:0;position:absolute;left:-9999px`;
  f.src=p;document.body.appendChild(f);await new Promise(r=>{f.onload=r});
  const d=f.contentDocument.documentElement,b=f.contentDocument.body;
  const over=Math.max(d.scrollWidth-d.clientWidth,b.scrollWidth-b.offsetWidth);
  if(over>0){bad++;L.push(`${w}px OVERFLOW +${over} ${p}`)}
  f.remove();}
L.unshift(`${WIDTHS.length*PAGES.length} combinations, ${bad} scrolling sideways`);
document.getElementById("o").textContent=L.join("\n");})();
</script>
HTML
routes=$(printf '"%s",' "${PAGES[@]%%:*}")
sed -i '' "s|window.__PAGES|[${routes%,}]|" "dist/_overflow.html"
"$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=1000,900 --virtual-time-budget=30000 \
  --dump-dom "http://localhost:$PORT/_overflow.html" 2>/dev/null \
  | sed -n 's|.*<body[^>]*id="o">\(.*\)</body>.*|\1|p' | sed 's|&amp;|\&|g' > "$dest/overflow.txt"
rm -f dist/_overflow.html
overflow=$(cat "$dest/overflow.txt" 2>/dev/null)
echo "  ${overflow:-overflow check produced no output}" | head -1
if printf '%s' "$overflow" | grep -qv ", 0 scrolling sideways"; then
  printf '%s\n' "$overflow" | tail -n +2 | sed 's|^|    |'
fi

[[ -d "$BASE" ]] || { echo "no baseline — run: scripts/visual.sh save" >&2; exit 2; }
fail=0
printf '%s' "$overflow" | grep -q ", 0 scrolling sideways" || fail=1
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
