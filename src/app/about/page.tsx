import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About — College Golf Data",
  description:
    "How the NCAA D1 regional S-curve prediction model works and who built it.",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-serif italic text-3xl text-foreground">About</h1>

      <section className="mt-8 space-y-4 text-[15px] leading-relaxed text-muted-foreground">
        <h2 className="text-xl font-semibold text-foreground">
          How the S-Curve Works
        </h2>
        <p>
          The NCAA selects 81 teams for the Division I Men&apos;s Golf
          Championship, distributed across six regional sites. The selection
          committee uses a serpentine (S-curve) distribution to balance
          competitive strength across regionals: the top 6 seeds are assigned to
          regionals 1 through 6, seeds 7-12 are assigned in reverse order (6
          through 1), seeds 13-18 go forward again, and so on. This ensures no
          single regional is stacked with all the top-ranked teams.
        </p>
        <p>
          After the initial serpentine placement, the committee makes adjustments
          to ensure host schools play at their home regional. When a host school
          would otherwise be assigned elsewhere, it is swapped with the team in
          its seed tier that was originally placed at the host&apos;s home
          regional. This preserves competitive balance within each tier while
          honoring the host advantage.
        </p>
        <p>
          Our model replicates this process using the latest Broadie/Clippd
          power rankings combined with conference auto-qualifier status. We then
          calculate the travel distance from each team&apos;s campus to their
          assigned regional site using the Haversine formula, giving you a sense
          of the geographic burden each team faces.
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
          selection committee considers geography when finalizing placements, but
          competitive balance takes priority. Our distance calculations help fans
          and coaches understand which teams drew favorable or unfavorable travel
          assignments and how that might influence results.
        </p>
      </section>

      <section className="mt-10 space-y-4 text-[15px] leading-relaxed text-muted-foreground">
        <h2 className="text-xl font-semibold text-foreground">The Team</h2>

        <div>
          <h3 className="text-base font-medium text-foreground">
            David Tenneson
          </h3>
          <p>
            David is a college golf historian, analyst, and the author of{" "}
            <a
              href="https://5count4.substack.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary-hover underline underline-offset-2 transition-colors"
            >
              5count4 on Substack
            </a>
            , where he covers NCAA golf selection, rankings methodology, and
            championship history. His deep knowledge of conference qualifying,
            selection committee tendencies, and historical precedent forms the
            analytical backbone of this project.
          </p>
        </div>

        <div>
          <h3 className="text-base font-medium text-foreground">
            Mikkel Bjerch-Andresen
          </h3>
          <p>
            Mikkel is a golf coach, data analyst, and former assistant coach at
            Texas Tech and Baylor. He builds data tools for college golf and
            writes about coaching and analytics at{" "}
            <a
              href="https://mikkelgolf.substack.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary-hover underline underline-offset-2 transition-colors"
            >
              mikkelgolf on Substack
            </a>
            . He handles the technical implementation, from data ingestion to the
            web application you&apos;re using now.
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
