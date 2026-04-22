# Session: Team-page map timezone lines + travel-hour delta

- **Status:** in-progress
- **Date:** 2026-04-22
- **Branch:** `ron/david-test` (!here flow)
- **Base:** `dev` (fork point `ac575bd` — "Redesign Regionals History")
- **Started:** 2026-04-22T00:00:00Z

## Task

"Draw the timezone lines on the United States map that appears in each
of the team pages. Next to the travel distance calculation, also display
the timezone difference represented as the number of hours the team is
traveling for the Regional. For example, a team based in the Eastern
time zone that is traveling to the Central time zone would show
'-1 hour' whereas a team traveling from the Pacific timezone to the
Central time zone will show '+2 hours'. Keep in mind that the Regionals
are played in May/June so all timezones should be based on that time of
year."

- **Requester:** David Tenneson (collegegolfbook on Discord)
- **Started:** 2026-04-22

### Interpretation / plan

Two pieces:

1. **Draw timezone boundaries on the US map.** The team-page map
   currently shows a US outline + the team's campus pin + the
   Regional host pin + a great-circle arc. I'll overlay the four
   CONUS timezone boundaries (Eastern / Central / Mountain /
   Pacific) as thin divider lines, plus a subtle band or label
   so a reader knows which zone they're looking at. Since
   Regionals are in May/June, all of CONUS observes DST
   (EDT/CDT/MDT/PDT), meaning the zone offsets are the usual
   -4/-5/-6/-7 from UTC. Hawaii/Alaska teams are out of scope
   unless a Regional ever lands there — if they do I'll handle
   them generically but not go out of my way.

2. **Timezone delta next to travel distance.** Compute the
   difference between the team's campus tz and the Regional
   host's tz, express it as "+N hour(s)" or "-N hour(s)".
   Negative means travelling east-to-west-losing-time, wait
   actually the example says "Eastern → Central = -1 hour",
   which reads as "one hour earlier" — i.e. the clock goes
   back when the team arrives at the Regional. So sign
   convention: `targetOffset - sourceOffset` in hours, where
   offsets are negative numbers vs UTC. Eastern (-4) →
   Central (-5) = -5 - -4 = -1. Pacific (-7) → Central (-5) =
   -5 - -7 = +2. Matches the examples.

### Scope notes

- Timezone assignment will be derived from longitude (rough
  rule), with a few hand-placed exceptions for the handful of
  states/counties that straddle boundaries (e.g. Arizona
  always on MST but pretend PDT in May/June for this site's
  purposes — or not; Arizona doesn't observe DST, so in
  May/June it matches PDT. I'll handle that specifically).
  The timezone boundaries I draw on the map will follow the
  official state/county lines visually, not straight
  meridians — so a pre-baked GeoJSON path per zone is
  simplest.
- If no pre-baked timezone boundary path is available in the
  repo, I'll use a lightweight approach: render the boundaries
  as polylines sourced from the standard US timezone GeoJSON
  (Mike Bostock / Natural Earth). Keeping the file small is
  important since this sits inside a server-rendered team page.
