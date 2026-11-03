import { useEffect, useRef, useState } from "react";
import { useSim } from "@/lib/sim/store";
import { useActiveFlightPlan } from "@/lib/sim/activeFlightPlan";
import { canStart, loadPlanIntoControls, setAutoPhases, startPhase, usePhase } from "@/lib/sim/flightPhases";
import { FlightPhasePanel } from "@/components/panel/FlightPhasePanel";
import { cn } from "@/lib/utils";
import { Glareshield } from "@/components/panel/GlareshieldPanel";
import { NavSharedDisplay } from "@/components/panel/NavSharedDisplay";

/**
 * Autopilot simulator (ATA 22 / 34) — one screen, no second simulator:
 *   map            = the Navigation tab's InteractiveNavMap (route, waypoints, live aircraft symbol)
 *   glareshield    = the REAL 2D <Glareshield> (same stores as the main panel: FD mode, pitch, A/P selectors, AIL / ELEV, COURSE, HDG SEL)
 *   instruments    = the real captain's ADI / HSI / ASI / ALT / VSI / RMI, shown inside the Flight Phases panel (shared with the Navigation tab)
 * The control loop itself (glareshield -> autoflight laws -> attitude / heading -> route tracker -> map) runs in the main instrument
 * panel's attitude tick (MainInstrumentPanel.tsx useAttitude), which stays mounted on the cockpit page. Nothing here integrates
 * position or heading, so the map, HSI and ADI cannot disagree.
 */

const GW = 1360; // design width of the 2D glareshield (it never grows past this)
const GH = 232; // its height at that width

/** Real glareshield, scaled to fit the console width (horizontal scroll below a minimum scale so the knobs stay usable on a phone). */
function ScaledGlareshield() {
  const wrap = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(360);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const read = () => setW(el.clientWidth || 360);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = full ? 1 : Math.max(0.55, Math.min(1, w / GW));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-mono text-[8px] uppercase text-subtle">Glareshield · the real controls (same state as the main panel)</span>
        <button type="button" onClick={() => setFull((v) => !v)} className="rounded border border-border px-1.5 py-0.5 font-mono text-[8px] uppercase text-subtle hover:text-fg">
          {full ? "Fit width" : "Full size"}
        </button>
      </div>
      <div ref={wrap} className="overflow-x-auto overflow-y-hidden rounded border border-[#2a2f36] bg-[#0b0d10]">
        <div style={{ width: GW * scale, height: GH * scale }}>
          <div style={{ width: GW, transform: `scale(${scale})`, transformOrigin: "top left" }}>
            <Glareshield width={GW} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function AutopilotSimulator() {
  const s = useSim();
  const plan = useActiveFlightPlan();
  const phase = usePhase((st) => st.phase);
  const flyReason = !plan ? "Activate a flight plan first" : "";
  /** One tap: load the active plan into the controls (runway heading, PLAN NAV, flaps, HDG SEL bug), turn AUTO PHASES on and start TAKEOFF. Climb, cruise, descent, approach and landing then follow by themselves. */
  const flyThePlan = () => {
    if (!plan) return;
    if (s.wow && phase !== "READY") { if (!loadPlanIntoControls()) return; }
    setAutoPhases(true);
    if (canStart("TAKEOFF").ok) startPhase("TAKEOFF");
  };

  return (
    <div className="mt-2 space-y-2">
      <NavSharedDisplay radios={false} />

      <div className="rounded border border-border bg-surface p-2">
        <button
          type="button"
          disabled={!!flyReason}
          title={flyReason || "Load the active plan, turn AUTO PHASES on and start TAKEOFF; the aircraft then flies the plan (heading from the waypoints, climb and descent schedule, thrust)"}
          onClick={flyThePlan}
          className={cn("rounded border px-3 py-2 font-mono text-[10px] uppercase", flyReason ? "cursor-not-allowed border-border text-subtle opacity-50" : "border-emerald-500/60 bg-emerald-950/30 text-emerald-200 hover:bg-emerald-900/40")}
        >
          Fly the plan
        </button>
        {flyReason && <p className="mt-1.5 font-mono text-[8px] uppercase text-subtle">{flyReason}</p>}
      </div>

      <FlightPhasePanel />

      <ScaledGlareshield />
    </div>
  );
}
