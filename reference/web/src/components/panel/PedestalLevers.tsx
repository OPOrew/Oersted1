import { useRef, type ReactNode } from "react";
import { useSimPick } from "@/lib/sim/store";
import type { SpeedBrake } from "@/lib/sim/types";
import { cn } from "@/lib/utils";

/**
 * Centre-pedestal FLAP lever and SPEED BRAKE lever, after the 737-200 photos:
 *  - flap lever: cream "FLAP" grip moving in a gated black quadrant, detents 0 1 2 5 10 15 25 30 40
 *  - speed brake lever: metal arm with a cream grip, DOWN / ARMED / FLIGHT DETENT / UP
 * Both are dragged (or tapped on a detent) and snap to the nearest gate.
 */

const PAD = 18;

function DetentGate({
  labels, index, onSelect, height, handle, plateClass, labelClass,
}: {
  labels: string[]; index: number; onSelect: (i: number) => void; height: number;
  handle: ReactNode; plateClass?: string; labelClass?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const n = labels.length;
  const y = (i: number) => PAD + (i * (height - 2 * PAD)) / Math.max(1, n - 1);
  const pick = (clientY: number) => {
    const r = track.current?.getBoundingClientRect();
    if (!r) return;
    const rel = clientY - r.top;
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(y(i) - rel) < Math.abs(y(best) - rel)) best = i;
    if (best !== index) onSelect(best);
  };
  return (
    <div className="relative flex" style={{ height }}>
      {/* engraved scale plate with a notch at every gate */}
      <div className={cn("relative w-11 rounded-l-sm border border-[#0a0b0d] bg-[#0c0d10]", plateClass)}>
        {labels.map((l, i) => (
          <button key={l + i} type="button" onClick={() => onSelect(i)} aria-label={`Select ${l}`}
            className={cn("absolute right-2 -translate-y-1/2 font-display text-[11px] font-semibold leading-none tracking-wide hover:text-white", i === index ? "text-white" : "text-[#cfc9b6]", labelClass)}
            style={{ top: y(i) }}>
            {l}
          </button>
        ))}
        {labels.map((l, i) => <span key={`t${l}${i}`} className="absolute right-0 h-px w-1.5 bg-[#cfc9b6]/70" style={{ top: y(i) }} />)}
      </div>
      {/* toothed gate rail */}
      <div className="relative w-3 border-y border-[#0a0b0d] bg-[#5a5f64]" style={{ backgroundImage: "repeating-linear-gradient(180deg,transparent 0 6px,rgba(0,0,0,.45) 6px 8px)" }} />
      {/* travel slot + handle */}
      <div
        ref={track}
        className="relative w-24 touch-none select-none rounded-r-sm border border-[#0a0b0d] bg-[#16181c] shadow-[inset_0_0_10px_rgba(0,0,0,.85)]"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pick(e.clientY); }}
        onPointerMove={(e) => { if (e.buttons === 1) pick(e.clientY); }}
      >
        <div className="absolute inset-y-3 left-2 w-2 rounded-full bg-[#050608] shadow-[inset_0_0_4px_#000]" />
        <div className="absolute left-0 -translate-y-1/2 transition-[top] duration-200 ease-out" style={{ top: y(index) }}>{handle}</div>
      </div>
    </div>
  );
}

export function FlapLeverQuadrant() {
  const s = useSimPick("flapPos", "flaps", "patch");
  const values = [0, 1, 2, 5, 10, 15, 25, 30, 40];
  const idx = values.reduce((best, v, i) => (Math.abs(v - s.flaps) < Math.abs(values[best] - s.flaps) ? i : best), 0);
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="font-mono text-[8px] font-bold tracking-[.14em] text-[#d7d0bd]">FLAP</div>
      <DetentGate
        height={300}
        labels={values.map(String)}
        index={idx}
        onSelect={(i) => s.patch({ flaps: values[i] }, `FLAP LEVER ${values[i] === 0 ? "UP" : values[i]}`)}
        handle={
          <div role="slider" aria-label="Flap lever" aria-valuenow={values[idx]} className="flex items-center">
            <span className="h-3 w-5 bg-[linear-gradient(180deg,#8d9297,#4a4e53,#8d9297)]" />
            <span className="flex h-12 w-[4.2rem] items-center justify-center rounded-md border border-[#9b9577] bg-[linear-gradient(180deg,#f1ecd8,#d3ccb2)] font-display text-[11px] font-semibold tracking-widest text-[#6d6850] shadow-[0_4px_8px_rgba(0,0,0,.7),inset_0_1px_0_rgba(255,255,255,.7)]">FLAP</span>
          </div>
        }
      />
      <div className="flex gap-1.5 font-mono text-[7px] uppercase">
        <span className="rounded border border-[#5c654e] bg-[#1a2018] px-1.5 py-1 text-[#b9d18d]">LEVER {values[idx] === 0 ? "UP" : values[idx]}</span>
        <span className="rounded border border-[#3d4248] bg-[#111317] px-1.5 py-1 text-[#bdb5a2]">TE {Math.round(s.flapPos ?? s.flaps)}</span>
      </div>
    </div>
  );
}

export function SpeedBrakeLever() {
  const s = useSimPick("patch", "speedBrake");
  const values: SpeedBrake[] = ["DOWN", "ARMED", "FLIGHT", "UP"];
  const names = ["DOWN", "ARM", "FLT DET", "UP"];
  const idx = Math.max(0, values.indexOf(s.speedBrake));
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="font-mono text-[8px] font-bold tracking-[.14em] text-[#d7d0bd]">SPEED BRAKE</div>
      <DetentGate
        height={220}
        labels={names}
        index={idx}
        labelClass="text-[8px]"
        plateClass="w-14"
        onSelect={(i) => s.patch({ speedBrake: values[i] }, `SPEED BRAKE ${values[i]}`)}
        handle={
          <div role="slider" aria-label="Speed brake lever" aria-valuetext={values[idx]} className="flex items-center">
            <span className="h-2.5 w-7 bg-[linear-gradient(180deg,#b9bdc0,#6c7074,#b9bdc0)] shadow-[0_2px_3px_rgba(0,0,0,.7)]" />
            <span className="flex h-9 w-[3.6rem] items-center justify-center rounded-[5px] border border-[#9b9577] bg-[linear-gradient(180deg,#f1ecd8,#d3ccb2)] px-1 text-center font-display text-[8px] font-bold leading-tight tracking-wide text-[#5d5942] shadow-[0_4px_8px_rgba(0,0,0,.7),inset_0_1px_0_rgba(255,255,255,.7)]">SPEED<br />BRAKE</span>
          </div>
        }
      />
      <span className={cn("rounded border px-1.5 py-1 font-mono text-[7px] uppercase", s.speedBrake === "ARMED" ? "border-ok/60 bg-[#10241a] text-ok" : s.speedBrake === "DOWN" ? "border-[#3d4248] bg-[#111317] text-[#bdb5a2]" : "border-caution/60 bg-[#2a2210] text-caution")}>
        {s.speedBrake === "ARMED" ? "ARMED" : s.speedBrake === "FLIGHT" ? "FLIGHT DETENT" : s.speedBrake}
      </span>
    </div>
  );
}
