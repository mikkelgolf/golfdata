import type { Metadata } from "next";
import RegionalsResultsTable from "@/components/regionals-results-table";
import { regionalsHistory } from "@/data/regionals-history";

export const metadata: Metadata = {
  title: "NCAA Regionals — Results History",
  description:
    "Every NCAA Division I men's and women's regional finish, by team and year. Top 5 per regional advance to the NCAA Championship.",
};

export default function RegionalsPage() {
  return (
    <div className="mx-auto max-w-6xl px-3 sm:px-4 pt-2 sm:pt-4 pb-8">
      <div className="mb-4 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
        <div>
          <h1 className="text-[15px] sm:text-lg font-semibold tracking-tight text-foreground">
            NCAA Regionals — Results History
          </h1>
          <p className="hidden sm:block text-[12px] text-text-tertiary">
            Teams &times; years &middot; Men&apos;s from 1989, Women&apos;s from 1993
          </p>
        </div>
      </div>
      <RegionalsResultsTable entries={regionalsHistory} />
    </div>
  );
}
