"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import ContactForm from "@/components/contact-form";

type Tab = "explanations" | "team" | "contact";

export default function AboutTabs() {
  const [tab, setTab] = useState<Tab>("explanations");

  return (
    <>
      <div
        className="mt-8 border-b border-border flex gap-6"
        role="tablist"
        aria-label="About sections"
      >
        {(
          [
            { id: "explanations" as const, label: "Explanations" },
            { id: "team" as const, label: "Team" },
            { id: "contact" as const, label: "Contact" },
          ]
        ).map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            aria-controls={`about-panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cn(
              "pb-2 text-sm font-medium transition-colors -mb-px border-b-2",
              tab === t.id
                ? "text-foreground border-primary"
                : "text-muted-foreground border-transparent hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        id="about-panel-explanations"
        role="tabpanel"
        hidden={tab !== "explanations"}
        className="mt-6"
      >
        <ExplanationsPanel />
      </div>

      <div
        id="about-panel-team"
        role="tabpanel"
        hidden={tab !== "team"}
        className="mt-6"
      >
        <TeamPanel />
      </div>

      <div
        id="about-panel-contact"
        role="tabpanel"
        hidden={tab !== "contact"}
        className="mt-6 max-w-lg"
      >
        <ContactForm />
      </div>
    </>
  );
}

function Term({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-base font-medium text-foreground">{title}</h3>
      <div className="mt-1 space-y-2 text-[14px] leading-relaxed text-muted-foreground">
        {children}
      </div>
    </div>
  );
}

function ExplanationsPanel() {
  return (
    <div className="space-y-6">
      <Term title="The S-Curve">
        <p>
          The NCAA selects 81 teams for the Division I Men&apos;s Golf
          Championship (72 for women&apos;s), distributed across six regional
          sites. The committee uses a serpentine (S-curve) distribution to
          balance competitive strength: the top 6 seeds go to regionals 1
          through 6, seeds 7&ndash;12 are assigned in reverse order (6 through
          1), seeds 13&ndash;18 go forward again, and so on. This ensures no
          single regional is stacked with all the top-ranked teams.
        </p>
      </Term>

      <Term title="Committee Prediction vs Strict S-Curve">
        <p>
          Our tool offers two modes. The{" "}
          <strong className="text-foreground">Strict S-Curve</strong> is the
          pure mathematical serpentine &mdash; what a computer would output with
          no human judgment applied. The{" "}
          <strong className="text-foreground">Committee Prediction</strong>{" "}
          replicates how the NCAA selection committee actually operates, with
          three adjustments explained below.
        </p>
      </Term>

      <Term title="Top-seed proximity (the 1-seed rule)">
        <p>
          The committee assigns the top 6 seeds to whichever regional site is
          closest to them geographically, rather than following the strict
          serpentine order. This is why a team like Texas typically lands at
          the Bryan Regional, not wherever the math says.
        </p>
      </Term>

      <Term title="Host school guarantee">
        <p>
          If a host school is in the field, they play at their home regional.
          The team that would have been placed there swaps with the host
          within the same seed tier.
        </p>
      </Term>

      <Term title="Auto-qualifier preference">
        <p>
          Automatic qualifiers from smaller conferences (typically seeded
          around 12&ndash;13) usually get some geographic consideration. The
          committee avoids shipping them across the country when a closer
          regional is available.
        </p>
      </Term>

      <Term title=".500 rule">
        <p>
          To be eligible for an at-large bid, a team must finish the regular
          season at or above .500 against Division I opponents. Teams below
          .500 can still reach the field as automatic qualifiers (by winning
          their conference tournament), but we flag those as{" "}
          <span className="text-amber-500/90">sub-.500 AQs</span> because they
          bypass the eligibility rule. The{" "}
          <strong className="text-foreground">.500 Watch</strong> section of
          the Bubble Breakdown shows teams ranked well enough to be in the
          field but excluded by this rule.
        </p>
      </Term>

      <Term title="Magic Number">
        <p>
          The worst-ranked at-large team that still made the field. Every team
          ranked better than the Magic Number is effectively safe. Every team
          ranked close to it is on the bubble &mdash; a few tournament results
          away from being in or out.
        </p>
      </Term>

      <Term title="Advancement line">
        <p>
          In the regional view, you will see a red dashed line between the 5th
          and 6th team in each regional. The top 5 teams from each regional
          advance to the NCAA Championship. The matchups around that cutoff
          are the most interesting &mdash; those are the bubble teams where
          head-to-head records, course familiarity, and momentum matter most.
        </p>
      </Term>

      <Term title="H2H in field">
        <p>
          A team&apos;s head-to-head record against every other team in the
          same field across all 2025&ndash;26 shared events. For example, if
          team A played team B at two tournaments this year and beat them both
          times, that counts as 2-0 toward A&apos;s H2H-in-field record for
          any field that contains B. Shown as{" "}
          <span className="font-mono">W-L</span> or{" "}
          <span className="font-mono">W-L-T</span> when ties exist.
        </p>
      </Term>

      <Term title="Δ strokes (delta strokes)">
        <p>
          Average stroke differential per meeting versus every other team in
          the field. A{" "}
          <span className="text-primary">negative value is good</span> &mdash;
          it means the team has, on average, beaten the rest of the field by
          that many strokes per meeting. A{" "}
          <span className="text-destructive/80">positive value</span> means the
          team has been losing to the field by that many strokes on average.
        </p>
      </Term>

    </div>
  );
}

function TeamPanel() {
  return (
    <div className="space-y-6 text-[15px] leading-relaxed text-muted-foreground">
      <div className="space-y-2">
        <h3 className="text-base font-medium text-foreground">
          Mikkel Bjerch-Andresen
        </h3>
        <p className="flex flex-wrap gap-x-3 gap-y-1">
          <a
            href="https://mikkelgolf.substack.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:text-primary-hover underline underline-offset-2 transition-colors"
          >
            Substack
          </a>
          <a
            href="https://twitter.com/mikkelgolf"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:text-primary-hover underline underline-offset-2 transition-colors"
          >
            X
          </a>
          <a
            href="https://instagram.com/mikkelgolf"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:text-primary-hover underline underline-offset-2 transition-colors"
          >
            Instagram
          </a>
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="text-base font-medium text-foreground">
          David Tenneson
        </h3>
        <p className="flex flex-wrap gap-x-3 gap-y-1">
          <a
            href="https://5count4.substack.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:text-primary-hover underline underline-offset-2 transition-colors"
          >
            Substack
          </a>
          <a
            href="https://twitter.com/collegegolfbook"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:text-primary-hover underline underline-offset-2 transition-colors"
          >
            X
          </a>
          <a
            href="https://instagram.com/collegegolfbook"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:text-primary-hover underline underline-offset-2 transition-colors"
          >
            Instagram
          </a>
        </p>
      </div>
    </div>
  );
}
