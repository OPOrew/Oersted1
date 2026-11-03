import { lazy, Suspense } from "react";
import { SituationDisplay } from "@/components/panel/SituationDisplay";
import { PedestalNavRadios } from "@/components/panel/CenterPedestal";

const InteractiveNavMap = lazy(() => import("@/components/panel/InteractiveNavMap").then((m) => ({ default: m.InteractiveNavMap })));

/**
 * One navigation display for the Navigation AND Autopilot training tabs, so both always show the same thing:
 *   map                = InteractiveNavMap (route, waypoints, live aircraft symbol)
 *   pedestal NAV radios = the real P8 NAV 1 / NAV 2 / ADF units (the only place frequencies are set)
 *   situation display  = the Navigation-tab version ("where you are relative to the beam")
 * It only reads the live simulation, so nothing here can disagree with the instrument panel.
 */
/** radios = false on the Autopilot tab, whose controls are the glareshield instead of the pedestal NAV radios. */
export function NavSharedDisplay({ radios = true }: { radios?: boolean }) {
  return (
    <div className="space-y-2">
      <Suspense fallback={<div className="flex h-[360px] items-center justify-center rounded border border-border bg-surface text-xs text-muted">Loading map…</div>}>
        <InteractiveNavMap />
      </Suspense>
      {radios && <PedestalNavRadios />}
      <SituationDisplay focus="nav" />
    </div>
  );
}

export default NavSharedDisplay;
