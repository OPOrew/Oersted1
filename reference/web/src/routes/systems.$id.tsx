import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { AircraftPlan } from "@/components/aircraft/AircraftPlan";
import { AppShell } from "@/components/layout/AppShell";
import { PartCard, PartDetail } from "@/components/library/PartCard";
import { GroundModule, Overhead } from "@/components/panel/Overhead";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { partsFor } from "@/data/components";
import { SYSTEMS, systemById } from "@/data/systems";
import type { SystemId } from "@/lib/sim/types";
import { useSimPick } from "@/lib/sim/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/systems/$id")({ component: SystemPage });

const FOCUS: Record<SystemId, "apu" | "bleed" | "hyd" | "elec" | "start" | "flt" | "all"> = {
  apu: "apu",
  powerplant: "start",
  hydraulics: "hyd",
  aircond: "bleed",
  pneumatic: "bleed",
  antiice: "bleed",
  cabin: "bleed",
  flightcontrols: "flt",
  landinggear: "all",
  fuel: "all",
  fire: "all",
  electrical: "elec",
  navigation: "all",
  lights: "all",
  oxygen: "all",
};

function SystemPage() {
  const { id } = Route.useParams();
  const sys = systemById(id);
  if (!sys) throw notFound();
  const parts = partsFor(sys.id);
  const [selected, setSelected] = useState(parts[0]?.id ?? null);
  const part = parts.find((p) => p.id === selected) ?? parts[0];
  const s = useSimPick("elecHyd1", "engHyd1");

  return (
    <AppShell>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-display text-[11px] uppercase tracking-[0.2em] text-subtle">
            ATA {sys.ata} · {sys.panel}
          </p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">{sys.title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">{sys.blurb}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="accent">{sys.power}</Badge>
          <Faults />
        </div>
      </div>

      <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
        {SYSTEMS.map((item) => (
          <Link
            key={item.id}
            to="/systems/$id"
            params={{ id: item.id }}
            className={cn(
              "shrink-0 rounded-md border px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em]",
              item.id === sys.id ? "border-fg bg-fg text-accent-fg" : "border-border bg-panel text-muted",
            )}
          >
            {item.short}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
        <section className="rounded-xl border border-border bg-surface p-3 sm:p-4">
          <AircraftPlan activeSystem={sys.id} selectedId={selected} onSelect={setSelected} />
        </section>
        {part ? <PartDetail part={part} /> : null}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="flex flex-col gap-3">
          <Overhead focus={FOCUS[sys.id]} />
          {sys.id === "landinggear" || sys.id === "flightcontrols" ? <GroundModule /> : null}
        </div>
        <div className="grid gap-2">
          {parts.map((p) => (
            <PartCard key={p.id} part={p} selected={p.id === selected} onSelect={setSelected} />
          ))}
        </div>
      </div>
      <p className="mt-4 text-xs text-subtle">Session pumps: ENG {s.engHyd1 ? "1" : "–"} / {s.elecHyd1 ? "E1" : "–"}</p>
    </AppShell>
  );
}

function Faults() {
  const s = useSimPick("faults", "toggleFault");
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant={s.faults.apuDoorJam ? "danger" : "secondary"}
        onClick={() => s.toggleFault("apuDoorJam")}
      >
        Door jam
      </Button>
      <Button
        size="sm"
        variant={s.faults.hydALeak ? "danger" : "secondary"}
        onClick={() => s.toggleFault("hydALeak")}
      >
        Hyd A leak
      </Button>
      <Button
        size="sm"
        variant={s.faults.packOverheat ? "danger" : "secondary"}
        onClick={() => s.toggleFault("packOverheat")}
      >
        Pack overheat (L)
      </Button>
      <Button
        size="sm"
        variant={s.faults.packOverheatR ? "danger" : "secondary"}
        onClick={() => s.toggleFault("packOverheatR")}
      >
        Pack overheat (R)
      </Button>
      <Button
        size="sm"
        variant={s.faults.bleedOverheat1 ? "danger" : "secondary"}
        onClick={() => s.toggleFault("bleedOverheat1")}
      >
        Bleed overheat (1)
      </Button>
      <Button
        size="sm"
        variant={s.faults.bleedOverheat2 ? "danger" : "secondary"}
        onClick={() => s.toggleFault("bleedOverheat2")}
      >
        Bleed overheat (2)
      </Button>
      <Button
        size="sm"
        variant={s.faults.apuFireDetected ? "danger" : "secondary"}
        onClick={() => s.toggleFault("apuFireDetected")}
      >
        APU fire detected
      </Button>
    </div>
  );
}
