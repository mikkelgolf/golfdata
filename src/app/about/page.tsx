import type { Metadata } from "next";
import Link from "next/link";
import AboutTabs from "./AboutTabs";

export const metadata: Metadata = {
  title: "About - College Golf Data",
  description:
    "How the NCAA D1 regional S-curve prediction model works, definitions for every metric in the app, and the team behind College Golf Data.",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <AboutTabs />

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
