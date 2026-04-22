import type { Metadata } from "next";
import ChampionshipsHistoryTable from "@/components/championships-history-table";
import { championshipsHistory } from "@/data/championships-history";

export const metadata: Metadata = {
  title: "NCAA Championships — Men's & Women's History",
  description:
    "Every NCAA Division I men's and women's National Championship finish, by team and year. Match-play era (2009-) and stroke-play era (1939-2008 men's, 1982-2008 women's).",
};

export default function ChampionshipsHistoryPage() {
  return (
    <div className="mx-auto max-w-6xl px-3 sm:px-4 pt-2 sm:pt-4 pb-8">
      <div className="mb-4 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
        <div>
          <h1 className="text-[15px] sm:text-lg font-semibold tracking-tight text-foreground">
            NCAA Championships — Results History
          </h1>
          <p className="hidden sm:block text-[12px] text-text-tertiary">
            Teams &times; years &middot; Men&apos;s from 1939, Women&apos;s from 1982 &middot; Match-play era: 2009-
          </p>
        </div>
      </div>
      <ChampionshipsHistoryTable entries={championshipsHistory} />
    </div>
  );
}
