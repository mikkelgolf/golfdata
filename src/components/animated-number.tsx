"use client";

import { useEffect } from "react";
import { animate, useMotionValue, useTransform, motion } from "framer-motion";

/**
 * Tweens a number with Apple's "soft-easeOut" curve. tabular-nums prevents
 * digit jitter mid-tween. Total cost: 0 KB (framer-motion already shipping).
 */
export function AnimatedNumber({
  value,
  format = (v: number) => v.toLocaleString(),
  duration = 0.6,
  className = "",
}: {
  value: number;
  format?: (v: number) => string;
  duration?: number;
  className?: string;
}) {
  const mv = useMotionValue(value);
  const display = useTransform(mv, (v) => format(Math.round(v)));

  useEffect(() => {
    const controls = animate(mv, value, {
      duration,
      ease: [0.32, 0.72, 0, 1],
    });
    return controls.stop;
  }, [value, duration, mv]);

  return <motion.span className={`tabular-nums display-num ${className}`}>{display}</motion.span>;
}
