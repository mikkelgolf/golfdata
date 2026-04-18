"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import MobileNav from "@/components/mobile-nav";

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      data-scrolled={scrolled}
      className="sticky top-0 z-50 h-[var(--nav-height)] transition-all duration-200
        data-[scrolled=true]:bg-background/65
        data-[scrolled=true]:backdrop-blur-xl
        data-[scrolled=true]:backdrop-saturate-150
        data-[scrolled=true]:border-b data-[scrolled=true]:border-white/[0.06]
        data-[scrolled=false]:border-b data-[scrolled=false]:border-transparent"
    >
      <nav className="mx-auto flex h-full max-w-6xl items-center justify-between px-4">
        <Link
          href="/"
          className="text-[13px] font-semibold text-foreground hover:text-foreground/80 transition-colors tracking-tight"
        >
          College Golf Data
        </Link>
        <div className="hidden sm:flex items-center gap-4">
          <Link href="/" className="text-[12px] text-muted-foreground hover:text-foreground transition-colors">Regional Predictions</Link>
          <Link href="/conference-championships" className="text-[12px] text-muted-foreground hover:text-foreground transition-colors">Conf Champs</Link>
          <Link href="/regionals" className="text-[12px] text-muted-foreground hover:text-foreground transition-colors">Regionals History</Link>
          <Link href="/records/men" className="text-[12px] text-muted-foreground hover:text-foreground transition-colors">Record Book</Link>
          <Link href="/about" className="text-[12px] text-muted-foreground hover:text-foreground transition-colors">About</Link>
        </div>
        <MobileNav />
      </nav>
    </header>
  );
}
