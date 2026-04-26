"""http_cache — gzip-cached HTTP fetcher with rate limiting + robots.txt check.

Used by every M2 scraper (school-news, wayback, loc-newspapers, etc.).
- One cache file per URL (sha1-keyed) under data/cache/<host>/<sha1>.html.gz
- Per-host rate limit (configurable, default 1 req/2s)
- Exponential backoff on 429/5xx
- Optional robots.txt enforcement (cached per host for 24h)
- Returns (status_code, text, from_cache) tuple
"""

from __future__ import annotations

import gzip
import hashlib
import time
import urllib.parse
import urllib.robotparser
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_CACHE_ROOT = REPO_ROOT / "data" / "cache"
DEFAULT_USER_AGENT = "CollegeGolfData/0.1 (+https://collegegolfdata.com; mikkelgolfllc@gmail.com)"

_last_request_at: dict[str, float] = defaultdict(float)
_robots_cache: dict[str, tuple[urllib.robotparser.RobotFileParser, datetime]] = {}


class HttpCache:
    def __init__(
        self,
        cache_root: Path = DEFAULT_CACHE_ROOT,
        user_agent: str = DEFAULT_USER_AGENT,
        rate_limit_seconds: float = 2.0,
        respect_robots: bool = True,
        timeout: int = 30,
    ):
        self.cache_root = cache_root
        self.user_agent = user_agent
        self.rate_limit_seconds = rate_limit_seconds
        self.respect_robots = respect_robots
        self.timeout = timeout
        self._session = requests.Session()
        self._session.headers.update({"User-Agent": user_agent, "Accept-Language": "en-US,en;q=0.9"})

    def _host(self, url: str) -> str:
        return urllib.parse.urlparse(url).netloc

    def _cache_path(self, url: str) -> Path:
        host = self._host(url) or "_unknown"
        h = hashlib.sha1(url.encode()).hexdigest()
        return self.cache_root / host / f"{h}.html.gz"

    def _check_robots(self, url: str) -> bool:
        if not self.respect_robots:
            return True
        host = self._host(url)
        if not host:
            return True
        cached = _robots_cache.get(host)
        if cached and (datetime.now() - cached[1]) < timedelta(hours=24):
            return cached[0].can_fetch(self.user_agent, url)
        rp = urllib.robotparser.RobotFileParser()
        rp.set_url(f"https://{host}/robots.txt")
        try:
            rp.read()
        except Exception:
            # If robots.txt can't be read, default to permissive.
            _robots_cache[host] = (rp, datetime.now())
            return True
        _robots_cache[host] = (rp, datetime.now())
        return rp.can_fetch(self.user_agent, url)

    def _wait_rate_limit(self, url: str) -> None:
        host = self._host(url)
        elapsed = time.monotonic() - _last_request_at[host]
        if elapsed < self.rate_limit_seconds:
            time.sleep(self.rate_limit_seconds - elapsed)
        _last_request_at[host] = time.monotonic()

    def get(
        self,
        url: str,
        use_cache: bool = True,
        max_retries: int = 5,
    ) -> tuple[int, str, bool]:
        """Returns (status_code, text, from_cache)."""
        cache_path = self._cache_path(url)
        if use_cache and cache_path.exists():
            with gzip.open(cache_path, "rt") as f:
                return 200, f.read(), True

        if not self._check_robots(url):
            return 999, "", False  # 999 = robots-blocked sentinel

        for attempt in range(max_retries):
            self._wait_rate_limit(url)
            try:
                r = self._session.get(url, timeout=self.timeout, allow_redirects=True)
                if r.status_code == 200:
                    cache_path.parent.mkdir(parents=True, exist_ok=True)
                    with gzip.open(cache_path, "wt") as f:
                        f.write(r.text)
                    return r.status_code, r.text, False
                if r.status_code in (429, 500, 502, 503, 504):
                    backoff = (2**attempt) * 5
                    time.sleep(backoff)
                    continue
                # 4xx that's not 429 — don't retry.
                return r.status_code, r.text, False
            except (requests.ConnectionError, requests.Timeout):
                backoff = (2**attempt) * 5
                time.sleep(backoff)
        return 0, "", False

    def get_json(self, url: str, use_cache: bool = True) -> tuple[int, dict | list | None, bool]:
        status, text, cached = self.get(url, use_cache=use_cache)
        if status != 200 or not text:
            return status, None, cached
        try:
            import json

            return status, json.loads(text), cached
        except Exception:
            return status, None, cached
