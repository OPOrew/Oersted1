import { useShallow } from "zustand/react/shallow";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { BrakeWheelPanel, FlightControlsModule, FaultModule, GroundModule, LandingGearModule, ScenarioModule, StartModule } from "@/components/panel/Overhead";
import { CaptionLight, ControlSlider, Tape } from "@/components/panel/widgets";
import { useDerived, useSim, useSimPick, type SimStore, useDerivedPick } from "@/lib/sim/store";
import { useSimAudio } from "@/lib/sim/audio";
import { PARTS } from "@/data/components";
import type { SystemId, SimState } from "@/lib/sim/types";
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { EngineCutaway } from "@/components/panel/EngineCutaway";
import { SteeringControls } from "@/components/panel/SteeringControls";
import { B737200ControlStand } from "@/components/panel/B737200ControlStand";
import { CenterPedestal } from "@/components/panel/CenterPedestal";
import { OverheadP5 } from "@/components/panel/OverheadP5";
import { MainInstrumentPanel } from "@/components/panel/MainInstrumentPanel";
// WebGL panel is client-only and heavy: load it on demand so SSR and the normal page never pull in three.js.
const MainInstrumentPanel3D = lazy(() => import("@/components/panel/MainInstrumentPanel3D"));
import { usePedestal } from "@/lib/sim/pedestal";
import { useOverheadLocal } from "@/lib/sim/overheadLocal";
import { useMip } from "@/lib/sim/mipLocal";
import { CompactEngineParams } from "@/components/panel/EngineInstrumentPanel";
import { SixPack } from "@/components/panel/SixPack";
import { FlightControlInputs } from "@/components/panel/FlightControlInputs";
import { FlightModeControl } from "@/components/panel/FlightModeControl";
import { Fold } from "@/components/panel/Fold";
import { MarkerAudioDriver } from "@/components/panel/MarkerAudio";

// Heavy trainer / viewer panels are only needed after the person opens them: load each on demand (keeps first load and parse small).
const BrakeRunwayTrainer = lazy(() => import("@/components/panel/BrakeRunwayTrainer").then((m) => ({ default: m.BrakeRunwayTrainer })));
const FireProtectionTrainer = lazy(() => import("@/components/panel/FireProtectionTrainer").then((m) => ({ default: m.FireProtectionTrainer })));
const IceRainTrainer = lazy(() => import("@/components/panel/IceRainTrainer").then((m) => ({ default: m.IceRainTrainer })));
const PitotStaticTrainer = lazy(() => import("@/components/panel/PitotStaticTrainer").then((m) => ({ default: m.PitotStaticTrainer })));
const ElectricalPowerTrainer = lazy(() => import("@/components/panel/ElectricalPowerTrainer").then((m) => ({ default: m.ElectricalPowerTrainer })));
const ApuTrainer = lazy(() => import("@/components/panel/ApuTrainer").then((m) => ({ default: m.ApuTrainer })));
const LightsTrainer = lazy(() => import("@/components/panel/LightsTrainer").then((m) => ({ default: m.LightsTrainer })));
const NavigationTrainer = lazy(() => import("@/components/panel/NavigationTrainer").then((m) => ({ default: m.NavigationTrainer })));
const AutopilotSimulator = lazy(() => import("@/components/panel/AutopilotSimulator").then((m) => ({ default: m.AutopilotSimulator })));
const RadioCommsTrainer = lazy(() => import("@/components/panel/RadioCommsTrainer").then((m) => ({ default: m.RadioCommsTrainer })));
const Cockpit360 = lazy(() => import("@/components/panel/Cockpit360").then((m) => ({ default: m.Cockpit360 })));

// Client-only: the cockpit is a live simulation, so a server-rendered ~1 MB copy of the panels is thrown away and rebuilt by the browser anyway.
// Skipping it makes the page download a small shell and lets the browser build the panels once.
export const Route = createFileRoute("/cockpit")({
  ssr: false,
  pendingComponent: CockpitLoading,
  component: Cockpit,
});

function CockpitLoading() {
  return <div className="grid min-h-[60svh] place-items-center font-mono text-xs uppercase tracking-[.1em] text-subtle">Loading cockpit…</div>;
}

function Cockpit() {
  const s = useSimPick("apuBottleFired", "apuDoor", "apuFirePulled", "apuGen", "apuRpm", "apuStarter", "battery", "busTie", "cabinDiff", "cargoBottleDischarged", "engine1FirePulled", "engine2FirePulled", "fireBottleLDischarged", "fireBottleRDischarged", "flapPos", "flaps", "gear", "gen1", "gen2", "groundSpeedKt", "hydAPress", "hydBPress", "hydSPress", "lePos", "leftMainGearPos", "lever1", "lever2", "ltNoSmoking", "ltSeatBelt", "ltTest", "n1_1", "n1_2", "n2_1", "n2_2", "noseGearPos", "parkingBrake", "psFlightAltFt", "psMachWarningTest", "psStallWarningTest", "rightMainGearPos", "rwyPhase", "speedBrake", "spoilerPos", "start1", "start2", "wheelBrakePressures", "wheelSpeeds", "wow");
  const d = useDerivedPick("acPower", "antiskidOperational", "apuFireWarn", "apuGenOnBus", "cargoAftFireWarn", "cargoFwdFireWarn", "dcPower", "engine1FireWarn", "engine2FireWarn", "externalPowerContactorClosed", "fuelCenterPumpOn", "fuelPump1On", "fuelPump2On", "gearWarningHorn", "hydAPump1On", "hydAPump2On", "hydBPump1On", "hydBPump2On", "packLFlow", "packRFlow", "startValveOpen1", "startValveOpen2", "stbyOn", "thrustReverser1Active", "thrustReverser2Active", "wheelWellFireWarn");
  const annTest = s.ltTest && d.dcPower; // MASTER DIM & TEST switch (P5)
  const ped = usePedestal(useShallow((st) => ({ bellSilenced: st.bellSilenced, fireTest: st.fireTest })));
  const o = useOverheadLocal(useShallow((st) => ({ hornCutout: st.hornCutout, machWarn: st.machWarn, stallTest: st.stallTest })));
  const mipApWarn = useMip((m) => m.apWarn); // SP-77 disconnect warning (latched until reset)
  const mipGpwsTest = useMip((m) => m.gpwsTest);
  const fireTestRing = d.dcPower && ped.fireTest === "OVHT_FIRE";
  const bellOff = ped.bellSilenced && !fireTestRing;
  // Cabin altitude warning horn (~10 000 ft); silenced by ALT HORN CUTOUT until cabin descends
  const cabinAltFt = Math.max(0, Number(s.psFlightAltFt ?? 0) - Math.max(0, Number(s.cabinDiff ?? 0)) * 1600);
  const cabinAltHorn = !!d.dcPower && cabinAltFt >= 10000 && !o.hornCutout;
  const [view360, setView360] = useState(false);
  const [view3dMip, setView3dMip] = useState(false);
  // Synthesized sounds: APU / engines, fire bell, landing gear, flaps, spoilers, touchdown, brakes, reversers, systems.
  // Aural warnings (737-200 AWM): fire bell, gear horn, AP-disconnect wailer, stall stick-shaker.
  // Off until the person taps the sound button.
  const audio = useSimAudio({
    apuRpm: Number(s.apuRpm ?? 0),
    apuStarter: !!s.apuStarter,
    n2: [Number(s.n2_1 ?? 0), Number(s.n2_2 ?? 0)],
    n1: [Number(s.n1_1 ?? 0), Number(s.n1_2 ?? 0)],
    startValve: [!!d.startValveOpen1, !!d.startValveOpen2],
    startSw: [String(s.start1 ?? "OFF"), String(s.start2 ?? "OFF")],
    lever: [!!s.lever1, !!s.lever2],
    fire: { e1: fireTestRing || (!bellOff && !!d.engine1FireWarn), e2: fireTestRing || (!bellOff && !!d.engine2FireWarn), apu: fireTestRing || (!bellOff && !!d.apuFireWarn) },
    fireOther: !bellOff && !!(d.wheelWellFireWarn || d.cargoFwdFireWarn || d.cargoAftFireWarn),
    // landing gear, flight controls, brakes and systems
    gear: [Number(s.noseGearPos ?? 0), Number(s.leftMainGearPos ?? 0), Number(s.rightMainGearPos ?? 0)],
    gearLever: String(s.gear ?? "OFF"),
    gearHorn: !!d.gearWarningHorn,
    apWarn: mipApWarn,
    // Stall stick-shaker: overhead STALL WARNING TEST (NO.1/NO.2) or psStallWarningTest; needs DC
    stallWarn: !!d.dcPower && (o.stallTest !== 0 || !!s.psStallWarningTest),
    machWarn: (o.machWarn !== 0 || !!s.psMachWarningTest) && !!d.dcPower, // Mach / airspeed warning test (P5)
    gpwsTest: !!mipGpwsTest && !!d.dcPower,
    glideslopeWarn: false, // Mode 5 live path not yet driven; sample still plays during GPWS TEST vocab
    configOrCabinHorn: cabinAltHorn,
    flapPos: Number(s.flapPos ?? 0),
    flapLever: Number(s.flaps ?? 0),
    lePos: Number(s.lePos ?? 0),
    spoilerPos: Number(s.spoilerPos ?? 0),
    speedBrake: String(s.speedBrake ?? "DOWN"),
    apuDoor: Number(s.apuDoor ?? 0),
    hydPressure: [Number(s.hydAPress ?? 0), Number(s.hydBPress ?? 0), Number(s.hydSPress ?? 0)],
    hydPumps: [d.hydAPump1On, d.hydAPump2On, d.hydBPump1On, d.hydBPump2On, d.stbyOn].filter(Boolean).length,
    elecPumps: !!(d.hydBPump1On || d.hydBPump2On || d.stbyOn),
    wow: !!s.wow,
    groundSpeedKt: Number(s.groundSpeedKt ?? 0),
    rwyPhase: String(s.rwyPhase ?? "IDLE"),
    wheelSpeeds: [s.wheelSpeeds.li, s.wheelSpeeds.lo, s.wheelSpeeds.ri, s.wheelSpeeds.ro],
    wheelBrake: [s.wheelBrakePressures.li, s.wheelBrakePressures.lo, s.wheelBrakePressures.ri, s.wheelBrakePressures.ro],
    antiskid: !!d.antiskidOperational,
    parkingBrake: !!s.parkingBrake,
    reversers: [!!d.thrustReverser1Active, !!d.thrustReverser2Active],
    relays: [!!s.battery, !!s.gen1, !!s.gen2, !!s.apuGen, !!d.externalPowerContactorClosed, !!s.busTie, !!d.apuGenOnBus],
    packs: [!!d.packLFlow, !!d.packRFlow],
    fuelPumps: [d.fuelPump1On, d.fuelPump2On, d.fuelCenterPumpOn].filter(Boolean).length,
    acPower: !!d.acPower,
    dcPower: !!d.dcPower,
    fireHandles: [!!s.engine1FirePulled, !!s.engine2FirePulled, !!s.apuFirePulled],
    bottles: [!!s.fireBottleLDischarged, !!s.fireBottleRDischarged, !!s.apuBottleFired, !!s.cargoBottleDischarged],
    signs: [String(s.ltSeatBelt ?? "OFF"), String(s.ltNoSmoking ?? "OFF")],
  });

  if (view360) {
    return (
      <Suspense fallback={<div className="fixed inset-0 grid place-items-center bg-[#0b0d10] font-mono text-xs uppercase tracking-[.1em] text-subtle">Loading 360° view…</div>}>
        <Cockpit360 onExit={() => setView360(false)} />
      </Suspense>
    );
  }

  if (view3dMip) {
    return (
      <Suspense fallback={<div className="fixed inset-0 grid place-items-center bg-[#0b0d10] font-mono text-xs uppercase tracking-[.1em] text-subtle">Loading 3D panel…</div>}>
        <MainInstrumentPanel3D onExit={() => setView3dMip(false)} />
      </Suspense>
    );
  }

  return (
    <AppShell>
      <div className="mb-4">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-subtle">737-200 flight deck trainer</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Cockpit panels</h1>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void audio.toggle()}
            className={cn("rounded border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[.1em]", audio.on ? "border-accent/70 bg-accent/10 text-accent" : "border-border bg-inset text-subtle")}
          >
            {audio.on ? "SOUND ON" : "SOUND OFF"}
          </button>
          <input type="range" min={0} max={1} step={0.05} value={audio.vol} onChange={(e) => audio.setVolume(Number(e.target.value))} className="w-32" aria-label="Sound volume" />
          <button
            type="button"
            onClick={() => setView360(true)}
            className="rounded border border-border bg-inset px-3 py-1.5 font-mono text-[10px] uppercase tracking-[.1em] text-subtle hover:bg-inset/80"
          >
            360° cockpit view
          </button>
          <button
            type="button"
            onClick={() => setView3dMip(true)}
            className="rounded border border-border bg-inset px-3 py-1.5 font-mono text-[10px] uppercase tracking-[.1em] text-subtle hover:bg-inset/80"
          >
            3D instrument panel
          </button>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Primary controls are grouped by their aircraft panel location. Training scenarios, ground servicing and fault injection are available from the separate right-edge Training Console so they do not look like real flight-deck controls.
          Use <strong className="text-fg">360° cockpit view</strong> to sit in a pilot seat and look around the overhead, instrument panel and center pedestal.
        </p>
      </div>

      <div className="relative">
        <main className="min-w-0 max-w-full space-y-4">
          <MainInstrumentPanel />

          <OverheadP5 />

          <CenterPedestal />

          <section className="relative rounded-xl border border-[#4a4f56] bg-[#202328] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.04),0_8px_25px_rgba(0,0,0,.28)]">
            <PanelScrews />
            <PanelHeader eyebrow="FLIGHT CONTROLS" title="Control column / rudder pedals / tiller" note="Shared live yoke and rudder inputs — simultaneous touch inputs supported" />
            <div className="mt-3"><FlightControlInputs title="Flight compartment primary controls" /></div>
            <div className="mt-3 rounded-lg border border-[#343a42] bg-[#121417] p-3"><SteeringControls /></div>
          </section>
        </main>

        <MarkerAudioDriver enabled={audio.on} />
        <TrainingDrawer audioEnabled={audio.on} />
        <LogDrawer />
      </div>
    </AppShell>
  );
}


function TrainingDrawer({ audioEnabled }: { audioEnabled: boolean }) {
  // The closed drawer is just a button: it must not subscribe to the sim (the console below does, only while open).
  const [open, setOpen] = useState(false);
  return (
    <>
      {!open && (
        <button
          aria-label="Toggle Training Console"
          onClick={() => setOpen(true)}
          className="fixed right-0 top-[36%] z-50 -translate-y-1/2 rounded-l-lg border border-[#6d6044] bg-[#242219] px-1.5 py-3 sm:px-2 sm:py-4 font-display text-[9px] sm:text-[10px] font-semibold uppercase tracking-[0.12em] sm:tracking-[0.16em] text-[#e5dcc2] shadow-[0_8px_30px_rgba(0,0,0,0.45)] [writing-mode:vertical-rl]"
        >
          ☰ TRAINING
        </button>
      )}
      {open && <TrainingConsole audioEnabled={audioEnabled} onClose={() => setOpen(false)} />}
    </>
  );
}

function TrainingConsole({ audioEnabled, onClose }: { audioEnabled: boolean; onClose: () => void }) {
  const s = useSim();
  const d = useDerived();
  const [section, setSection] = useState("Hydraulics");
  const [sectionsCollapsed, setSectionsCollapsed] = useState(false);
  const sections = ["Flight Controls", "Landing Gear", "Electrical Power", "Engine Start", "Hydraulics", "Pneumatic", "Air Conditioning", "Cabin Pressurization", "APU", "Fuel", "Brakes / Antiskid", "Fire Protection", "Ice & Rain", "Pitot / Static", "Navigation", "Autopilot", "Lights", "Fault Injection", "Component / System Flow"];
  const toggle = (key: keyof import("@/lib/sim/types").SimState, value: boolean) => s.patch({ [key]: value } as Partial<import("@/lib/sim/types").SimState>);
  const setAutobrake = (v: 0 | 1 | 2 | 3 | 4) => s.patch({ autobrake: v });

  return (
    <>
      {(
        <div className="fixed inset-0 z-50 flex flex-col bg-[#171816] shadow-[0_0_40px_rgba(0,0,0,0.55)]">
          <div className="flex items-center justify-between border-b border-[#403b2d] px-3 py-3">
            <div>
              <div className="font-display text-[10px] uppercase tracking-[0.18em] text-[#b7ab87]">Separate training interface</div>
              <div className="font-display text-lg font-semibold text-fg">Training Console <span className="ml-1 align-middle font-mono text-[8px] font-normal tracking-wider text-accent">BUILD HYD-PNEU-AC-CAB-V8</span></div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSectionsCollapsed(v => !v)}
                className="rounded border border-border bg-inset px-2 py-1 text-[10px] uppercase"
                aria-expanded={!sectionsCollapsed}
              >
                {sectionsCollapsed ? "Show sections ▾" : "Hide sections ▴"}
              </button>
              <button onClick={onClose} className="rounded border border-border bg-inset px-2 py-1 text-[10px] uppercase">Close</button>
            </div>
          </div>
          {!sectionsCollapsed && (
            <div className="grid grid-cols-2 gap-1 border-b border-[#403b2d] p-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {sections.map(name => (
                <button key={name} onClick={() => { setSection(name); setSectionsCollapsed(true); }} className={cn("rounded border px-2 py-2 text-left text-[9px] font-display uppercase tracking-wide", section === name ? "border-accent/60 bg-accent/10 text-fg" : "border-border bg-inset text-subtle")}>{name}</button>
              ))}
            </div>
          )}
          {sectionsCollapsed && (
            <div className="flex items-center gap-2 border-b border-[#403b2d] px-3 py-1.5">
              <span className="font-display text-[10px] uppercase tracking-wide text-subtle">Section:</span>
              <span className="rounded border border-accent/40 bg-accent/10 px-2 py-0.5 font-display text-[10px] uppercase tracking-wide text-fg">{section}</span>
              <button
                onClick={() => setSectionsCollapsed(false)}
                className="ml-auto rounded border border-border bg-inset px-2 py-0.5 text-[9px] uppercase text-subtle hover:text-fg"
              >
                Change ▾
              </button>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-20 md:pb-3">
            <Suspense fallback={<div className="p-4 font-mono text-[10px] uppercase tracking-[.1em] text-subtle">Loading…</div>}>
            {section === "Flight Controls" && <TrainingGroup title="Flight Controls">
              <div className="grid grid-cols-2 gap-2"><button onClick={() => s.patch({ fltCtrlA: !s.fltCtrlA })} className="rounded border border-border bg-inset px-2 py-2 text-[9px] font-display uppercase tracking-wide text-fg hover:bg-panel">FLT CTRL A · {s.fltCtrlA ? "ON" : "OFF"}</button><button onClick={() => s.patch({ fltCtrlB: !s.fltCtrlB })} className="rounded border border-border bg-inset px-2 py-2 text-[9px] font-display uppercase tracking-wide text-fg hover:bg-panel">FLT CTRL B · {s.fltCtrlB ? "ON" : "OFF"}</button><button onClick={() => s.patch({ spoilerA: !s.spoilerA })} className="rounded border border-border bg-inset px-2 py-2 text-[9px] font-display uppercase tracking-wide text-fg hover:bg-panel">SPOILER A · {s.spoilerA ? "ON" : "OFF"}</button><button onClick={() => s.patch({ spoilerB: !s.spoilerB })} className="rounded border border-border bg-inset px-2 py-2 text-[9px] font-display uppercase tracking-wide text-fg hover:bg-panel">SPOILER B · {s.spoilerB ? "ON" : "OFF"}</button></div>
              <button onClick={() => s.patch({ yokePitch: 0, yokeRoll: 0, rudderPedal: 0, tiller: 0 })} className="mt-2 w-full rounded border border-border bg-inset px-2 py-2 text-[9px] font-display uppercase tracking-wide text-fg hover:bg-panel">Center flight controls</button>
              <TrainingSub title="Servicing / Test">
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => toggle("groundSenseTest", !s.groundSenseTest)} className="rounded border border-border bg-inset px-2 py-2 text-[9px] font-display uppercase tracking-wide text-fg hover:bg-panel">Ground-sensing test override · {s.groundSenseTest ? "ACTIVE" : "OFF"}</button>
                  <button onClick={() => toggle("airborneTest", !s.airborneTest)} className="rounded border border-border bg-inset px-2 py-2 text-[9px] font-display uppercase tracking-wide text-fg hover:bg-panel">Airborne test override · {s.airborneTest ? "ACTIVE" : "OFF"}</button>
                  <button onClick={() => toggle("hydServicingConnected", !s.hydServicingConnected)} className="rounded border border-border bg-inset px-2 py-2 text-[9px] font-display uppercase tracking-wide text-fg hover:bg-panel">Ground hydraulic servicing · {s.hydServicingConnected ? "CONNECTED" : "DISCONNECTED"}</button>
                  <button onClick={() => toggle("externalPowerConnected", !s.externalPowerConnected)} className="rounded border border-border bg-inset px-2 py-2 text-[9px] font-display uppercase tracking-wide text-fg hover:bg-panel">Ground power cart (GPU) · {s.externalPowerConnected ? "CONNECTED" : "DISCONNECTED"}</button>
                </div>
              </TrainingSub>
              <TrainingSub title="Yoke / rudder inputs → flight-control surfaces">
                <FlightModeControl />
                <div className="overflow-x-auto">
                  <FlightControlsModule aside={<B737200ControlStand scaleToFit spoilerSwitches />} />
                </div>
                <div className="mt-3">
                  <SixPack sideBySide foFirst hideNote />
                </div>
                <div className="mt-3">
                  <FlightControlInputs compact title="Flight Controls trainer inputs" />
                </div>
              </TrainingSub>
            </TrainingGroup>}
            {section === "Landing Gear" && <TrainingGroup title="Landing Gear">
              <button onClick={() => toggle("parkingBrake", !s.parkingBrake)} className="mt-2 rounded border border-border bg-inset px-2 py-2 text-[9px] font-display uppercase tracking-wide text-fg hover:bg-panel">PARKING BRAKE · {s.parkingBrake ? "SET" : "RELEASE"}</button>
              <TrainingSub title="Servicing / Test">
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => toggle("hydServicingConnected", !s.hydServicingConnected)} className="rounded border border-border bg-inset px-2 py-2 text-[9px] font-display uppercase tracking-wide text-fg hover:bg-panel">Ground hydraulic servicing · {s.hydServicingConnected ? "CONNECTED" : "DISCONNECTED"}</button>
                  <button onClick={() => toggle("groundSenseTest", !s.groundSenseTest)} className="rounded border border-border bg-inset px-2 py-2 text-[9px] font-display uppercase tracking-wide text-fg hover:bg-panel">Ground-sensing test override · {s.groundSenseTest ? "ACTIVE" : "OFF"}</button>
                  <button onClick={() => toggle("airborneTest", !s.airborneTest)} className="rounded border border-border bg-inset px-2 py-2 text-[9px] font-display uppercase tracking-wide text-fg hover:bg-panel">Airborne test override · {s.airborneTest ? "ACTIVE" : "OFF"}</button>
                  <button onClick={() => toggle("externalPowerConnected", !s.externalPowerConnected)} className="rounded border border-border bg-inset px-2 py-2 text-[9px] font-display uppercase tracking-wide text-fg hover:bg-panel">Ground power cart (GPU) · {s.externalPowerConnected ? "CONNECTED" : "DISCONNECTED"}</button>
                </div>
              </TrainingSub>
              <TrainingSub title="Gear · wheel & brake dynamics">
                <div className="overflow-x-auto">
                  <LandingGearModule />
                </div>
              </TrainingSub>
              <TrainingSub title="Nose wheel steering">
                <div className="grid grid-cols-2 gap-2">
                  <span className="rounded border border-border bg-inset px-2 py-2 text-[9px] font-mono uppercase text-subtle">ANGLE {Number(d.noseWheelSteeringAngle ?? 0).toFixed(0)}°</span>
                  <span className="rounded border border-border bg-inset px-2 py-2 text-[9px] font-mono uppercase text-subtle">SOURCE {d.noseWheelSteeringAvailable ? "SYSTEM A" : "OFF"}</span>
                </div>
                <button onClick={() => s.patch({ tiller: 0, rudderPedal: 0 })} className="mt-2 w-full rounded border border-border bg-inset px-2 py-2 text-[9px] font-display uppercase tracking-wide text-fg hover:bg-panel">Center tiller &amp; pedals</button>
              </TrainingSub>
            </TrainingGroup>}
            {section === "Electrical Power" && <ElectricalPowerTrainer />}
            {section === "Engine Start" && <EngineStartTrainerPanel s={s} d={d} />}
            {section === "Hydraulics" && <HydraulicsTrainerPanel s={s} d={d} toggle={toggle} />}
            {section === "Pneumatic" && <PneumaticTrainerPanel s={s} d={d} />}
            {section === "Air Conditioning" && <AirConditioningTrainerPanel s={s} d={d} />}
            {section === "Cabin Pressurization" && <CabinPressurizationTrainerPanel s={s} d={d} />}
            {section === "APU" && <TrainingGroup title="APU"><ApuTrainer /></TrainingGroup>}
            {section === "Fuel" && <FuelTrainerPanel s={s} d={d} />}
            {section === "Brakes / Antiskid" && <TrainingGroup title="Brakes / Antiskid">
              <div className="grid grid-cols-2 gap-2"><button onClick={() => { toggle("antiskidInbd", !s.antiskidInbd); }} className="rounded border border-border bg-inset px-2 py-2 text-[9px] font-display uppercase tracking-wide text-fg hover:bg-panel">INBD ANTISKID · {s.antiskidInbd ? "ON" : "OFF"}</button><button onClick={() => { toggle("antiskidOutbd", !s.antiskidOutbd); }} className="rounded border border-border bg-inset px-2 py-2 text-[9px] font-display uppercase tracking-wide text-fg hover:bg-panel">OUTBD ANTISKID · {s.antiskidOutbd ? "ON" : "OFF"}</button></div>
              <div className="mt-2 grid grid-cols-5 gap-1">{([[0,"OFF"],[1,"MIN"],[2,"MED"],[3,"MAX"],[4,"RTO"]] as const).map(([v,l]) => <button key={v} onClick={() => { setAutobrake(v); }} className="rounded border border-border bg-inset px-1 py-2 text-[9px] font-display uppercase tracking-wide text-fg hover:bg-panel">{l}</button>)}</div>
              <TrainingSub title="Servicing / Test"><span className="block rounded border border-border bg-inset px-2 py-2 text-[9px] text-subtle">ANTISKID {d.antiskidOperational ? "OPERABLE" : "INOP"} · AUTOBRAKE {d.autobrakeArmed ? "ARMED" : "NOT ARMED"}</span></TrainingSub>
              <TrainingSub title="Landing / rollout trainer"><BrakeRunwayTrainer /></TrainingSub>
              <TrainingSub title="Main gear wheels">
                <div className="overflow-x-auto">
                  <BrakeWheelPanel />
                </div>
              </TrainingSub>
            </TrainingGroup>}
            {section === "Ice & Rain" && <TrainingGroup title="Ice & Rain Protection"><IceRainTrainer /></TrainingGroup>}
            {section === "Pitot / Static" && <TrainingGroup title="Pitot / Static"><PitotStaticTrainer /></TrainingGroup>}
            {/* Navigation uses the flight-plan phase controller. Do not wrap it in
                FlightModeControl: its generic FLIGHT button spawns the aircraft
                airborne at 160 kt and bypasses the explicit TAKEOFF phase. */}
            {section === "Navigation" && <TrainingGroup title="Navigation"><NavigationTrainer /><Fold title="VHF COM" hint="receive + simulated PTT · ATA 23"><RadioCommsTrainer audioEnabled={audioEnabled} /></Fold></TrainingGroup>}
            {section === "Autopilot" && <TrainingGroup title="Autopilot simulator / Flight Director"><AutopilotSimulator /></TrainingGroup>}
            {section === "Fire Protection" && <TrainingGroup title="Fire Protection">
              <FireProtectionTrainer />
              <TrainingSub title="Servicing / Test"><span className="block rounded border border-border bg-inset px-2 py-2 text-[9px] text-subtle">FIRE WARN {d.fireWarn ? "ACTIVE" : "CLEAR"}</span></TrainingSub>
            </TrainingGroup>}
            {section === "Lights" && <TrainingGroup title="Lights"><LightsTrainer /></TrainingGroup>}
            {section === "Fault Injection" && <div className="space-y-3"><FaultModule /><ScenarioModule /></div>}
            {section === "Component / System Flow" && <TrainingGroup title="Live component flow"><div className="space-y-1 font-mono text-[9px] uppercase"><span className="block rounded border border-border bg-inset px-2 py-2 text-[9px] text-subtle">HYD A → {s.hydAPress > 1500 ? "PRESSURIZED" : "OFF"}</span><span className="block rounded border border-border bg-inset px-2 py-2 text-[9px] text-subtle">HYD B → {s.hydBPress > 1500 ? "PRESSURIZED" : "OFF"}</span><span className="block rounded border border-border bg-inset px-2 py-2 text-[9px] text-subtle">PNEU L → {d.leftManifold ? "SUPPLIED" : "OFF"}</span><span className="block rounded border border-border bg-inset px-2 py-2 text-[9px] text-subtle">PNEU R → {d.rightManifold ? "SUPPLIED" : "OFF"}</span><span className="block rounded border border-border bg-inset px-2 py-2 text-[9px] text-subtle">AUTOBRAKE → {d.autobrakeActive ? "ACTIVE" : d.autobrakeArmed ? "ARMED" : "OFF"}</span></div><button onClick={() => document.getElementById("component-masterlist")?.scrollIntoView({ behavior: "smooth", block: "start" })} className="mt-2 w-full rounded border border-border bg-inset px-2 py-2 text-[9px] font-display uppercase tracking-wide text-fg hover:bg-panel">Open component masterlist</button></TrainingGroup>}

            </Suspense>
          </div>
        </div>
      )}
    </>
  );
}


function LogDrawer() {
  const s = useSimPick("log", "clearLog");
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        aria-label="Toggle Simulator Log"
        onClick={() => setOpen(v => !v)}
        className="fixed right-0 top-[62%] z-50 -translate-y-1/2 rounded-l-lg border border-[#59616b] bg-[#1d2227] px-1.5 py-3 sm:px-2 sm:py-4 font-display text-[9px] sm:text-[10px] font-semibold uppercase tracking-[0.12em] sm:tracking-[0.16em] text-[#d7dde3] shadow-[0_8px_30px_rgba(0,0,0,0.45)] [writing-mode:vertical-rl]"
      >
        LOG
      </button>
      {open && (
        <div className="fixed inset-y-0 right-0 z-[51] flex w-[min(92vw,25rem)] flex-col border-l border-[#59616b] bg-[#151719]/[.98] shadow-[-12px_0_40px_rgba(0,0,0,0.55)] backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-[#343a42] px-3 py-3">
            <div>
              <div className="font-display text-[10px] uppercase tracking-[0.18em] text-[#9da7b1]">Separate event recorder</div>
              <div className="font-display text-lg font-semibold text-fg">Simulator Log</div>
            </div>
            <button onClick={() => setOpen(false)} className="rounded border border-border bg-inset px-2 py-1 text-[10px] uppercase">Close</button>
          </div>
          <div className="flex items-center justify-between border-b border-[#343a42] px-3 py-2">
            <span className="text-[9px] uppercase tracking-wide text-subtle">Control actions · component consequences · system events</span>
            <button onClick={() => s.clearLog()} className="rounded border border-border bg-inset px-2 py-1 text-[8px] font-display uppercase tracking-wide text-fg hover:bg-panel">Clear</button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {s.log.length === 0 ? (
              <div className="rounded border border-border bg-inset p-3 text-[9px] text-subtle">No events recorded yet. Operate a cockpit or training control.</div>
            ) : (
              <div className="space-y-1.5">
                {s.log.map((e, i) => (
                  <div key={`${e.t}-${i}`} className="w-full rounded border border-border bg-inset p-2 text-left">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[8px] text-subtle">{new Date(e.t).toLocaleTimeString()}</span>
                      <span className="font-display text-[9px] uppercase text-fg">{e.control ?? "SYSTEM"}</span>
                    </div>
                    <div className="mt-1 text-[9px] text-fg">{e.text}</div>
                    {e.control && <div className="mt-1 font-mono text-[8px] text-subtle">CAUSE: {e.before ?? "—"} → COMMAND: {e.after ?? "—"}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}



/* ─────────────────────────────────────────────────────────────
   ATA 36 pneumatic trainer — wired diagram (engine bleed → manifolds → users).
   Colours: LEFT / ENG 1 = blue, RIGHT / ENG 2 = green, APU + trip control = amber, ground source = accent.
   Every lit state is driven by the existing sim values; wires are drawn between the measured nodes.
   ───────────────────────────────────────────────────────────── */
type PneuFlags = {
  run1: boolean; run2: boolean; open1: boolean; open2: boolean; trip1: boolean; trip2: boolean; bleed13_1: boolean; bleed13_2: boolean;
  leftLive: boolean; rightLive: boolean; isoOpen: boolean; apuOn: boolean; groundOn: boolean;
  packL: boolean; packR: boolean;
  turn1: boolean; turn2: boolean; prv1: boolean; prv2: boolean; ovr1: boolean; ovr2: boolean;
};

/** Trainer assumption: the pressure-ratio (surge) bleed valves are open at low-to-mid power and close above this N2 %. */
const PRV_CLOSE_N2 = 80;

function useWireGeometry() {
  const rootRef = useRef<HTMLDivElement>(null);
  const lastKey = useRef("");
  const [geo, setGeo] = useState<HydGeo>({});
  const [size, setSize] = useState({ w: 0, h: 0 });
  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const rr = root.getBoundingClientRect();
    const next: HydGeo = {};
    root.querySelectorAll<HTMLElement>("[data-hyd]").forEach((el) => {
      const r = el.getBoundingClientRect();
      const l = r.left - rr.left;
      const t = r.top - rr.top;
      next[el.dataset.hyd as string] = { l, r: l + r.width, t, b: t + r.height, cx: l + r.width / 2, cy: t + r.height / 2 };
    });
    const key = `${Math.round(rr.width)}x${Math.round(rr.height)}|` + Object.entries(next).map(([k, v]) => `${k}:${Math.round(v.l)},${Math.round(v.t)},${Math.round(v.r)},${Math.round(v.b)}`).join(";");
    if (key !== lastKey.current) {
      lastKey.current = key;
      setGeo(next);
      setSize({ w: rr.width, h: rr.height });
    }
  }, []);
  useLayoutEffect(() => { measure(); });
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(root);
    window.addEventListener("resize", measure);
    (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready.then(measure);
    return () => { ro?.disconnect(); window.removeEventListener("resize", measure); };
  }, [measure]);
  return { rootRef, geo, size };
}

function buildPneumaticWires(geo: HydGeo, f: PneuFlags): HydWire[] {
  const wires: HydWire[] = [];
  const N = (id: string): HydRect | undefined => geo[id];
  const add = (tone: HydTone, active: boolean, pts: HydPt[] | null | undefined, o: { arrow?: boolean; dots?: HydPt[] } = {}) => {
    if (pts && pts.length > 1) wires.push({ tone, active, pts, arrow: o.arrow ?? true, dots: o.dots ?? [] });
  };
  const drop = (tone: HydTone, live: boolean, a: HydRect | undefined, b: HydRect | undefined, x?: number) => {
    if (a && b) add(tone, live, [[x ?? a.cx, a.b], [x ?? a.cx, b.t]]);
  };
  const lm = N("pn-lm"), rm = N("pn-rm"), iso = N("pn-iso");

  // ── Engine bleed chains: 8th-stage main duct (+13th merge) → precooler → bleed valve; bypass duct → bleed valve ──
  (["1", "2"] as const).forEach((k) => {
    const tone: HydTone = k === "1" ? "a" : "b";
    const run = k === "1" ? f.run1 : f.run2, open = k === "1" ? f.open1 : f.open2, trip = k === "1" ? f.trip1 : f.trip2, bleed13 = k === "1" ? f.bleed13_1 : f.bleed13_2;
    const m8 = N(`e${k}-8m`), s13 = N(`e${k}-13`), b8 = N(`e${k}-8b`), pre = N(`e${k}-pre`), fan = N(`e${k}-fan`);
    const ovh = N(`e${k}-ovh`), valve = N(`e${k}-valve`), ptx = N(`e${k}-ptx`), tap = N(`e${k}-tap`);
    const man = k === "1" ? lm : rm;
    drop(tone, open, m8, pre, m8?.cx);
    drop(tone, bleed13, s13, pre, s13?.cx);
    if (fan && pre) add(tone, run, [[fan.l, fan.cy], [pre.r, pre.cy]]);   // engine fan air through the precooler
    if (b8 && valve) {                                          // bypass duct skips the precooler and enters the bleed valve
      const Rb = b8.r + 12;
      add(tone, open, [[b8.r, b8.cy], [Rb, b8.cy], [Rb, valve.cy], [valve.r, valve.cy]]);
    }
    if (pre && valve) { const x = (valve.l + pre.r) / 2; add(tone, open, [[x, pre.b], [x, valve.t]]); }
    if (ovh && valve) add("standby", trip, [[ovh.r, ovh.cy], [valve.l, valve.cy]]);   // overheat switch closes the valve (control)
    drop(tone, open, valve, ptx, valve?.cx);
    if (ptx && tap) add(tone, open, [[ptx.r, ptx.cy], [tap.l, tap.cy]]);             // reservoir-pressurization tap (upstream of the manifold)
    drop(tone, open, ptx, man, ptx?.cx);

    // Pressure Ratio Bleed Control (PRV): Pt2 / Ps3 sense → PRV → Ps4 air commands surge-bleed valves → dump to fan stream.
    // The starter valve's start-bleed override also drives the PRV during start.
    const turn = k === "1" ? f.turn1 : f.turn2, prv = k === "1" ? f.prv1 : f.prv2, ovr = k === "1" ? f.ovr1 : f.ovr2;
    const sns = N(`e${k}-sns`), pv = N(`e${k}-prv`), srg = N(`e${k}-srg`), ovn = N(`e${k}-ovr`), dmp = N(`e${k}-dmp`);
    const hz = (t: HydTone, act: boolean, a?: HydRect, b?: HydRect) => {
      if (!a || !b) return;
      if (Math.abs(a.cy - b.cy) < 2) { add(t, act, [[a.r, a.cy], [b.l, b.cy]]); return; }
      const xm = (a.r + b.l) / 2;
      add(t, act, [[a.r, a.cy], [xm, a.cy], [xm, b.cy], [b.l, b.cy]]);
    };
    const cmp = N(`e${k}-cmp`);
    if (cmp && sns) add(tone, turn, [[sns.cx, cmp.t], [sns.cx, sns.b]]);   // engine compressor supplies the Pt2 / Ps3 signals
    hz(tone, turn, sns, pv);                                  // compressor pressure signals into the PRV
    hz("standby", prv, pv, srg);                              // PRV command (Ps4 air) to the surge-bleed valves
    if (srg && dmp) add(tone, prv, [[srg.cx, srg.b], [srg.cx, dmp.t]]);   // surge bleed dumps into the fan discharge
    if (ovn && pv) add("standby", ovr, [[pv.cx, ovn.t], [pv.cx, pv.b]]);  // start-bleed override from the starter valve
  });

  // ── Isolation valve between the manifolds (direction follows where the air actually originates) ──
  if (lm && rm && iso) {
    const y = iso.cy;
    const leftLocal = f.open1 || f.apuOn, rightLocal = f.open2 || f.groundOn;
    const cross = f.isoOpen && (leftLocal || rightLocal);
    const lr = cross && leftLocal && !rightLocal, rl = cross && rightLocal && !leftLocal;
    const tone: HydTone = lr ? "a" : rl ? (f.groundOn && !f.open2 ? "ground" : "b") : "ground";
    if (lr) { add(tone, true, [[lm.r, y], [iso.l, y]]); add(tone, true, [[iso.r, y], [rm.l, y]]); }
    else if (rl) { add(tone, true, [[rm.l, y], [iso.r, y]]); add(tone, true, [[iso.l, y], [lm.r, y]]); }
    else { add(tone, cross, [[lm.r, y], [iso.l, y]], { arrow: false }); add(tone, cross, [[iso.r, y], [rm.l, y]], { arrow: false }); }
  }

  // ── Ground cart → connector + check valve (right pack bay) → RIGHT manifold only; APU → bleed valve → duct/relief → check valve → left manifold ──
  const gc = N("pn-gc"), gk = N("pn-gk"), av = N("pn-av"), ad = N("pn-ad"), ac = N("pn-ac");
  drop("ground", f.groundOn, gc, gk);
  if (gk && rm) add("ground", f.groundOn, [[gk.r, gk.cy], [rm.l, gk.cy]]);
  drop("standby", f.apuOn, av, ad);
  drop("standby", f.apuOn, ad, ac);
  if (ac && lm) add("standby", f.apuOn, [[ac.l, ac.cy], [lm.r, ac.cy]]);

  // ── Manifold → users (supply spine in the centre gutter, taps to each chip); pack valve → pack → cabin inflow ──
  const cab = N("pn-cab");
  (["l", "r"] as const).forEach((k) => {
    const man = k === "l" ? lm : rm;
    if (!man) return;
    const tone: HydTone = k === "l" ? "a" : "b";
    const live = k === "l" ? f.leftLive : f.rightLive;
    const packLive = k === "l" ? f.packL : f.packR;
    const chips = [0, 1, 2, 3, 4, 5].map((i) => N(`u${k}-${i}`));
    if (chips.some((c) => !c)) return;
    const c = chips as HydRect[];
    // Position order (row-major). left: START, ANTI-ICE, CLEANER, PACK VALVE, TURBOFAN, PACK; right: START, ANTI-ICE, PACK VALVE, CLEANER, PACK, TURBOFAN.
    const valveIdx = k === "l" ? 3 : 2, packIdx = k === "l" ? 5 : 4;
    const taps = [0, 1, 2, 3, 4, 5].filter((i) => i !== packIdx).map((i) => c[i]);
    const lefts = c.filter((_, i) => i % 2 === 0), rights = c.filter((_, i) => i % 2 === 1);
    const spineX = (Math.max(...lefts.map((r) => r.r)) + Math.min(...rights.map((r) => r.l))) / 2;
    const lastY = Math.max(...taps.map((r) => r.cy));
    add(tone, live, [[spineX, man.b], [spineX, lastY]], { arrow: false, dots: taps.map((r) => [spineX, r.cy] as HydPt) });
    taps.forEach((r) => add(tone, live, [[spineX, r.cy], [r.cx < spineX ? r.r : r.l, r.cy]]));
    drop(tone, packLive, c[valveIdx], c[packIdx], c[valveIdx].cx);
    if (cab) {
      const pk = c[packIdx], fromX = k === "l" ? pk.r : pk.l, toX = k === "l" ? cab.l : cab.r, mx = (fromX + toX) / 2;
      add(tone, packLive, [[fromX, pk.cy], [mx, pk.cy], [mx, cab.cy], [toX, cab.cy]]);   // orthogonal elbow into the cabin inflow node
    }
  });
  return wires;
}

function PneuEngineSection({ k, tone, title, run, open, trip, swOn, turning, prvOpen, startOn }: { k: "1" | "2"; tone: "a" | "b"; title: string; run: boolean; open: boolean; trip: boolean; swOn: boolean; turning: boolean; prvOpen: boolean; startOn: boolean }) {
  const border = tone === "a" ? "border-hyd-a/35" : "border-hyd-b/35";
  const head = tone === "a" ? "border-hyd-a/40 bg-hyd-a/5 text-hyd-a" : "border-hyd-b/40 bg-hyd-b/5 text-hyd-b";
  const valveSub = !swOn ? "SWITCH OFF" : trip ? "CLOSED · OVERHEAT TRIP" : !run ? "SWITCH ON · NO ENGINE AIR" : "SWITCH ON · DELIVERING";
  return (
    <section data-hyd={`e${k}-sec`} className={cn("relative z-0 flex min-w-0 flex-col gap-4 rounded-lg border bg-[#0b1015] px-[30px] pb-5 pt-2", border)}>
      <div className={cn("rounded-md border px-1.5 py-1 text-center", head)}>
        <div className="font-display text-[9px] font-semibold uppercase tracking-[0.12em]">{title}</div>
        <div className="text-[5px] uppercase tracking-[0.08em] text-subtle">ATA 36 · ENGINE BLEED → {k === "1" ? "LEFT" : "RIGHT"} MANIFOLD</div>
      </div>
      <div className="grid grid-cols-3 gap-x-3">
        <HydraulicNode compact id={`e${k}-8m`} icon="engine" title="8TH STAGE · MAIN DUCT" subtitle="CHECK VALVE" active={run} tone={tone} liveText="PRESSURE" offText="OFF" />
        <HydraulicNode compact id={`e${k}-13`} icon="valve" title="13TH STAGE MSOV" subtitle="DEMAND · RELIEF ≈106 PSI" active={run} tone={tone} liveText="ON DEMAND" offText="OFF" />
        <HydraulicNode compact id={`e${k}-8b`} icon="engine" title="8TH STAGE · BYPASS DUCT" subtitle="CHECK VALVE · NO PRECOOLER" active={run} tone={tone} liveText="PRESSURE" offText="OFF" />
      </div>
      <div className="grid grid-cols-3 gap-x-3">
        <HydraulicNode compact className="col-span-2" id={`e${k}-pre`} icon="hx" title="PRECOOLER / HEAT EXCHANGER" subtitle="8TH MAIN DUCT + 13TH STAGE MERGE" active={run} tone={tone} liveText="PRESSURE" offText="OFF" />
        <HydraulicNode compact id={`e${k}-fan`} icon="engine" title="FAN AIR · PRECOOLER VALVE" subtitle="EXIT-TEMP CONTROL ≈450°F" active={run} tone={tone} liveText="COOLING" offText="OFF" />
      </div>
      <div className="grid grid-cols-3 gap-x-3">
        <HydraulicNode compact id={`e${k}-ovh`} icon="gauge" title="OVERHEAT SWITCH" subtitle="≈490°F · TRIP LIGHT" active={trip} tone="standby" liveText="TRIPPED" offText="NORMAL" />
        <HydraulicNode compact className="col-span-2" id={`e${k}-valve`} icon="shutoff" title={`ENGINE ${k} BLEED AIR VALVE`} subtitle={valveSub} active={open} tone={tone} liveText="OPEN" offText="CLOSED" />
      </div>
      <div className="grid grid-cols-3 gap-x-3">
        <HydraulicNode compact className="col-span-2" id={`e${k}-ptx`} icon="gauge" title="BLEED DUCT · PRESSURE TRANSMITTER" subtitle={open ? "≈44 PSI" : "0 PSI"} active={open} tone={tone} liveText="FLOW" offText="NO FLOW" />
        <HydraulicNode compact id={`e${k}-tap`} icon="reservoir" title="TO HYD RESERVOIR PRESS" subtitle="ATA 29 · FILTER → REGULATOR" active={open} tone={tone} liveText="SUPPLYING" offText="NO AIR" />
      </div>
      {/* Pressure Ratio Bleed Control — compressor anti-surge bleed (automatic, no cockpit switch) */}
      <div className="grid grid-cols-3 gap-x-3">
        <HydraulicNode compact id={`e${k}-sns`} icon="gauge" title="Pt2 · Ps3 PRESSURE SENSE" subtitle="FRONT-COMPRESSOR RATIO" active={turning} tone={tone} liveText="SENSING" offText="NO SIGNAL" />
        <HydraulicNode compact id={`e${k}-prv`} icon="module" title="PRESSURE RATIO BLEED CONTROL" subtitle={prvOpen ? (startOn ? "START-BLEED OVERRIDE · PS4 AIR" : "LOW–MID POWER · COMMANDING BLEED") : "HIGH POWER · BLEED CLOSED"} active={prvOpen} tone="standby" liveText="BLEEDING" offText="CLOSED" />
        <HydraulicNode compact id={`e${k}-srg`} icon="valve" title="COMPRESSOR SURGE-BLEED VALVES" subtitle="ANTI-STALL · PS4 ACTUATED" active={prvOpen} tone={tone} liveText="OPEN" offText="CLOSED" />
      </div>
      <div className="grid grid-cols-3 gap-x-3">
        <HydraulicNode compact id={`e${k}-cmp`} icon="engine" title={`ENGINE ${k} COMPRESSOR`} subtitle="Pt2 INLET · Ps3 / Ps4 TAPS" active={turning} tone={tone} liveText="TURNING" offText="STOPPED" />
        <HydraulicNode compact id={`e${k}-ovr`} icon="valve" title="STARTER VALVE OVERRIDE" subtitle="OPENS BLEEDS DURING START" active={startOn} tone="standby" liveText="OVERRIDE" offText="NORMAL" />
        <HydraulicNode compact id={`e${k}-dmp`} icon="connection" title="FAN DISCHARGE DUCT" subtitle="SURGE-BLEED DUMP" active={prvOpen} tone={tone} liveText="DUMPING" offText="NO FLOW" />
      </div>
    </section>
  );
}

function FuelTrainerPanel({ s, d }: { s: SimStore; d: ReturnType<typeof useDerived> }) {
  const btn = "rounded border px-2 py-2 text-[9px] font-display uppercase tracking-wide hover:bg-panel disabled:cursor-not-allowed disabled:opacity-45";
  const pct = (v: number) => d.fuelQuantityIndicationPowered ? `${v.toFixed(1)}%` : "NO IND";
  return (
    <TrainingGroup title="ATA 28 · Fuel Feed / Quantity / Crossfeed">
      <div className="grid grid-cols-3 gap-2">
        {([
          ["NO. 1 TANK", s.fuelTank1, d.fuelLowPressure1],
          ["CENTER TANK", s.fuelTankCenter, d.fuelCenterLowPressure],
          ["NO. 2 TANK", s.fuelTank2, d.fuelLowPressure2],
        ] as const).map(([label, qty, low]) => (
          <div key={label} className="rounded border border-border bg-inset px-2 py-2 font-mono text-[9px] uppercase">
            <div className="text-subtle">{label}</div>
            <div className="mt-1 text-fg">QTY {pct(qty)}</div>
            <div className={cn("mt-1", low ? "text-warn" : "text-ok")}>{low ? "LOW PRESSURE" : "PRESSURE OK"}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button className={cn(btn, "border-border bg-inset text-fg")} onClick={() => s.patch({ fuelPump1Fwd: !s.fuelPump1Fwd })}>TANK 1 FWD BOOST · {s.fuelPump1Fwd ? "ON" : "OFF"}</button>
        <button className={cn(btn, "border-border bg-inset text-fg")} onClick={() => s.patch({ fuelPump1Aft: !s.fuelPump1Aft })}>TANK 1 AFT BOOST · {s.fuelPump1Aft ? "ON" : "OFF"}</button>
        <button className={cn(btn, "border-border bg-inset text-fg")} onClick={() => s.patch({ fuelPumpCenter1: !s.fuelPumpCenter1 })}>CTR LEFT BOOST · {s.fuelPumpCenter1 ? "ON" : "OFF"}</button>
        <button className={cn(btn, "border-border bg-inset text-fg")} onClick={() => s.patch({ fuelPumpCenter2: !s.fuelPumpCenter2 })}>CTR RIGHT BOOST · {s.fuelPumpCenter2 ? "ON" : "OFF"}</button>
        <button className={cn(btn, "border-border bg-inset text-fg")} onClick={() => s.patch({ fuelPump2Fwd: !s.fuelPump2Fwd })}>TANK 2 FWD BOOST · {s.fuelPump2Fwd ? "ON" : "OFF"}</button>
        <button className={cn(btn, "border-border bg-inset text-fg")} onClick={() => s.patch({ fuelPump2Aft: !s.fuelPump2Aft })}>TANK 2 AFT BOOST · {s.fuelPump2Aft ? "ON" : "OFF"}</button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button className={cn(btn, "border-accent/50 bg-accent/5 text-fg")} onClick={() => s.patch({ fuelCrossfeed: !s.fuelCrossfeed })}>CROSSFEED VALVE · {d.fuelShutoff1Open || d.fuelShutoff2Open ? (s.fuelCrossfeed ? "OPEN" : "CLOSED") : "CONTROL OFF"}</button>
        <div className="rounded border border-border bg-inset px-2 py-2 font-mono text-[9px] uppercase text-subtle">SCAVENGE · {d.fuelScavengeActive ? `${Math.max(0, 1200 - s.fuelScavengeTimer).toFixed(0)}S REMAIN` : "OFF / WAITING"}</div>
      </div>
      <TrainingSub title="Engine fuel shutoff / fire isolation">
        <div className="grid grid-cols-2 gap-2">
          <div className={cn("rounded border px-2 py-2 font-mono text-[9px] uppercase", d.fuelShutoff1Open ? "border-ok/50 text-ok" : "border-warn/50 text-warn")}>ENG 1 SHUTOFF · {d.fuelShutoff1Open ? "OPEN" : "CLOSED"} · {d.fuelFeedPressure1.toFixed(0)} PSI</div>
          <div className={cn("rounded border px-2 py-2 font-mono text-[9px] uppercase", d.fuelShutoff2Open ? "border-ok/50 text-ok" : "border-warn/50 text-warn")}>ENG 2 SHUTOFF · {d.fuelShutoff2Open ? "OPEN" : "CLOSED"} · {d.fuelFeedPressure2.toFixed(0)} PSI</div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <span className="rounded border border-border bg-inset px-2 py-2 text-[8px] font-mono uppercase text-subtle">ENG 1 SOURCE · {d.fuelFeedSource1}</span>
          <span className="rounded border border-border bg-inset px-2 py-2 text-[8px] font-mono uppercase text-subtle">ENG 2 SOURCE · {d.fuelFeedSource2}</span>
        </div>
      </TrainingSub>
      <TrainingSub title="Servicing / fault test">
        <div className="grid grid-cols-2 gap-2">
          <button className={cn(btn, "border-border bg-inset text-fg")} onClick={() => s.patch({ fuelTank1: 25, fuelTankCenter: 25, fuelTank2: 25 })}>SET LOW FUEL · 25%</button>
          <button className={cn(btn, "border-border bg-inset text-fg")} onClick={() => s.patch({ fuelTank1: 100, fuelTankCenter: 100, fuelTank2: 100 })}>RESET QUANTITY · 100%</button>
        </div>
      </TrainingSub>
    </TrainingGroup>
  );
}

function EngineStartTrainerPanel({ s, d }: { s: SimStore; d: ReturnType<typeof useDerived> }) {
  const [showCutaway, setShowCutaway] = useState(true);
  const btn = "rounded border px-2 py-2 text-[9px] font-display uppercase tracking-wide hover:bg-panel disabled:cursor-not-allowed disabled:opacity-45";
  const engines = [
    { side: 1 as const, n1: s.n1_1, n2: s.n2_1, egt: s.egt1, ff: s.ff1, oil: s.oilPsi1, sw: s.start1, lever: s.lever1, auto: s.autoStart1, running: d.eng1Running, valve: d.startValveOpen1, psi: d.leftDuctPsi, fire: s.engine1FirePulled },
    { side: 2 as const, n1: s.n1_2, n2: s.n2_2, egt: s.egt2, ff: s.ff2, oil: s.oilPsi2, sw: s.start2, lever: s.lever2, auto: s.autoStart2, running: d.eng2Running, valve: d.startValveOpen2, psi: d.rightDuctPsi, fire: s.engine2FirePulled },
  ];
  const status = (e: (typeof engines)[number]) =>
    e.running ? "RUNNING" : e.fire ? "FIRE HANDLE PULLED" : e.auto ? (e.n2 < 20 ? "MOTORING ON STARTER" : "LIGHT-OFF / ACCELERATING") : e.n2 > 1 ? "SPOOLING DOWN" : "SHUT DOWN";
  const engineBlock = (e: (typeof engines)[number]) => (
    <div key={e.side}>
        <TrainingSub title={`Engine ${e.side} · ${status(e)}`}>
          <div className="grid grid-cols-2 gap-2">
            <button className={cn(btn, "border-ok/40 bg-ok/10 text-fg")} disabled={e.running || e.auto || e.fire} onClick={() => s.startEngine(e.side)}>START ENG {e.side}</button>
            <button className={cn(btn, "border-warn/40 bg-warn/10 text-fg")} disabled={!e.running && !e.auto && e.n2 < 1} onClick={() => s.shutdownEngine(e.side)}>{e.auto && !e.running ? "ABORT START" : "SHUTDOWN"} ENG {e.side}</button>
          </div>
          {showCutaway && (
            <EngineCutaway
              className="mt-2"
              side={e.side}
              n1={e.n1}
              n2={e.n2}
              egt={e.egt}
              starterOn={e.valve}
              fuelOn={e.lever && e.n2 > 18 && !e.fire}
              running={e.running}
            />
          )}
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Tape label={`N2-${e.side}`} value={e.n2} unit="%" max={100} tone="caution" />
            <Tape label={`N1-${e.side}`} value={e.n1} unit="%" max={100} tone="caution" />
            <Tape label={`EGT ${e.side}`} value={e.egt} unit="°C" max={600} tone="caution" />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <CaptionLight label={`START VLV ${e.side}`} on={e.valve} tone="caution" />
            <CaptionLight label="START SW GRD" on={e.sw === "GRD"} tone="caution" />
            <CaptionLight label="IDLE" on={e.lever} tone="caution" />
            <CaptionLight label="RUNNING" on={e.running} tone="elec" />
          </div>
          <p className="mt-2 font-mono text-[8px] uppercase text-subtle">FF {Math.round(e.ff)} PPH · OIL {Math.round(e.oil)} PSI · STARTER AIR {Math.round(e.psi)} PSI (≥ 30 REQUIRED)</p>
          {e.side === 2 && (
  <p className="mt-2 text-[10px] leading-relaxed text-subtle">START selects GRD; the pneumatic starter turns N2, IDLE is set automatically at ~20% N2, and the starter cuts out near 38% N2. The P5 START switches and IDLE levers stay live for a manual start.</p>
          )}
        </TrainingSub>
      <TrainingSub title="Engine parameters">
        <CompactEngineParams engine={e.side} />
      </TrainingSub>
    </div>
  );
  return (
    <TrainingGroup title="Engine Start">
      <div className="mb-2 grid grid-cols-3 gap-2 font-mono text-[9px] uppercase">
        <span className={cn("rounded border px-2 py-2", d.dcPower ? "border-ok/40 text-ok" : "border-border text-subtle")}>DC {d.dcPower ? "AVAILABLE" : "OFF"}</span>
        <span className={cn("rounded border px-2 py-2", d.leftDuctPsi >= 30 ? "border-ok/40 text-ok" : "border-border text-subtle")}>L DUCT {Math.round(d.leftDuctPsi)} PSI</span>
        <span className={cn("rounded border px-2 py-2", d.rightDuctPsi >= 30 ? "border-ok/40 text-ok" : "border-border text-subtle")}>R DUCT {Math.round(d.rightDuctPsi)} PSI</span>
      </div>
      <TrainingSub title="Engine start switches · P5">
        <StartModule />
      </TrainingSub>
      {engineBlock(engines[0])}
      <TrainingSub title="Center pedestal">
        <div className="overflow-x-auto">
          <B737200ControlStand />
        </div>
      </TrainingSub>
      <div className="grid grid-cols-2 gap-2">
        <button className={cn(btn, "border-border bg-inset text-fg")} onClick={() => s.patch({ battery: !s.battery })}>BATTERY · {s.battery ? "ON" : "OFF"}</button>
        <button className={cn(btn, "border-border bg-inset text-fg")} disabled={!s.wow} onClick={() => s.patch({ groundPneumaticConnected: !s.groundPneumaticConnected, groundPneumaticPsi: !s.groundPneumaticConnected ? 45 : 0 })}>GROUND AIR CART · {s.groundPneumaticConnected ? "CONNECTED" : "DISCONNECTED"}</button>
        <button className={cn(btn, "border-border bg-inset text-fg")} onClick={() => s.patch({ externalPowerConnected: !s.externalPowerConnected, groundPowerOn: !s.externalPowerConnected })}>GROUND POWER · {s.externalPowerConnected ? "CONNECTED" : "DISCONNECTED"}</button>
        <button className={cn(btn, "border-border bg-inset text-fg")} onClick={() => s.patch({ apuMaster: s.apuMaster === "OFF" ? "ON" : "OFF", apuBleed: s.apuMaster === "OFF" })}>APU + BLEED · {s.apuMaster === "OFF" ? "OFF" : d.apuAvailable ? "AVAILABLE" : "STARTING"}</button>
      </div>
      <button className={cn(btn, "mt-2 w-full border-border bg-inset text-fg")} onClick={() => setShowCutaway((v) => !v)}>ENGINE CUTAWAY · {showCutaway ? "SHOWN" : "HIDDEN"}</button>
      {engineBlock(engines[1])}
    </TrainingGroup>
  );
}

function PneumaticTrainerPanel({ s, d }: { s: SimStore; d: ReturnType<typeof useDerived> }) {
  const { rootRef, geo, size } = useWireGeometry();
  const run1 = !!d.eng1Running, run2 = !!d.eng2Running;
  const open1 = !!d.bleed1Available, open2 = !!d.bleed2Available;
  const trip1 = !!s.bleedTrip1, trip2 = !!s.bleedTrip2;
  // Derived does not expose the APU bleed state; mirror derive.ts (apuBleedOpen) from the sim state.
  const apuOn = !!d.apuAvailable && !!s.apuBleed && Number(s.apuBleedValve ?? 0) > 0.7;
  const groundOn = !!s.groundPneumaticConnected;   // same rule as derive.ts (groundBleed): right manifold only
  const leftLive = !!d.leftManifold, rightLive = !!d.rightManifold;
  const isoOpen = !!d.isolationOpen;
  const packL = !!d.packLFlow, packR = !!d.packRFlow;
  const psiL = Math.round(Number(d.leftDuctPsi ?? 0)), psiR = Math.round(Number(d.rightDuctPsi ?? 0));
  const srcL = [open1 && "ENG 1", apuOn && "APU", isoOpen && (open2 || groundOn) && "XFEED"].filter(Boolean).join(" · ") || "NO SOURCE";
  const srcR = [open2 && "ENG 2", groundOn && "GND", isoOpen && (open1 || apuOn) && "XFEED"].filter(Boolean).join(" · ") || "NO SOURCE";
  const purgeOk = !!s.wow || Number(s.flaps ?? 0) > 0;
  // Pressure Ratio Bleed Control (UI-only model): automatic; surge-bleed valves open at low-to-mid power and while the starter valve overrides.
  const start1 = !!d.startValveOpen1, start2 = !!d.startValveOpen2;
  const turn1 = run1 || start1, turn2 = run2 || start2;
  const prv1 = start1 || (run1 && Number(s.n2_1 ?? 0) < PRV_CLOSE_N2);
  const prv2 = start2 || (run2 && Number(s.n2_2 ?? 0) < PRV_CLOSE_N2);

  const wires = buildPneumaticWires(geo, { run1, run2, open1, open2, trip1, trip2, bleed13_1: !!d.bleed13Available1, bleed13_2: !!d.bleed13Available2, leftLive, rightLive, isoOpen, apuOn, groundOn, packL, packR, turn1, turn2, prv1, prv2, ovr1: start1, ovr2: start2 });

  type Chip = { icon: HydIconName; title: string; sub: string; on: boolean; liveText: string; offText: string };
  const packSub = (sw: boolean, trip: boolean, flow: boolean) => flow ? "OPEN · SCHEDULED FLOW" : !sw ? "SWITCH OFF" : trip ? "TRIPPED" : "SWITCH ON · NO / LOW PRESSURE";
  const sideChips = (k: "l" | "r"): Chip[] => {
    const L = k === "l";
    const n = L ? 1 : 2, live = L ? leftLive : rightLive, pack = L ? packL : packR, open = L ? open1 : open2;
    const start = L ? !!d.startValveOpen1 : !!d.startValveOpen2;
    const ai = L ? !!s.antiIce1 : !!s.antiIce2;
    const packSw = L ? !!s.packL : !!s.packR, packTrip = L ? !!s.packTripL : !!s.packTripR;
    const startC: Chip = { icon: "valve", title: `ENG ${n} STARTER VALVE`, sub: start ? "OPEN · STARTER SUPPLIED" : !(L ? s.startValve1 : s.startValve2) ? "CLOSED · START VALVE SWITCH OFF" : !d.dcPower ? "CLOSED · NO DC POWER" : "CLOSED · NEEDS ≥30 PSI", on: start, liveText: "OPEN", offText: "CLOSED" };
    const aiC: Chip = { icon: "valve", title: "WING THERMAL ANTI-ICE", sub: `SWITCH ${ai ? "ON" : "OFF"}`, on: ai && live, liveText: "HEATING", offText: "OFF" };
    const cleanerC: Chip = { icon: "filter", title: "AIR CLEANER · PURGE VALVE", sub: pack && open ? (purgeOk ? "PURGING · GND / FLAPS EXT" : "CLEANING · PURGE CLOSED") : "ENGINE BLEED · GND / FLAPS", on: pack && open, liveText: "CLEANING", offText: "OFF" };
    const pvC: Chip = { icon: "valve", title: `${L ? "L" : "R"} PACK VALVE`, sub: packSub(packSw, packTrip, pack), on: pack, liveText: "OPEN", offText: "CLOSED" };
    const tfOpen = L ? Number(d.packLTurbofanValve ?? 0) > 0.12 : Number(d.packRTurbofanValve ?? 0) > 0.12;
    const tfC: Chip = { icon: "valve", title: "TURBOFAN VALVE", sub: tfOpen ? "OPEN · ≤~33 PSI / GROUND" : "CLOSED · RAM AIR / FLIGHT", on: tfOpen, liveText: "OPEN", offText: "CLOSED" };
    const packC: Chip = { icon: "hx", title: `${L ? "L" : "R"} AIR COND PACK`, sub: "ACM · HEAT EXCHANGERS", on: pack, liveText: "COOLING", offText: "OFF" };
    return L ? [startC, aiC, cleanerC, pvC, tfC, packC] : [startC, aiC, pvC, cleanerC, packC, tfC];
  };
  const usersCol = (k: "l" | "r", tone: "a" | "b") => (
    <div data-hyd={`u${k}-grp`} className="grid min-w-0 grid-cols-2 gap-x-6 gap-y-3">
      {sideChips(k).map((c, i) => (
        <HydraulicNode key={i} compact id={`u${k}-${i}`} icon={c.icon} title={c.title} subtitle={c.sub} active={c.on} tone={tone} liveText={c.liveText} offText={c.offText} />
      ))}
    </div>
  );

  return (
    <TrainingGroup title="ATA 36 · Pneumatic / Bleed Air Distribution">
      <div ref={rootRef} className="relative space-y-4 overflow-visible px-1 pb-2">
        <div className="grid min-w-0 grid-cols-2 gap-x-14">
          <PneuEngineSection k="1" tone="a" title="ENGINE 1 · LEFT" run={run1} open={open1} trip={trip1} swOn={!!s.bleed1} turning={turn1} prvOpen={prv1} startOn={start1} />
          <PneuEngineSection k="2" tone="b" title="ENGINE 2 · RIGHT" run={run2} open={open2} trip={trip2} swOn={!!s.bleed2} turning={turn2} prvOpen={prv2} startOn={start2} />
        </div>

        {/* Manifolds with the isolation valve, ground connector and APU supply in the centre column */}
        <div className="grid min-w-0 grid-cols-[1fr_130px_1fr] items-stretch gap-x-3">
          <HydraulicNode className="flex flex-col justify-center" id="pn-lm" icon="manifold" title="LEFT MANIFOLD" subtitle={`${psiL} PSI · ${srcL}`} active={leftLive} tone="a" liveText="PRESSURIZED" offText="NO PRESSURE" />
          <div className="flex min-w-0 flex-col justify-between gap-2">
            <HydraulicNode compact id="pn-iso" icon="valve" title="ISOLATION VALVE" subtitle={`${s.isolation} SWITCH`} active={isoOpen} tone="ground" liveText="OPEN" offText="CLOSED" />
            <HydraulicNode compact id="pn-dual" icon="gauge" title="DUAL BLEED LIGHT" subtitle="APU + ENG + ISO OPEN" active={!!d.dualBleed} tone="standby" liveText="ON" offText="OFF" />
            <HydraulicNode compact id="pn-gc" icon="cart" title="GROUND AIR CART" subtitle={groundOn ? `${Math.round(Number(s.groundPneumaticPsi ?? 0))} PSI` : "GROUND ONLY"} active={groundOn} tone="ground" liveText="CONNECTED" offText="OFF" />
            <HydraulicNode compact id="pn-gk" icon="connection" title="GROUND CONNECTOR + CHECK" subtitle="RIGHT PACK BAY · ≤60 PSIG" active={groundOn} tone="ground" liveText="FLOW" offText="OFF" />
            <HydraulicNode compact id="pn-av" icon="valve" title="APU BLEED AIR VALVE" subtitle={`${Math.round(Number(s.apuBleedValve ?? 0) * 100)}% OPEN`} active={apuOn} tone="standby" liveText="OPEN" offText="CLOSED" />
            <HydraulicNode compact id="pn-ad" icon="manifold" title="APU SUPPLY DUCT" subtitle="RELIEF VALVE ≈80 PSI" active={apuOn} tone="standby" liveText="FLOW" offText="OFF" />
            <HydraulicNode compact id="pn-ac" icon="shutoff" title="APU CHECK VALVE" subtitle="BLOCKS ENG → APU FLOW" active={apuOn} tone="standby" liveText="FLOW" offText="OFF" />
          </div>
          <HydraulicNode className="flex flex-col justify-center" id="pn-rm" icon="manifold" title="RIGHT MANIFOLD" subtitle={`${psiR} PSI · ${srcR}`} active={rightLive} tone="b" liveText="PRESSURIZED" offText="NO PRESSURE" />
        </div>

        {/* Users */}
        <div className="grid min-w-0 grid-cols-[1fr_130px_1fr] items-end gap-x-3">
          {usersCol("l", "a")}
          <HydraulicNode compact id="pn-cab" icon="connection" title="CABIN PRESSURIZATION INFLOW" subtitle="L + R PACK OUTPUT" active={packL || packR} tone="ground" liveText="INFLOW" offText="NO INFLOW" />
          {usersCol("r", "b")}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-border/70 pt-2 text-[7px] font-mono uppercase tracking-[.08em] text-subtle">
          <span className="text-hyd-a">■ left / eng 1</span>
          <span className="text-hyd-b">■ right / eng 2</span>
          <span className="text-hyd-s">■ APU · trip control</span>
          <span className="text-accent">■ ground / crossfeed</span>
          <span>animated dashes = airflow · dim = no flow</span>
        </div>
        <HydWireLayer wires={wires} w={size.w} h={size.h} />
      </div>
    </TrainingGroup>
  );
}

/* ─────────────────────────────────────────────────────────────
   ATA 21 / Boeing 737-200 air-conditioning trainer.
   Per AMM 21-00/21-51/21-61: manifold → pack valve → air-mix valve split.
   HOT branch bypasses the ACM → hot check valve → mixing chamber. COLD branch
   → primary HX → ACM compressor → secondary HX → turbine → water separator
   → cold check valve → mixing chamber. The separate 35°F system takes warm
   air from the primary-HX exit and bypasses the ACM to the turbine-discharge /
   separator inlet. Each pack has its own mix valve and mixing chamber before
   the separate control/passenger distribution ducts.
   ───────────────────────────────────────────────────────────── */
type AcSide = {
  k: "l" | "r"; tone: "a" | "b"; title: string; manLive: boolean; psi: number; src: string;
  flowRate: number; coldTempF: number; sensorTempF: number; hotBypassRate: number; warmAirTempF: number; coldAirFlow: number; warmAirFlow: number; mixedAirFlow: number; airMixValve: number; mixTempF: number; mixingChamberTempF: number;
  compressorDischargeTempF: number; turbineInletTempF: number; turbineDischargeTempF: number; compressorOverheat: boolean; turbineOverheat: boolean; packOverheatRelay: boolean; ductOverheat: boolean; ductLimitDemand: boolean; mixValveHotLimit: boolean; mixValveColdLimit: boolean; hotBypassFlow: number; coolingPathFlow: number; f35BypassFlow: number; acmColdFlow: number; separatorFlow: number; f35SensorFailure: boolean; f35ValveFailure: boolean; packTrip250: boolean; packTripActive: boolean; tempControlFault?: string;
  turbofanValve: number;
  sw: boolean; trip: boolean; flow: boolean; engBleed: boolean; ground: boolean; purgeOk: boolean;
};
type AcFlags = { lFlow: boolean; rFlow: boolean; lTf: boolean; rTf: boolean; lPurge: boolean; rPurge: boolean; lHot: boolean; rHot: boolean; lMix: number; rMix: number; lMan: boolean; rMan: boolean; lF35: boolean; rF35: boolean; lSens: boolean; rSens: boolean; any: boolean };

function buildAirCondWires(geo: HydGeo, f: AcFlags): HydWire[] {
  // Hydraulics-style routing: exclusive vertical spines + short horizontal taps.
  // Parallel families never share an X column, so lines cannot overlap.
  const wires: HydWire[] = [];
  const N = (id: string): HydRect | undefined => geo[id];
  const add = (tone: HydTone, active: boolean, pts: HydPt[] | null | undefined) => {
    if (pts && pts.length > 1) wires.push({ tone, active, pts, arrow: true, dots: [] });
  };

  /** Short horizontal stub from a vertical spine into a node edge. */
  const tap = (tone: HydTone, act: boolean, node: HydRect | undefined, xSpine: number) => {
    if (!node) return;
    const toLeft = node.cx >= xSpine;
    add(tone, act, [[xSpine, node.cy], [toLeft ? node.l : node.r, node.cy]]);
  };

  /** Vertical spine segment between two Y values at fixed X (no arrow clutter on intermediate). */
  const spine = (tone: HydTone, act: boolean, x: number, y1: number, y2: number) => {
    if (Math.abs(y1 - y2) < 1) return;
    add(tone, act, [[x, y1], [x, y2]]);
  };

  /** Same-row horizontal between two nodes (edge to edge). */
  const row = (tone: HydTone, act: boolean, a?: HydRect, b?: HydRect) => {
    if (!a || !b) return;
    const rtl = b.cx < a.cx;
    add(tone, act, [[rtl ? a.l : a.r, a.cy], [rtl ? b.r : b.l, b.cy]]);
  };

  /* ── Per-pack wiring ─────────────────────────────────────────────────────────
     Pack layout is a fixed 3-column grid (see AcPackSection):
       MID column  = the bleed/cold-air chain, top → bottom, every hop is a straight
                     vertical wire between vertically adjacent nodes.
       HOT column  = outer side of the pack (L pack: left, R pack: right): hot-air duct,
                     35°F valve, 35°F sensor, hot check valve.
       COOL column = inner side (L pack: right, R pack: left): purge valve, ram-air exhaust
                     (tall node beside the two heat exchangers), turbofan, turbofan valve.
     Rules that keep lines from overlapping:
       • same-row links are one straight horizontal between facing edges
       • same-column links are one straight vertical between facing edges (the cells in
         between are empty, so nothing is crossed)
       • the only two "lane" wires (man → turbofan valve, hot duct → hot check valve) run in
         their own outside lane, one per side, never shared with another wire. */
  const side = (k: "l" | "r", flow: boolean, tfOn: boolean, hotActive: boolean, manLive: boolean, f35On: boolean, sensOn: boolean, purgeOn: boolean) => {
    const g = (n: string) => N(`ac${k}-${n}`);
    const man = g("man"), cln = g("cln"), purge = g("purge"), pv = g("pv");
    const hot = g("hot"), phx = g("phx"), ram = g("ram"), acm = g("acm"), shx = g("shx");
    const turb = g("turb"), tf = g("tf"), sep = g("sep"), tfv = g("tfv"), f35 = g("f35");
    const bag = g("bag"), sens = g("f35s"), cchk = g("cchk"), mix = g("mix"), hchk = g("hchk"), out = g("out");
    const L = k === "l";

    /** straight vertical between two nodes in the same column (edge to facing edge). */
    const vl = (tone: HydTone, act: boolean, a?: HydRect, b?: HydRect) => {
      if (!a || !b) return;
      const down = b.cy > a.cy;
      add(tone, act, [[a.cx, down ? a.b : a.t], [a.cx, down ? b.t : b.b]]);
    };
    /** straight horizontal between two nodes; y lets a tall node (ram) be met at a heat-exchanger's row. */
    const hl = (tone: HydTone, act: boolean, a?: HydRect, b?: HydRect, y?: number) => {
      if (!a || !b) return;
      const ltr = b.cx > a.cx;
      const yy = y ?? a.cy;
      add(tone, act, [[ltr ? a.r : a.l, yy], [ltr ? b.l : b.r, y ?? b.cy]]);
    };

    const nodes = [man, cln, purge, pv, hot, phx, ram, acm, shx, turb, tf, sep, tfv, f35, bag, sens, cchk, mix, hchk, out].filter(Boolean) as HydRect[];
    if (!nodes.length) return;
    const packL = Math.min(...nodes.map((n) => n.l));
    const packR = Math.max(...nodes.map((n) => n.r));
    // outside edge of the HOT column / COOL column for this pack
    const hotEdge = (n: HydRect) => (L ? n.l : n.r);
    const coolEdge = (n: HydRect) => (L ? n.r : n.l);
    const xHotLane = L ? packL - 10 : packR + 10;
    const xCoolLane = L ? packR + 10 : packL - 10;

    // ── Bleed inlet: manifold → air cleaner → pack valve ──
    vl("ground", manLive, man, cln);
    vl("ground", manLive, cln, pv);
    // Air cleaner purge: cleaner → purge valve (same row) → ram-air exhaust (straight down)
    hl("standby", purgeOn, cln, purge);
    vl("ground", purgeOn, purge, ram);

    // ── COLD chain (all straight verticals): pv → phx → acm → shx → turb → sep → coalescer → cold check → mix → out ──
    const cold = [pv, phx, acm, shx, turb, sep, bag, cchk, mix, out];
    for (let i = 0; i < cold.length - 1; i++) vl("ground", flow, cold[i], cold[i + 1]);

    // ── HOT branch: pv → hot duct (same row) → hot check valve (own lane) → mix valve (same row) ──
    hl("standby", hotActive, pv, hot);
    if (hot && hchk) {
      const y1 = hot.cy + 4;
      add("standby", hotActive, [[hotEdge(hot), y1], [xHotLane, y1], [xHotLane, hchk.cy], [hotEdge(hchk), hchk.cy]]);
    }
    hl("standby", hotActive, hchk, mix);

    // ── 35°F system: hot duct → 35°F valve (straight down the HOT column) → separator intake (same row);
    //    sensor at separator discharge (coalescer row) → 35°F valve ──
    vl("standby", f35On, hot, f35);
    hl("standby", f35On, f35, sep);
    hl("standby", sensOn, bag, sens);
    vl("standby", sensOn, sens, f35);

    // ── Cooling-air family: manifold → turbofan valve (own lane) → turbofan → ram exhaust;
    //    primary + secondary HX cooling air exit into the tall ram-air exhaust node on their own rows ──
    if (man && tfv) {
      add("standby", tfOn, [[coolEdge(man), man.cy], [xCoolLane, man.cy], [xCoolLane, tfv.cy], [coolEdge(tfv), tfv.cy]]);
    }
    vl("standby", tfOn, tfv, tf);
    vl("ground", tfOn, tf, ram);
    if (phx && ram) hl("ground", flow, phx, ram, phx.cy);
    if (shx && ram) hl("ground", flow, shx, ram, shx.cy);
  };

  side("l", f.lFlow, f.lTf, f.lHot, f.lMan, f.lF35, f.lSens, f.lPurge);
  side("r", f.rFlow, f.rTf, f.rHot, f.rMan, f.rF35, f.rSens, f.rPurge);

  // ── Distribution: every hop is a straight vertical drop between full-width / half-width rows ──
  const lout = N("acl-out"), rout = N("acr-out");
  const lcold = N("ac-lcold"), rcold = N("ac-rcold"), lhotD = N("ac-lhot"), rhotD = N("ac-rhot");
  const mf = N("ac-mixf"), mp = N("ac-mixp"), chamber = N("ac-chamber"), main = N("ac-maindist");
  const df = N("ac-distf"), dp = N("ac-distp"), cab = N("ac-cabin");
  const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
  /** Vertical drop from a's bottom edge to b's top edge at x (clamped inside both nodes; jogs only if it must). */
  const drop = (tone: HydTone, act: boolean, a: HydRect | undefined, b: HydRect | undefined, x: number) => {
    if (!a || !b) return;
    const x1 = clamp(x, a.l + 6, a.r - 6), x2 = clamp(x, b.l + 6, b.r - 6);
    if (Math.abs(x1 - x2) < 0.5) add(tone, act, [[x1, a.b], [x1, b.t]]);
    else { const y = (a.b + b.t) / 2; add(tone, act, [[x1, a.b], [x1, y], [x2, y], [x2, b.t]]); }
  };

  // Pack outlet (cold, mixed-air side) drops straight into the cold-air node under it.
  drop("ground", f.lFlow, lout, lcold, lcold?.cx ?? 0);
  drop("ground", f.rFlow, rout, rcold, rcold?.cx ?? 0);

  // Hot duct (outer side of each pack) leaves its outer edge into an outer rail and enters the hot-bypass node's outer edge.
  const hotFeed = (act: boolean, hot: HydRect | undefined, to: HydRect | undefined, xRail: number, outerLeft: boolean) => {
    if (!hot || !to) return;
    const y0 = hot.cy - 4;
    add("standby", act, [[outerLeft ? hot.l : hot.r, y0], [xRail, y0], [xRail, to.cy], [outerLeft ? to.l : to.r, to.cy]]);
  };
  const lhotN = N("acl-hot"), rhotN = N("acr-hot");
  if (lhotN) hotFeed(f.lHot, lhotN, lhotD, lhotN.l - 26, true);
  if (rhotN) hotFeed(f.rHot, rhotN, rhotD, rhotN.r + 26, false);

  // Cold + hot → mix valve (two separate drops), mix valves → one mixing chamber → main manifold → ducts → cabin.
  drop("ground", f.lFlow, lcold, mf, lcold?.cx ?? 0);
  drop("standby", f.lHot, lhotD, mf, lhotD?.cx ?? 0);
  drop("ground", f.rFlow, rcold, mp, rcold?.cx ?? 0);
  drop("standby", f.rHot, rhotD, mp, rhotD?.cx ?? 0);
  drop("ground", f.any, mf, chamber, mf?.cx ?? 0);
  drop("ground", f.any, mp, chamber, mp?.cx ?? 0);
  drop("ground", f.any, chamber, main, main?.cx ?? 0);
  drop("ground", f.any, main, df, df?.cx ?? 0);
  drop("ground", f.any, main, dp, dp?.cx ?? 0);
  drop("ground", f.any, df, cab, df?.cx ?? 0);
  drop("ground", f.any, dp, cab, dp?.cx ?? 0);

  return wires;
}

function AcPackSection({ p }: { p: AcSide }) {
  const { k, tone } = p;
  const L = k === "l";
  const border = tone === "a" ? "border-hyd-a/35" : "border-hyd-b/35";
  const head = tone === "a" ? "border-hyd-a/40 bg-hyd-a/5 text-hyd-a" : "border-hyd-b/40 bg-hyd-b/5 text-hyd-b";
  const pvSub = p.flow ? "OPEN · SCHEDULED FLOW" : !p.sw ? "SWITCH OFF" : p.trip ? "TRIPPED" : "SWITCH ON · NO / LOW PRESSURE";
  // ATA 21: Turbofan Valve modulates open below ~27–33 psi regulating range / on ground; closes with ram air.
  const tfOn = p.turbofanValve > 0.12;
  const tfPct = Math.round(p.turbofanValve * 100);
  const purging = p.flow && p.engBleed && p.purgeOk;
  const hotPct = Math.round(p.hotBypassRate * 100);
  // Mirror the outer/inner sides per pack: hot family on the outside, cooling family on the inside.
  const HOTC = L ? 1 : 3;
  const COOLC = L ? 3 : 1;
  const at = (col: number, row: number, colSpan = 1, rowSpan = 1): React.CSSProperties => ({ gridColumn: `${col} / span ${colSpan}`, gridRow: `${row} / span ${rowSpan}` });
  return (
    <section data-hyd={`ac${k}-sec`} className={cn("relative z-0 flex min-w-0 flex-col gap-4 rounded-lg border bg-[#0b1015] px-[30px] pb-5 pt-2", border)}>
      <div className={cn("rounded-md border px-1.5 py-1 text-center", head)}>
        <div className="font-display text-[9px] font-semibold uppercase tracking-[0.12em]">{p.title}</div>
        <div className="text-[5px] uppercase tracking-[0.08em] text-subtle">AMM 21 · HOT BLEED + COLD AIR CYCLE → MIXING</div>
      </div>
      <div className="grid grid-cols-4 gap-x-3 min-w-0 break-words text-[7px] font-mono uppercase tracking-[.03em]">
        <div className={cn("rounded border px-2 py-1.5", p.compressorOverheat ? "border-red-400/70 bg-red-400/10 text-red-300" : "border-border/60 text-subtle")}>COMP DISCH {Math.round(p.compressorDischargeTempF)}°F</div>
        <div className={cn("rounded border px-2 py-1.5", p.turbineOverheat ? "border-red-400/70 bg-red-400/10 text-red-300" : "border-border/60 text-subtle")}>TURB IN {Math.round(p.turbineInletTempF)}°F</div>
        <div className={cn("rounded border px-2 py-1.5", p.ductOverheat ? "border-red-400/70 bg-red-400/10 text-red-300" : p.ductLimitDemand ? "border-amber-400/60 bg-amber-400/10 text-amber-300" : "border-border/60 text-subtle")}>DUCT {p.ductOverheat ? "OVERHEAT" : p.ductLimitDemand ? "LIMIT" : "NORMAL"}</div>
        <div className={cn("rounded border px-2 py-1.5", p.packOverheatRelay || p.packTrip250 ? "border-red-400/70 bg-red-400/10 text-red-300" : "border-border/60 text-subtle")}>PACK PROTECTION {p.packOverheatRelay || p.packTrip250 ? "TRIP" : "NORMAL"}</div>
      </div>
      <div className="grid grid-cols-2 gap-x-3 min-w-0 break-words text-[7px] font-mono uppercase tracking-[.03em]">
        <div className="rounded border border-hyd-s/30 bg-hyd-s/5 px-2 py-1.5 text-hyd-s">WARM / SEMI-CONDITIONED · {Math.round(p.warmAirTempF)}°F · {Math.round(p.warmAirFlow * 100)}%</div>
        <div className="rounded border border-accent/30 bg-accent/5 px-2 py-1.5 text-accent">COLD CORE · {Math.round(p.coldTempF)}°F · {Math.round(p.coldAirFlow * 100)}%</div>
      </div>
      {/* 3-column pack grid. MID = bleed/cold chain; HOT column = outer side; COOL column = inner side. Wires: buildAirCondWires. */}
      <div className="grid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))", columnGap: 20, rowGap: 16 }}>
        <HydraulicNode compact minimal style={at(1, 1, 3, 1)} id={`ac${k}-man`} icon="manifold" title={`${L ? "LEFT" : "RIGHT"} MANIFOLD AIR`} subtitle={`${p.psi} PSI · ${p.src} · ≈40–46 PSI NORMAL`} active={p.manLive} tone={tone} liveText="PRESSURIZED" offText="NO PRESSURE" />
        <HydraulicNode compact minimal style={at(2, 2, 1, 1)} id={`ac${k}-cln`} icon="filter" title="INERTIAL AIR CLEANER" subtitle="DOWNSTREAM OF PRECOOLER · DUST / SAND COLLECTS IN RING" active={p.manLive} tone={tone} liveText="CLEANING" offText="NO AIR" />
        <HydraulicNode compact minimal style={at(COOLC, 2, 1, 1)} id={`ac${k}-purge`} icon="valve" title="AIR CLEANER PURGE VALVE" subtitle={purging ? "OPEN · VENTING DEBRIS TO RAM EXHAUST" : "CLOSED · GROUND / FLAPS LOGIC"} active={purging} tone="standby" liveText="PURGING" offText="CLOSED" />
        <HydraulicNode compact minimal style={at(2, 3, 1, 1)} id={`ac${k}-pv`} icon="valve" title={`${L ? "L" : "R"} PACK VALVE`} subtitle={p.flow ? `${pvSub} · FLOW ${Math.round(p.flowRate * 100)}%` : pvSub} active={p.flow} tone={tone} liveText="OPEN" offText="CLOSED" />
        <HydraulicNode compact minimal style={at(HOTC, 3, 1, 1)} id={`ac${k}-hot`} icon="manifold" title="HOT-AIR BYPASS DUCT" subtitle={`MIX VALVE HOT ${Math.round(p.airMixValve * 100)}% · TO MIXING CHAMBER`} active={p.warmAirFlow > 0.01} tone="standby" liveText="HOT AIR" offText="NO HOT FLOW" />
        <HydraulicNode compact minimal style={at(2, 4, 1, 1)} id={`ac${k}-phx`} icon="hx" title="PRIMARY HEAT EXCHANGER" subtitle="COOLS HOT BLEED WITH RAM / TURBOFAN AIR" active={p.flow} tone="ground" liveText="COOLING" offText="OFF" />
        <HydraulicNode compact minimal style={at(COOLC, 4, 1, 3)} className="flex flex-col justify-center" id={`ac${k}-ram`} icon="connection" title="RAM-AIR EXHAUST DUCT" subtitle="HEAT-EXCHANGER / TURBOFAN AIR OVERBOARD" active={tfOn || p.flow} tone="ground" liveText="EXHAUSTING" offText="NO FLOW" />
        <HydraulicNode compact minimal style={at(2, 5, 1, 1)} id={`ac${k}-acm`} icon="module" title="ACM COMPRESSOR" subtitle="COMMON-SHAFT AIR CYCLE MACHINE" active={p.flow} tone={tone} liveText="COMPRESSING" offText="OFF" />
        <HydraulicNode compact minimal style={at(2, 6, 1, 1)} id={`ac${k}-shx`} icon="hx" title="SECONDARY HEAT EXCHANGER" subtitle="REMOVES ACM COMPRESSION HEAT" active={p.flow} tone="ground" liveText="COOLING" offText="OFF" />
        <HydraulicNode compact minimal style={at(2, 7, 1, 1)} id={`ac${k}-turb`} icon="module" title="ACM EXPANSION TURBINE" subtitle={p.flow ? `RAPID EXPANSION · ${Math.round(p.coldTempF)}°F COLD CORE` : "RAPID EXPANSION"} active={p.flow} tone="ground" liveText="EXPANDING / COLD" offText="OFF" />
        <HydraulicNode compact minimal style={at(COOLC, 7, 1, 1)} id={`ac${k}-tf`} icon="engine" title="TURBOFAN" subtitle={tfOn ? `SPINNING · ${tfPct}% DRIVE AIR` : "STOPPED · NO DRIVE AIR"} active={tfOn} tone="ground" liveText="SPINNING" offText="STOPPED" />
        <HydraulicNode compact minimal style={at(2, 8, 1, 1)} id={`ac${k}-sep`} icon="filter" title="WATER SEPARATOR + COALESCER" subtitle="REMOVES CONDENSED MOISTURE · DRAINS OVERBOARD" active={p.flow} tone="ground" liveText="SEPARATING" offText="OFF" />
        <HydraulicNode compact minimal style={at(COOLC, 8, 1, 1)} id={`ac${k}-tfv`} icon="valve" title="TURBOFAN VALVE" subtitle={tfOn ? `OPEN ${tfPct}% · ≤~33 PSI / GROUND` : "CLOSED · RAM AIR / FLIGHT"} active={tfOn} tone={tone} liveText="OPEN" offText="CLOSED" />
        <HydraulicNode compact minimal style={at(HOTC, 8, 1, 1)} id={`ac${k}-f35`} icon="valve" title="35°F CONTROL VALVE" subtitle={`${hotPct}% WARM BYPASS → SEPARATOR INTAKE · ANTI-ICE ~35°F`} active={p.hotBypassRate > 0.02 && !p.f35ValveFailure} tone="standby" liveText="MODULATING" offText={p.f35ValveFailure ? "FAILED CLOSED" : "CLOSED"} />
        <HydraulicNode compact minimal style={at(2, 9, 1, 1)} id={`ac${k}-bag`} icon="filter" title="SEPARATOR COALESCER BAG" subtitle="INSIDE SEPARATOR HOUSING · COALESCES FINE DROPLETS" active={p.flow} tone="ground" liveText="FILTERING" offText="OFF" />
        <HydraulicNode compact minimal style={at(HOTC, 9, 1, 1)} id={`ac${k}-f35s`} icon="gauge" title="35°F SENSOR" subtitle={p.flow ? `${p.sensorTempF.toFixed(1)}°F · AT SEPARATOR DISCHARGE` : "NO TEMPERATURE"} active={p.flow && !p.f35SensorFailure} tone="standby" liveText="SENSING" offText={p.f35SensorFailure ? "FAILED" : "OFF"} />
        <HydraulicNode compact minimal style={at(2, 10, 1, 1)} id={`ac${k}-cchk`} icon="valve" title="COLD-AIR CHECK VALVE" subtitle={`${Math.round(p.coldAirFlow * 100)}% FLOW → MIXING`} active={p.coldAirFlow > 0.01} tone="ground" liveText="OPEN / FLOW" offText="NO FLOW" />
        <HydraulicNode compact minimal style={at(2, 11, 1, 1)} id={`ac${k}-mix`} icon="valve" title={`${L ? "L" : "R"} AIR-MIX VALVE`} subtitle={`${Math.round(p.airMixValve * 100)}% HOT · ${Math.round((1 - p.airMixValve) * 100)}% COLD · ${p.mixValveHotLimit ? "FULL HOT" : p.mixValveColdLimit ? "FULL COLD (PACK CLOSED / OFF)" : "MODULATING"}`} active={p.flow && p.airMixValve > 0.001} tone="ground" liveText="POSITIONED" offText="FULL COLD / OFF" />
        <HydraulicNode compact minimal style={at(HOTC, 11, 1, 1)} id={`ac${k}-hchk`} icon="valve" title="HOT-AIR CHECK VALVE" subtitle={`${Math.round(p.warmAirFlow * 100)}% FLOW → MIXING`} active={p.warmAirFlow > 0.01} tone="standby" liveText="OPEN / FLOW" offText="NO FLOW" />
        <HydraulicNode compact minimal style={at(1, 12, 3, 1)} id={`ac${k}-out`} icon="connection" title={`${L ? "L" : "R"} PACK CONDITIONED-AIR OUTLET`} subtitle={p.flow ? `${Math.round(p.mixTempF)}°F MIXED · ${Math.round(p.mixedAirFlow * 100)}% → MIXING CHAMBER` : "NO CONDITIONED AIR"} active={p.flow} tone="ground" liveText="MIXED AIR" offText="NO OUTPUT" />
      </div>
    </section>
  );
}

function AirConditioningTrainerPanel({ s, d }: { s: SimStore; d: ReturnType<typeof useDerived> }) {
  const { rootRef, geo, size } = useWireGeometry();
  const wow = !!s.wow;
  const purgeOk = wow || Number(s.flaps ?? 0) > 0;
  const flowL = !!d.packLFlow, flowR = !!d.packRFlow;
  const any = flowL || flowR;
  const open1 = !!d.bleed1Available, open2 = !!d.bleed2Available;
  const apuOn = !!d.apuAvailable && !!s.apuBleed && Number(s.apuBleedValve ?? 0) > 0.7;
  const groundOn = !!s.groundPneumaticConnected;
  const isoOpen = !!d.isolationOpen;
  const srcL = [open1 && "ENG 1", apuOn && "APU", isoOpen && (open2 || groundOn) && "XFEED"].filter(Boolean).join(" · ") || "NO SOURCE";
  const srcR = [open2 && "ENG 2", groundOn && "GND", isoOpen && (open1 || apuOn) && "XFEED"].filter(Boolean).join(" · ") || "NO SOURCE";
  const left: AcSide = { k: "l", tone: "a", title: "LEFT PACK", manLive: !!d.leftManifold, psi: Math.round(Number(d.leftDuctPsi ?? 0)), src: srcL, flowRate: Number(d.packLFlowRate ?? 0), coldTempF: Number(d.packLColdTempF ?? 0), sensorTempF: Number(d.packL35SensorTempF ?? 0), hotBypassRate: Number(d.packLHotBypassRate ?? 0), warmAirTempF: Number(d.packLWarmAirTempF ?? 0), coldAirFlow: Number(d.packLColdAirFlow ?? 0), warmAirFlow: Number(d.packLWarmAirFlow ?? 0), mixedAirFlow: Number(d.packLMixedAirFlow ?? 0), airMixValve: Number(d.packLAirMixValve ?? 0), mixTempF: Number(d.packLMixTempF ?? 0), mixingChamberTempF: Number(d.packLMixingChamberTempF ?? 0), compressorDischargeTempF: Number(d.packLCompressorDischargeTempF ?? 0), turbineInletTempF: Number(d.packLTurbineInletTempF ?? 0), turbineDischargeTempF: Number(d.packLTurbineDischargeTempF ?? 0), compressorOverheat: !!d.packLCompressorOverheat, turbineOverheat: !!d.packLTurbineOverheat, packOverheatRelay: !!d.packLPackOverheatRelay, ductOverheat: !!d.packLDuctOverheat, ductLimitDemand: !!d.packLDuctLimitDemand, mixValveHotLimit: !!d.packLMixValveHotLimit, mixValveColdLimit: !!d.packLMixValveColdLimit, hotBypassFlow: Number(d.packLHotBypassFlow ?? 0), coolingPathFlow: Number(d.packLCoolingPathFlow ?? 0), f35BypassFlow: Number(d.packLF35BypassFlow ?? 0), acmColdFlow: Number(d.packLAcColdFlow ?? 0), separatorFlow: Number(d.packLSeparatorFlow ?? 0), f35SensorFailure: !!d.packLF35SensorFailure, f35ValveFailure: !!d.packLF35ValveFailure, packTrip250: !!d.packLPackTrip250, packTripActive: !!d.packLTripActive, tempControlFault: String(s.tempControlFaultL ?? "NONE"), turbofanValve: Number(d.packLTurbofanValve ?? 0), sw: !!s.packL, trip: !!s.packTripL, flow: flowL, engBleed: open1, ground: wow, purgeOk };
  const right: AcSide = { k: "r", tone: "b", title: "RIGHT PACK", manLive: !!d.rightManifold, psi: Math.round(Number(d.rightDuctPsi ?? 0)), src: srcR, flowRate: Number(d.packRFlowRate ?? 0), coldTempF: Number(d.packRColdTempF ?? 0), sensorTempF: Number(d.packR35SensorTempF ?? 0), hotBypassRate: Number(d.packRHotBypassRate ?? 0), warmAirTempF: Number(d.packRWarmAirTempF ?? 0), coldAirFlow: Number(d.packRColdAirFlow ?? 0), warmAirFlow: Number(d.packRWarmAirFlow ?? 0), mixedAirFlow: Number(d.packRMixedAirFlow ?? 0), airMixValve: Number(d.packRAirMixValve ?? 0), mixTempF: Number(d.packRMixTempF ?? 0), mixingChamberTempF: Number(d.packRMixingChamberTempF ?? 0), compressorDischargeTempF: Number(d.packRCompressorDischargeTempF ?? 0), turbineInletTempF: Number(d.packRTurbineInletTempF ?? 0), turbineDischargeTempF: Number(d.packRTurbineDischargeTempF ?? 0), compressorOverheat: !!d.packRCompressorOverheat, turbineOverheat: !!d.packRTurbineOverheat, packOverheatRelay: !!d.packRPackOverheatRelay, ductOverheat: !!d.packRDuctOverheat, ductLimitDemand: !!d.packRDuctLimitDemand, mixValveHotLimit: !!d.packRMixValveHotLimit, mixValveColdLimit: !!d.packRMixValveColdLimit, hotBypassFlow: Number(d.packRHotBypassFlow ?? 0), coolingPathFlow: Number(d.packRCoolingPathFlow ?? 0), f35BypassFlow: Number(d.packRF35BypassFlow ?? 0), acmColdFlow: Number(d.packRAcmColdFlow ?? 0), separatorFlow: Number(d.packRSeparatorFlow ?? 0), f35SensorFailure: !!d.packRF35SensorFailure, f35ValveFailure: !!d.packRF35ValveFailure, packTrip250: !!d.packRPackTrip250, packTripActive: !!d.packRTripActive, tempControlFault: String(s.tempControlFaultR ?? "NONE"), turbofanValve: Number(d.packRTurbofanValve ?? 0), sw: !!s.packR, trip: !!s.packTripR, flow: flowR, engBleed: open2, ground: wow, purgeOk };

  const mixC = Number(s.mixCabin ?? 0), mixP = Number(s.mixPass ?? 0);
  const lTf = left.turbofanValve > 0.12;
  const rTf = right.turbofanValve > 0.12;
  const wires = buildAirCondWires(geo, {
    lFlow: flowL, rFlow: flowR,
    lTf, rTf,
    lPurge: flowL && open1 && purgeOk, rPurge: flowR && open2 && purgeOk,
    lHot: left.warmAirFlow > 0.001, rHot: right.warmAirFlow > 0.001,
    lMix: left.airMixValve, rMix: right.airMixValve,
    lMan: left.manLive, rMan: right.manLive,
    lF35: left.hotBypassRate > 0.02 && !left.f35ValveFailure, rF35: right.hotBypassRate > 0.02 && !right.f35ValveFailure,
    lSens: flowL && !left.f35SensorFailure, rSens: flowR && !right.f35SensorFailure,
    any,
  });

  return (
    <TrainingGroup title="ATA 21 · Air Conditioning (AMM Ch. 21)">
      <div className="mb-2 grid grid-cols-2 gap-1.5">
        <HydraulicTrainerSwitch label="L PACK" state={s.packL ? "ON" : "OFF"} tone="accent" detail={flowL ? "FLOWING" : s.packTripL ? "TRIPPED" : "NO FLOW"} onClick={() => s.patch({ packL: !s.packL })} />
        <HydraulicTrainerSwitch label="R PACK" state={s.packR ? "ON" : "OFF"} tone="accent" detail={flowR ? "FLOWING" : s.packTripR ? "TRIPPED" : "NO FLOW"} onClick={() => s.patch({ packR: !s.packR })} />
      </div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <button type="button" className="rounded border border-amber-500/40 bg-amber-500/5 px-2 py-1 text-[8px] font-mono uppercase text-amber-300" onClick={() => s.patch({ packTripL: false })}>L PACK TRIP RESET</button>
        <button type="button" className="rounded border border-amber-500/40 bg-amber-500/5 px-2 py-1 text-[8px] font-mono uppercase text-amber-300" onClick={() => s.patch({ packTripR: false })}>R PACK TRIP RESET</button>
      </div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        {([
          ["L", "tempModeL", "tempSelectL", "mixCabin", s.tempModeL ?? "AUTO", Number(s.tempSelectL ?? 75), mixC],
          ["R", "tempModeR", "tempSelectR", "mixPass", s.tempModeR ?? "AUTO", Number(s.tempSelectR ?? 75), mixP],
        ] as const).map(([side, modeKey, selKey, mixKey, mode, selected, mix]) => (
          <div key={side} className="rounded border border-border/70 bg-black/20 p-2">
            <div className="mb-1 text-[7px] font-mono uppercase tracking-[.08em] text-subtle">{side === "L" ? "CONT" : "PASS"} CABIN · P5-17 SELECTOR (ATA 21)</div>
            <div className="grid grid-cols-2 gap-1">
              {(["AUTO", "MANUAL_COOL", "MANUAL_WARM", "OFF"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => s.patch({ [modeKey]: m } as Partial<SimState>)}
                  className={cn(
                    "rounded border px-1.5 py-1 text-[7px] font-mono uppercase",
                    mode === m || (m === "MANUAL_COOL" && mode === "MANUAL") ? "border-accent/70 bg-accent/10 text-accent" : "border-border bg-inset",
                  )}
                >
                  {m === "MANUAL_COOL" ? "MAN COOL" : m === "MANUAL_WARM" ? "MAN WARM" : m}
                </button>
              ))}
            </div>
            <ControlSlider label={`${side} AUTO SELECTOR · 65–85°F`} value={selected} onChange={(v) => s.patch({ [selKey]: v } as Partial<SimState>)} min={65} max={85} step={1} disabled={mode !== "AUTO"} />
            <div className="mt-1 text-center text-[7px] font-mono uppercase tracking-[.08em] text-subtle">
              AIR MIX VALVE {Math.round((side === "L" ? Number(d.packLAirMixValve ?? mix) : Number(d.packRAirMixValve ?? mix)) * 100)}% HOT · {mode === "MANUAL" ? "MANUAL" : mode.replace("_", " ")}
            </div>
          </div>
        ))}
      </div>
      <div className="mb-3 grid grid-cols-4 gap-2 text-[7px] font-mono uppercase tracking-[.08em]">
        <div className="rounded border border-border/60 px-2 py-1.5">CONT CABIN {Math.round(Number(d.controlCabinTempF ?? 75))}°F</div>
        <div className="rounded border border-border/60 px-2 py-1.5">CONT DUCT {Math.round(Number(d.controlCabinSupplyTempF ?? 0))}°F</div>
        <div className="rounded border border-border/60 px-2 py-1.5">PASS CABIN {Math.round(Number(d.passengerCabinTempF ?? 75))}°F</div>
        <div className="rounded border border-border/60 px-2 py-1.5">PASS DUCT {Math.round(Number(d.passengerCabinSupplyTempF ?? 0))}°F</div>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <ControlSlider label="CONT CABIN FINE MIX (COLD→HOT · LEGACY)" value={mixC} onChange={(v) => s.patch({ mixCabin: v, tempModeL: "MANUAL" })} min={0} max={1} step={0.01} disabled={(s.tempModeL ?? "AUTO") === "AUTO" || (s.tempModeL ?? "") === "OFF"} />
        <ControlSlider label="PASS CABIN FINE MIX (COLD→HOT · LEGACY)" value={mixP} onChange={(v) => s.patch({ mixPass: v, tempModeR: "MANUAL" })} min={0} max={1} step={0.01} disabled={(s.tempModeR ?? "AUTO") === "AUTO" || (s.tempModeR ?? "") === "OFF"} />
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        {([
          ["L", "tempControlFaultL", s.tempControlFaultL ?? "NONE"],
          ["R", "tempControlFaultR", s.tempControlFaultR ?? "NONE"],
        ] as const).map(([side, key, value]) => (
          <div key={side} className="rounded border border-border/70 bg-black/20 p-2">
            <div className="mb-1 text-[7px] font-mono uppercase tracking-[.08em] text-subtle">{side} TEMP CONTROL FAULT</div>
            <select value={value} onChange={(e) => s.patch({ [key]: e.target.value } as Partial<SimState>)} className="w-full rounded border border-border bg-[#090d11] px-2 py-1 text-[8px] font-mono uppercase text-foreground">
              <option value="NONE">NORMAL</option>
              <option value="STUCK_COLD">MIX VALVE STUCK COLD</option>
              <option value="STUCK_HOT">MIX VALVE STUCK HOT</option>
              <option value="SENSOR_FAIL">TEMP SENSOR FAIL</option>
              <option value="REGULATOR_FAIL">TEMP REGULATOR FAIL</option>
              <option value="DUCT_OVERHEAT">FORCE 190°F DUCT OVERHEAT</option>
              <option value="DUCT_OVERHEAT_250">FORCE 250°F DUCT PACK TRIP</option>
              <option value="COMPRESSOR_OVERHEAT">FORCE 365°F COMPRESSOR OVERHEAT</option>
              <option value="TURBINE_OVERHEAT">FORCE 210°F TURBINE INLET OVERHEAT</option>
              <option value="PACK_OVERHEAT">FORCE PACK OVERHEAT</option>
              <option value="F35_SENSOR_FAIL">35°F SENSOR FAIL</option>
              <option value="F35_VALVE_FAIL">35°F VALVE FAIL</option>
            </select>
          </div>
        ))}
      </div>
      <div ref={rootRef} className="relative space-y-4 overflow-visible px-1 pb-2">
        <div className="grid min-w-0 grid-cols-2 gap-x-14">
          <AcPackSection p={left} />
          <AcPackSection p={right} />
        </div>

        <Box className="border-accent/35 bg-[#0d1013] p-2.5">
          {/* Cold air and hot bypass side by side per pack (hot on the outside, cold on the inside — same as the packs above). */}
          <div className="grid grid-cols-2 gap-x-14">
            <div className="grid grid-cols-2 gap-x-3">
              <HydraulicNode compact minimal id="ac-lhot" icon="manifold" title="L HOT BYPASS" subtitle="" active={flowL && left.warmAirFlow > 0.01} tone="standby" />
              <HydraulicNode compact minimal id="ac-lcold" icon="connection" title="L COLD AIR" subtitle="" active={flowL} tone="a" />
            </div>
            <div className="grid grid-cols-2 gap-x-3">
              <HydraulicNode compact minimal id="ac-rcold" icon="connection" title="R COLD AIR" subtitle="" active={flowR} tone="b" />
              <HydraulicNode compact minimal id="ac-rhot" icon="manifold" title="R HOT BYPASS" subtitle="" active={flowR && right.warmAirFlow > 0.01} tone="standby" />
            </div>
          </div>
          <div className="hidden" aria-hidden>
            <HydraulicNode compact minimal id="ac-coldin" icon="connection" title="COLD" subtitle="" active={any} tone="ground" />
            <HydraulicNode compact minimal id="ac-hottrim" icon="manifold" title="HOT" subtitle="" active={any} tone="standby" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-14">
            <HydraulicNode compact minimal id="ac-mixf" icon="valve" title="MIX VALVE · CONT CABIN" subtitle="" active={any} tone="ground" />
            <HydraulicNode compact minimal id="ac-mixp" icon="valve" title="MIX VALVE · PASS CABIN" subtitle="" active={any} tone="ground" />
          </div>
          <HydraulicNode compact minimal className="mt-4" id="ac-chamber" icon="manifold" title="MIXING CHAMBER" subtitle="" active={any} tone="ground" />
          <HydraulicNode compact minimal className="mt-4" id="ac-maindist" icon="manifold" title="MAIN DISTRIBUTION MANIFOLD" subtitle="" active={any} tone="ground" />
          <div className="mt-4 grid grid-cols-2 gap-x-14">
            <HydraulicNode compact minimal id="ac-distf" icon="connection" title="CONT CABIN DISTRIBUTION" subtitle="" active={any} tone="ground" />
            <HydraulicNode compact minimal id="ac-distp" icon="connection" title="PASS CABIN DISTRIBUTION" subtitle="" active={any} tone="ground" />
          </div>
          <HydraulicNode compact minimal className="mt-4" id="ac-cabin" icon="connection" title="TO OUTFLOW VALVE / PRESSURIZATION" subtitle="" active={any} tone="ground" />
        </Box>

        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-border/70 pt-2 text-[7px] font-mono uppercase tracking-[.08em] text-subtle">
          <span className="text-hyd-a">■ left pack</span>
          <span className="text-hyd-b">■ right pack</span>
          <span className="text-hyd-s">■ hot-air bypass</span>
          <span className="text-accent">■ cooling / mixed air</span>
          <span>animated dashes = airflow · dim = no flow</span>
        </div>
        <HydWireLayer wires={wires} w={size.w} h={size.h} />
      </div>
    </TrainingGroup>
  );
}

/* ─────────────────────────────────────────────────────────────
   Cabin pressurization trainer — Cabin Technical Reference (AMM Ch. 21, pressurization items):
   pack airflow is the inflow; the outflow valve (28V DC torque motor; AUTO / STBY / MAN AC / MAN DC) is the controlled
   outflow (~7–7.5 psi diff); the mechanical safety relief valve is the backup (opens ~8–8.5 psi diff).
   ───────────────────────────────────────────────────────────── */
type CpFlags = { inflow: boolean; outOpen: boolean; relOpen: boolean; ctlOn: boolean };

function buildCabinWires(geo: HydGeo, f: CpFlags): HydWire[] {
  const wires: HydWire[] = [];
  const N = (id: string): HydRect | undefined => geo[id];
  const add = (tone: HydTone, active: boolean, pts: HydPt[] | null | undefined) => {
    if (pts && pts.length > 1) wires.push({ tone, active, pts, arrow: true, dots: [] });
  };
  const drop = (tone: HydTone, act: boolean, a?: HydRect, b?: HydRect, x?: number) => {
    if (a && b) add(tone, act, [[x ?? a.cx, a.b], [x ?? a.cx, b.t]]);
  };
  const inn = N("cp-in"), cab = N("cp-cab"), ctl = N("cp-ctl"), out = N("cp-out"), rel = N("cp-rel"), ind = N("cp-ind"), ovb = N("cp-ovb");
  drop("ground", f.inflow, inn, cab);                       // pack air in
  drop("standby", f.ctlOn, cab, ctl, ctl?.cx);              // cabin pressure sensed by the controller
  drop("ground", f.outOpen, cab, out, out?.cx);             // controlled outflow
  drop("ground", f.relOpen, cab, rel, rel?.cx);             // backup relief (only when over limit)
  if (ctl && out) add("standby", f.ctlOn, [[ctl.r, ctl.cy], [out.l, out.cy]]);   // controller drives the outflow valve motor
  drop("standby", f.ctlOn, ctl, ind);                       // controller → P5-6 indications
  drop("ground", f.outOpen, out, ovb, out?.cx);
  drop("ground", f.relOpen, rel, ovb, rel?.cx);
  return wires;
}

function CabinPressurizationTrainerPanel({ s, d }: { s: SimStore; d: ReturnType<typeof useDerived> }) {
  const { rootRef, geo, size } = useWireGeometry();
  const flowL = !!d.packLFlow, flowR = !!d.packRFlow;
  const inflow = flowL || flowR;
  const supplyFlow = Number(d.cabinSupplyFlow ?? 0);
  const exhaustFlow = Number(d.cabinExhaustFlow ?? s.outflow ?? 0);
  const diff = Number(s.cabinDiff ?? 0);
  const outflow = Number(s.outflow ?? 0);
  const outPct = Math.round(outflow * 100);
  const dc = !!d.dcPower;
  const mode = s.pressMode;
  const modeLabel: Record<string, string> = { AUTO: "AUTO", STBY: "STANDBY", MAN_AC: "MANUAL AC", MAN_DC: "MANUAL DC" };
  const manual = mode === "MAN_AC" || mode === "MAN_DC";
  const outOpen = outflow > 0.05;
  const relOpen = diff > 8.0;
  const pressurized = diff > 0.5;
  const wires = buildCabinWires(geo, { inflow, outOpen, relOpen, ctlOn: dc });
  const btn = "rounded border px-2 py-2 text-[9px] font-display uppercase tracking-wide text-fg hover:bg-panel disabled:cursor-not-allowed disabled:opacity-45";

  return (
    <TrainingGroup title="ATA 21 · Cabin Pressurization (AMM Ch. 21)">
      <div className="mb-2 grid grid-cols-4 gap-1.5">
        {(["AUTO", "STBY", "MAN_AC", "MAN_DC"] as const).map((m) => (
          <button key={m} type="button" onClick={() => s.patch({ pressMode: m })} className={cn(btn, mode === m ? "border-accent/60 bg-accent/10" : "border-border bg-inset")}>{modeLabel[m]}</button>
        ))}
      </div>
      <div className="mb-3 grid grid-cols-2 gap-1.5">
        <button type="button" disabled={!manual} onClick={() => s.patch({ outflow: Math.min(1, outflow + 0.1) })} className={cn(btn, "border-border bg-inset")}>OUTFLOW VALVE · OPEN</button>
        <button type="button" disabled={!manual} onClick={() => s.patch({ outflow: Math.max(0, outflow - 0.1) })} className={cn(btn, "border-border bg-inset")}>OUTFLOW VALVE · CLOSE</button>
      </div>
      <div ref={rootRef} className="relative space-y-4 overflow-visible px-1 pb-2">
        <HydraulicNode compact id="cp-in" icon="connection" title="PACK AIR INFLOW · FROM AIR CONDITIONING" subtitle={`${flowL ? "L PACK FLOW" : "L PACK OFF"} · ${flowR ? "R PACK FLOW" : "R PACK OFF"} · SUPPLY ${Math.round(supplyFlow * 100)}% · AIR MIX VALVES → CABIN`} active={inflow} tone="ground" liveText="INFLOW" offText="NO INFLOW" />
        <HydraulicNode compact id="cp-cab" icon="reservoir" title="PRESSURIZED CABIN · PRESSURE VESSEL" subtitle={s.wow ? "ON GROUND · NOT PRESSURIZED" : `DIFFERENTIAL ${diff.toFixed(1)} PSI · WINDOWS CONTAIN FULL DIFF`} active={pressurized} tone="ground" liveText="PRESSURIZED" offText="UNPRESSURIZED" />
        <div className="grid grid-cols-3 gap-x-3">
          <HydraulicNode compact id="cp-ctl" icon="module" title="PRESSURIZATION CONTROLLER" subtitle={`P5-6 · MODE ${modeLabel[mode] ?? mode} · COMPARES TO SCHEDULE`} active={dc} tone="standby" liveText="CONTROLLING" offText="NO DC POWER" />
          <HydraulicNode compact id="cp-out" icon="valve" title="CABIN OUTFLOW VALVE" subtitle={`${outPct} % OPEN · EXHAUST ${Math.round(exhaustFlow * 100)}% · 28V DC TORQUE MOTOR`} active={outOpen} tone="ground" liveText="METERING" offText="CLOSED" />
          <HydraulicNode compact id="cp-rel" icon="shutoff" title="SAFETY RELIEF VALVE" subtitle="MECHANICAL · OPENS ≈8–8.5 PSI DIFF" active={relOpen} tone="ground" liveText="RELIEVING" offText="CLOSED" />
        </div>
        <div className="grid grid-cols-3 gap-x-3">
          <HydraulicNode compact id="cp-ind" icon="gauge" title="P5-6 INDICATIONS" subtitle={`DIFF ${diff.toFixed(1)} PSI · VALVE ${outPct} % · HORN >≈10,000 FT CAB ALT`} active={dc} tone="standby" liveText="INDICATING" offText="NO POWER" />
          <HydraulicNode compact className="col-span-2" id="cp-ovb" icon="connection" title="OVERBOARD · AMBIENT" subtitle="OUTFLOW VALVE + RELIEF VALVE EXHAUST" active={outOpen || relOpen} tone="ground" liveText="EXHAUSTING" offText="NO FLOW" />
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-border/70 pt-2 text-[7px] font-mono uppercase tracking-[.08em] text-subtle">
          <span className="text-accent">■ cabin air</span>
          <span className="text-hyd-s">■ control / sensing</span>
          <span>animated dashes = flow · dim = no flow</span>
        </div>
        <HydWireLayer wires={wires} w={size.w} h={size.h} />
      </div>
    </TrainingGroup>
  );
}

function TrainingGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-lg border border-[#45402f] bg-[#1f1e19] p-3"><div className="mb-2 font-display text-[10px] font-semibold uppercase tracking-[0.15em] text-fg">{title}</div>{children}</section>;
}
function TrainingSub({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="mt-3 border-t border-[#403b2d] pt-3"><div className="mb-2 text-[9px] font-display uppercase tracking-[0.14em] text-[#a9a188]">{title}</div>{children}</div>;
}

function HydraulicTrainerSwitch({ label, state, tone, disabled, detail, onClick }: { label: string; state: string; tone: "hyd-a" | "hyd-b" | "hyd-s" | "accent"; disabled?: boolean; detail?: string; onClick: () => void }) {
  const toneClass = tone === "hyd-a" ? "border-hyd-a/50" : tone === "hyd-b" ? "border-hyd-b/50" : tone === "hyd-s" ? "border-hyd-s/50" : "border-accent/50";
  const activeClass = state !== "OFF" && state !== "CLOSED" && state !== "DISCONNECTED" ? "bg-white/[.05]" : "bg-inset";
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={cn("group rounded border p-1.5 text-left transition hover:bg-panel disabled:cursor-not-allowed disabled:opacity-45", toneClass, activeClass)}>
      <div className="flex items-center justify-between gap-1">
        <span className="truncate font-display text-[8px] font-semibold uppercase tracking-[.1em] text-fg">{label}</span>
        <span className={cn("relative h-5 w-3.5 shrink-0 rounded-full border bg-[#090b0e]", state !== "OFF" && state !== "CLOSED" && state !== "DISCONNECTED" ? "border-ok/60" : "border-border")}>
          <span className={cn("absolute left-0.5 h-2 w-2 rounded-full border transition-all", state !== "OFF" && state !== "CLOSED" && state !== "DISCONNECTED" ? "top-0.5 bg-ok border-ok shadow-[0_0_6px_var(--color-ok)]" : "bottom-0.5 bg-[#3b4148] border-[#555c64]")} />
        </span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-1 font-mono text-[7px] uppercase">
        <span className={state !== "OFF" && state !== "CLOSED" && state !== "DISCONNECTED" ? "text-ok" : "text-subtle"}>{state}</span>
        {detail && <span className="truncate text-subtle">{detail}</span>}
      </div>
    </button>
  );
}

type HydIconName = "pump" | "epump" | "valve" | "shutoff" | "module" | "reservoir" | "filter" | "hx" | "gauge" | "engine" | "manifold" | "cart" | "fill" | "handpump" | "connection" | "spoiler" | "aileron" | "flaps" | "gear" | "elevator" | "rudder" | "brake" | "reverser" | "actuator";

/** Small line-art symbols so each component reads at a glance. */
function HydIcon({ name, className }: { name: HydIconName; className?: string }) {
  const body: Record<HydIconName, React.ReactNode> = {
    pump: <><circle cx="12" cy="13" r="7" /><path d="M9.5 9.5 16.5 13 9.5 16.5Z" /><path d="M12 6V3M12 3h4" /></>,
    epump: <><rect x="2.5" y="9" width="6" height="8" rx="1" /><circle cx="15" cy="13" r="6" /><path d="M12.7 10.2 17.5 13 12.7 15.8Z" /><path d="M15 7V4M15 4h4" /><path d="M8.5 13h1" /></>,
    valve: <><path d="M3 7l9 5-9 5ZM21 7l-9 5 9 5Z" /><path d="M12 12V5M9 5h6" /></>,
    shutoff: <><path d="M3 9l9 5-9 5ZM21 9l-9 5 9 5Z" /><path d="M12 14V6M8 6h8M9.5 3.5l5 5" /></>,
    module: <><rect x="5" y="6" width="14" height="12" rx="1.5" /><path d="M9 10h6M9 14h6M2 10h3M2 14h3M19 12h3" /></>,
    reservoir: <><path d="M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3v12c0 1.7-3.1 3-7 3s-7-1.3-7-3Z" /><path d="M5 6c0 1.7 3.1 3 7 3s7-1.3 7-3M5 13c2 1.5 12 1.5 14 0" /></>,
    filter: <><rect x="6" y="5" width="12" height="14" rx="1.5" /><path d="M2 12h4M18 12h4M9 8l6 8M9 12l3 4M12 8l3 4" /></>,
    hx: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M5 12h3l1.5-4 3 8 3-8 1.5 4h3" /></>,
    gauge: <><circle cx="12" cy="12" r="8" /><path d="M12 12l4-4M12 4v2M4 12h2M20 12h-2" /><circle cx="12" cy="12" r="1" /></>,
    engine: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="2" /><path d="M12 3.5v6.5M12 14v6.5M3.5 12H10M14 12h6.5M6 6l4.5 4.5M13.5 13.5 18 18M18 6l-4.5 4.5M10.5 13.5 6 18" /></>,
    manifold: <><path d="M3 13h18M7 13V5M12 13V5M17 13V5M12 13v7" /><circle cx="12" cy="13" r="1.3" /></>,
    cart: <><rect x="3" y="7" width="13" height="8" rx="1.5" /><path d="M16 10h3.5l1.5 5h-5" /><circle cx="7" cy="18" r="1.8" /><circle cx="15" cy="18" r="1.8" /></>,
    fill: <><path d="M12 3c3.2 4.2 5.5 7 5.5 10a5.5 5.5 0 0 1-11 0c0-3 2.3-5.8 5.5-10Z" /><path d="M9.5 14a2.6 2.6 0 0 0 2.5 2.6" /></>,
    handpump: <><path d="M3 20h11M8 20V10M8 10l11-5M19 5v3" /><rect x="6" y="10" width="4" height="6" rx=".8" /></>,
    connection: <><rect x="8.5" y="8" width="7" height="8" rx="1" /><path d="M2 12h6.5M15.5 12H22M11 8V5M13 8V5" /></>,
    spoiler: <><path d="M3 17h18" /><path d="M5 17l10-7h5" /><path d="M9 20h8" /></>,
    aileron: <><path d="M3 8h13l5 4-5 4H3Z" /><path d="M13 8v8" /></>,
    flaps: <><path d="M3 7h10l-1.5 3H3ZM5 12h13l-1.5 3H5ZM8 17h12l-1.5 3H8Z" /></>,
    gear: <><circle cx="12" cy="16" r="4.5" /><circle cx="12" cy="16" r="1.5" /><path d="M12 11.5V3M9 5h6" /></>,
    elevator: <><path d="M3 12h10l7-4v8l-7-4" /><path d="M13 12v0" /></>,
    rudder: <><path d="M7 21V5l9 2v10Z" /><path d="M11 7v12" /></>,
    brake: <><circle cx="12" cy="12" r="7.5" /><circle cx="12" cy="12" r="2" /><path d="M17.5 6.5a8.5 8.5 0 0 1 0 11" /></>,
    reverser: <><path d="M21 12H8M12 8l-4 4 4 4M4 5v14" /></>,
    actuator: <><rect x="4" y="9" width="10" height="6" rx="1" /><path d="M14 12h7M2 12h2" /></>,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {body[name]}
    </svg>
  );
}

function hydUserIcon(user: string): HydIconName {
  const u = user.toUpperCase();
  if (u.includes("SPOILER")) return "spoiler";
  if (u.includes("AILERON")) return "aileron";
  if (u.includes("FLAP") || u.includes("SLAT")) return "flaps";
  if (u.includes("GEAR") || u.includes("STEERING")) return "gear";
  if (u.includes("ELEVATOR")) return "elevator";
  if (u.includes("RUDDER")) return "rudder";
  if (u.includes("BRAKE")) return "brake";
  if (u.includes("REVERSER")) return "reverser";
  return "actuator";
}

function HydraulicNode({
  id,
  icon,
  title,
  subtitle,
  active,
  tone = "a",
  compact = false,
  minimal = false,
  className,
  style,
  liveText = "PRESSURIZED",
  offText = "OFF",
}: {
  id?: string;
  style?: React.CSSProperties;
  minimal?: boolean;
  icon?: HydIconName;
  title: string;
  subtitle?: string;
  active: boolean;
  tone?: "a" | "b" | "standby" | "ground";
  compact?: boolean;
  className?: string;
  liveText?: string;
  offText?: string;
}) {
  const styles = {
    a: active ? "border-hyd-a/60 bg-hyd-a/10 text-hyd-a" : "border-border bg-inset text-subtle",
    b: active ? "border-hyd-b/60 bg-hyd-b/10 text-hyd-b" : "border-border bg-inset text-subtle",
    standby: active ? "border-hyd-s/60 bg-hyd-s/10 text-hyd-s" : "border-border bg-inset text-subtle",
    ground: active ? "border-accent/60 bg-accent/10 text-accent" : "border-border bg-inset text-subtle",
  }[tone];
  return (
    <div data-hyd={id} style={style} className={cn("relative z-10 rounded-lg border text-center shadow-inner", compact ? "px-1.5 py-1.5" : "px-2 py-2.5", styles, className)}>
      {icon && <HydIcon name={icon} className={cn("mx-auto mb-0.5 block", compact ? "h-4 w-4" : "h-5 w-5")} />}
      <div className={cn("font-display font-semibold uppercase", compact ? (minimal ? "text-[7px] tracking-[0.02em]" : "text-[8px] tracking-[0.08em]") : "text-[9px] tracking-[0.12em]")}>{title}</div>
      {!minimal && subtitle && <div className={cn("uppercase tracking-wide opacity-80", compact ? "mt-0.5 text-[6px]" : "mt-1 text-[7px]")}>{subtitle}</div>}
      {!minimal && <div className={cn("font-mono uppercase", compact ? "mt-0.5 text-[6px]" : "mt-1 text-[7px]")}>{active ? liveText : offText}</div>}
    </div>
  );
}

function HydraulicUserWire({ id, user, active, tone = "b", compact = false }: { id?: string; user: string; active: boolean; tone?: "a" | "b" | "standby" | "ground"; compact?: boolean }) {
  const styles = {
    a: "border-hyd-a/40 bg-hyd-a/5 text-hyd-a",
    b: "border-hyd-b/40 bg-hyd-b/5 text-hyd-b",
    standby: "border-hyd-s/40 bg-hyd-s/5 text-hyd-s",
    ground: "border-accent/40 bg-accent/5 text-accent",
  }[tone];
  return (
    <div data-hyd={id} className={cn("hyd-user-wire relative z-10 flex items-center overflow-hidden rounded-md border bg-[#0a0d10]", compact ? "gap-1 px-1.5 py-1" : "gap-1.5 px-2 py-1.5", active ? styles : "border-border text-subtle", active && "hyd-fluid-active")}>
      {active && <span className="hyd-fluid-dot" aria-hidden="true" />}
      <HydIcon name={hydUserIcon(user)} className={cn("relative z-10 shrink-0", compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
      <div className={cn("relative z-10 min-w-0 flex-1 font-display uppercase", compact ? "text-[6px] tracking-[0.05em]" : "text-[7px] tracking-[0.08em]")}>{user}</div>
      <span className={cn("relative z-10 font-mono uppercase", compact ? "text-[5px]" : "text-[6px]", active ? "text-ok" : "text-subtle")}>{active ? "PRESSURE" : "OFF"}</span>
    </div>
  );
}

function HydraulicReturn({ id, icon, title, subtitle, active, tone, compact = false }: { id?: string; icon?: HydIconName; title: string; subtitle: string; active: boolean; tone: "a" | "b" | "standby"; compact?: boolean }) {
  const styles = {
    a: active ? "border-hyd-a/50 bg-hyd-a/5 text-hyd-a" : "border-border bg-inset text-subtle",
    b: active ? "border-hyd-b/50 bg-hyd-b/5 text-hyd-b" : "border-border bg-inset text-subtle",
    standby: active ? "border-hyd-s/50 bg-hyd-s/5 text-hyd-s" : "border-border bg-inset text-subtle",
  }[tone];
  return (
    <div data-hyd={id} className={cn("relative z-10 rounded-lg border text-center", compact ? "px-1.5 py-1.5" : "px-2 py-2", styles)}>
      {icon && <HydIcon name={icon} className={cn("mx-auto mb-0.5 block", compact ? "h-4 w-4" : "h-5 w-5")} />}
      <div className={cn("font-display font-semibold uppercase tracking-[0.1em]", compact ? "text-[7px]" : "text-[8px]")}>{title}</div>
      <div className="mt-0.5 text-[6px] uppercase tracking-wide opacity-80">{subtitle}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Wiring layer: every node carries data-hyd="<id>". After layout we measure
   the nodes and draw real orthogonal wires (with arrowheads and animated flow
   when live) between them, so no text labels are needed to explain the flow.
   ───────────────────────────────────────────────────────────── */
type HydTone = "a" | "b" | "standby" | "ground";
type HydRect = { l: number; r: number; t: number; b: number; cx: number; cy: number };
type HydGeo = Record<string, HydRect>;
type HydPt = [number, number];
type HydWire = { tone: HydTone; active: boolean; pts: HydPt[]; arrow: boolean; dots: HydPt[] };

const HYD_WIRE_TEXT: Record<HydTone, string> = { a: "text-hyd-a", b: "text-hyd-b", standby: "text-hyd-s", ground: "text-accent" };

function hydArrowHead(pts: HydPt[], size = 4.5): string | null {
  let i = pts.length - 1;
  while (i > 0 && Math.abs(pts[i][0] - pts[i - 1][0]) < 0.01 && Math.abs(pts[i][1] - pts[i - 1][1]) < 0.01) i--;
  if (i <= 0) return null;
  const [x, y] = pts[i];
  const [px, py] = pts[i - 1];
  const len = Math.hypot(x - px, y - py) || 1;
  const ux = (x - px) / len, uy = (y - py) / len;
  const bx = x - ux * size, by = y - uy * size;
  const nx = -uy * size * 0.65, ny = ux * size * 0.65;
  return `${x},${y} ${bx + nx},${by + ny} ${bx - nx},${by - ny}`;
}

type HydFlags = {
  aLive: boolean; bLive: boolean; stbyLive: boolean;
  bleed1On: boolean; bleed2On: boolean; resAir: boolean; groundAirLive: boolean;
  groundServiceLive: boolean; groundPowerHydLive: boolean; interconnectActual: boolean;
  aP1: boolean; aP2: boolean; bP1: boolean; bP2: boolean; stbyPump: boolean; parkingBrakeSet: boolean;
};

/**
 * Pure wire router. Rules: every segment runs in a clear channel (gap between rows,
 * section side padding, or the inter-column gutter) and never through a node.
 * Lanes: L1/R1 = user return rails, +15 = heat-exchanger return to reservoir.
 */
function buildHydraulicWires(geo: HydGeo, f: HydFlags): HydWire[] {
  const wires: HydWire[] = [];
  const N = (id: string): HydRect | undefined => geo[id];
  const add = (tone: HydTone, active: boolean, pts: HydPt[] | null | undefined, o: { arrow?: boolean; dots?: HydPt[] } = {}) => {
    if (pts && pts.length > 1) wires.push({ tone, active, pts, arrow: o.arrow ?? true, dots: o.dots ?? [] });
  };
  const vv = (a?: HydRect, b?: HydRect, ym?: number): HydPt[] | null => {
    if (!a || !b) return null;
    if (Math.abs(a.cx - b.cx) < 2) return [[a.cx, a.b], [a.cx, b.t]];
    const y = ym ?? (a.b + b.t) / 2;
    return [[a.cx, a.b], [a.cx, y], [b.cx, y], [b.cx, b.t]];
  };
  const hh = (a?: HydRect, b?: HydRect): HydPt[] | null => {
    if (!a || !b) return null;
    const rtl = b.cx < a.cx;
    const x1 = rtl ? a.l : a.r;
    const x2 = rtl ? b.r : b.l;
    if (Math.abs(a.cy - b.cy) < 2) return [[x1, a.cy], [x2, b.cy]];
    const xm = (x1 + x2) / 2;
    return [[x1, a.cy], [xm, a.cy], [xm, b.cy], [x2, b.cy]];
  };
  /** straight drop from bottom of a to top of b at column x (x lies inside both nodes' widths) */
  const drop = (tone: HydTone, live: boolean, a: HydRect, b: HydRect, x: number) => add(tone, live, [[x, a.b], [x, b.t]]);

  // ── Reservoir pressurization air (top box) ──
  {
    const b1 = N("air-b1"), b2 = N("air-b2"), fil = N("air-filter"), reg = N("air-reg"), man = N("air-man"), relief = N("air-relief"), bal = N("air-bal"), cart = N("air-cart");
    if (b1 && b2 && fil && reg && man && relief && bal) {
      const gap = man.t - reg.b;
      const busY = reg.b + gap * 0.28;
      const yReg = reg.b + gap * 0.66;
      add("ground", f.bleed1On, [[b1.cx, b1.b], [b1.cx, busY], [fil.cx, busY], [fil.cx, fil.b]], { dots: [[b2.cx, busY]] });
      add("ground", f.bleed2On, [[b2.cx, b2.b], [b2.cx, busY]], { arrow: false });
      add("ground", f.resAir, hh(fil, reg));
      add("ground", f.resAir, [[reg.cx, reg.b], [reg.cx, yReg], [man.cx, yReg], [man.cx, man.t]]);
      add("ground", f.resAir, hh(man, relief));   // relief sits beside the manifold
      add("ground", f.resAir, vv(man, bal));      // balance port directly below the manifold
      add("ground", f.groundAirLive, hh(cart, man));   // ground air cart → pressurization manifold (alternate to ground N2)
    }
  }

  // ── A / B / Standby circuits ──
  const usersOf = (k: string) => { const out: HydRect[] = []; for (let i = 0; ; i++) { const r = N(`${k}-u${i}`); if (!r) break; out.push(r); } return out; };

  const circuit = (k: "a" | "b" | "s", tone: HydTone, live: boolean) => {
    const res = N(`${k}-res`), mod = N(`${k}-mod`), grp = N(`${k}-users`);
    if (!res || !mod || !grp) return;
    const rf = N(`${k}-rf`), hx = N(`${k}-hx`), sret = N("s-return");
    const ret = k === "s" ? sret : rf;

    // 1) Supply: reservoir → (shutoff) → pump → (filter) → module; short straight drops only.
    const chains = k === "a" ? [1, 2].map((i) => [`a-fs${i}`, `a-p${i}`, `a-pf${i}`]) : k === "b" ? [1, 2].map((i) => [`b-p${i}`]) : [["s-pump"]];
    // Each supply branch is lit by its OWN pump (not by whole-system pressure).
    const chainLive = k === "a" ? [f.aP1, f.aP2] : k === "b" ? [f.bP1, f.bP2] : [f.stbyPump];
    chains.forEach((ids, ci) => {
      const ns = ids.map(N);
      if (ns.some((n) => !n)) return;
      const r = ns as HydRect[];
      const cl = chainLive[ci] ?? live;
      drop(tone, cl, res, r[0], r[0].cx);
      for (let j = 1; j < r.length; j++) drop(tone, cl, r[j - 1], r[j], r[j].cx);
      drop(tone, cl, r[r.length - 1], mod, r[r.length - 1].cx);
    });

    // 2) Module → users: supply spine in the centre gutter, taps stop at the chip's inner edge.
    const rects = usersOf(k);
    if (!rects.length) return;
    const lefts = rects.filter((r) => r.cx < grp.cx);
    const rights = rects.filter((r) => r.cx >= grp.cx);
    const spineX = lefts.length && rights.length ? (Math.max(...lefts.map((r) => r.r)) + Math.min(...rights.map((r) => r.l))) / 2 : grp.cx;
    const lastY = Math.max(...rects.map((r) => r.cy));
    const entryY = (mod.b + grp.t) / 2;
    add(tone, live, [[mod.cx, mod.b], [mod.cx, entryY], [spineX, entryY], [spineX, lastY]], { arrow: false, dots: rects.map((r) => [spineX, r.cy] as HydPt) });
    rects.forEach((r) => add(tone, live, [[spineX, r.cy], [r.cx < spineX ? r.r : r.l, r.cy]]));

    // 3) User return: rails run in the side padding, OUTSIDE the chips' outer edges.
    const L1 = grp.l - 7, R1 = grp.r + 7;
    const singleRow = Math.max(...rects.map((r) => r.cy)) - Math.min(...rects.map((r) => r.cy)) < 4;
    if (ret) {
      if (k === "s" && singleRow) {
        rects.forEach((r) => drop(tone, live, r, ret, r.cx));
      } else {
        const busY = (grp.b + ret.t) / 2;
        rects.forEach((r) => {
          const left = r.cx < grp.cx;
          add(tone, live, [[left ? r.l : r.r, r.cy], [left ? L1 : R1, r.cy]], { arrow: false });
        });
        if (lefts.length) add(tone, live, [[L1, Math.min(...lefts.map((r) => r.cy))], [L1, busY], [ret.cx, busY], [ret.cx, ret.t]], { dots: [[ret.cx, busY]] });
        if (rights.length) add(tone, live, [[R1, Math.min(...rights.map((r) => r.cy))], [R1, busY], [ret.cx, busY]], { arrow: false });
      }
    }

    // 4) Return to reservoir — through the side lanes, never through the stack.
    const yRight = res.t + (res.b - res.t) * 0.72;
    if (k === "a" && rf && hx) {
      // AMM 29: main return goes users → return filter → reservoir (filter sits immediately upstream of the reservoir).
      const Lr = grp.l - 15;
      add(tone, live, [[rf.l, rf.cy], [Lr, rf.cy], [Lr, res.cy], [res.l, res.cy]]);
      // Case-drain cooling is a separate branch: each EDP case drain → No. 1 tank heat exchanger → reservoir.
      const p1 = N("a-p1"), p2 = N("a-p2");
      if (p1 && p2) {
        const Lc = grp.l - 23, Rc = grp.r + 23, Ro = grp.r + 15, yBelow = hx.b + 9;
        add(tone, f.aP1, [[p1.l, p1.cy], [Lc, p1.cy], [Lc, yBelow], [hx.cx, yBelow], [hx.cx, hx.b]], { dots: [[hx.cx, yBelow]] });
        add(tone, f.aP2, [[p2.r, p2.cy], [Rc, p2.cy], [Rc, yBelow], [hx.cx, yBelow]], { arrow: false });
        add(tone, f.aP1 || f.aP2, [[hx.r, hx.cy], [Ro, hx.cy], [Ro, yRight], [res.r, yRight]]);
      }
    }
    if (k === "b" && rf && hx) {
      add(tone, live, hh(rf, hx));
      const RrX = grp.r + 15;
      add(tone, live, [[hx.r, hx.cy], [RrX, hx.cy], [RrX, res.cy], [res.r, res.cy]]);
    }
    if (k === "s" && sret) {
      const x = grp.l - 10;
      add(tone, live, [[sret.l, sret.cy], [x, sret.cy], [x, res.cy], [res.l, res.cy]]);
    }
  };
  circuit("a", "a", f.aLive);
  circuit("b", "b", f.bLive);
  circuit("s", "standby", f.stbyLive);

  // ── Gutter trunks: air on xa, servicing fluid on xf = xa + 14 ──
  // Air stubs enter each reservoir at 20% height, fluid at 40%. The fluid trunk only rises to the 40% line,
  // so the only wire crossing in the gutter is fluid→A over the air trunk (drawn as a hop).
  {
    const bal = N("air-bal"), secA = N("a-sec"), secB = N("b-sec");
    const aRes = N("a-res"), bRes = N("b-res"), sRes = N("s-res");
    const fill = N("g-fill"), pump = N("g-pump"), pfp = N("g-pfp"), filt = N("g-filt"), gbal = N("g-bal");
    add("standby", f.groundServiceLive, vv(fill, pump));
    if (pump && filt) drop("standby", f.groundServiceLive, pump, filt, pump.cx);   // hand pump → filter
    if (pfp && filt) drop("standby", f.groundServiceLive, pfp, filt, pfp.cx);      // pressure-fill port → filter
    add("standby", f.groundServiceLive, vv(filt, gbal));
    if (secA && secB && aRes && bRes && sRes) {
      const gx0 = (secA.r + secB.l) / 2, xa = gx0 - 8, xf = gx0 + 1;
      const at = (r: HydRect, p: number) => r.t + (r.b - r.t) * p;
      if (bal) {
        const y0 = bal.b + 10;
        const lastAir = at(sRes, 0.2);
        add("ground", f.resAir, [[bal.cx, bal.b], [bal.cx, y0], [xa, y0], [xa, lastAir]], { arrow: false, dots: [[xa, at(aRes, 0.2)], [xa, lastAir]] });
        add("ground", f.resAir, [[xa, at(aRes, 0.2)], [aRes.r, at(aRes, 0.2)]]);
        add("ground", f.resAir, [[xa, at(bRes, 0.2)], [bRes.l, at(bRes, 0.2)]]);
        add("ground", f.resAir, [[xa, lastAir], [sRes.r, lastAir]]);
      }
      if (gbal) {
        const top = at(aRes, 0.4);
        add("standby", f.groundServiceLive, [[gbal.l, gbal.cy], [xf, gbal.cy], [xf, top]], { arrow: false, dots: [[xf, at(sRes, 0.4)], [xf, top]] });
        add("standby", f.groundServiceLive, [[xf, at(aRes, 0.4)], [aRes.r, at(aRes, 0.4)]]);
        add("standby", f.groundServiceLive, [[xf, at(bRes, 0.4)], [bRes.l, at(bRes, 0.4)]]);
        add("standby", f.groundServiceLive, [[xf, at(sRes, 0.4)], [sRes.r, at(sRes, 0.4)]]);
      }
    }
  }

  // ── Ground power + A/B interconnect: wired to the actual B and A modules through the gap between the columns ──
  {
    const ext = N("i-ext"), gp = N("i-gp"), giv = N("i-valve"), park = N("i-park");
    const aMod = N("a-mod"), bMod = N("b-mod"), bRf = N("b-rf"), secA = N("a-sec"), secB = N("b-sec");
    add("ground", f.groundPowerHydLive, hh(ext, gp));
    if (park && giv) add("ground", f.parkingBrakeSet, hh(park, giv));   // parking-brake relay interlock (control)
    if (gp && giv && aMod && bMod && secA && secB) {
      const gx = (secA.r + secB.l) / 2;
      const xP = gx - 26, xR = gx - 17, xB = gx + 10, xG = gx + 19;
      // Ground power modular unit pressure → System B module.
      add("ground", f.groundPowerHydLive, [[xP, gp.t], [xP, bMod.cy - 6], [bMod.l, bMod.cy - 6]]);
      // System B return line → ground power unit return port.
      if (bRf) add("ground", f.groundPowerHydLive, [[bRf.l, bRf.cy], [xR, bRf.cy], [xR, gp.t]]);
      // B module pressure → ground interconnect valve, then (through its internal check valve, B → A only) → System A module.
      add("ground", f.interconnectActual, [[bMod.l, bMod.cy + 6], [xB, bMod.cy + 6], [xB, giv.t]]);
      add("ground", f.interconnectActual, [[xG, giv.t], [xG, aMod.cy], [aMod.r, aMod.cy]]);
    }
  }
  return wires;
}

/** SVG path for a wire; horizontal runs hop over other wires' vertical runs so crossings never read as junctions. */
function hydPathD(pts: HydPt[], others: HydPt[][]): string {
  const R = 3;
  const verts: [number, number, number][] = [];
  others.forEach((o) => {
    for (let i = 1; i < o.length; i++) {
      const [x1, y1] = o[i - 1], [x2, y2] = o[i];
      if (Math.abs(x1 - x2) < 0.01 && Math.abs(y1 - y2) > 0.01) verts.push([x1, Math.min(y1, y2), Math.max(y1, y2)]);
    }
  });
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i - 1], [x2, y2] = pts[i];
    if (Math.abs(y1 - y2) < 0.01 && Math.abs(x1 - x2) > 2 * R + 4) {
      const dir = Math.sign(x2 - x1);
      const xs = verts
        .filter(([x, ya, yb]) => y1 > ya + 1.5 && y1 < yb - 1.5 && (x - x1) * dir > R + 2 && (x2 - x) * dir > R + 2)
        .map((v) => v[0]).sort((a, b) => (a - b) * dir);
      let last = -1e9;
      xs.forEach((x) => {
        if (Math.abs(x - last) < 2 * R + 2) return;
        last = x;
        d += ` L${(x - dir * R).toFixed(1)} ${y1.toFixed(1)} A${R} ${R} 0 0 ${dir > 0 ? 1 : 0} ${(x + dir * R).toFixed(1)} ${y1.toFixed(1)}`;
      });
    }
    d += ` L${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }
  return d;
}

function HydWireLayer({ wires, w, h }: { wires: HydWire[]; w: number; h: number }) {
  return (
    <svg className="pointer-events-none absolute left-0 top-0 z-[5] overflow-visible" width={w} height={h} aria-hidden="true">
      <style>{`
        @keyframes hydWireFlow { to { stroke-dashoffset: -10; } }
        .hyd-wire-flow { animation: hydWireFlow 0.9s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .hyd-wire-flow { animation: none; } }
      `}</style>
      {wires.map((wire, i) => {
        const d = hydPathD(wire.pts, wires.filter((_, j) => j !== i).map((o) => o.pts));
        const head = wire.arrow ? hydArrowHead(wire.pts) : null;
        return (
          <g key={i} className={wire.active ? HYD_WIRE_TEXT[wire.tone] : "text-subtle"} style={{ opacity: wire.active ? 1 : 0.45 }}>
            <path d={d} fill="none" stroke="currentColor" strokeOpacity={wire.active ? 0.35 : 0.8} strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round" />
            {wire.active && <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeDasharray="4 6" className="hyd-wire-flow" />}
            {head && <polygon points={head} fill="currentColor" />}
            {wire.dots.map(([x, y], n) => <circle key={n} cx={x} cy={y} r={1.9} fill="currentColor" />)}
          </g>
        );
      })}
    </svg>
  );
}

function Box({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("min-w-0 rounded-lg border bg-[#0a0d10]", className)}>{children}</div>;
}

function HydraulicsTrainerPanel({ s, d, toggle }: { s: SimStore; d: ReturnType<typeof useDerived>; toggle: (key: keyof import("@/lib/sim/types").SimState, value: boolean) => void }) {
  const aLive = Number(s.hydAPress ?? 0) > 1500;
  const bLive = Number(s.hydBPress ?? 0) > 1500;
  const stbyLive = Number(s.hydSPress ?? 0) > 1800;
  // Use the same source the pump logic uses (derive.ts reservoirAirAvailable) so the
  // trainer never shows a pressurized reservoir that the pumps cannot actually use.
  const bleed1On = !!d.bleed1Available;
  const bleed2On = !!d.bleed2Available;
  const engineReservoirAir = !!d.reservoirPressurized;
  const groundAirCartLive = !!d.reservoirGroundAir;   // cart supplying the pressurization manifold (ground, no N2)
  const reservoirPressurized = engineReservoirAir;
  const groundServiceLive = !!s.hydServicingConnected && !!s.wow;
  const groundPowerHydLive = !!s.hydGroundPowerConnected && !!s.wow;
  const interconnectActual = !!s.groundInterconnect && !!s.hydGroundPowerConnected && !!s.wow && !!s.parkingBrake;
  const pressure = (value: number) => `${Math.round(value)} PSI`;

  const aUsers = ["GROUND SPOILERS", "INBOARD FLIGHT SPOILERS", "AILERONS", "LE FLAPS / SLATS", "TE FLAPS", "LANDING GEAR / NOSE STEERING", "ELEVATORS", "RUDDER", "INBOARD BRAKES", "THRUST REVERSER"];
  const bUsers = ["AILERONS", "ELEVATORS", "RUDDER", "OUTBOARD FLIGHT SPOILERS", "OUTBOARD BRAKES"];
  const sUsers = ["STANDBY RUDDER", "LE FLAPS / SLATS"];

  // ── measurement of node positions ───────────────────────────────────────
  const rootRef = useRef<HTMLDivElement>(null);
  const lastKey = useRef("");
  const [geo, setGeo] = useState<HydGeo>({});
  const [size, setSize] = useState({ w: 0, h: 0 });

  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const rr = root.getBoundingClientRect();
    const next: HydGeo = {};
    root.querySelectorAll<HTMLElement>("[data-hyd]").forEach((el) => {
      const r = el.getBoundingClientRect();
      const l = r.left - rr.left;
      const t = r.top - rr.top;
      next[el.dataset.hyd as string] = { l, r: l + r.width, t, b: t + r.height, cx: l + r.width / 2, cy: t + r.height / 2 };
    });
    const key = `${Math.round(rr.width)}x${Math.round(rr.height)}|` + Object.entries(next).map(([k, v]) => `${k}:${Math.round(v.l)},${Math.round(v.t)},${Math.round(v.r)},${Math.round(v.b)}`).join(";");
    if (key !== lastKey.current) {
      lastKey.current = key;
      setGeo(next);
      setSize({ w: rr.width, h: rr.height });
    }
  }, []);

  useLayoutEffect(() => { measure(); });
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(root);
    window.addEventListener("resize", measure);
    (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready.then(measure);
    return () => { ro?.disconnect(); window.removeEventListener("resize", measure); };
  }, [measure]);

  const wires = buildHydraulicWires(geo, {
    aLive, bLive, stbyLive, bleed1On, bleed2On, resAir: reservoirPressurized, groundAirLive: groundAirCartLive,
    groundServiceLive, groundPowerHydLive, interconnectActual,
    aP1: !!d.hydAPump1On, aP2: !!d.hydAPump2On, bP1: !!d.hydBPump1On, bP2: !!d.hydBPump2On,
    stbyPump: !!d.stbyOn, parkingBrakeSet: !!s.parkingBrake,
  });

  return (
    <div ref={rootRef} className="relative space-y-4 overflow-visible px-3 pb-6">
      {/* RESERVOIR PRESSURIZATION — AIR */}
      <Box className="border-accent/35 bg-[#0d1013] p-2.5">
        <div className="mb-3 rounded-md border border-accent/40 bg-accent/5 px-2 py-1.5 text-center">
          <div className="font-display text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">RESERVOIR PRESSURIZATION · AIR</div>
        </div>

        <div className="grid min-w-0 grid-cols-4 gap-4">
          <HydraulicNode id="air-b1" icon="engine" title="ENG 1 BLEED" subtitle={bleed1On ? "AVAILABLE" : "OFF"} active={bleed1On} tone="ground" />
          <HydraulicNode id="air-b2" icon="engine" title="ENG 2 BLEED" subtitle={bleed2On ? "AVAILABLE" : "OFF"} active={bleed2On} tone="ground" />
          <HydraulicNode id="air-filter" icon="filter" title="AIR FILTER" subtitle="BLEED-AIR FILTER" active={reservoirPressurized} tone="ground" />
          <HydraulicNode id="air-reg" icon="gauge" title="PRESSURE REGULATOR" subtitle="40–47 PSI" active={reservoirPressurized} tone="ground" />
        </div>

        <div className="mt-9 grid min-w-0 grid-cols-4 gap-4">
          <HydraulicNode id="air-relief" icon="valve" title="PRESSURIZATION RELIEF VALVE" subtitle="MANIFOLD OVERPRESSURE PROTECTION" active={reservoirPressurized} tone="ground" />
          <HydraulicNode className="col-span-2" id="air-man" icon="manifold" title="AIR MANIFOLD" subtitle="COMMON FEED → A · B · STANDBY RESERVOIRS" active={reservoirPressurized} tone="ground" />
          <HydraulicNode id="air-cart" icon="cart" title="GROUND AIR CART" subtitle="ALTERNATE GROUND SOURCE · WHEN NO N₂ ON GROUND" active={groundAirCartLive} tone="ground" liveText="CONNECTED" offText="OFF" />
        </div>

        <div className="mx-auto mt-8 w-1/2 min-w-0">
          <HydraulicNode compact id="air-bal" icon="connection" title="BALANCE CONNECTION" subtitle="RESERVOIR PRESSURIZATION PORT" active={reservoirPressurized} tone="standby" />
        </div>
      </Box>

      {/* A AND B */}
      <div className="grid min-w-0 grid-cols-2 gap-x-14">
        {/* A */}
        <section data-hyd="a-sec" className="relative z-0 flex min-w-0 flex-col gap-4 rounded-lg border border-hyd-a/35 bg-[#0b1015] px-[30px] pb-5 pt-2">
          <div className="rounded-md border border-hyd-a/40 bg-hyd-a/5 px-1.5 py-1 text-center">
            <div className="font-display text-[9px] font-semibold uppercase tracking-[0.12em] text-hyd-a">SYSTEM A</div>
            <div className="text-[5px] uppercase tracking-[0.08em] text-subtle">ENGINE-DRIVEN · {pressure(s.hydAPress)}</div>
          </div>
          <HydraulicNode compact id="a-res" icon="reservoir" title="A RESERVOIR" subtitle={`QTY ${Math.round(d.hydAQty)}% · HEAD ${reservoirPressurized ? "40–47" : "0"} PSI`} active={reservoirPressurized || aLive} tone="a" />
          <div className="grid grid-cols-2 gap-x-3">
            <HydraulicNode compact id="a-fs1" icon="shutoff" title="FIRE SHUTOFF · ENG 1" subtitle={!s.engine1FirePulled ? "OPEN · NORMAL" : "CLOSED · FIRE"} active={!!d.hydAPump1On} tone="a" />
            <HydraulicNode compact id="a-fs2" icon="shutoff" title="FIRE SHUTOFF · ENG 2" subtitle={!s.engine2FirePulled ? "OPEN · NORMAL" : "CLOSED · FIRE"} active={!!d.hydAPump2On} tone="a" />
          </div>
          <div className="grid grid-cols-2 gap-x-3">
            <HydraulicNode compact id="a-p1" icon="pump" title="ENG 1 PUMP" subtitle={d.hydAPump1On ? "ON" : "OFF"} active={!!d.hydAPump1On} tone="a" />
            <HydraulicNode compact id="a-p2" icon="pump" title="ENG 2 PUMP" subtitle={d.hydAPump2On ? "ON" : "OFF"} active={!!d.hydAPump2On} tone="a" />
          </div>
          <div className="grid grid-cols-2 gap-x-3">
            <HydraulicNode compact id="a-pf1" icon="filter" title="A PRESSURE FILTER · ENG 1" subtitle="PUMP OUTLET" active={!!d.hydAPump1On} tone="a" />
            <HydraulicNode compact id="a-pf2" icon="filter" title="A PRESSURE FILTER · ENG 2" subtitle="PUMP OUTLET" active={!!d.hydAPump2On} tone="a" />
          </div>
          <HydraulicNode compact id="a-mod" icon="module" title="A MODULE / DISTRIBUTION UNIT" subtitle={`RELIEF · CHECK · LP SWITCH ${aLive ? "OK" : "LOW"}`} active={aLive} tone="a" />
          <div data-hyd="a-users" className="grid grid-cols-2 gap-x-4 gap-y-1">
            {aUsers.map((u, i) => <HydraulicUserWire key={u} compact id={`a-u${i}`} user={u} active={aLive} tone="a" />)}
          </div>
          <div className="grid grid-cols-2 gap-x-3">
            <HydraulicReturn compact id="a-rf" icon="filter" title="A RETURN FILTER" subtitle="MAIN RETURN → RESERVOIR" active={aLive} tone="a" />
            <HydraulicReturn compact id="a-hx" icon="hx" title="A CASE-DRAIN HEAT EXCHANGER" subtitle="EDP CASE DRAIN · No. 1 FUEL TANK" active={!!(d.hydAPump1On || d.hydAPump2On)} tone="a" />
          </div>
        </section>

        {/* B */}
        <section data-hyd="b-sec" className="relative z-0 flex min-w-0 flex-col gap-4 rounded-lg border border-hyd-b/35 bg-[#0b1015] px-[30px] pb-5 pt-2">
          <div className="rounded-md border border-hyd-b/40 bg-hyd-b/5 px-1.5 py-1 text-center">
            <div className="font-display text-[9px] font-semibold uppercase tracking-[0.12em] text-hyd-b">SYSTEM B</div>
            <div className="text-[5px] uppercase tracking-[0.08em] text-subtle">ELECTRIC PUMPS · {pressure(s.hydBPress)}</div>
          </div>
          <HydraulicNode compact id="b-res" icon="reservoir" title="B RESERVOIR" subtitle={`QTY ${Math.round(d.hydBQty)}% · HEAD ${reservoirPressurized ? "40–47" : "0"} PSI`} active={reservoirPressurized || bLive} tone="b" />
          <div className="grid grid-cols-2 gap-x-3">
            <HydraulicNode compact id="b-p1" icon="epump" title="ELEC 1 PUMP" subtitle={`${d.hydBPump1On ? "ON" : "OFF"}${d.hydBPump1Low ? " · LOW PRESS" : ""}`} active={!!d.hydBPump1On} tone="b" />
            <HydraulicNode compact id="b-p2" icon="epump" title="ELEC 2 PUMP" subtitle={`${d.hydBPump2On ? "ON" : "OFF"}${d.hydBPump2Low ? " · LOW PRESS" : ""}`} active={!!d.hydBPump2On} tone="b" />
          </div>
          <HydraulicNode compact id="b-mod" icon="module" title="B MODULE / DISTRIBUTION UNIT" subtitle={`FILTER · RELIEF · PUMP LP SWITCHES ${bLive ? "OK" : "LOW"}`} active={bLive} tone="b" />
          <div data-hyd="b-users" className="grid grid-cols-2 gap-x-4 gap-y-1">
            {bUsers.map((u, i) => <HydraulicUserWire key={u} compact id={`b-u${i}`} user={u} active={bLive} tone="b" />)}
          </div>
          <div className="grid grid-cols-2 gap-x-3">
            <HydraulicReturn compact id="b-rf" icon="filter" title="B RETURN FILTER" subtitle="MAIN SYSTEM B RETURN" active={bLive} tone="b" />
            <HydraulicReturn compact id="b-hx" icon="hx" title="B RETURN HEAT EXCHANGER" subtitle="RIGHT · No. 2 FUEL TANK" active={bLive} tone="b" />
          </div>
        </section>
      </div>

      {/* STANDBY + GROUND SERVICING */}
      <div className="grid min-w-0 grid-cols-2 items-stretch gap-x-14">
        <section data-hyd="s-sec" className="relative z-0 flex h-full min-w-0 flex-col gap-4 rounded-lg border border-hyd-s/35 bg-[#0b1015] px-[30px] pb-5 pt-2">
          <div className="rounded-md border border-hyd-s/40 bg-hyd-s/5 px-1.5 py-1 text-center">
            <div className="font-display text-[9px] font-semibold uppercase tracking-[0.12em] text-hyd-s">STANDBY SYSTEM</div>
            <div className="text-[5px] uppercase tracking-[0.08em] text-subtle">ELECTRIC MOTOR-DRIVEN · {pressure(s.hydSPress)}</div>
          </div>
          <HydraulicNode compact id="s-res" icon="reservoir" title="STANDBY RESERVOIR" subtitle={`QTY ${Math.round(d.hydSQty)}% · HEAD ${reservoirPressurized ? "40–47" : "0"} PSI`} active={reservoirPressurized || stbyLive || groundServiceLive} tone="standby" />
          <HydraulicNode compact id="s-pump" icon="epump" title="STANDBY AC MOTOR PUMP" subtitle={d.stbyOn ? "ON · ON DEMAND" : "OFF / ON DEMAND"} active={!!d.stbyOn} tone="standby" />
          <HydraulicNode compact id="s-mod" icon="module" title="STANDBY HYDRAULIC MODULAR UNIT" subtitle={`RELIEF · FILTER · LP SWITCH ${stbyLive ? "OK" : "LOW"}`} active={stbyLive} tone="standby" />
          <div data-hyd="s-users" className="grid grid-cols-2 gap-x-4 gap-y-1">
            {sUsers.map((u, i) => <HydraulicUserWire key={u} compact id={`s-u${i}`} user={u} active={stbyLive} tone="standby" />)}
          </div>
          <HydraulicReturn compact id="s-return" icon="connection" title="STANDBY RETURN" subtitle="DIRECT TO STANDBY RESERVOIR · NO HX / RETURN FILTER" active={stbyLive} tone="standby" />
        </section>

        <section data-hyd="g-sec" className="flex h-full min-w-0 flex-col gap-3.5 rounded-lg border border-accent/30 bg-[#0d1013] p-1.5 shadow-inner">
          <div className="rounded-lg border border-accent/50 bg-accent/5 px-2 py-1.5 text-center">
            <div className="font-display text-[9px] font-semibold uppercase tracking-[0.14em] text-accent">GROUND HYDRAULIC SERVICING</div>
          </div>
          <div className="grid grid-cols-2 gap-x-3">
            <HydraulicNode compact id="g-fill" icon="fill" title="CENTRAL FLUID SUPPLY" subtitle="FILL STATION · RIGHT WHEEL WELL" active={groundServiceLive} tone="ground" liveText="SUPPLYING" offText="IDLE" />
            <HydraulicNode compact id="g-pfp" icon="connection" title="PRESSURE-FILL PORT" subtitle="ALTERNATE SOURCE · EXTERNAL CART" active={groundServiceLive} tone="ground" liveText="SUPPLYING" offText="IDLE" />
          </div>
          <div className="grid grid-cols-2 gap-x-3">
            <HydraulicNode compact id="g-pump" icon="handpump" title="GROUND SERVICING HAND PUMP" subtitle="MANUAL · LOW PRESSURE" active={groundServiceLive} tone="ground" liveText="PUMPING" offText="IDLE" />
            <div />
          </div>
          <HydraulicNode compact id="g-filt" icon="filter" title="HYDRAULIC SERVICING FILTER" subtitle="0.4–3 MICRON · UPSTREAM OF FILL LINES" active={groundServiceLive} tone="ground" liveText="FILTERING" offText="IDLE" />
          <HydraulicNode compact id="g-bal" icon="connection" title="SHARED FILL / BALANCE LINE" subtitle="→ A · B · STANDBY RESERVOIRS" active={groundServiceLive} tone="standby" liveText="FILLING" offText="IDLE" />
        </section>
      </div>

      {/* GROUND POWER · A / B INTERCONNECT */}
      <Box className="border-hyd-b/30 bg-[#0d1013] p-2.5">
        <div className="mb-2 font-display text-[9px] uppercase tracking-[0.16em] text-subtle">Ground hydraulic power · A / B interconnect</div>
        <div className="grid min-w-0 grid-cols-4 gap-x-2">
          <HydraulicNode id="i-ext" icon="cart" title="EXTERNAL HYDRAULIC SOURCE" subtitle="GROUND CART · ~3000 PSI" active={groundPowerHydLive} tone="ground" liveText="CONNECTED" offText="OFF" />
          <HydraulicNode id="i-gp" icon="module" title="GROUND POWER MODULAR UNIT" subtitle="PRESSURE + RETURN PORTS → B" active={groundPowerHydLive} tone="ground" liveText="PASS-THROUGH" offText="OFF" />
          <HydraulicNode id="i-valve" icon="valve" title="GROUND INTERCONNECT VALVE" subtitle={interconnectActual ? "OPEN · B → A · CHECK BLOCKS A → B" : "CLOSED · CHECK BLOCKS A → B"} active={interconnectActual} tone="ground" liveText="OPEN" offText="CLOSED" />
          <HydraulicNode id="i-park" icon="connection" title="PARKING BRAKE INTERLOCK" subtitle={s.parkingBrake ? "RELAY ENERGIZED · VALVE MAY OPEN" : "RELEASED · VALVE CLOSES"} active={!!s.parkingBrake} tone="ground" liveText="SET" offText="RELEASED" />
        </div>
      </Box>

      {/* CONTROLS / INDICATIONS */}
      <Box className="border-border bg-[#0d1013] p-2.5">
        <div className="mb-1.5 font-display text-[9px] uppercase tracking-[0.16em] text-subtle">P5 / Trainer controls</div>
        <div className="grid min-w-0 grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-7">
          <HydraulicTrainerSwitch label="ENG 1 PUMP" state={s.engHyd1 ? "ON" : "OFF"} tone="hyd-a" detail="SYSTEM A" onClick={() => toggle("engHyd1", !s.engHyd1)} />
          <HydraulicTrainerSwitch label="ENG 2 PUMP" state={s.engHyd2 ? "ON" : "OFF"} tone="hyd-a" detail="SYSTEM A" onClick={() => toggle("engHyd2", !s.engHyd2)} />
          <HydraulicTrainerSwitch label="ELEC 1 PUMP" state={s.elecHyd1 ? "ON" : "OFF"} tone="hyd-b" detail={d.transferBus1Powered ? (d.hydBPump1On ? "SYSTEM B · RUNNING" : "SYSTEM B · NOT RUNNING") : "NO AC BUS 1"} disabled={!d.transferBus1Powered} onClick={() => toggle("elecHyd1", !s.elecHyd1)} />
          <HydraulicTrainerSwitch label="ELEC 2 PUMP" state={s.elecHyd2 ? "ON" : "OFF"} tone="hyd-b" detail={d.transferBus2Powered ? (d.hydBPump2On ? "SYSTEM B · RUNNING" : "SYSTEM B · NOT RUNNING") : "NO AC BUS 2"} disabled={!d.transferBus2Powered} onClick={() => toggle("elecHyd2", !s.elecHyd2)} />
          <div className="rounded-lg border border-hyd-s/50 bg-inset p-1.5">
            <div className="mb-1 font-display text-[7px] font-semibold uppercase tracking-[.12em] text-fg">STANDBY</div>
            <div className="grid grid-cols-3 gap-1">{(["OFF", "AUTO", "ON"] as const).map(mode => <button key={mode} type="button" onClick={() => s.patch({ stbyHyd: mode })} className={cn("rounded border px-1 py-1 font-display text-[7px] uppercase", s.stbyHyd === mode ? "border-hyd-s/60 bg-hyd-s/10 text-hyd-s" : "border-border bg-panel text-subtle")}>{mode}</button>)}</div>
          </div>
          <HydraulicTrainerSwitch label="GND INTERCONNECT" state={s.groundInterconnect ? "OPEN" : "CLOSED"} tone="accent" detail={interconnectActual ? "B → A LIVE" : "GROUND"} onClick={() => toggle("groundInterconnect", !s.groundInterconnect)} />
          <HydraulicTrainerSwitch label="GND SERVICING" state={s.hydServicingConnected ? "CONNECTED" : "DISCONNECTED"} tone="accent" detail={s.wow ? "HAND PUMP · HYD FLUID" : "AIRBORNE"} disabled={!s.wow} onClick={() => toggle("hydServicingConnected", !s.hydServicingConnected)} />
          <HydraulicTrainerSwitch label="GND HYD POWER" state={s.hydGroundPowerConnected ? "CONNECTED" : "DISCONNECTED"} tone="accent" detail={s.wow ? "GPMU · PRESSURE / RETURN" : "GROUND ONLY"} disabled={!s.wow} onClick={() => toggle("hydGroundPowerConnected", !s.hydGroundPowerConnected)} />
          <HydraulicTrainerSwitch label="GND AIR CART" state={s.groundPneumaticConnected ? "CONNECTED" : "DISCONNECTED"} tone="accent" detail={s.wow ? "RES PRESS · WHEN NO N₂ · ALSO R MANIFOLD" : "GROUND ONLY"} disabled={!s.wow} onClick={() => s.patch({ groundPneumaticConnected: !s.groundPneumaticConnected, groundPneumaticPsi: !s.groundPneumaticConnected ? 45 : 0 })} />
        </div>
        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          <div className={cn("rounded-lg border p-1.5 text-center font-mono", aLive ? "border-hyd-a/50 bg-hyd-a/5 text-hyd-a" : "border-border text-subtle")}>A · {pressure(s.hydAPress)}</div>
          <div className={cn("rounded-lg border p-1.5 text-center font-mono", bLive ? "border-hyd-b/50 bg-hyd-b/5 text-hyd-b" : "border-border text-subtle")}>B · {pressure(s.hydBPress)}</div>
          <div className={cn("rounded-lg border p-1.5 text-center font-mono", stbyLive ? "border-hyd-s/50 bg-hyd-s/5 text-hyd-s" : "border-border text-subtle")}>S · {pressure(s.hydSPress)}</div>
        </div>
      </Box>
      <HydWireLayer wires={wires} w={size.w} h={size.h} />
    </div>
  );
}

function IntegratedSystemDiagram({ d }: { d: ReturnType<typeof useDerived> }) {
  type IntegratedId = "powerplant" | "apu" | "electrical" | "pneumatic" | "aircond" | "hydraulics" | "flightcontrols" | "landinggear" | "brakes" | "cabin" | "fuel";
  type MapNode = { id: string; system: IntegratedId; label: string; sub?: string; x: number; y: number; active: boolean; tone: string };
  type MapEdge = { from: string; to: string; active: boolean; tone: string; label?: string };
  type Group = { id: IntegratedId; label: string; ata: string; tone: string; nodes: MapNode[]; edges: MapEdge[] };
  const [display, setDisplay] = useState<IntegratedId | "all">("all");
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(true);
  const [selectedPart, setSelectedPart] = useState<{ system: IntegratedId; id: string; label: string; sub?: string; active: boolean } | null>(null);
  const sim = useSim();

  const required: Record<IntegratedId, IntegratedId[]> = {
    powerplant: ["powerplant"],
    apu: ["apu", "electrical", "pneumatic"],
    electrical: ["electrical", "powerplant", "apu"],
    pneumatic: ["pneumatic", "powerplant", "apu"],
    aircond: ["aircond", "pneumatic", "powerplant", "electrical", "apu"],
    hydraulics: ["hydraulics", "powerplant", "electrical", "pneumatic", "apu"],
    flightcontrols: ["flightcontrols", "hydraulics", "powerplant", "electrical", "pneumatic", "apu"],
    landinggear: ["landinggear", "hydraulics", "powerplant", "electrical", "pneumatic"],
    brakes: ["brakes", "landinggear", "hydraulics", "electrical", "flightcontrols", "powerplant"],
    cabin: ["cabin", "aircond", "pneumatic", "electrical", "powerplant", "apu"],
    fuel: ["fuel", "electrical", "powerplant", "apu"],
  };
  const visible = new Set<IntegratedId>(display === "all" ? Object.keys(required) as IntegratedId[] : required[display]);

  const models: Record<IntegratedId, FlowModel | null> = {
    powerplant: flowForSystem("powerplant", d, sim),
    apu: flowForSystem("apu", d, sim),
    hydraulics: flowForSystem("hydraulics", d, sim),
    flightcontrols: flowForSystem("flightcontrols", d, sim),
    landinggear: flowForSystem("landinggear", d, sim),
    aircond: flowForSystem("aircond", d, sim),
    cabin: flowForSystem("cabin", d, sim),
    fuel: flowForSystem("fuel", d, sim),
    electrical: null,
    pneumatic: null,
    brakes: null,
  };

  const infra = (system: IntegratedId): FlowModel => {
    const N = (id: string, label: string, x: number, y: number, active: boolean, tone: string, sub?: string): FlowNode => ({ id, label, x, y, active, tone, sub });
    const E = (from: string, to: string, active: boolean, tone: string, label?: string): FlowEdge => ({ from, to, active, tone, label });
    if (system === "electrical") {
      const ext = d.electricalSource1 === "GPU" || d.electricalSource2 === "GPU";
      return { title: "ELECTRICAL DISTRIBUTION", medium: "AC SOURCES · TRANSFER BUSES · TRs · DC / STANDBY", nodes: [
        N("ext-ac","EXTERNAL POWER",80,100,ext,"elec","115/200V AC ground source"),
        N("gen1","GENERATOR 1",300,100,!!d.generator1BusPowered,"elec","engine-driven AC"),
        N("gen2","GENERATOR 2",520,100,!!d.generator2BusPowered,"elec","engine-driven AC"),
        N("apu-gen","APU GENERATOR",740,100,!!d.apuGenOnBus,"elec","single APU AC source"),
        N("tb1","TRANSFER BUS 1",250,300,!!d.transferBus1Powered,"elec","AC distribution"),
        N("tb2","TRANSFER BUS 2",650,300,!!d.transferBus2Powered,"elec","AC distribution"),
        N("tr1","TR 1",150,500,!!d.tr1Powered,"elec","28V DC"),
        N("tr2","TR 2",450,500,!!d.tr2Powered,"elec","28V DC"),
        N("tr3","TR 3 / DC TIE",750,500,!!d.tr3Powered,"elec","backup DC source"),
        N("dc1","DC BUS 1",250,670,!!d.dcBus1Powered,"elec","28V DC users"),
        N("dc2","DC BUS 2",650,670,!!d.dcBus2Powered,"elec","28V DC users"),
        N("bat","BATTERY / HOT BAT BUS",1050,500,!!d.batteryPower,"elec","control / standby supply"),
        N("stby","STANDBY POWER",1050,680,!!(d.standbyAcPowered || d.standbyDcPowered),"elec","AC/DC standby"),
      ], edges: [
        E("ext-ac","tb1",ext,"elec","external source"), E("ext-ac","tb2",ext,"elec","external source"),
        E("gen1","tb1",!!d.generator1BusPowered,"elec"), E("gen2","tb2",!!d.generator2BusPowered,"elec"), E("apu-gen","tb1",d.electricalSource1 === "APU GEN","elec"), E("apu-gen","tb2",d.electricalSource2 === "APU GEN","elec"),
        E("ext-ac","tb1",d.electricalSource1 === "GPU","elec"), E("ext-ac","tb2",d.electricalSource2 === "GPU","elec"),
        E("gen2","tb1",!!d.transferRelay1Alt,"elec","XFER R3"), E("gen1","tb2",!!d.transferRelay2Alt,"elec","XFER R4"),
        E("gen1","tr1",!!d.tr1Powered,"elec"), E("gen2","tr2",!!d.tr2Powered,"elec"), E("gen2","tr3",!!d.tr3Powered,"elec"),
        E("tr1","dc1",!!d.tr1Powered,"elec"), E("tr2","dc2",!!d.tr2Powered,"elec"), E("tr3","dc1",!!d.tr3Powered && !d.tr1Powered,"elec","TR3 backup"), E("tr3","dc2",!!d.tr3Powered && !d.tr2Powered,"elec","TR3 backup"),
        E("bat","stby",!!d.staticInverterPowered,"elec","static inverter"), E("dc1","stby",!!d.standbyDcPowered && !d.staticInverterPowered,"elec","normal DC standby"), E("tb1","stby",!!d.standbyAcPowered && d.standbyAcSource === "TRANSFER BUS 1","elec","standby AC normal"),
      ] };
    }
    return { title: "PNEUMATIC / BLEED DISTRIBUTION", medium: "NO. 1 LEFT · NO. 2 RIGHT · APU / GROUND · ISOLATION CROSSFEED", nodes: [
      N("e1","ENGINE 1 BLEED SOURCE",80,100,!!d.bleed1Available,"pneumatic","left-side source"),
      N("e2","ENGINE 2 BLEED SOURCE",80,320,!!d.bleed2Available,"pneumatic","right-side source"),
      N("apu","APU BLEED SOURCE",80,540,!!d.apuAvailable && !!sim.apuBleed,"pneumatic","left manifold source"),
      N("ground","GROUND PNEUMATIC",80,760,!!sim.groundPneumaticConnected,"pneumatic","right pack bay → right manifold"),
      N("iso","ISOLATION VALVE",420,360,!!d.isolationOpen,"pneumatic","L ↔ R crossfeed only"),
      N("lman","LEFT MANIFOLD",700,220,!!d.leftManifold,"pneumatic","No. 1 / APU side"),
      N("rman","RIGHT MANIFOLD",700,560,!!d.rightManifold,"pneumatic","No. 2 side"),
      N("lpack","L PACK SUPPLY",1000,220,!!d.packLFlow,"pneumatic","left air-conditioning path"),
      N("rpack","R PACK SUPPLY",1000,560,!!d.packRFlow,"pneumatic","right air-conditioning path"),
      N("start","ENGINE START MANIFOLD",1300,390,!!(d.startValveOpen1 || d.startValveOpen2),"pneumatic","starter air"),
      N("press","HYD RESERVOIR PRESSURIZATION",1300,650,!!(d.bleed1Available || d.bleed2Available || d.reservoirGroundAir),"pneumatic","filter → regulator → reservoirs"),
    ], edges: [
      E("e1","lman",!!d.bleed1Available,"pneumatic"), E("e2","rman",!!d.bleed2Available,"pneumatic"), E("apu","lman",!!d.apuAvailable && !!sim.apuBleed,"pneumatic"), E("ground","rman",!!sim.groundPneumaticConnected,"pneumatic"),
      E("lman","iso",!!d.isolationOpen,"pneumatic"), E("iso","rman",!!d.isolationOpen,"pneumatic"), E("lman","lpack",!!d.packLFlow,"pneumatic"), E("rman","rpack",!!d.packRFlow,"pneumatic"),
      E("lman","start",!!d.leftManifold && !!d.startValveOpen1,"pneumatic"), E("rman","start",!!d.rightManifold && !!d.startValveOpen2,"pneumatic"), E("lman","press",!!d.bleed1Available,"pneumatic"), E("rman","press",!!d.bleed2Available,"pneumatic"), E("ground","press",!!d.reservoirGroundAir,"pneumatic","ground cart (no N₂)"),
    ] };
  };
  models.electrical = infra("electrical");
  models.pneumatic = infra("pneumatic");

  // The landing-gear model contains the four separate brake channels. Reuse those exact nodes/edges
  // for a dedicated BRAKES group instead of inventing a second set of brake components.
  const gearModel = models.landinggear!;
  const brakeIds = new Set(["li","ri","li-v","ri-v","lo","ro","lo-v","ro-v","ab","ws","as"]);
  models.brakes = {
    title: "BRAKES / ANTISKID",
    medium: "SYSTEM A INBOARD · SYSTEM B OUTBOARD · FOUR INDIVIDUAL BRAKE CHANNELS",
    nodes: gearModel.nodes.filter(n => brakeIds.has(n.id)),
    edges: gearModel.edges.filter(e => brakeIds.has(e.from) && brakeIds.has(e.to)),
  };

  const groupOrder: IntegratedId[] = ["powerplant","apu","electrical","pneumatic","aircond","hydraulics","flightcontrols","landinggear","brakes","cabin","fuel"];
  const groupInfo: Record<IntegratedId, { label: string; ata: string; tone: string }> = {
    powerplant:{label:"POWERPLANT",ata:"72/73/74/77/78/80",tone:"fuel"}, apu:{label:"APU",ata:"49/26",tone:"elec"}, electrical:{label:"ELECTRICAL POWER",ata:"24",tone:"elec"}, pneumatic:{label:"PNEUMATIC / BLEED",ata:"36",tone:"pneumatic"}, aircond:{label:"AIR CONDITIONING",ata:"21",tone:"pneumatic"}, hydraulics:{label:"HYDRAULICS",ata:"29",tone:"hyd-a"}, flightcontrols:{label:"FLIGHT CONTROLS",ata:"27",tone:"hyd-a"}, landinggear:{label:"LANDING GEAR",ata:"32",tone:"hyd-a"}, brakes:{label:"BRAKES / ANTISKID",ata:"32",tone:"hyd-b"}, cabin:{label:"CABIN / PRESSURIZATION",ata:"21/38/56",tone:"pneumatic"}, fuel:{label:"FUEL",ata:"28",tone:"fuel"},
  };
  const positions: Record<IntegratedId,[number,number]> = {
    powerplant:[40,40], apu:[1480,40], electrical:[2920,40],
    pneumatic:[40,900], aircond:[1480,900], hydraulics:[2920,900],
    flightcontrols:[40,1760], landinggear:[1480,1760], brakes:[2920,1760],
    cabin:[1480,2620], fuel:[2920,2620],
  };
  const groupW=1360, groupH=760, nodeW=290, nodeH=72;
  const makeGroup = (id: IntegratedId): Group => {
    const m=models[id]!;
    const nodes=m.nodes;
    const cols=4;
    const rows=Math.max(1,Math.ceil(nodes.length/cols));
    const gapX=28, gapY=24;
    const cellW=(groupW-60-gapX*(cols-1))/cols;
    const cellH=Math.min(82,Math.max(74,(groupH-110-gapY*(Math.max(1,rows)-1))/Math.max(1,rows)));
    const map=new Map<string,FlowNode>();
    nodes.forEach((n,i)=>{
      const col=i%cols, row=Math.floor(i/cols);
      const x=30+col*(cellW+gapX)+cellW/2;
      const y=92+row*(cellH+gapY)+cellH/2;
      map.set(n.id,n);
      (n as any).__mx=x; (n as any).__my=y;
    });
    return {id,label:groupInfo[id].label,ata:groupInfo[id].ata,tone:groupInfo[id].tone,
      nodes:nodes.map(n=>({id:`${id}:${n.id}`,system:id,label:n.label,sub:n.sub,x:(n as any).__mx,y:(n as any).__my,active:n.active,tone:n.tone})),
      edges:m.edges.map(e=>({from:`${id}:${e.from}`,to:`${id}:${e.to}`,active:e.active,tone:e.tone,label:e.label}))};
  };
  const groups=groupOrder.map(makeGroup);
  const groupById=new Map(groups.map(g=>[g.id,g]));
  const activeGroups=groups.filter(g=>visible.has(g.id));
  const canvasW=4320, canvasH=3440;
  const interEdges: MapEdge[] = [
    {from:"powerplant:e1-gen",to:"electrical:gen1",active:!!d.generator1BusPowered,tone:"elec",label:"GEN 1 AC"},
    {from:"powerplant:e2-gen",to:"electrical:gen2",active:!!d.generator2BusPowered,tone:"elec",label:"GEN 2 AC"},
    {from:"powerplant:e1-valve",to:"pneumatic:e1",active:!!d.bleed1Available,tone:"pneumatic",label:"BLEED 1"},
    {from:"powerplant:e2-valve",to:"pneumatic:e2",active:!!d.bleed2Available,tone:"pneumatic",label:"BLEED 2"},
    {from:"apu:apu-bleed",to:"pneumatic:apu",active:!!d.apuAvailable && !!sim.apuBleed,tone:"pneumatic",label:"APU BLEED"},
    {from:"electrical:tb1",to:"hydraulics:emp-b1",active:!!d.transferBus1Powered && !!sim.elecHyd1,tone:"elec",label:"AC PUMP 1"},
    {from:"electrical:tb2",to:"hydraulics:emp-b2",active:!!d.transferBus2Powered && !!sim.elecHyd2,tone:"elec",label:"AC PUMP 2"},
    {from:"powerplant:e1-acc",to:"hydraulics:a-p1",active:!!d.hydAPump1On,tone:"hyd-a",label:"EDP 1"},
    {from:"powerplant:e2-acc",to:"hydraulics:a-p2",active:!!d.hydAPump2On,tone:"hyd-a",label:"EDP 2"},
    {from:"powerplant:e1-valve",to:"hydraulics:res-e1-bleed",active:!!d.bleed1Available,tone:"pneumatic",label:"ENG 1 BLEED → RES PRESS"},
    {from:"powerplant:e2-valve",to:"hydraulics:res-e2-bleed",active:!!d.bleed2Available,tone:"pneumatic",label:"ENG 2 BLEED → RES PRESS"},
    {from:"pneumatic:lpack",to:"aircond:l-pack",active:!!d.packLFlow,tone:"pneumatic",label:"L PACK AIR"},
    {from:"pneumatic:rpack",to:"aircond:r-pack",active:!!d.packRFlow,tone:"pneumatic",label:"R PACK AIR"},
    {from:"electrical:tb1",to:"aircond:l-mix",active:!!d.acPower,tone:"elec",label:"AC CONTROL"},
    {from:"electrical:tb2",to:"aircond:r-mix",active:!!d.acPower,tone:"elec",label:"AC CONTROL"},
    {from:"hydraulics:fc-a",to:"flightcontrols:a-fc-mod",active:!!d.flightControlAAvailable,tone:"hyd-a",label:"A HYD"},
    {from:"hydraulics:fc-b",to:"flightcontrols:b-fc-mod",active:!!d.flightControlBAvailable,tone:"hyd-b",label:"B HYD"},
    {from:"hydraulics:mg-mod",to:"landinggear:mg-mod",active:!!d.hydA && !!d.gearTransit,tone:"hyd-a",label:"GEAR HYD"},
    {from:"hydraulics:fc-a",to:"brakes:li",active:!!d.hydA,tone:"hyd-a",label:"A INBOARD"},
    {from:"hydraulics:fc-b",to:"brakes:lo",active:!!d.hydB,tone:"hyd-b",label:"B OUTBOARD"},
  ];
  const groupOffset=(id:IntegratedId)=>positions[id];
  const nodeGlobal=(id:string)=>{
    const [sys,local]=id.split(":") as [IntegratedId,string];
    const g=groupById.get(sys); const n=g?.nodes.find(x=>x.id===id); if(!g||!n)return null;
    const [gx,gy]=groupOffset(sys); return {x:gx+n.x,y:gy+n.y};
  };
  const visibleInterEdges=interEdges.filter(e=>visible.has(e.from.split(":")[0] as IntegratedId)&&visible.has(e.to.split(":")[0] as IntegratedId));
  const groupBorder=(id:IntegratedId)=> id===display ? "#e5e7eb" : `var(--color-${groupInfo[id].tone})`;
  const edgePath=(a:{x:number;y:number},b:{x:number;y:number})=>{const mx=(a.x+b.x)/2;return `M ${a.x} ${a.y} C ${mx} ${a.y} ${mx} ${b.y} ${b.x} ${b.y}`;};
  const buttons: {id:IntegratedId;label:string}[]=[
    {id:"powerplant",label:"POWERPLANT"},{id:"apu",label:"APU"},{id:"electrical",label:"ELECTRICAL"},{id:"pneumatic",label:"PNEUMATIC"},{id:"aircond",label:"AIRCON"},{id:"hydraulics",label:"HYDRAULICS"},{id:"flightcontrols",label:"FLIGHT CONTROLS"},{id:"landinggear",label:"LANDING GEAR"},{id:"brakes",label:"BRAKES"},{id:"cabin",label:"CABIN"}
  ];
  const choose=(id:IntegratedId)=>{setDisplay(id);setSelectedPart(null);setFit(false);setZoom(0.82);};
  return <div className="rounded-lg border border-[#2e343b] bg-[#080a0d] p-2">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div><div className="font-display text-[10px] font-bold uppercase tracking-[.15em] text-fg">INTEGRATED AIRCRAFT SYSTEM MAP</div><div className="mt-1 text-[8px] font-mono uppercase text-subtle">Systems + their actual component chains + inter-system dependencies. Selecting a system keeps every required supporting system and its components visible.</div></div>
      <div className="flex items-center gap-1 font-mono text-[8px]">
        <button type="button" onClick={()=>{setFit(false);setZoom(z=>Math.max(.45,Number((z-.1).toFixed(2))))}} className="rounded border border-border px-2 py-1 text-fg">−</button>
        <button type="button" onClick={()=>{setFit(true);setZoom(1)}} className={cn("rounded border px-2 py-1 text-subtle",fit?"border-[#9aa2aa] bg-[#30363d] text-fg":"border-border")}>FIT</button>
        <button type="button" onClick={()=>{setFit(false);setZoom(1)}} className="min-w-[3.5rem] rounded border border-border px-2 py-1 text-subtle">{Math.round(zoom*100)}%</button>
        <button type="button" onClick={()=>{setFit(false);setZoom(z=>Math.min(1.8,Number((z+.1).toFixed(2))))}} className="rounded border border-border px-2 py-1 text-fg">+</button>
      </div>
    </div>
    <div className="mb-2 rounded border border-[#30363d] bg-[#0d1014] p-2">
      <div className="mb-2 text-[8px] font-mono uppercase tracking-[.12em] text-subtle">SELECT FOCUS — COMPONENTS STAY WITH THEIR SYSTEM</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <button type="button" onClick={()=>{setDisplay("all");setSelectedPart(null);setFit(true);setZoom(1)}} className={cn("min-h-[44px] rounded border px-2 py-2 font-display text-[9px] font-bold leading-tight tracking-[.08em]",display==="all"?"border-[#9aa2aa] bg-[#30363d] text-fg":"border-[#30353c] text-subtle")}>ALL SYSTEMS</button>
        {buttons.map(b=><button key={b.id} type="button" onClick={()=>choose(b.id)} className={cn("min-h-[44px] rounded border px-2 py-2 font-display text-[9px] font-bold leading-tight tracking-[.08em]",display===b.id?"border-[#9aa2aa] bg-[#30363d] text-fg":"border-[#30353c] text-subtle")}>{b.label}</button>)}
      </div>
    </div>
    <div className="flow-scroll-viewport w-full max-w-full overflow-auto rounded-md border border-[#252b32] bg-[#05070a]" style={{WebkitOverflowScrolling:"touch",touchAction:"pan-x pan-y"}}>
      <svg viewBox={`0 0 ${canvasW} ${canvasH}`} width={fit?"100%":Math.round(canvasW*zoom)} height={fit?undefined:Math.round(canvasH*zoom)} preserveAspectRatio="xMinYMin meet" className={fit?"block h-auto w-full select-none":"block max-w-none select-none"} role="img" aria-label="Integrated aircraft system and component diagram">
        <defs>
          <filter id="integrated-component-glow"><feGaussianBlur stdDeviation="2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          {(["hyd-a","hyd-b","hyd-s","pneumatic","accent","elec","fuel","warn"] as const).map(t => <marker key={t} id={`integrated-arrow-${t}`} markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M 0 0 L 10 5 L 0 10 z" fill={`var(--color-${t})`} /></marker>)}
        </defs>
        {visibleInterEdges.map((e,i)=>{const a=nodeGlobal(e.from),b=nodeGlobal(e.to);if(!a||!b)return null;const path=edgePath(a,b);return <g key={`ix-${i}`}><path d={path} fill="none" stroke="#1d2228" strokeWidth="14" strokeLinecap="round"/><path d={path} fill="none" stroke={`var(--color-${e.tone})`} strokeWidth={e.active?5:2} opacity={e.active?.9:.25} strokeLinecap="round" className={e.active?"flow-active":undefined} markerEnd={`url(#integrated-arrow-${e.tone})`}/><text x={(a.x+b.x)/2} y={(a.y+b.y)/2-8} fill="var(--color-subtle)" fontSize="9" fontFamily="IBM Plex Mono, monospace" textAnchor="middle">{e.label}</text></g>})}
        {activeGroups.map(g=>{const [gx,gy]=positions[g.id]; return <g key={g.id}>
          <rect x={gx} y={gy} width={groupW} height={groupH} rx="14" fill="#0b0e12" stroke={groupBorder(g.id)} strokeWidth={g.id===display?3:1.5}/>
          <text x={gx+22} y={gy+30} fill="var(--color-fg)" fontSize="16" fontWeight="700" fontFamily="Barlow Condensed, sans-serif" letterSpacing="1.5">{g.label}</text>
          <text x={gx+22} y={gy+50} fill="var(--color-subtle)" fontSize="9" fontFamily="IBM Plex Mono, monospace">ATA {g.ata} · {g.nodes.length} COMPONENTS</text>
          {g.edges.map((e,i)=>{const a=g.nodes.find(n=>n.id===e.from),b=g.nodes.find(n=>n.id===e.to);if(!a||!b)return null;const path=edgePath({x:gx+a.x,y:gy+a.y},{x:gx+b.x,y:gy+b.y});return <path key={`e-${i}`} d={path} fill="none" stroke={`var(--color-${e.tone})`} strokeWidth={e.active?3:1.2} opacity={e.active?.85:.22} strokeLinecap="round" markerEnd={`url(#integrated-arrow-${e.tone})`}/>;})}
          {g.nodes.map(n=>{const selected=selectedPart?.system===g.id&&selectedPart.id===n.id.split(":")[1]; return <g key={n.id} transform={`translate(${gx+n.x-nodeW/2} ${gy+n.y-nodeH/2})`} role="button" tabIndex={0} aria-label={`Select ${n.label}`} onClick={()=>{setSelectedPart({system:g.id,id:n.id.split(":")[1],label:n.label,sub:n.sub,active:n.active});setDisplay(g.id)}} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setSelectedPart({system:g.id,id:n.id.split(":")[1],label:n.label,sub:n.sub,active:n.active});setDisplay(g.id)}}} className="cursor-pointer">
            <rect width={nodeW} height={nodeH} rx="7" fill={selected?"#2b323a":n.active?"#151d1a":"#0f1216"} stroke={selected?"#e5e7eb":n.active?`var(--color-${n.tone})`:"#30363d"} strokeWidth={selected?2.5:n.active?1.6:1}/>
            <circle cx="13" cy="16" r="4" fill={n.active?`var(--color-${n.tone})`:"#30363d"}/>
            <text x="24" y="21" fill="var(--color-fg)" fontSize="9" fontWeight="700" fontFamily="Barlow Condensed, sans-serif" letterSpacing=".7">{n.label}</text>
            {n.sub && <text x="24" y="42" fill={n.active?`var(--color-${n.tone})`:"var(--color-subtle)"} fontSize="7" fontFamily="IBM Plex Mono, monospace">{n.sub.length>47?n.sub.slice(0,46)+"…":n.sub}</text>}
            <text x="24" y="59" fill="var(--color-subtle)" fontSize="6.5" fontFamily="IBM Plex Mono, monospace">COMPONENT · TAP FOR STATE</text>
          </g>})}
        </g>})}
      </svg>
    </div>
    <div className="mt-2 grid gap-2 text-[8px] font-mono uppercase text-subtle sm:grid-cols-2">
      <div className="rounded border border-border bg-[#0d1014] px-2 py-2">DISPLAY: {display === "all" ? "ALL SYSTEMS + ALL COMPONENTS" : `${display.toUpperCase()} + REQUIRED SUPPORT COMPONENTS`}</div>
      <div className="rounded border border-border bg-[#0d1014] px-2 py-2"><div className="mb-1">REQUIRED SUPPORT — TAP TO CHANGE FOCUS:</div>{display === "all" ? <span>ALL COMPONENTS SHOWN</span> : <div className="flex flex-wrap gap-1">{required[display].filter(x=>x!==display).map(x=><button key={x} type="button" onClick={()=>choose(x)} className="min-h-[32px] rounded border border-[#3b424a] bg-[#171b20] px-2 py-1 text-[8px] text-fg">{x.toUpperCase()}</button>)}{required[display].filter(x=>x!==display).length===0 && <span>NONE</span>}</div>}</div>
    </div>
    {selectedPart && <div className="mt-2 rounded border border-[#30363d] bg-[#0d1014] p-2 text-[9px] font-mono"><span className="text-fg">COMPONENT:</span> {selectedPart.label} <span className={selectedPart.active?"text-ok":"text-subtle"}>· {selectedPart.active?"ACTIVE / LIVE":"STANDBY / OFF"}</span>{selectedPart.sub && <span className="text-subtle"> · {selectedPart.sub}</span>}</div>}
  </div>;
}

function ComponentFlowPanel({ d }: { d: ReturnType<typeof useDerived> }) {
  const sim = useSim();
  const [system, setSystem] = useState<SystemId>("hydraulics");
  const [selected, setSelected] = useState<string>("mod-a");
  const systems: { id: SystemId; label: string; ata: string }[] = [
    { id: "powerplant", label: "POWERPLANT", ata: "72/73/74/77/78/80" },
    { id: "apu", label: "APU", ata: "49/26" },
    { id: "aircond", label: "AIR CONDITIONING", ata: "21/36" },
    { id: "cabin", label: "CABIN / PRESSURIZATION", ata: "21/38/56" },
    { id: "hydraulics", label: "HYDRAULICS", ata: "29" },
    { id: "flightcontrols", label: "FLIGHT CONTROLS", ata: "27" },
    { id: "landinggear", label: "LANDING GEAR / BRAKES", ata: "32" },
  ];
  const parts = useMemo(() => PARTS.filter((p) => p.system === system), [system]);
  const activeIds = new Set(d.components.filter((c) => c.active).map((c) => c.id));
  const liveForPart = (id: string) => {
    const map: Record<string, boolean> = {
      "apu-door": d.apuAvailable || d.interlocks.some((x) => x.id === "apu-door"),
      "apu-bleed": d.ductPsi > 18 && d.apuAvailable,
      "starter": d.startValveOpen1 || d.startValveOpen2,
      "starter-valve": d.startValveOpen1 || d.startValveOpen2,
      "igniter": d.startValveOpen1 || d.startValveOpen2,
      "exciter": d.startValveOpen1 || d.startValveOpen2,
      "ac-gen": d.generator1BusPowered || d.generator2BusPowered,
      "eng-bleed": d.bleed1Available || d.bleed2Available,
      "edp-a": d.hydAPump1On || d.hydAPump2On,
      "res-a": sim.hydAPress > 0,
      "mod-a": sim.hydAPress > 1500,
      "res-b": sim.hydBPress > 0,
      "emp-b": sim.hydBPress > 1500,
      "mod-b": sim.hydBPress > 1500,
      "stby-pump": sim.hydSPress > 500,
      "stby-mod": sim.hydSPress > 1800,
      "pack-valve": d.packLFlow || d.packRFlow,
      "iso-valve": d.isolationOpen,
      "acm": d.packLFlow || d.packRFlow,
      "water-sep": d.packLFlow || d.packRFlow,
      "outflow": d.packLFlow || d.packRFlow || d.acPower,
      "fc-mod": d.flightControlAAvailable || d.flightControlBAvailable,
      "aileron": Math.abs(d.controlSurfaces.aileronL) > 0.01 || Math.abs(d.controlSurfaces.aileronR) > 0.01,
      "flt-spoiler": d.controlSurfaces.spoiler > 0.01,
      "flap-pu": d.teFlapHydraulicDriveAvailable || d.alternateFlapDrivePowered,
      "flap-motor": d.teFlapHydraulicDriveAvailable,
      "le-flap": sim.hydAPress > 1500 || d.standbyRudderPowered,
      "gear-sel": d.gearTransit,
      "mg-iso": d.gearTransit || d.gearDown,
      "mg-mod": d.gearTransit || d.gearDown,
      "steer-dep": d.noseWheelSteeringAvailable,
      "brk-acc": sim.hydBPress > 1500,
      "brk-xmtr": sim.hydBPress > 1500,
      "ab-shuttle": d.autobrakeActive,
      "ab-mod": d.autobrakeActive,
      "antiskid-t": d.antiskidOperational,
      "antiskid-v": d.antiskidModulating,
    };
    return map[id] ?? activeIds.has(id);
  };
  const selectedPart = parts.find((p) => p.id === selected) ?? parts[0];
  const flow = flowForSystem(system, d, sim);
  const activeCount = flow.nodes.filter((n) => n.active).length;
  const liveParts = parts.filter((p) => liveForPart(p.id)).length;

  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-lg border border-[#444b54] bg-[#0b0d10] shadow-[inset_0_1px_0_rgba(255,255,255,.04)]">
      <div className="flex flex-wrap gap-1 border-b border-[#353b43] bg-[#171a1f] p-2">
        {systems.map((item) => (
          <button key={item.id} type="button" onClick={() => { setSystem(item.id); setSelected(PARTS.find((p) => p.system === item.id)?.id ?? ""); }}
            className={cn("rounded border px-2 py-1.5 font-display text-[8px] font-bold tracking-[0.12em]", system === item.id ? "border-[#9aa2aa] bg-[#30363d] text-fg" : "border-[#30353c] bg-[#111419] text-subtle hover:text-fg")}>
            {item.label}
          </button>
        ))}
      </div>

      <div className="border-b border-[#353b43] bg-[#0f1216] px-3 py-2">
        <div className="mb-2 flex flex-wrap gap-2 font-mono text-[8px] uppercase">
          <span className="rounded border border-hyd-a/40 bg-hyd-a/10 px-2 py-1 text-hyd-a">A · BLUE</span>
          <span className="rounded border border-hyd-b/40 bg-hyd-b/10 px-2 py-1 text-hyd-b">B · GREEN</span>
          <span className="rounded border border-hyd-s/40 bg-hyd-s/10 px-2 py-1 text-hyd-s">STANDBY · AMBER</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-display text-[10px] font-bold uppercase tracking-[.15em] text-fg">LIVE SYSTEM FLOW · ATA {systems.find((x) => x.id === system)?.ata}</div>
            <div className="mt-1 text-[9px] text-subtle">Cockpit switch → component → flow → user → indication. Animated paths appear only when the simulated path is live.</div>
          </div>
          <div className="flex gap-2 font-mono text-[8px] uppercase">
            <span className="rounded border border-ok/30 bg-ok/5 px-2 py-1 text-ok">{activeCount} flow nodes</span>
            <span className="rounded border border-border px-2 py-1 text-subtle">{liveParts}/{parts.length} live components</span>
          </div>
        </div>
      </div>

      <div className="grid min-w-0 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,.65fr)]">
        <div className="min-w-0 overflow-hidden border-b border-[#353b43] p-2 lg:border-b-0 lg:border-r">
          <LiveFlowDiagram flow={flow} />
        </div>
        <div className="min-w-0 max-h-[520px] overflow-auto">
          {parts.map((p) => {
            const on = liveForPart(p.id);
            return <button key={p.id} type="button" onClick={() => setSelected(p.id)} className={cn("grid w-full grid-cols-[1fr_auto] items-center border-b border-[#242930] px-3 py-2 text-left last:border-b-0", selectedPart?.id === p.id ? "bg-[#272d34]" : "bg-[#0e1115] hover:bg-[#15191e]")}>
              <span className="pr-2"><span className="block text-[10px] font-semibold uppercase tracking-wide text-fg">{p.name}</span><span className="text-[8px] font-mono text-subtle">ATA {p.ata} · {p.group}</span></span>
              <span className={cn("font-mono text-[8px] font-bold", on ? "text-ok" : "text-subtle")}>{on ? "LIVE" : "STBY/OFF"}</span>
            </button>;
          })}
        </div>
      </div>

      {selectedPart && (
        <div className="border-t border-[#353b43] bg-[#111419] p-3">
          <div className="flex items-start justify-between gap-2">
            <div><div className="font-display text-[10px] font-bold uppercase tracking-[.14em] text-fg">{selectedPart.name}</div><div className="mt-1 font-mono text-[8px] uppercase text-subtle">ATA {selectedPart.ata} · {selectedPart.group}</div></div>
            <span className={cn("rounded border px-2 py-1 font-mono text-[8px]", liveForPart(selectedPart.id) ? "border-ok/50 text-ok" : "border-border text-subtle")}>{liveForPart(selectedPart.id) ? "ACTIVE" : "OFF / PASSIVE"}</span>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2 text-[9px] leading-relaxed">
            <div><span className="font-display uppercase tracking-wide text-subtle">Function</span><p className="mt-1 text-muted">{selectedPart.function}</p></div>
            <div className="rounded border border-[#30363d] bg-[#0c0f13] p-2"><span className="font-display uppercase tracking-wide text-subtle">System flow</span><p className="mt-1 font-mono text-[8px] text-fg">{selectedPart.flow}</p></div>
            <div><span className="font-display uppercase tracking-wide text-subtle">Relationships</span><p className="mt-1 text-muted">{selectedPart.relationships}</p></div>
            <div><span className="font-display uppercase tracking-wide text-subtle">Controls / indications</span><p className="mt-1 text-muted">{selectedPart.controls}</p></div>
          </div>
        </div>
      )}
    </div>
  );
}

type FlowNode = { id: string; label: string; sub?: string; x: number; y: number; active: boolean; tone: string };
type FlowEdge = { from: string; to: string; active: boolean; tone: string; label?: string };
type FlowModel = { title: string; medium: string; nodes: FlowNode[]; edges: FlowEdge[] };

function flowForSystem(system: SystemId, d: ReturnType<typeof useDerived>, s: SimStore): FlowModel {
  const hydA = Number(s.hydAPress ?? 0) > 1500;
  const hydB = Number(s.hydBPress ?? 0) > 1500;
  const hydS = Number(s.hydSPress ?? 0) > 1800;
  const groundAirCartLive = !!d.reservoirGroundAir;
  const fcA = !!d.flightControlAAvailable;
  const fcB = !!d.flightControlBAvailable;
  const N = (id: string, label: string, x: number, y: number, active: boolean, tone: string, sub?: string): FlowNode => ({ id, label, x, y, active: !!active, tone, sub });
  const E = (from: string, to: string, active: boolean, tone: string, label?: string): FlowEdge => ({ from, to, active: !!active, tone, label });

  switch (system) {
    case "hydraulics": {
      const livePress = !!(d.bleed1Available || d.bleed2Available || d.reservoirGroundAir);
      const service = !!s.hydServicingConnected;
      const groundPowerHydLive = !!s.hydGroundPowerConnected && !!s.wow;
      const interconnect = !!s.groundInterconnect && !!s.hydGroundPowerConnected && !!s.wow && !!s.parkingBrake;
      const nodes = [
        // Common pneumatic pressurization — kept in its own top band.
        N("res-e1-bleed","ENG 1 BLEED · RES PRESS",90,80,!!d.bleed1Available,"pneumatic","engine bleed source"),
        N("res-e2-bleed","ENG 2 BLEED · RES PRESS",90,220,!!d.bleed2Available,"pneumatic","engine bleed source"),
        N("res-air-filter","RESERVOIR PRESSURIZATION AIR FILTER",330,150,livePress,"pneumatic","bleed-air filter"),
        N("res-reg","RESERVOIR PRESSURE REGULATOR",570,150,livePress,"pneumatic","~40–47 psi"),
        N("res-man","RESERVOIR PRESSURIZATION MANIFOLD",810,150,livePress,"pneumatic","common A / B / standby feed"),
        N("res-relief","RESERVOIR PRESSURIZATION RELIEF VALVE",1050,280,livePress,"pneumatic","overpressure protection"),
        N("res-ground-cart","GROUND AIR CART",570,300,groundAirCartLive,"pneumatic","alternate ground source · no N₂"),

        // Separate hydraulic-fluid servicing path.
        N("gs-source","GROUND HYDRAULIC FLUID SUPPLY",1320,80,service,"accent","central fluid source"),
        N("gs-pump","GROUND SERVICING HAND PUMP",1550,80,service,"accent","manual low-pressure fill"),
        N("gs-filter","GROUND SERVICING FILTER",1780,80,service,"accent","0.4–3 micron"),
        N("fill-man","SHARED RESERVOIR FILL / BALANCE MANIFOLD",2010,150,service,"hyd-s","A · B · STANDBY fill paths"),

        // System A: reservoir → shutoff → EDP → pressure filter → module → users → return filter.
        N("res-a","A RESERVOIR",110,520,Number(s.hydAPress??0)>0 || livePress,"hyd-a",livePress ? `RES HEAD 40–47 PSI · HYD ${Math.round(Number(s.hydAPress??0))} PSI` : `RES HEAD 0 PSI · HYD ${Math.round(Number(s.hydAPress??0))} PSI`),
        N("a-fs1","A SUPPLY SHUTOFF · ENG 1",340,470,!s.engine1FirePulled,"hyd-a","low-pressure suction"),
        N("a-fs2","A SUPPLY SHUTOFF · ENG 2",340,570,!s.engine2FirePulled,"hyd-a","low-pressure suction"),
        N("a-p1","ENG 1 EDP",570,470,!!d.hydAPump1On,"hyd-a","engine accessory gearbox"),
        N("a-p2","ENG 2 EDP",570,570,!!d.hydAPump2On,"hyd-a","engine accessory gearbox"),
        N("a-pf1","A PRESSURE FILTER · ENG 1",800,470,!!d.hydAPump1On,"hyd-a","pump outlet"),
        N("a-pf2","A PRESSURE FILTER · ENG 2",800,570,!!d.hydAPump2On,"hyd-a","pump outlet"),
        N("mod-a","SYSTEM A MODULE",1030,520,hydA,"hyd-a","relief · checks · low pressure"),
        N("fc-a","SYSTEM A DISTRIBUTION / USERS",1260,520,fcA,"hyd-a","gear · FC · brakes · reversers"),
        N("ret-a","A RETURN FILTER",1490,520,hydA,"hyd-a","main return"),
        N("a-hx","A CASE-DRAIN HEAT EXCHANGER",1490,680,hydA,"hyd-a","No. 1 fuel tank"),

        // System B: reservoir → electric pumps → module → users → return filter → No.2 HX → reservoir.
        N("res-b","B RESERVOIR",110,850,Number(s.hydBPress??0)>0 || livePress,"hyd-b",livePress ? `RES HEAD 40–47 PSI · HYD ${Math.round(Number(s.hydBPress??0))} PSI` : `RES HEAD 0 PSI · HYD ${Math.round(Number(s.hydBPress??0))} PSI`),
        N("emp-b1","B ELECTRIC PUMP 1",340,800,!!d.hydBPump1On,"hyd-b","115V AC"),
        N("emp-b2","B ELECTRIC PUMP 2",340,900,!!d.hydBPump2On,"hyd-b","115V AC"),
        N("mod-b","SYSTEM B MODULE",570,850,hydB,"hyd-b","filters · relief · checks"),
        N("fc-b","SYSTEM B DISTRIBUTION / USERS",800,850,fcB,"hyd-b","outboard FC / brakes / spoilers"),
        N("ret-b","B RETURN FILTER",1030,850,hydB,"hyd-b","main return"),
        N("b-hx","B RETURN HEAT EXCHANGER",1260,850,hydB,"hyd-b","No. 2 fuel tank"),

        // Standby: no separate HX or return-filter stage.
        N("stby-res","STANDBY RESERVOIR",110,1130,Number(s.hydSPress??0)>0 || livePress || service,"hyd-s",livePress ? `RES HEAD 40–47 PSI · HYD ${Math.round(Number(s.hydSPress??0))} PSI` : `RES HEAD 0 PSI · HYD ${Math.round(Number(s.hydSPress??0))} PSI`),
        N("stby-pump","STANDBY ELECTRIC PUMP",340,1130,hydS,"hyd-s","115V AC"),
        N("stby-mod","STANDBY HYD MODULAR UNIT",570,1130,hydS,"hyd-s","relief · filters · low pressure"),
        N("stby-users","STANDBY USERS",800,1130,hydS,"hyd-s","rudder (A+B) · LE devices"),

        // Ground power is a separate ground-only pressure path into B, then B → A.
        N("gpm","GROUND POWER MODULAR UNIT",1030,1130,groundPowerHydLive,"accent","external ~3000 psi"),
        N("giv","GROUND INTERCONNECT VALVE",1260,1130,interconnect,"accent","B → A · ground only"),
      ];
      return { title:"HYDRAULIC SYSTEM — CORRECTED ATA 29 FLOW", medium:"A BLUE · B GREEN · STANDBY AMBER · SERVICING / PRESSURIZATION / GROUND POWER SEPARATED", nodes, edges:[
        // Reservoir pressurization air.
        E("res-e1-bleed","res-air-filter",!!d.bleed1Available,"pneumatic"), E("res-e2-bleed","res-air-filter",!!d.bleed2Available,"pneumatic"),
        E("res-air-filter","res-reg",livePress,"pneumatic"), E("res-reg","res-man",livePress,"pneumatic"), 
        E("res-ground-cart","res-man",!!d.reservoirGroundAir,"pneumatic","ground air (no N₂)"),
        E("res-man","res-relief",livePress,"pneumatic","overpressure vent"),
        E("res-man","res-a",livePress,"pneumatic","A reservoir head pressure"), E("res-man","res-b",livePress,"pneumatic","B reservoir head pressure"), E("res-man","stby-res",livePress,"pneumatic","Standby reservoir head pressure"),

        // Ground fluid servicing shared fill/balance manifold.
        E("gs-source","gs-pump",service,"accent"), E("gs-pump","gs-filter",service,"accent"), E("gs-filter","fill-man",service,"accent","FILTER → SHARED FILL / BALANCE"),
        E("fill-man","res-a",service,"hyd-a","A reservoir fill"), E("fill-man","res-b",service,"hyd-b","B reservoir fill"), E("fill-man","stby-res",service,"hyd-s","Standby reservoir fill"),

        // System A supply and independent case-drain cooling branch.
        E("res-a","a-fs1",!!d.hydAPump1On && !s.engine1FirePulled && Number(d.hydA??0)>0,"hyd-a"), E("res-a","a-fs2",!!d.hydAPump2On && !s.engine2FirePulled && Number(d.hydA??0)>0,"hyd-a"),
        E("a-fs1","a-p1",!!d.hydAPump1On,"hyd-a"), E("a-fs2","a-p2",!!d.hydAPump2On,"hyd-a"),
        E("a-p1","a-pf1",!!d.hydAPump1On,"hyd-a"), E("a-p2","a-pf2",!!d.hydAPump2On,"hyd-a"), E("a-pf1","mod-a",!!d.hydAPump1On,"hyd-a"), E("a-pf2","mod-a",!!d.hydAPump2On,"hyd-a"),
        E("mod-a","fc-a",hydA,"hyd-a"), E("fc-a","ret-a",hydA,"hyd-a"), E("ret-a","res-a",hydA,"hyd-a","main return"),
        E("a-p1","a-hx",!!d.hydAPump1On,"hyd-a","case drain"), E("a-p2","a-hx",!!d.hydAPump2On,"hyd-a","case drain"), E("a-hx","res-a",hydA,"hyd-a","cooled case drain"),

        // System B supply and return cooling.
        E("res-b","emp-b1",!!d.hydBPump1On && Number(d.hydB??0)>0,"hyd-b"), E("res-b","emp-b2",!!d.hydBPump2On && Number(d.hydB??0)>0,"hyd-b"), E("emp-b1","mod-b",!!d.hydBPump1On,"hyd-b"), E("emp-b2","mod-b",!!d.hydBPump2On,"hyd-b"),
        E("mod-b","fc-b",hydB,"hyd-b"), E("fc-b","ret-b",hydB,"hyd-b"), E("ret-b","b-hx",hydB,"hyd-b"), E("b-hx","res-b",hydB,"hyd-b","cooled return"),

        // Standby supply and direct return — no separate HX / return filter.
        E("stby-res","stby-pump",hydS,"hyd-s"), E("stby-pump","stby-mod",hydS,"hyd-s"), E("stby-mod","stby-users",hydS,"hyd-s"), E("stby-users","stby-res",hydS,"hyd-s","direct return"),

        // Ground hydraulic power: external cart → B module → GIV → A module.
        E("gpm","mod-b",groundPowerHydLive,"hyd-b","GPMU pressure → B"), E("mod-b","gpm",groundPowerHydLive,"accent","B return → GPMU"), E("mod-b","giv",interconnect,"hyd-b","B pressure → interconnect"), E("giv","mod-a",interconnect,"hyd-a","B → A"),
      ]};
    }
    case "flightcontrols": {
      const nodes = [
        N("a-fc-mod","SYSTEM A FLIGHT CONTROL MODULE",130,130,fcA,"hyd-a","FC shutoff + spoiler shutoff"),
        N("a-pcu","A PRIMARY CONTROL PCUs",390,130,fcA,"hyd-a","aileron · elevator · rudder"),
        N("a-spv","A SPOILER SHUTOFF VALVE",650,130,fcA,"hyd-a","System A"),
        N("sp3","FLIGHT SPOILER 3",930,90,!!s.spoilerA,"hyd-a","System A · 1 actuator"),
        N("sp6","FLIGHT SPOILER 6",930,170,!!s.spoilerA,"hyd-a","System A · 1 actuator"),
        N("b-fc-mod","SYSTEM B FLIGHT CONTROL MODULE",130,390,fcB,"hyd-b","FC shutoff + spoiler shutoff"),
        N("b-pcu","B PRIMARY CONTROL PCUs",390,390,fcB,"hyd-b","aileron · elevator · rudder"),
        N("b-spv","B SPOILER SHUTOFF VALVE",650,390,fcB,"hyd-b","System B"),
        N("sp2","FLIGHT SPOILER 2",930,350,!!s.spoilerB,"hyd-b","System B · 1 actuator"),
        N("sp7","FLIGHT SPOILER 7",930,430,!!s.spoilerB,"hyd-b","System B · 1 actuator"),
        N("gsv","GROUND SPOILER ACTUATOR VALVE",130,650,hydA&&!!d.speedBrakeArmed,"hyd-a","System A · ground logic"),
        N("gsi","GROUND SPOILER INTERLOCK VALVE",390,650,hydA&&!!d.speedBrakeArmed,"hyd-a","air/ground interlock"),
        N("g1-8","GROUND SPOILERS 1 / 8",650,610,hydA&&!!d.speedBrakeArmed,"hyd-a","outboard · 1 actuator each"),
        N("g4-5","GROUND SPOILERS 4 / 5",650,690,hydA&&!!d.speedBrakeArmed,"hyd-a","inboard · 2 actuators each"),
        N("flap-pu","TE FLAP POWER UNIT",930,650,!!(d.teFlapHydraulicDriveAvailable||d.alternateFlapDrivePowered),"hyd-a","hydraulic motor + electric backup"),
        N("bypass","TE FLAP BYPASS VALVE",1190,650,!!d.alternateFlapDrivePowered,"hyd-a","relieves hydraulic lock"),
        N("le-valve","LE FLAP / SLAT CONTROL VALVE",1450,650,!!(d.hydA>1500||d.standbyRudderPowered),"hyd-s","System A + standby backup"),
      ];
      return { title:"FLIGHT CONTROLS — MODULES → SHUTOFFS → ACTUATORS", medium:"ATA 27 · A BLUE · B GREEN · STANDBY AMBER", nodes, edges:[
        E("a-fc-mod","a-pcu",fcA,"hyd-a"), E("a-fc-mod","a-spv",fcA,"hyd-a"), E("a-spv","sp3",!!s.spoilerA,"hyd-a"), E("a-spv","sp6",!!s.spoilerA,"hyd-a"),
        E("b-fc-mod","b-pcu",fcB,"hyd-b"), E("b-fc-mod","b-spv",fcB,"hyd-b"), E("b-spv","sp2",!!s.spoilerB,"hyd-b"), E("b-spv","sp7",!!s.spoilerB,"hyd-b"),
        E("gsv","gsi",hydA&&!!d.speedBrakeArmed,"hyd-a"), E("gsi","g1-8",hydA&&!!d.speedBrakeArmed,"hyd-a"), E("gsi","g4-5",hydA&&!!d.speedBrakeArmed,"hyd-a"),
        E("a-fc-mod","flap-pu",hydA,"hyd-a"), E("flap-pu","bypass",!!d.alternateFlapDrivePowered,"hyd-a"), E("a-fc-mod","le-valve",d.hydA>1500,"hyd-a"), E("bypass","le-valve",!!d.alternateFlapDrivePowered,"hyd-s"),
      ]};
    }
    case "landinggear": {
      const brakeA = d.hydA > 1500, brakeB = d.hydB > 1500;
      const moving = !!(d.gearTransit||d.gearDown);
      const leftIn = brakeA && !!d.antiskidOperational, rightIn = leftIn;
      const leftOut = brakeB && !!d.antiskidOperational, rightOut = leftOut;
      const nodes = [
        N("gear-sel","LANDING GEAR SELECTOR",120,100,moving,"accent",String(s.gear??"OFF")),
        N("mg-iso","MAIN GEAR ISOLATION VALVE",370,100,moving,"hyd-a","System A"),
        N("mg-mod","MAIN GEAR MODULAR PACKAGE",620,100,moving,"hyd-a","relief · checks · restrictors"),
        N("left-main-act","LEFT MAIN GEAR ACTUATOR",870,70,moving,"hyd-a","System A"),
        N("right-main-act","RIGHT MAIN GEAR ACTUATOR",870,150,moving,"hyd-a","System A"),
        N("nose-act","NOSE GEAR ACTUATOR",1120,110,moving,"hyd-a","System A"),
        N("nws","NOSE WHEEL STEERING",1370,110,!!d.noseWheelSteeringAvailable,"hyd-a","System A"),
        N("li","LEFT INBOARD BRAKE",120,390,leftIn,"hyd-a","System A · inboard"),
        N("ri","RIGHT INBOARD BRAKE",120,470,rightIn,"hyd-a","System A · inboard"),
        N("li-v","LEFT INBOARD ANTISKID VALVE",390,390,leftIn,"hyd-a","individual channel"),
        N("ri-v","RIGHT INBOARD ANTISKID VALVE",390,470,rightIn,"hyd-a","individual channel"),
        N("lo","LEFT OUTBOARD BRAKE",660,390,leftOut,"hyd-b","System B · outboard"),
        N("ro","RIGHT OUTBOARD BRAKE",660,470,rightOut,"hyd-b","System B · outboard"),
        N("lo-v","LEFT OUTBOARD ANTISKID VALVE",930,390,leftOut,"hyd-b","individual channel"),
        N("ro-v","RIGHT OUTBOARD ANTISKID VALVE",930,470,rightOut,"hyd-b","individual channel"),
        N("ab","AUTOBRAKE MODULATOR / SHUTTLE",1200,430,!!d.autobrakeActive,"hyd-s","common automatic pressure command"),
        N("ws","WHEEL-SPEED TRANSDUCERS",1470,430,!!d.antiskidOperational,"hyd-s","four braked-wheel channels"),
        N("as","ANTISKID CONTROL / MODULATION",1740,430,!!d.antiskidOperational,"hyd-s","individual wheel channels"),
      ];
      return { title:"LANDING GEAR / BRAKES — LEFT / RIGHT COMPONENT PATHS", medium:"ATA 32 · A INBOARD · B OUTBOARD · 4 BRAKE CHANNELS", nodes, edges:[
        E("gear-sel","mg-iso",moving,"hyd-a"), E("mg-iso","mg-mod",moving,"hyd-a"),
        E("mg-mod","left-main-act",moving,"hyd-a"), E("mg-mod","right-main-act",moving,"hyd-a"), E("mg-mod","nose-act",moving,"hyd-a"), E("nose-act","nws",!!d.noseWheelSteeringAvailable,"hyd-a"),
        E("li","li-v",leftIn,"hyd-a"), E("ri","ri-v",rightIn,"hyd-a"), E("lo","lo-v",leftOut,"hyd-b"), E("ro","ro-v",rightOut,"hyd-b"),
        E("ab","li-v",!!d.autobrakeActive&&leftIn,"hyd-a"), E("ab","ri-v",!!d.autobrakeActive&&rightIn,"hyd-a"), E("ab","lo-v",!!d.autobrakeActive&&leftOut,"hyd-b"), E("ab","ro-v",!!d.autobrakeActive&&rightOut,"hyd-b"),
        E("li-v","ws",!!d.antiskidOperational,"hyd-s"), E("ri-v","ws",!!d.antiskidOperational,"hyd-s"), E("lo-v","ws",!!d.antiskidOperational,"hyd-s"), E("ro-v","ws",!!d.antiskidOperational,"hyd-s"), E("ws","as",!!d.antiskidOperational,"hyd-s"),
      ]};
    }
    case "aircond": {
      const lLive = !!d.packLFlow, rLive = !!d.packRFlow;
      const lMan = !!d.leftManifold, rMan = !!d.rightManifold;
      const nodes = [
        N("iso-valve","ENGINE BLEED ISOLATION VALVE",180,420,d.isolationOpen,"pneumatic","cross-connects L / R manifolds"),
        N("l-man","LEFT PNEUMATIC MANIFOLD",440,180,lMan,"pneumatic","No. 1 engine / APU supply"),
        N("r-man","RIGHT PNEUMATIC MANIFOLD",440,660,rMan,"pneumatic","No. 2 engine supply"),
        N("l-pack","L PACK VALVE",700,180,lLive,"pneumatic","left pack shutoff / flow"),
        N("r-pack","R PACK VALVE",700,660,rLive,"pneumatic","right pack shutoff / flow"),
        N("l-mix","L AIR MIX VALVE",700,320,lLive,"elec","dual butterfly · hot bypass / cold path"),
        N("r-mix","R AIR MIX VALVE",700,800,rLive,"elec","dual butterfly · hot bypass / cold path"),
        N("l-phx","L PRIMARY HEAT EXCHANGER",960,180,lLive,"pneumatic","cooling path only"),
        N("r-phx","R PRIMARY HEAT EXCHANGER",960,660,rLive,"pneumatic","cooling path only"),
        N("l-acm-c","L ACM COMPRESSOR",1220,180,lLive,"pneumatic","common-shaft compressor"),
        N("r-acm-c","R ACM COMPRESSOR",1220,660,rLive,"pneumatic","common-shaft compressor"),
        N("l-shx","L SECONDARY HEAT EXCHANGER",1480,180,lLive,"pneumatic","compressor discharge cooling"),
        N("r-shx","R SECONDARY HEAT EXCHANGER",1480,660,rLive,"pneumatic","compressor discharge cooling"),
        N("l-acm-t","L ACM COOLING TURBINE",1740,180,lLive,"pneumatic","expansion cooling"),
        N("r-acm-t","R ACM COOLING TURBINE",1740,660,rLive,"pneumatic","expansion cooling"),
        N("l-sep","L WATER SEPARATOR / COALESCER",2000,180,lLive,"pneumatic","moisture removal"),
        N("r-sep","R WATER SEPARATOR / COALESCER",2000,660,rLive,"pneumatic","moisture removal"),
        N("l-f35","L 35°F CONTROL VALVE",1480,320,lLive,"pneumatic","primary-HX bypass to turbine discharge"),
        N("r-f35","R 35°F CONTROL VALVE",1480,800,rLive,"pneumatic","primary-HX bypass to turbine discharge"),
        N("l-cchk","L COLD-AIR CHECK VALVE",2240,180,lLive,"pneumatic","cold separator outlet → mixing"),
        N("r-cchk","R COLD-AIR CHECK VALVE",2240,660,rLive,"pneumatic","cold separator outlet → mixing"),
        N("l-hchk","L HOT-AIR CHECK VALVE",960,320,lLive,"pneumatic","hot bypass → mixing"),
        N("r-hchk","R HOT-AIR CHECK VALVE",960,800,rLive,"pneumatic","hot bypass → mixing"),
        N("l-duct190","L 190°F DUCT OVERHEAT SWITCH",2480,120,!!d.packLDuctOverheat,"elec","drives mix valve full cold"),
        N("r-duct190","R 190°F DUCT OVERHEAT SWITCH",2480,600,!!d.packRDuctOverheat,"elec","drives mix valve full cold"),
        N("l-covh","L COMPRESSOR OVERHEAT SWITCH",1480,320,!!d.packLCompressorOverheat,"elec","365°F pack protection"),
        N("r-covh","R COMPRESSOR OVERHEAT SWITCH",1480,800,!!d.packRCompressorOverheat,"elec","365°F pack protection"),
        N("l-tovh","L TURBINE INLET OVERHEAT SWITCH",1740,320,!!d.packLTurbineOverheat,"elec","210°F pack protection"),
        N("r-tovh","R TURBINE INLET OVERHEAT SWITCH",1740,800,!!d.packRTurbineOverheat,"elec","210°F pack protection"),
        N("l-relay","L PACK OVERHEAT RELAY",2720,180,!!d.packLPackOverheatRelay,"elec","closes pack valve / PACK TRIP OFF"),
        N("r-relay","R PACK OVERHEAT RELAY",2720,660,!!d.packRPackOverheatRelay,"elec","closes pack valve / PACK TRIP OFF"),
        N("l-mixch","L MIXING CHAMBER",2960,180,lLive,"pneumatic","hot + cold after check valves"),
        N("r-mixch","R MIXING CHAMBER",2960,660,rLive,"pneumatic","hot + cold after check valves"),
        N("l-tf-v","L TURBOFAN VALVE",960,420,lLive,"pneumatic","ground cooling air"),
        N("l-tf","L TURBOFAN",1220,420,lLive,"pneumatic","heat-exchanger cooling airflow"),
        N("r-tf-v","R TURBOFAN VALVE",960,900,rLive,"pneumatic","ground cooling air"),
        N("r-tf","R TURBOFAN",1220,900,rLive,"pneumatic","heat-exchanger cooling airflow"),
      ];
      return { title:"AIR CONDITIONING — 737-200 LEFT / RIGHT PACK FLOW", medium:"ATA 21 · PACK VALVE → MIX VALVE SPLIT → ACM COLD PATH + 35°F BYPASS → MIXING CHAMBER", nodes, edges:[
        E("iso-valve","l-man",d.isolationOpen&&lMan,"pneumatic","crossfeed to L"), E("iso-valve","r-man",d.isolationOpen&&rMan,"pneumatic","crossfeed to R"),
        E("l-man","l-pack",lLive,"pneumatic"), E("r-man","r-pack",rLive,"pneumatic"),
        E("l-pack","l-mix",lLive,"pneumatic","pack air → air-mix split"), E("r-pack","r-mix",rLive,"pneumatic","pack air → air-mix split"),
        E("l-mix","l-phx",lLive,"pneumatic","cold path"), E("r-mix","r-phx",rLive,"pneumatic","cold path"),
        E("l-mix","l-hchk",lLive,"pneumatic","hot bypass"), E("r-mix","r-hchk",rLive,"pneumatic","hot bypass"),
        E("l-phx","l-acm-c",lLive,"pneumatic"), E("r-phx","r-acm-c",rLive,"pneumatic"),
        E("l-acm-c","l-shx",lLive,"pneumatic"), E("r-acm-c","r-shx",rLive,"pneumatic"),
        E("l-shx","l-acm-t",lLive,"pneumatic"), E("r-shx","r-acm-t",rLive,"pneumatic"),
        E("l-acm-t","l-sep",lLive,"pneumatic"), E("r-acm-t","r-sep",rLive,"pneumatic"),
        E("l-sep","l-cchk",lLive,"pneumatic"), E("r-sep","r-cchk",rLive,"pneumatic"),
        E("l-cchk","l-mixch",lLive,"pneumatic","cold air"), E("r-cchk","r-mixch",rLive,"pneumatic","cold air"),
        E("l-hchk","l-mixch",lLive,"pneumatic","hot bypass air"), E("r-hchk","r-mixch",rLive,"pneumatic","hot bypass air"),
        E("l-phx","l-f35",lLive,"pneumatic","warm bypass source"), E("r-phx","r-f35",rLive,"pneumatic","warm bypass source"),
        E("l-f35","l-sep",lLive,"pneumatic","to turbine discharge / separator inlet"), E("r-f35","r-sep",rLive,"pneumatic","to turbine discharge / separator inlet"),
        E("l-covh","l-relay",!!d.packLCompressorOverheat,"pneumatic","protective switch"), E("l-tovh","l-relay",!!d.packLTurbineOverheat,"pneumatic","protective switch"),
        E("r-covh","r-relay",!!d.packRCompressorOverheat,"pneumatic","protective switch"), E("r-tovh","r-relay",!!d.packRTurbineOverheat,"pneumatic","protective switch"),
        E("l-relay","l-pack",!!d.packLPackOverheatRelay,"elec","close pack valve"), E("r-relay","r-pack",!!d.packRPackOverheatRelay,"elec","close pack valve"),
        E("l-duct190","l-mix",!!d.packLDuctOverheat,"elec","drive full cold"), E("r-duct190","r-mix",!!d.packRDuctOverheat,"elec","drive full cold"),
        E("l-tf-v","l-tf",lLive,"pneumatic"), E("l-tf","l-phx",lLive,"pneumatic"), E("l-tf","l-shx",lLive,"pneumatic"),
        E("r-tf-v","r-tf",rLive,"pneumatic"), E("r-tf","r-phx",rLive,"pneumatic"), E("r-tf","r-shx",rLive,"pneumatic"),
      ]};
    }
    case "cabin": {
      const water = Number(s.potableWater??0)>0;
      const lPack = !!d.packLFlow, rPack = !!d.packRFlow;
      const nodes = [
        N("l-in","LEFT PACK CONDITIONED AIR",120,120,lPack,"pneumatic","from L pack / air mix"),
        N("r-in","RIGHT PACK CONDITIONED AIR",120,300,rPack,"pneumatic","from R pack / air mix"),
        N("main-dist","MAIN DISTRIBUTION MANIFOLD",420,210,lPack||rPack,"pneumatic","L/R pack inputs; common distribution"),
        N("control-cabin","CONTROL CABIN DISTRIBUTION",700,120,lPack||rPack,"pneumatic","normal L-pack source"),
        N("pass-cabin","PASSENGER CABIN DISTRIBUTION",700,300,lPack||rPack,"pneumatic","normal R-pack source"),
        N("outflow","CABIN PRESSURIZATION OUTFLOW VALVE",980,210,d.acPower,"elec","AUTO / STBY / MAN AC / MAN DC"),
        N("relief","SAFETY RELIEF VALVE",1260,210,Number(s.cabinDiff??0)>7.5,"warn","mechanical overpressure backup"),
        N("water-tank","PASSENGER WATER TANK",120,560,water,"pneumatic","No. 1 engine bleed pressurization"),
        N("qty","WATER QUANTITY TRANSMITTER",420,560,!!d.dcPower,"elec","EMPTY → FULL"),
        N("filter","WATER FILTER",700,560,water,"accent","cold-water line"),
        N("heater","WATER HEATER",980,560,!!d.acPower&&water,"elec","115V AC · 400 W"),
        N("timer","TOILET FLUSH TIMER",120,780,!!d.acPower,"elec","10 ± 2 s"),
        N("flush","TOILET FLUSH MOTOR / PUMP",420,780,!!d.acPower,"elec","~2 gal/flush"),
        N("waste","TOILET WASTE TANK",700,780,Number(s.wasteLevel??0)>0,"accent","waste + flush fluid")
      ];
      return { title:"CABIN — LEFT / RIGHT PACK INPUTS KEPT SEPARATE", medium:"ATA 21 / 38 / 56 · COMMON MANIFOLD ONLY WHERE THE MANUAL SHOWS IT", nodes, edges:[
        E("l-in","main-dist",lPack,"pneumatic"), E("r-in","main-dist",rPack,"pneumatic"), E("main-dist","control-cabin",lPack||rPack,"pneumatic"), E("main-dist","pass-cabin",lPack||rPack,"pneumatic"),
        E("control-cabin","outflow",!!d.acPower,"pneumatic"), E("pass-cabin","outflow",!!d.acPower,"pneumatic"), E("outflow","relief",Number(s.cabinDiff??0)>7.5,"warn"),
        E("water-tank","qty",!!d.dcPower&&water,"elec"), E("water-tank","filter",water,"accent"), E("water-tank","heater",!!d.acPower&&water,"elec"), E("timer","flush",!!d.acPower,"elec"), E("flush","waste",!!d.acPower,"accent")
      ]};
    }
    case "fuel": {
      const p1=!!d.fuelPump1On, p2=!!d.fuelPump2On, pc=!!d.fuelCenterPumpOn, x=!!s.fuelCrossfeed;
      const q1=!!d.fuelQuantityIndicationPowered && s.fuelTank1>0.5, qc=!!d.fuelQuantityIndicationPowered && s.fuelTankCenter>0.5, q2=!!d.fuelQuantityIndicationPowered && s.fuelTank2>0.5;
      const nodes=[
        N("t1","NO. 1 FUEL TANK",120,120,q1,"fuel",d.fuelQuantityIndicationPowered?`${s.fuelTank1.toFixed(1)}%`:'NO DC INDICATION'),
        N("t1f","TANK 1 FWD BOOST PUMP",420,120,p1,"fuel",s.fuelPump1Fwd?"SWITCH ON":"SWITCH OFF"),
        N("t1a","TANK 1 AFT BOOST PUMP",420,250,p1,"fuel",s.fuelPump1Aft?"SWITCH ON":"SWITCH OFF"),
        N("ctr","CENTER TANK",120,430,qc,"fuel",d.fuelQuantityIndicationPowered?`${s.fuelTankCenter.toFixed(1)}%`:'NO DC INDICATION'),
        N("cf","CENTER BOOST PUMPS",420,430,pc,"fuel",`${s.fuelPumpCenter1?'L ':''}${s.fuelPumpCenter2?'R':''}`||"OFF"),
        N("t2","NO. 2 FUEL TANK",120,720,q2,"fuel",d.fuelQuantityIndicationPowered?`${s.fuelTank2.toFixed(1)}%`:'NO DC INDICATION'),
        N("t2p","TANK 2 BOOST PUMPS",420,720,p2,"fuel",`${s.fuelPump2Fwd?'FWD ':''}${s.fuelPump2Aft?'AFT':''}`||"OFF"),
        N("cross","FUEL CROSSFEED VALVE",760,430,x,"fuel",x?"OPEN":"CLOSED"),
        N("e1v","ENGINE 1 FUEL SHUTOFF",1080,260,!!d.fuelShutoff1Open,"fuel",d.fuelFeedSource1),
        N("e2v","ENGINE 2 FUEL SHUTOFF",1080,600,!!d.fuelShutoff2Open,"fuel",d.fuelFeedSource2),
        N("apu","APU FUEL SHUTOFF VALVE",760,760,s.apuFuelValve>0.95,"fuel",`${Math.round(s.apuFuelValve*100)}% OPEN`),
        N("scav","CENTER TANK SCAVENGE",760,120,!!d.fuelScavengeActive,"fuel",d.fuelScavengeActive?"20-MIN TIMED TRANSFER":"OFF")
      ];
      return { title:"FUEL — TANKS / BOOST PUMPS / CROSSFEED / SHUTOFF", medium:"ATA 28 · LEFT / CENTER / RIGHT FUEL PATHS KEPT DISTINCT", nodes, edges:[
        E("t1","t1f",p1,"fuel"), E("t1","t1a",p1,"fuel"), E("t1f","e1v",p1&&!!d.fuelShutoff1Open,"fuel"), E("t1a","e1v",p1&&!!d.fuelShutoff1Open,"fuel"),
        E("ctr","cf",pc,"fuel"), E("cf","e1v",pc&&!!d.fuelShutoff1Open,"fuel"), E("cf","e2v",pc&&!!d.fuelShutoff2Open,"fuel"),
        E("t2","t2p",p2,"fuel"), E("t2p","e2v",p2&&!!d.fuelShutoff2Open,"fuel"),
        E("e1v","cross",x&&!!d.fuelShutoff1Open,"fuel"), E("cross","e2v",x&&!!d.fuelShutoff2Open,"fuel"), E("t1","scav",!!d.fuelScavengeActive,"fuel"), E("scav","ctr",!!d.fuelScavengeActive,"fuel"), E("t1","apu",s.apuFuelValve>0.95&&s.fuelTank1>0.5,"fuel")
      ]};
    }
    case "powerplant": {
      const e1 = !!d.eng1Running, e2 = !!d.eng2Running, s1 = !!d.startValveOpen1, s2 = !!d.startValveOpen2;
      const f1 = d.fuelFeedPressure1 > 0.5, f2 = d.fuelFeedPressure2 > 0.5;
      const i1 = !!d.ignition1On, i2 = !!d.ignition2On;
      const b1 = !!d.bleed1Available, b2 = !!d.bleed2Available, g1 = !!d.generator1BusPowered, g2 = !!d.generator2BusPowered;
      const nodes=[
        N("e1-start-man","ENGINE 1 START AIR PATH",120,100,s1,"pneumatic","from start manifold"), N("e1-starter-valve","ENGINE 1 STARTER VALVE",380,100,s1,"pneumatic","solenoid / pneumatic"), N("e1-starter","ENGINE 1 PNEUMATIC STARTER",640,100,s1,"pneumatic","N2 acceleration"), N("e1-fuel","ENGINE 1 FUEL CONTROL",900,100,f1,"fuel","fuel introduction"), N("e1-exciter","ENGINE 1 IGNITION EXCITER",1160,100,i1,"elec","high-voltage pulses"), N("e1-igniter","ENGINE 1 IGNITER PLUGS",1420,100,i1,"elec","ignition"),
        N("e2-start-man","ENGINE 2 START AIR PATH",120,330,s2,"pneumatic","from start manifold"), N("e2-starter-valve","ENGINE 2 STARTER VALVE",380,330,s2,"pneumatic","solenoid / pneumatic"), N("e2-starter","ENGINE 2 PNEUMATIC STARTER",640,330,s2,"pneumatic","N2 acceleration"), N("e2-fuel","ENGINE 2 FUEL CONTROL",900,330,f2,"fuel","fuel introduction"), N("e2-exciter","ENGINE 2 IGNITION EXCITER",1160,330,i2,"elec","high-voltage pulses"), N("e2-igniter","ENGINE 2 IGNITER PLUGS",1420,330,i2,"elec","ignition"),
        N("e1-acc","ENGINE 1 ACCESSORY GEARBOX / CSD",120,580,e1,"accent","engine-driven accessories"), N("e1-gen","ENGINE 1 AC GENERATOR",380,580,g1,"elec","115/200V · 400 Hz"), N("e1-bleed","ENGINE 1 BLEED SOURCE",640,580,e1,"pneumatic","8th / 13th stage"), N("e1-check","ENGINE 1 BLEED CHECK VALVES",900,580,e1,"pneumatic","reverse-flow protection"), N("e1-pre","ENGINE 1 BLEED PRECOOLER",1160,580,e1,"pneumatic","fan-air cooling"), N("e1-valve","ENGINE 1 BLEED AIR VALVE",1420,580,b1,"pneumatic","left-side manifold supply"),
        N("e2-acc","ENGINE 2 ACCESSORY GEARBOX / CSD",120,810,e2,"accent","engine-driven accessories"), N("e2-gen","ENGINE 2 AC GENERATOR",380,810,g2,"elec","115/200V · 400 Hz"), N("e2-bleed","ENGINE 2 BLEED SOURCE",640,810,e2,"pneumatic","8th / 13th stage"), N("e2-check","ENGINE 2 BLEED CHECK VALVES",900,810,e2,"pneumatic","reverse-flow protection"), N("e2-pre","ENGINE 2 BLEED PRECOOLER",1160,810,e2,"pneumatic","fan-air cooling"), N("e2-valve","ENGINE 2 BLEED AIR VALVE",1420,810,b2,"pneumatic","right-side manifold supply"),
        N("rev1","ENGINE 1 THRUST REVERSER ACTUATION",1720,580,!!d.thrustReverser1Active,"hyd-a",d.thrustReverser1Active?"DEPLOYED — System A pressure / WOW / idle / running":"STOWED OR INHIBITED"), N("rev2","ENGINE 2 THRUST REVERSER ACTUATION",1720,810,!!d.thrustReverser2Active,"hyd-a",d.thrustReverser2Active?"DEPLOYED — System A pressure / WOW / idle / running":"STOWED OR INHIBITED")
      ];
      return { title:"POWERPLANT — ENGINE 1 / ENGINE 2 SEPARATE COMPONENT PATHS", medium:"ATA 72 / 73 / 74 / 77 / 78 / 80 · LEFT / RIGHT SOURCES KEPT DISTINCT", nodes, edges:[
        E("e1-start-man","e1-starter-valve",s1,"pneumatic"), E("e1-starter-valve","e1-starter",s1,"pneumatic"), E("e1-starter","e1-fuel",s1&&f1,"fuel"), E("e1-fuel","e1-exciter",f1&&i1,"elec"), E("e1-exciter","e1-igniter",i1,"elec"),
        E("e2-start-man","e2-starter-valve",s2,"pneumatic"), E("e2-starter-valve","e2-starter",s2,"pneumatic"), E("e2-starter","e2-fuel",s2&&f2,"fuel"), E("e2-fuel","e2-exciter",f2&&i2,"elec"), E("e2-exciter","e2-igniter",i2,"elec"),
        E("e1-acc","e1-gen",g1,"elec"), E("e1-bleed","e1-check",e1,"pneumatic"), E("e1-check","e1-pre",e1,"pneumatic"), E("e1-pre","e1-valve",b1,"pneumatic"),
        E("e2-acc","e2-gen",g2,"elec"), E("e2-bleed","e2-check",e2,"pneumatic"), E("e2-check","e2-pre",e2,"pneumatic"), E("e2-pre","e2-valve",b2,"pneumatic"),
        E("e1-valve","rev1",!!d.thrustReverser1Active,"hyd-a"), E("e2-valve","rev2",!!d.thrustReverser2Active,"hyd-a")
      ]};
    }
    case "apu": {
      const apu=!!d.apuAvailable, fire=!!(d.apuFireWarn||s.apuFirePulled||s.apuBottleFired);
      const nodes=[N("fuel-valve","APU FUEL SHUTOFF VALVE",120,120,apu,"fuel","start / shutdown sequencing"),N("apu-door","APU AIR INLET DOOR ACTUATOR",390,120,apu||s.apuDoor>0.1,"fuel","positioned actuator"),N("starter","APU STARTER",660,120,apu,"elec","electrical start circuit"),N("apu-bleed","APU BLEED AIR VALVE",930,120,apu&&s.apuBleedValve>0.7,"pneumatic","95% rpm · 12–14 s"),N("manifold","PNEUMATIC MANIFOLD",1200,120,apu&&s.apuBleedValve>0.7,"pneumatic","engine start / air conditioning"),N("fire-switch","APU FIRE SWITCHES",120,420,fire,"warn","cockpit + MLG wheel well"),N("shutdown","APU FIRE SHUTDOWN / ISOLATION",420,420,!!s.apuFirePulled,"warn","fuel · bleed · inlet · generator"),N("bottle","APU FIRE EXTINGUISHER BOTTLE",720,420,fire,"warn","armed / discharged separately")];
      return { title:"APU — START / BLEED / FIRE PROTECTION", medium:"ATA 49 / 26 · 28V DC · BLEED AIR", nodes, edges:[E("fuel-valve","apu-door",apu,"fuel"),E("apu-door","starter",apu,"elec"),E("starter","apu-bleed",apu&&s.apuBleedValve>0.7,"pneumatic"),E("apu-bleed","manifold",apu&&s.apuBleedValve>0.7,"pneumatic"),E("fire-switch","shutdown",!!s.apuFirePulled,"warn"),E("shutdown","bottle",!!s.apuFirePulled,"warn")]};
    }
    default: return { title:"SYSTEM FLOW", medium:"LIVE", nodes:[], edges:[] };
  }
}

function safePct(value: number) { return Math.max(0, Math.min(100, value * 100)); }

function LiveFlowDiagram({ flow, compact = false }: { flow: FlowModel; compact?: boolean }) {
  const [zoom, setZoom] = useState(1);
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  const toneVar = (tone: string) => `var(--color-${tone === "ok" ? "ok" : tone})`;
  const nodeW = 190;
  const nodeH = 62;
  const canvasW = 2400;
  const canvasH = 1150;
  const zoomedW = Math.round(canvasW * zoom);
  const zoomedH = Math.round(canvasH * zoom);
  const edgePath = (a: FlowNode, b: FlowNode, all: FlowNode[]) => {
    const sx = a.x + nodeW / 2;
    const sy = a.y;
    const tx = b.x - nodeW / 2;
    const ty = b.y;
    const rects = all.filter(n => n.id !== a.id && n.id !== b.id).map(n => ({
      l: n.x - nodeW / 2 - 10, r: n.x + nodeW / 2 + 10, t: n.y - nodeH / 2 - 10, b: n.y + nodeH / 2 + 10,
    }));
    const hit = (x1:number,y1:number,x2:number,y2:number) => rects.some(r =>
      x1 === x2
        ? r.l <= x1 && x1 <= r.r && !(Math.max(y1,y2) < r.t || Math.min(y1,y2) > r.b)
        : r.t <= y1 && y1 <= r.b && !(Math.max(x1,x2) < r.l || Math.min(x1,x2) > r.r)
    );
    const valid = (pts:number[][]) => pts.slice(0,-1).every((p,i) => !hit(p[0],p[1],pts[i+1][0],pts[i+1][1]));
    const makeHV = (mx:number) => [[sx,sy],[mx,sy],[mx,ty],[tx,ty]];
    const makeVH = (my:number) => [[sx,sy],[sx,my],[tx,my],[tx,ty]];
    if (Math.abs(ty - sy) < 4 && !hit(sx,sy,tx,ty)) return `M ${sx} ${sy} H ${tx}`;
    // Short vertical offsets stay in the local component row; this avoids
    // routing a simple pump/filter connection through the neighbouring row.
    if (Math.abs(ty - sy) < 120) {
      const local = [[sx,sy],[sx,ty],[tx,ty]];
      if (valid(local)) return `M ${sx} ${sy} V ${ty} H ${tx}`;
      const local2 = [[sx,sy],[tx,sy],[tx,ty]];
      if (valid(local2)) return `M ${sx} ${sy} H ${tx} V ${ty}`;
    }
    const xs = [40, 2360,
      sx + (tx >= sx ? 70 : -70), sx + (tx >= sx ? 150 : -150),
      sx + (tx >= sx ? 70 : -70), sx + (tx >= sx ? 150 : -150),
      ...rects.flatMap(r => [r.r + 20, r.l - 20]),
    ];
    const ys = [
      sy + (ty >= sy ? 70 : -70), sy + (ty >= sy ? 150 : -150),
      ...rects.flatMap(r => [r.b + 20, r.t - 20]),
    ];
    const candidates = [
      ...xs.map(makeHV), ...ys.map(makeVH),
    ];
    const chosen = candidates.find(valid);
    const pts = chosen || (Math.abs(tx-sx) >= Math.abs(ty-sy) ? makeHV(sx + (tx >= sx ? 110 : -110)) : makeVH(sy + (ty >= sy ? 110 : -110)));
    return pts.map((p,i) => `${i ? (p[0]===pts[i-1][0] ? ` V ${p[1]}` : ` H ${p[0]}`) : `M ${p[0]} ${p[1]}`}`).join("");
  };
  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-lg border border-[#2e343b] bg-[#080a0d] p-2">
      {!compact && <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="min-w-0"><span className="font-display text-[9px] font-bold uppercase tracking-[.14em] text-fg">{flow.title}</span><span className="ml-2 font-mono text-[8px] uppercase text-subtle">{flow.medium}</span></div>
        <div className="flex items-center gap-1 rounded border border-[#30363d] bg-[#0c0f13] p-1 font-mono text-[8px]">
          <button type="button" onClick={() => setZoom((z) => Math.max(0.55, Number((z - 0.1).toFixed(2))))} className="rounded border border-border px-2 py-1 text-fg hover:bg-[#20252b]" aria-label="Zoom out">−</button>
          <button type="button" onClick={() => setZoom(1)} className="min-w-[3.5rem] rounded border border-border px-2 py-1 text-subtle hover:bg-[#20252b]" aria-label="Reset diagram zoom">{Math.round(zoom * 100)}%</button>
          <button type="button" onClick={() => setZoom((z) => Math.min(1.8, Number((z + 0.1).toFixed(2))))} className="rounded border border-border px-2 py-1 text-fg hover:bg-[#20252b]" aria-label="Zoom in">+</button>
        </div>
      </div>}
      <div className="flow-scroll-viewport w-full max-w-full overflow-auto overscroll-contain rounded-md pb-1 [scrollbar-width:thin]" style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-x pan-y" }}>
        {!compact && <div className="mb-1 min-w-max px-1 font-mono text-[7px] uppercase tracking-[.14em] text-subtle">Swipe / scroll to inspect the complete component chain · zoom: − / +</div>}
        <svg viewBox="0 0 2400 1100" width={compact ? "100%" : zoomedW} height={compact ? "auto" : zoomedH} className={cn("block max-w-none select-none", compact ? "h-auto w-full" : "")} role="img" aria-label={`${flow.title} live animated system flow`}>
          <defs>
            <filter id="flow-glow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
            {(["hyd-a","hyd-b","hyd-s","pneumatic","accent","elec","fuel","warn"] as const).map(t => <marker key={t} id={`flow-arrow-${t}`} markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M 0 0 L 10 5 L 0 10 z" fill={`var(--color-${t})`} /></marker>)}
          </defs>
          {flow.edges.map((e) => { const a=byId.get(e.from), b=byId.get(e.to); if(!a||!b)return null; const c=toneVar(e.tone); const path=edgePath(a,b,flow.nodes); return <g key={`${e.from}-${e.to}`}><path d={path} fill="none" stroke="#252b32" strokeWidth="7" strokeLinecap="round"/><path d={path} fill="none" stroke={c} strokeWidth={e.active?4:1.5} opacity={e.active?0.95:0.22} strokeLinecap="round" className={e.active?"flow-active":undefined} filter={e.active?"url(#flow-glow)":undefined} markerEnd={`url(#flow-arrow-${e.tone})`}/></g>; })}
          {flow.nodes.map((n) => <g key={n.id} transform={`translate(${n.x-nodeW/2} ${n.y-nodeH/2})`}>
            <rect width={nodeW} height={nodeH} rx="7" fill={n.active?"#1a211e":"#111419"} stroke={n.active?toneVar(n.tone):"#343a42"} strokeWidth={n.active?1.6:1}/>
            <circle cx="13" cy="14" r="4" fill={n.active?toneVar(n.tone):"#343a42"} className={n.active?"glow-ok":undefined}/>
            <text x="24" y="18" fill="var(--color-fg)" fontSize="10" fontWeight="700" fontFamily="Barlow Condensed, sans-serif" letterSpacing="1">{n.label}</text>
            {n.sub && <text x="24" y="36" fill={n.active?toneVar(n.tone):"var(--color-subtle)"} fontSize="8" fontFamily="IBM Plex Mono, monospace">{n.sub}</text>}
          </g>)}
        </svg>
      </div>
    </div>
  );
}

function HydCompactCard({ title, detail, state, active }: { title: string; detail: string; state: string; active: boolean }) {
  return (
    <div className={cn("rounded-md border bg-inset px-3 py-2.5", active ? "border-hyd-s/50" : "border-border")}>
      <div className="font-display text-[9px] font-semibold uppercase tracking-[0.12em] text-fg">{title}</div>
      <div className="mt-1 text-[8px] font-mono uppercase text-subtle">{detail}</div>
      <div className={cn("mt-2 font-mono text-[9px] uppercase", active ? "text-hyd-s" : "text-subtle")}>{state}</div>
    </div>
  );
}

function HydSource({ title, reservoir, pumps, pressure, tone }: { title: string; reservoir: string; pumps: string[]; pressure: number; tone: "hyd-a" | "hyd-b" | "hyd-s" }) {
  const toneClass = tone === "hyd-a" ? "text-hyd-a" : tone === "hyd-b" ? "text-hyd-b" : "text-hyd-s";
  return (
    <div className="rounded-lg border border-border bg-inset p-2 min-h-[138px] flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <span className="font-display text-[10px] font-semibold uppercase tracking-[0.12em] text-fg">{title}</span>
        <span className={`font-mono text-[11px] ${toneClass}`}>{Math.round(pressure)} PSI</span>
      </div>
      <div className="mt-2 space-y-1 text-[9px] font-mono uppercase text-subtle">
        <div className="rounded border border-border bg-panel px-2 py-1">{reservoir}</div>
        {pumps.map((pump) => <div key={pump} className="rounded border border-border bg-panel px-2 py-1">↓ {pump}</div>)}
        <div className={`rounded border px-2 py-1 ${pressure > 1500 ? "border-ok/40 bg-ok/5 text-ok" : "border-border text-subtle"}`}>↓ DISTRIBUTION MODULE</div>
        
      </div>
    </div>
  );
}

function StatusDot({ on, tone = "ok" }: { on: boolean; tone?: "hyd-a" | "hyd-b" | "hyd-s" | "elec" | "ok" }) {
  const c = tone === "hyd-a" ? "var(--color-hyd-a)" : tone === "hyd-b" ? "var(--color-hyd-b)" : tone === "hyd-s" ? "var(--color-hyd-s)" : tone === "elec" ? "var(--color-elec)" : "var(--color-ok)";
  return <span className="mx-auto block size-2.5 rounded-full border" style={{ borderColor: on ? c : "var(--color-border)", backgroundColor: on ? c : "#17191c", boxShadow: on ? `0 0 8px ${c}` : undefined }} />;
}

function PanelScrews() {
  return (
    <>
      <span className="absolute left-2 top-2 size-2 rounded-full border border-[#737980] bg-[#363b40] shadow-inner" />
      <span className="absolute right-2 top-2 size-2 rounded-full border border-[#737980] bg-[#363b40] shadow-inner" />
      <span className="absolute bottom-2 left-2 size-2 rounded-full border border-[#737980] bg-[#363b40] shadow-inner" />
      <span className="absolute bottom-2 right-2 size-2 rounded-full border border-[#737980] bg-[#363b40] shadow-inner" />
    </>
  );
}

function PanelHeader({ eyebrow, title, note }: { eyebrow: string; title: string; note: string }) {
  return (
    <header className="border-b border-border pb-2">
      <p className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-subtle">{eyebrow}</p>
      <h2 className="mt-1 font-display text-sm font-semibold uppercase tracking-[0.12em] text-fg">{title}</h2>
      <p className="mt-1 text-[11px] text-muted">{note}</p>
    </header>
  );
}

function FlowRow({ label, on }: { label: string; on: boolean }) {
  return (
    <div className="flex items-center justify-between rounded border border-border bg-inset px-2 py-2">
      <span className="text-muted">{label}</span>
      <span className={on ? "font-semibold text-ok" : "text-subtle"}>{on ? "ACTIVE" : "OFF"}</span>
    </div>
  );
}
