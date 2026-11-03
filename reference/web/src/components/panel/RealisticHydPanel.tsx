/**
 * Realistic 737-200 Hydraulic Power panel — fixed layout.
 *
 *   [ SYS A pressure ]          [ SYS B pressure ]
 *   [ ENG 1 ] [ ELEC 1 ]        [ ENG 2 ] [ ELEC 2 ]
 *   [ LOW PRESS / LOW QTY lights ]
 *   [ STANDBY HYD  AUTO/ON/OFF ]
 *   [ FLT CTRL A/B guarded ]  [ SPOILER A/B ]
 */

import { useSimPick, useDerivedPick } from "@/lib/sim/store";
import type { StbyHyd } from "@/lib/sim/types";
import { cn } from "@/lib/utils";
import { Cap, OnOffToggle, RotaryKnob, ToggleLever } from "./OverheadParts";

function CapLight({
  label,
  on,
  tone = "caution",
}: {
  label: string;
  on: boolean;
  tone?: "caution" | "ok" | "warn" | "elec";
}) {
  const colors = {
    caution: on ? "bg-amber-400 text-black shadow-[0_0_6px_#fbbf24]" : "bg-[#2a2410] text-[#5a5030]",
    ok: on ? "bg-green-400 text-black shadow-[0_0_6px_#4ade80]" : "bg-[#0f2a14] text-[#2a5a30]",
    warn: on ? "bg-red-500 text-white shadow-[0_0_6px_#ef4444]" : "bg-[#2a1010] text-[#5a2020]",
    elec: on ? "bg-blue-400 text-black shadow-[0_0_6px_#60a5fa]" : "bg-[#0f1a2a] text-[#2a3a5a]",
  };
  return (
    <div
      className={cn(
        "min-w-[52px] rounded-[2px] border border-[#1a1a18] px-1 py-0.5 text-center font-mono text-[6px] font-bold uppercase leading-tight",
        colors[tone],
      )}
    >
      {label}
    </div>
  );
}

function VertRocker({
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
    <OnOffToggle label={label} on={on} onToggle={onToggle} lit={lit} litTone="green" onLabel={onLabel} offLabel={offLabel} disabled={disabled} />
  );
}

function GuardedRocker({
  label,
  on,
  onToggle,
  lit,
  onLabel = "ON",
  offLabel = "OFF",
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
  lit?: boolean;
  onLabel?: string;
  offLabel?: string;
}) {
  return (
    <OnOffToggle label={label} on={on} onToggle={onToggle} lit={lit} litTone="green" onLabel={onLabel} offLabel={offLabel} guarded />
  );
}

/** Animated pressure gauge 0–4000 psi */
function PressGauge({ label, psi }: { label: string; psi: number }) {
  const t = Math.max(0, Math.min(4000, psi));
  const angle = -120 + (t / 4000) * 240;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="font-mono text-[6px] font-bold uppercase tracking-wider text-[#b0a890]">{label}</span>
      <div className="relative h-16 w-16">
        <div className="absolute inset-0 rounded-full border-2 border-[#1a1a18] bg-[#0a0a08] shadow-[inset_0_2px_8px_rgba(0,0,0,0.9)]" />
        {[0, 1000, 2000, 3000, 4000].map((v) => {
          const a = -120 + (v / 4000) * 240;
          const rad = (a * Math.PI) / 180;
          const x = 50 + Math.sin(rad) * 34;
          const y = 50 - Math.cos(rad) * 34;
          return (
            <span
              key={v}
              className="absolute font-mono text-[5px] text-[#7a7568]"
              style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }}
            >
              {v === 0 ? "0" : `${v / 1000}k`}
            </span>
          );
        })}
        <div
          className="absolute left-1/2 top-1/2 origin-bottom transition-transform duration-500"
          style={{
            width: 2,
            height: "36%",
            marginLeft: -1,
            marginTop: "-36%",
            background: "linear-gradient(to top, #a03018, #e07030)",
            transform: `rotate(${angle}deg)`,
            borderRadius: 1,
          }}
        />
        <div className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#2a2a25] border border-[#555]" />
        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 font-mono text-[5px] text-[#8a8578]">
          PSI
        </span>
      </div>
      <span className="font-mono text-[7px] text-[#c8c0a8]">{Math.round(psi)}</span>
    </div>
  );
}

/** 3-position selector: a toggle lever for up to 3 positions, a rotary knob for more. */
function ThreePos({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
}) {
  if (options.length > 3) {
    return <RotaryKnob label={label} options={options} value={value} onChange={onChange} size={84} tone="black" />;
  }
  return <ToggleLever label={label} options={options} value={value} onChange={onChange} />;
}

export function RealisticHydPanel() {
  const s = useSimPick("elecHyd1", "elecHyd2", "engHyd1", "engHyd2", "fltCtrlA", "fltCtrlB", "hydAPress", "hydAQty", "hydBPress", "hydBQty", "ltTest", "patch", "spoilerA", "spoilerB", "stbyHyd");
  const d = useDerivedPick("dcPower", "flightControlAAvailable", "flightControlBAvailable", "hydA", "hydALow", "hydAPump1On", "hydAPump2On", "hydAQty", "hydB", "hydBLow", "hydBPump1On", "hydBPump2On", "hydBQty", "hydS", "hydSQty");

  const hydA = Number(d.hydA ?? s.hydAPress ?? 0);
  const hydB = Number(d.hydB ?? s.hydBPress ?? 0);
  const qtyA = Number(d.hydAQty ?? s.hydAQty ?? 100);
  const qtyB = Number(d.hydBQty ?? s.hydBQty ?? 100);
  const dcOn = !!d.dcPower;
  const lampTest = !!s.ltTest && dcOn;
  const stbyDemand = s.stbyHyd === "ON" || hydA < 1500 || hydB < 1500;

  return (
    <div
      className="relative w-full min-w-0 max-w-full overflow-x-auto overflow-y-hidden rounded-md border-2 border-[#1a1c18] shadow-xl panel-scroll" data-panel-scroll data-keep-cols
      style={{
        background: "linear-gradient(180deg, #3e413b 0%, #32352f 45%, #2a2c28 100%)",
        maxWidth: "min(100%, 460px)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      <div className="relative border-b border-[#1e201c] bg-[#2e312c]/90 px-3 py-1">
        <h2 className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#e0d8c0]">
          HYDRAULIC POWER · P5
        </h2>
      </div>

      <div className="relative px-3 py-3">
        {/* Pressure gauges */}
        <div className="mb-3 grid grid-cols-2 gap-4">
          <div className="flex justify-center">
            <PressGauge label="SYSTEM A" psi={hydA} />
          </div>
          <div className="flex justify-center">
            <PressGauge label="SYSTEM B" psi={hydB} />
          </div>
        </div>

        {/* Hydraulic pumps — real layout: ENG 1 · ELEC 2 | ELEC 1 · ENG 2, lights above, A / B below */}
        <div className="border-t border-[#1e201c]/70 pt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex justify-center gap-2">
              <div className="w-[52px]" />
              <Cap label="OVERHEAT" on={lampTest} tone="caution" />
            </div>
            <div className="flex justify-center gap-2">
              <Cap label="OVERHEAT" on={lampTest} tone="caution" />
              <div className="w-[52px]" />
            </div>
          </div>
          <div className="mt-1 grid grid-cols-4 gap-1">
            <Cap label={"LOW\nPRESSURE"} on={lampTest || (dcOn && s.engHyd1 && !d.hydAPump1On)} tone="caution" />
            <Cap label={"LOW\nPRESSURE"} on={lampTest || (dcOn && s.elecHyd2 && !d.hydAPump2On)} tone="caution" />
            <Cap label={"LOW\nPRESSURE"} on={lampTest || (dcOn && s.elecHyd1 && !d.hydBPump1On)} tone="caution" />
            <Cap label={"LOW\nPRESSURE"} on={lampTest || (dcOn && s.engHyd2 && !d.hydBPump2On)} tone="caution" />
          </div>
          <div className="mt-2 grid grid-cols-4 place-items-center gap-1">
            <OnOffToggle label="ENG 1" on={s.engHyd1} onToggle={() => s.patch({ engHyd1: !s.engHyd1 })} lit={!!d.hydAPump1On} />
            <OnOffToggle label="ELEC 2" on={s.elecHyd2} onToggle={() => s.patch({ elecHyd2: !s.elecHyd2 })} lit={!!d.hydAPump2On} />
            <OnOffToggle label="ELEC 1" on={s.elecHyd1} onToggle={() => s.patch({ elecHyd1: !s.elecHyd1 })} lit={!!d.hydBPump1On} />
            <OnOffToggle label="ENG 2" on={s.engHyd2} onToggle={() => s.patch({ engHyd2: !s.engHyd2 })} lit={!!d.hydBPump2On} />
          </div>
          <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2 font-mono text-[8px] font-bold text-[#d0c8b0]">
            <span className="text-center">A</span>
            <span className="text-[7px] tracking-[0.2em] text-[#b0a890]">HYD PUMPS</span>
            <span className="text-center">B</span>
          </div>
          <div className="mt-2 flex flex-wrap justify-center gap-1">
            <Cap label={"SYS A\nLOW QTY"} on={lampTest || (dcOn && (!!d.hydALow || qtyA < 20))} tone="caution" />
            <Cap label={"SYS B\nLOW QTY"} on={lampTest || (dcOn && (!!d.hydBLow || qtyB < 20))} tone="caution" />
          </div>
        </div>

        {/* Standby + flight controls */}
        <div className="mt-3 flex flex-wrap items-start justify-center gap-4 border-t border-[#1e201c]/70 pt-2">
          <div className="flex flex-col items-center gap-1">
            <Cap label={"STBY HYD\nLOW QTY"} on={lampTest || (dcOn && Number(d.hydSQty ?? 100) < 20)} tone="caution" />
            <Cap label={"STBY HYD\nLOW PRESS"} on={lampTest || (dcOn && s.stbyHyd !== "OFF" && Number(d.hydS ?? 0) < 1500 && stbyDemand)} tone="caution" />
          </div>
          <ThreePos
            label="STANDBY HYD"
            value={s.stbyHyd}
            options={[
              { id: "AUTO", label: "AUTO" },
              { id: "ON", label: "ON" },
              { id: "OFF", label: "OFF" },
            ]}
            onChange={(id) => s.patch({ stbyHyd: id as StbyHyd })}
          />
          <GuardedRocker
            label="FLT CTRL A"
            on={s.fltCtrlA}
            onToggle={() => s.patch({ fltCtrlA: !s.fltCtrlA })}
            lit={!!d.flightControlAAvailable}
          />
          <GuardedRocker
            label="FLT CTRL B"
            on={s.fltCtrlB}
            onToggle={() => s.patch({ fltCtrlB: !s.fltCtrlB })}
            lit={!!d.flightControlBAvailable}
          />
          <GuardedRocker
            label="SPOILER A"
            on={s.spoilerA}
            onToggle={() => s.patch({ spoilerA: !s.spoilerA })}
            lit={!!d.flightControlAAvailable && s.spoilerA}
          />
          <GuardedRocker
            label="SPOILER B"
            on={s.spoilerB}
            onToggle={() => s.patch({ spoilerB: !s.spoilerB })}
            lit={!!d.flightControlBAvailable && s.spoilerB}
          />
        </div>

        {/* Qty readout */}
        <div className="mt-2 rounded border border-[#1e201c] bg-[#1c1e1a]/80 px-2 py-1 font-mono text-[6px] uppercase tracking-wide text-[#a09880]">
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-0.5">
            <span>
              A QTY <span className="text-[#c8c0a8]">{Math.round(qtyA)}%</span>
            </span>
            <span>
              B QTY <span className="text-[#c8c0a8]">{Math.round(qtyB)}%</span>
            </span>
            <span>
              A PRESS{" "}
              <span className={hydA > 1500 ? "text-green-400" : "text-[#5a5548]"}>
                {Math.round(hydA)} PSI
              </span>
            </span>
            <span>
              B PRESS{" "}
              <span className={hydB > 1500 ? "text-green-400" : "text-[#5a5548]"}>
                {Math.round(hydB)} PSI
              </span>
            </span>
          </div>
        </div>
      </div>

      <div className="border-t border-[#1e201c] bg-[#252722]/70 px-2 py-1">
        <p className="font-mono text-[6px] leading-relaxed text-[#7a7568]">
          Fixed hydraulic layout · SYS A/B pressure gauges · ENG/ELEC pumps · Standby · FLT CTRL / Spoiler guards
        </p>
      </div>
    </div>
  );
}
