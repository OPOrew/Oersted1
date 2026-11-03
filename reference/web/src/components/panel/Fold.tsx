import type { ReactNode } from "react";

/** Collapsible group for the Training Console: keeps rarely used controls one tap away without making the page endless. */
export function Fold({ title, hint, children, defaultOpen = false }: { title: string; hint?: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group mt-2 rounded border border-border bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-2 font-display text-[9px] uppercase tracking-[.14em] text-subtle hover:text-fg [&::-webkit-details-marker]:hidden">
        <span>{title}{hint ? <span className="ml-2 normal-case tracking-normal text-muted">{hint}</span> : null}</span>
        <span aria-hidden className="text-[11px] transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="px-2 pb-2">{children}</div>
    </details>
  );
}
