import { useEffect } from "react";
import { getPanelRenderInterval, setPanelRenderInterval, useSim } from "@/lib/sim/store";
import { ensureFlightPhaseController } from "@/lib/sim/flightPhases";

/** Simulation step interval. The model is rate-based (dt up to 0.25 s is stable), so 30 Hz halves CPU work with no change in physics. */
const SIM_STEP_S = 0.03;

export function SimTicker() {
  useEffect(() => {
    // Keep the flight-phase controller alive at the application shell level.
    // Trainer panels may unmount while the aircraft is still running.
    ensureFlightPhaseController();
    let last = performance.now();
    let acc = 0;
    let frame = 0;
    // Adaptive panel refresh: if frames take too long (slow phone, heavy panel open) redraw panels less often;
    // once frames are healthy again, go back towards the normal rate.
    let frameEma = 16.7;
    let evalAt = last + 1000;
    const loop = (now: number) => {
      const frameMs = now - last;
      // Sim time must track the wall clock: accumulate real elapsed time (clamped to 0.25 s after a stall)
      // and step once at least SIM_STEP_S has passed - every 2nd frame at 60 Hz, every frame at 30 Hz or less.
      acc += Math.min(0.25, frameMs / 1000);
      last = now;
      if (frameMs < 250) frameEma = frameEma * 0.9 + frameMs * 0.1; // ignore tab-switch stalls
      if (now >= evalAt) {
        evalAt = now + 1000;
        const cur = getPanelRenderInterval();
        if (frameEma > 36) setPanelRenderInterval(cur * 1.5);
        else if (frameEma < 22 && cur > 50) setPanelRenderInterval(cur / 1.25);
      }
      if (acc >= SIM_STEP_S) {
        useSim.getState().tick(Math.min(0.25, acc));
        acc = 0;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);
  return null;
}
