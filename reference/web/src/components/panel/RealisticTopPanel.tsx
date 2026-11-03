/**
 * Realistic 737-200 overhead — top section (matches the real overhead photo):
 *   LE DEVICES annunciator · THRUST REVERSER · CREW / PASS OXYGEN
 *   FLIGHT RECORDER · MACH AIRSPEED WARNING TEST · STALL WARNING TEST
 *   SERVICE INTERPHONE · DOME WHITE
 */
import { useState } from "react";
import { useSimPick, useDerivedPick } from "@/lib/sim/store";
import { cn } from "@/lib/utils";
import { Cap, OnOffToggle, PanelShell, PushButton, RoundGauge, ToggleLever } from "./OverheadParts";

function useMomentary() {
  const [on, setOn] = useState(false);
  return { on, down: () => setOn(true), up: () => setOn(false) };
}

/** One LE device block: green = full ext, amber = in transit, dark = retracted. */
function LeBlock({ state }: { state: "ext" | "transit" | "ret" }) {
  return (
    <div
      className={cn(
        "h-3 w-3 border border-[#111]",
        state === "ext" && "bg-green-400 shadow-[0_0_5px_#4ade80]",
        state === "transit" && "bg-amber-400 shadow-[0_0_5px_#fbbf24]",
        state === "ret" && "bg-[#14301a]",
      )}
    />
  );
}

export function RealisticTopPanel() {
  const s = useSimPick("crewOxyMode", "crewOxyPsi", "flightRecorderMode", "ltDome", "passOxyMode", "patch", "psMachWarningTest", "psStallWarningTest", "serviceInterphoneOn");
  const d = useDerivedPick("cvrOff", "dcPower", "leExtended", "leTransit", "passengerOxygenDeployed", "thrustReverser1Active", "thrustReverser2Active");
  const test = useMomentary(); // LE-device annunciator test only

  const le: "ext" | "transit" | "ret" = test.on
    ? "transit"
    : d.leExtended
      ? "ext"
      : d.leTransit
        ? "transit"
        : "ret";
  const dcOk = !!d.dcPower;
  const recOff = d.cvrOff;
  const horn = s.psMachWarningTest && dcOk;
  const shaker = s.psStallWarningTest && dcOk;

  return (
    <PanelShell title="OVERHEAD · TOP PANEL" maxWidth={520}>
      {/* LE devices + reversers */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded border border-[#1e201c] bg-[#2a2c28] p-2">
          <div className="mb-1 text-center font-mono text-[7px] uppercase tracking-wider text-[#c8c0a8]">
            LE DEVICES
          </div>
          <div className="flex justify-center gap-4">
            {[0, 1].map((side) => (
              <div key={side} className="grid grid-cols-3 gap-0.5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <LeBlock key={i} state={le} />
                ))}
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between font-mono text-[6px] text-[#8a8570]">
            <span>TRANSIT</span>
            <span>FULL EXT</span>
          </div>
          <div className="mt-1 flex justify-center">
            <PushButton label="TEST" onDown={test.down} onUp={test.up} />
          </div>
        </div>

        <div className="rounded border border-[#1e201c] bg-[#2a2c28] p-2">
          <div className="mb-1 text-center font-mono text-[7px] uppercase tracking-wider text-[#c8c0a8]">
            THRUST REVERSER
          </div>
          <div className="flex justify-center gap-2">
            <Cap label={"ENG 1\nREVERSER"} on={test.on || d.thrustReverser1Active} />
            <Cap label={"ENG 2\nREVERSER"} on={test.on || d.thrustReverser2Active} />
          </div>
          <p className="mt-2 text-center font-mono text-[6px] leading-snug text-[#8a8570]">
            Lights illuminate with the annunciator test or when a reverser is not locked.
          </p>
        </div>
      </div>

      {/* Oxygen + recorder / warning tests */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded border border-[#1e201c] bg-[#2a2c28] p-2">
          <div className="flex items-end justify-around">
            <div className="flex flex-col items-center">
              <span className="font-mono text-[7px] uppercase text-[#c8c0a8]">CREW OXYGEN</span>
              <RoundGauge label="OXY PRESS" value={s.crewOxyPsi / 100} min={0} max={20} ticks={5} unit="x100 PSI" size={58} />
              <OnOffToggle label="CREW OXY" on={s.crewOxyMode === "ON"} onLabel="ON" offLabel="NORMAL" onToggle={() => s.patch({ crewOxyMode: s.crewOxyMode === "ON" ? "NORMAL" : "ON" }, `CREW OXYGEN ${s.crewOxyMode === "ON" ? "NORMAL" : "ON"}`)} />
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="font-mono text-[7px] uppercase text-[#c8c0a8]">PASS OXYGEN</span>
              <OnOffToggle on={s.passOxyMode === "ON"} onLabel="ON" offLabel="NORMAL" guarded onToggle={() => s.patch({ passOxyMode: s.passOxyMode === "ON" ? "NORMAL" : "ON" }, `PASSENGER OXYGEN ${s.passOxyMode === "ON" ? "NORMAL" : "ON"}`)} />
              <Cap label={"PASS OXY\nON"} on={d.passengerOxygenDeployed} tone="caution" />
            </div>
          </div>
        </div>

        <div className="rounded border border-[#1e201c] bg-[#2a2c28] p-2">
          <div className="mb-1 font-mono text-[7px] uppercase tracking-wider text-[#c8c0a8]">FLIGHT RECORDER</div>
          <div className="flex items-center justify-around">
            <OnOffToggle on={s.flightRecorderMode === "TEST"} onLabel="TEST" offLabel="NORMAL" onToggle={() => { const mode = s.flightRecorderMode === "TEST" ? "NORMAL" : "TEST"; s.patch({ flightRecorderMode: mode, cvrTest: mode === "TEST" }, `FLIGHT RECORDER ${mode}`); }} />
            <Cap label="OFF" on={recOff} />
          </div>
          <div className="mt-2 border-t border-[#1e201c] pt-1">
            <div className="text-center font-mono text-[7px] uppercase text-[#c8c0a8]">MACH AIRSPEED WARNING TEST</div>
            <div className="flex justify-center gap-4">
              <PushButton label="NO. 1" onDown={() => s.patch({ psMachWarningTest: true }, "MACH/AIRSPEED WARNING TEST 1")} onUp={() => s.patch({ psMachWarningTest: false })} />
              <PushButton label="NO. 2" onDown={() => s.patch({ psMachWarningTest: true }, "MACH/AIRSPEED WARNING TEST 2")} onUp={() => s.patch({ psMachWarningTest: false })} />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <div className="rounded border border-[#1e201c] bg-[#2a2c28] p-2">
          <div className="text-center font-mono text-[7px] uppercase text-[#c8c0a8]">STALL WARNING TEST</div>
          <div className="flex justify-center gap-4">
            <PushButton label="NO. 1" onDown={() => s.patch({ psStallWarningTest: true }, "STALL WARNING TEST 1")} onUp={() => s.patch({ psStallWarningTest: false })} />
            <PushButton label="NO. 2" onDown={() => s.patch({ psStallWarningTest: true }, "STALL WARNING TEST 2")} onUp={() => s.patch({ psStallWarningTest: false })} />
          </div>
        </div>
        <div className="flex flex-col items-center justify-center gap-1 rounded border border-[#1e201c] bg-[#2a2c28] p-2">
          <OnOffToggle label="SERVICE INTERPHONE" on={s.serviceInterphoneOn} onLabel="ON" offLabel="OFF" onToggle={() => s.patch({ serviceInterphoneOn: !s.serviceInterphoneOn }, `SERVICE INTERPHONE ${s.serviceInterphoneOn ? "OFF" : "ON"}`)} />
        </div>
        <div className="rounded border border-[#1e201c] bg-[#2a2c28] p-2">
          <div className="text-center font-mono text-[7px] uppercase text-[#c8c0a8]">DOME WHITE</div>
          <div className="mt-1 flex justify-center">
            <ToggleLever
              options={[
                { id: "DIM", label: "DIM" },
                { id: "OFF", label: "OFF" },
                { id: "BRT", label: "BRT" },
              ]}
              value={s.ltDome}
              onChange={(id) => s.patch({ ltDome: id as "OFF" | "DIM" | "BRT" })}
            />
          </div>
        </div>
      </div>

      {(horn || shaker) && (
        <div className="mt-2 rounded border border-amber-500/60 bg-amber-950/40 px-2 py-1 text-center font-mono text-[7px] uppercase text-amber-300">
          {horn && "MACH AIRSPEED WARNING — clacker sounding"}
          {horn && shaker && " · "}
          {shaker && "STALL WARNING — stick shakers active"}
        </div>
      )}
    </PanelShell>
  );
}
