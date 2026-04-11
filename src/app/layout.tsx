import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

const inter = localFont({
  src: [
    {
      path: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
      style: "normal",
    },
  ],
  variable: "--font-sans",
  display: "swap",
});

const instrumentSerif = localFont({
  src: [
    {
      path: "../../node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2",
      style: "italic",
    },
  ],
  variable: "--font-serif",
  display: "swap",
});

const jetbrainsMono = localFont({
  src: [
    {
      path: "../../node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
      style: "normal",
    },
  ],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://collegegolfdata.com"),
  title: {
    template: "%s | College Golf Data",
    default: "College Golf Data — NCAA D1 Regional Predictions",
  },
  description:
    "Interactive S-curve regional predictions for NCAA Division I men's and women's college golf. Based on Broadie/Clippd rankings with geographic optimization.",
  keywords: [
    "college golf",
    "NCAA golf",
    "D1 golf regionals",
    "S-curve predictions",
    "NCAA regional selections",
    "college golf rankings",
    "Broadie rankings",
    "college golf data",
  ],
  authors: [
    { name: "David Tenneson" },
    { name: "Mikkel Bjerch-Andresen" },
  ],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://collegegolfdata.com",
    siteName: "College Golf Data",
    title: "College Golf Data — NCAA D1 Regional Predictions",
    description:
      "Interactive S-curve predictions for NCAA D1 college golf regionals. See which 81 teams go to which of 6 regional sites.",
  },
  twitter: {
    card: "summary_large_image",
    site: "@CollegeGolfBot",
    creator: "@CollegeGolfBot",
    title: "College Golf Data — NCAA D1 Regional Predictions",
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
    <html lang="en" className="dark h-full">
      <body
        className={`${inter.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable} font-sans antialiased min-h-full flex flex-col bg-background text-foreground`}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:text-sm"
        >
          Skip to content
        </a>

        <header className="sticky top-0 z-50 h-[var(--nav-height)] border-b border-border bg-background">
          <nav className="mx-auto flex h-full max-w-6xl items-center justify-between px-4">
            <Link
              href="/"
              className="text-[13px] font-semibold text-foreground hover:text-foreground/80 transition-colors tracking-tight"
            >
              College Golf Data
            </Link>
            <div className="flex items-center gap-3">
              <Link
                href="/timeline"
                className="text-[12px] text-muted-foreground hover:text-foreground transition-colors hidden sm:inline"
              >
                Timeline
              </Link>
              <Link
                href="/tournaments"
                className="text-[12px] text-muted-foreground hover:text-foreground transition-colors hidden sm:inline"
              >
                Tournaments
              </Link>
              <Link
                href="/tools"
                className="text-[12px] text-muted-foreground hover:text-foreground transition-colors hidden sm:inline"
              >
                Tools
              </Link>
              <Link
                href="/research"
                className="text-[12px] text-muted-foreground hover:text-foreground transition-colors hidden sm:inline"
              >
                Research
              </Link>
              <Link
                href="/about"
                className="text-[12px] text-muted-foreground hover:text-foreground transition-colors"
              >
                About
              </Link>
            </div>
          </nav>
        </header>

        <main id="main-content" className="flex-1">{children}</main>

        <footer className="border-t border-border py-4">
          <div className="mx-auto max-w-6xl px-4 text-center text-[11px] text-text-tertiary">
            College Golf Data &middot; David Tenneson &amp; Mikkel
            Bjerch-Andresen
          </div>
        </footer>

        <Analytics />
      </body>
    </html>
  );
}
