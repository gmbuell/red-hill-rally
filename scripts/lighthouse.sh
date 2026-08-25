#!/usr/bin/env bash
# Audit every page, mobile and desktop, and print a score summary.
# Usage: npm run audit [-- <base-url>]   (defaults to the live site)
set -euo pipefail

base="${1:-https://red-hill-rally.gmbuell.workers.dev}"
out="lighthouse-reports"
mkdir -p "$out"

for page in "home:/" "donate:/donate" "board:/rally-board" "link:/student-link"; do
  name="${page%%:*}" path="${page#*:}"
  for ff in mobile desktop; do
    extra=""
    [ "$ff" = desktop ] && extra="--preset=desktop"
    npx lighthouse "$base$path" --output=json --output=html \
      --output-path="$out/$name-$ff" --quiet \
      --chrome-flags="--headless --no-sandbox" $extra >/dev/null 2>&1
    node -e "
      const r = require('./$out/$name-$ff.report.json');
      const s = Object.entries(r.categories)
        .filter(([k]) => k !== 'agentic-browsing')
        .map(([k, v]) => k + ' ' + Math.round(v.score * 100)).join('  ');
      console.log('$name-$ff'.padEnd(16) + s);
    "
  done
done
echo "HTML reports in $out/"
