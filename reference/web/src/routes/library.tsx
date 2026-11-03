import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { PartCard, PartDetail } from "@/components/library/PartCard";
import { Badge } from "@/components/ui/badge";
import { AMM_CHAPTERS, AMM_META } from "@/data/amm";
import { PARTS } from "@/data/components";
import { SYSTEMS } from "@/data/systems";
import type { SystemId } from "@/lib/sim/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/library")({ component: LibraryPage });

function LibraryPage() {
  const [q, setQ] = useState("");
  const [sys, setSys] = useState<SystemId | "all">("all");
  const [selected, setSelected] = useState(PARTS[0].id);
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return PARTS.filter((p) => {
      if (sys !== "all" && p.system !== sys) return false;
      if (!query) return true;
      return `${p.name} ${p.function} ${p.ata} ${p.group} ${p.controls}`.toLowerCase().includes(query);
    });
  }, [q, sys]);
  const part = PARTS.find((p) => p.id === selected) ?? filtered[0];

  return (
    <AppShell>
      <div className="mb-4">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-subtle">
          {AMM_META.book} · {AMM_META.customer} · Rev {AMM_META.revision}
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Component library</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Function, flow, relationships, specs, and cockpit interface — aligned to the task-card technical references
          and the AMM/IPC chapter list in Drive.
        </p>
      </div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search valves, actuators, lights…"
          className="h-11 flex-1 rounded-md border border-border bg-inset px-3 text-sm text-fg placeholder:text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        />
        <div className="flex gap-1 overflow-x-auto">
          <FilterChip active={sys === "all"} onClick={() => setSys("all")}>
            All
          </FilterChip>
          {SYSTEMS.map((item) => (
            <FilterChip key={item.id} active={sys === item.id} onClick={() => setSys(item.id)}>
              {item.short}
            </FilterChip>
          ))}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="grid max-h-[70vh] gap-2 overflow-auto pr-1">
          {filtered.map((p) => (
            <PartCard key={p.id} part={p} selected={p.id === selected} onSelect={setSelected} />
          ))}
          {filtered.length === 0 && <p className="p-4 text-sm text-muted">No components match.</p>}
        </div>
        {part ? <PartDetail part={part} /> : null}
      </div>
      <section className="mt-8">
        <h2 className="font-display text-xl font-semibold">AMM chapter index</h2>
        <p className="mt-1 text-sm text-muted">
          From AMM/IPC · 737-12 USA AMM D6-37106. Highlighted chapters are modeled in this trainer.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {AMM_CHAPTERS.map((ch) => (
            <div
              key={ch.ata}
              className={cn(
                "flex items-center justify-between rounded-md border px-3 py-2",
                ch.trainer ? "border-accent/30 bg-raised" : "border-border bg-panel",
              )}
            >
              <span className="text-sm text-fg">
                <span className="mr-2 font-mono text-subtle">{ch.ata}</span>
                {ch.title}
              </span>
              {ch.trainer ? <Badge tone="ok">In lab</Badge> : null}
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-11 shrink-0 rounded-md border px-3 font-display text-xs font-semibold uppercase tracking-[0.12em]",
        active ? "border-fg bg-fg text-accent-fg" : "border-border bg-panel text-muted",
      )}
    >
      {children}
    </button>
  );
}
