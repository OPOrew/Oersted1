/**
 * Realistic 737-200 Overhead – photo-matched panels
 *
 * Sections:
 *  1. Engine Start + APU
 *  2. Electrical
 *  3. Hydraulic
 *  4. Bleed / Packs
 *  5. Fuel (photo-matched layout)
 *  6. Air Conditioning (photo-matched + animated gauges)
 *  7. Anti-ice / Window heat
 *  8. Exterior + Flight deck + Signs
 *  9. Flight controls / flaps
 */

import { RealisticOverheadStart } from "./RealisticOverheadStart";
import { RealisticElecPanel } from "./RealisticElecPanel";
import { P6CircuitBreakerPanel } from "./P6CircuitBreakerPanel";
import { RealisticHydPanel } from "./RealisticHydPanel";
import { RealisticBleedPanel } from "./RealisticBleedPanel";
import { RealisticFuelPanel } from "./RealisticFuelPanel";
import { RealisticAirCondPanel } from "./RealisticAirCondPanel";
import { RealisticAntiIcePanel } from "./RealisticAntiIcePanel";
import { RealisticLightsPanel } from "./RealisticLightsPanel";
import { RealisticFlightControlsPanel } from "./RealisticFlightControlsPanel";
import { RealisticTopPanel } from "./RealisticTopPanel";
import { RealisticPressPanel } from "./RealisticPressPanel";

export function RealisticOverhead({
  focus,
  noPedestal,
}: {
  focus?:
    | "start"
    | "apu"
    | "elec"
    | "hyd"
    | "bleed"
    | "fuel"
    | "aircond"
    | "antiice"
    | "lights"
    | "flt"
    | "top"
    | "press"
    | "all";
  noPedestal?: boolean;
}) {
  const show = (k: NonNullable<typeof focus>) =>
    !focus || focus === "all" || focus === k;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid items-start gap-4">
        {(show("top") || show("all")) && <RealisticTopPanel />}
        {(show("start") || show("apu") || show("all")) && (
          <RealisticOverheadStart />
        )}
        {(show("elec") || show("all")) && <><RealisticElecPanel /><P6CircuitBreakerPanel /></>}
        {(show("hyd") || show("all")) && <RealisticHydPanel />}
        {(show("bleed") || show("all")) && <RealisticBleedPanel />}
        {(show("fuel") || show("all")) && <RealisticFuelPanel />}
        {(show("aircond") || show("all")) && <RealisticAirCondPanel />}
        {(show("press") || show("all")) && <RealisticPressPanel />}
        {(show("antiice") || show("all")) && <RealisticAntiIcePanel />}
        {(show("lights") || show("all")) && <RealisticLightsPanel />}
        {(show("flt") || show("all")) && (
          <RealisticFlightControlsPanel noPedestal={noPedestal} />
        )}
      </div>
    </div>
  );
}
