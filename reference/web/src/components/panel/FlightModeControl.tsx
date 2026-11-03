import { useSim, useSimPick, useDerivedPick } from "@/lib/sim/store";
import { ControlSlider } from "@/components/panel/widgets";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/** Patch that puts the airplane airborne in a self-consistent state (shared by the Flight button and the navigation trainer's 12 nm final). */
export function flightModePatch(altFt: number): any {
  return {
        battery: true,
        wow: false,
        airborneTest: true,
        groundSenseTest: false,
        lever1: true,
        lever2: true,
        n2_1: 70,
        n2_2: 70,
        bleed1: true,
        bleed2: true,
        engHyd1: true,
        engHyd2: true,
        elecHyd1: true,
        elecHyd2: true,
        gen1: true,
        gen2: true,
        gear: "UP",
        noseGearPos: 0,
        leftMainGearPos: 0,
        rightMainGearPos: 0,
        fltCtrlA: true,
        fltCtrlB: true,
        spoilerA: true,
        spoilerB: true,
        hydServicingConnected: false,
        hydGroundPowerConnected: false,
        groundPneumaticConnected: false,
        groundPneumaticPsi: 0,
        externalPowerConnected: false,
        parkingBrake: false,
        hydAPress: 3000,
        hydBPress: 3000,
        speedBrake: "DOWN",
        groundSpeedKt: 160,
        psFlightCasKt: 160,
        psFlightAltFt: altFt > 0 ? altFt : 5000,
        psFlightTargetAltFt: altFt > 0 ? altFt : 5000,
        psFlightTargetCasKt: 160,
        yokePitch: 0,
        yokeRoll: 0,
        rudderPedal: 0,
        tiller: 0,
  };
}

/**
 * Ground / Flight mode selector for the Flight Controls trainer.
 * FLIGHT asserts the airborne state (weight-off-wheels) and sets up a self-consistent
 * airborne configuration so the yoke, pedals and surfaces drive the attitude model.
 * GROUND returns the airplane to the ground (weight-on-wheels, gear down, stopped).
 */
/** Put the airplane airborne if it is on the ground (no-op when already flying). */
export function ensureAirborne() {
  const st = useSim.getState();
  if (st.wow || !(st.psFlightCasKt > 0)) st.patch(flightModePatch(st.psFlightAltFt), "FLIGHT MODE — airborne for navigation / autopilot training.");
}

export function FlightModeControl({ children }: { children?: ReactNode }) {
  const s = useSimPick("patch", "psFlightAltFt", "psFlightCasKt", "wow");
  const d = useDerivedPick("flightControlAAvailable", "flightControlBAvailable");
  const flight = !s.wow;

  const goFlight = () =>
    s.patch(flightModePatch(s.psFlightAltFt), 
      "FLIGHT MODE — airborne, gear up, hydraulics A/B pressurized; flight controls live.",
    );

  const goGround = () =>
    s.patch(
      {
        airborneTest: false,
        groundSenseTest: false,
        wow: true,
        gear: "DOWN",
        noseGearPos: 1,
        leftMainGearPos: 1,
        rightMainGearPos: 1,
        groundSpeedKt: 0,
        psFlightCasKt: 0,
        psFlightTargetCasKt: 0,
        psFlightAltFt: 0,
        psFlightTargetAltFt: 0,
        psFlightVsFpm: 0,
        speedBrake: "DOWN",
        yokePitch: 0,
        yokeRoll: 0,
        rudderPedal: 0,
      } as any,
      "GROUND MODE — weight on wheels, gear down, airplane stopped.",
    );

  const btn = "rounded border px-3 py-2 font-display text-[10px] uppercase tracking-wide";

  return (
    <div className="mb-3 rounded-lg border border-border bg-inset p-2">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="font-display text-[10px] uppercase tracking-[.16em] text-subtle">Flight mode</div>
        <div className={cn("rounded border px-2 py-1 font-mono text-[8px] uppercase", flight ? "border-emerald-500/40 bg-emerald-950/20 text-emerald-300" : "border-border text-subtle")}>
          {flight ? "AIRBORNE · WOW OFF" : "ON GROUND · WOW ON"}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={goGround} className={cn(btn, !flight ? "border-accent/60 bg-accent/10 text-fg" : "border-border bg-surface text-subtle hover:bg-panel")}>Ground</button>
        <button type="button" onClick={goFlight} className={cn(btn, flight ? "border-accent/60 bg-accent/10 text-fg" : "border-border bg-surface text-subtle hover:bg-panel")}>Flight</button>
      </div>
      {flight && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <ControlSlider label={`AIRSPEED · ${Math.round(s.psFlightCasKt)} KT`} value={s.psFlightCasKt} min={60} max={350} step={5} onChange={(v) => s.patch({ psFlightCasKt: v, psFlightTargetCasKt: v, groundSpeedKt: v } as any)} />
          <ControlSlider label={`ALTITUDE · ${Math.round(s.psFlightAltFt)} FT`} value={s.psFlightAltFt} min={0} max={41000} step={500} onChange={(v) => s.patch({ psFlightAltFt: v, psFlightTargetAltFt: v } as any)} />
        </div>
      )}
      {flight && children}
      {flight && !(d.flightControlAAvailable || d.flightControlBAvailable) && (
        <p className="mt-2 font-mono text-[8px] uppercase text-amber-300">No flight-control hydraulic power — surfaces will not respond.</p>
      )}
      <p className="mt-2 text-[8px] leading-snug text-subtle">Flight sets the airborne state with engines running and hydraulic systems A/B on so the yoke and pedals drive the surfaces and the six-pack attitude. Ground restores weight-on-wheels with the gear down.</p>
    </div>
  );
}
