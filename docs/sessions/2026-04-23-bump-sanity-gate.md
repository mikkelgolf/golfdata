# Bump daily-refresh sanity gate

**Started:** 2026-04-23T15:55:00Z
**Requester:** David Tenneson
**Branch:** ron/bump-sanity-gate
**Base:** dev
**Status:** in-progress

## Task
Raise the SANITY_PCT threshold in `scripts/daily-refresh.sh` so legitimate
Clippd daily updates don't trip the gate. Today (2026-04-23) Clippd's
afternoon rankings push came in at 63% row delta — comfortably above the
current 50% threshold despite being real data (Tulsa played an extra
tournament, shifting many teams by a row or two). The script comment
already flagged that the 50% value was provisional ("Tighten once we've
seen a couple of days of real runs"); two weeks of real runs since then
show 50% is too tight for routine Clippd pushes.

## Actions
_(filled on !wrap)_

## Diff stats
_(filled on !wrap)_

## Open questions / learnings
_(filled on !wrap)_
