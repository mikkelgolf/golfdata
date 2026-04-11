import type { Metadata } from "next";
import Link from "next/link";
import Timeline from "@/components/timeline";
import { snapshotHistory, snapshotDiffs } from "@/data/snapshots";

export const metadata: Metadata = {
  title: "Timeline - College Golf Data",
  description:
    "Track how NCAA D1 regional S-curve predictions change week by week as new Broadie/Clippd rankings drop.",
};

export default function TimelinePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-serif italic text-3xl text-foreground">Timeline</h1>
      <p className="mt-3 text-[15px] text-muted-foreground">
        How the S-curve predictions have changed as new rankings drop. Each
        weekly update shows which teams moved, which regionals shifted, and
        which tournaments drove the changes.
      </p>

      <div className="mt-8">
        <Timeline snapshots={snapshotHistory} diffs={snapshotDiffs} />
      </div>

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
