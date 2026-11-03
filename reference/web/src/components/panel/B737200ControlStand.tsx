import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useSimPick, useDerivedPick } from "@/lib/sim/store";
import { FlapLeverQuadrant, SpeedBrakeLever } from "@/components/panel/PedestalLevers";
import { cn } from "@/lib/utils";
import { GuardedRocker } from "@/components/panel/widgets";

const METAL = "rounded border border-[#5b6067] bg-[linear-gradient(180deg,#3a3e43,#1e2227)] shadow-[inset_0_1px_0_rgba(255,255,255,.12),0_3px_8px_rgba(0,0,0,.45)]";

function LeverSlot({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("relative flex h-48 w-12 items-end justify-center rounded border border-[#090b0e] bg-[#080a0d] p-1 shadow-[inset_0_0_12px_rgba(0,0,0,.9)]", className)}>{children}</div>;
}

function VerticalLever({ value, min, max, step, onChange, disabled, label }: {
  value: number; min: number; max: number; step: number; onChange: (v: number) => void; disabled?: boolean; label: string;
}) {
  return (
    <input
      aria-label={label}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className="absolute bottom-1 h-[180px] w-8 cursor-pointer appearance-none bg-transparent [writing-mode:vertical-lr] [direction:rtl] [&::-webkit-slider-runnable-track]:w-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[#111419] [&::-webkit-slider-thumb]:mt-[-2px] [&::-webkit-slider-thumb]:h-9 [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-sm [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-[#090a0c] [&::-webkit-slider-thumb]:bg-[linear-gradient(90deg,#858a8f,#3e4247,#888d92)] [&::-webkit-slider-thumb]:shadow-[0_2px_5px_rgba(0,0,0,.7)]"
    />
  );
}

function LeverLabel({ children }: { children: ReactNode }) {
  return <div className="mt-1 text-center font-mono text-[8px] font-bold tracking-[.12em] text-[#d7d0bd]">{children}</div>;
}

function Toggle({ label, on, onChange, guard }: { label: string; on: boolean; onChange: (v: boolean) => void; guard?: boolean }) {
  return (
    <button type="button" aria-label={label} onClick={() => onChange(!on)} className="flex flex-col items-center gap-1 text-[7px] font-mono uppercase text-[#c9c1ad]">
      <span className={cn("relative h-11 w-7 rounded border border-[#555a60] bg-[#111419]", guard && "ring-1 ring-[#6b5b3e]") }>
        <span className={cn("absolute left-1/2 h-5 w-3 -translate-x-1/2 rounded-sm border border-[#090a0c] bg-[linear-gradient(90deg,#777b80,#34383d,#777b80)] shadow-[0_2px_4px_rgba(0,0,0,.7)] transition-all", on ? "top-1" : "bottom-1")} />
      </span>
      <span>{label}</span>
    </button>
  );
}

function Rotary({ label, value, values, onChange }: { label: string; value: number; values: string[]; onChange: (v: number) => void }) {
  const idx = Math.max(0, Math.min(values.length - 1, Math.round(value)));
  const angle = -55 + idx * (110 / Math.max(1, values.length - 1));
  return (
    <button type="button" aria-label={label} onClick={() => onChange((idx + 1) % values.length)} className="flex flex-col items-center gap-1 text-[7px] font-mono uppercase text-[#c9c1ad]">
      <span className="relative h-10 w-10 rounded-full border border-[#646a70] bg-[radial-gradient(circle,#41464b_0,#1b1f23_62%,#080a0d_64%)] shadow-[inset_0_1px_3px_rgba(255,255,255,.15),0_2px_5px_rgba(0,0,0,.6)]">
        <span className="absolute left-1/2 top-1/2 h-4 w-[3px] origin-[50%_90%] -translate-x-1/2 -translate-y-[90%] rounded-full bg-[#d5cdb8]" style={{ transform: `translate(-50%,-90%) rotate(${angle}deg)` }} />
      </span>
      <span>{label}: {values[idx]}</span>
    </button>
  );
}

function FuelCutoffLever({ label, idle, onChange }: { label: string; idle: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" aria-label={label} onClick={() => onChange(!idle)} className="flex flex-col items-center gap-1">
      <div className="relative h-16 w-8 rounded border border-[#090b0d] bg-[#090b0d] shadow-[inset_0_0_8px_rgba(0,0,0,.8)]">
        <div className={cn("absolute left-1/2 h-10 w-5 -translate-x-1/2 rounded-sm border border-[#111] bg-[linear-gradient(90deg,#777,#34383c,#777)] shadow-[0_2px_5px_rgba(0,0,0,.8)]", idle ? "top-1" : "bottom-1")} />
      </div>
      <span className="font-mono text-[7px] text-[#d7d0bd]">{label}</span>
      <span className="font-mono text-[6px] text-subtle">{idle ? "IDLE" : "CUTOFF"}</span>
    </button>
  );
}

function ControlStandInner({ compact = false, spoilerSwitches = false }: { compact?: boolean; spoilerSwitches?: boolean } = {}) {
  const s = useSimPick("engine1FirePulled", "engine2FirePulled", "lever1", "lever2", "parkingBrake", "patch", "rev1", "rev2", "spoilerA", "spoilerB", "stabTrimCutoutA", "stabTrimCutoutB", "throttle1", "throttle2", "wow");
  const d = useDerivedPick("eng1Running", "eng2Running", "flightControlAAvailable", "flightControlBAvailable", "hydA", "hydB", "thrustReverser1Active", "thrustReverser2Active");
  const hydAok = d.hydA > 1500 && d.flightControlAAvailable;
  const hydBok = d.hydB > 1500 && d.flightControlBAvailable;
  const pedestalLabel = useMemo(() => `${Math.round(s.throttle1 * 100)} / ${Math.round(s.throttle2 * 100)}%`, [s.throttle1, s.throttle2]);

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-[#4a4f56] bg-[#202328] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.04),0_8px_25px_rgba(0,0,0,.28)]">
        <div className="mb-2 flex items-end justify-between gap-3">
          <div>
            <div className="font-display text-[10px] uppercase tracking-[.18em] text-[#b9af98]">CENTER CONTROL STAND · 737-200</div>
            <div className="font-display text-lg font-semibold text-fg">Thrust quadrant / flight controls</div>
          </div>
          <div className="font-mono text-[8px] uppercase text-subtle">THRUST {pedestalLabel}</div>
        </div>
        <div className="rounded-lg border border-[#0a0c0f] bg-[linear-gradient(180deg,#282c31,#111419)] p-3 shadow-[inset_0_0_30px_rgba(0,0,0,.6)]">
          <div className={cn("grid grid-cols-[auto_1fr_auto]", compact ? "gap-2" : "gap-3")}>
            <div className="flex items-end justify-center" aria-label="Speed brake lever"><SpeedBrakeLever /></div>

            <div className="rounded border border-[#484d52] bg-[#191c20] p-3">
              <div className={cn("grid grid-cols-2", compact ? "gap-3" : "gap-6")}>
                {[1, 2].map((n) => {
                  const throttle = n === 1 ? s.throttle1 : s.throttle2;
                  const running = n === 1 ? d.eng1Running : d.eng2Running;
                  const commandedRev = n === 1 ? s.rev1 : s.rev2;
                  const rev = n === 1 ? d.thrustReverser1Active : d.thrustReverser2Active;
                  return (
                    <div key={n} className="flex flex-col items-center">
                      <LeverSlot className={compact ? "h-40" : "h-52"}>
                        <VerticalLever label={`Engine ${n} thrust lever`} value={throttle} min={0} max={1} step={0.01} onChange={(v) => s.patch(n === 1 ? { throttle1: v } : { throttle2: v })} />
                        <button type="button" aria-label={`Engine ${n} reverse lever`} onClick={() => {
                          const canDeploy = s.wow && running && throttle <= 0.05 && !(n === 1 ? s.engine1FirePulled : s.engine2FirePulled) && d.hydA > 1500;
                          if (!commandedRev && !canDeploy) {
                            s.patch({}, `ENG ${n} REVERSER DEPLOY INHIBITED — ground/engine/fire/hydraulic interlock not satisfied.`);
                            return;
                          }
                          s.patch(n === 1 ? { rev1: !commandedRev } : { rev2: !commandedRev }, `ENG ${n} REVERSER ${commandedRev ? "STOW" : "DEPLOY"}`);
                        }} className={cn("absolute -top-2 h-10 w-4 rounded border border-[#15171a] bg-[linear-gradient(90deg,#676c71,#2f3338,#676c71)] shadow-[0_2px_4px_rgba(0,0,0,.8)]", rev ? "-translate-y-4" : "")}/>
                      </LeverSlot>
                      <LeverLabel>THRUST {n}</LeverLabel>
                      <div className="mt-1 flex gap-1"><span className={cn("rounded border px-1 py-0.5 font-mono text-[6px]", running ? "border-ok/60 text-ok" : "border-border text-subtle")}>{running ? "RUN" : "OFF"}</span><span className={cn("rounded border px-1 py-0.5 font-mono text-[6px]", rev ? "border-warn/60 text-warn" : "border-border text-subtle")}>REV</span></div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex items-end justify-center gap-12 border-t border-[#383d43] pt-3">
                <FuelCutoffLever label="ENG 1 FUEL" idle={s.lever1} onChange={(v) => s.patch({ lever1: v })} />
                <FuelCutoffLever label="ENG 2 FUEL" idle={s.lever2} onChange={(v) => s.patch({ lever2: v })} />
              </div>
              <div className="mt-3 flex justify-center"><div className="rounded border border-[#5c5f62] bg-[#111317] px-3 py-1 font-mono text-[6px] tracking-[.15em] text-[#bdb5a2]">IDLE · THRUST LEVERS · FUEL CUTOFF · REVERSE</div></div>
            </div>

            <div className="flex items-end justify-center" aria-label="Flap lever"><FlapLeverQuadrant /></div>
          </div>

          <div className={cn("mt-3 items-end gap-3 border-t border-[#383d43] pt-3", spoilerSwitches ? "flex flex-wrap justify-between" : "grid grid-cols-[1fr_auto_1fr]")}>
            <div className="flex items-center gap-3">
              <div className="rounded border border-[#5c6065] bg-[#171a1e] px-3 py-2 font-mono text-[7px] text-[#d7d0bd]">PARKING BRAKE</div>
              <button type="button" aria-label="Parking brake" onClick={() => s.patch({ parkingBrake: !s.parkingBrake })} className={cn("h-14 w-7 rounded-full border border-[#111317] bg-[linear-gradient(90deg,#7a7e82,#34383d,#7a7e82)] shadow-[0_3px_6px_rgba(0,0,0,.8)]", s.parkingBrake ? "translate-y-2" : "")}/>
              <span className="font-mono text-[7px] text-subtle">{s.parkingBrake ? "SET / PULLED" : "RELEASED"}</span>
            </div>
            <div className="flex items-center gap-5">
              <Toggle label="STAB TRIM CUTOUT A" on={s.stabTrimCutoutA} onChange={(v) => s.patch({ stabTrimCutoutA: v }, `STAB TRIM CUTOUT A → ${v ? "CUTOUT" : "NORMAL"}`)} guard />
              <Toggle label="STAB TRIM CUTOUT B" on={s.stabTrimCutoutB} onChange={(v) => s.patch({ stabTrimCutoutB: v }, `STAB TRIM CUTOUT B → ${v ? "CUTOUT" : "NORMAL"}`)} guard />
            </div>
            {spoilerSwitches && (
              <div className="flex items-end gap-3">
                <GuardedRocker label="SPOILER A" on={s.spoilerA} lit={hydAok && s.spoilerA} onChange={(v) => s.patch({ spoilerA: v })} />
                <GuardedRocker label="SPOILER B" on={s.spoilerB} lit={hydBok && s.spoilerB} onChange={(v) => s.patch({ spoilerB: v })} />
              </div>
            )}
            <div className="flex justify-end gap-3">
              <div className="rounded border border-[#3d4248] bg-[#111317] px-3 py-2 text-center font-mono text-[7px] text-[#bdb5a2]">STAB TRIM<br/><span className="text-[6px] text-subtle">INDICATION / WHEEL NOT YET MODELED</span></div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export function B737200ControlStand({ compact = false, spoilerSwitches = false, scaleToFit = false }: { compact?: boolean; spoilerSwitches?: boolean; scaleToFit?: boolean } = {}) {
  if (!scaleToFit) return <ControlStandInner compact={compact} spoilerSwitches={spoilerSwitches} />;
  return <ScaledStand spoilerSwitches={spoilerSwitches} />;
}

// Renders the full-size stand at a fixed design width and scales it down to fit its
// container, so it can sit small beside other panels (side by side, even on phones).
const DESIGN_W = 1040;
const MAX_SCALE = 0.5;
function ScaledStand({ spoilerSwitches }: { spoilerSwitches: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [m, setM] = useState({ scale: 0.3, h: 0 });
  useEffect(() => {
    const upd = () => {
      const w = wrap.current?.clientWidth || 0;
      const scale = Math.min(MAX_SCALE, w / DESIGN_W) || 0.3;
      setM({ scale, h: (inner.current?.offsetHeight || 0) * scale });
    };
    upd();
    const ro = new ResizeObserver(upd);
    if (wrap.current) ro.observe(wrap.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={wrap} data-scaled-panel className="relative w-full overflow-hidden panel-scroll" style={{ height: m.h || undefined }}>
      <div ref={inner} style={{ width: DESIGN_W, transform: `scale(${m.scale})`, transformOrigin: "top left" }}>
        <ControlStandInner spoilerSwitches={spoilerSwitches} />
      </div>
    </div>
  );
}
