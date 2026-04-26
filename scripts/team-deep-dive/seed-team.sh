#!/usr/bin/env bash
# seed-team.sh — run the full /team-deep-dive ingest pipeline for one team.
# Idempotent. Safe to re-run.
#
# Usage:
#   ./scripts/team-deep-dive/seed-team.sh <slug> <men|women>

set -euo pipefail

SLUG="${1:?usage: seed-team.sh <slug> <men|women>}"
GENDER="${2:?usage: seed-team.sh <slug> <men|women>}"
case "$GENDER" in
  m|men) G=m ;;
  w|women) G=w ;;
  *) echo "gender must be men/women/m/w" >&2; exit 1 ;;
esac
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

echo "==> [$SLUG $GENDER] roster-discovery"
rm -f "data/team-deep-dive/roster-preview-${SLUG}-${G}.json"
npx tsx scripts/team-deep-dive/roster-discovery.ts "$SLUG" "$GENDER" 2>&1 | tail -1

echo "==> [$SLUG $GENDER] roster-from-bq"
~/venv/bin/python scripts/team-deep-dive/roster-from-bq.py "$SLUG" "$GENDER" 2>&1 | tail -2

echo "==> [$SLUG $GENDER] careers-from-bq"
~/venv/bin/python scripts/team-deep-dive/careers-from-bq.py "$SLUG" "$GENDER" 2>&1 | tail -2

# Wikipedia infobox — NCAA titles, individual medalists, conference, alumni.
echo "==> [$SLUG] scrape-wikipedia"
~/venv/bin/python scripts/team-deep-dive/scrape-wikipedia-program.py "$SLUG" "$GENDER" 2>&1 | tail -1 || true

# Parse school PDF if available (yields nothing for non-TT layouts but
# harmless).
PDF=$(ls data/source/${SLUG}-record-book-*.pdf data/source/${SLUG}-media-guide-*.pdf 2>/dev/null | head -1 || true)
if [ -n "$PDF" ]; then
  echo "==> [$SLUG] parse-school-pdf ($PDF)"
  ~/venv/bin/python scripts/team-deep-dive/parse-school-pdf.py "$PDF" "$SLUG" "$GENDER" 2>&1 | grep -E "letterwinners|head_coaches|all_americans" | head -3 || true
fi

echo "==> [$SLUG $GENDER] build-player-exports"
npx tsx scripts/team-deep-dive/build-player-exports.ts "$SLUG" "$GENDER" 2>&1 | tail -2

echo "==> [$SLUG $GENDER] build-record-book"
npx tsx scripts/team-deep-dive/build-record-book.ts "$SLUG" "$GENDER" 2>&1 | tail -1

echo "==> [$SLUG $GENDER] DONE"
