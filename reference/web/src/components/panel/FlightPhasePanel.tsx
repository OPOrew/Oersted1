import { useEffect, useState } from "react";
import { FL_CAP_EVENT, FL_CAP_MAX, FL_CAP_MIN, setFlightLevelCap, useFlightLevelCap } from "@/lib/sim/flightLevelCap";
import { InstrumentStrip, SystemsCluster } from "@/components/panel/LiveInstruments";
import { ACTIVE_FLIGHT_PLAN_EVENT, readActiveFlightPlan, type ActiveFlightPlan } from "@/lib/sim/activeFlightPlan";
import { FLIGHT_NAV_STATE_EVENT, getLiveFlightNavigation, readFlightNavigationState, type FlightNavigationState } from "@/lib/sim/flightNavigation";
import { PHASE_BUTTONS, PHASE_CONFIG, canStart, loadPlanIntoControls, parkAtDeparture, setAutoPhases, startPhase, usePhase, type Phase, type PhaseButton } from "@/lib/sim/flightPhases";
import { useSim } from "@/lib/sim/store";
import { cn } from "@/lib/utils";

/**
 * Flight phases + live flight display for the Navigation section: load the active flight plan into the controls, press TAKEOFF / CLIMB / CRUISE / DESCENT / APPROACH / LAND,
 * and watch how the aircraft is flying (instruments, flaps / gear / thrust indicators, autopilot / PLAN NAV state, next waypoint). Display only reads the simulator;
 * the phase logic lives in lib/sim/flightPhases.ts.
 */
const PHASE_ORDER: Phase[] = ["READY", "TAKEOFF", "CLIMB", "CRUISE", "DESCENT", "APPROACH", "LAND", "ROLLOUT", "COMPLETE"];
const pad3 = (n: number) => String(Math.round(((n % 360) + 360) % 360)).padStart(3, "0");
const fmtFt = (n: number) => Math.round(n).toLocaleString("en-US");

function useActivePlan(): ActiveFlightPlan | null {
  const [plan, setPlan] = useState<ActiveFlightPlan | null>(null);
  useEffect(() => {
    const read = () => setPlan(readActiveFlightPlan());
    read();
    window.addEventListener(ACTIVE_FLIGHT_PLAN_EVENT, read);
    window.addEventListener(FL_CAP_EVENT, read);
    window.addEventListener("storage", read);
    return () => { window.removeEventListener(ACTIVE_FLIGHT_PLAN_EVENT, read); window.removeEventListener(FL_CAP_EVENT, read); window.removeEventListener("storage", read); };
  }, []);
  return plan;
}
function useLiveNav(): FlightNavigationState | null {
  const [nav, setNav] = useState<FlightNavigationState | null>(null);
  useEffect(() => {
    const read = () => setNav(getLiveFlightNavigation() ?? readFlightNavigationState());
    read();
    const id = window.setInterval(read, 500);
    window.addEventListener(FLIGHT_NAV_STATE_EVENT, read);
    return () => { window.clearInterval(id); window.removeEventListener(FLIGHT_NAV_STATE_EVENT, read); };
  }, []);
  return nav;
}

export function FlightPhasePanel() {
  const plan = useActivePlan();
  const nav = useLiveNav();
  const phase = usePhase((s) => s.phase);
  const hint = usePhase((s) => s.hint);
  const auto = usePhase((s) => s.auto);
  const checklist = usePhase((s) => s.checklist);
  const log = usePhase((s) => s.log);
  const sim = useSim();

  const idx = PHASE_ORDER.indexOf(phase);
  const btn = "rounded border px-2 py-1.5 font-display text-[9px] uppercase tracking-wide";

  const gs = Number(sim.groundSpeedKt ?? 0);
  // live landing-gear / flap / speedbrake state straight from the aircraft model
  const gearAvg = (Number(sim.noseGearPos ?? 0) + Number(sim.leftMainGearPos ?? 0) + Number(sim.rightMainGearPos ?? 0)) / 3;
  const gearText = gearAvg > 0.98 ? "DOWN & LOCKED" : gearAvg < 0.02 ? "UP & LOCKED" : "IN TRANSIT";
  const sbText = sim.speedBrake === "UP" ? "UP (DEPLOYED)" : String(sim.speedBrake ?? "-");
  const liveConfig = `${gearText} · FLAPS ${sim.flaps} · SPEEDBRAKE ${sbText}`;
  const etaMin = nav?.distanceToDestinationNm != null && gs > 30 ? (nav.distanceToDestinationNm / gs) * 60 / Math.max(1, nav.timeCompression ?? 1) : null;

  const capFl = useFlightLevelCap();
  const loaded = !!plan && phase !== "NO PLAN";
  const [showPlan, setShowPlan] = useState(true);
  // flight-plan section: planned cruise (held at the max flight level when one is set), altitude target, plan nav loaded / not loaded, next waypoint (live), destination
  const planCells: [string, string, string?][] = [
    ["Planned cruise", plan ? `${fmtFt(plan.cruiseAltitudeFt)} ft${capFl != null ? ` · max FL${capFl}` : ""}` : "-"],
    ["Altitude target", phase === "CLIMB" ? (plan ? `${fmtFt(plan.cruiseAltitudeFt)} ft` : "-") : phase === "DESCENT" || phase === "APPROACH" ? (plan ? `${fmtFt(plan.arrival?.firstFixName ? (plan.waypoints.find((w) => w.name === plan.arrival?.firstFixName)?.altitudeFt || 3000) : 3000)} ft` : "-") : phase === "CRUISE" ? (plan ? `${fmtFt(plan.cruiseAltitudeFt)} ft` : "-") : "not commanded"],
    ["PLAN NAV", loaded ? "LOADED" : "NOT LOADED", loaded ? "text-emerald-300" : undefined],
    ["Next waypoint", nav?.activeLegName ? `${nav.activeLegName} · ${nav.distanceToNextNm?.toFixed(1) ?? "-"} NM · ${nav.bearingToNextDeg != null ? pad3(nav.bearingToNextDeg) + "°T" : ""}` : "-"],
    ["To destination", nav?.distanceToDestinationNm != null ? `${nav.distanceToDestinationNm.toFixed(0)} NM${etaMin != null ? ` · ETE ${Math.floor(etaMin / 60)}h${String(Math.round(etaMin % 60)).padStart(2, "0")}` : ""}` : "-"],
  ];

  return (
    <div className="mt-2 rounded border border-border bg-surface p-2">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <div className="font-display text-[9px] uppercase tracking-[.14em] text-subtle">Flight phases · {plan ? `${plan.callsign ? plan.callsign + " · " : ""}${plan.departure} → ${plan.destination} · ${fmtFt(plan.cruiseAltitudeFt)} ft` : "no active plan"}</div>
        <button type="button" onClick={() => loadPlanIntoControls()} disabled={!plan} className={cn(btn, plan ? "border-accent/60 bg-accent/10 text-fg hover:bg-accent/20" : "border-border text-subtle opacity-50")}>
          {phase === "NO PLAN" ? "Load plan into controls" : "Reload plan / reset"}
        </button>
        <button type="button" onClick={() => setAutoPhases(!auto)} title="TAKEOFF → CLIMB → CRUISE → DESCENT → APPROACH → LAND advance by themselves" className={cn(btn, auto ? "border-emerald-500/60 bg-emerald-950/30 text-emerald-200" : "border-border text-subtle hover:text-fg")}>
          Auto phases {auto ? "ON" : "OFF"}
        </button>
        <button type="button" onClick={() => { useSim.getState().readyForDeparture(); parkAtDeparture(); }} className={cn(btn, "border-green-500/60 bg-green-500/10 text-fg hover:bg-green-500/20")}>
          Ready for departure
        </button>
        <FlightLevelInput />
      </div>

      {!plan && (
        <p className="mb-2 rounded border border-border bg-inset px-2 py-1.5 text-[9px] text-subtle">
          No flight plan is active. Build one on the <a href="/flight-plan" className="text-accent underline">Flight Plan</a> page and press activate, then come back here. Activating also loads it into these controls.
        </p>
      )}

      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {PHASE_BUTTONS.map((p: PhaseButton) => {
          const gate = canStart(p);
          const here = phase === p || (p === "LAND" && (phase === "ROLLOUT" || phase === "COMPLETE"));
          const done = idx > PHASE_ORDER.indexOf(p) && !here;
          return (
            <button key={p} type="button" disabled={!gate.ok} title={gate.ok ? `Start ${p}` : gate.reason} onClick={() => startPhase(p)}
              className={cn(btn, here ? "border-emerald-400 bg-emerald-600/30 text-emerald-100 shadow-[0_0_8px_rgba(61,214,140,.45)]" : done ? "border-border bg-inset text-subtle" : "border-border text-fg hover:bg-panel", !gate.ok && "cursor-not-allowed opacity-40")}>
              {p}
            </button>
          );
        })}
      </div>
      <p role="status" className="mt-1.5 rounded border border-amber-500/40 bg-amber-950/20 px-2 py-1 font-mono text-[9px] uppercase text-amber-200">{hint}</p>

      <div className="mt-2"><InstrumentStrip /></div>
      <SystemsCluster />

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="font-display text-[8px] uppercase tracking-[.14em] text-subtle">Flight plan section</span>
        <button type="button" aria-expanded={showPlan} onClick={() => setShowPlan((v) => !v)} className={cn(btn, "border-border text-fg hover:bg-panel")}>
          {showPlan ? "Hide" : "Show"}
        </button>
      </div>
      {showPlan && (
        <div>
      {checklist.length > 0 && (
        <div className="mt-2 rounded border border-border bg-inset p-1.5">
          <div className="mb-1 font-display text-[8px] uppercase tracking-[.14em] text-subtle">Plan loaded into the controls · configuration line is live</div>
          <ul className="grid gap-x-3 gap-y-0.5 font-mono text-[8px] uppercase sm:grid-cols-2">
            <li className="flex justify-between gap-2 border-b border-border/40 py-0.5 sm:col-span-2"><span className="text-subtle">Aircraft config (live)</span><span className="text-right text-emerald-300">{liveConfig}</span></li>
            <li className="flex justify-between gap-2 border-b border-border/40 py-0.5 sm:col-span-2"><span className="text-subtle">{phase} config</span><span className="text-right text-fg">{PHASE_CONFIG[phase]}</span></li>
            {checklist.filter((c) => !/^gear/i.test(c.label)).map((c) => (<li key={c.label} className="flex justify-between gap-2 border-b border-border/40 py-0.5"><span className="text-subtle">{c.label}</span><span className="text-right text-fg">{c.value}</span></li>))}
          </ul>
        </div>
      )}

          <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
            {planCells.map(([k, v, cls]) => (
              <div key={k} className="rounded border border-border bg-inset px-1.5 py-1">
                <div className="font-display text-[7px] uppercase tracking-[.12em] text-subtle">{k}</div>
                <div className={cn("truncate font-mono text-[10px] uppercase text-fg", cls)} title={v}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {log.length > 0 && (
        <div className="mt-2 rounded border border-border bg-inset p-1.5">
          <div className="mb-1 font-display text-[8px] uppercase tracking-[.14em] text-subtle">Flight log</div>
          <ul className="space-y-0.5 font-mono text-[8px] text-subtle">
            {[...log].reverse().slice(0, 8).map((l) => (<li key={`${l.t}-${l.text}`}><span className="text-fg">{new Date(l.t).toLocaleTimeString("en-GB")}</span> {l.text}</li>))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Simulation-only maximum flight level: a ceiling on the plan's cruise and waypoint altitudes (empty = the plan's own altitudes). */
function FlightLevelInput() {
  const cap = useFlightLevelCap();
  const [draft, setDraft] = useState<string | null>(null); // text being typed; null = show the stored cap
  const shown = draft ?? (cap == null ? "" : String(cap));
  const commit = () => {
    const t = shown.trim().replace(/^fl/i, "");
    setDraft(null);
    if (t === "") { setFlightLevelCap(null); return; }
    const n = Number(t);
    if (Number.isFinite(n) && n >= FL_CAP_MIN && n <= FL_CAP_MAX) setFlightLevelCap(n);
  };
  return (
    <label title="Simulation setting: waypoint and cruise altitudes above this flight level are held at it. Leave empty to use the flight plan's altitudes." className="flex items-center gap-1 font-display text-[9px] uppercase tracking-wide text-subtle">
      Max FL (sim)
      <input value={shown} inputMode="numeric" placeholder="none" onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="w-14 rounded border border-border bg-inset px-1.5 py-1 text-center font-mono text-[10px] text-fg" />
    </label>
  );
}

/* ───────── moving map ───────── */

