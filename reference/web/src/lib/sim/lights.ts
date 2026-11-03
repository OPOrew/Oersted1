import type { SimState } from "./types";

/**
 * 737-200 lighting trainer model (ATA 33 style).
 *
 * Inventory aligned to the supplied Boeing Chapter 33 LIGHTS manual.
 * Bus/CB values remain a trainer model unless the manual excerpt explicitly establishes them.
 */

export type LightGroup = "Exterior" | "Flight deck" | "Cabin" | "Emergency";
export type LightColor = "white" | "red" | "green" | "amber";
export type LightBus = "AC1" | "AC2" | "DC1" | "DC2" | "BAT" | "HOT" | "28VAC" | "EMER";

export interface LightBuses {
  ac1: boolean; ac2: boolean; dc1: boolean; dc2: boolean; bat: boolean; hot: boolean; ac28: boolean; dc: boolean;
}

export interface LightStatus {
  id: string;
  label: string;
  group: LightGroup;
  color: LightColor;
  supply: LightBus;
  cb: string;
  flash?: "strobe" | "beacon";
  /** Selected by a switch or by AUTO logic (0..1 brightness asked for). */
  commanded: number;
  powered: boolean;
  failed: boolean;
  cbOut: boolean;
  lit: boolean;
  /** Actual brightness 0..1 (0 when not lit). */
  level: number;
  /** Why a commanded light is dark, or a short status note. */
  reason: string;
}

export interface LightComponent {
  id: string;
  name: string;
  group: LightGroup | "Controls" | "Power";
  location: string;
  function: string;
  feeds: string;
  powered: boolean;
  state: string;
}

type Def = { id: string; label: string; group: LightGroup; color: LightColor; supply: LightBus; cb: string; flash?: "strobe" | "beacon" };

const DEFS: Def[] = [
  // Exterior
  { id: "ldg-ret-l", label: "Landing light · retractable L", group: "Exterior", color: "white", supply: "AC1", cb: "LDG LT RETRACT L" },
  { id: "ldg-ret-r", label: "Landing light · retractable R", group: "Exterior", color: "white", supply: "AC2", cb: "LDG LT RETRACT R" },
  { id: "ldg-fix-l", label: "Landing light · fixed L", group: "Exterior", color: "white", supply: "AC1", cb: "LDG LT FIXED L" },
  { id: "ldg-fix-r", label: "Landing light · fixed R", group: "Exterior", color: "white", supply: "AC2", cb: "LDG LT FIXED R" },
  { id: "rwy-l", label: "Runway turnoff light L", group: "Exterior", color: "white", supply: "DC1", cb: "RWY TURNOFF L" },
  { id: "rwy-r", label: "Runway turnoff light R", group: "Exterior", color: "white", supply: "DC2", cb: "RWY TURNOFF R" },
  { id: "taxi", label: "Taxi light (nose gear)", group: "Exterior", color: "white", supply: "DC1", cb: "TAXI LT" },
  { id: "wing", label: "Wing illumination lights", group: "Exterior", color: "white", supply: "AC1", cb: "WING ILLUM" },
  { id: "logo", label: "Logo lights (stabilizers)", group: "Exterior", color: "white", supply: "AC2", cb: "LOGO LT" },
  { id: "wheelwell", label: "Wheel-well lights", group: "Exterior", color: "white", supply: "HOT", cb: "WHEEL WELL LT" },
  { id: "pos-l", label: "Position light · left wingtip (red)", group: "Exterior", color: "red", supply: "DC1", cb: "POSITION LTS" },
  { id: "pos-r", label: "Position light · right wingtip (green)", group: "Exterior", color: "green", supply: "DC2", cb: "POSITION LTS" },
  { id: "pos-t", label: "Position light · tail (white)", group: "Exterior", color: "white", supply: "DC1", cb: "POSITION LTS" },
  { id: "strobe-l", label: "Strobe · left wingtip", group: "Exterior", color: "white", supply: "DC1", cb: "STROBE LTS", flash: "strobe" },
  { id: "strobe-r", label: "Strobe · right wingtip", group: "Exterior", color: "white", supply: "DC2", cb: "STROBE LTS", flash: "strobe" },
  { id: "strobe-t", label: "Strobe · tail", group: "Exterior", color: "white", supply: "DC1", cb: "STROBE LTS", flash: "strobe" },
  { id: "beacon-top", label: "Anti-collision beacon · top", group: "Exterior", color: "red", supply: "DC1", cb: "ANTI COLLISION", flash: "beacon" },
  { id: "beacon-bot", label: "Anti-collision beacon · bottom", group: "Exterior", color: "red", supply: "DC2", cb: "ANTI COLLISION", flash: "beacon" },
  // Flight deck
  { id: "dome", label: "Dome light", group: "Flight deck", color: "white", supply: "BAT", cb: "DOME LT" },
  { id: "pnl-ovhd", label: "Overhead panel (P5) lighting", group: "Flight deck", color: "amber", supply: "28VAC", cb: "PANEL LTS" },
  { id: "pnl-capt", label: "Captain instrument / panel lighting", group: "Flight deck", color: "amber", supply: "28VAC", cb: "PANEL LTS" },
  { id: "pnl-fo", label: "First Officer instrument / panel lighting", group: "Flight deck", color: "amber", supply: "28VAC", cb: "PANEL LTS" },
  { id: "pnl-ped", label: "Pedestal lighting", group: "Flight deck", color: "amber", supply: "28VAC", cb: "PANEL LTS" },
  { id: "map-capt", label: "Map light · Captain", group: "Flight deck", color: "white", supply: "DC1", cb: "MAP LTS" },
  { id: "map-fo", label: "Map light · First Officer", group: "Flight deck", color: "white", supply: "DC2", cb: "MAP LTS" },
  { id: "storm", label: "Storm lights (flood, full bright)", group: "Flight deck", color: "white", supply: "DC1", cb: "STORM LT" },
  { id: "compass", label: "Compass light", group: "Flight deck", color: "white", supply: "BAT", cb: "COMPASS LT" },
  { id: "observer", label: "Observer reading light", group: "Flight deck", color: "white", supply: "DC2", cb: "OBSERVER LT" },
  { id: "shield-emer", label: "Lightshield emergency lamps", group: "Emergency", color: "white", supply: "BAT", cb: "PILOT BACKGROUND LT" },
  // Cabin
  { id: "cab-main", label: "Passenger cabin lights", group: "Cabin", color: "white", supply: "AC1", cb: "CABIN LTS" },
  { id: "cab-entry", label: "Entry lights", group: "Cabin", color: "white", supply: "AC2", cb: "ENTRY / GALLEY LTS" },
  { id: "cab-galley", label: "Galley lights", group: "Cabin", color: "white", supply: "AC2", cb: "ENTRY / GALLEY LTS" },
  { id: "cab-lav", label: "Lavatory lights", group: "Cabin", color: "white", supply: "AC1", cb: "LAV LTS" },
  { id: "cab-read", label: "Passenger reading lights", group: "Cabin", color: "white", supply: "28VAC", cb: "PASS READING LTS" },
  { id: "cab-sidewall", label: "Cabin sidewall / cove lights", group: "Cabin", color: "white", supply: "AC1", cb: "CABIN SIDEWALL LTS" },
  { id: "cab-window", label: "Cabin window lights", group: "Cabin", color: "white", supply: "AC1", cb: "WINDOW LTS" },
  { id: "att-work", label: "Attendant work lights", group: "Cabin", color: "white", supply: "AC2", cb: "ATT WORK LTS" },
  { id: "pass-call", label: "Passenger call lights", group: "Cabin", color: "amber", supply: "28VAC", cb: "PASS CALL LTS" },
  { id: "lav-call", label: "Lavatory call lights", group: "Cabin", color: "amber", supply: "28VAC", cb: "LAV CALL LTS" },
  { id: "lav-mirror", label: "Lavatory mirror lights", group: "Cabin", color: "white", supply: "AC1", cb: "LAV MIRROR LTS" },
  { id: "threshold", label: "Door threshold lights", group: "Cabin", color: "white", supply: "AC2", cb: "THRESHOLD LTS" },
  { id: "closet", label: "Coat closet lights", group: "Cabin", color: "white", supply: "AC2", cb: "COAT COMPT" },
  { id: "airstair", label: "Forward airstair step-riser lights (if installed)", group: "Cabin", color: "white", supply: "AC2", cb: "AIRSTAIR STEP LTS" },
  { id: "sign-ns", label: "NO SMOKING sign", group: "Cabin", color: "amber", supply: "DC1", cb: "PASS SIGNS" },
  { id: "sign-sb", label: "FASTEN SEAT BELTS sign", group: "Cabin", color: "amber", supply: "DC1", cb: "PASS SIGNS" },
  // Emergency
  { id: "exit-sign", label: "Exit signs", group: "Emergency", color: "red", supply: "BAT", cb: "EXIT LTS" },
  { id: "emer-aisle", label: "Aisle / floor-path emergency lights", group: "Emergency", color: "white", supply: "EMER", cb: "EMER LT PACK" },
  { id: "emer-ovhd", label: "Cabin overhead emergency lights", group: "Emergency", color: "white", supply: "EMER", cb: "EMER LT PACK" },
  { id: "emer-exit", label: "Exit-area exterior lights", group: "Emergency", color: "white", supply: "EMER", cb: "EMER LT PACK" },
  { id: "exit-locator", label: "Emergency exit locator signs", group: "Emergency", color: "green", supply: "EMER", cb: "EXIT LOCATOR LTS" },
  { id: "hatch-handle", label: "Overwing hatch handle illumination", group: "Emergency", color: "white", supply: "EMER", cb: "HATCH HANDLE LTS" },
  { id: "overwing-path-l", label: "Overwing emergency path lights L", group: "Emergency", color: "white", supply: "EMER", cb: "OVERWING PATH LTS" },
  { id: "overwing-path-r", label: "Overwing emergency path lights R", group: "Emergency", color: "white", supply: "EMER", cb: "OVERWING PATH LTS" },
  { id: "self-exit", label: "Self-illuminating exit signs", group: "Emergency", color: "green", supply: "EMER", cb: "SELF EXIT SIGNS" },
  { id: "flight-emer", label: "Flight-compartment emergency light", group: "Emergency", color: "white", supply: "BAT", cb: "FLIGHT COMP EMER LT" },
  // Cargo / service compartments
  { id: "fwd-cargo-dome", label: "Forward cargo compartment dome lights", group: "Cabin", color: "white", supply: "AC2", cb: "FWD CARGO LTS" },
  { id: "fwd-cargo-spot", label: "Forward cargo door-frame spotlight", group: "Cabin", color: "white", supply: "AC2", cb: "FWD CARGO SPOT" },
  { id: "aft-cargo-dome", label: "Aft cargo compartment dome lights", group: "Cabin", color: "white", supply: "AC2", cb: "AFT CARGO LTS" },
  { id: "aft-cargo-spot", label: "Aft cargo door-frame spotlight", group: "Cabin", color: "white", supply: "AC2", cb: "AFT CARGO SPOT" },
  { id: "equip-flood", label: "A/C equipment compartment floodlights", group: "Cabin", color: "white", supply: "AC2", cb: "EQUIP COMP LTS" },
  { id: "aft-accessory", label: "Aft accessory compartment light", group: "Cabin", color: "white", supply: "AC2", cb: "AFT ACCESSORY LTS" },
  { id: "apu-comp", label: "APU compartment light", group: "Cabin", color: "white", supply: "AC2", cb: "APU COMP LTS" },
  { id: "tail-cone", label: "Tail-cone compartment light", group: "Cabin", color: "white", supply: "AC2", cb: "TAIL CONE LTS" },
];

export const LIGHT_CBS: string[] = Array.from(new Set(DEFS.map((d) => d.cb)));
export const LIGHT_DEFS = DEFS;

export const lightsInitial = {
  ltRetL: "RETRACT" as "RETRACT" | "EXT" | "ON",
  ltRetR: "RETRACT" as "RETRACT" | "EXT" | "ON",
  ltFixedL: false,
  ltFixedR: false,
  ltTurnoffL: false,
  ltTurnoffR: false,
  ltTaxi: false,
  ltWing: false,
  ltLogo: false,
  ltWheelWell: false,
  ltPosition: "OFF" as "OFF" | "STEADY" | "STROBE_STEADY",
  ltAntiCol: false,
  ltDome: "OFF" as "OFF" | "DIM" | "BRT",
  ltPanelOvhd: 0,
  ltPanelCapt: 0,
  ltPanelFo: 0,
  ltPanelPed: 0,
  ltMapCapt: false,
  ltMapFo: false,
  ltStorm: false,
  ltCompass: false,
  ltObserver: false,
  ltShieldEmer: false,
  ltMasterDim: "BRT" as "BRT" | "DIM",
  ltTest: false,
  ltCabin: "OFF" as "OFF" | "DIM" | "BRT",
  ltEntry: false,
  ltGalley: false,
  ltLav: false,
  ltReading: false,
  ltSidewall: false,
  ltWindow: false,
  ltAttWork: false,
  ltCall: false,
  ltLavMirror: false,
  ltThreshold: false,
  ltCloset: false,
  ltCargo: false,
  ltEquip: false,
  ltAftAccessory: false,
  ltApuComp: false,
  ltTailCone: false,
  ltNoSmoking: "OFF" as "OFF" | "AUTO" | "ON",
  ltSeatBelt: "OFF" as "OFF" | "AUTO" | "ON",
  ltEmergency: "OFF" as "OFF" | "ARMED" | "ON",
  /** ids of lights with a failed bulb / fixture, joined with "," */
  ltFail: "",
  /** names of pulled light circuit breakers, joined with "|" */
  ltCb: "",
};

export type LightsState = typeof lightsInitial;

/** Switch positions only. Presets and "reset controls" use this so they never clear injected bulb failures or pulled breakers. */
const { ltFail: _ltFail, ltCb: _ltCb, ...lightsControlsInitial } = lightsInitial;
void _ltFail; void _ltCb;
export { lightsControlsInitial };

const brt = (v: "OFF" | "DIM" | "BRT") => (v === "BRT" ? 1 : v === "DIM" ? 0.45 : 0);
const b01 = (v: boolean) => (v ? 1 : 0);

function busOn(b: LightBuses, bus: LightBus): boolean {
  switch (bus) {
    case "AC1": return b.ac1;
    case "AC2": return b.ac2;
    case "DC1": return b.dc1;
    case "DC2": return b.dc2;
    case "BAT": return b.bat;
    case "HOT": return b.hot;
    case "28VAC": return b.ac28;
    case "EMER": return true; // own battery pack; charge state is not modelled
  }
}

export function lightFailed(s: Pick<SimState, "ltFail">, id: string): boolean {
  return s.ltFail.split(",").includes(id);
}
export function cbPulled(s: Pick<SimState, "ltCb">, cb: string): boolean {
  return s.ltCb.split("|").includes(cb);
}
export function toggleInList(list: string, item: string, sep: string): string {
  const parts = list ? list.split(sep) : [];
  return (parts.includes(item) ? parts.filter((p) => p !== item) : [...parts, item]).join(sep);
}

export function deriveLights(
  s: SimState,
  b: LightBuses,
  aux: { gearUp: boolean; flaps: number },
): { lights: LightStatus[]; lightComponents: LightComponent[] } {
  const signAuto = { ns: !aux.gearUp, sb: !aux.gearUp || aux.flaps > 0 };
  const signLevel = (m: "OFF" | "AUTO" | "ON", auto: boolean) => (m === "ON" ? 1 : m === "AUTO" && auto ? 1 : 0);
  // Emergency lights: ON, or ARMED and aircraft DC power lost.
  const emerActive = s.ltEmergency === "ON" || (s.ltEmergency === "ARMED" && !b.dc);
  const pos = s.ltPosition !== "OFF";
  const strobe = s.ltPosition === "STROBE_STEADY";

  const cmd: Record<string, number> = {
    "ldg-ret-l": b01(s.ltRetL === "ON"),
    "ldg-ret-r": b01(s.ltRetR === "ON"),
    "ldg-fix-l": b01(s.ltFixedL),
    "ldg-fix-r": b01(s.ltFixedR),
    "rwy-l": b01(s.ltTurnoffL),
    "rwy-r": b01(s.ltTurnoffR),
    taxi: b01(s.ltTaxi),
    wing: b01(s.ltWing),
    logo: b01(s.ltLogo),
    wheelwell: b01(s.ltWheelWell),
    "pos-l": b01(pos), "pos-r": b01(pos), "pos-t": b01(pos),
    "strobe-l": b01(strobe), "strobe-r": b01(strobe), "strobe-t": b01(strobe),
    "beacon-top": b01(s.ltAntiCol), "beacon-bot": b01(s.ltAntiCol),
    dome: brt(s.ltDome),
    "pnl-ovhd": s.ltPanelOvhd, "pnl-capt": s.ltPanelCapt, "pnl-fo": s.ltPanelFo, "pnl-ped": s.ltPanelPed,
    "map-capt": b01(s.ltMapCapt), "map-fo": b01(s.ltMapFo),
    storm: b01(s.ltStorm),
    compass: b01(s.ltCompass), observer: b01(s.ltObserver),
    "shield-emer": b01(emerActive && s.ltShieldEmer),
    "cab-main": brt(s.ltCabin),
    "cab-sidewall": b01(s.ltSidewall), "cab-window": b01(s.ltWindow),
    "att-work": b01(s.ltAttWork), "pass-call": b01(s.ltCall), "lav-call": b01(s.ltCall),
    "lav-mirror": b01(s.ltLavMirror), "threshold": b01(s.ltThreshold), "closet": b01(s.ltCloset),
    airstair: b01(s.ltEntry),
    "fwd-cargo-dome": b01(s.ltCargo), "fwd-cargo-spot": b01(s.ltCargo),
    "aft-cargo-dome": b01(s.ltCargo), "aft-cargo-spot": b01(s.ltCargo),
    "equip-flood": b01(s.ltEquip), "aft-accessory": b01(s.ltAftAccessory), "apu-comp": b01(s.ltApuComp), "tail-cone": b01(s.ltTailCone),
    "cab-entry": b01(s.ltEntry), "cab-galley": b01(s.ltGalley), "cab-lav": b01(s.ltLav), "cab-read": b01(s.ltReading),
    "sign-ns": signLevel(s.ltNoSmoking, signAuto.ns),
    "sign-sb": signLevel(s.ltSeatBelt, signAuto.sb),
    "exit-sign": 1, // energized from normal/emergency source
    "emer-aisle": b01(emerActive), "emer-ovhd": b01(emerActive), "emer-exit": b01(emerActive),
    "exit-locator": b01(emerActive), "hatch-handle": b01(emerActive),
    "overwing-path-l": b01(emerActive), "overwing-path-r": b01(emerActive),
    "self-exit": b01(emerActive), "flight-emer": b01(emerActive),
  };

  const lights: LightStatus[] = DEFS.map((def) => {
    const commanded = Math.max(0, Math.min(1, cmd[def.id] ?? 0));
    const cbOut = cbPulled(s, def.cb);
    const failed = lightFailed(s, def.id);
    let supplyOk = busOn(b, def.supply);
    // Exit signs fall back to the emergency pack when armed/on and normal power is gone.
    if (def.id === "exit-sign" && !supplyOk && emerActive) supplyOk = true;
    const powered = supplyOk && !cbOut;
    const wants = commanded > 0.02;
    let level = wants && powered && !failed ? commanded : 0;
    // Retractable landing lights must be extended to shine; EXT extends without lighting.
    let reason = "";
    if (wants && !powered) reason = cbOut ? "CB OUT" : `NO ${def.supply}`;
    else if (wants && failed) reason = "BULB FAILED";
    if (def.id === "ldg-ret-l" || def.id === "ldg-ret-r") {
      const sel = def.id === "ldg-ret-l" ? s.ltRetL : s.ltRetR;
      const ext = sel !== "RETRACT" && powered;
      if (!reason) reason = sel === "RETRACT" ? "RETRACTED" : ext ? (sel === "ON" ? "" : "EXTENDED · OFF") : `NO ${def.supply}`;
      if (!ext) level = 0;
    }
    // Master DIM only reduces the flight-deck / sign lamps it serves. Storm lights are always full bright.
    if (s.ltMasterDim === "DIM" && def.id !== "storm" && (def.group === "Flight deck" || def.id.startsWith("sign-"))) level *= 0.6;
    return { ...def, commanded, powered, failed, cbOut, lit: level > 0.02, level, reason };
  });

  const byId = (id: string) => lights.find((l) => l.id === id)!;
  const ext = lights.filter((l) => l.group === "Exterior");
  const swOn = [s.ltFixedL, s.ltFixedR, s.ltTurnoffL, s.ltTurnoffR, s.ltTaxi, s.ltWing, s.ltLogo, s.ltWheelWell, s.ltAntiCol].filter(Boolean).length +
    (s.ltRetL !== "RETRACT" ? 1 : 0) + (s.ltRetR !== "RETRACT" ? 1 : 0) + (pos ? 1 : 0);
  const pulled = s.ltCb ? s.ltCb.split("|").length : 0;

  const lightComponents: LightComponent[] = [
    { id: "p5-ext-sw", name: "P5 exterior light switches", group: "Controls", location: "P5 forward overhead", function: "Select landing, turnoff, taxi, wing, logo, position, anti-collision and wheel-well lights.", feeds: "Switch → relay → fixture", powered: true, state: `${swOn} selected` },
    { id: "ret-act-l", name: "Retractable landing light actuator L", group: "Exterior", location: "Left wing, inboard lower surface", function: "Motor extends / retracts the lamp. EXT extends without lighting; ON extends and lights.", feeds: "Landing light L", powered: byId("ldg-ret-l").powered, state: s.ltRetL === "RETRACT" ? "RETRACTED" : byId("ldg-ret-l").powered ? "EXTENDED" : "NO POWER" },
    { id: "ret-act-r", name: "Retractable landing light actuator R", group: "Exterior", location: "Right wing, inboard lower surface", function: "Motor extends / retracts the lamp. EXT extends without lighting; ON extends and lights.", feeds: "Landing light R", powered: byId("ldg-ret-r").powered, state: s.ltRetR === "RETRACT" ? "RETRACTED" : byId("ldg-ret-r").powered ? "EXTENDED" : "NO POWER" },
    { id: "beacon-flasher", name: "Anti-collision flasher / power supply", group: "Exterior", location: "Aft fuselage equipment area", function: "Drives the red top and bottom beacons.", feeds: "Beacon top, beacon bottom", powered: byId("beacon-top").powered || byId("beacon-bot").powered, state: s.ltAntiCol ? "FLASHING" : "OFF" },
    { id: "strobe-psu", name: "Strobe power supply", group: "Exterior", location: "Aft fuselage equipment area", function: "Charges and fires the white wingtip / tail strobes in STROBE & STEADY.", feeds: "Strobe L, R, tail", powered: byId("strobe-l").powered || byId("strobe-r").powered || byId("strobe-t").powered, state: strobe ? "FIRING" : "OFF" },
    { id: "pos-wiring", name: "Position light circuit", group: "Exterior", location: "Wingtips and tail cone", function: "Steady navigation lights: red left, green right, white tail.", feeds: "Position L, R, tail", powered: byId("pos-l").powered || byId("pos-r").powered || byId("pos-t").powered, state: pos ? "STEADY" : "OFF" },
    { id: "master-dim", name: "MASTER DIM & TEST switch", group: "Controls", location: "P5 overhead", function: "BRT / DIM sets annunciator brightness; TEST lights every annunciator lamp.", feeds: "Flight-deck annunciators", powered: b.dc, state: s.ltTest ? "TEST" : s.ltMasterDim },
    { id: "panel-dimmers", name: "Panel light dimmers", group: "Flight deck", location: "P5 overhead, pilots' panels, pedestal", function: "Rheostats for overhead, Captain, First Officer and pedestal lighting.", feeds: "Panel and instrument lighting", powered: b.ac28, state: `OVHD ${Math.round(s.ltPanelOvhd * 100)}% · CAPT ${Math.round(s.ltPanelCapt * 100)}% · F/O ${Math.round(s.ltPanelFo * 100)}% · PED ${Math.round(s.ltPanelPed * 100)}%` },
    { id: "ac28-xfmr", name: "28 V AC lighting transformers", group: "Power", location: "Electrical / electronic equipment bay", function: "Step the 115 V AC system down to 28 V AC for panel and reading lights.", feeds: "Panel lighting, passenger reading lights", powered: b.ac28, state: b.ac28 ? "ENERGIZED" : "OFF" },
    { id: "fa-panel", name: "Flight attendant lighting panel", group: "Cabin", location: "Forward attendant panel", function: "Cabin BRT / DIM / OFF, entry, galley and lavatory lights.", feeds: "Cabin, entry, galley, lav lights", powered: byId("cab-main").powered || byId("cab-entry").powered, state: `CABIN ${s.ltCabin}` },
    { id: "cab-ballasts", name: "Cabin fluorescent ballasts", group: "Cabin", location: "Ceiling and sidewall light strips", function: "Start and run the cabin fluorescent tubes; DIM reduces output.", feeds: "Passenger cabin lights", powered: byId("cab-main").powered, state: byId("cab-main").lit ? (s.ltCabin === "DIM" ? "DIM" : "BRIGHT") : "OFF" },
    { id: "sign-logic", name: "Passenger sign relay + AUTO logic", group: "Cabin", location: "Overhead / relay panel", function: "AUTO lights NO SMOKING with gear not up; FASTEN SEAT BELTS with gear not up or flaps extended.", feeds: "NO SMOKING, FASTEN SEAT BELTS", powered: byId("sign-ns").powered, state: `NS ${s.ltNoSmoking} · SB ${s.ltSeatBelt}` },
    { id: "emer-sw", name: "EMER LIGHTS switch", group: "Controls", location: "P5 overhead (guarded)", function: "OFF / ARMED / ON. ARMED turns the emergency lights on automatically when DC power is lost.", feeds: "Emergency light pack", powered: true, state: s.ltEmergency },
    { id: "emer-pack", name: "Emergency light battery pack", group: "Emergency", location: "Cabin / aft equipment area", function: "Own battery: supplies aisle, overhead, exit-area lights and exit signs when normal power is lost.", feeds: "Emergency lights, exit signs", powered: true, state: emerActive ? "DISCHARGING" : s.ltEmergency === "ARMED" ? "READY · CHARGING" : "STANDBY" },
    { id: "light-cbs", name: "Lighting circuit breakers", group: "Controls", location: "P6 circuit breaker panels", function: "Protect each lighting circuit; a pulled breaker kills every light on it.", feeds: `${LIGHT_CBS.length} breakers`, powered: true, state: pulled ? `${pulled} PULLED` : "ALL IN" },
  ];
  void ext;
  return { lights, lightComponents };
}
