import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "muted",
  children,
}: {
  className?: string;
  tone?: "muted" | "ok" | "caution" | "warn" | "accent";
  children: ReactNode;
}) {
  const tones = {
    muted: "bg-raised text-muted border-border",
    ok: "bg-ok/15 text-ok border-ok/30",
    caution: "bg-caution/15 text-caution border-caution/30",
    warn: "bg-warn/15 text-warn border-warn/30",
    accent: "bg-accent/15 text-accent border-accent/30",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-2 py-0.5 font-display text-[11px] font-semibold tracking-[0.12em] uppercase",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
