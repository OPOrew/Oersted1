import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { AIRCRAFT_DIMS, AMM_META } from "@/data/amm";
import { PARTS } from "@/data/components";
import { SYSTEMS } from "@/data/systems";
import { AircraftPlan } from "@/components/aircraft/AircraftPlan";
import { AppShell } from "@/components/layout/AppShell";
import { GroundModule, Overhead } from "@/components/panel/Overhead";
import { PartDetail } from "@/components/library/PartCard";
import { Badge } from "@/components/ui/badge";
import { useSim, useSimPick, useDerivedPick } from "@/lib/sim/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({ component: Hangar });

function Hangar() {
  const [selected, setSelected] = useState<string | null>(null);
  const part = PARTS.find((p) => p.id === selected);
  const d = useDerivedPick("apuAvailable", "dualBleed", "eng1Running", "eng2Running");
  const s = useSimPick("apuRpm", "gearPos");

  return (
    <AppShell>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)]">
        <section className="rounded-xl border border-border bg-surface p-3 shadow-panel sm:p-4">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-display text-[11px] uppercase tracking-[0.2em] text-subtle">
                Airframe layout · 737-200
              </p>
              <h1 className="font-display text-3xl font-semibold tracking-tight text-fg">
                Hangar schematic
              </h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone={d.apuAvailable ? "ok" : "muted"}>APU {Math.round(s.apuRpm)}%</Badge>
              <Badge tone={d.eng1Running ? "ok" : "muted"}>ENG 1</Badge>
              <Badge tone={d.eng2Running ? "ok" : "muted"}>ENG 2</Badge>
              <Badge tone={d.dualBleed ? "caution" : "muted"}>DUAL BLEED</Badge>
              <Badge tone={s.gearPos > 0.9 ? "ok" : "accent"}>GEAR {s.gearPos > 0.9 ? "DN" : s.gearPos < 0.1 ? "UP" : "TR"}</Badge>
            </div>
          </div>
          <AircraftPlan selectedId={selected} onSelect={setSelected} />
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted">
            <Legend color="bg-pneumatic" label="Bleed manifold" />
            <Legend color="bg-hyd-a" label="Hydraulic A" />
            <Legend color="bg-hyd-b" label="Hydraulic B" />
            <Legend color="bg-fuel" label="APU" />
            <Legend color="bg-elec" label="Packs" />
          </div>
        </section>

        <aside className="flex flex-col gap-3">
          <div className="rounded-xl border border-border bg-panel p-4">
            <p className="font-display text-[11px] uppercase tracking-[0.18em] text-subtle">
              {AMM_META.source}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Click a node on the airframe, then throw the matching overhead switch. Lights, duct pressure, and
              hydraulic tapes respond with AMM interlocks — fuel valve before the inlet door, 95% before bleed, System A
              for the gear.
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-2">
              {AIRCRAFT_DIMS.map((row) => (
                <div key={row.label} className="rounded-md border border-border bg-inset px-3 py-2">
                  <dt className="font-display text-[10px] uppercase tracking-[0.16em] text-subtle">{row.label}</dt>
                  <dd className="font-mono text-sm tabular-nums text-fg">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          {part ? <PartDetail part={part} /> : <InterlockList />}
        </aside>
      </div>

      <div className="mt-4 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {SYSTEMS.map((sys) => (
          <Link
            key={sys.id}
            to="/systems/$id"
            params={{ id: sys.id }}
            className="group rounded-xl border border-border bg-panel p-4 transition-colors hover:border-line"
          >
            <p className="font-display text-[11px] uppercase tracking-[0.16em] text-subtle">ATA {sys.ata}</p>
            <h2 className="mt-1 font-display text-xl font-semibold text-fg">{sys.title}</h2>
            <p className="mt-2 text-sm text-muted">{sys.blurb}</p>
            <p className="mt-3 inline-flex items-center gap-1 font-display text-xs font-semibold uppercase tracking-[0.14em] text-accent">
              Open layout <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </p>
          </Link>
        ))}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
        <Overhead focus="all" />
        <div className="flex flex-col gap-3">
          <GroundModule />
          <EventLog />
        </div>
      </div>
    </AppShell>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2 rounded-full", color)} />
      {label}
    </span>
  );
}

function InterlockList() {
  const d = useDerivedPick("interlocks");
  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <h2 className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-subtle">
        Live interlocks
      </h2>
      {d.interlocks.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          No inhibit messages. Start the APU from cold and dark, or inject a fault on a system page.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {d.interlocks.map((il) => (
            <li
              key={il.id}
              className={cn(
                "rounded-md border px-3 py-2 text-sm",
                il.tone === "warn"
                  ? "border-warn/30 bg-warn/10 text-fg"
                  : il.tone === "caution"
                    ? "border-caution/30 bg-caution/10 text-fg"
                    : "border-border bg-inset text-muted",
              )}
            >
              {il.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EventLog() {
  const log = useSim((s) => s.log);
  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <h2 className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-subtle">Event log</h2>
      <ul className="mt-2 max-h-48 space-y-1.5 overflow-auto text-sm">
        {log.map((e, i) => (
          <li key={`${e.t}-${i}`} className="text-muted">
            <span
              className={cn(
                "mr-2 font-display text-[10px] uppercase tracking-wider",
                e.tone === "ok"
                  ? "text-ok"
                  : e.tone === "caution"
                    ? "text-caution"
                    : e.tone === "warn"
                      ? "text-warn"
                      : "text-subtle",
              )}
            >
              {e.tone}
            </span>
            {e.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
