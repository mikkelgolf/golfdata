#!/usr/bin/env bash
# Fetch the latest Vercel deployment URL for a given git branch.
# Usage: scripts/vercel-preview.sh <branch>
# Requires: VERCEL_API_TOKEN env var, jq, curl.

set -euo pipefail

BRANCH="${1:-}"
if [ -z "$BRANCH" ]; then
  echo "usage: scripts/vercel-preview.sh <branch>" >&2
  exit 2
fi

if [ -z "${VERCEL_API_TOKEN:-}" ]; then
  echo "VERCEL_API_TOKEN not set. Add one to ~/projects/ron/.env." >&2
  exit 3
fi

PROJECT_ID="prj_Dj5g8WMufBXE9jaMUoVrT39AGRzb"
API="https://api.vercel.com/v6/deployments?projectId=${PROJECT_ID}&limit=30"

RESPONSE=$(curl -sS -H "Authorization: Bearer ${VERCEL_API_TOKEN}" "$API")

echo "$RESPONSE" | jq -e --arg branch "$BRANCH" '
  .deployments // []
  | map(select(.meta.githubCommitRef == $branch))
  | sort_by(.created) | reverse | .[0]
  | if . == null then
      error("no deployment found for branch: " + $branch)
    else
      "url:     https://\(.url)\nstate:   \(.state)\ncreated: \(.created | . / 1000 | strftime("%Y-%m-%d %H:%M:%S UTC"))\ncommit:  \(.meta.githubCommitSha // "?" | .[0:8])\nmessage: \(.meta.githubCommitMessage // "")"
    end
' -r 2>&1 || {
  echo "no deployment found for branch: $BRANCH" >&2
  exit 4
}
