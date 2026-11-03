import { useMemo } from "react";
import { useMip } from "@/lib/sim/mipLocal";
import { useSituation, explain, type Tone } from "@/lib/sim/situation";
import { vorDevOf } from "@/lib/sim/radionav";
import { cn } from "@/lib/utils";
import { RunwayScene } from "@/components/panel/RunwayScene";
import { readFlightNavigationState } from "@/lib/sim/flightNavigation";
import { useState, useEffect } from "react";

/**
 * "What is happening" view for the Navigation and Autopilot training tabs: a side view with the 3 deg glide slope and a plain-language explanation
 * of the autopilot's current mode and why.
 * It only reads the live simulation (the instrument-panel model publishes position and capture phases); it adds no new simulation.
 */
const TONE: Record<Tone, string> = {
  info: "border-border text-fg",
  armed: "border-amber-500/50 bg-amber-950/20 text-amber-200",
  ok: "border-emerald-500/40 bg-emerald-950/20 text-emerald-200",
  warn: "border-red-500/50 bg-red-950/20 text-red-200",
};

export function SituationDisplay({ focus }: { focus: "nav" | "ap" }) {
  const m = useMip();
  const sit = useSituation();
  const [navState, setNavState] = useState(readFlightNavigationState());

  useEffect(() => {
    const id = setInterval(() => setNavState(readFlightNavigationState()), 250);
    return () => clearInterval(id);
  }, []);

  const navValid = m.navOn && (m.navTuned === "ILS" ? m.nav.locValid : m.nav.vorValid);
  const vorDev = vorDevOf(m.nav.radial, m.selCrs).dev;
  const text = useMemo(
    () => explain({ sit, navOn: m.navOn, tuned: m.navTuned, nav: m.nav, navValid, selCrs: m.selCrs, selHdg: m.selHdg, apNav: m.apNav, apHdgSw: m.apHdgSw, apAil: m.apAil, apElev: m.apElev, apPitch: m.apPitch, apWhy: m.apWhy, vorDev }),
    [sit, m.navOn, m.navTuned, m.nav, navValid, m.selCrs, m.selHdg, m.apNav, m.apHdgSw, m.apAil, m.apElev, m.apPitch, m.apWhy, vorDev],
  );

  if (m.navScene !== "RPLL06") {
    const pos = navState
      ? `${navState.latitude.toFixed(4)}°, ${navState.longitude.toFixed(4)}°`
      : "waiting for telemetry";
    const hdg = navState?.headingDeg?.toFixed(0) ?? "---";
    const alt = navState?.altitudeFt?.toFixed(0) ?? "---";
    const gs = Math.round(navState?.groundSpeedKt ?? 0);
    return (
      <div className="mt-2 rounded border border-border bg-surface p-2">
        <div className="font-display text-[9px] uppercase tracking-[.14em] text-subtle">What is happening</div>
        <p className="mt-1.5 text-[11px] text-fg">Aircraft position is synchronized with the navigation map.</p>
        <p className="mt-1 font-mono text-[10px] text-subtle">
          POS {pos} · HDG {hdg}° · ALT {alt} ft · GS {gs} kt · PLAN NAV: {m.planNavStatus}
        </p>
        <RunwayScene />
      </div>
    );
  }

  return (
    <div className="mt-2 rounded border border-border bg-surface p-2">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <div className="font-display text-[9px] uppercase tracking-[.14em] text-subtle">What is happening · {focus === "nav" ? "where you are relative to the beam" : "what the autopilot is doing"}</div>
        <div className="flex gap-1 font-mono text-[8px] uppercase">
          <span className="rounded border border-border px-1.5 py-0.5 text-subtle">LAT {sit.latSub === "OFF" ? "—" : sit.latSub.replace("_", " ")}</span>
          <span className="rounded border border-border px-1.5 py-0.5 text-subtle">VERT {sit.gsPhase === "OFF" ? "—" : `G/S ${sit.gsPhase}`}</span>
        </div>
      </div>

      <RunwayScene />

      <div className="space-y-1.5">
        {[...text.lateral, ...text.vertical].map((l, k) => (
          <p key={k} className={cn("rounded border px-2 py-1.5 text-[10px] leading-snug", TONE[l.tone])}>{l.text}</p>
        ))}
      </div>

      <p className="mt-1 text-[8px] leading-snug text-subtle">This view reads the live simulation, so every control on the panel moves it. Amber = armed or intercepting, green = captured, cyan = pilot flying. Simplified training geometry, not for navigation.</p>
    </div>
  );
}
