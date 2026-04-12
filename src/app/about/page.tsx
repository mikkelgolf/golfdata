import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About - College Golf Data",
  description:
    "How the NCAA D1 regional S-curve prediction model works, what we are building, key postseason dates, and the team behind College Golf Data.",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-lg font-semibold text-foreground">About</h1>

      <section className="mt-8 space-y-4 text-[15px] leading-relaxed text-muted-foreground">
        <h2 className="text-xl font-semibold text-foreground">
          What Is College Golf Data?
        </h2>
        <p>
          College Golf Data is a data platform for NCAA college golf, built by
          two people who believe the sport deserves better tools and deeper
          coverage. The vision is something like what{" "}
          <span className="text-foreground">d1baseball.com</span> built for
          college baseball - a genuine home for data, analysis, and historical
          context - but for golf.
        </p>
        <p>
          We started with the S-curve regional prediction tool because it
          answers one of the most common questions in the sport every spring:
          &ldquo;Where is my team going to regionals?&rdquo; Coaches are
          fanatic about this, and nobody was providing an interactive version
          based on real data. But the S-curve is just the entry point. We are
          building toward a comprehensive platform with analytical tools, team
          season reports, schedule optimization, historical record books, and
          our own ranking system.
        </p>
        <p>
          The free tools get eyes on the platform. The paid products - season
          reports, schedule analysis, record books - answer questions that
          coaches and programs actually spend money on. We are not a media
          outlet chasing pageviews. We are building data products for people
          who work in college golf.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-[15px] leading-relaxed text-muted-foreground">
        <h2 className="text-xl font-semibold text-foreground">
          How the S-Curve Works
        </h2>
        <p>
          The NCAA selects 81 teams for the Division I Men&apos;s Golf
          Championship (72 for women&apos;s), distributed across six regional
          sites. The selection committee uses a serpentine (S-curve) distribution
          to balance competitive strength: the top 6 seeds go to regionals 1
          through 6, seeds 7-12 are assigned in reverse order (6 through 1),
          seeds 13-18 go forward again, and so on. This ensures no single
          regional is stacked with all the top-ranked teams.
        </p>

        <h3 className="text-base font-medium text-foreground mt-6">
          Committee vs. Strict S-Curve
        </h3>
        <p>
          Our tool offers two modes. The <strong className="text-foreground">Strict S-Curve</strong>{" "}
          is the pure mathematical serpentine - what a computer would output with
          no human judgment applied. The{" "}
          <strong className="text-foreground">Committee Prediction</strong>{" "}
          replicates how the NCAA selection committee actually operates, with
          three key adjustments:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-[14px] pl-2">
          <li>
            <strong className="text-foreground">Top-seed proximity:</strong>{" "}
            The committee assigns the top 6 seeds to whichever regional site is
            closest to them geographically, rather than following the strict
            serpentine order. This is why a team like Texas typically lands at the
            Bryan Regional, not wherever the math says.
          </li>
          <li>
            <strong className="text-foreground">Host school guarantee:</strong>{" "}
            If a host school is in the field, they play at their home regional.
            The team that would have been placed there swaps with the host
            within the same seed tier.
          </li>
          <li>
            <strong className="text-foreground">Auto-qualifier preference:</strong>{" "}
            Automatic qualifiers from smaller conferences (typically seeded around
            12-13) usually get some geographic consideration. The committee avoids
            shipping them across the country when a closer regional is available.
          </li>
        </ol>
        <p>
          You can toggle between these two modes on the predictions page to see
          how human judgment changes the regional assignments versus a pure
          mathematical approach. The differences tell you a lot about where the
          committee is likely to deviate from the numbers.
        </p>

        <h3 className="text-base font-medium text-foreground mt-6">
          The Advancement Line
        </h3>
        <p>
          In the regional view, you will see a red dashed line between the 5th
          and 6th team in each regional. The top 5 teams from each regional
          advance to the NCAA Championship. This makes the matchups around that
          cutoff line the most interesting - those are the bubble teams where
          head-to-head records, course familiarity, and momentum matter most.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-[15px] leading-relaxed text-muted-foreground">
        <h2 className="text-xl font-semibold text-foreground">
          Why Geography Matters
        </h2>
        <p>
          Travel distance is one of the most underappreciated factors in
          regional performance. Teams that fly across the country face jet lag,
          unfamiliar course conditions, and altitude or climate changes. The NCAA
          selection committee considers geography when finalizing placements,
          but competitive balance takes priority. Our distance calculations and
          interactive travel map help fans and coaches see which teams drew
          favorable or unfavorable travel and how that might influence results.
        </p>
      </section>

      {/* Roadmap */}
      <section className="mt-10 space-y-4 text-[15px] leading-relaxed text-muted-foreground">
        <h2 className="text-xl font-semibold text-foreground">
          What We&apos;re Building Next
        </h2>
        <p>
          The S-curve is just the beginning. Here is what is on the roadmap:
        </p>

        <div className="mt-4 space-y-3">
          <RoadmapItem
            title="Weekly Ranking Snapshots"
            timing="This month"
            description="Track how S-curve predictions change each week as new NCAA rankings drop. See which tournaments shifted the picture."
          />
          <RoadmapItem
            title="Head-to-Head Records"
            timing="Before regionals"
            description="Within each predicted regional, see how the teams have performed against each other this season. Know who has the edge before the first tee."
          />
          <RoadmapItem
            title="Regional Previews"
            timing="Before regionals"
            description="Automated previews for each regional with course context, grass types, travel history, coaching milestones, and matchup analysis."
          />
          <RoadmapItem
            title="Live Advancement Tracker"
            timing="During regionals"
            description="As round-by-round scores come in, watch each team's probability of advancing update in real time."
          />
          <RoadmapItem
            title="SGT+ Metric"
            timing="Summer 2026"
            description="A contextual scoring metric that adjusts for field strength and conditions. A 70 at Southern Highlands is not the same as a 70 at a lighter-field invitational."
          />
          <RoadmapItem
            title="Schedule Analyzer"
            timing="Fall 2026"
            description="Help teams project what finishes they need in planned tournaments to hit their ranking targets and make regionals."
          />
          <RoadmapItem
            title="Conference Championships"
            timing="Spring 2027"
            description="The same interactive treatment we built for regionals, applied to every D1 conference championship."
          />
        </div>
      </section>

      <section className="mt-10 space-y-4 text-[15px] leading-relaxed text-muted-foreground">
        <h2 className="text-xl font-semibold text-foreground">
          Key Dates - 2026 Postseason
        </h2>
        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border bg-card">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Event</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Date</th>
              </tr>
            </thead>
            <tbody>
              {[
                { event: "Women's NCAA Selections", date: "April 29" },
                { event: "Men's NCAA Selections", date: "May 6" },
                { event: "Women's Regionals", date: "May 11-13" },
                { event: "Women's Nationals", date: "May 17-22" },
                { event: "Men's Regionals", date: "May 18-20" },
                { event: "Men's Nationals", date: "May 29 - June 3" },
              ].map((row) => (
                <tr
                  key={row.event}
                  className="border-b border-border/40 hover:bg-secondary/50 transition-colors"
                >
                  <td className="px-3 py-2 text-foreground">{row.event}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{row.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10 space-y-4 text-[15px] leading-relaxed text-muted-foreground">
        <h2 className="text-xl font-semibold text-foreground">The Team</h2>

        <div className="space-y-2">
          <h3 className="text-base font-medium text-foreground">
            Mikkel Bjerch-Andresen
          </h3>
          <p>
            Mikkel is a golf coach, data analyst, and former college golf coach
            with seven years on staff at Stephen F. Austin, Texas Tech, and
            Baylor. He played college golf at Baylor (2011-2015) and now coaches
            at WANG Toppidrett in Oslo while building data tools for the sport.
            He writes about coaching and analytics at{" "}
            <a
              href="https://mikkelgolf.substack.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary-hover underline underline-offset-2 transition-colors"
            >
              mikkelgolf on Substack
            </a>{" "}
            and built the automated{" "}
            <a
              href="https://twitter.com/collegegolfdail"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary-hover underline underline-offset-2 transition-colors"
            >
              @collegegolfdail
            </a>{" "}
            daily briefing on X. Mikkel handles data infrastructure, web
            development, automation, and the technical pipeline from scraping
            through BigQuery to the live site.
          </p>
        </div>

        <div className="space-y-2">
          <h3 className="text-base font-medium text-foreground">
            David Tenneson
          </h3>
          <p>
            David is a college golf historian and analyst who has spent years
            manually assembling what is likely the most complete collection of
            NCAA Championship and Regional results in existence - pulling data
            from Golfstat, the Wayback Machine, and primary NCAA sources going
            back decades. He created{" "}
            <a
              href="https://twitter.com/CollegeGolfBot"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary-hover underline underline-offset-2 transition-colors"
            >
              @CollegeGolfBot
            </a>{" "}
            on X and writes about selection methodology, rankings, and
            championship history at{" "}
            <a
              href="https://5count4.substack.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary-hover underline underline-offset-2 transition-colors"
            >
              5count4 on Substack
            </a>
            . His deep knowledge of conference qualifying, committee tendencies,
            and historical precedent forms the analytical backbone of this
            project. David handles research, data verification, the S-curve
            methodology, and the SGT+ metric development.
          </p>
        </div>
      </section>

      <div className="mt-12 border-t border-border pt-6">
        <Link
          href="/"
          className="text-sm text-primary hover:text-primary-hover transition-colors"
        >
          &larr; Back to predictions
        </Link>
      </div>
    </div>
  );
}

function RoadmapItem({
  title,
  timing,
  description,
}: {
  title: string;
  timing: string;
  description: string;
}) {
  return (
    <div className="ring-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[14px] font-medium text-foreground">{title}</h3>
        <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">
          {timing}
        </span>
      </div>
      <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>
    </div>
  );
}
