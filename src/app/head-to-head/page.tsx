import type { Metadata } from "next";
import { Suspense } from "react";
import HeadToHeadBrowser from "@/components/head-to-head-browser";

export const metadata: Metadata = {
  title: "Head-to-head — college golf team records",
  description:
    "Compare any two NCAA Division I men's or women's golf teams' 2025-26 head-to-head record across strokeplay and matchplay events.",
};

export default function HeadToHeadPage() {
  return (
    <div className="mx-auto max-w-5xl px-3 sm:px-4 pt-2 sm:pt-4 pb-8">
      <div className="mb-4">
        <h1 className="text-[15px] sm:text-lg font-semibold tracking-tight text-foreground">
          Team vs team head-to-head
        </h1>
        <p className="hidden sm:block text-[12px] text-text-tertiary">
          2025-26 season · strokeplay + matchplay combined
        </p>
      </div>
      <Suspense fallback={<div className="text-[12px] text-text-tertiary">Loading…</div>}>
        <HeadToHeadBrowser />
      </Suspense>
    </div>
  );
}
