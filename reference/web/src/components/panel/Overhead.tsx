import { lightsControlsInitial } from "@/lib/sim/lights";
import type { AltFlapSwitch, ApuMaster, Isolation, PressMode, SimState, SpeedBrake, StartSwitch, StbyHyd } from "@/lib/sim/types";
import { useDerived, useSim, getDerived, useSimPick, useDerivedPick } from "@/lib/sim/store";
import { cn } from "@/lib/utils";
import { GearLeverP2 } from "@/components/panel/EngineInstrumentPanel";
import {
  CaptionLight,
  ControlSlider,
  FireHandle,
  Module,
  Rocker,
  GuardedRocker,
  Rotary,
  ThreePos,
  ThreeToggle,
} from "./widgets";

export function Overhead({ focus, noPedestal }: { focus?: "apu" | "bleed" | "hyd" | "elec" | "start" | "flt" | "lights" | "all"; /** hide flap lever + speed brake (they live on the centre control stand) */ noPedestal?: boolean }) {
  const show = (k: NonNullable<typeof focus>) => !focus || focus === "all" || focus === k;
  return (
    <div className="flex flex-col gap-3">
      <AnnunciatorBar />
      <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {show("flt") && <FlightModule noPedestal={noPedestal} />}
        {show("hyd") && <HydModule />}
        {show("elec") && <ElecModule />}
        {show("apu") && <ApuModule />}
        {show("bleed") && <BleedModule />}
        {show("start") && <StartModule />}
        {(!focus || focus === "all") && <FuelModule />}
        {(!focus || focus === "all") && <EnvironmentModule />}
        {(!focus || focus === "all") && <AntiIceModule />}
        {show("lights") && <ExteriorLightsModule />}
        {show("lights") && <FlightDeckLightsModule />}
        {show("lights") && <SignsEmergencyModule />}
      </div>
    </div>
  );
}

function useLit() {
  const d = useDerivedPick("lights");
  return (id: string) => d.lights.find((l) => l.id === id)?.lit ?? false;
}

const RET_OPTS = [{ id: "RETRACT", label: "RETR" }, { id: "EXT", label: "EXT" }, { id: "ON", label: "ON" }];
const TRI_OPTS = (a: string, b: string, c: string) => [{ id: a, label: a }, { id: b, label: b }, { id: c, label: c }];

function ExteriorLightsModule() {
  const s = useSim();
  const lit = useLit();
  return (
    <Module title="Exterior lights · P5">
      <ThreeToggle label="LDG L RETR" value={s.ltRetL} options={RET_OPTS} onChange={(id) => s.patch({ ltRetL: id as typeof s.ltRetL })} />
      <ThreeToggle label="LDG R RETR" value={s.ltRetR} options={RET_OPTS} onChange={(id) => s.patch({ ltRetR: id as typeof s.ltRetR })} />
      <Rocker label="FIXED L" on={s.ltFixedL} onChange={(v) => s.patch({ ltFixedL: v })} lit={lit("ldg-fix-l")} />
      <Rocker label="FIXED R" on={s.ltFixedR} onChange={(v) => s.patch({ ltFixedR: v })} lit={lit("ldg-fix-r")} />
      <Rocker label="RWY TURNOFF L" on={s.ltTurnoffL} onChange={(v) => s.patch({ ltTurnoffL: v })} lit={lit("rwy-l")} />
      <Rocker label="RWY TURNOFF R" on={s.ltTurnoffR} onChange={(v) => s.patch({ ltTurnoffR: v })} lit={lit("rwy-r")} />
      <Rocker label="TAXI" on={s.ltTaxi} onChange={(v) => s.patch({ ltTaxi: v })} lit={lit("taxi")} />
      <Rocker label="WING" on={s.ltWing} onChange={(v) => s.patch({ ltWing: v })} lit={lit("wing")} />
      <Rocker label="LOGO" on={s.ltLogo} onChange={(v) => s.patch({ ltLogo: v })} lit={lit("logo")} />
      <Rocker label="WHEEL WELL" on={s.ltWheelWell} onChange={(v) => s.patch({ ltWheelWell: v })} lit={lit("wheelwell")} />
      <Rocker label="ANTI COLL" on={s.ltAntiCol} onChange={(v) => s.patch({ ltAntiCol: v })} lit={lit("beacon-top") || lit("beacon-bot")} />
      <ThreeToggle label="POSITION" value={s.ltPosition} options={[{ id: "OFF", label: "OFF" }, { id: "STEADY", label: "STEADY" }, { id: "STROBE_STEADY", label: "STRB+S" }]} onChange={(id) => s.patch({ ltPosition: id as typeof s.ltPosition })} />
    </Module>
  );
}

function FlightDeckLightsModule() {
  const s = useSim();
  const d = useDerivedPick("dcPower");
  const lit = useLit();
  const test = s.ltTest && d.dcPower;
  return (
    <Module title="Flight deck lighting · P5">
      <ThreeToggle label="DOME" value={s.ltDome} options={TRI_OPTS("BRT", "DIM", "OFF")} onChange={(id) => s.patch({ ltDome: id as typeof s.ltDome })} />
      <Rocker label="MASTER DIM" on={s.ltMasterDim === "DIM"} onLabel="DIM" offLabel="BRT" onChange={(v) => s.patch({ ltMasterDim: v ? "DIM" : "BRT" })} />
      <Rocker label="ANNUN TEST" on={s.ltTest} onLabel="TEST" offLabel="OFF" onChange={(v) => s.patch({ ltTest: v })} lit={test} />
      <Rocker label="MAP L" on={s.ltMapCapt} onChange={(v) => s.patch({ ltMapCapt: v })} lit={lit("map-capt")} />
      <Rocker label="MAP R" on={s.ltMapFo} onChange={(v) => s.patch({ ltMapFo: v })} lit={lit("map-fo")} />
      <Rocker label="STORM" on={s.ltStorm} onChange={(v) => s.patch({ ltStorm: v })} lit={lit("storm")} />
      <Rocker label="COMPASS" on={s.ltCompass} onChange={(v) => s.patch({ ltCompass: v })} lit={lit("compass")} />
      <Rocker label="OBSERVER" on={s.ltObserver} onChange={(v) => s.patch({ ltObserver: v })} lit={lit("observer")} />
      <Rocker label="LTSHIELD EMER" on={s.ltShieldEmer} onChange={(v) => s.patch({ ltShieldEmer: v })} lit={lit("shield-emer")} />
      <div className="grid w-full gap-1.5 sm:grid-cols-2">
        <ControlSlider label={`OVHD PANEL ${Math.round(s.ltPanelOvhd * 100)}%`} value={s.ltPanelOvhd} onChange={(v) => s.patch({ ltPanelOvhd: v })} />
        <ControlSlider label={`CAPT PANEL ${Math.round(s.ltPanelCapt * 100)}%`} value={s.ltPanelCapt} onChange={(v) => s.patch({ ltPanelCapt: v })} />
        <ControlSlider label={`F/O PANEL ${Math.round(s.ltPanelFo * 100)}%`} value={s.ltPanelFo} onChange={(v) => s.patch({ ltPanelFo: v })} />
        <ControlSlider label={`PEDESTAL ${Math.round(s.ltPanelPed * 100)}%`} value={s.ltPanelPed} onChange={(v) => s.patch({ ltPanelPed: v })} />
      </div>
    </Module>
  );
}

function SignsEmergencyModule() {
  const s = useSim();
  const lit = useLit();
  return (
    <Module title="Passenger signs · emergency lights · P5">
      <ThreeToggle label="NO SMOKING" value={s.ltNoSmoking} options={TRI_OPTS("ON", "AUTO", "OFF")} onChange={(id) => s.patch({ ltNoSmoking: id as typeof s.ltNoSmoking })} />
      <ThreeToggle label="SEAT BELTS" value={s.ltSeatBelt} options={TRI_OPTS("ON", "AUTO", "OFF")} onChange={(id) => s.patch({ ltSeatBelt: id as typeof s.ltSeatBelt })} />
      <ThreeToggle label="EMER LIGHTS" value={s.ltEmergency} options={TRI_OPTS("ON", "ARMED", "OFF")} onChange={(id) => s.patch({ ltEmergency: id as typeof s.ltEmergency }, `EMER LIGHTS ${id}`)} />
      <div className="flex w-full flex-wrap justify-center gap-2">
        <CaptionLight label="NO SMOKING" on={lit("sign-ns")} tone="caution" />
        <CaptionLight label="FASTEN BELTS" on={lit("sign-sb")} tone="caution" />
        <CaptionLight label="EMER LTS ON" on={lit("emer-aisle")} tone="ok" />
      </div>
      <button type="button" onClick={() => s.patch({ ...lightsControlsInitial })} className="w-full rounded border border-border bg-inset px-2 py-1.5 font-display text-[9px] uppercase tracking-wide text-fg hover:bg-panel">All lights switches off</button>
    </Module>
  );
}

function AnnunciatorBar() {
  const d = useDerivedPick("apuGenOffBus", "apuLowOil", "dcPower", "dualBleed", "fireWarn", "gen1OffBus", "gen2OffBus", "groundPowerAvailable", "hydALow", "hydBLow", "masterCaution", "speedBrakeArmed", "startValveOpen1", "startValveOpen2", "stbyOn");
  const s = useSimPick("bleedTrip1", "bleedTrip2", "ltMasterDim", "ltTest", "packTripL", "packTripR");
  // MASTER DIM & TEST (P5): TEST lights every lamp (DC needed), DIM lowers brightness.
  const test = s.ltTest && d.dcPower;
  return (
    <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-inset p-2" style={{ opacity: s.ltMasterDim === "DIM" ? 0.7 : 1 }}>
      <CaptionLight label="MASTER CAUTION" on={test || (d.masterCaution)} tone="caution" className="min-w-[7rem]" />
      <CaptionLight label="FIRE WARN" on={test || (d.fireWarn)} tone="warn" />
      <CaptionLight label="DUAL BLEED" on={test || (d.dualBleed)} tone="caution" />
      <CaptionLight label="START VALVE 1" on={test || (d.startValveOpen1)} tone="caution" />
      <CaptionLight label="START VALVE 2" on={test || (d.startValveOpen2)} tone="caution" />
      <CaptionLight label="APU GEN OFF BUS" on={test || (d.apuGenOffBus)} tone="elec" />
      <CaptionLight label="APU LOW OIL PRESS" on={test || (d.apuLowOil)} tone="warn" />
      <CaptionLight label="GRD POWER AVAILABLE" on={test || (d.groundPowerAvailable)} tone="elec" />
      <CaptionLight label="GEN 1 OFF BUS" on={test || (d.gen1OffBus)} tone="elec" />
      <CaptionLight label="GEN 2 OFF BUS" on={test || (d.gen2OffBus)} tone="elec" />
      <CaptionLight label="HYD A LOW PRESS" on={test || (d.hydALow)} tone="warn" />
      <CaptionLight label="HYD B LOW PRESS" on={test || (d.hydBLow)} tone="warn" />
      <CaptionLight label="STBY RUD ON" on={test || (d.stbyOn)} tone="caution" />
      <CaptionLight label="PACK TRIP L" on={test || (d.dcPower && s.packTripL)} tone="caution" />
      <CaptionLight label="PACK TRIP R" on={test || (d.dcPower && s.packTripR)} tone="caution" />
      <CaptionLight label="BLEED TRIP 1" on={test || (d.dcPower && s.bleedTrip1)} tone="caution" />
      <CaptionLight label="BLEED TRIP 2" on={test || (d.dcPower && s.bleedTrip2)} tone="caution" />
      <CaptionLight label="SPEED BRK ARMED" on={test || (d.dcPower && d.speedBrakeArmed)} tone="ok" />
    </div>
  );
}

function FlightModule({ noPedestal }: { noPedestal?: boolean }) {
  const s = useSimPick("altFlapsArm", "altFlapsControl", "flaps", "fltCtrlA", "fltCtrlB", "patch", "speedBrake", "spoilerA", "spoilerB");
  const d = useDerivedPick("alternateFlapArmed", "alternateFlapDrivePowered", "flightControlAAvailable", "flightControlBAvailable", "teFlapHydraulicDriveAvailable");
  return (
    <Module title="Flight controls · P5-3">
      <GuardedRocker label="FLT CTRL A" on={s.fltCtrlA} onChange={(v) => s.patch({ fltCtrlA: v })} lit={d.flightControlAAvailable} />
      <GuardedRocker label="FLT CTRL B" on={s.fltCtrlB} onChange={(v) => s.patch({ fltCtrlB: v })} lit={d.flightControlBAvailable} />
      <GuardedRocker label="SPOILER A" on={s.spoilerA} onChange={(v) => s.patch({ spoilerA: v })} lit={d.flightControlAAvailable && s.spoilerA} />
      <GuardedRocker label="SPOILER B" on={s.spoilerB} onChange={(v) => s.patch({ spoilerB: v })} lit={d.flightControlBAvailable && s.spoilerB} />
      <GuardedRocker
        label="ALT FLAPS"
        on={s.altFlapsArm}
        onLabel="ARM"
        offLabel="OFF"
        onChange={(v) => s.patch({ altFlapsArm: v, altFlapsControl: v ? s.altFlapsControl : "OFF" }, v ? "ALTERNATE FLAPS ARM — TE bypass valve moves to bypass and standby hydraulic is available." : "ALTERNATE FLAPS OFF — TE hydraulic motor path restored if serviceable.")}
        lit={d.alternateFlapArmed}
      />
      <ThreeToggle
        label="ALT FLAP POS"
        value={s.altFlapsControl}
        options={[
          { id: "UP", label: "UP" },
          { id: "OFF", label: "OFF" },
          { id: "DN", label: "DN" },
        ]}
        onChange={(id) => s.patch({ altFlapsControl: id as AltFlapSwitch }, `ALT FLAPS position ${id}`)}
      />
      {!noPedestal && (
        <>
      <Rotary
        label="FLAP LEVER"
        value={String(s.flaps)}
        options={[{ id: "0", label: "UP" }, { id: "1", label: "1" }, { id: "2", label: "2" }, { id: "5", label: "5" }, { id: "10", label: "10" }, { id: "15", label: "15" }, { id: "25", label: "25" }, { id: "30", label: "30" }, { id: "40", label: "40" }]}
        onChange={(id) => s.patch({ flaps: Number(id) }, `FLAP LEVER ${id === "0" ? "UP" : id}`)}
      />
      <Rotary
        label="SPEED BRAKE"
        value={s.speedBrake}
        options={[{ id: "DOWN", label: "DOWN" }, { id: "ARMED", label: "ARM" }, { id: "FLIGHT", label: "FLIGHT" }, { id: "UP", label: "UP" }]}
        onChange={(id) => s.patch({ speedBrake: id as SpeedBrake }, `SPEED BRAKE ${id}`)}
      />
        </>
      )}
      <div className="w-full rounded-md border border-border bg-inset p-2 text-[9px] font-mono uppercase">
        <div>TE NORMAL HYD: <span className={d.teFlapHydraulicDriveAvailable ? "text-ok" : "text-subtle"}>{d.teFlapHydraulicDriveAvailable ? "SYSTEM A AVAILABLE" : "UNAVAILABLE"}</span></div>
        <div>TE BYPASS VALVE: <span className={d.alternateFlapArmed ? "text-elec" : "text-subtle"}>{d.alternateFlapArmed ? "BYPASS" : "NORMAL"}</span></div>
        <div>TE ALT MOTOR: <span className={d.alternateFlapDrivePowered ? "text-ok" : "text-subtle"}>{d.alternateFlapDrivePowered ? "POWERED" : "OFF"}</span></div>
      </div>
    </Module>
  );
}

function HydModule() {
  const s = useSim();
  const d = getDerived(s);
  return (
    <Module title="Hydraulic power · P5">
      <Rocker label="ENG 1 PUMP" on={s.engHyd1} onChange={(v) => s.patch({ engHyd1: v })} lit={d.hydAPump1On} />
      <Rocker label="ENG 2 PUMP" on={s.engHyd2} onChange={(v) => s.patch({ engHyd2: v })} lit={d.hydAPump2On} />
      <Rocker label="ELEC 1 PUMP" on={s.elecHyd1} onChange={(v) => s.patch({ elecHyd1: v })} lit={d.hydBPump1On} />
      <Rocker label="ELEC 2 PUMP" on={s.elecHyd2} onChange={(v) => s.patch({ elecHyd2: v })} lit={d.hydBPump2On} />
      <ThreePos
        label="STANDBY"
        value={s.stbyHyd}
        options={[
          { id: "AUTO", label: "AUTO" },
          { id: "ON", label: "ON" },
          { id: "OFF", label: "OFF" },
        ]}
        onChange={(id) => s.patch({ stbyHyd: id as StbyHyd })}
      />
      <Rocker
        label="GND INTCONN"
        on={s.groundInterconnect}
        onChange={(v) => s.patch({ groundInterconnect: v }, "Ground interconnect — parking brake must be set.")}
      />
    </Module>
  );
}

function ElecModule() {
  const s = useSimPick("apuLeftControl", "apuRightControl", "battery", "busTie", "gen1", "gen2", "groundPowerOn", "groundServiceOn", "patch", "standbyPower");
  const d = useDerivedPick("acPower", "apuGenOnBus", "dcPower", "electricalSource1", "eng1Running", "eng2Running", "groundPowerAvailable", "tr1Powered", "tr2Powered", "tr3Powered", "transferBus1Powered", "transferBus2Powered");
  const gpuConnected = d.groundPowerAvailable;
  const gpuOnBus = gpuConnected && s.groundPowerOn;
  return (
    <Module title="Electrical · P5">
      <Rocker label="BATTERY" on={s.battery} onChange={(v) => s.patch({ battery: v })} lit={d.dcPower} />
      <Rocker label="APU CONTROL L" on={s.apuLeftControl} onChange={(v) => s.patch({ apuLeftControl: v, apuGen: v || s.apuRightControl })} lit={d.apuGenOnBus} />
      <Rocker label="APU CONTROL R" on={s.apuRightControl} onChange={(v) => s.patch({ apuRightControl: v, apuGen: s.apuLeftControl || v })} lit={d.apuGenOnBus} />
      <Rocker label="GRD PWR" on={s.groundPowerOn} onChange={(v) => s.patch({ groundPowerOn: gpuConnected ? v : false, groundServiceOn: v ? false : s.groundServiceOn }, gpuConnected ? undefined : "GRD PWR inhibited — connect the external ground power cart first.")} lit={gpuConnected} />
      <Rocker label="GEN 1" on={s.gen1} onChange={(v) => s.patch({ gen1: v })} lit={d.eng1Running && s.gen1} />
      <Rocker label="GEN 2" on={s.gen2} onChange={(v) => s.patch({ gen2: v })} lit={d.eng2Running && s.gen2} />
      <Rocker label="BUS TRANSFER AUTO" on={s.busTie} onChange={(v) => s.patch({ busTie: v })} lit={d.acPower && d.transferBus1Powered && d.transferBus2Powered} />
      <ThreeToggle label="STANDBY POWER" value={s.standbyPower} options={[{ id: "OFF", label: "OFF" }, { id: "AUTO", label: "AUTO" }, { id: "BAT", label: "BAT" }]} onChange={(id) => s.patch({ standbyPower: id as "OFF" | "AUTO" | "BAT" })} />
      <CaptionLight label="TR 1" on={d.tr1Powered} tone="elec" />
      <CaptionLight label="TR 2" on={d.tr2Powered} tone="elec" />
      <CaptionLight label="TR 3" on={d.tr3Powered} tone="elec" />
      <div className="w-full rounded-md border border-border bg-inset p-2 text-[9px] font-mono uppercase">
        <div>AC SOURCE: <span className={d.acPower ? "text-ok" : "text-subtle"}>{d.electricalSource1}</span></div>
        <div>TRANSFER BUS 1: <span className={d.transferBus1Powered ? "text-ok" : "text-subtle"}>{d.transferBus1Powered ? "POWERED" : "OFF"}</span></div>
        <div>TRANSFER BUS 2: <span className={d.transferBus2Powered ? "text-ok" : "text-subtle"}>{d.transferBus2Powered ? "POWERED" : "OFF"}</span></div>
      </div>
    </Module>
  );
}

function ApuModule() {
  const s = useSimPick("apuBleed", "apuBleedValve", "apuMaster", "apuStarter", "patch");
  const d = useDerivedPick("apuAvailable", "batteryPower", "dcPower", "externalDcControl");
  return (
    <Module title="APU · P5">
      <Rotary
        label="MASTER"
        value={s.apuMaster}
        options={[
          { id: "OFF", label: "OFF" },
          { id: "ON", label: "ON" },
          { id: "START", label: "START" },
        ]}
        onChange={(id) => {
          if (id === "START" && !(d.batteryPower || d.externalDcControl)) {
            s.patch({ apuMaster: "OFF" }, "APU START inhibited — no 28V DC starter/control power available.");
            return;
          }
          s.patch({ apuMaster: id as ApuMaster }, id === "START" ? "APU START command — inlet door opening / starter lockout sequence initiated." : undefined);
        }}
      />
      <Rocker label="APU BLEED" on={s.apuBleed} onChange={(v) => s.patch({ apuBleed: v })} lit={d.dcPower && s.apuBleedValve > 0.7} />
      <div className="w-full rounded-md border border-border bg-inset px-2 py-2 text-[9px] font-display uppercase tracking-wide text-subtle">APU FIRE / DISCHARGE — P8 FIRE PROTECTION</div>
      <div className="flex w-full flex-col gap-1 pt-1">
        <CaptionLight label={d.apuAvailable ? "APU AVAIL 95%" : "APU NOT AVAIL"} on={d.apuAvailable} tone="ok" />
        <CaptionLight label={s.apuStarter ? "STARTER ON" : "STARTER"} on={s.apuStarter} tone="caution" />
      </div>
    </Module>
  );
}

function BleedModule() {
  const s = useSimPick("bleed1", "bleed2", "bleedTrip1", "bleedTrip2", "faults", "groundConditionedAirConnected", "groundPneumaticConnected", "groundPneumaticPsi", "isolation", "packL", "packR", "packTripL", "packTripR", "patch", "recirc", "wasteServiceConnected", "waterServiceConnected");
  const d = useDerivedPick("acPower", "acSupplyLeft", "acSupplyRight", "bleed1Available", "bleed2Available", "groundConditionedAirActive", "packLCompressorOverheat", "packLDuctOverheat", "packLFlow", "packLPackTrip250", "packLTurbineOverheat", "packRCompressorOverheat", "packRDuctOverheat", "packRFlow", "packRPackTrip250", "packRTurbineOverheat");
  return (
    <Module title="Bleed / packs · P5-10">
      <Rocker label="BLEED 1" on={s.bleed1} onChange={(v) => s.patch({ bleed1: v, bleedTrip1: v ? s.bleedTrip1 : false })} lit={d.bleed1Available} />
      <Rocker label="BLEED 2" on={s.bleed2} onChange={(v) => s.patch({ bleed2: v, bleedTrip2: v ? s.bleedTrip2 : false })} lit={d.bleed2Available} />
      <ThreeToggle
        label="ISOLATION"
        value={s.isolation}
        options={[
          { id: "OPEN", label: "OPEN" },
          { id: "AUTO", label: "AUTO" },
          { id: "CLOSE", label: "CLOSE" },
        ]}
        onChange={(id) => s.patch({ isolation: id as Isolation })}
      />
      <Rocker label="L PACK" on={s.packL} onChange={(v) => s.patch({ packL: v, packTripL: v ? s.packTripL : false })} lit={d.acPower && d.packLFlow} />
      <Rocker label="R PACK" on={s.packR} onChange={(v) => s.patch({ packR: v, packTripR: v ? s.packTripR : false })} lit={d.acPower && d.packRFlow} />
      <div className="grid w-full grid-cols-2 gap-1">
        <button type="button" disabled={!s.packTripL || d.packLDuctOverheat || d.packLCompressorOverheat || d.packLTurbineOverheat || d.packLPackTrip250} className="rounded border border-border bg-inset px-2 py-1.5 text-[8px] font-display uppercase disabled:opacity-40" onClick={() => s.patch({ packTripL: false }, "L PACK TRIP RESET — reset permitted after the overheat condition is removed.")}>L PACK TRIP RESET</button>
        <button type="button" disabled={!s.packTripR || d.packRDuctOverheat || d.packRCompressorOverheat || d.packRTurbineOverheat || d.packRPackTrip250} className="rounded border border-border bg-inset px-2 py-1.5 text-[8px] font-display uppercase disabled:opacity-40" onClick={() => s.patch({ packTripR: false }, "R PACK TRIP RESET — reset permitted after the overheat condition is removed.")}>R PACK TRIP RESET</button>
      </div>
      <div className="grid w-full grid-cols-2 gap-1">
        <button type="button" disabled={!s.bleedTrip1 || s.faults.bleedOverheat1} className="rounded border border-border bg-inset px-2 py-1.5 text-[8px] font-display uppercase disabled:opacity-40" onClick={() => s.patch({ bleedTrip1: false }, "BLEED 1 TRIP RESET — reset permitted after the overheat condition is removed.")}>BLEED 1 RESET</button>
        <button type="button" disabled={!s.bleedTrip2 || s.faults.bleedOverheat2} className="rounded border border-border bg-inset px-2 py-1.5 text-[8px] font-display uppercase disabled:opacity-40" onClick={() => s.patch({ bleedTrip2: false }, "BLEED 2 TRIP RESET — reset permitted after the overheat condition is removed.")}>BLEED 2 RESET</button>
      </div>
      <Rocker label="RECIRC" on={s.recirc} onChange={(v) => s.patch({ recirc: v })} lit={d.acPower && s.recirc} />
      <Rocker label="GROUND AIR" on={s.groundPneumaticConnected} onChange={(v) => s.patch({ groundPneumaticConnected: v, groundPneumaticPsi: v ? 40 : 0 })} lit={s.groundPneumaticConnected && s.groundPneumaticPsi >= 30} />
      <Rocker label="GROUND COND AIR" on={s.groundConditionedAirConnected} onChange={(v) => s.patch({ groundConditionedAirConnected: v, groundConditionedAirPsi: v ? 25 : 0 })} lit={d.groundConditionedAirActive} />
      <Rocker label="WATER CART" on={s.waterServiceConnected} onChange={(v) => s.patch({ waterServiceConnected: v })} />
      <Rocker label="WASTE CART" on={s.wasteServiceConnected} onChange={(v) => s.patch({ wasteServiceConnected: v })} />
      <div className="grid w-full grid-cols-2 gap-2 rounded-md border border-border bg-inset p-2">
        <CaptionLight label="L AC SUPPLY" on={d.acSupplyLeft} tone="elec" />
        <CaptionLight label="R AC SUPPLY" on={d.acSupplyRight} tone="elec" />
      </div>
      <p className="w-full text-[9px] leading-relaxed text-subtle">L/R AC SUPPLY indicates actual conditioned-air flow to the respective distribution system. With one pack off, the remaining pack supplies both systems; GROUND COND AIR is the separate ATA 21 service-cart connection used when aircraft packs are off.</p>
    </Module>
  );
}


function FuelModule() {
  const s = useSimPick("fuelCrossfeed", "fuelPump1Aft", "fuelPump1Fwd", "fuelPump2Aft", "fuelPump2Fwd", "fuelPumpCenter1", "fuelPumpCenter2", "fuelTank1", "fuelTank2", "fuelTankCenter", "patch");
  const d = useDerivedPick("acPower", "fuelCenterPump1On", "fuelCenterPump2On", "fuelCenterPumpOn", "fuelPump1AftOn", "fuelPump1FwdOn", "fuelPump1On", "fuelPump2AftOn", "fuelPump2FwdOn", "fuelPump2On");
  return (
    <Module title="Fuel · P5">
      <Rocker label="TANK 1 FWD BOOST" on={s.fuelPump1Fwd} onChange={(v) => s.patch({ fuelPump1Fwd: v })} lit={d.fuelPump1FwdOn} />
      <Rocker label="TANK 1 AFT BOOST" on={s.fuelPump1Aft} onChange={(v) => s.patch({ fuelPump1Aft: v })} lit={d.fuelPump1AftOn} />
      <Rocker label="CENTER LEFT BOOST" on={s.fuelPumpCenter1} onChange={(v) => s.patch({ fuelPumpCenter1: v })} lit={d.fuelCenterPump1On} />
      <Rocker label="CENTER RIGHT BOOST" on={s.fuelPumpCenter2} onChange={(v) => s.patch({ fuelPumpCenter2: v })} lit={d.fuelCenterPump2On} />
      <Rocker label="TANK 2 FWD BOOST" on={s.fuelPump2Fwd} onChange={(v) => s.patch({ fuelPump2Fwd: v })} lit={d.fuelPump2FwdOn} />
      <Rocker label="TANK 2 AFT BOOST" on={s.fuelPump2Aft} onChange={(v) => s.patch({ fuelPump2Aft: v })} lit={d.fuelPump2AftOn} />
      <Rocker label="CROSSFEED" on={s.fuelCrossfeed} onChange={(v) => s.patch({ fuelCrossfeed: v }, v ? "FUEL CROSSFEED OPEN — opposite tank boost source may supply the engine." : "FUEL CROSSFEED CLOSED")} lit={d.acPower && s.fuelCrossfeed} />
      <div className="grid w-full grid-cols-3 gap-1 rounded-md border border-border bg-inset p-2 text-[8px] font-mono uppercase">
        <CaptionLight label={`T1 ${Math.round(s.fuelTank1)}%`} on={d.fuelPump1On} tone="elec" />
        <CaptionLight label={`CTR ${Math.round(s.fuelTankCenter)}%`} on={d.fuelCenterPumpOn} tone="elec" />
        <CaptionLight label={`T2 ${Math.round(s.fuelTank2)}%`} on={d.fuelPump2On} tone="elec" />
      </div>
    </Module>
  );
}

function EnvironmentModule() {
  const s = useSimPick("cabinDiff", "outflow", "patch", "pressMode", "tempModeL", "tempModeR", "tempSelectL", "tempSelectR");
  const tempMode = (side: "L" | "R") => side === "L" ? (s.tempModeL ?? "AUTO") : (s.tempModeR ?? "AUTO");
  const tempSelect = (side: "L" | "R") => side === "L" ? Number(s.tempSelectL ?? 75) : Number(s.tempSelectR ?? 75);
  const setTempMode = (side: "L" | "R", mode: string) => s.patch(side === "L" ? { tempModeL: mode as NonNullable<SimState["tempModeL"]> } : { tempModeR: mode as NonNullable<SimState["tempModeR"]> });
  const setTemp = (side: "L" | "R", value: number) => s.patch(side === "L" ? { tempSelectL: value, tempModeL: "MANUAL" } : { tempSelectR: value, tempModeR: "MANUAL" });
  return (
    <Module title="Air conditioning / pressurization · P5">
      <Rotary label="CABIN TEMP L" value={tempMode("L")} options={[{ id: "AUTO", label: "AUTO" }, { id: "MANUAL_COOL", label: "COOL" }, { id: "MANUAL_WARM", label: "WARM" }, { id: "MANUAL", label: "MAN" }, { id: "OFF", label: "OFF" }]} onChange={(id) => setTempMode("L", id)} />
      <ControlSlider label={`CABIN TEMP L · ${tempSelect("L")}°F`} value={tempSelect("L")} onChange={(v) => setTemp("L", v)} min={65} max={85} step={1} disabled={tempMode("L") === "OFF"} />
      <Rotary label="CABIN TEMP R" value={tempMode("R")} options={[{ id: "AUTO", label: "AUTO" }, { id: "MANUAL_COOL", label: "COOL" }, { id: "MANUAL_WARM", label: "WARM" }, { id: "MANUAL", label: "MAN" }, { id: "OFF", label: "OFF" }]} onChange={(id) => setTempMode("R", id)} />
      <ControlSlider label={`CABIN TEMP R · ${tempSelect("R")}°F`} value={tempSelect("R")} onChange={(v) => setTemp("R", v)} min={65} max={85} step={1} disabled={tempMode("R") === "OFF"} />
      <Rotary label="PRESSURIZATION" value={s.pressMode} options={[{ id: "AUTO", label: "AUTO" }, { id: "STBY", label: "STBY" }, { id: "MAN_AC", label: "MAN AC" }, { id: "MAN_DC", label: "MAN DC" }]} onChange={(id) => s.patch({ pressMode: id as PressMode })} />
      <div className="grid w-full grid-cols-2 gap-1">
        <button type="button" disabled={s.pressMode === "AUTO" || s.pressMode === "STBY"} className="rounded border border-border bg-inset px-2 py-1.5 text-[8px] font-display uppercase disabled:opacity-40" onClick={() => s.patch({ outflow: Math.min(1, s.outflow + 0.1) })}>OUTFLOW OPEN</button>
        <button type="button" disabled={s.pressMode === "AUTO" || s.pressMode === "STBY"} className="rounded border border-border bg-inset px-2 py-1.5 text-[8px] font-display uppercase disabled:opacity-40" onClick={() => s.patch({ outflow: Math.max(0, s.outflow - 0.1) })}>OUTFLOW CLOSE</button>
      </div>
      <div className="grid w-full grid-cols-2 gap-1">
        <CaptionLight label={`CABIN ΔP ${Number(s.cabinDiff ?? 0).toFixed(1)} PSI`} on={Number(s.cabinDiff ?? 0) > 0.2} tone="elec" />
        <CaptionLight label={`OUTFLOW ${Math.round(Number(s.outflow ?? 0) * 100)}%`} on={Number(s.outflow ?? 0) < 0.9} tone="elec" />
      </div>
    </Module>
  );
}

function AntiIceModule() {
  const s = useSimPick("antiIce1", "antiIce2", "fuelHeat", "fuelHeat2", "patch", "windowHeatLFwd", "windowHeatLSide", "windowHeatOvhtLFwd", "windowHeatOvhtLSide", "windowHeatOvhtRFwd", "windowHeatOvhtRSide", "windowHeatRFwd", "windowHeatRSide", "windowHeatTest", "wingAntiIceL", "wingAntiIceR");
  const d = useDerivedPick("acPower", "fuelHeatValve2Open", "fuelHeatValveOpen");
  // Window heat ON light: switch ON, AC available, not in overheat.
  const whOn = (on: boolean, ovht: boolean) => d.acPower && on && !ovht;
  const setWh = (
    key: "windowHeatLFwd" | "windowHeatLSide" | "windowHeatRFwd" | "windowHeatRSide",
    v: boolean,
  ) => {
    const ovhtKey = ({
      windowHeatLFwd: "windowHeatOvhtLFwd",
      windowHeatLSide: "windowHeatOvhtLSide",
      windowHeatRFwd: "windowHeatOvhtRFwd",
      windowHeatRSide: "windowHeatOvhtRSide",
    } as const)[key];
    // Cycling OFF clears a latched overheat for that window (real system behaviour).
    s.patch(
      { [key]: v, ...(v ? {} : { [ovhtKey]: false }) } as never,
      v ? `WINDOW HEAT ${key.replace("windowHeat", "")} ON` : `WINDOW HEAT ${key.replace("windowHeat", "")} OFF`,
    );
  };
  return (
    <>
      <Module title="Anti-ice / engine fuel heat · P5">
        <Rocker label="ENG 1 ANTI-ICE" on={s.antiIce1} onChange={(v) => s.patch({ antiIce1: v })} lit={d.acPower && s.antiIce1} />
        <Rocker label="ENG 2 ANTI-ICE" on={s.antiIce2} onChange={(v) => s.patch({ antiIce2: v })} lit={d.acPower && s.antiIce2} />
        <Rocker label="WING ANTI-ICE L" on={s.wingAntiIceL} onChange={(v) => s.patch({ wingAntiIceL: v })} lit={d.acPower && s.wingAntiIceL} />
        <Rocker label="WING ANTI-ICE R" on={s.wingAntiIceR} onChange={(v) => s.patch({ wingAntiIceR: v })} lit={d.acPower && s.wingAntiIceR} />
        <Rocker label="ENG 1 FUEL HEAT" on={s.fuelHeat} onChange={(v) => s.patch({ fuelHeat: v, ...(v ? { fuelHeatElapsedSec: 0 } : {}) })} lit={d.fuelHeatValveOpen} /><Rocker label="ENG 2 FUEL HEAT" on={s.fuelHeat2} onChange={(v) => s.patch({ fuelHeat2: v, ...(v ? { fuelHeat2ElapsedSec: 0 } : {}) })} lit={d.fuelHeatValve2Open} />
        <div className="grid w-full grid-cols-3 gap-1 rounded-md border border-border bg-inset p-2">
          <CaptionLight label="ENG 1" on={d.acPower && s.antiIce1} tone="ok" />
          <CaptionLight label="WING" on={d.acPower && (s.wingAntiIceL || s.wingAntiIceR)} tone="ok" />
          <CaptionLight label="FUEL HT" on={d.acPower && s.fuelHeat} tone="ok" />
        </div>
      </Module>

      {/* P5-9 window heat module (ATA 30-41) — matches the real overhead layout. */}
      <Module title="Window heat · P5-9">
        <div className="grid w-full grid-cols-2 gap-2">
          <div className="space-y-1 rounded-md border border-border bg-inset p-2">
            <div className="font-mono text-[8px] uppercase tracking-wider text-subtle">Left</div>
            <Rocker label="L FWD" on={s.windowHeatLFwd} onChange={(v) => setWh("windowHeatLFwd", v)} lit={whOn(s.windowHeatLFwd, s.windowHeatOvhtLFwd)} />
            <Rocker label="L SIDE" on={s.windowHeatLSide} onChange={(v) => setWh("windowHeatLSide", v)} lit={whOn(s.windowHeatLSide, s.windowHeatOvhtLSide)} />
            <div className="grid grid-cols-2 gap-1 pt-1">
              <CaptionLight label="L FWD ON" on={whOn(s.windowHeatLFwd, s.windowHeatOvhtLFwd)} tone="ok" />
              <CaptionLight label="L FWD OVHT" on={s.windowHeatOvhtLFwd || (s.windowHeatTest === "OVHT" && s.windowHeatLFwd)} tone="caution" />
              <CaptionLight label="L SIDE ON" on={whOn(s.windowHeatLSide, s.windowHeatOvhtLSide)} tone="ok" />
              <CaptionLight label="L SIDE OVHT" on={s.windowHeatOvhtLSide || (s.windowHeatTest === "OVHT" && s.windowHeatLSide)} tone="caution" />
            </div>
          </div>
          <div className="space-y-1 rounded-md border border-border bg-inset p-2">
            <div className="font-mono text-[8px] uppercase tracking-wider text-subtle">Right</div>
            <Rocker label="R FWD" on={s.windowHeatRFwd} onChange={(v) => setWh("windowHeatRFwd", v)} lit={whOn(s.windowHeatRFwd, s.windowHeatOvhtRFwd)} />
            <Rocker label="R SIDE" on={s.windowHeatRSide} onChange={(v) => setWh("windowHeatRSide", v)} lit={whOn(s.windowHeatRSide, s.windowHeatOvhtRSide)} />
            <div className="grid grid-cols-2 gap-1 pt-1">
              <CaptionLight label="R FWD ON" on={whOn(s.windowHeatRFwd, s.windowHeatOvhtRFwd)} tone="ok" />
              <CaptionLight label="R FWD OVHT" on={s.windowHeatOvhtRFwd || (s.windowHeatTest === "OVHT" && s.windowHeatRFwd)} tone="caution" />
              <CaptionLight label="R SIDE ON" on={whOn(s.windowHeatRSide, s.windowHeatOvhtRSide)} tone="ok" />
              <CaptionLight label="R SIDE OVHT" on={s.windowHeatOvhtRSide || (s.windowHeatTest === "OVHT" && s.windowHeatRSide)} tone="caution" />
            </div>
          </div>
        </div>
        <ThreeToggle
          label="WINDOW HEAT TEST"
          value={s.windowHeatTest}
          options={[
            { id: "PWR", label: "PWR" },
            { id: "OFF", label: "OFF" },
            { id: "OVHT", label: "OVHT" },
          ]}
          onChange={(id) => {
            const v = id as "OFF" | "PWR" | "OVHT";
            s.patch({ windowHeatTest: v }, v === "OFF" ? "Window heat test released." : `Window heat test — ${v}`);
          }}
        />
        <p className="text-[8px] leading-snug text-subtle">
          ATA 30-41 · P5-9. FWD = No.1 windshield; SIDE = No.2/4/5. Green ON = heat applied (AC available, not overheat). Amber OVHT = overheat or OVHT test. Cycle the window switch OFF to clear a latched overheat. Test is spring-centered on the aircraft.
        </p>
      </Module>
    </>
  );
}

export function StartModule() {
  const s = useSimPick("patch", "start1", "start2");
  const d = useDerivedPick("ignition1On", "ignition2On", "startValveOpen1", "startValveOpen2");
  return (
    <Module title="Engine start · P5 forward overhead">
      <Rotary
        label="ENGINE START 1"
        value={s.start1}
        options={[
          { id: "GRD", label: "GRD" },
          { id: "OFF", label: "OFF" },
          { id: "IGN_L", label: "L IGN" },
          { id: "IGN_R", label: "R IGN" },
          { id: "FLT", label: "FLT" },
        ]}
        onChange={(id) => s.patch({ start1: id as StartSwitch })}
      />
      <div className="grid grid-cols-2 gap-1">
        <CaptionLight label="START VLV 1" on={d.startValveOpen1} tone="caution" />
        <CaptionLight label="IGN 1" on={d.ignition1On} tone="caution" />
      </div>
      <Rotary
        label="ENGINE START 2"
        value={s.start2}
        options={[
          { id: "GRD", label: "GRD" },
          { id: "OFF", label: "OFF" },
          { id: "IGN_L", label: "L IGN" },
          { id: "IGN_R", label: "R IGN" },
          { id: "FLT", label: "FLT" },
        ]}
        onChange={(id) => s.patch({ start2: id as StartSwitch })}
      />
      <div className="grid grid-cols-2 gap-1">
        <CaptionLight label="START VLV 2" on={d.startValveOpen2} tone="caution" />
        <CaptionLight label="IGN 2" on={d.ignition2On} tone="caution" />
      </div>
      <p className="text-[7px] leading-relaxed text-subtle">737-200 arrangement: rotary engine-start selectors remain on the forward overhead; thrust, fuel cutoff and reverse levers are on the center control stand.</p>
    </Module>
  );
}


export function FlightControlsModule({ aside }: { aside?: React.ReactNode } = {}) {
  const d = useDerived();
  return (
    <Module title="Flight controls · training" >
      <FlightControlComponentView d={d} aside={aside} />
    </Module>
  );
}

export function LandingGearModule() {
  const d = useDerived();
  return (
    <Module title="Landing gear / brake dynamics · training">
      <LandingGearComponentView d={d} />
    </Module>
  );
}

function LandingGearComponentView({ d }: { d: ReturnType<typeof useDerived> }) {
  const s = useSimPick("gear", "gearLeverOverride", "gearPos", "manualReleasedLeftMain", "manualReleasedNose", "manualReleasedRightMain", "patch");
  const pos = Math.max(0, Math.min(1, s.gearPos));
  const powered = d.hydA > 1500;
  const steering = Math.max(-78, Math.min(78, d.noseWheelSteeringAngle));
  const transit = d.gearTransit;
  const gearState = transit
    ? s.gear === "DN" ? "EXTENDING" : s.gear === "UP" ? "RETRACTING" : "TRANSIT / HOLD"
    : d.gearDown ? "DOWN / LOCKED" : d.gearUp ? "UP / LOCKED" : "TRANSIT";
  const lockState = d.gearDown ? "DOWNLOCK" : d.gearUp ? "UPLOCK" : "MOVING";
  const manualExtend = (which: "nose" | "leftMain" | "rightMain") => {
    if (s.gear === "UP") {
      s.patch({ gear: s.gear }, "MANUAL EXTENSION INHIBITED — SELECT LANDING GEAR LEVER TO OFF/NEUTRAL OR DN FIRST.");
      return;
    }
    const key = which === "nose" ? "manualReleasedNose" : which === "leftMain" ? "manualReleasedLeftMain" : "manualReleasedRightMain";
    const label = which === "nose" ? "NOSE GEAR" : which === "leftMain" ? "LEFT MAIN GEAR" : "RIGHT MAIN GEAR";
    s.patch({ [key]: true } as any, `MANUAL EXTENSION — ${label} uplock released; T-handle returned.`);
  };
  return (
    <div className="rounded-lg border border-border bg-[#090b0e] p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <span className="font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-fg">Landing gear — component view</span>
          <p className="mt-0.5 text-[9px] text-subtle">Selector → hydraulic actuators → struts / locks → steering → brakes · TRANSIT = RED</p>
        </div>
        <span className={cn("rounded border px-2 py-1 font-mono text-[8px] uppercase", powered ? "border-ok/40 text-ok" : "border-border text-subtle")}>{powered ? "HYD A AVAILABLE" : "HYD A LOW / OFF"}</span>
      </div>
      <div className="rounded-md border border-[#39414b] bg-[radial-gradient(circle_at_50%_45%,#303842_0,#12161b_55%,#080a0d_100%)] p-2">
        <LandingGearMechanismSvg gearPos={pos} gearPositions={d.gearPositions} selector={s.gear} steeringAngle={steering} hydraulicAvailable={powered} />
      </div>
      <div className="mt-2 flex justify-center">
        <GearLeverP2 />
      </div>
      <div className="mt-2 rounded-md border border-[#45402f] bg-[#11130f] p-2">
        <div className="mb-1 text-[8px] font-display uppercase tracking-[0.14em] text-[#b7ab87]">CABIN FLOOR — MANUAL EXTENSION</div>
        <div className="mb-2 text-[8px] text-subtle">Three red T-handles, aft/right of the aisle stand, in LEFT / NOSE / RIGHT order. Set the landing-gear lever to OFF/NEUTRAL or DN before pulling and releasing the respective T-handle. The handle returns to stow; only the released gear free-falls to down-and-locked; the other two gears do not move. Do not hold a T-handle extended during hydraulic gear operation.</div>
        <div className="grid grid-cols-3 gap-3">
          {([["LEFT MAIN","leftMain"],["NOSE","nose"],["RIGHT MAIN","rightMain"]] as const).map(([label,key]) => {
            const released = key === "nose" ? s.manualReleasedNose : key === "leftMain" ? s.manualReleasedLeftMain : s.manualReleasedRightMain;
            const allowed = s.gear !== "UP";
            return <button key={key} type="button" aria-label={`${label} manual extension T-handle`} disabled={!allowed}
              onPointerDown={(e) => { e.preventDefault(); if (allowed) manualExtend(key); }}
              className={cn("group relative flex h-20 flex-col items-center justify-end rounded border px-2 pb-2 text-[8px] font-display uppercase select-none touch-none",
                !allowed ? "cursor-not-allowed border-border bg-inset text-subtle/60" : "border-[#5a2525] bg-[#170d0d] text-fg hover:bg-[#241010]")}>
              <span className={cn("absolute top-2 h-2 w-12 rounded-full border border-[#5c1616] bg-[#b72f2f] shadow-[0_2px_3px_rgba(0,0,0,.6)]", !allowed && "opacity-45")}></span>
              <span className={cn("absolute top-3 h-10 w-2 rounded-b-sm border border-[#5c1616] bg-[#a92727] shadow-[0_2px_3px_rgba(0,0,0,.55)]", !allowed && "opacity-45")}></span>
              <span className="relative z-10 mt-11">{label}</span>
              <span className="relative z-10 mt-0.5 font-mono text-[7px]">{!allowed ? "LEVER OFF" : released ? "UPLOCK RELEASED" : "PULL / RELEASE"}</span>
            </button>;
          })}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-[8px] uppercase">
        <ComponentReadout label="GEAR POSITION" value={gearState} />
        <ComponentReadout label="SELECTOR" value={s.gear} />
        <ComponentReadout label="SELECTOR OVERRIDE" value={s.gearLeverOverride ? "ENABLED" : "NORMAL / GROUND LOCK"} />
        <ComponentReadout label="GEAR WARNING" value={d.gearWarningHorn ? "HORN ACTIVE" : "SILENT"} />
        <ComponentReadout label="LEFT MAIN" value={`${Math.round(d.gearPositions.leftMain * 100)}% ${d.gearLights.leftMain.green ? "DOWN/LOCKED" : d.gearLights.leftMain.red ? "RED/UNSAFE" : "UP"}`} />
        <ComponentReadout label="NOSE" value={`${Math.round(d.gearPositions.nose * 100)}% ${d.gearLights.nose.green ? "DOWN/LOCKED" : d.gearLights.nose.red ? "RED/UNSAFE" : "UP"}`} />
        <ComponentReadout label="RIGHT MAIN" value={`${Math.round(d.gearPositions.rightMain * 100)}% ${d.gearLights.rightMain.green ? "DOWN/LOCKED" : d.gearLights.rightMain.red ? "RED/UNSAFE" : "UP"}`} />
        <ComponentReadout label="NOSE STEERING" value={`${steering.toFixed(0)}°`} />
        <ComponentReadout label="STEERING SOURCE" value={d.noseWheelSteeringAvailable ? "SYSTEM A" : "OFF"} />
      </div>
      <p className="mt-2 text-[9px] leading-relaxed text-subtle">Use the actual LANDING GEAR selector. UP commands retraction and DN commands extension; OFF stops commanding movement and the mechanism holds its current position. Each strut's shock strut is fixed on a pivot at its uppermost end: the main gear fans up and inboard about a wing-root pivot into the wheel well, while the nose gear pivots forward about its own fuselage-mounted pivot until it sits flush with the fuselage underside.</p>
    </div>
  );
}

// Traces the dashed guide arc a gear leg's wheels sweep through as the
// leg rotates, as a rigid body, about its fixed upper pivot — i.e. the
// "fan" the shock strut fans through. Angles follow SVG's rotate():
// 0deg points straight down from the pivot, positive is clockwise.
function pivotArc(cx: number, cy: number, r: number, fromDeg: number, toDeg: number) {
  const toXY = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return [cx - r * Math.sin(rad), cy + r * Math.cos(rad)] as const;
  };
  const [x0, y0] = toXY(fromDeg);
  const [x1, y1] = toXY(toDeg);
  const sweep = toDeg >= fromDeg ? 1 : 0;
  const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  return `M${x0} ${y0} A${r} ${r} 0 ${large} ${sweep} ${x1} ${y1}`;
}

// Main gear fans up and inboard about a wing-root pivot at the strut's
// uppermost end. Nose gear pivots the same way but forward, about a
// pivot fixed to the fuselage structure at its uppermost end, until the
// wheels sit flush with the fuselage underside.
const MAIN_MAX_ANGLE = 90;
const NOSE_PIVOT_X = 320;
const NOSE_PIVOT_Y = 98;

export function LandingGearMechanismSvg({
  gearPos,
  gearPositions,
  selector,
  steeringAngle = 0,
  hydraulicAvailable = true,
  compact = false,
}: {
  gearPos: number;
  gearPositions?: { nose: number; leftMain: number; rightMain: number };
  selector: "UP" | "OFF" | "DN";
  steeringAngle?: number;
  hydraulicAvailable?: boolean;
  compact?: boolean;
}) {
  const pos = Math.max(0, Math.min(1, gearPos));
  const mainPositions = [
    Math.max(0, Math.min(1, gearPositions?.leftMain ?? pos)),
    Math.max(0, Math.min(1, gearPositions?.rightMain ?? pos)),
  ];
  const nosePos = Math.max(0, Math.min(1, gearPositions?.nose ?? pos));
  const moving = mainPositions.some(p => p > 0.02 && p < 0.98) || (nosePos > 0.02 && nosePos < 0.98);
  const extending = moving && selector === "DN";
  const retracting = moving && selector === "UP";
  const stroke = hydraulicAvailable ? "#8d99a5" : "#59636e";
  const active = hydraulicAvailable && (moving || selector !== "OFF");
  const wheelFill = "#11151a";
  const wheelAngle = Math.max(-78, Math.min(78, steeringAngle));
  const mainX = [145, 495];
  const height = compact ? 350 : 350;
  return (
    <svg viewBox={`0 0 640 ${height}`} className="w-full" role="img" aria-label="Extendable and retractable landing gear mechanism">
      <defs>
        <linearGradient id="gearMetal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#aeb8c2"/><stop offset="0.45" stopColor="#66727e"/><stop offset="1" stopColor="#252c33"/></linearGradient>
        <linearGradient id="gearPiston" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#4f5b66"/><stop offset="0.5" stopColor="#d0d6db"/><stop offset="1" stopColor="#4f5b66"/></linearGradient>
        <filter id="gearShadow"><feDropShadow dx="0" dy="3" stdDeviation="3" floodOpacity=".45"/></filter>
      </defs>

      {/* aircraft support / wing */}
      <path d="M55 74 Q320 18 585 74" fill="none" stroke="#65717c" strokeWidth="18" strokeLinecap="round"/>
      <path d="M55 74 L55 118 M585 74 L585 118" stroke="#87929e" strokeWidth="8"/>
      <path d="M120 65 L75 132 M200 51 L235 126 M440 51 L405 126 M520 65 L565 132" fill="none" stroke="#687581" strokeWidth="7"/>
      <path d="M120 65 L200 51 M440 51 L520 65" fill="none" stroke="#4f5964" strokeWidth="4"/>
      <text x="320" y="31" textAnchor="middle" fill="#aeb7c0" fontSize="11">AIRCRAFT GEAR SUPPORT / WING</text>

      {/* hydraulic feed / center manifold */}
      <path d="M320 45 L320 101" stroke={active ? "#7c9bb4" : "#46515c"} strokeWidth="5" strokeDasharray="8 5"/>
      <rect x="309" y="88" width="22" height="31" rx="4" fill="#303943" stroke="#8b96a1" strokeWidth="2"/>
      <text x="342" y="106" fill="#8f9aa5" fontSize="9">SELECTOR / ACTUATOR MANIFOLD</text>

      {mainX.map((x, i) => {
        const gearPosLocal = mainPositions[i];
        const movingLocal = gearPosLocal > 0.02 && gearPosLocal < 0.98;
        // Real 737 main gear does not slide straight up — the shock
        // strut's upper end is fixed on a trunnion pivot, and once
        // retraction is triggered the whole leg (actuator, strut, axle,
        // wheels) swings as one rigid body about that pivot: a genuine
        // fan motion up and inboard into the wheel well. side flips the
        // sweep direction so the left gear (i=0) fans in toward the
        // centerline to its right, and the right gear (i=1) fans in
        // toward the centerline to its left.
        const retract = 1 - gearPosLocal;
        const side = i === 0 ? -1 : 1;
        const pivotY = 93;
        const angle = side * retract * MAIN_MAX_ANGLE;
        return (
        <g key={`main-${i}`}>
          {/* dashed guide tracing the fan sweep from down-and-locked to up-and-locked */}
          <path d={pivotArc(x, pivotY, 168, 0, angle)} fill="none" stroke="#4e5964" strokeWidth="2" strokeDasharray="4 5" opacity=".5"/>
          <g transform={`rotate(${angle} ${x} ${pivotY})`}>
            {/* actuator cylinder and piston */}
            <rect x={x - 16} y="92" width="32" height="72" rx="8" fill="#4a5560" stroke="#9aa5af" strokeWidth="2"/>
            <rect x={x - 7} y="112" width="14" height="96" rx="6" fill="url(#gearPiston)" stroke="#a8b1ba" strokeWidth="1.5"/>
            <path d={`M${x - 30} 111 L${x - 30} 151 M${x + 30} 111 L${x + 30} 151`} stroke={active ? "#6e8ba2" : "#4c5761"} strokeWidth="3"/>
            {/* main strut */}
            <path d={`M${x} 184 L${x} 251`} stroke="url(#gearMetal)" strokeWidth="18" strokeLinecap="round" filter="url(#gearShadow)"/>
            <path d={`M${x - 38} 157 L${x - 5} 196 M${x + 38} 157 L${x + 5} 196`} stroke="#78848f" strokeWidth="8" strokeLinecap="round"/>
            {/* downlock / uplock mechanism */}
            <path d={`M${x - 24} 196 L${x - 7} 184 M${x + 24} 196 L${x + 7} 184`} stroke="#a1abb4" strokeWidth="5"/>
            <circle cx={x} cy="184" r="8" fill={gearPosLocal >= .98 ? "#55b98a" : gearPosLocal <= .02 ? "#6b7480" : "#e24b4b"} stroke="#c2c9cf" strokeWidth="2"/>
            {/* axle */}
            <path d={`M${x - 52} 252 L${x + 52} 252`} stroke="#a1abb4" strokeWidth="13" strokeLinecap="round"/>
            {/* twin wheels — rotate with the leg, so they visibly tip onto their side as they tuck into the wheel well */}
            <g transform={`translate(${x - 39} 273)`}>
              <rect x="-23" y="-31" width="46" height="62" rx="16" fill={wheelFill} stroke={gearPosLocal > 0.04 ? "#9aa5b0" : "#5b6570"} strokeWidth="5"/>
              <path d="M-11 -26 V26 M0 -28 V28 M11 -26 V26" stroke="#343d46" strokeWidth="3"/>
            </g>
            <g transform={`translate(${x + 39} 273)`}>
              <rect x="-23" y="-31" width="46" height="62" rx="16" fill={wheelFill} stroke={gearPosLocal > 0.04 ? "#9aa5b0" : "#5b6570"} strokeWidth="5"/>
              <path d="M-11 -26 V26 M0 -28 V28 M11 -26 V26" stroke="#343d46" strokeWidth="3"/>
            </g>
          </g>
          <text x={x} y="311" textAnchor="middle" fill="#aeb7c0" fontSize="9">{i === 0 ? "LEFT MAIN GEAR" : "RIGHT MAIN GEAR"}</text>
        </g>
        );
      })}

      {/* nose gear — hinge fixed at (320, 98) and it STAYS fixed. Per
          the reference: the leg rotates in depth, away from the
          viewer, about that one point — it does not swing sideways or
          translate at all. From this front-on view that reads as pure
          foreshortening: the assembly scales straight down toward the
          fixed hinge as it retracts (and back out as it extends),
          never entering the space the main gear legs sweep through,
          so the earlier overlap can't happen by construction. */}
      <g>
        <circle cx={NOSE_PIVOT_X} cy={NOSE_PIVOT_Y} r="7" fill="#56616b" stroke="#cfd5da" strokeWidth="2"/>
        <text x={NOSE_PIVOT_X + 16} y={NOSE_PIVOT_Y - 8} fill="#8f9aa5" fontSize="9">
          FIXED HINGE
        </text>

        {/* depth cue — the leg folds straight back along this axis,
            away from the viewer, not to either side */}
        <path
          d={`M${NOSE_PIVOT_X + 90} ${NOSE_PIVOT_Y - 6} L${NOSE_PIVOT_X + 90} ${NOSE_PIVOT_Y + 58}`}
          stroke="#3d4650"
          strokeWidth="2"
          strokeDasharray="3 4"
          opacity=".6"
        />
        <path
          d={`M${NOSE_PIVOT_X + 84} ${NOSE_PIVOT_Y + 50} L${NOSE_PIVOT_X + 90} ${NOSE_PIVOT_Y + 62} L${NOSE_PIVOT_X + 96} ${NOSE_PIVOT_Y + 50}`}
          fill="none"
          stroke="#3d4650"
          strokeWidth="2"
        />
        <text x={NOSE_PIVOT_X + 100} y={NOSE_PIVOT_Y + 16} fill="#8f9aa5" fontSize="8">AWAY FROM</text>
        <text x={NOSE_PIVOT_X + 100} y={NOSE_PIVOT_Y + 27} fill="#8f9aa5" fontSize="8">VIEWER</text>

        {/* scale toward the fixed hinge point as it retracts — pos=1
            (down) is full size, pos=0 (up) collapses to nothing right
            at the pivot, exactly like the reference's -90° state */}
        <g transform={`translate(${NOSE_PIVOT_X} ${NOSE_PIVOT_Y}) scale(${nosePos}) translate(${-NOSE_PIVOT_X} ${-NOSE_PIVOT_Y})`}>
          <rect x="310" y="98" width="20" height="65" rx="6" fill="#4a5560" stroke="#9aa5af" strokeWidth="2"/>
          <rect x="315" y="118" width="10" height="82" rx="5" fill="url(#gearPiston)"/>
          <path d="M320 184 L320 226" stroke="url(#gearMetal)" strokeWidth="13" strokeLinecap="round"/>
          <path d="M320 211 L300 236 M320 211 L340 236" stroke="#7d8994" strokeWidth="6" strokeLinecap="round"/>
          <circle cx="320" cy="184" r="7" fill={nosePos >= .98 ? "#55b98a" : nosePos <= .02 ? "#6b7480" : "#e24b4b"} stroke="#c2c9cf" strokeWidth="2"/>
          {/* The lower steering assembly yaws about the vertical steering axis.
              A front elevation cannot show true yaw as a flat 2-D rotation, so
              the wheels are shown with a controlled perspective/foreshortening
              around the fixed steering axis rather than spinning around their own
              centers. */}
          <g style={{ transform: `perspective(420px) rotateY(${wheelAngle}deg)`, transformOrigin: "320px 184px", transformBox: "view-box" }}>
            <path d="M287 241 L353 241" stroke="#a1abb4" strokeWidth="10" strokeLinecap="round"/>
            <path d="M320 225 L320 252" stroke="#7d8994" strokeWidth="7" strokeLinecap="round"/>
            <g transform="translate(300 259)">
              <rect x="-13" y="-25" width="26" height="50" rx="9" fill={wheelFill} stroke={nosePos > 0.04 ? "#9aa5b0" : "#5b6570"} strokeWidth="4"/>
              <path d="M-6 -20 V20 M0 -22 V22 M6 -20 V20" stroke="#343d46" strokeWidth="2"/>
            </g>
            <g transform="translate(340 259)">
              <rect x="-13" y="-25" width="26" height="50" rx="9" fill={wheelFill} stroke={nosePos > 0.04 ? "#9aa5b0" : "#5b6570"} strokeWidth="4"/>
              <path d="M-6 -20 V20 M0 -22 V22 M6 -20 V20" stroke="#343d46" strokeWidth="2"/>
            </g>
          </g>
        </g>

        <text x="320" y="299" textAnchor="middle" fill="#aeb7c0" fontSize="9">
          NOSE GEAR — ROTATES IN DEPTH ABOUT A FIXED PIVOT
        </text>
      </g>

      {/* labels and motion state */}
      <g fill="#9faab5" fontSize="9">
        <text x="12" y="145">MAIN GEAR ACTUATOR</text>
        <line x1="105" y1="142" x2="137" y2="142" stroke="#687581"/>
        <text x="438" y="145">UPLOCK / DOWNLOCK</text>
        <line x1="438" y1="149" x2="505" y2="180" stroke="#687581"/>
        <text x="12" y="185">HYDRAULIC EXTEND / RETRACT</text>
        <text x="438" y="185">NOSE STEERING LINKAGE</text>
        <line x1="438" y1="190" x2="346" y2="232" stroke="#687581"/>
      </g>
      <rect x="228" y="318" width="184" height="20" rx="5" fill="#101419" stroke="#3e4852"/>
      <text x="320" y="332" textAnchor="middle" fill={extending || retracting ? "#e24b4b" : pos >= .98 ? "#65c798" : pos <= .02 ? "#8995a1" : "#e24b4b"} fontSize="10" fontFamily="monospace">
        {extending ? "EXTENDING" : retracting ? "RETRACTING" : pos >= .98 ? "DOWN / LOCKED" : pos <= .02 ? "UP / LOCKED" : "TRANSIT / HOLD"}
      </text>
    </svg>
  );
}

function DeflectionSurface({
  x, y, w, h, value, amp, chevronX,
}: { x: number; y: number; w: number; h: number; value: number; amp: number; chevronX: number }) {
  const up = value > 0.04;
  const down = value < -0.04;
  const fill = up ? "#5fae8f" : down ? "#c9903f" : "#454f5a";
  const stroke = up ? "#9fd9c2" : down ? "#e2b877" : "#98a3ae";
  const cy = y + h / 2;
  return (
    <g transform={`translate(0 ${-value * amp})`}>
      <rect x={x} y={y} width={w} height={h} rx="3" fill={fill} stroke={stroke} strokeWidth="1.5" />
      {(up || down) && (
        <path
          d={up
            ? `M ${chevronX - 5} ${cy + 4} L ${chevronX + 5} ${cy + 4} L ${chevronX} ${cy - 5} Z`
            : `M ${chevronX - 5} ${cy - 4} L ${chevronX + 5} ${cy - 4} L ${chevronX} ${cy + 5} Z`}
          fill={fill}
          stroke={stroke}
          strokeWidth="0.75"
        />
      )}
    </g>
  );
}

function AileronPanel({
  x, y, w, h, value, chevronX,
}: { x: number; y: number; w: number; h: number; value: number; chevronX: number }) {
  const up = value > 0.04;
  const down = value < -0.04;
  const mag = Math.min(Math.abs(value), 1);
  const fill = up ? "#5fae8f" : down ? "#c9903f" : "#454f5a";
  const stroke = up ? "#9fd9c2" : down ? "#e2b877" : "#98a3ae";
  const cy = y + h / 2;
  return (
    <g opacity={0.55 + mag * 0.45}>
      <rect x={x} y={y} width={w} height={h} rx="3" fill={fill} stroke={stroke} strokeWidth="1.5" />
      {(up || down) && (
        <path
          d={up
            ? `M ${chevronX - 5} ${cy + 4} L ${chevronX + 5} ${cy + 4} L ${chevronX} ${cy - 5} Z`
            : `M ${chevronX - 5} ${cy - 4} L ${chevronX + 5} ${cy - 4} L ${chevronX} ${cy + 5} Z`}
          fill={fill}
          stroke={stroke}
          strokeWidth="0.75"
        />
      )}
    </g>
  );
}

function SpoilerPanel({
  x, y, w, h, deploy, locked,
}: { x: number; y: number; w: number; h: number; deploy: number; locked: boolean }) {
  const mag = Math.min(Math.max(deploy, 0), 1);
  const up = mag > 0.04;
  const fill = locked ? "url(#gndLock)" : up ? "#5fae8f" : "#454f5a";
  const stroke = locked ? "#5a636d" : up ? "#9fd9c2" : "#98a3ae";
  const cx = x + w / 2;
  const cy = y + h / 2;
  return (
    <g
      transform={`translate(${cx} ${cy}) scale(${locked ? 1 : 1 - mag * 0.22} 1) translate(${-cx} ${-cy})`}
      opacity={locked ? 0.7 : 0.55 + mag * 0.45}
    >
      <rect x={x} y={y} width={w} height={h} rx="2" fill={fill} stroke={stroke} strokeWidth="1.25" />
    </g>
  );
}

function TravelGuide({ x, y1, y2 }: { x: number; y1: number; y2: number }) {
  return (
    <g>
      <line x1={x} y1={y1} x2={x} y2={y2} stroke="#3f4750" strokeWidth="1" strokeDasharray="2 3" />
      <circle cx={x} cy={y1} r="1.6" fill="#3f4750" />
      <circle cx={x} cy={y2} r="1.6" fill="#3f4750" />
    </g>
  );
}

function TravelGuideX({ y, x1, x2 }: { y: number; x1: number; x2: number }) {
  return (
    <g>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke="#3f4750" strokeWidth="1" strokeDasharray="2 3" />
      <circle cx={x1} cy={y} r="1.6" fill="#3f4750" />
      <circle cx={x2} cy={y} r="1.6" fill="#3f4750" />
    </g>
  );
}

function RudderBar({
  hingeX, hingeY, length, value, angle,
}: { hingeX: number; hingeY: number; length: number; value: number; angle: number }) {
  const right = value > 0.04;
  const left = value < -0.04;
  const fill = right ? "#5fae8f" : left ? "#c9903f" : "#63343d";
  const stroke = right ? "#9fd9c2" : left ? "#e2b877" : "#a57b84";
  return (
    <g transform={`rotate(${-value * angle} ${hingeX} ${hingeY})`}>
      <rect x={hingeX - 4} y={hingeY} width="8" height={length} rx="3" fill={fill} stroke={stroke} strokeWidth="1.5" />
    </g>
  );
}

function FlapPanel({
  x, y, w, h, frac,
}: { x: number; y: number; w: number; h: number; frac: number }) {
  const mag = Math.min(Math.max(frac, 0), 1);
  const down = mag > 0.04;
  const fill = down ? "#c9903f" : "#454f5a";
  const stroke = down ? "#e2b877" : "#98a3ae";
  return (
    <g transform={`translate(0 ${mag * 10})`} opacity={0.55 + mag * 0.45}>
      <rect x={x} y={y} width={w} height={h} rx="2" fill={fill} stroke={stroke} strokeWidth="1.25" />
    </g>
  );
}

function LeDeviceStrip({
  points, driveAvailable, extended, transit,
}: { points: string; driveAvailable: boolean; extended: boolean; transit: boolean }) {
  const locked = !driveAvailable;
  const fill = locked ? "url(#gndLock)" : extended ? "#4fa8d8" : transit ? "#c9903f" : "#343c45";
  const stroke = locked ? "#5a636d" : extended ? "#8ccbe8" : transit ? "#e2b877" : "#7d8995";
  const opacity = locked ? 0.7 : extended ? 0.9 : transit ? 0.8 : 0.5;
  return <polygon points={points} fill={fill} stroke={stroke} strokeWidth="1.25" opacity={opacity} />;
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

// Flap gauge display geometry: the needle sweeps across a 120° fan. The labels
// are the 737-200 flap-unit detents; these are not degrees of flap deflection.
function flapAngle(value: number) {
  return 150 - (Math.min(Math.max(value, 0), 40) / 40) * 120;
}

function dirWord(v: number) {
  return v > 0.04 ? " (TE UP)" : v < -0.04 ? " (TE DN)" : "";
}

function FlightControlComponentView({ d, aside }: { d: ReturnType<typeof useDerived>; aside?: React.ReactNode }) {
  const s = useSimPick("flapPos", "spoilerA", "spoilerB", "wow");
  const surface = d.controlSurfaces;
  const a = d.hydA > 1500 && d.flightControlAAvailable;
  const b = d.hydB > 1500 && d.flightControlBAvailable;
  const rud = d.standbyRudderPowered || (a && b);
  const ELEV_AMP = 13;
  // Flight spoilers 3/6 run on System A (SPOILER A switch), 2/7 on System B
  // (SPOILER B switch) — AMM 27, Sec B. Ground spoilers 1/4/5/8 are powered
  // only by System A and are interlocked out whenever the airplane is
  // airborne (no weight-on-wheels), regardless of switch position.
  const flightSpoilerA = a && s.spoilerA;
  const flightSpoilerB = b && s.spoilerB;
  const gndSpoilerLocked = !(s.wow && d.hydA > 1500);
  // Flight spoiler lateral-control inputs come from the corresponding
  // up-aileron side; hydraulic availability then gates each individual
  // actuator: 3/6 = System A, 2/7 = System B.
  const spoiler3 = surface.spoilerL * (flightSpoilerA ? 1 : 0);
  const spoiler6 = surface.spoilerR * (flightSpoilerA ? 1 : 0);
  const spoiler2 = surface.spoilerL * (flightSpoilerB ? 1 : 0);
  const spoiler7 = surface.spoilerR * (flightSpoilerB ? 1 : 0);
  const gndDeploy = gndSpoilerLocked ? 0 : surface.spoiler;
  const teFlapFrac = s.flapPos / 40;
  const leDriveAvailable = d.leDriveAvailable;
  const leExtended = d.leExtended;
  const leTransit = d.leTransit;
  // Flap position gauge geometry
  const gCx = 555;
  const gCy = 300;
  const gR = 46;
  const dialPoints = Array.from({ length: 25 }, (_, i) => {
    const p = polar(gCx, gCy, gR, 150 - i * 5);
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }).join(" ");
  const flapTicks = [0, 1, 2, 5, 10, 15, 25, 30, 40];
  const needleAngle = flapAngle(s.flapPos);
  const needleTip = polar(gCx, gCy, gR - 9, needleAngle);
  return (
    <div className="rounded-lg border border-border bg-[#090b0e] p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <span className="font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-fg">Flight controls — component view</span>
          <p className="mt-0.5 text-[9px] text-subtle">Control input → PCU → hydraulic source → surface</p>
        </div>
        <span className="rounded border border-border px-2 py-1 font-mono text-[8px] uppercase text-subtle">A/B + STBY RUD</span>
      </div>
      <div className="rounded-md border border-[#39414b] bg-[radial-gradient(circle_at_50%_45%,#303842_0,#12161b_55%,#080a0d_100%)] p-2">
        <svg viewBox="0 0 640 425" className="w-full" role="img" aria-label="Animated flight control surface diagram — ailerons stay in place and change color for up/down deflection, the elevator moves up and down, the tail rudder bar swings left to right about its hinge, eight upper-wing spoiler panels narrow and brighten as they deploy with the four ground-only panels hatched and locked out whenever the airplane is airborne, trailing edge flap segments shift aft and turn amber as they extend, leading edge flap and slat panels turn blue when extended, amber while in transit, or hatched when their hydraulic drive is unavailable, and a dial gauge shows actual trailing edge flap position with a light beside it for leading edge flap and slat transit">
          <defs>
            <linearGradient id="wingMetal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#66727e"/><stop offset="1" stopColor="#252b32"/></linearGradient>
            <pattern id="gndLock" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
              <rect width="6" height="6" fill="#2c3138"/>
              <line x1="0" y1="0" x2="0" y2="6" stroke="#4a525c" strokeWidth="2"/>
            </pattern>
          </defs>
          <path d="M320 50 C302 68 298 92 298 115 L298 300 C298 324 308 338 320 344 C332 338 342 324 342 300 L342 115 C342 92 338 68 320 50 Z" fill="url(#wingMetal)" stroke="#7d8995" strokeWidth="2"/>
          <path d="M298 140 L55 195 L100 222 L298 205 Z" fill="url(#wingMetal)" stroke="#7d8995" strokeWidth="2"/>
          <path d="M342 140 L585 195 L540 222 L342 205 Z" fill="url(#wingMetal)" stroke="#7d8995" strokeWidth="2"/>
          <path d="M298 305 L195 322 L215 336 L298 335 Z" fill="#2e353d" stroke="#7d8995" strokeWidth="2"/>
          <path d="M342 305 L445 322 L425 336 L342 335 Z" fill="#2e353d" stroke="#7d8995" strokeWidth="2"/>
          <TravelGuide x={248} y1={307} y2={354} />
          <TravelGuide x={392} y1={307} y2={354} />
          <AileronPanel x={108} y={206} w={95} h={15} value={surface.aileronL} chevronX={100} />
          <AileronPanel x={437} y={206} w={95} h={15} value={surface.aileronR} chevronX={540} />
          {/* Upper-wing spoiler panels, outboard (near aileron) to inboard (near root) each side */}
          <SpoilerPanel x={205} y={190} w={18} h={12} deploy={gndDeploy} locked={gndSpoilerLocked} />
          <SpoilerPanel x={229} y={190} w={18} h={12} deploy={spoiler2} locked={false} />
          <SpoilerPanel x={253} y={190} w={18} h={12} deploy={spoiler3} locked={false} />
          <SpoilerPanel x={277} y={190} w={18} h={12} deploy={gndDeploy} locked={gndSpoilerLocked} />
          <SpoilerPanel x={345} y={190} w={18} h={12} deploy={gndDeploy} locked={gndSpoilerLocked} />
          <SpoilerPanel x={369} y={190} w={18} h={12} deploy={spoiler6} locked={false} />
          <SpoilerPanel x={393} y={190} w={18} h={12} deploy={spoiler7} locked={false} />
          <SpoilerPanel x={417} y={190} w={18} h={12} deploy={gndDeploy} locked={gndSpoilerLocked} />
          <text x="250" y="183" textAnchor="middle" fill="#6d7884" fontSize="7">SPLR 1·2·3·4</text>
          <text x="390" y="183" textAnchor="middle" fill="#6d7884" fontSize="7">SPLR 5·6·7·8</text>
          {/* Trailing edge flaps: outboard (nearer aileron) + inboard (nearer root) segments per side, same flapPos value */}
          <FlapPanel x={205} y={206} w={43} h={15} frac={teFlapFrac} />
          <FlapPanel x={252} y={206} w={43} h={15} frac={teFlapFrac} />
          <FlapPanel x={392} y={206} w={43} h={15} frac={teFlapFrac} />
          <FlapPanel x={345} y={206} w={43} h={15} frac={teFlapFrac} />
          {/* Leading edge devices: parallelogram strips run parallel to the wing's actual leading-edge sweep (298,140)→(55,195) mirrored, offset 11px aft — outboard slats ahead of the aileron, inboard flaps ahead of the spoilers */}
          <LeDeviceStrip points="108,183 203,161.5 203,172.5 108,194" driveAvailable={leDriveAvailable} extended={leExtended} transit={leTransit} />
          <LeDeviceStrip points="205,161.05 295,140.68 295,151.68 205,172.05" driveAvailable={leDriveAvailable} extended={leExtended} transit={leTransit} />
          <LeDeviceStrip points="532,183 437,161.5 437,172.5 532,194" driveAvailable={leDriveAvailable} extended={leExtended} transit={leTransit} />
          <LeDeviceStrip points="435,161.05 345,140.68 345,151.68 435,172.05" driveAvailable={leDriveAvailable} extended={leExtended} transit={leTransit} />
          <DeflectionSurface x={200} y={324} w={95} h={13} value={surface.elevator} amp={ELEV_AMP} chevronX={193} />
          <DeflectionSurface x={345} y={324} w={95} h={13} value={surface.elevator} amp={ELEV_AMP} chevronX={447} />
          <line x1="320" y1="90" x2="320" y2="222" stroke="#6d7884" strokeWidth="1.5" strokeDasharray="4 4"/>
          <g>
            <rect x="258" y="222" width="124" height="18" rx="5" fill="#20262d" stroke="#7c8794"/>
            <text x="320" y="234" textAnchor="middle" fill="#b8c0c8" fontSize="10">FLIGHT CONTROL PCUs</text>
            <circle cx="320" cy="256" r="8" fill={a ? "#477b63" : "#343c45"} stroke="#9ba6b2"/>
            <text x="336" y="260" fill="#aeb7c0" fontSize="10">A</text>
            <circle cx="320" cy="272" r="8" fill={b ? "#477b63" : "#343c45"} stroke="#9ba6b2"/>
            <text x="336" y="276" fill="#aeb7c0" fontSize="10">B</text>
            <circle cx="320" cy="288" r="8" fill={rud ? "#477b63" : "#343c45"} stroke="#9ba6b2"/>
            <text x="336" y="292" fill="#aeb7c0" fontSize="10">STBY RUD</text>
          </g>
          {/* Tail fin (fixed) + rudder bar — hinged at the fin top, swings like a pendulum */}
          <line x1="320" y1="344" x2="320" y2="355" stroke="#7d8995" strokeWidth="7" strokeLinecap="round"/>
          <path d="M310 344 L330 344 L320 355 Z" fill="url(#wingMetal)" stroke="#7d8995" strokeWidth="1.5"/>
          <TravelGuideX y={393} x1={295} x2={345} />
          <RudderBar hingeX={320} hingeY={355} length={35} value={surface.rudder} angle={32} />
          <text x="280" y="398" textAnchor="middle" fill="#6d7884" fontSize="7">◀ L</text>
          <text x="360" y="398" textAnchor="middle" fill="#6d7884" fontSize="7">R ▶</text>
          <text x="320" y="412" textAnchor="middle" fill="#aeb7c0" fontSize="10">RUDDER</text>
          {/* Color/direction key, replacing the old side-view inset */}
          <rect x="480" y="45" width="150" height="135" rx="6" fill="#12161b" stroke="#39414b"/>
          <text x="555" y="58" textAnchor="middle" fill="#9ba6b2" fontSize="9">SURFACE KEY</text>
          <circle cx="497" cy="73" r="5" fill="#5fae8f" stroke="#9fd9c2"/>
          <text x="508" y="76" fill="#aeb7c0" fontSize="7.5">TE UP · RUDDER RIGHT</text>
          <circle cx="497" cy="90" r="5" fill="#c9903f" stroke="#e2b877"/>
          <text x="508" y="93" fill="#aeb7c0" fontSize="7.5">TE DOWN · RUDDER LEFT</text>
          <circle cx="497" cy="107" r="5" fill="#454f5a" stroke="#98a3ae"/>
          <text x="508" y="110" fill="#aeb7c0" fontSize="7.5">NEUTRAL</text>
          <rect x="492" y="119" width="10" height="8" rx="1.5" fill="#5fae8f" stroke="#9fd9c2"/>
          <text x="508" y="126" fill="#aeb7c0" fontSize="7.5">SPOILER EXTENDED</text>
          <rect x="492" y="136" width="10" height="8" rx="1.5" fill="#4fa8d8" stroke="#8ccbe8"/>
          <text x="508" y="143" fill="#aeb7c0" fontSize="7.5">LE DEVICES EXTENDED</text>
          <rect x="492" y="153" width="10" height="8" rx="1.5" fill="url(#gndLock)" stroke="#5a636d"/>
          <text x="508" y="160" fill="#aeb7c0" fontSize="7.5">LOCKED (NO DRIVE/AIR)</text>
          <g fill="#aeb7c0" fontSize="10">
            <text x="10" y="190">LEFT AILERON</text><line x1="85" y1="187" x2="112" y2="210" stroke="#6d7884"/>
            <text x="504" y="190">RIGHT AILERON</text><line x1="500" y1="187" x2="528" y2="210" stroke="#6d7884"/>
            <text x="286" y="366">ELEVATOR</text>
            <text x="260" y="78">CONTROL CABLE / INPUT</text>
          </g>
          {/* Flap position gauge: single needle over a 120° display arc, with the
              737-200 flap-unit detents shown as labels — actual position only, no
              separate lever readback. LE FLAPS/SLATS have no continuous position
              on the real airplane either, just a transit light. */}
          <g>
            <text x={gCx} y={gCy - gR - 14} textAnchor="middle" fill="#9ba6b2" fontSize="8">FLAP POSITION</text>
            <polyline points={dialPoints} fill="none" stroke="#4a525c" strokeWidth="2"/>
            {flapTicks.map((v) => {
              const ang = flapAngle(v);
              const outer = polar(gCx, gCy, gR, ang);
              const inner = polar(gCx, gCy, gR - 7, ang);
              const label = polar(gCx, gCy, gR + 11, ang);
              return (
                <g key={v}>
                  <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="#8a95a1" strokeWidth="1.5"/>
                  <text x={label.x} y={label.y + 3} textAnchor="middle" fill="#8a95a1" fontSize="7">{v === 0 ? "UP" : v}</text>
                </g>
              );
            })}
            <line x1={gCx} y1={gCy} x2={needleTip.x} y2={needleTip.y} stroke="#e8eef2" strokeWidth="2.25" strokeLinecap="round"/>
            <circle cx={gCx} cy={gCy} r="4.5" fill="#20262d" stroke="#8a95a1" strokeWidth="1.25"/>
            <circle
              cx={gCx}
              cy={gCy + 34}
              r="6"
              fill={!leDriveAvailable ? "url(#gndLock)" : leExtended ? "#4fa8d8" : leTransit ? "#c9903f" : "#2c333b"}
              stroke={!leDriveAvailable ? "#5a636d" : leExtended ? "#8ccbe8" : leTransit ? "#e2b877" : "#7d8995"}
              strokeWidth="1.25"
            >
              {leTransit && <animate attributeName="opacity" values="1;0.35;1" dur="0.9s" repeatCount="indefinite" />}
            </circle>
            <text x={gCx + 12} y={gCy + 37} fill="#aeb7c0" fontSize="7">LE FLAPS</text>
          </g>
        </svg>
      </div>
      <div className={aside ? "mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] items-start gap-2" : undefined}>
      <div className={aside ? "grid grid-cols-1 gap-1.5 font-mono text-[8px] uppercase" : "mt-2 grid grid-cols-2 gap-2 font-mono text-[8px] uppercase"}>
        <ComponentReadout label="ELEVATOR" value={`${(surface.elevator * 100).toFixed(0)}%${dirWord(surface.elevator)}`} />
        <ComponentReadout label="RUDDER" value={`${(surface.rudder * 100).toFixed(0)}% ${surface.rudder > 0.04 ? "(RIGHT)" : surface.rudder < -0.04 ? "(LEFT)" : ""}`} />
        <ComponentReadout label="AILERON L / R" value={`${(surface.aileronL * 100).toFixed(0)}${dirWord(surface.aileronL)} / ${(surface.aileronR * 100).toFixed(0)}${dirWord(surface.aileronR)}`} />
        <ComponentReadout label="FLT SPOILERS" value={`${(Math.max(spoiler2, spoiler3) * 100).toFixed(0)}%`} />
        <ComponentReadout
          label="GND SPOILERS"
          value={gndSpoilerLocked ? (s.wow ? "LOCKED (NO HYD A)" : "LOCKED (AIRBORNE)") : gndDeploy > 0.04 ? `${(gndDeploy * 100).toFixed(0)}% DEPLOYED` : "STOWED"}
        />
        <ComponentReadout label="HYD A" value={a ? "PCUs PRESSURIZED" : "LOW / OFF"} />
        <ComponentReadout label="HYD B" value={b ? "PCUs PRESSURIZED" : "LOW / OFF"} />
      </div>
      {aside ? <div className="min-w-0">{aside}</div> : null}
      </div>
    </div>
  );
}
function ComponentReadout({ label, value }: { label: string; value: string }) {
  return <div className="rounded border border-border bg-inset px-2 py-1.5"><div className="text-subtle">{label}</div><div className="mt-0.5 text-fg">{value}</div></div>;
}

function WheelDynamics({ d }: { d: ReturnType<typeof useDerived> }) {
  const wheels = [
    ["LI", d.wheelSpeeds.li, d.wheelBrakePressures.li],
    ["LO", d.wheelSpeeds.lo, d.wheelBrakePressures.lo],
    ["RI", d.wheelSpeeds.ri, d.wheelBrakePressures.ri],
    ["RO", d.wheelSpeeds.ro, d.wheelBrakePressures.ro],
  ] as const;
  return (
    <div className="rounded-lg border border-border bg-inset p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-fg">Main gear wheels</span>
        <span className="font-mono text-[9px] text-subtle">ANTI-SKID / BRAKE</span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {wheels.map(([label, speed, pressure]) => {
          const rotation = speed * 5;
          return (
            <div key={label} className="rounded-md border border-border bg-panel p-2 text-center">
              <div className="mx-auto flex size-11 items-center justify-center rounded-full border-4 border-[#66707a] bg-[#121519] shadow-inner">
                <div className="relative size-7 rounded-full border border-fg/30" style={{ animation: speed > 1 ? "spin 0.5s linear infinite" : "none", animationDuration: `${Math.max(0.08, 45 / Math.max(speed, 1))}s` }}>
                  <div className="absolute left-1/2 top-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded bg-fg/70" style={{ transform: `translate(-50%, -50%) rotate(${rotation}deg)` }} />
                  <div className="absolute left-1/2 top-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 rotate-90 rounded bg-fg/70" />
                </div>
              </div>
              <div className="mt-1 font-mono text-[9px] font-semibold text-fg">{label}</div>
              <div className="font-mono text-[8px] text-subtle">{speed.toFixed(0)} KT</div>
              <div className="font-mono text-[8px] text-subtle">{pressure.toFixed(0)} PSI</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function BrakeWheelPanel() {
  const d = useDerived();
  return (
    <div className="grid w-full gap-3 md:grid-cols-[1.15fr_1fr]">
      <WheelDynamics d={d} />
      <div className="rounded-lg border border-border bg-inset p-3 font-mono text-[9px] uppercase">
        <div className="grid grid-cols-2 gap-2">
          <span>GROUND SPEED</span><span className="text-right text-fg">{Number(d.wheelSpeeds?.li ?? 0).toFixed(0)} KT</span>
          <span>TARGET DECEL</span><span className="text-right text-fg">{Number(d.targetDecel ?? 0).toFixed(0)} /s</span>
          <span>ACTUAL DECEL</span><span className="text-right text-fg">{Number(d.actualDecel ?? 0).toFixed(1)} /s</span>
          <span>AB PRESS CMD</span><span className="text-right text-fg">{Math.round(d.autobrakePressure)} PSI</span>
          <span>MANUAL OVERRIDE</span><span className={d.manualBrakeOverride ? "text-right text-warn" : "text-right text-subtle"}>{d.manualBrakeOverride ? "YES" : "NO"}</span>
          <span>A/S MODULATION</span><span className={d.antiskidModulating ? "text-right text-ok" : "text-right text-subtle"}>{d.antiskidModulating ? "ACTIVE" : "STANDBY"}</span>
          <span>NOSE STEERING</span><span className="text-right text-fg">{Number(d.noseWheelSteeringAngle ?? 0).toFixed(0)}°</span>
          <span>BRAKE SOURCES</span><span className="text-right text-subtle">LI {d.brakeSource.li} · LO {d.brakeSource.lo} · RI {d.brakeSource.ri} · RO {d.brakeSource.ro}</span>
        </div>
        <p className="mt-2 leading-relaxed text-subtle">Wheel speeds and pressure modulation are a training visualization of the antiskid/autobrake relationship.</p>
      </div>
    </div>
  );
}

export function BrakeModule() {
  const s = useSimPick("antiskidInbd", "antiskidOutbd", "autobrake", "leftBrakePedal", "patch", "rightBrakePedal");
  const d = useDerivedPick("antiskidModulating", "antiskidOperational", "autobrakeActive", "autobrakeArmed", "autobrakeDisarm", "autobrakePressure", "autobrakeTestPassed");
  return (
    <Module title="Brakes / antiskid · P2-2">
      <Rocker label="INBD A/S" on={s.antiskidInbd} onChange={(v) => s.patch({ antiskidInbd: v }, v ? "Inboard antiskid ON." : "Inboard antiskid OFF — autobrake unavailable.")} />
      <Rocker label="OUTBD A/S" on={s.antiskidOutbd} onChange={(v) => s.patch({ antiskidOutbd: v }, v ? "Outboard antiskid ON." : "Outboard antiskid OFF — autobrake unavailable.")} />
      <Rotary
        label="AUTOBRAKE"
        value={String(s.autobrake)}
        // The 737-200 AUTOBRAKE selector is a five-position rotary.
        // RTO is selected counterclockwise from OFF; MIN/MED/MAX are
        // the landing-autobrake positions clockwise from OFF.
        options={[
          { id: "4", label: "RTO" },
          { id: "0", label: "OFF" },
          { id: "1", label: "MIN" },
          { id: "2", label: "MED" },
          { id: "3", label: "MAX" },
        ]}
        onChange={(id) => s.patch({ autobrake: Number(id) as 0 | 1 | 2 | 3 | 4, autobrakeTestTimer: 0, autobrakeRtoArmed: false }, `AUTOBRAKE selector ${["OFF", "MIN", "MED", "MAX", "RTO"][Number(id)]}.`)}
      />
      <div className="grid w-full grid-cols-2 gap-2">
        <CaptionLight label="A/S INBD" on={d.antiskidOperational && s.antiskidInbd} tone="ok" />
        <CaptionLight label="A/S OUTBD" on={d.antiskidOperational && s.antiskidOutbd} tone="ok" />
        <CaptionLight label="AUTOBRAKE DISARM" on={d.autobrakeDisarm} tone="warn" />
        <CaptionLight label="AUTOBRAKE ACTIVE" on={d.autobrakeActive} tone="caution" />
      </div>
      <div className="w-full rounded-md border border-border bg-inset p-2 text-[9px] leading-relaxed text-subtle">
        <div className="grid grid-cols-2 gap-2 font-mono uppercase">
          <span>TEST {d.autobrakeTestPassed ? "PASS" : "WAIT"}</span>
          <span>STATUS {d.autobrakeArmed ? "ARMED" : d.autobrakeActive ? "ACTIVE" : "OFF"}</span>
          <span>BRAKE CMD {Math.round(d.autobrakePressure)} PSI</span>
          <span>A/S {d.antiskidModulating ? "IN PATH" : "STANDBY"}</span>
        </div>
        <p className="mt-1">AUTOBRAKE pressure is routed through the antiskid valves. Either antiskid channel OFF/faulted removes automatic braking.</p>
      </div>
      <div className="grid w-full grid-cols-2 gap-2">
        <ControlSlider label="L BRAKE PEDAL" value={s.leftBrakePedal} onChange={(v) => s.patch({ leftBrakePedal: v })} min={0} max={1} step={0.01} />
        <ControlSlider label="R BRAKE PEDAL" value={s.rightBrakePedal} onChange={(v) => s.patch({ rightBrakePedal: v })} min={0} max={1} step={0.01} />
      </div>
      <BrakeWheelPanel />
    </Module>
  );
}


export function FireModule() {
  const s = useSimPick("apuFirePulled", "engine1FirePulled", "engine2FirePulled", "faults", "fireBottleLDischarged", "fireBottleRDischarged", "patch");
  const d = useDerivedPick("apuFireWarn", "engine1FireWarn", "engine2FireWarn");
  const pullEngine = (engine: 1 | 2) => {
    const pulled = engine === 1 ? s.engine1FirePulled : s.engine2FirePulled;
    const detected = engine === 1 ? s.faults.engineFire1 : s.faults.engineFire2;
    if (!pulled && !detected) return;
    if (engine === 1) {
      s.patch({ engine1FirePulled: !pulled }, pulled ? "ENG 1 FIRE handle reset." : "ENG 1 FIRE handle pulled — engine fuel, bleed, generator and engine hydraulic pump isolated.");
    } else {
      s.patch({ engine2FirePulled: !pulled }, pulled ? "ENG 2 FIRE handle reset." : "ENG 2 FIRE handle pulled — engine fuel, bleed, generator and engine hydraulic pump isolated.");
    }
  };
  const dischargeEngine = (engine: 1 | 2, bottle: "L" | "R") => {
    const pulled = engine === 1 ? s.engine1FirePulled : s.engine2FirePulled;
    const already = bottle === "L" ? s.fireBottleLDischarged : s.fireBottleRDischarged;
    if (!pulled || already) return;
    const faults = engine === 1 ? { engineFire1: false } : { engineFire2: false };
    s.patch(
      bottle === "L" ? { fireBottleLDischarged: true, faults } : { fireBottleRDischarged: true, faults },
      `ENG ${engine} fire handle rotated ${bottle === "L" ? "LEFT" : "RIGHT"} — bottle ${bottle} discharged.`,
    );
  };
  return (
    <Module title="Fire protection · P8 center pedestal">
      <FireHandle label="ENG 1 FIRE" pulled={s.engine1FirePulled} onToggle={() => pullEngine(1)} onRotate={(dir) => dischargeEngine(1, dir)} />
      <FireHandle label="ENG 2 FIRE" pulled={s.engine2FirePulled} onToggle={() => pullEngine(2)} onRotate={(dir) => dischargeEngine(2, dir)} />
      <FireHandle label="APU FIRE" pulled={s.apuFirePulled} onToggle={() => s.patch({ apuFirePulled: !s.apuFirePulled })} />
      <div className="grid w-full grid-cols-3 gap-2 pt-1">
        <CaptionLight label="ENG 1 FIRE" on={d.engine1FireWarn} tone="warn" />
        <CaptionLight label="ENG 2 FIRE" on={d.engine2FireWarn} tone="warn" />
        <CaptionLight label="APU FIRE" on={d.apuFireWarn} tone="warn" />
      </div>
      <div className="w-full rounded-md border border-border bg-inset p-2 text-[9px] leading-relaxed text-subtle">Pull the red handle to isolate the engine and arm extinguishing. While pulled, use the <span className="font-bold text-fg">L / R</span> buttons beside the handle to rotate it and discharge the corresponding bottle.</div>
      <div className="grid w-full grid-cols-2 gap-2">
        <CaptionLight label="BOTTLE L DISCH" on={s.fireBottleLDischarged} tone="caution" />
        <CaptionLight label="BOTTLE R DISCH" on={s.fireBottleRDischarged} tone="caution" />
      </div>
      <button className="w-full rounded-md border border-border bg-inset px-2 py-1.5 text-[9px] font-display uppercase tracking-wider disabled:opacity-40" disabled={!s.apuFirePulled} onClick={() => s.patch({ apuBottleFired: true, faults: { apuFireDetected: false } }, "APU fire bottle discharged — simulated extinguishing agent release.")}>APU BOTTLE DISCHARGE</button>
    </Module>
  );
}

export function ScenarioModule() {
  const s = useSimPick("adverseYawScenario", "runScenario");
  const d = useDerivedPick("adverseYawCorrected", "adverseYawCue", "adverseYawDirection");
  return (
    <Module title="Scenarios · training console">
      <div className="grid w-full grid-cols-1 gap-2">
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase tracking-wider" onClick={() => s.runScenario("TR3_BACKUP")}>TR 1 FAILURE → TR 3 BACKUP</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase tracking-wider" onClick={() => s.runScenario("ALT_FLAP_ALTERNATE")}>TE FLAP HYD MOTOR FAILURE → ALT POWER</button>
        <button className="rounded-md border border-ok/40 bg-ok/10 px-2 py-2 text-[10px] font-display uppercase tracking-wider" onClick={() => s.runScenario("AUTOBRAKE_ANTISKID")}>ANTISKID + AUTOBRAKE LANDING TEST</button>
        <button className="rounded-md border border-accent/40 bg-accent/10 px-2 py-2 text-[10px] font-display uppercase tracking-wider" onClick={() => s.runScenario("ADVERSE_YAW")}>ADVERSE YAW — COORDINATED TURN</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase tracking-wider" onClick={() => s.runScenario("AUTOBRAKE_RTO")}>RTO — 105 KT REJECT</button>
      </div>
      <div className="w-full rounded-md border border-accent/30 bg-accent/5 p-2 font-mono text-[9px] uppercase">
        <div>ADVERSE YAW CUE: {s.adverseYawScenario ? `${Math.round(d.adverseYawCue * 100)}% ${d.adverseYawDirection}` : "OFF"}</div>
        {s.adverseYawScenario && <div className={d.adverseYawCorrected ? "text-ok" : "text-subtle"}>{d.adverseYawCorrected ? "COORDINATED — CUE REDUCED" : "ADD RUDDER IN TURN DIRECTION"}</div>}
      </div>
      <p className="w-full text-[10px] leading-relaxed text-subtle">The scenarios inject the failure and establish the required training power source. The response still uses the real cockpit controls: ALT FLAPS must be armed, then the alternate position switch must be commanded.</p>
    </Module>
  );
}

export function FaultModule() {
  const s = useSimPick("clearLandingGearFault", "fuelCenterPumpAutoShutoffInstalled", "injectLandingGearFault", "landingGearFault", "patch", "toggleFault");
  return (
    <Module title="Fault injection · training">
      <div className="grid w-full grid-cols-2 gap-2">
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("engineFire1")}>Engine 1 fire</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("engineFire2")}>Engine 2 fire</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("apuFireDetected")}>APU fire</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("hydALeak")}>HYD A failure</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("hydBLeak")}>HYD B failure</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("fuelTank1FwdPumpFail")}>TANK 1 FWD pump fault</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("fuelTank1AftPumpFail")}>TANK 1 AFT pump fault</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("fuelTank2FwdPumpFail")}>TANK 2 FWD pump fault</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("fuelTank2AftPumpFail")}>TANK 2 AFT pump fault</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("fuelCenterPump1Fail")}>CTR LEFT pump fault</button>
        <button className="rounded-md border border-border px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.patch({ fuelCenterPumpAutoShutoffInstalled: !s.fuelCenterPumpAutoShutoffInstalled, fuelCenterPump1RelayTripped: false, fuelCenterPump2RelayTripped: false, fuelCenterPump1LowPressureTimer: 0, fuelCenterPump2LowPressureTimer: 0 })}>CENTER PUMP AUTO-SHUTOFF · {s.fuelCenterPumpAutoShutoffInstalled ? "POST-SB 28A1228" : "PRE-SB"}</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("flapAsymmetry")}>TE FLAP ASYMMETRY FAULT</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("fuelCenterPump2Fail")}>CTR RIGHT pump fault</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("tr1Failure")}>TR 1 failure</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("tr2Failure")}>TR 2 failure</button>
        <button className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("generator1Failure")}>GEN 1 failure → XFER</button>
        <button className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("generator2Failure")}>GEN 2 failure → XFER</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("transferRelay1Failure")}>XFR 1 relay failure</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("transferRelay2Failure")}>XFR 2 relay failure</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("btb1Failure")}>BTB 1 failure</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("btb2Failure")}>BTB 2 failure</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("apuGeneratorBreakerFailure")}>APU GB failure</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("apuOverspeed")}>APU overspeed</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("apuLowOilPressure")}>APU low oil</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("apuHighOilTemperature")}>APU high oil temp</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("externalPowerContactorFailure")}>EPC failure</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("openPhase1")}>GEN 1 open phase</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("openPhase2")}>GEN 2 open phase</button>
        <button className="rounded-md border border-red-500/30 bg-red-500/5 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("generator1OverFrequency")}>GEN 1 overfreq 425–435 Hz</button>
        <button className="rounded-md border border-red-500/30 bg-red-500/5 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("generator1UnderFrequency")}>GEN 1 underfreq 360–370 Hz</button>
        <button className="rounded-md border border-red-500/30 bg-red-500/5 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("generator1OverVoltage")}>GEN 1 overvoltage</button>
        <button className="rounded-md border border-red-500/30 bg-red-500/5 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("generator1UnderVoltage")}>GEN 1 undervoltage</button>
        <button className="rounded-md border border-red-500/30 bg-red-500/5 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("generator1OverCurrent")}>GEN 1 overcurrent</button>
        <button className="rounded-md border border-red-500/30 bg-red-500/5 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("generator1Differential")}>GEN 1 differential</button>
        <button className="rounded-md border border-red-500/30 bg-red-500/5 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("generator2OverFrequency")}>GEN 2 overfreq 425–435 Hz</button>
        <button className="rounded-md border border-red-500/30 bg-red-500/5 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("generator2UnderFrequency")}>GEN 2 underfreq 360–370 Hz</button>
        <button className="rounded-md border border-red-500/30 bg-red-500/5 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("generator2OverVoltage")}>GEN 2 overvoltage</button>
        <button className="rounded-md border border-red-500/30 bg-red-500/5 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("generator2UnderVoltage")}>GEN 2 undervoltage</button>
        <button className="rounded-md border border-red-500/30 bg-red-500/5 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("generator2OverCurrent")}>GEN 2 overcurrent</button>
        <button className="rounded-md border border-red-500/30 bg-red-500/5 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("generator2Differential")}>GEN 2 differential</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("tr3Failure")}>TR 3 failure</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("batteryFailure")}>Battery failure</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("staticInverterFailure")}>Static inverter failure</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("teFlapHydMotorFail")}>TE flap hyd motor</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("antiskidInop")}>Antiskid fault (both)</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("antiskidInbdInop")}>Antiskid inboard channel</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("antiskidOutbdInop")}>Antiskid outboard channel</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("genDriveDisconnectFailure1")}>GEN DRIVE 1 DISC fail</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("genDriveDisconnectFailure2")}>GEN DRIVE 2 DISC fail</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("genDriveOilPressureLow1")}>GEN DRIVE 1 low oil</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("genDriveOilPressureLow2")}>GEN DRIVE 2 low oil</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("genDriveOilOverheat1")}>GEN DRIVE 1 oil hot</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("genDriveOilOverheat2")}>GEN DRIVE 2 oil hot</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("recircFanFailure")}>Recirc fan failed</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("mixValveJamL")}>Left mix valve jam</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("mixValveJamR")}>Right mix valve jam</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("yawDamperFailure")}>Yaw damper failed</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("equipmentCoolingFailure")}>Equipment cooling failed</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("oxygenSystemFailure")}>Oxygen system failure</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("doorWarningFailure")}>Door warning failed</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("rainRepellentFailure")}>Rain repellent failed</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("fuelHeatFailure")}>Engine 1 fuel heater failed</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("fuelFilterIcingFault1")}>Engine 1 fuel filter icing</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("fuelFilterIcingFault2")}>Engine 2 fuel filter icing</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("fuelHeatFailure2")}>Fuel heater 2 failed</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("windowHeatFailureL")}>Left window heat failed</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("windowHeatFailureR")}>Right window heat failed</button>
        <button className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("cvrFailure")}>CVR failure</button>
        <button className="rounded-md border border-border bg-inset px-2 py-2 text-[10px] font-display uppercase" onClick={() => s.toggleFault("apuDoorJam")}>APU door jam</button>
      </div>
      <p className="mt-2 w-full text-[9px] leading-relaxed text-subtle">Electrical transfer tests: fail GEN 1/2 to observe automatic XFR BUS transfer; fail XFR relay to block the transfer; fail BTB/EPC/APU GB to test alternate source isolation. Open-phase faults represent the manual's three-phase fault condition. TR 3, battery and static-inverter faults test DC/standby backup paths.</p>
      <div className="mt-2 rounded-md border border-red-500/30 bg-red-950/10 p-2">
        <div className="mb-1 text-[9px] font-display uppercase tracking-[0.12em] text-red-200">Landing gear position fault</div>
        <div className="grid grid-cols-2 gap-2">
          <button
            className="rounded-md border border-warn/40 bg-warn/10 px-2 py-2 text-[10px] font-display uppercase disabled:cursor-not-allowed disabled:opacity-50"
            disabled={s.landingGearFault !== "NONE"}
            onClick={() => s.injectLandingGearFault()}
          >
            Inject random gear fault
          </button>
          <button
            className="rounded-md border border-border bg-inset px-2 py-2 text-[10px] font-display uppercase disabled:cursor-not-allowed disabled:opacity-50"
            disabled={s.landingGearFault === "NONE"}
            onClick={() => s.clearLandingGearFault()}
          >
            Clear gear fault
          </button>
        </div>
        <div className="mt-2 rounded border border-border bg-inset px-2 py-1.5 font-mono text-[8px] uppercase text-subtle">
          Active: {s.landingGearFault === "NONE" ? "NONE" : s.landingGearFault === "NOSE" ? "NOSE GEAR" : s.landingGearFault === "LEFT_MAIN" ? "LEFT MAIN GEAR" : "RIGHT MAIN GEAR"}
        </div>
        <p className="mt-1 text-[9px] leading-relaxed text-subtle">Each injection randomly selects one gear and holds it from extending while the selector is DN, creating a stable selector / position disagreement. A new injection is available after the current fault is cleared.</p>
      </div>
      <p className="w-full text-[10px] leading-relaxed text-subtle">HYD A failure → standby hydraulic pressure can power the standby rudder/leading-edge system when AC power is available and STBY HYD is AUTO/ON. Trailing-edge flaps use the alternate electric drive when ALTERNATE FLAPS is armed.</p>
    </Module>
  );
}

function gearIndications(s: ReturnType<typeof useSim>, d: ReturnType<typeof useDerived>) {
  const powered = d.dcPower || d.acPower;
  return {
    // UP-and-locked has no dedicated illuminated cockpit annunciator.
    transit: powered && d.gearTransit,
    downLocked: powered && d.gearDown,
  };
}

export function ElectricalDistribution() {
  const s = useSimPick("battery");
  const d = useDerivedPick("acPower", "dcBus1Powered", "dcBus2Powered", "electricalSource1", "electricalSource2", "electricalUsers", "generator1BusPowered", "generator2BusPowered", "tr1Powered", "tr2Powered", "tr3Powered", "transferBus1Powered", "transferBus2Powered");
  return (
    <Module title="Electrical power distribution · source → bus → user">
      <div className="grid w-full grid-cols-2 gap-2 text-[9px] font-mono uppercase tracking-wide sm:grid-cols-4">
        <CaptionLight label={`GEN 1 ${d.generator1BusPowered ? "BUS" : "OFF"}`} on={d.generator1BusPowered} tone="elec" />
        <CaptionLight label={`GEN 2 ${d.generator2BusPowered ? "BUS" : "OFF"}`} on={d.generator2BusPowered} tone="elec" />
        <CaptionLight label={`XFER 1 ${d.transferBus1Powered ? d.electricalSource1 : "OFF"}`} on={d.transferBus1Powered} tone="elec" />
        <CaptionLight label={`XFER 2 ${d.transferBus2Powered ? d.electricalSource2 : "OFF"}`} on={d.transferBus2Powered} tone="elec" />
      </div>
      <div className="grid w-full grid-cols-3 gap-2">
        <CaptionLight label="TR 1" on={d.tr1Powered} tone="elec" />
        <CaptionLight label="TR 2" on={d.tr2Powered} tone="elec" />
        <CaptionLight label="TR 3 BACKUP" on={d.tr3Powered} tone="elec" />
      </div>
      <div className="grid w-full grid-cols-2 gap-2 rounded-md border border-border bg-inset p-2 font-mono text-[9px] uppercase">
        <div><span className="text-subtle">DC BUS 1</span><div>{d.dcBus1Powered ? "POWERED" : "OFF"}</div></div>
        <div><span className="text-subtle">DC BUS 2</span><div>{d.dcBus2Powered ? "POWERED" : "OFF"}</div></div>
        <div><span className="text-subtle">BATTERY</span><div>{s.battery ? "ON" : "OFF"}</div></div>
        <div><span className="text-subtle">AC SOURCE</span><div>{d.acPower ? [d.electricalSource1, d.electricalSource2].filter((v, i, a) => v !== "NONE" && a.indexOf(v) === i).join(" / ") : "NONE"}</div></div>
      </div>
      <div className="grid w-full gap-1">
        {d.electricalUsers.map((u) => (
          <div key={u.id} className={`grid grid-cols-[1.45fr_.55fr_.7fr] gap-2 rounded border px-2 py-1 ${u.powered ? "border-ok/40 bg-ok/5" : "border-border bg-inset"}`}>
            <span className="text-[9px] uppercase tracking-wide">{u.label}</span>
            <span className={u.powered ? "font-mono text-ok" : "font-mono text-subtle"}>{u.powered ? "POWERED" : "OFF"}</span>
            <span className="text-right font-mono text-[8px] text-subtle">{u.source}</span>
          </div>
        ))}
      </div>
    </Module>
  );
}

export function GroundModule() {
  const s = useSim();
  const d = useDerived();
  return (
    <Module title="Gear / ground · center panel">
      <div className="flex min-w-[72px] flex-col items-center gap-1">
        <span className="text-[9px] font-display uppercase tracking-[0.18em] text-subtle">WOW</span>
        <div
          aria-label={`Weight-on-wheels indication: ${s.wow ? "GND" : "AIR"}`}
          className="flex overflow-hidden rounded-sm border border-line bg-inset shadow-inner"
        >
          <div className={cn(
            "min-w-[2.7rem] px-2 py-1.5 text-center font-display text-[9px] font-bold tracking-wider",
            s.battery && s.wow ? "bg-ok text-accent-fg shadow-[0_0_10px_rgba(61,214,140,0.45)]" : "text-subtle/70",
          )}>
            GND
          </div>
          <div className={cn(
            "min-w-[2.7rem] px-2 py-1.5 text-center font-display text-[9px] font-bold tracking-wider",
            s.battery && !s.wow ? "bg-ok text-accent-fg shadow-[0_0_10px_rgba(61,214,140,0.45)]" : "text-subtle/70",
          )}>
            AIR
          </div>
        </div>
      </div>
      <Rocker label="PARK BRK" on={s.parkingBrake} lit={s.battery && s.parkingBrake} onChange={(v) => s.patch({ parkingBrake: v })} />
      <ThreeToggle
        label="GEAR"
        value={s.gear}
        options={[
          { id: "UP", label: "UP" },
          { id: "OFF", label: "OFF" },
          { id: "DN", label: "DN" },
        ]}
        onChange={(id) => {
          if (id === "UP" && s.wow) {
            s.patch({ gear: "OFF" }, "GEAR LEVER LOCKED — UP selection is inhibited on the ground.");
            return;
          }
          s.patch({ gear: id as "UP" | "OFF" | "DN" });
        }}
      />
      <ThreePos
        label="FLAPS"
        value={String(s.flaps)}
        options={[
          { id: "0", label: "UP" },
          { id: "1", label: "1" },
          { id: "2", label: "2" },
          { id: "5", label: "5" },
          { id: "10", label: "10" },
          { id: "15", label: "15" },
          { id: "25", label: "25" },
          { id: "30", label: "30" },
          { id: "40", label: "40" },
        ]}
        onChange={(id) => s.patch({ flaps: Number(id) })}
      />
      <ThreePos
        label="SPD BRK"
        value={s.speedBrake}
        options={[
          { id: "DOWN", label: "DOWN" },
          { id: "ARMED", label: "ARM" },
          { id: "FLIGHT", label: "FLT" },
          { id: "UP", label: "UP" },
        ]}
        onChange={(id) => s.patch({ speedBrake: id as SpeedBrake })}
      />
      <div className="grid w-full grid-cols-2 gap-2 rounded-md border border-border bg-inset p-2">
        <CaptionLight label="TRANSIT" on={gearIndications(s, d).transit} tone="warn" />
        <CaptionLight label="DOWN / LOCKED" on={gearIndications(s, d).downLocked} tone="ok" />
      </div>
      <div className="grid w-full grid-cols-2 gap-2 rounded-md border border-border bg-inset p-2">
        <CaptionLight label="WOW / GROUND" on={s.battery && s.wow} tone="ok" />
        <CaptionLight label="PARKING BRAKE" on={s.battery && s.parkingBrake} tone="warn" />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 rounded-md border border-border bg-inset p-2 text-xs">
        <div><span className="text-subtle">GPU</span><div className="font-mono">{s.externalPowerConnected ? "CONNECTED" : "DISCONNECTED"}</div></div>
        <div><span className="text-subtle">GROUND AIR</span><div className="font-mono">{s.groundPneumaticPsi.toFixed(0)} PSI</div></div>
        <div><span className="text-subtle">WATER</span><div className="font-mono">{s.potableWater.toFixed(0)}%</div></div>
        <div><span className="text-subtle">WASTE</span><div className="font-mono">{s.wasteLevel.toFixed(0)}%</div></div>
        <div><span className="text-subtle">HYD SERVICING</span><div className="font-mono">{s.hydServicingConnected ? "CONNECTED" : "OFF"}</div></div>
        <div><span className="text-subtle">TE FLAP POS</span><div className="font-mono">{s.flapPos.toFixed(1)}</div></div>
        <div><span className="text-subtle">STBY RUD</span><div className="font-mono">{d.standbyRudderPowered ? "PRESSURIZED" : "OFF"}</div></div>
      </div>
      <div className="w-full rounded-md border border-border bg-inset p-2">
        <div className="flex items-center justify-between text-[9px] uppercase tracking-wide text-subtle">
          <span>TRAINING GROUND SPEED</span><span className="font-mono text-fg">{Math.round(s.groundSpeedKt)} KT</span>
        </div>
        <input aria-label="Training ground speed" className="mt-2 w-full" type="range" min="0" max="160" step="1" value={s.groundSpeedKt} onChange={(e) => s.patch({ groundSpeedKt: Number(e.target.value) })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button className="rounded-md border border-border px-2 py-1 text-xs" onClick={() => s.patch({ externalPowerConnected: !s.externalPowerConnected })}>GPU {s.externalPowerConnected ? "DISCONNECT" : "CONNECT"}</button>
        <button className="rounded-md border border-border px-2 py-1 text-xs" onClick={() => { const on = !s.groundPneumaticConnected; s.patch({ groundPneumaticConnected: on, groundPneumaticPsi: on ? 40 : 0 }); }}>AIR CART {s.groundPneumaticConnected ? "OFF" : "ON"}</button>
        <button className="rounded-md border border-border px-2 py-1 text-xs" onClick={() => s.patch({ hydServicingConnected: !s.hydServicingConnected })}>HYD SERVICING {s.hydServicingConnected ? "DISCONNECT" : "CONNECT"}</button>
        <button className="rounded-md border border-border px-2 py-1 text-xs" onClick={() => { const on = !s.hydReservoirAirConnected; s.patch({ hydReservoirAirConnected: on, hydReservoirAirPsi: on ? 42 : 0 }); }}>HYD RESERVOIR AIR {s.hydReservoirAirConnected ? "DISCONNECT" : "CONNECT"}</button>
      </div>
    </Module>
  );
}
