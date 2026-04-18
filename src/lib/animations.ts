"use client";

import { useEffect, useState } from "react";
import type { Variants } from "framer-motion";

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

export const fadeSlideVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.32, 0.72, 0, 1] } },
};

export function staggerContainerVariants(stagger = 0.025, delay = 0): Variants {
  return {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: stagger,
        delayChildren: delay,
      },
    },
  };
}

export const expandHeightVariants: Variants = {
  collapsed: { opacity: 0, height: 0, transition: { duration: 0.2 } },
  expanded: {
    opacity: 1,
    height: "auto",
    transition: { duration: 0.25, ease: [0.32, 0.72, 0, 1] },
  },
};
