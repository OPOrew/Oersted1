/**
 * Realistic 737-200 Bleed / Packs panel (P5-10) — layout matched to the real overhead:
 *
 *   DUAL BLEED · RAM DOOR FULL OPEN L / R              RECIRC FAN (OFF / AUTO · OVHT · TEST)
 *               dual-needle DUCT PRESS gauge
 *   L PACK (OFF/ON)   ISOLATION VALVE (CLOSE/AUTO/OPEN) + TRIP RESET   R PACK
 *   PACK TRIP OFF · WING-BODY OVERHEAT · BLEED TRIP OFF  (each side)
 *   BLEED   1 · APU · 2
 *   The WING ANTI-ICE legends are printed duct mimic labels, not switches (switch lives on the anti-ice panel).
 */

import { useDerived, useSimPick } from "@/lib/sim/store";
import type { Isolation } from "@/lib/sim/types";
import { useState } from "react";
import { Cap, OnOffToggle, PushButton, ToggleLever } from "./OverheadParts";

function VertToggle({
  label,
  on,
  onToggle,
  lit,
  onLabel = "ON",
  offLabel = "OFF",
  disabled,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
  lit?: boolean;
  onLabel?: string;
  offLabel?: string;
  disabled?: boolean;
}) {
  return (
    <OnOffToggle label={label} on={on} onToggle={onToggle} lit={lit} litTone="amber" onLabel={onLabel} offLabel={offLabel} disabled={disabled} />
  );
}

/** Isolation valve 3-position toggle: CLOSE / AUTO / OPEN, top to bottom (as on the real panel) */
function IsolationSwitch({
  value,
  onChange,
}: {
  value: Isolation;
  onChange: (v: Isolation) => void;
}) {
  return (
    <ToggleLever
      label="ISOLATION VALVE"
      options={[
        { id: "CLOSE", label: "CLOSE" },
        { id: "AUTO", label: "AUTO" },
        { id: "OPEN", label: "OPEN" },
      ]}
      value={value}
      onChange={(id) => onChange(id as Isolation)}
    />
  );
}

/** Stack of trip lights (PACK TRIP OFF / WING-BODY OVERHEAT / BLEED TRIP OFF) — all amber on the real panel */
function TripStack({
  packTrip,
  wingBody,
  bleedTrip,
}: {
  packTrip: boolean;
  wingBody: boolean;
  bleedTrip: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <Cap label={"PACK TRIP\nOFF"} on={packTrip} tone="caution" />
      <Cap label={"WING-BODY\nOVERHEAT"} on={wingBody} tone="caution" />
      <Cap label={"BLEED TRIP\nOFF"} on={bleedTrip} tone="caution" />
    </div>
  );
}

/** Dual-needle duct pressure gauge: white = left duct, orange = right duct (0–80 psi). */
function DuctGauge({ left, right }: { left: number; right: number }) {
  const ang = (v: number) => -135 + (Math.max(0, Math.min(80, v)) / 80) * 270;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg viewBox="0 0 100 100" width={86} height={86} role="img" aria-label={`Duct pressure left ${Math.round(left)} right ${Math.round(right)} psi`}>
        <circle cx="50" cy="50" r="47" fill="#0c0c0b" stroke="#1a1a18" strokeWidth="3" />
        {[0, 20, 40, 60, 80].map((v) => {
          const a = (ang(v) * Math.PI) / 180;
          return (
            <g key={v}>
              <line x1={50 + Math.sin(a) * 38} y1={50 - Math.cos(a) * 38} x2={50 + Math.sin(a) * 44} y2={50 - Math.cos(a) * 44} stroke="#d8d0b8" strokeWidth="1.6" />
              <text x={50 + Math.sin(a) * 29} y={50 - Math.cos(a) * 29 + 2.5} fontSize="8" fill="#d8d0b8" textAnchor="middle" fontFamily="monospace">
                {v}
              </text>
            </g>
          );
        })}
        <text x="50" y="66" fontSize="7" fill="#d8d0b8" textAnchor="middle" fontFamily="monospace">DUCT</text>
        <text x="50" y="74" fontSize="7" fill="#d8d0b8" textAnchor="middle" fontFamily="monospace">PRESS PSI</text>
        <g style={{ transform: `rotate(${ang(right)}deg)`, transformOrigin: "50px 50px", transition: "transform 0.4s ease-out" }}>
          <line x1="50" y1="50" x2="50" y2="15" stroke="#e07030" strokeWidth="2" strokeLinecap="round" />
        </g>
        <g style={{ transform: `rotate(${ang(left)}deg)`, transformOrigin: "50px 50px", transition: "transform 0.4s ease-out" }}>
          <line x1="50" y1="50" x2="50" y2="12" stroke="#f4efe0" strokeWidth="2" strokeLinecap="round" />
        </g>
        <circle cx="50" cy="50" r="4" fill="#2a2a28" stroke="#6a6558" />
      </svg>
      <span className="font-mono text-[6px] text-[#b0a890]">L {Math.round(left)} · R {Math.round(right)} psi</span>
    </div>
  );
}

export function RealisticBleedPanel() {
  const s = useSimPick("apuBleed", "apuBleedValve", "bleed1", "bleed2", "bleedTrip1", "bleedTrip2", "flaps", "isolation", "ltTest", "packL", "packR", "packTripL", "packTripR", "patch", "recirc", "wow");
  const d = useDerived();
  const [recircTest, setRecircTest] = useState(false);

  const dc = !!d.dcPower;
  const lampTest = !!s.ltTest && dc;
  const leftDuct = Number(d.leftDuctPsi ?? 0);
  const rightDuct = Number(d.rightDuctPsi ?? 0);

  // Wing-body overheat is not modelled separately — pack duct overheat stands in for it
  const wingBodyL = !!(d as { packLDuctOverheat?: boolean }).packLDuctOverheat;
  const wingBodyR = !!(d as { packRDuctOverheat?: boolean }).packRDuctOverheat;

  // Ram air door: fully open on the ground or with flaps out while the pack is flowing
  const ramFull = (flow: boolean) => dc && flow && (!!s.wow || Number(s.flaps ?? 0) > 0);

  const setPack = (side: "L" | "R", pos: "OFF" | "ON") => {
    const key = side === "L" ? "packL" : "packR";
    const trip = side === "L" ? "packTripL" : "packTripR";
    if (pos === "OFF") {
      s.patch({ [key]: false, [trip]: false } as never, `${side} PACK OFF`);
    } else {
      s.patch({ [key]: true } as never, `${side} PACK ${pos}`);
    }
  };

  const resetTrips = () => {
    if (s.packTripL) s.patch({ packTripL: false }, "L PACK TRIP RESET");
    if (s.packTripR) s.patch({ packTripR: false }, "R PACK TRIP RESET");
    if (s.bleedTrip1) s.patch({ bleedTrip1: false }, "BLEED 1 TRIP RESET");
    if (s.bleedTrip2) s.patch({ bleedTrip2: false }, "BLEED 2 TRIP RESET");
  };

  // Pure 737-200 panel: pack switches are OFF / ON, without later HIGH mode.
  const packOpts = [
    { id: "OFF", label: "OFF" },
    { id: "ON", label: "ON" },
  ];
  const packPos = (on: boolean): "OFF" | "ON" => on ? "ON" : "OFF";

  return (
    <div
      className="relative w-full min-w-0 max-w-full overflow-x-auto overflow-y-hidden rounded-md border-2 border-[#1a1c18] shadow-xl panel-scroll" data-panel-scroll data-keep-cols
      style={{
        background: "linear-gradient(180deg, #3e413b 0%, #32352f 45%, #2a2c28 100%)",
        maxWidth: "min(100%, 460px)",
      }}
    >
      <div className="relative border-b border-[#1e201c] bg-[#2e312c]/90 px-3 py-1">
        <h2 className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#e0d8c0]">
          BLEED / PACKS · P5-10
        </h2>
      </div>

      <div className="relative px-3 py-3">
        {/* Annunciators + recirc fan */}
        <div className="grid grid-cols-[1fr_1fr_1fr] items-start gap-2">
          <div className="flex flex-col items-center gap-1">
            <Cap label={"DUAL\nBLEED"} on={lampTest || (dc && !!d.dualBleed)} tone="caution" />
            <Cap label={"RAM DOOR\nFULL OPEN"} on={lampTest || ramFull(!!d.packLFlow)} tone="blue" />
          </div>
          <DuctGauge left={leftDuct} right={rightDuct} />
          <div className="flex flex-col items-center gap-1">
            <Cap label={"RAM DOOR\nFULL OPEN"} on={lampTest || ramFull(!!d.packRFlow)} tone="blue" />
            <div className="flex items-end gap-2">
              <OnOffToggle label="RECIRC FAN" on={s.recirc} onLabel="AUTO" offLabel="OFF" onToggle={() => s.patch({ recirc: !s.recirc })} scale={0.85} />
              <div className="flex flex-col items-center gap-1 pb-1">
                <Cap label="OVHT" on={lampTest || (dc && recircTest)} tone="caution" />
                <PushButton label="TEST" onDown={() => setRecircTest(true)} onUp={() => setRecircTest(false)} />
              </div>
            </div>
          </div>
        </div>

        {/* Packs + isolation valve */}
        <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-start gap-2 border-t border-[#1e201c]/70 pt-2">
          <div className="flex flex-col items-center gap-2">
            <ToggleLever
              label="L PACK"
              options={packOpts}
              value={packPos(s.packL)}
              onChange={(id) => setPack("L", id as "OFF" | "ON")}
              lit={!!d.acPower && !!d.packLFlow}
              litTone="amber"
            />
            <span className="font-mono text-[5px] uppercase tracking-wider text-[#8a8578]">WING ANTI-ICE</span>
          </div>

          <div className="flex flex-col items-center gap-1">
            <IsolationSwitch value={s.isolation} onChange={(id) => s.patch({ isolation: id })} />
            <PushButton label="TRIP RESET" onDown={resetTrips} onUp={() => {}} />
          </div>

          <div className="flex flex-col items-center gap-2">
            <ToggleLever
              label="R PACK"
              options={packOpts}
              value={packPos(s.packR)}
              onChange={(id) => setPack("R", id as "OFF" | "ON")}
              lit={!!d.acPower && !!d.packRFlow}
              litTone="amber"
            />
            <span className="font-mono text-[5px] uppercase tracking-wider text-[#8a8578]">WING ANTI-ICE</span>
          </div>
        </div>

        {/* Trip light stacks */}
        <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-start gap-2">
          <div className="flex justify-center">
            <TripStack packTrip={lampTest || (dc && !!s.packTripL)} wingBody={lampTest || (dc && wingBodyL)} bleedTrip={lampTest || (dc && !!s.bleedTrip1)} />
          </div>
          <div className="w-[64px]" />
          <div className="flex justify-center">
            <TripStack packTrip={lampTest || (dc && !!s.packTripR)} wingBody={lampTest || (dc && wingBodyR)} bleedTrip={lampTest || (dc && !!s.bleedTrip2)} />
          </div>
        </div>

        {/* BLEED 1 / APU / 2 */}
        <div className="mt-3 border-t border-[#1e201c]/70 pt-2">
          <div className="mb-1 flex items-center gap-2">
            <span className="h-px flex-1 bg-[#5a5548]" />
            <span className="font-mono text-[7px] font-bold uppercase tracking-[0.25em] text-[#b0a890]">BLEED</span>
            <span className="h-px flex-1 bg-[#5a5548]" />
          </div>
          <div className="grid grid-cols-3 items-start gap-2">
            <div className="flex justify-center">
              <VertToggle
                label="1"
                on={s.bleed1}
                onToggle={() => s.patch({ bleed1: !s.bleed1, bleedTrip1: !s.bleed1 ? s.bleedTrip1 : false })}
                lit={!!d.bleed1Available}
              />
            </div>
            <div className="flex justify-center">
              <VertToggle
                label="APU"
                on={s.apuBleed}
                onToggle={() => s.patch({ apuBleed: !s.apuBleed })}
                lit={dc && (s.apuBleedValve ?? 0) > 0.7}
              />
            </div>
            <div className="flex justify-center">
              <VertToggle
                label="2"
                on={s.bleed2}
                onToggle={() => s.patch({ bleed2: !s.bleed2, bleedTrip2: !s.bleed2 ? s.bleedTrip2 : false })}
                lit={!!d.bleed2Available}
              />
            </div>
          </div>
        </div>

        {/* Status */}
        <div className="mt-2 rounded border border-[#1e201c] bg-[#1c1e1a]/80 px-2 py-1 font-mono text-[6px] uppercase tracking-wide text-[#a09880]">
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-0.5">
            <span>ISO <span className="text-[#c8c0a8]">{s.isolation}</span></span>
            <span>L PACK <span className={d.packLFlow ? "text-green-400" : "text-[#5a5548]"}>{d.packLFlow ? "FLOW" : "OFF"}</span></span>
            <span>R PACK <span className={d.packRFlow ? "text-green-400" : "text-[#5a5548]"}>{d.packRFlow ? "FLOW" : "OFF"}</span></span>
            <span className="text-[#6a6558]">PACK SWITCH: OFF / ON (737-200)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
