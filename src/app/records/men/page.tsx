import type { Metadata } from "next";
import Link from "next/link";
import RecordBookView from "@/components/record-book";
import { recordsMen } from "@/data/records-men";
import { buildProgramRecordsGroup } from "@/lib/program-records";

export const metadata: Metadata = {
  title: "Men's Record Book - NCAA Division I Golf",
  description:
    "Unofficial NCAA Division I men's golf record book. Compiled by Lindy Brown and staff at Duke. Current-season entries refreshed from Clippd granular scoring data.",
};

export default function MensRecordsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:py-10">
      <div className="flex items-center gap-2 text-[12px]">
        <span className="inline-flex items-center rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 font-medium text-foreground">
          Men&apos;s
        </span>
        <Link
          href="/records/women"
          className="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-muted-foreground hover:text-foreground hover:border-border-medium transition-colors"
        >
          Women&apos;s
        </Link>
      </div>
      <h1 className="mt-4 font-serif text-3xl sm:text-4xl tracking-tight text-foreground">
        NCAA Division I Men&apos;s Golf Record Book
      </h1>
      <p className="mt-2 text-[12px] text-text-tertiary">{recordsMen.sourceNote}</p>
      <RecordBookView book={recordsMen} extraGroups={[buildProgramRecordsGroup("men")]} />
    </div>
  );
}
