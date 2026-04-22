"use client";

import { motion } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import {
  fadeSlideVariants,
  staggerContainerVariants,
  useReducedMotion,
} from "@/lib/animations";

/**
 * Blur-up shape intro — matches us-map.tsx:64-70, 182-188.
 * Opacity 0 + blur(8px) -> 1 + blur(0) over 600ms ease-out after a 60ms mount
 * timeout. Respects useReducedMotion() (renders static children).
 */
export function AnimatedSection({
  children,
  as: Tag = "section",
  className,
}: {
  children: ReactNode;
  as?: keyof JSX.IntrinsicElements;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (reduced) {
      setLoaded(true);
      return;
    }
    const t = setTimeout(() => setLoaded(true), 60);
    return () => clearTimeout(t);
  }, [reduced]);

  const Comp = Tag as keyof JSX.IntrinsicElements;
  const style = reduced
    ? undefined
    : {
        opacity: loaded ? 1 : 0,
        filter: loaded ? "blur(0px)" : "blur(8px)",
        transition: "opacity 600ms ease-out, filter 600ms ease-out",
      };

  // TS can't narrow a dynamic intrinsic tag via a prop, but we only pass safe
  // block elements ("section" by default). Cast to a generic element type.
  const Dyn = Comp as unknown as React.ElementType;
  return (
    <Dyn className={className} style={style}>
      {children}
    </Dyn>
  );
}

/**
 * Stagger container for StatCard sets. Wraps each direct child in an
 * opacity+y fade. idx*0.06 stagger (fast per spec) with 0.1 delay.
 */
export function StaggerGrid({
  children,
  className,
  staggerDelay = 0.06,
  initialDelay = 0.08,
}: {
  children: ReactNode[];
  className?: string;
  staggerDelay?: number;
  initialDelay?: number;
}) {
  const reduced = useReducedMotion();
  if (reduced) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      className={className}
      variants={staggerContainerVariants(staggerDelay, initialDelay)}
      initial="hidden"
      animate="visible"
    >
      {children.map((child, idx) => (
        <motion.div key={idx} variants={fadeSlideVariants}>
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}
