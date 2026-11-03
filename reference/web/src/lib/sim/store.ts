import { useRef, useSyncExternalStore } from "react";
import { create } from "zustand";
import { initialSim } from "./initial";
import { controlLabel, derive, pushLog, step } from "./derive";
import { playSwitchClick } from "./audio";
import type { Derived, SimState } from "./types";
import { advanceFlightNavigation } from "./flightNavigation";

type Patch = Partial<Omit<SimState, "faults" | "log">> & {
  faults?: Partial<SimState["faults"]>;
};

export interface SimStore extends SimState {
  patch: (p: Patch, note?: string) => void;
  tick: (dt: number) => void;
  reset: () => void;
  clearLog: () => void;
  readyApu: () => void;
  readyForDeparture: () => void;
  startEngine: (side: 1 | 2) => void;
  shutdownEngine: (side: 1 | 2) => void;
  toggleFault: (key: keyof SimState["faults"]) => void;
  injectLandingGearFault: () => void;
  clearLandingGearFault: () => void;
  runScenario: (name: "TR3_BACKUP" | "ALT_FLAP_ALTERNATE" | "AUTOBRAKE_ANTISKID" | "AUTOBRAKE_RTO" | "ADVERSE_YAW") => void;
}

/** While true, patch() does not play the cockpit switch click. The flight-phase controller patches the model several times a second
 *  (speedbrake, flaps, gear, lift-off preset...) and none of that is a pilot flipping a switch - each one used to "click" through the speakers. */
let silentPatchDepth = 0;
export function withSilentPatch<T>(fn: () => T): T {
  silentPatchDepth++;
  try { return fn(); } finally { silentPatchDepth--; }
}


/* ------------------------------------------------------------------------------------------------
 * Render throttling + derived cache
 *
 * The simulation steps at ~30 Hz (see SimTicker) and replaces the whole state every step. React
 * panels do not need every step: they read a throttled snapshot that is refreshed at most every
 * PANEL_RENDER_MS. Anything a person does (patch / start / shutdown / faults ...) flushes the
 * snapshot immediately, so controls still react in the same frame as the click.
 * ---------------------------------------------------------------------------------------------- */
export const PANEL_RENDER_MS = 50;
const PANEL_RENDER_MAX_MS = 160;
let panelRenderMs = PANEL_RENDER_MS;

/** Used by SimTicker: slower devices redraw panels less often so the sim and touch input stay responsive. */
export function getPanelRenderInterval() {
  return panelRenderMs;
}
export function setPanelRenderInterval(ms: number) {
  panelRenderMs = Math.max(PANEL_RENDER_MS, Math.min(PANEL_RENDER_MAX_MS, Math.round(ms)));
}

/** True only while a user-driven action is committing, so the snapshot flushes at once. */
let urgentCommit = false;

/** derive() results keyed by the committed (immutable) state object they were computed from. */
const derivedCache = new WeakMap<object, Derived>();
export function getDerived(s: SimState): Derived {
  let d = derivedCache.get(s);
  if (!d) {
    d = derive(s);
    derivedCache.set(s, d);
  }
  return d;
}

export function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const ka = Object.keys(a as object);
  if (ka.length !== Object.keys(b as object).length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  }
  return true;
}

const simStore = create<SimStore>((rawSet, get) => {
  /** User-driven commit: flush React panels immediately. */
  const set = ((...a: unknown[]) => {
    urgentCommit = true;
    try {
      (rawSet as (...x: unknown[]) => void)(...a);
    } finally {
      urgentCommit = false;
    }
  }) as typeof rawSet;
  return {
  ...initialSim,

  patch: (p, note) => {
    // Mechanical click for switch-type changes only: booleans, enum strings and small
    // integer detents. Continuous sliders / thrust levers (floats) stay silent while dragging.
    {
      const cur = get() as unknown as Record<string, unknown>;
      const isSwitchChange = Object.entries(p).some(([k, v]) => {
        if (k === "faults" || k === "log") return k === "faults";
        const old = cur[k];
        if (old === v) return false;
        if (typeof v === "boolean" || typeof v === "string") return true;
        return typeof v === "number" && typeof old === "number" && Number.isInteger(v) && Number.isInteger(old) && v >= 0 && v <= 6 && old >= 0 && old <= 6;
      });
      if (isSwitchChange && silentPatchDepth === 0) playSwitchClick();
    }
    set((s) => {
      const next: SimState = {
        ...s,
        ...p,
        faults: { ...s.faults, ...(p.faults ?? {}) },
      };
      if (note) return pushLog(next, note, "info");
      const keys = Object.keys(p).filter((k) => k !== "faults");
      if (!keys.length) return next;
      const key = keys[0];
      const before = String((s as any)[key]);
      const after = String((next as any)[key]);
      return pushLog(next, `${controlLabel(key)} → ${after.toUpperCase()}`, "info", { control: key, before, after });
    });
  },

  tick: (dt) => {
    const s = get();
    const scaled = dt * s.timeScale;
    const prev = getDerived(s);
    let next = step(s, scaled);

    // ATA 24 R3/R4 transfer relays have a short 0.1–0.2 s transfer delay.
    // Accumulate while the failed-side transfer demand exists and KEEP the
    // timer latched while the transfer path is the active source (GEN n XFER).
    // Previously, electricalSource === "GEN n XFER" reset the timer to 0,
    // which immediately dropped the transfer path and caused oscillation.
    // Demand matches derive(): no local generator bus, no BTB/APU/GPU tie
    // source, opposite generator available, BUS TRANSFER AUTO, relay healthy.
    const pre = derive(next);
    const side1OnTieOrGen =
      pre.electricalSource1 === "GEN 1" ||
      pre.electricalSource1 === "GPU" ||
      pre.electricalSource1 === "APU GEN";
    const side2OnTieOrGen =
      pre.electricalSource2 === "GEN 2" ||
      pre.electricalSource2 === "GPU" ||
      pre.electricalSource2 === "APU GEN";
    const relay1Demand =
      next.busTie &&
      !next.faults.transferRelay1Failure &&
      !pre.generator1BusPowered &&
      !side1OnTieOrGen &&
      pre.generator2BusPowered;
    const relay2Demand =
      next.busTie &&
      !next.faults.transferRelay2Failure &&
      !pre.generator2BusPowered &&
      !side2OnTieOrGen &&
      pre.generator1BusPowered;
    next.transferRelay1Timer = relay1Demand ? Math.min(0.15, next.transferRelay1Timer + scaled) : 0;
    next.transferRelay2Timer = relay2Demand ? Math.min(0.15, next.transferRelay2Timer + scaled) : 0;
    const p1Demand = next.gen1 && (next.faults.generator1OverFrequency || next.faults.generator1UnderFrequency || next.faults.generator1OverVoltage || next.faults.generator1UnderVoltage || next.faults.generator1OverCurrent || next.faults.generator1Differential);
    const p2Demand = next.gen2 && (next.faults.generator2OverFrequency || next.faults.generator2UnderFrequency || next.faults.generator2OverVoltage || next.faults.generator2UnderVoltage || next.faults.generator2OverCurrent || next.faults.generator2Differential);
    next.generator1ProtectionTimer = p1Demand ? Math.min(0.40, next.generator1ProtectionTimer + scaled) : 0;
    next.generator2ProtectionTimer = p2Demand ? Math.min(0.40, next.generator2ProtectionTimer + scaled) : 0;
    if (!next.gen1) next.generator1ProtectionLatched = false;
    else if (p1Demand && next.generator1ProtectionTimer >= 0.40) next.generator1ProtectionLatched = true;
    if (!next.gen2) next.generator2ProtectionLatched = false;
    else if (p2Demand && next.generator2ProtectionTimer >= 0.40) next.generator2ProtectionLatched = true;

    // Trainer one-touch engine start. GRD opens the pneumatic starter valve;
    // once N2 passes ~20% the start lever is moved to IDLE (fuel + ignition),
    // matching the sequence in derive(). Cleared when the engine is
    // self-sustaining or the start is aborted (switch OFF with lever in CUTOFF).
    for (const side of [1, 2] as const) {
      const auto = side === 1 ? next.autoStart1 : next.autoStart2;
      if (!auto) continue;
      const n2 = side === 1 ? next.n2_1 : next.n2_2;
      const lever = side === 1 ? next.lever1 : next.lever2;
      const sw = side === 1 ? next.start1 : next.start2;
      const firePulled = side === 1 ? next.engine1FirePulled : next.engine2FirePulled;
      if (firePulled || (sw === "OFF" && !lever)) {
        if (side === 1) next.autoStart1 = false; else next.autoStart2 = false;
        continue;
      }
      if (!lever && n2 >= 20) {
        if (side === 1) next.lever1 = true; else next.lever2 = true;
        next = pushLog(next, `Engine ${side}: N2 ${Math.round(n2)}% — START LEVER to IDLE, fuel and ignition on.`, "info");
      } else if (lever && n2 >= 40) {
        if (side === 1) next.autoStart1 = false; else next.autoStart2 = false;
      }
    }

    // Hydraulic fluid servicing changes reservoir quantity only; it does not
    // create hydraulic pressure. A small trainer-scale fill rate is used so
    // the quantity indicators visibly respond without pretending to model
    // maintenance hose flow rates as aircraft pump pressure.
    if (next.hydServicingConnected && next.wow) {
      const fill = Math.min(12 * scaled, 100);
      next.hydAQty = Math.min(100, next.hydAQty + fill);
      next.hydBQty = Math.min(100, next.hydBQty + fill);
      next.hydSQty = Math.min(100, next.hydSQty + fill);
    }
    if (next.faults.hydALeak) next.hydAQty = Math.max(0, next.hydAQty - 0.5 * scaled);
    if (next.faults.hydBLeak) next.hydBQty = Math.max(0, next.hydBQty - 0.5 * scaled);

    // ATA 34 trainer test clock. It advances only while the pitot/static trainer
    // is active, allowing leakage/test-source conditions to have a real elapsed
    // time instead of being display-only booleans.
    next.psTestClockSec = next.psTrainerEnabled ? next.psTestClockSec + Math.max(0, scaled) : 0;

    // Shared geographic navigation state follows the active attitude model.
    // When the main instrument panel owns attitude/heading, it publishes its own
    // telemetry from that model; avoid a second writer using the fallback SimState
    // heading, which can differ from the live HSI/ADI heading.
    if (!next.afPanelOwned) {
      advanceFlightNavigation({
        dt: scaled,
        groundSpeedKt: next.groundSpeedKt,
        headingDeg: next.attitudeHeadingDeg,
        altitudeFt: next.psFlightAltFt,
        wow: next.wow,
      });
    }

    const now = derive(next);

    if (!prev.apuAvailable && now.apuAvailable) {
      next = pushLog(next, "APU at 95% — bleed valve and generator are armed.", "ok");
    }
    if (!prev.startValveOpen1 && now.startValveOpen1) {
      next = pushLog(next, "Engine 1 START VALVE OPEN — pneumatic starter cutting in.", "ok");
    }
    if (!prev.startValveOpen2 && now.startValveOpen2) {
      next = pushLog(next, "Engine 2 START VALVE OPEN — pneumatic starter cutting in.", "ok");
    }
    if (!prev.eng1Running && now.eng1Running) {
      next = pushLog(next, "Engine 1 self-sustaining. Starter cutout ~35–40% N2.", "ok");
    }
    if (!prev.eng2Running && now.eng2Running) {
      next = pushLog(next, "Engine 2 self-sustaining. Starter cutout ~35–40% N2.", "ok");
    }
    if (!prev.dualBleed && now.dualBleed) {
      next = pushLog(next, "DUAL BLEED light — APU bleed is open with an engine bleed source and isolation valve open.", "caution");
    }
    if (!prev.transferRelay1Alt && now.transferRelay1Alt) {
      next = pushLog(next, "TRANSFER BUS 1 — automatic transfer closed from GEN 2 (R3).", "ok");
    }
    if (!prev.transferRelay2Alt && now.transferRelay2Alt) {
      next = pushLog(next, "TRANSFER BUS 2 — automatic transfer closed from GEN 1 (R4).", "ok");
    }
    if (!prev.generator1ProtectionTripped && now.generator1ProtectionTripped) {
      next = pushLog(next, "GEN 1 protection trip — generator removed from bus after 0.40 s abnormal condition.", "warn");
    }
    if (!prev.generator2ProtectionTripped && now.generator2ProtectionTripped) {
      next = pushLog(next, "GEN 2 protection trip — generator removed from bus after 0.40 s abnormal condition.", "warn");
    }
    if (!prev.stbyOn && now.stbyOn) {
      next = pushLog(next, "Standby hydraulic pump on — covering rudder / LE devices.", "caution");
    }
    if (s.apuDoor < 0.95 && next.apuDoor >= 0.95) {
      next = pushLog(next, "APU inlet door fully open. Starter lockout relay released.", "ok");
    }

    rawSet(next);
    derivedCache.set(get(), now);
  },

  reset: () => set({ ...initialSim, log: [...initialSim.log], faults: { ...initialSim.faults } }),
  clearLog: () => set((s) => ({ ...s, log: [] })),


  readyForDeparture: () => {
    playSwitchClick();
    // This is a preparation preset, not a simulation reset. Preserve fuel,
    // injected faults, maintenance/service state, and the active navigation
    // plan; configure only the systems and aircraft condition needed to start
    // a departure scenario.
    set((s) => ({
      ...s,
      // Electrical
      battery: true,
      busTie: true,
      // APU ready
      apuMaster: "ON",
      apuFuelValve: 1,
      apuDoor: 1,
      apuRpm: 100,
      apuEgt: 420,
      apuOilPsi: 95,
      apuGen: true,
      apuLeftControl: true,
      apuRightControl: true,
      apuBleed: true,
      apuBleedValve: 1,
      // Engines stabilized at idle. The engine model continues to evolve
      // these values on subsequent simulation ticks.
      lever1: true,
      lever2: true,
      gen1: true,
      gen2: true,
      start1: "OFF",
      start2: "OFF",
      autoStart1: false,
      autoStart2: false,
      n2_1: Math.max(s.n2_1, 62),
      n2_2: Math.max(s.n2_2, 62),
      n1_1: Math.max(s.n1_1, 22),
      n1_2: Math.max(s.n1_2, 22),
      egt1: Math.max(s.egt1, 480),
      egt2: Math.max(s.egt2, 480),
      ff1: Math.max(s.ff1, 800),
      ff2: Math.max(s.ff2, 800),
      oilPsi1: Math.max(s.oilPsi1, 45),
      oilPsi2: Math.max(s.oilPsi2, 45),
      // Idle thrust, not 90% thrust while parked.
      throttle1: 0.05,
      throttle2: 0.05,
      // Departure ground configuration
      wow: true,
      airborneTest: false,
      groundSenseTest: false,
      gear: "DN",
      noseGearPos: 1,
      leftMainGearPos: 1,
      rightMainGearPos: 1,
      flaps: 5,
      speedBrake: "ARMED",
      parkingBrake: true,
      groundSpeedKt: 0,
      psFlightCasKt: 0,
      psFlightTargetCasKt: 0,
      psFlightVsFpm: 0,
      psFlightAltFt: s.wow ? s.psFlightAltFt : 0,
      psFlightTargetAltFt: s.wow ? s.psFlightAltFt : 0,
      psFlightProgressive: true,
      psGroundRoll: false,
      // Clear any still-active runway-approach/rollout scenario. Its APPROACH
      // phase reasserts airborneTest on every simulation tick, which can undo
      // the parked WOW/ground setup if it is left behind from the Brakes trainer.
      rwyPhase: "IDLE",
      rwyPosM: -1800,
      rwyAltFt: 0,
      rwyLatM: 0,
      rwyHdgDeg: 0,
      rwyTrackDeg: 0,
      rwyYawRate: 0,
      rwyNote: "",
      wheelSpeeds: { li: 0, lo: 0, ri: 0, ro: 0 },
      wheelBrakePressures: { li: 0, lo: 0, ri: 0, ro: 0 },
      actualDecel: 0,
      // Fuel pumps: retain remaining tank quantities and any existing faults.
      fuelPump1Fwd: true,
      fuelPump1Aft: true,
      fuelPump2Fwd: true,
      fuelPump2Aft: true,
      fuelPumpCenter1: s.fuelTankCenter > 0,
      fuelPumpCenter2: s.fuelTankCenter > 0,
      fuelCrossfeed: false,
      // Hydraulics
      engHyd1: true,
      engHyd2: true,
      elecHyd1: true,
      elecHyd2: true,
      hydAPress: 3000,
      hydBPress: 3000,
      hydSPress: 3000,
      // Bleed / packs / anti-ice
      bleed1: true,
      bleed2: true,
      packL: true,
      packR: true,
      antiIce1: true,
      antiIce2: true,
      wingAntiIceL: true,
      wingAntiIceR: true,
      ltPosition: "STROBE_STEADY",
      ltAntiCol: true,
      ltLogo: true,
      ltNoSmoking: "ON",
      ltSeatBelt: "ON",
      log: [...s.log.slice(-29), {
        t: Date.now(),
        text: "Ready for departure: aircraft configured on the ground, engines stabilized at idle, systems and cabin signs configured. Existing fuel quantity, faults, and active flight plan preserved.",
        tone: "ok" as const,
      }],
    }));
  },

  readyApu: () => {
    playSwitchClick();
    set({
      ...initialSim,
      apuMaster: "ON",
      apuFuelValve: 1,
      apuDoor: 1,
      apuRpm: 100,
      apuEgt: 420,
      apuOilPsi: 95,
      apuGen: true,
      apuLeftControl: true,
      apuRightControl: true,
      apuBleed: true,
      apuBleedValve: 1,
      groundPowerOn: false,
      externalPowerConnected: false,
      busTie: true,
      groundPneumaticConnected: false,
      groundPneumaticPsi: 0,
      packL: true,
      packR: true,
      log: [
        {
          t: Date.now(),
          text: "Preset: APU running at 100%, generator on bus, bleed open.",
          tone: "ok",
        },
      ],
    });
  },

  startEngine: (side) => {
    playSwitchClick();
    set((s) => {
      const d = derive(s);
      const running = side === 1 ? d.eng1Running : d.eng2Running;
      const firePulled = side === 1 ? s.engine1FirePulled : s.engine2FirePulled;
      const psi = side === 1 ? d.leftDuctPsi : d.rightDuctPsi;
      if (running) return pushLog(s, `Engine ${side} already running.`, "info");
      if (firePulled) return pushLog(s, `Engine ${side} start inhibited — fire handle pulled.`, "warn");
      if (!d.dcPower) return pushLog(s, `Engine ${side} start inhibited — no DC power (battery / bus).`, "warn");
      const next: SimState = side === 1
        ? { ...s, start1: "GRD", lever1: false, autoStart1: true }
        : { ...s, start2: "GRD", lever2: false, autoStart2: true };
      const text = psi < 30
        ? `ENG ${side} START — GRD selected, but starter air is below 30 psi. Supply APU bleed, ground air or cross-bleed.`
        : `ENG ${side} START — GRD selected, starter valve opening. IDLE will be set at ~20% N2.`;
      return pushLog(next, text, psi < 30 ? "caution" : "info");
    });
  },

  shutdownEngine: (side) => {
    playSwitchClick();
    set((s) => {
      const next: SimState = side === 1
        ? { ...s, start1: "OFF", lever1: false, autoStart1: false }
        : { ...s, start2: "OFF", lever2: false, autoStart2: false };
      return pushLog(next, `ENG ${side} shutdown — START LEVER to CUTOFF.`, "info");
    });
  },

  injectLandingGearFault: () => {
    set((s) => {
      const choices = ["NOSE", "LEFT_MAIN", "RIGHT_MAIN"] as const;
      const available = s.landingGearFault === "NONE" ? choices : choices.filter((c) => c !== s.landingGearFault);
      const fault = available[Math.floor(Math.random() * available.length)] ?? choices[Math.floor(Math.random() * choices.length)];
      const next: SimState = {
        ...s,
        gear: "DN",
        landingGearFault: fault,
        noseGearPos: fault === "NOSE" ? 0 : s.noseGearPos,
        leftMainGearPos: fault === "LEFT_MAIN" ? 0 : s.leftMainGearPos,
        rightMainGearPos: fault === "RIGHT_MAIN" ? 0 : s.rightMainGearPos,
      };
      const label = fault === "NOSE" ? "NOSE GEAR" : fault === "LEFT_MAIN" ? "LEFT MAIN GEAR" : "RIGHT MAIN GEAR";
      return pushLog(next, `Fault injected: LANDING GEAR POSITION — ${label} failed to extend.`, "warn");
    });
  },

  clearLandingGearFault: () => {
    set((s) => {
      if (s.landingGearFault === "NONE") return s;
      const next: SimState = { ...s, landingGearFault: "NONE" };
      return pushLog(next, "Fault cleared: LANDING GEAR POSITION fault.", "ok");
    });
  },

  toggleFault: (key) => {
    playSwitchClick();
    set((s) => {
      const faults = { ...s.faults, [key]: !s.faults[key] };
      const labels: Record<keyof SimState["faults"], string> = {
        apuDoorJam: "APU inlet door jam",
        hydALeak: "Hydraulic System A leak",
        packOverheat: "Pack overheat (L)",
        packOverheatR: "Pack overheat (R)",
        bleedOverheat1: "Bleed overheat (engine 1)",
        bleedOverheat2: "Bleed overheat (engine 2)",
        apuFireDetected: "APU fire detected",
        apuOverspeed: "APU overspeed shutdown",
        apuLowOilPressure: "APU low oil pressure",
        apuHighOilTemperature: "APU high oil temperature",
        engineFire1: "Engine 1 fire detected",
        engineFire2: "Engine 2 fire detected",
        hydBLeak: "Hydraulic System B leak",
        tr1Failure: "TR 1 failure",
        tr2Failure: "TR 2 failure",
        generator1Failure: "Generator 1 failure",
        generator2Failure: "Generator 2 failure",
        transferRelay1Failure: "Transfer relay 1 failure",
        transferRelay2Failure: "Transfer relay 2 failure",
        btb1Failure: "BTB 1 failure",
        btb2Failure: "BTB 2 failure",
        apuGeneratorBreakerFailure: "APU generator breaker failure",
        externalPowerContactorFailure: "External power contactor failure",
        openPhase1: "Generator 1 open phase",
        openPhase2: "Generator 2 open phase",
        tr3Failure: "TR 3 failure",
        batteryFailure: "Battery failure",
        staticInverterFailure: "Static inverter failure",
        teFlapHydMotorFail: "TE flap hydraulic motor failure",
        flapAsymmetry: "Trailing-edge flap asymmetry",
        antiskidInop: "Antiskid control fault",
        generator1OverFrequency: "Generator 1 overfrequency",
        generator1UnderFrequency: "Generator 1 underfrequency",
        generator1OverVoltage: "Generator 1 overvoltage",
        generator1UnderVoltage: "Generator 1 undervoltage",
        generator1OverCurrent: "Generator 1 overcurrent",
        generator1Differential: "Generator 1 differential protection",
        generator2OverFrequency: "Generator 2 overfrequency",
        generator2UnderFrequency: "Generator 2 underfrequency",
        generator2OverVoltage: "Generator 2 overvoltage",
        generator2UnderVoltage: "Generator 2 undervoltage",
        generator2OverCurrent: "Generator 2 overcurrent",
        generator2Differential: "Generator 2 differential protection",
        fuelTank1Leak: "Fuel tank 1 leak",
        fuelTank2Leak: "Fuel tank 2 leak",
        fuelCenterLeak: "Center fuel tank leak",
        fuelBoostPump1Fail: "All tank 1 boost pumps failure",
        fuelBoostPump2Fail: "All tank 2 boost pumps failure",
        fuelCenterPumpFail: "Both center boost pumps failure",
        fuelTank1FwdPumpFail: "Tank 1 forward boost pump failure",
        fuelTank1AftPumpFail: "Tank 1 aft boost pump failure",
        fuelTank2FwdPumpFail: "Tank 2 forward boost pump failure",
        fuelTank2AftPumpFail: "Tank 2 aft boost pump failure",
        fuelCenterPump1Fail: "Center left boost pump failure",
        fuelCenterPump2Fail: "Center right boost pump failure",
        fuelCrossfeedValveFail: "Fuel crossfeed valve failure",
        fuelFilterIcingFault1: "Engine 1 fuel-filter icing event",
        fuelFilterIcingFault2: "Engine 2 fuel-filter icing event",
        antiskidInbdInop: "Inboard antiskid channel failure",
        antiskidOutbdInop: "Outboard antiskid channel failure",
        oilChip1: "Engine 1 oil chip detector",
        oilChip2: "Engine 2 oil chip detector",
        oilLow1: "Engine 1 low oil pressure",
        oilLow2: "Engine 2 low oil pressure",
        genDriveDisconnectFailure1: "Engine 1 generator-drive disconnect solenoid failure",
        genDriveDisconnectFailure2: "Engine 2 generator-drive disconnect solenoid failure",
        genDriveOilPressureLow1: "Engine 1 generator-drive oil pressure low",
        genDriveOilPressureLow2: "Engine 2 generator-drive oil pressure low",
        genDriveOilOverheat1: "Engine 1 generator-drive oil overheat",
        genDriveOilOverheat2: "Engine 2 generator-drive oil overheat",
        yawDamperFailure: "Yaw damper failure",
        equipmentCoolingFailure: "Equipment-cooling blower failure",
        oxygenSystemFailure: "Oxygen system failure",
        doorWarningFailure: "Door-warning circuit failure",
        recircFanFailure: "Cabin recirculation/gasper fan failure",
        mixValveJamL: "Left air-mix valve jam",
        mixValveJamR: "Right air-mix valve jam",
        cvrFailure: "Cockpit voice recorder failure",
        rainRepellentFailure: "Rain-repellent system failure",
        fuelHeatFailure: "Engine 1 fuel-heater valve/system failure",
        fuelHeatFailure2: "Engine 2 fuel-heater valve/system failure",
        windowHeatFailureL: "Left windshield heat failure",
        windowHeatFailureR: "Right windshield heat failure",
        igniter1LeftFailure: "Engine 1 left igniter/exciter failure",
        igniter1RightFailure: "Engine 1 right igniter/exciter failure",
        igniter2LeftFailure: "Engine 2 left igniter/exciter failure",
        igniter2RightFailure: "Engine 2 right igniter/exciter failure",
        drainHeaterFailure1: "Forward toilet drain heater failure",
        drainHeaterFailure2: "Aft toilet drain heater failure",
        drainMastAirFailure: "Drain-mast air-mode circuit failure",
        drainMastGroundFailure: "Drain-mast ground-mode circuit failure",
        alphaVaneHeatFailureL: "Left alpha-vane heater failure",
        alphaVaneHeatFailureR: "Right alpha-vane heater failure",
      };
      const label = labels[key];
      return pushLog(
        { ...s, faults },
        faults[key] ? `Fault on: ${label}` : `Fault cleared: ${label}`,
        faults[key] ? "warn" : "ok",
      );
    });
  },

  runScenario: (name) => {
    set((s) => {
      if (name === "TR3_BACKUP") {
        const next: SimState = {
          ...s,
          battery: false,
          externalPowerConnected: false,
          groundPowerOn: false,
          busTie: true,
          lever2: true,
          n2_2: 60,
          gen2: true,
          faults: { ...s.faults, tr1Failure: true, tr2Failure: false },
        };
        return pushLog(next, "Scenario: GEN 2 operating, TR 1 failed — TR 3 is fed from GEN BUS 2 and supplies the DC tie backup path.", "warn");
      }
      if (name === "ADVERSE_YAW") {
        const next: SimState = {
          ...s,
          battery: true,
          wow: false,
          airborneTest: true,
          groundSenseTest: false,
          // Keep the adverse-yaw training scenario hydraulically/electrically
          // self-consistent: both engines are stabilized, engine bleeds and
          // hydraulic pumps are selected, while all ground equipment remains
          // disconnected because the aircraft is airborne.
          lever1: true,
          lever2: true,
          n2_1: 70,
          n2_2: 70,
          bleed1: true,
          bleed2: true,
          engHyd1: true,
          engHyd2: true,
          elecHyd1: true,
          elecHyd2: true,
          gen1: true,
          gen2: true,
          gear: "UP",
          noseGearPos: 0,
          leftMainGearPos: 0,
          rightMainGearPos: 0,
          fltCtrlA: true,
          fltCtrlB: true,
          spoilerA: true,
          spoilerB: true,
          hydServicingConnected: false,
          hydGroundPowerConnected: false,
          groundPneumaticConnected: false,
          groundPneumaticPsi: 0,
          parkingBrake: false,
          hydAPress: 3000,
          hydBPress: 3000,
          groundSpeedKt: 140,
          speedBrake: "FLIGHT",
          yokeRoll: 0.55,
          rudderPedal: 0,
          adverseYawScenario: true,
        };
        return pushLog(next, "Scenario: ADVERSE YAW — apply coordinated rudder in the direction of the commanded roll while observing the opposite yaw cue.", "warn");
      }
      if (name === "AUTOBRAKE_RTO") {
        const next: SimState = {
          ...s,
          battery: true,
          wow: true,
          gear: "DN",
          gearPos: 1,
          parkingBrake: false,
          antiskidInbd: true,
          antiskidOutbd: true,
          autobrake: 4,
          groundSpeedKt: 105,
          speedBrake: "ARMED",
          autobrakeTestTimer: 3,
          autobrakeRtoArmed: true,
          lever1: true,
          lever2: true,
          throttle1: 1,
          throttle2: 1,
          engHyd1: true,
          engHyd2: true,
          elecHyd1: true,
          elecHyd2: true,
          externalPowerConnected: true,
          groundPowerOn: true,
          hydServicingConnected: true,
          hydGroundPowerConnected: true,
          hydAPress: 3000,
          hydBPress: 3000,
          faults: { ...s.faults, antiskidInop: false },
        };
        return pushLog(next, "Scenario: RTO — RTO selected and armed above 90 kt. Retard both thrust levers to trigger maximum autobraking.", "warn");
      }
      if (name === "AUTOBRAKE_ANTISKID") {
        const next: SimState = {
          ...s,
          battery: true,
          wow: true,
          gear: "DN",
          gearPos: 1,
          parkingBrake: false,
          antiskidInbd: true,
          antiskidOutbd: true,
          autobrake: 1,
          groundSpeedKt: 75,
          speedBrake: "ARMED",
          autobrakeTestTimer: 3,
          autobrakeRtoArmed: false,
          lever1: true,
          lever2: true,
          throttle1: 0,
          throttle2: 0,
          engHyd1: true,
          engHyd2: true,
          elecHyd1: true,
          elecHyd2: true,
          externalPowerConnected: true,
          groundPowerOn: true,
          hydServicingConnected: true,
          hydGroundPowerConnected: true,
          hydAPress: 3000,
          hydBPress: 3000,
          faults: { ...s.faults, antiskidInop: false },
        };
        return pushLog(next, "Scenario: ANTISKID + AUTOBRAKE landing — MIN selected, wheel speed 75 kt, brakes will be controlled through the antiskid valves.", "ok");
      }
      const next: SimState = {
        ...s,
        battery: false,
        externalPowerConnected: true,
        groundPowerOn: true,
        flaps: 15,
        flapPos: 0,
        altFlapsArm: false,
        altFlapsControl: "OFF",
        faults: { ...s.faults, teFlapHydMotorFail: true },
      };
      return pushLog(next, "Scenario: TE flap hydraulic motor failed — use ALTERNATE FLAPS ARM, then the alternate position switch.", "warn");
    });
  },
  };
});

/* ---- throttled snapshot that React panels read ---- */
let panelSnapshot: SimStore = simStore.getState();
const panelListeners = new Set<() => void>();
let lastPanelEmit = 0;
let panelTimer: ReturnType<typeof setTimeout> | null = null;

function emitPanels() {
  panelTimer = null;
  lastPanelEmit = typeof performance !== "undefined" ? performance.now() : 0;
  panelSnapshot = simStore.getState();
  panelListeners.forEach((l) => l());
}

simStore.subscribe(() => {
  if (typeof window === "undefined") {
    panelSnapshot = simStore.getState(); // SSR: no timers, always current
    return;
  }
  if (urgentCommit) {
    if (panelTimer !== null) clearTimeout(panelTimer);
    emitPanels();
    return;
  }
  const wait = panelRenderMs - (performance.now() - lastPanelEmit);
  if (wait <= 0) emitPanels();
  else if (panelTimer === null) panelTimer = setTimeout(emitPanels, wait);
});

function subscribePanels(l: () => void) {
  panelListeners.add(l);
  return () => {
    panelListeners.delete(l);
  };
}
const getPanelSnapshot = () => panelSnapshot;

/** Subscribe to a slice of a source with a cached, equality-stable selector (same idea as zustand's own hook). */
function useSelected<S, T>(
  getSource: () => S,
  selector: ((s: S) => T) | undefined,
  equalityFn: (a: T, b: T) => boolean,
): T {
  const cache = useRef<{ src: S; selector: unknown; value: T } | null>(null);
  const getSnapshot = (): T => {
    const src = getSource();
    if (!selector) return src as unknown as T;
    const c = cache.current;
    if (c && c.src === src && c.selector === selector) return c.value;
    const next = selector(src);
    const value = c && equalityFn(c.value, next) ? c.value : next;
    cache.current = { src, selector, value };
    return value;
  };
  return useSyncExternalStore(subscribePanels, getSnapshot, getSnapshot);
}

type SimApi = Pick<typeof simStore, "getState" | "setState" | "subscribe" | "getInitialState">;
export interface UseSim extends SimApi {
  (): SimStore;
  <T>(selector: (s: SimStore) => T, equalityFn?: (a: T, b: T) => boolean): T;
}

function useSimHook<T>(selector?: (s: SimStore) => T, equalityFn: (a: T, b: T) => boolean = Object.is): T | SimStore {
  return useSelected<SimStore, T | SimStore>(getPanelSnapshot, selector, equalityFn as (a: unknown, b: unknown) => boolean);
}

/**
 * React access to the sim. Reads the throttled snapshot (<= 1 render per PANEL_RENDER_MS) and flushes at once on user actions.
 * Prefer useSimPick("a", "b") over a bare useSim() so a panel only re-renders when the values it shows change.
 */
export const useSim: UseSim = Object.assign(useSimHook as unknown as UseSim, {
  getState: simStore.getState,
  setState: simStore.setState,
  subscribe: simStore.subscribe,
  getInitialState: simStore.getInitialState,
});

/** Subscribe to only the named sim fields / actions. Re-renders only when one of them changes. */
export function useSimPick<K extends keyof SimStore>(...keys: K[]): Pick<SimStore, K> {
  return useSelected<SimStore, Pick<SimStore, K>>(
    getPanelSnapshot,
    (st) => {
      const o = {} as Pick<SimStore, K>;
      for (const k of keys) o[k] = st[k];
      return o;
    },
    shallowEqual,
  );
}

const getPanelDerived = () => getDerived(panelSnapshot);

/** Whole derived model (re-renders each snapshot). Prefer useDerivedPick. */
export function useDerived(): Derived {
  return useSelected<Derived, Derived>(getPanelDerived, undefined, Object.is);
}

/** Subscribe to only the named derived values. */
export function useDerivedPick<K extends keyof Derived>(...keys: K[]): Pick<Derived, K> {
  return useSelected<Derived, Pick<Derived, K>>(
    getPanelDerived,
    (d) => {
      const o = {} as Pick<Derived, K>;
      for (const k of keys) o[k] = d[k];
      return o;
    },
    shallowEqual,
  );
}

/** Subscribe to a value computed from the derived model (e.g. a boolean threshold). Re-renders only when that value changes. */
export function useDerivedSelect<T>(selector: (d: Derived) => T, equalityFn: (a: T, b: T) => boolean = Object.is): T {
  return useSelected<Derived, T>(getPanelDerived, selector, equalityFn);
}
