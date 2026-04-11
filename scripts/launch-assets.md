# College Golf Data - Launch Assets

## Target Launch: April 15, 2026 (aligned with new Broadie rankings release)

---

## Twitter/X Posts

### Launch Tweet (@CollegeGolfBot)

Where is your team going to regionals?

We built an interactive S-curve prediction tool for the 2026 NCAA D1 Men's Golf Championship.

81 teams. 6 regionals. Serpentine distribution with host swaps and travel distances.

Updated every time new Broadie/Clippd rankings drop.

collegegolfdata.com

### Launch Tweet (@collegegolfdail)

New from @CollegeGolfBot and College Golf Daily:

collegegolfdata.com - an interactive regional prediction tool for NCAA D1 golf.

See which teams are projected to which regional, travel distances, and who drew the favorable assignment.

Updated weekly with new rankings.

### Thread Post 2 (@CollegeGolfBot)

How does the S-curve work?

The NCAA uses a serpentine distribution:
- Seeds 1-6 go to regionals 1-6
- Seeds 7-12 go 6-1 (reversed)
- Seeds 13-18 go 1-6 again

Host schools get swapped to their home regional within their seed tier.

Our model replicates this exact process.

### Thread Post 3 (@CollegeGolfBot)

Travel distance matters more than most people think.

We calculate great-circle distance from each team's campus to their assigned regional. Sort by Distance to see who is flying coast-to-coast and who drew a short drive.

### Thread Post 4 (@CollegeGolfBot)

This is the start of something bigger. Coming soon:

- Women's regional predictions (selections Apr 29)
- Our own contextual scoring metric (SGT+)
- Team season reports
- Schedule analyzer
- Historical record books

Built by @CollegeGolfBot and @MikkelGolf

collegegolfdata.com

---

## Substack Cross-Promo

### For David's 5count4 Substack

Excited to share a new project with @MikkelGolf.

We built collegegolfdata.com - an interactive S-curve tool that shows where each of the 81 D1 men's teams is projected for regionals. Based on the latest Broadie/Clippd rankings, updated weekly.

This is step one. We are building toward a full data platform for college golf - think team season reports, a schedule analyzer, record books, and eventually our own ranking system. More details coming as we build.

### For Mikkel's MikkelGolf Substack

New project with David Tenneson (@CollegeGolfBot): collegegolfdata.com.

An interactive tool that predicts NCAA D1 regional assignments using the serpentine S-curve algorithm. See your team's projected regional, travel distance, and how the field shapes up at each site.

Updated every Wednesday when new Broadie/Clippd rankings release. Women's predictions coming after April 29 selections.

This is just the free entry point. The real products are coming.

---

## Key Talking Points

1. **Nobody else does this** - No public tool replicates the NCAA S-curve interactively
2. **Updated with every rankings release** - Wednesdays when Broadie updates
3. **Travel burden** - Distance calculations reveal geographic disadvantage
4. **Free** - No login, no paywall. The free tools build the audience
5. **Data-driven** - Broadie/Clippd power rankings, not subjective picks
6. **Built by two people who know this space** - David's historical expertise + Mikkel's data engineering

## Hashtags

#CollegeGolf #NCAAD1Golf #NCAAGolf #CollegeGolfData #D1Golf #NCAARegionals

---

## DNS Checklist (David's Porkbun account)

1. [ ] Get Porkbun credentials from David
2. [ ] Add CNAME record: collegegolfdata.com -> cname.vercel-dns.com
3. [ ] Add CNAME record: www.collegegolfdata.com -> cname.vercel-dns.com
4. [ ] In Vercel dashboard: Settings > Domains > add collegegolfdata.com
5. [ ] Verify SSL certificate auto-provisioned by Vercel
6. [ ] Test https://collegegolfdata.com loads correctly
7. [ ] Test OG image with Twitter Card Validator (cards-dev.twitter.com/validator)
8. [ ] Share live link with David for final review

## Weekly Rankings Update Checklist (Wednesdays)

1. [ ] New Broadie/Clippd rankings release on scoreboard.clippd.com/rankings
2. [ ] David updates his spreadsheet with latest rankings
3. [ ] Export rankings as TSV
4. [ ] Run: `npx tsx scripts/update-rankings.ts --gender men --input rankings.tsv`
5. [ ] Run: `npx tsx scripts/capture-rankings-snapshot.ts --label weekly`
6. [ ] Update LAST_UPDATED date in src/app/page.tsx
7. [ ] Run: `npm run build` (verify zero errors)
8. [ ] Deploy: `npx vercel --prod`
9. [ ] Tweet updated predictions from @CollegeGolfBot with notable changes
10. [ ] Cross-post on @collegegolfdail if significant movement

## Postseason Capture Schedule

These are David's 3 benchmark snapshots for the Schedule Analyzer and Season Reports:

1. **Post-conference championships** (~Apr 28-May 3 depending on last conf champ)
   - `npx tsx scripts/capture-rankings-snapshot.ts --label post-conference`
   - Capture before any regional adjustments

2. **Post-regionals** (~May 21)
   - `npx tsx scripts/capture-rankings-snapshot.ts --label post-regionals`
   - Compare with: `--compare snapshots/2026-xx-xx-men-post-conference.json`

3. **Post-nationals** (~Jun 4)
   - `npx tsx scripts/capture-rankings-snapshot.ts --label post-nationals`
   - Compare with: `--compare snapshots/2026-xx-xx-men-post-regionals.json`

## Branding Notes

David raised the question of branding/logo. Things to decide:

- [ ] Logo design (dark theme compatible, should look good as Twitter avatar)
- [ ] Color palette (currently using the CADDIE dark theme)
- [ ] Whether to create a shared social account vs cross-posting from @CollegeGolfBot and @collegegolfdail
- [ ] Visual identity for tables and charts that is recognizable across platforms
