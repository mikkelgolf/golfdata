import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Tools - College Golf Data",
  description:
    "Data tools for NCAA college golf. S-curve regional predictions, SGT+ contextual scoring, schedule analyzer, team season reports, and historical record books.",
};

const tools = [
  {
    name: "S-Curve Regional Predictions",
    description:
      "Interactive serpentine distribution model predicting which 81 men's teams (72 women's) land at which of the 6 NCAA regional sites. Based on Broadie/Clippd rankings with auto-qualifier handling, host school swaps, and travel distance calculations. Updated every time new rankings drop.",
    status: "live" as const,
    href: "/",
  },
  {
    name: "SGT+ (Strokes Gained Tournament Plus)",
    description:
      "A contextual scoring metric that reveals how the same raw score means different things in different tournaments. A 70 at the Southern Highlands Collegiate is not the same as a 70 at a mid-major invitational - SGT+ adjusts for field strength, course difficulty, and round-to-round conditions to produce a normalized value. Early testing on multiple seasons of Southern Highlands scorecards shows promising distributions where players who shot identical raw scores are spread across a meaningful range of SGT+ values, indicating real differences in performance quality.",
    status: "development" as const,
    href: null,
  },
  {
    name: "Team Season Reports",
    description:
      "End-of-season and postseason reports that go beyond raw data pages. Visualize a team's ups and downs through the season, show how plugging in different players changed outcomes, run what-if scenarios on drop scores, analyze wave splits (morning vs afternoon), and measure the fatigue factor on 36-hole days. Built for coaches who want to see the story their season data tells - not just the numbers.",
    status: "development" as const,
    href: null,
  },
  {
    name: "Schedule Analyzer",
    description:
      "Project forward using several years of ranking point data. Show teams what finishes they need in their planned tournaments to hit their ranking targets and make regionals. Combine the what-if analysis from a team's past season with projected scheduling data for the next - a package that helps coaches build smarter schedules and set realistic expectations.",
    status: "planned" as const,
    href: null,
  },
  {
    name: "Record Books",
    description:
      "Historical tournament data going back decades, connecting events across name changes and venue moves. Build the record books that Golfstat used to sell - but better, interactive, and available online. Team pages acting as a digital archive with program records, player histories, and tournament timelines. Free to browse, with premium tiers for detailed analytics and custom research.",
    status: "planned" as const,
    href: null,
  },
];

function StatusBadge({ status }: { status: "live" | "development" | "planned" }) {
  const styles = {
    live: "bg-primary/15 text-primary",
    development: "bg-gold/15 text-gold",
    planned: "bg-secondary text-muted-foreground",
  };
  const labels = {
    live: "Live",
    development: "In Development",
    planned: "Planned",
  };

  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

export default function ToolsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-serif italic text-3xl text-foreground">Tools</h1>
      <p className="mt-3 text-[15px] text-muted-foreground">
        Data-driven tools for NCAA college golf. Built by{" "}
        <Link
          href="/about"
          className="text-primary hover:text-primary-hover underline underline-offset-2 transition-colors"
        >
          David Tenneson and Mikkel Bjerch-Andresen
        </Link>
        .
      </p>

      <div className="mt-8 space-y-4">
        {tools.map((tool) => (
          <div key={tool.name} className="rounded-md border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {tool.href ? (
                    <Link
                      href={tool.href}
                      className="text-base font-medium text-foreground hover:text-primary transition-colors"
                    >
                      {tool.name}
                    </Link>
                  ) : (
                    <span className="text-base font-medium text-foreground">
                      {tool.name}
                    </span>
                  )}
                  <StatusBadge status={tool.status} />
                </div>
                <p className="text-[14px] leading-relaxed text-muted-foreground">
                  {tool.description}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <section className="mt-12 space-y-4 text-[15px] leading-relaxed text-muted-foreground">
        <h2 className="text-xl font-semibold text-foreground">
          About SGT+
        </h2>
        <p>
          Standard scoring stats treat all rounds at par equally. But college
          golf happens in wildly different contexts - a 70 shot against the
          strongest field of the year at Southern Highlands is a fundamentally
          different performance than a 70 at a lighter-field invitational. SGT+
          exists to capture that difference.
        </p>
        <p>
          The metric normalizes scores by adjusting for the quality of the
          field, course difficulty, and conditions within each round. Testing on
          multiple seasons of Southern Highlands Collegiate scorecards shows that
          players who posted identical raw scores in the same round can have
          meaningfully different SGT+ values - the distributions stretch along
          the y-axis, revealing performance differences that raw scores hide.
        </p>
        <p>
          We are testing SGT+ as a predictive metric for next-round scoring
          and tournament outcomes across a wider set of events. The research
          phase is active. More details and the full methodology will be
          published when we are confident in the results.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-[15px] leading-relaxed text-muted-foreground">
        <h2 className="text-xl font-semibold text-foreground">
          The Revenue Path
        </h2>
        <p>
          The S-curve is free and always will be - it gets eyes on the platform
          and establishes credibility. Our own ranking system is next. From
          there, the schedule analyzer and season reports are designed to be
          products that teams will pay for because they answer questions coaches
          actually ask: &ldquo;What finishes do we need to make
          regionals?&rdquo; and &ldquo;How did plugging in that freshman
          actually change our trajectory?&rdquo;
        </p>
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
