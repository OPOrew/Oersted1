import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Overhead, GroundModule } from "@/components/panel/Overhead";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PROCEDURES } from "@/data/procedures";
import { useDerived, useSim } from "@/lib/sim/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/procedures")({ component: ProceduresPage });

function ProceduresPage() {
  const [category, setCategory] = useState<"normal" | "emergency">("normal");
  const visibleProcedures = PROCEDURES.filter((p) => p.category === category);
  const [id, setId] = useState(PROCEDURES[0].id);
  const proc = PROCEDURES.find((p) => p.id === id && p.category === category) ?? visibleProcedures[0];
  const s = useSim();
  const d = useDerived();
  const doneFlags = useMemo(() => proc.steps.map((st) => st.done(s)), [proc, s, d]);
  const current = doneFlags.findIndex((v) => !v);
  const complete = current === -1;

  return (
    <AppShell>
      <div className="mb-4">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-subtle">Guided sequences</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Procedures</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Each step is live against the same airplane. The next action is highlighted. Emergency / abnormal sequences
          are training simulations based on the supplied 737-200 manuals; use the approved aircraft checklist/QRH for real-world operation.
        </p>
      </div>
      <div className="mb-3 flex gap-2">
        <button type="button" onClick={() => { setCategory("normal"); setId(PROCEDURES.find((p) => p.category === "normal")!.id); }} className={cn("rounded-md border px-4 py-2 font-display text-xs font-semibold uppercase tracking-[0.14em]", category === "normal" ? "border-accent bg-accent/10 text-fg" : "border-border bg-panel text-muted")}>Normal Procedures</button>
        <button type="button" onClick={() => { setCategory("emergency"); setId(PROCEDURES.find((p) => p.category === "emergency")!.id); }} className={cn("rounded-md border px-4 py-2 font-display text-xs font-semibold uppercase tracking-[0.14em]", category === "emergency" ? "border-warn bg-warn/10 text-fg" : "border-border bg-panel text-muted")}>Emergency / Abnormal</button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {visibleProcedures.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setId(p.id)}
            className={cn(
              "shrink-0 rounded-md border px-3 py-2 text-left",
              p.id === id ? "border-fg bg-fg text-accent-fg" : "border-border bg-panel text-muted",
            )}
          >
            <span className="block font-display text-[10px] uppercase tracking-[0.16em] opacity-70">ATA {p.ata}</span>
            <span className="font-display text-sm font-semibold">{p.title}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <ol className="space-y-2">
          {proc.steps.map((st, i) => {
            const done = doneFlags[i];
            const active = i === current;
            return (
              <li
                key={st.id}
                className={cn(
                  "rounded-xl border p-4",
                  done
                    ? "border-ok/30 bg-ok/10"
                    : active
                      ? "border-accent bg-raised"
                      : "border-border bg-panel",
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-full border font-mono text-xs",
                      done ? "border-ok bg-ok text-accent-fg" : "border-border text-muted",
                    )}
                  >
                    {done ? <Check className="size-3.5" /> : i + 1}
                  </span>
                  <div>
                    <p className="font-medium text-fg">{st.title}</p>
                    <p className="mt-1 text-sm text-muted">{st.why}</p>
                    {active && <p className="mt-2 text-xs text-accent">{st.hint}</p>}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between rounded-xl border border-border bg-panel px-4 py-3">
            <div>
              <p className="font-display text-[11px] uppercase tracking-[0.16em] text-subtle">{proc.title}</p>
              <p className="text-sm text-muted">{proc.summary}</p>
            </div>
            {complete ? <Badge tone="ok">Complete</Badge> : <Badge tone="muted">In progress</Badge>}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => s.reset()}>
              Reset airplane
            </Button>
            <Button size="sm" variant="outline" onClick={() => s.readyApu()}>
              APU running preset
            </Button>
          </div>
          <Overhead />
          <GroundModule />
        </div>
      </div>
    </AppShell>
  );
}
