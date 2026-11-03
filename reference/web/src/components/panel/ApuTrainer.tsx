import { useEffect, useState } from "react";
import { ApuDiagram } from "@/components/panel/ApuDiagram";
import { CaptionLight, Tape } from "@/components/panel/widgets";
import { useSimPick, useDerivedPick } from "@/lib/sim/store";
import type { ApuMaster } from "@/lib/sim/types";
import { cn } from "@/lib/utils";

/**
 * APU start-sequence trainer.
 *
 * Everything shown here is read from the live simulator (derive.ts), so the
 * sequence tracker, gauges and photo overlays always match the P5 APU switch
 * and the Electrical / Pneumatic trainers.
 *
 * The animated cutaway lives in ApuDiagram.tsx (art: public/apu/apu-diagram*.webp).
 */

type StepState = "done" | "active" | "pending" | "blocked";
interface Step {
  id: string;
  title: string;
  detail: string;
  done: boolean;
  blocked?: string;
}

export function ApuTrainer() {
  const s = useSimPick("apuBleed", "apuBleedValve", "apuDoor", "apuEgt", "apuFirePulled", "apuFuelValve", "apuLeftControl", "apuMaster", "apuOilPsi", "apuRightControl", "apuRpm", "apuStart50PercentEffectivityInstalled", "apuStarter", "battery", "faults", "ltTest", "patch");
  const d = useDerivedPick("apuAvailable", "apuGenOnBus", "apuLowOil", "batteryPower", "dcPower", "externalDcControl");
  const [auto, setAuto] = useState(false);
  // Annunciators on the trainer stay dark until essential DC (or lamp test) is available.
  const annBus = !!d.dcPower || !!d.batteryPower;
  const lampTest = !!s.ltTest && annBus;

  const doorJammed = s.faults.apuDoorJam && s.apuMaster !== "OFF" && s.apuFuelValve > 0.98 && s.apuDoor < 0.98;
  const running = d.apuAvailable;

  const setMaster = (m: ApuMaster) => {
    if (m === "START" && !(d.batteryPower || d.externalDcControl)) {
      s.patch({ apuMaster: "OFF" }, "APU START inhibited — no 28V DC starter/control power available.");
      return;
    }
    s.patch({ apuMaster: m }, m === "START" ? "APU START command — inlet door opening / starter lockout sequence initiated." : undefined);
  };

  // Demonstration mode: performs the same switch actions a crew would.
  useEffect(() => {
    if (!auto) return;
    if (d.apuAvailable || s.apuFirePulled || doorJammed) {
      setAuto(false);
      return;
    }
    if (!(d.batteryPower || d.externalDcControl)) {
      if (s.battery) setAuto(false); // battery fault — cannot continue
      else s.patch({ battery: true });
      return;
    }
    if (s.apuMaster === "OFF") {
      s.patch({ apuMaster: "ON" });
      return;
    }
    if (s.apuMaster === "ON" && s.apuDoor > 0.98 && s.apuRpm < 12) {
      s.patch({ apuMaster: "START" }, "APU START command — inlet door opening / starter lockout sequence initiated.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, s.battery, s.apuMaster, s.apuDoor, s.apuRpm, s.apuFirePulled, d.apuAvailable, d.batteryPower, doorJammed]);

  const steps: Step[] = [
    { id: "bat", title: "BAT switch ON", detail: "Battery / DC control power to the APU start circuit", done: d.batteryPower },
    { id: "fuel", title: "APU MASTER → ON: fuel valve opens", detail: "APU fuel shutoff valve opens", done: s.apuMaster !== "OFF" && s.apuFuelValve > 0.95 },
    {
      id: "door",
      title: "Inlet door fully open (~10 s)",
      detail: "Starter lockout relay holds the start until the door is open",
      done: s.apuDoor > 0.98,
      blocked: doorJammed ? "Inlet door jammed — start cannot complete" : undefined,
    },
    { id: "start", title: "APU MASTER → START (momentary)", detail: "Electric starter engages and motors the APU", done: s.apuStarter || s.apuRpm >= 12 },
    { id: "motor", title: `Starter to ~${s.apuStart50PercentEffectivityInstalled ? 50 : 35}%: start relay drops out`, detail: "Master returns to ON, starter disengages, turbine self-accelerates", done: s.apuRpm >= (s.apuStart50PercentEffectivityInstalled ? 50 : 35) },
    { id: "oil", title: "Oil pressure ≥ 55 psi", detail: "APU LOW OIL PRESSURE light goes out (normal while below 55 psi during start)", done: s.apuMaster !== "OFF" && s.apuOilPsi >= 55 },
    { id: "avail", title: "APU AVAILABLE at 95% RPM", detail: "APU may now supply electrical and pneumatic loads", done: d.apuAvailable },
    { id: "gen", title: "APU GEN on bus (L and/or R control)", detail: "Generator connects to the tie bus via BTB 1 / 2", done: d.apuGenOnBus },
    { id: "bleed", title: "APU BLEED valve open (~13 s)", detail: "Bleed air to the left pneumatic manifold", done: s.apuBleed && s.apuBleedValve > 0.7 },
  ];
  const activeIdx = steps.findIndex((st) => !st.done);
  const stateOf = (st: Step, i: number): StepState => (st.done ? "done" : st.blocked ? "blocked" : i === activeIdx ? "active" : "pending");

  const btn = "rounded border px-2 py-2 text-[9px] font-display uppercase tracking-wide hover:bg-panel disabled:cursor-not-allowed disabled:opacity-45";
  const on = "border-accent/60 bg-accent/10 text-fg";
  const off = "border-border bg-inset text-fg";

  return (
    <div>
      {s.apuFirePulled && (
        <div className="mb-2 rounded border border-warn/50 bg-warn/10 px-2 py-2 text-[9px] font-display uppercase tracking-wide text-warn">APU fire handle pulled — APU shut down, fuel and generator isolated</div>
      )}

      <ApuDiagram door={s.apuDoor} fuel={s.apuFuelValve} starter={s.apuStarter} rpm={s.apuRpm} egt={s.apuEgt} oilPsi={s.apuOilPsi} bleed={s.apuBleedValve} genOnBus={d.apuGenOnBus} masterOff={s.apuMaster === "OFF"} jam={doorJammed} />

      <div className="mt-2 grid grid-cols-3 gap-2">
        <Tape label="APU RPM" value={s.apuRpm} unit="%" max={100} tone="caution" />
        <Tape label="APU EGT" value={s.apuEgt} unit="°C" max={700} tone="caution" />
        <Tape label="OIL PRESS" value={s.apuOilPsi} unit="psi" max={120} tone="caution" />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <CaptionLight label="APU LOW OIL" on={lampTest || (annBus && !!d.apuLowOil)} tone="warn" />
        <CaptionLight label="STARTER ON" on={lampTest || (annBus && !!s.apuStarter)} tone="caution" />
        <CaptionLight label={d.apuAvailable ? "APU AVAIL 95%" : "APU NOT AVAIL"} on={lampTest || (annBus && !!d.apuAvailable)} tone="ok" />
        <CaptionLight label="APU GEN ON BUS" on={lampTest || (annBus && !!d.apuGenOnBus)} tone="elec" />
      </div>

      <div className="mt-3 border-t border-[#403b2d] pt-3">
        <div className="mb-2 text-[9px] font-display uppercase tracking-[0.14em] text-[#a9a188]">Start sequence</div>
        <ol className="flex flex-col gap-1.5">
          {steps.map((st, i) => {
            const state = stateOf(st, i);
            return (
              <li
                key={st.id}
                className={cn(
                  "flex items-start gap-2 rounded border px-2 py-1.5",
                  state === "done" && "border-ok/40 bg-ok/10",
                  state === "active" && "border-accent/60 bg-accent/10",
                  state === "blocked" && "border-warn/60 bg-warn/10",
                  state === "pending" && "border-border bg-inset opacity-70",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border font-mono text-[8px]",
                    state === "done" && "border-ok text-ok",
                    state === "active" && "animate-pulse border-accent text-accent",
                    state === "blocked" && "border-warn text-warn",
                    state === "pending" && "border-subtle text-subtle",
                  )}
                >
                  {state === "done" ? "✓" : state === "blocked" ? "!" : i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-[9px] uppercase tracking-wide text-fg">{st.title}</span>
                  <span className={cn("block text-[9px] leading-snug", state === "blocked" ? "text-warn" : "text-subtle")}>{st.blocked ?? st.detail}</span>
                </span>
              </li>
            );
          })}
        </ol>
        <p className="mt-2 text-[9px] leading-relaxed text-subtle">Steps 8–9 are load selections made after APU AVAILABLE. Timings are trainer values at 1×; starter cutout and start timeout follow the selected 35%/60 s or 50%/90 s effectivity.</p>
      </div>

      <div className="mt-3 border-t border-[#403b2d] pt-3">
        <div className="mb-2 text-[9px] font-display uppercase tracking-[0.14em] text-[#a9a188]">P5 / APU controls</div>
        <div className="mb-2 grid grid-cols-1 gap-2">
          <button className={cn(btn, s.apuStart50PercentEffectivityInstalled ? on : off)} onClick={() => s.patch({ apuStart50PercentEffectivityInstalled: !s.apuStart50PercentEffectivityInstalled, apuStartTimer: 0 }, !s.apuStart50PercentEffectivityInstalled ? "APU START EFFECTIVITY: 50% CUTOUT / 90-SECOND TIMER" : "APU START EFFECTIVITY: 35% CUTOUT / 60-SECOND TIMER")}>START EFFECTIVITY · {s.apuStart50PercentEffectivityInstalled ? "50% / 90 S MODIFIED" : "35% / 60 S BASELINE"}</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button className={cn(btn, s.battery ? on : off)} onClick={() => s.patch({ battery: !s.battery })}>BATTERY · {s.battery ? "ON" : "OFF"}</button>
          <button className={cn(btn, s.apuBleed ? on : off)} onClick={() => s.patch({ apuBleed: !s.apuBleed })}>APU BLEED · {s.apuBleed ? "ON" : "OFF"}</button>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(["OFF", "ON", "START"] as const).map((m) => (
            <button key={m} className={cn(btn, s.apuMaster === m ? on : off)} onClick={() => { setAuto(false); setMaster(m); }}>MASTER {m}</button>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button className={cn(btn, s.apuLeftControl ? on : off)} disabled={!d.apuAvailable} onClick={() => { const v = !s.apuLeftControl; s.patch({ apuLeftControl: v, apuGen: v || s.apuRightControl }); }}>APU GEN L · {s.apuLeftControl ? "ON" : "OFF"}</button>
          <button className={cn(btn, s.apuRightControl ? on : off)} disabled={!d.apuAvailable} onClick={() => { const v = !s.apuRightControl; s.patch({ apuRightControl: v, apuGen: s.apuLeftControl || v }); }}>APU GEN R · {s.apuRightControl ? "ON" : "OFF"}</button>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button className={cn(btn, "border-ok/40 bg-ok/10 text-fg")} disabled={auto || d.apuAvailable || s.apuFirePulled} onClick={() => setAuto(true)}>{auto ? "AUTO START RUNNING…" : "AUTO START (DEMO)"}</button>
          <button className={cn(btn, "border-warn/40 bg-warn/10 text-fg")} disabled={!running} onClick={() => { setAuto(false); s.patch({ apuMaster: "OFF", apuBleed: false, apuLeftControl: false, apuRightControl: false, apuGen: false }); }}>SHUTDOWN APU</button>
        </div>
        <p className="mt-2 font-mono text-[8px] uppercase text-subtle">START needs battery/control power · baseline 35% / 60 s; modified effectivity 50% / 90 s · GRD PWR inhibits APU GEN · FIRE handle: P8</p>
      </div>
    </div>
  );
}
