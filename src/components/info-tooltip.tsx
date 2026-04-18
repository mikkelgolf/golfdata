import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

export function InfoTooltip({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative inline-flex items-center align-middle group ml-1" tabIndex={0}>
      <Info className="h-3 w-3 text-text-tertiary cursor-help group-hover:text-foreground group-focus:text-foreground transition-colors" />
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-[60]",
          "w-[260px] px-2.5 py-2 rounded-md border border-border bg-background shadow-overlay",
          "text-[11px] text-foreground leading-snug font-normal normal-case tracking-normal text-left",
          "opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus:opacity-100 group-focus:visible",
          "transition-opacity duration-150"
        )}
      >
        {children}
      </span>
    </span>
  );
}
