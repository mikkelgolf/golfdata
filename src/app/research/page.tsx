import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Research - College Golf Data",
  description:
    "NCAA college golf data research. Hole-by-hole scoring from 2005, historical results, weather data, and custom analysis.",
};

export default function ResearchPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-lg font-semibold text-foreground">Research</h1>
      <p className="mt-3 text-[15px] text-muted-foreground max-w-lg">
        We maintain one of the most complete NCAA college golf datasets in
        existence. Research requests, data verification, and custom analysis
        available on request.
      </p>

      <section className="mt-10 space-y-4 text-[15px] leading-relaxed text-muted-foreground">
        <h2 className="text-xl font-semibold text-foreground">
          The Dataset
        </h2>
        <p>
          The core of our database is hole-by-hole scoring data scraped from
          Golfstat, covering D1 men&apos;s and women&apos;s tournaments from
          roughly 2005 to present. Where hole-by-hole data is unavailable, we
          have round-level results. Everything is organized in BigQuery with
          standardized fields across tournaments, seasons, and divisions.
        </p>
        <p>
          On top of the scoring data, we layer in weather reports by tournament
          date and course coordinates, course imagery pulled from Google Maps,
          and historical results that David Tenneson has manually assembled from
          NCAA archives, the Wayback Machine, and other primary sources going
          back decades. We are confident we have the most complete set of NCAA
          Championship and Regional results of anyone working in this space.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
          {[
            { label: "Tournaments", value: "25K+" },
            { label: "Hole-by-hole", value: "2005+" },
            { label: "Player Records", value: "120K+" },
            { label: "Coverage", value: "D1/D2/D3" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-md border border-border bg-card px-4 py-3 text-center">
              <p className="text-lg font-semibold text-foreground font-mono">
                {stat.value}
              </p>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mt-0.5">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 space-y-4 text-[15px] leading-relaxed text-muted-foreground">
        <h2 className="text-xl font-semibold text-foreground">
          What the Data Enables
        </h2>
        <p>
          With standardized hole-by-hole data, the analytical possibilities are
          deep. Some of what we can compute and have been exploring:
        </p>
        <ul className="space-y-3 mt-4">
          {[
            {
              title: "Bounce-back rates",
              desc: "How often does a player follow a bogey or worse with par or better? Who has the best recovery game?",
            },
            {
              title: "Scoring by hole position",
              desc: "How does scoring change from holes 1-6, 7-12, 13-18? Are better teams separating themselves early or late in rounds?",
            },
            {
              title: "Par-type analysis",
              desc: "How do players perform on par 3s of similar distance across a round? What happens on opening par 5s vs closing par 5s?",
            },
            {
              title: "Wave splits and fatigue",
              desc: "Morning vs afternoon scoring differences, and how players hold up on 36-hole days.",
            },
            {
              title: "Tournament record timelines",
              desc: "Connecting events across name changes and venue moves. Historical champions, scoring records, program milestones.",
            },
            {
              title: "Weather-adjusted scoring",
              desc: "Layering actual weather data on tournament dates to contextualize scoring relative to conditions.",
            },
          ].map((item) => (
            <li key={item.title} className="flex gap-3">
              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
              <div>
                <span className="font-medium text-foreground">{item.title}</span>
                <span className="text-muted-foreground"> - {item.desc}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10 space-y-4 text-[15px] leading-relaxed text-muted-foreground">
        <h2 className="text-xl font-semibold text-foreground">
          Research Requests
        </h2>
        <p>
          Think{" "}
          <span className="text-foreground font-medium">
            Sports Reference Stathead
          </span>{" "}
          but for college golf. We sit between the raw data and the people who
          want answers from it. If you have a specific question - historical
          records, player comparisons, strength-of-schedule analysis, content
          fact-checking - reach out and we will run it.
        </p>
        <p>
          We work with media, coaches, SIDs, and independent analysts. Custom
          queries, data exports, and statistical reports available.
        </p>
        <div className="mt-4 space-y-2">
          <p>
            <span className="text-foreground font-medium">David Tenneson</span>{" "}
            -{" "}
            <a
              href="https://twitter.com/CollegeGolfBot"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary-hover underline underline-offset-2 transition-colors"
            >
              @CollegeGolfBot
            </a>
          </p>
          <p>
            <span className="text-foreground font-medium">
              Mikkel Bjerch-Andresen
            </span>{" "}
            -{" "}
            <a
              href="https://mikkelgolf.substack.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary-hover underline underline-offset-2 transition-colors"
            >
              mikkelgolf.substack.com
            </a>
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
