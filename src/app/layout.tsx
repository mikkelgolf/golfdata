import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Analytics } from "@vercel/analytics/react";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://collegegolfdata.com"),
  title: {
    template: "%s | College Golf Data",
    default: "College Golf Data - NCAA D1 Regional Predictions",
  },
  description:
    "Interactive S-curve regional predictions for NCAA Division I men's and women's college golf. Based on the official NCAA rankings with geographic optimization.",
  keywords: [
    "college golf",
    "NCAA golf",
    "D1 golf regionals",
    "S-curve predictions",
    "NCAA regional selections",
    "college golf rankings",
    "NCAA rankings",
    "college golf data",
  ],
  authors: [
    { name: "Mikkel Bjerch-Andresen" },
    { name: "David Tenneson" },
  ],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://collegegolfdata.com",
    siteName: "College Golf Data",
    title: "College Golf Data - NCAA D1 Regional Predictions",
    description:
      "Interactive S-curve predictions for NCAA D1 college golf regionals. See which 81 teams go to which of 6 regional sites.",
  },
  twitter: {
    card: "summary_large_image",
    site: "@CollegeGolfBot",
    creator: "@CollegeGolfBot",
    title: "College Golf Data - NCAA D1 Regional Predictions",
    description:
      "Interactive S-curve predictions for NCAA D1 college golf regionals. 81 teams, 6 regionals, live rankings.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark h-full ${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-sans antialiased min-h-full flex flex-col text-foreground">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:text-sm"
        >
          Skip to content
        </a>

        <SiteHeader />

        <main id="main-content" className="flex-1 relative z-[1]">{children}</main>

        <footer className="border-t border-border/60 py-4 relative z-[1]">
          <div className="mx-auto max-w-6xl px-4 text-center text-[11px] text-text-tertiary">
            College Golf Data &middot; Mikkel Bjerch-Andresen &amp; David
            Tenneson
          </div>
        </footer>

        <Analytics />
      </body>
    </html>
  );
}
