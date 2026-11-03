import { useState, type ReactNode } from "react";
import { useDerived, useSim } from "@/lib/sim/store";
import { CaptionLight, ControlSlider } from "@/components/panel/widgets";
import { LIGHT_CBS, cbPulled, lightFailed, lightsControlsInitial, toggleInList, type LightStatus } from "@/lib/sim/lights";
import type { SimState } from "@/lib/sim/types";
import { cn } from "@/lib/utils";
import { ExteriorLightsDiagram } from "@/components/panel/ExteriorLightsDiagram";

const COLORS = { white: "#f6f1df", red: "#ff4d4d", green: "#35e08c", amber: "#ffb340" } as const;
type Tab = "controls" | "aircraft" | "deck" | "components";
type Patch = Partial<SimState>;

/** One-tap light configurations for typical phases of flight. */
const PRESETS: { name: string; patch: Patch }[] = [
  { name: "All off", patch: { ...lightsControlsInitial } },
  { name: "Before start", patch: { ...lightsControlsInitial, ltAntiCol: true, ltPosition: "STEADY", ltDome: "DIM", ltPanelOvhd: 0.5, ltPanelCapt: 0.5, ltPanelFo: 0.5, ltPanelPed: 0.5, ltNoSmoking: "ON", ltSeatBelt: "ON", ltEmergency: "ARMED", ltCabin: "BRT", ltEntry: true } },
  { name: "Taxi", patch: { ...lightsControlsInitial, ltAntiCol: true, ltPosition: "STEADY", ltTaxi: true, ltTurnoffL: true, ltTurnoffR: true, ltLogo: true, ltNoSmoking: "ON", ltSeatBelt: "ON", ltEmergency: "ARMED", ltCabin: "DIM" } },
  { name: "Takeoff", patch: { ...lightsControlsInitial, ltAntiCol: true, ltPosition: "STROBE_STEADY", ltRetL: "ON", ltRetR: "ON", ltFixedL: true, ltFixedR: true, ltTurnoffL: true, ltTurnoffR: true, ltLogo: true, ltNoSmoking: "ON", ltSeatBelt: "ON", ltEmergency: "ARMED", ltCabin: "DIM" } },
  { name: "Cruise", patch: { ...lightsControlsInitial, ltAntiCol: true, ltPosition: "STROBE_STEADY", ltLogo: true, ltNoSmoking: "AUTO", ltSeatBelt: "AUTO", ltEmergency: "ARMED", ltCabin: "BRT", ltEntry: true, ltGalley: true } },
  { name: "Landing", patch: { ...lightsControlsInitial, ltAntiCol: true, ltPosition: "STROBE_STEADY", ltRetL: "ON", ltRetR: "ON", ltFixedL: true, ltFixedR: true, ltTurnoffL: true, ltTurnoffR: true, ltLogo: true, ltNoSmoking: "AUTO", ltSeatBelt: "AUTO", ltEmergency: "ARMED", ltCabin: "DIM" } },
  { name: "Emer lts test", patch: { ltEmergency: "ON" } },
];

function Dot({ l, size = 12 }: { l: Pick<LightStatus, "lit" | "level" | "color" | "flash">; size?: number }) {
  const c = COLORS[l.color];
  return (
    <span
      className={cn("inline-block shrink-0 rounded-full border border-black/40", l.lit && l.flash && "animate-pulse")}
      style={{ width: size, height: size, background: l.lit ? c : "#23272c", opacity: l.lit ? 0.4 + 0.6 * l.level : 1, boxShadow: l.lit ? `0 0 ${4 + 10 * l.level}px ${c}` : "none" }}
    />
  );
}

function Box({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded border border-border bg-panel/30 p-2", className)}>
      <div className="mb-1.5 font-display text-[9px] font-semibold uppercase tracking-[0.16em] text-subtle">{title}</div>
      {children}
    </div>
  );
}

function Tog({ label, on, detail, onClick, onText = "ON", offText = "OFF" }: { label: string; on: boolean; detail?: string; onClick: () => void; onText?: string; offText?: string }) {
  return (
    <button type="button" onClick={onClick} className={cn("rounded border p-1.5 text-left transition hover:bg-panel", on ? "border-ok/50 bg-white/[.05]" : "border-border bg-inset")}>
      <div className="flex items-center justify-between gap-1">
        <span className="truncate font-display text-[8px] font-semibold uppercase tracking-[.1em] text-fg">{label}</span>
        <span className={cn("font-mono text-[8px]", on ? "text-ok" : "text-subtle")}>{on ? onText : offText}</span>
      </div>
      {detail && <div className="mt-0.5 truncate font-mono text-[7px] uppercase text-subtle">{detail}</div>}
    </button>
  );
}

function Seg<T extends string>({ label, value, options, onChange, detail }: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; detail?: string }) {
  return (
    <div className="rounded border border-border bg-inset p-1.5">
      <div className="mb-1 flex items-center justify-between gap-1">
        <span className="truncate font-display text-[8px] font-semibold uppercase tracking-[.1em] text-fg">{label}</span>
        {detail && <span className="truncate font-mono text-[7px] uppercase text-subtle">{detail}</span>}
      </div>
      <div className="flex gap-1">
        {options.map(([v, text]) => (
          <button key={v} type="button" onClick={() => onChange(v)} className={cn("flex-1 rounded border px-1 py-1 font-display text-[8px] uppercase tracking-wide", value === v ? "border-accent/60 bg-accent/15 text-fg" : "border-border bg-panel/40 text-subtle")}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

const PCT = (v: number) => `${Math.round(v * 100)}%`;

export function LightsTrainer() {
  const s = useSim();
  const d = useDerived();
  const [tab, setTab] = useState<Tab>("controls");
  const [filter, setFilter] = useState<"All" | LightStatus["group"]>("All");

  const L = (id: string): LightStatus => d.lights.find((l) => l.id === id)!;
  const stat = (id: string) => { const l = L(id); return l.lit ? "LIT" : l.reason || "OFF"; };
  const p = (x: Patch) => s.patch(x);
  const dc = !!d.dcPower;
  const test = !!s.ltTest && dc;
  // Trainer annunciators stay off until DC is available (or lamp test).
  const ann = (cond: boolean) => test || (dc && !!cond);

  const buses: [string, boolean][] = [
    ["AC XFR 1", d.transferBus1Powered], ["AC XFR 2", d.transferBus2Powered], ["DC BUS 1", d.dcBus1Powered], ["DC BUS 2", d.dcBus2Powered],
    ["BAT BUS", d.batteryBusPowered], ["HOT BAT", d.hotBatteryBusPowered], ["28V AC", d.ac28vPowered], ["STBY AC", d.standbyAcPowered],
  ];
  const litCount = d.lights.filter((l) => l.lit).length;
  const ctx: Ctx = { s, p, stat, d };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 gap-1">
        {buses.map(([name, on]) => <CaptionLight key={name} label={name} on={on} tone="elec" className="min-w-0 !text-[8px]" />)}
      </div>
      <div className="flex items-center justify-between font-mono text-[8px] uppercase text-subtle">
        <span>{litCount} of {d.lights.length} lights lit</span>
        <span>{d.lights.filter((l) => l.commanded > 0.02 && !l.lit).length} selected but dark</span>
      </div>

      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {PRESETS.map((pr) => (
          <button key={pr.name} type="button" onClick={() => p(pr.patch)} className="shrink-0 rounded border border-border bg-inset px-2 py-1.5 font-display text-[8px] uppercase tracking-wide text-fg hover:bg-panel">{pr.name}</button>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-1">
        {([["controls", "Controls"], ["aircraft", "Aircraft"], ["deck", "Deck + cabin"], ["components", "Components"]] as const).map(([k, name]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={cn("rounded border px-1 py-1.5 font-display text-[8px] uppercase tracking-wide", tab === k ? "border-accent/60 bg-accent/10 text-fg" : "border-border bg-inset text-subtle")}>{name}</button>
        ))}
      </div>

      {tab === "controls" && (
        <div className="space-y-2">
          <ExteriorSwitches ctx={ctx} />
          <DeckSwitches ctx={ctx} />
          <CabinSwitches ctx={ctx} />
        </div>
      )}

      {tab === "aircraft" && (
        <div className="space-y-2">
          <ExteriorSwitches ctx={ctx} />
          <Box title="Exterior lights · AMM 33-40-0 diagrams">
            <ExteriorLightsDiagram lights={d.lights} />
          </Box>
          <ExteriorList lights={d.lights.filter((l) => l.group === "Exterior")} />
        </div>
      )}

      {tab === "deck" && (
        <div className="space-y-2">
          <DeckSwitches ctx={ctx} />
          <CabinSwitches ctx={ctx} />
          <Box title="Flight deck">
            <div className="space-y-1">
              {d.lights.filter((l) => l.group === "Flight deck").map((l) => (
                <div key={l.id} className="flex items-center gap-2 rounded border border-border bg-inset px-2 py-1">
                  <Dot l={l} />
                  <span className="min-w-0 flex-1 truncate font-display text-[8px] uppercase tracking-wide text-fg">{l.label}</span>
                  <span className="h-1.5 w-14 overflow-hidden rounded bg-black/40"><span className="block h-full bg-amber-400/80" style={{ width: PCT(l.level) }} /></span>
                  <span className="w-14 truncate text-right font-mono text-[7px] uppercase text-subtle">{l.lit ? PCT(l.level) : l.reason || "OFF"}</span>
                </div>
              ))}
            </div>
          </Box>

          <Box title={`Annunciators${test ? " · TEST" : ""}${s.ltMasterDim === "DIM" ? " · DIM" : ""}`}>
            <div className="grid grid-cols-3 gap-1" style={{ opacity: s.ltMasterDim === "DIM" ? 0.65 : 1 }}>
              <CaptionLight label="FIRE WARN" on={ann(!!d.fireWarn)} tone="warn" />
              <CaptionLight label="MASTER CAUTION" on={ann(!!d.masterCaution)} tone="caution" />
              <CaptionLight label="GEN 1 OFF BUS" on={ann(!!d.gen1OffBus)} tone="elec" />
              <CaptionLight label="GEN 2 OFF BUS" on={ann(!!d.gen2OffBus)} tone="elec" />
              <CaptionLight label="APU GEN OFF BUS" on={ann(!!d.apuGenOffBus)} tone="elec" />
              <CaptionLight label="HYD A LOW" on={ann(!!d.hydALow)} tone="caution" />
              <CaptionLight label="HYD B LOW" on={ann(!!d.hydBLow)} tone="caution" />
              <CaptionLight label="NOSE GEAR DN" on={ann(!!d.gearLights.nose.green)} tone="ok" />
              <CaptionLight label="NOSE GEAR TRANSIT" on={ann(!!d.gearLights.nose.red)} tone="warn" />
              <CaptionLight label="L MAIN DN" on={ann(!!d.gearLights.leftMain.green)} tone="ok" />
              <CaptionLight label="L MAIN TRANSIT" on={ann(!!d.gearLights.leftMain.red)} tone="warn" />
              <CaptionLight label="R MAIN DN" on={ann(!!d.gearLights.rightMain.green)} tone="ok" />
              <CaptionLight label="R MAIN TRANSIT" on={ann(!!d.gearLights.rightMain.red)} tone="warn" />
            </div>
            {!d.dcPower && <div className="mt-1 font-mono text-[8px] uppercase text-subtle">No DC power — annunciators and test are dead.</div>}
          </Box>

          <Box title="Cabin">
            <div className="mb-1.5 grid grid-cols-2 gap-1.5">
              {(["sign-ns", "sign-sb"] as const).map((id) => {
                const l = L(id);
                return (
                  <div key={id} className="rounded border px-2 py-2 text-center font-display text-[9px] font-semibold uppercase tracking-wide" style={{ borderColor: l.lit ? COLORS.amber : "var(--color-border)", background: l.lit ? `rgba(255,179,64,${0.15 + 0.35 * l.level})` : "transparent", color: l.lit ? COLORS.amber : "var(--color-subtle)", boxShadow: l.lit ? `0 0 ${6 + 8 * l.level}px rgba(255,179,64,.45)` : "none" }}>
                    {l.label.replace(" sign", "")}
                    <div className="mt-0.5 font-mono text-[7px] font-normal">{l.lit ? "ON" : l.reason || "OFF"}</div>
                  </div>
                );
              })}
            </div>
            <CabinStrip lights={d.lights} />
            <div className="mt-1.5 space-y-1">
              {d.lights.filter((l) => l.group === "Cabin" && !l.id.startsWith("sign-")).map((l) => <LampRow key={l.id} l={l} />)}
            </div>
          </Box>

          <Box title="Emergency lighting">
            <div className="space-y-1">{d.lights.filter((l) => l.group === "Emergency").map((l) => <LampRow key={l.id} l={l} />)}</div>
            <div className="mt-1 font-mono text-[8px] uppercase text-subtle">Switch {s.ltEmergency} · pack {d.lightComponents.find((c) => c.id === "emer-pack")?.state}</div>
          </Box>
        </div>
      )}

      {tab === "components" && (
        <div className="space-y-2">
          <Box title="Lighting components">
            <div className="space-y-1">
              {d.lightComponents.map((c) => (
                <div key={c.id} className={cn("rounded border px-2 py-1.5", c.powered ? "border-border bg-inset" : "border-warn/40 bg-inset")}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-display text-[8px] font-semibold uppercase tracking-wide text-fg">{c.name}</span>
                    <span className={cn("shrink-0 font-mono text-[7px] uppercase", c.powered ? "text-ok" : "text-warn")}>{c.powered ? c.state : `NO POWER`}</span>
                  </div>
                  <div className="mt-0.5 text-[8px] leading-snug text-subtle">{c.function}</div>
                  <div className="mt-0.5 font-mono text-[7px] uppercase text-subtle/80">{c.group} · {c.location} · feeds: {c.feeds}</div>
                </div>
              ))}
            </div>
          </Box>

          <Box title="All lights · fail bulb / pull breaker">
            <div className="mb-1.5 flex flex-wrap gap-1">
              {(["All", "Exterior", "Flight deck", "Cabin", "Emergency"] as const).map((g) => (
                <button key={g} type="button" onClick={() => setFilter(g)} className={cn("rounded border px-1.5 py-1 font-display text-[8px] uppercase tracking-wide", filter === g ? "border-accent/60 bg-accent/10 text-fg" : "border-border bg-inset text-subtle")}>{g}</button>
              ))}
            </div>
            <div className="space-y-1">
              {d.lights.filter((l) => filter === "All" || l.group === filter).map((l) => (
                <div key={l.id} className="rounded border border-border bg-inset px-2 py-1">
                  <div className="flex items-center gap-2">
                    <Dot l={l} />
                    <span className="min-w-0 flex-1 truncate font-display text-[8px] uppercase tracking-wide text-fg">{l.label}</span>
                    <span className={cn("shrink-0 font-mono text-[7px] uppercase", l.lit ? "text-ok" : l.reason && l.commanded > 0.02 ? "text-warn" : "text-subtle")}>{l.lit ? "LIT" : l.reason || "OFF"}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1">
                    <span className="flex-1 font-mono text-[7px] uppercase text-subtle">{l.supply} · CB {l.cb}</span>
                    <button type="button" onClick={() => p({ ltFail: toggleInList(s.ltFail, l.id, ",") })} className={cn("rounded border px-1.5 py-0.5 font-display text-[7px] uppercase", lightFailed(s, l.id) ? "border-warn/60 bg-warn/15 text-fg" : "border-border text-subtle")}>{lightFailed(s, l.id) ? "Bulb failed" : "Fail bulb"}</button>
                    <button type="button" onClick={() => p({ ltCb: toggleInList(s.ltCb, l.cb, "|") })} className={cn("rounded border px-1.5 py-0.5 font-display text-[7px] uppercase", cbPulled(s, l.cb) ? "border-warn/60 bg-warn/15 text-fg" : "border-border text-subtle")}>{cbPulled(s, l.cb) ? "CB out" : "Pull CB"}</button>
                  </div>
                </div>
              ))}
            </div>
          </Box>

          <Box title="Circuit breakers (P6)">
            <div className="grid grid-cols-2 gap-1">
              {LIGHT_CBS.map((cb) => <Tog key={cb} label={cb} on={!cbPulled(s, cb)} onText="IN" offText="OUT" onClick={() => p({ ltCb: toggleInList(s.ltCb, cb, "|") })} />)}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <button type="button" onClick={() => p({ ltFail: "", ltCb: "" })} className="rounded border border-border bg-inset px-2 py-2 font-display text-[8px] uppercase tracking-wide text-fg hover:bg-panel">Reset breakers + bulbs</button>
              <button type="button" onClick={() => p({ ...lightsControlsInitial })} className="rounded border border-border bg-inset px-2 py-2 font-display text-[8px] uppercase tracking-wide text-fg hover:bg-panel">Reset switches (keep faults)</button>
            </div>
          </Box>
        </div>
      )}
    </div>
  );
}

type Ctx = { s: SimState; p: (x: Patch) => void; stat: (id: string) => string; d: ReturnType<typeof useDerived> };

function ExteriorSwitches({ ctx }: { ctx: Ctx }) {
  const { s, p, stat } = ctx;
  return (
  <Box title="P5 · Exterior lights">
    <div className="grid grid-cols-2 gap-1.5">
      <Seg label="Retract L" value={s.ltRetL} options={[["RETRACT", "RETR"], ["EXT", "EXT"], ["ON", "ON"]] as const} onChange={(v) => p({ ltRetL: v })} detail={stat("ldg-ret-l")} />
      <Seg label="Retract R" value={s.ltRetR} options={[["RETRACT", "RETR"], ["EXT", "EXT"], ["ON", "ON"]] as const} onChange={(v) => p({ ltRetR: v })} detail={stat("ldg-ret-r")} />
      <Tog label="Fixed L" on={s.ltFixedL} detail={stat("ldg-fix-l")} onClick={() => p({ ltFixedL: !s.ltFixedL })} />
      <Tog label="Fixed R" on={s.ltFixedR} detail={stat("ldg-fix-r")} onClick={() => p({ ltFixedR: !s.ltFixedR })} />
      <Tog label="Rwy turnoff L" on={s.ltTurnoffL} detail={stat("rwy-l")} onClick={() => p({ ltTurnoffL: !s.ltTurnoffL })} />
      <Tog label="Rwy turnoff R" on={s.ltTurnoffR} detail={stat("rwy-r")} onClick={() => p({ ltTurnoffR: !s.ltTurnoffR })} />
      <Tog label="Taxi" on={s.ltTaxi} detail={stat("taxi")} onClick={() => p({ ltTaxi: !s.ltTaxi })} />
      <Tog label="Wing illum" on={s.ltWing} detail={stat("wing")} onClick={() => p({ ltWing: !s.ltWing })} />
      <Tog label="Logo" on={s.ltLogo} detail={stat("logo")} onClick={() => p({ ltLogo: !s.ltLogo })} />
      <Tog label="Wheel well" on={s.ltWheelWell} detail={stat("wheelwell")} onClick={() => p({ ltWheelWell: !s.ltWheelWell })} />
      <Tog label="Anti collision" on={s.ltAntiCol} detail={`TOP ${stat("beacon-top")} · BOT ${stat("beacon-bot")}`} onClick={() => p({ ltAntiCol: !s.ltAntiCol })} />
      <Seg label="Position" value={s.ltPosition} options={[["OFF", "OFF"], ["STEADY", "STDY"], ["STROBE_STEADY", "STRB+S"]] as const} onChange={(v) => p({ ltPosition: v })} detail={`L ${stat("pos-l")}`} />
    </div>
  </Box>
  );
}

function DeckSwitches({ ctx }: { ctx: Ctx }) {
  const { s, p, stat, d } = ctx;
  return (
  <Box title="Flight deck lighting">
    <div className="grid grid-cols-2 gap-1.5">
      <Seg label="Dome" value={s.ltDome} options={[["OFF", "OFF"], ["DIM", "DIM"], ["BRT", "BRT"]] as const} onChange={(v) => p({ ltDome: v })} detail={stat("dome")} />
      <Seg label="Master dim" value={s.ltMasterDim} options={[["BRT", "BRT"], ["DIM", "DIM"]] as const} onChange={(v) => p({ ltMasterDim: v })} />
      <Tog label="Map L (Capt)" on={s.ltMapCapt} detail={stat("map-capt")} onClick={() => p({ ltMapCapt: !s.ltMapCapt })} />
      <Tog label="Map R (F/O)" on={s.ltMapFo} detail={stat("map-fo")} onClick={() => p({ ltMapFo: !s.ltMapFo })} />
      <Tog label="Storm" on={s.ltStorm} detail={stat("storm")} onClick={() => p({ ltStorm: !s.ltStorm })} />
      <Tog label="Compass" on={s.ltCompass} detail={stat("compass")} onClick={() => p({ ltCompass: !s.ltCompass })} />
      <Tog label="Observer read" on={s.ltObserver} detail={stat("observer")} onClick={() => p({ ltObserver: !s.ltObserver })} />
      <Tog label="Lightshield emer" on={s.ltShieldEmer} detail={stat("shield-emer")} onClick={() => p({ ltShieldEmer: !s.ltShieldEmer })} />
      <Tog label="Annunciator test" on={s.ltTest} onText="TEST" detail={d.dcPower ? "LIGHTS ALL LAMPS" : "NO DC POWER"} onClick={() => p({ ltTest: !s.ltTest })} />
    </div>
    <div className="mt-2">
      <ControlSlider label={`OVERHEAD PANEL (${PCT(s.ltPanelOvhd)})`} value={s.ltPanelOvhd} onChange={(v) => p({ ltPanelOvhd: v })} min={0} max={1} step={0.01} />
      <ControlSlider label={`CAPTAIN PANEL (${PCT(s.ltPanelCapt)})`} value={s.ltPanelCapt} onChange={(v) => p({ ltPanelCapt: v })} min={0} max={1} step={0.01} />
      <ControlSlider label={`FIRST OFFICER PANEL (${PCT(s.ltPanelFo)})`} value={s.ltPanelFo} onChange={(v) => p({ ltPanelFo: v })} min={0} max={1} step={0.01} />
      <ControlSlider label={`PEDESTAL (${PCT(s.ltPanelPed)})`} value={s.ltPanelPed} onChange={(v) => p({ ltPanelPed: v })} min={0} max={1} step={0.01} />
    </div>
  </Box>
  );
}

function CabinSwitches({ ctx }: { ctx: Ctx }) {
  const { s, p, stat } = ctx;
  return (
  <Box title="Cabin · signs · emergency">
    <div className="grid grid-cols-2 gap-1.5">
      <Seg label="Cabin lights" value={s.ltCabin} options={[["OFF", "OFF"], ["DIM", "DIM"], ["BRT", "BRT"]] as const} onChange={(v) => p({ ltCabin: v })} detail={stat("cab-main")} />
      <Tog label="Entry" on={s.ltEntry} detail={stat("cab-entry")} onClick={() => p({ ltEntry: !s.ltEntry })} />
      <Tog label="Galley" on={s.ltGalley} detail={stat("cab-galley")} onClick={() => p({ ltGalley: !s.ltGalley })} />
      <Tog label="Lavatory" on={s.ltLav} detail={stat("cab-lav")} onClick={() => p({ ltLav: !s.ltLav })} />
      <Tog label="Reading lights" on={s.ltReading} detail={stat("cab-read")} onClick={() => p({ ltReading: !s.ltReading })} />
      <Tog label="Sidewall / cove" on={s.ltSidewall} detail={stat("cab-sidewall")} onClick={() => p({ ltSidewall: !s.ltSidewall })} />
      <Tog label="Window lights" on={s.ltWindow} detail={stat("cab-window")} onClick={() => p({ ltWindow: !s.ltWindow })} />
      <Tog label="Attendant work" on={s.ltAttWork} detail={stat("att-work")} onClick={() => p({ ltAttWork: !s.ltAttWork })} />
      <Tog label="Passenger calls" on={s.ltCall} detail={stat("pass-call")} onClick={() => p({ ltCall: !s.ltCall })} />
      <Tog label="Lav mirror" on={s.ltLavMirror} detail={stat("lav-mirror")} onClick={() => p({ ltLavMirror: !s.ltLavMirror })} />
      <Tog label="Threshold" on={s.ltThreshold} detail={stat("threshold")} onClick={() => p({ ltThreshold: !s.ltThreshold })} />
      <Tog label="Closets" on={s.ltCloset} detail={stat("closet")} onClick={() => p({ ltCloset: !s.ltCloset })} />
      <Tog label="Cargo compartments" on={s.ltCargo} detail={stat("fwd-cargo-dome")} onClick={() => p({ ltCargo: !s.ltCargo })} />
      <Tog label="Equipment comp" on={s.ltEquip} detail={stat("equip-flood")} onClick={() => p({ ltEquip: !s.ltEquip })} />
      <Tog label="Aft accessory" on={s.ltAftAccessory} detail={stat("aft-accessory")} onClick={() => p({ ltAftAccessory: !s.ltAftAccessory })} />
      <Tog label="APU compartment" on={s.ltApuComp} detail={stat("apu-comp")} onClick={() => p({ ltApuComp: !s.ltApuComp })} />
      <Tog label="Tail cone" on={s.ltTailCone} detail={stat("tail-cone")} onClick={() => p({ ltTailCone: !s.ltTailCone })} />
      <Seg label="No smoking" value={s.ltNoSmoking} options={[["OFF", "OFF"], ["AUTO", "AUTO"], ["ON", "ON"]] as const} onChange={(v) => p({ ltNoSmoking: v })} detail={stat("sign-ns")} />
      <Seg label="Seat belts" value={s.ltSeatBelt} options={[["OFF", "OFF"], ["AUTO", "AUTO"], ["ON", "ON"]] as const} onChange={(v) => p({ ltSeatBelt: v })} detail={stat("sign-sb")} />
      <Seg label="Emer lights" value={s.ltEmergency} options={[["OFF", "OFF"], ["ARMED", "ARMED"], ["ON", "ON"]] as const} onChange={(v) => p({ ltEmergency: v })} detail={stat("emer-aisle")} />
    </div>
    <div className="mt-1.5 font-mono text-[8px] uppercase text-subtle">AUTO signs follow gear (not up) and flaps. ARMED lights the emergency lights when DC power is lost.</div>
  </Box>
  );
}

function LampRow({ l }: { l: LightStatus }) {
  return (
    <div className="flex items-center gap-2 rounded border border-border bg-inset px-2 py-1">
      <Dot l={l} />
      <span className="min-w-0 flex-1 truncate font-display text-[8px] uppercase tracking-wide text-fg">{l.label}</span>
      <span className={cn("shrink-0 font-mono text-[7px] uppercase", l.lit ? "text-ok" : l.reason && l.commanded > 0.02 ? "text-warn" : "text-subtle")}>{l.lit ? (l.level < 0.99 ? PCT(l.level) : "LIT") : l.reason || "OFF"}</span>
    </div>
  );
}

function ExteriorList({ lights }: { lights: LightStatus[] }) {
  return (
    <div className="grid grid-cols-1 gap-1">
      {lights.map((l) => <LampRow key={l.id} l={l} />)}
    </div>
  );
}

/** Side-view strip of the passenger cabin: ceiling glow follows the cabin lights, floor strip follows emergency lights. */
function CabinStrip({ lights }: { lights: LightStatus[] }) {
  const g = (id: string) => lights.find((l) => l.id === id)!;
  const main = g("cab-main"), aisle = g("emer-aisle"), ovhd = g("emer-ovhd"), read = g("cab-read");
  const zones: [string, LightStatus][] = [["ENTRY", g("cab-entry")], ["CABIN", main], ["GALLEY", g("cab-galley")], ["LAV", g("cab-lav")]];
  return (
    <div>
      <div className="relative h-12 overflow-hidden rounded-[22px] border border-border bg-[#14171b]">
        <div className="absolute inset-x-3 top-1 h-1.5 rounded bg-white" style={{ opacity: main.lit ? 0.25 + 0.6 * main.level : 0.06, boxShadow: main.lit ? "0 0 14px rgba(255,255,255,.5)" : "none" }} />
        <div className="absolute inset-x-3 top-3.5 h-1 rounded bg-amber-300" style={{ opacity: ovhd.lit ? 0.85 : 0.05 }} />
        <div className="absolute inset-x-3 bottom-2 h-1 rounded bg-emerald-300" style={{ opacity: aisle.lit ? 0.9 : 0.05, boxShadow: aisle.lit ? "0 0 10px rgba(110,231,183,.6)" : "none" }} />
        <div className="absolute left-1/2 top-5 flex -translate-x-1/2 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: read.lit ? COLORS.white : "#2a2f35", boxShadow: read.lit ? "0 0 5px #fff" : "none" }} />)}
        </div>
      </div>
      <div className="mt-1 grid grid-cols-4 gap-1 text-center font-mono text-[7px] uppercase">
        {zones.map(([name, l]) => <span key={name} className={cn("rounded border border-border px-1 py-0.5", l.lit ? "text-fg" : "text-subtle")}>{name} {l.lit ? "ON" : "OFF"}</span>)}
      </div>
    </div>
  );
}
