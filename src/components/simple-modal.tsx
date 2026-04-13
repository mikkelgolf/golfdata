"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SimpleModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  widthClass?: string;
}

/**
 * Minimal accessible modal: portals to body so it floats above the sticky
 * header, traps Escape, locks body scroll, click-outside closes. No deps
 * beyond lucide-react and the existing cn() helper.
 */
export function SimpleModal({
  open,
  onClose,
  title,
  subtitle,
  children,
  widthClass = "max-w-2xl",
}: SimpleModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
      style={{ animation: "fade-in 150ms ease-out" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "simple-modal-title" : undefined}
    >
      <div
        className={cn(
          "relative w-full max-h-[85vh] sm:max-h-[80vh] bg-background border border-border rounded-t-xl sm:rounded-lg shadow-overlay overflow-hidden flex flex-col",
          widthClass
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || subtitle) && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/40 shrink-0">
            <div className="min-w-0 flex-1">
              {title && (
                <h2 id="simple-modal-title" className="text-[13px] font-semibold text-foreground truncate">
                  {title}
                </h2>
              )}
              {subtitle && <p className="text-[11px] text-text-tertiary mt-0.5 truncate">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              className="ml-3 flex h-7 w-7 items-center justify-center rounded text-text-tertiary hover:bg-secondary hover:text-foreground transition-colors shrink-0"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>,
    document.body
  );
}
