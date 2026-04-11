import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Tournaments - College Golf Data",
  description:
    "Notable NCAA D1 college golf tournaments and 2025-26 conference championship calendar.",
};

const tournaments = [
  {
    name: "Carmel Cup",
    dates: "Aug 29-31, 2025",
    gender: "Both",
    location: "Pebble Beach, CA",
    note: "Pebble Beach Golf Links. Possibly the last edition at this venue.",
  },
  {
    name: "Jackson T. Stephens Cup",
    dates: "Sep 15-18, 2025",
    gender: "Both",
    location: "Little Rock, AR",
    note: "One of the strongest fall fields in college golf.",
  },
  {
    name: "Blessings Collegiate",
    dates: "Sep 29-Oct 1, 2025",
    gender: "Both",
    location: "Fayetteville, AR",
    note: "Elite field at Blessings Golf Club.",
  },
  {
    name: "Golf Club of Georgia Collegiate",
    dates: "Oct 24-26, 2025",
    gender: "Men",
    location: "Alpharetta, GA",
    note: "Strong fall event for men's programs.",
  },
  {
    name: "John A. Burns Intercollegiate",
    dates: "Feb 12-14, 2026",
    gender: "Men",
    location: "Waikoloa, HI",
    note: "Premier spring season opener.",
  },
  {
    name: "Southern Highlands Collegiate",
    dates: "Mar 1-3, 2026",
    gender: "Men",
    location: "Las Vegas, NV",
    note: "Premier spring event. SGT+ metric tested on this tournament's data.",
  },
  {
    name: "Charles Schwab Women's Collegiate",
    dates: "Mar 23-24, 2026",
    gender: "Women",
    location: "Houston, TX",
    note: "Among the highest strength-of-field outside the NCAA Championship.",
  },
  {
    name: "PING ASU Invitational",
    dates: "Mar 23-25, 2026",
    gender: "Women",
    location: "Tempe, AZ",
    note: "Storied women's event at Karsten Golf Course.",
  },
  {
    name: "The Goodwin",
    dates: "Mar 26-28, 2026",
    gender: "Men",
    location: "Stanford, CA",
    note: "Stanford-hosted at The Stanford Golf Course.",
  },
  {
    name: "Augusta Haskins Award Invitational",
    dates: "Apr 4-5, 2026",
    gender: "Men",
    location: "Augusta, GA",
    note: "Associated with the Ben Hogan and Haskins Awards.",
  },
];

const confChamps = [
  { conf: "ACC Women's", dates: "Apr 16-19", gender: "W" as const },
  { conf: "SEC Women's", dates: "Apr 16-21", gender: "W" as const },
  { conf: "ACC Men's", dates: "Apr 23-27", gender: "M" as const },
  { conf: "Big 12 Women's", dates: "Apr 23-25", gender: "W" as const },
  { conf: "Big 10 Women's", dates: "Apr 24-26", gender: "W" as const },
  { conf: "SEC Men's", dates: "Apr 22-26", gender: "M" as const },
  { conf: "Big 12 Men's", dates: "Apr 27-29", gender: "M" as const },
  { conf: "Big 10 Men's", dates: "May 1-3", gender: "M" as const },
];

export default function TournamentsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="font-serif italic text-3xl text-foreground">Tournaments</h1>
      <p className="mt-3 text-[15px] text-muted-foreground max-w-lg">
        Notable NCAA D1 events for the 2025-26 season. Full tournament pages
        with historical data, record books, and analysis are coming.
      </p>

      <div className="mt-8 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-[13px]" aria-label="Notable NCAA D1 Tournaments">
          <thead>
            <tr className="border-b border-border bg-card">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Tournament</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground hidden sm:table-cell">Location</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Dates</th>
              <th className="px-3 py-2 text-center font-medium text-muted-foreground hidden md:table-cell">Gender</th>
            </tr>
          </thead>
          <tbody>
            {tournaments.map((t) => (
              <tr
                key={t.name}
                className="border-b border-border/40 hover:bg-secondary/50 transition-colors"
              >
                <td className="px-3 py-2.5">
                  <div>
                    <span className="font-medium text-foreground">{t.name}</span>
                    {t.note && (
                      <p className="text-[12px] text-muted-foreground mt-0.5">
                        {t.note}
                      </p>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                  {t.location}
                </td>
                <td className="px-3 py-2.5 font-mono text-muted-foreground whitespace-nowrap">
                  {t.dates}
                </td>
                <td className="px-3 py-2.5 text-center hidden md:table-cell">
                  <span
                    className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${
                      t.gender === "Both"
                        ? "bg-primary/15 text-primary"
                        : t.gender === "Men"
                          ? "bg-blue-500/15 text-blue-400"
                          : "bg-pink-500/15 text-pink-400"
                    }`}
                  >
                    {t.gender}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="mt-10 space-y-4 text-[15px] leading-relaxed text-muted-foreground">
        <h2 className="text-xl font-semibold text-foreground">
          Conference Championships
        </h2>
        <p>
          Conference championship winners receive automatic qualifier (AQ)
          berths to regionals. The S-curve prediction model accounts for AQ
          status when distributing teams to regional sites.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          {confChamps.map((c) => (
            <div key={c.conf} className="card-gradient px-4 py-3 flex items-center justify-between">
              <span className="text-[13px] text-foreground font-medium">{c.conf}</span>
              <span className="text-[12px] font-mono text-muted-foreground">{c.dates}</span>
            </div>
          ))}
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
