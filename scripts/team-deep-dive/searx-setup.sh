#!/usr/bin/env bash
# searx-setup.sh — one-time install of self-hosted Searx on the Mac Mini.
#
# Searx is the free meta-search aggregator that gives us unlimited Google +
# Bing + DDG + Brave queries from localhost (no API quota, no ToS friction).
#
# Prereq: Docker (Docker Desktop OR colima). If neither installed, the
# scrape-search-aggregator.py phase no-ops gracefully — the rest of the
# pipeline still produces deep coverage from school news, Wayback, LoC,
# library archives, conference + USGA + rankings.
#
# Install Docker (one-time, takes ~5 min):
#     brew install --cask docker             # Docker Desktop UI
#     # OR for headless:
#     brew install colima docker
#     colima start
#
# Then run this script once:
#     bash scripts/team-deep-dive/searx-setup.sh
#
# After it succeeds, scrape-search-aggregator.py will detect the running
# instance at http://localhost:8888 and start using it on the next dispatch.

set -euo pipefail

cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker not installed. Install via 'brew install --cask docker' OR 'brew install colima docker', then re-run."
  exit 1
fi

# Make sure Docker daemon is reachable.
if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon not running. Start Docker Desktop or 'colima start' and re-run."
  exit 1
fi

mkdir -p ~/searx-data
cat > ~/searx-data/settings.yml <<'YAML'
use_default_settings: true
server:
  port: 8888
  bind_address: "0.0.0.0"
  secret_key: "cgd-team-deep-dive"
  limiter: false
  image_proxy: false
search:
  safe_search: 0
  formats:
    - html
    - json
engines:
  - name: google
    disabled: false
  - name: bing
    disabled: false
  - name: duckduckgo
    disabled: false
  - name: brave
    disabled: false
ui:
  static_use_hash: true
YAML

docker rm -f searxng 2>/dev/null || true
docker run -d \
  --name searxng \
  --restart unless-stopped \
  -p 127.0.0.1:8888:8080 \
  -v ~/searx-data:/etc/searxng \
  -e SEARXNG_BASE_URL=http://localhost:8888/ \
  searxng/searxng:latest

echo "Searx running at http://localhost:8888 — test with:"
echo "  curl 'http://localhost:8888/search?q=texas+tech+golf&format=json' | head"
