import type { SimState } from "@/lib/sim/types";
import { derive } from "@/lib/sim/derive";

export interface ProcStep {
  id: string;
  title: string;
  why: string;
  hint: string;
  done: (s: SimState) => boolean;
}

export type ProcedureCategory = "normal" | "emergency";

export interface Procedure {
  id: string;
  category: ProcedureCategory;
  title: string;
  ata: string;
  summary: string;
  steps: ProcStep[];
}

export const PROCEDURES: Procedure[] = [
  {
    id: "apu-start",
    category: "normal",
    title: "APU start",
    ata: "49",
    summary: "Watch the real sequence: fuel valve, inlet door, starter lockout, then 95% arming.",
    steps: [
      {
        id: "bat",
        title: "Battery on",
        why: "APU control, the door actuator, and fire circuits are 28V DC.",
        hint: "BAT switch on the status strip.",
        done: (s) => s.battery,
      },
      {
        id: "master",
        title: "APU MASTER to ON",
        why: "ON opens the fuel shutoff valve. The door will not move until that valve is fully open.",
        hint: "Overhead APU rotary — first detent.",
        done: (s) => s.apuMaster !== "OFF" || s.apuFuelValve > 0.9,
      },
      {
        id: "door",
        title: "Wait for inlet door full open",
        why: "A door position switch releases the starter lockout relay. Cycle is ~17–20 s in the aircraft (sped up here).",
        hint: "Watch the tail inlet on the airframe and the DOOR gauge.",
        done: (s) => s.apuDoor > 0.97,
      },
      {
        id: "start",
        title: "APU MASTER to START",
        why: "START engages the starter motor only after the door reports fully open.",
        hint: "Spring-loaded START. It will return to ON as rpm rises.",
        done: (s) => s.apuRpm > 20 || s.apuMaster === "START",
      },
      {
        id: "oil",
        title: "Confirm LOW OIL PRESSURE extinguishes",
        why: "The AMM says the APU low-oil-pressure light comes on immediately after START and extinguishes when oil pressure reaches 55 psi.",
        hint: "Watch APU OIL PSI and the LOW OIL PRESS annunciator.",
        done: (s) => s.apuOilPsi >= 55,
      },
      {
        id: "avail",
        title: "Stabilize at 95%+",
        why: "At service speed the APU is available for pneumatic or electrical power when the appropriate controls are selected.",
        hint: "APU % gauge and APU GEN OFF BUS light.",
        done: (s) => derive(s).apuAvailable,
      },
    ],
  },
  {
    id: "engine-start",
    category: "normal",
    title: "Engine start on APU air",
    ata: "80 / 36",
    summary: "APU bleed into the manifold, starter valve, N2, fuel at IDLE, starter cutout.",
    steps: [
      {
        id: "apu",
        title: "APU available",
        why: "The pneumatic starting system can use APU air, a ground pneumatic source, or cross-bleed air from an operating engine.",
        hint: "Complete APU start, or connect the ground pneumatic cart.",
        done: (s) => derive(s).apuAvailable || s.groundPneumaticConnected,
      },
      {
        id: "bleed",
        title: "APU BLEED OPEN",
        why: "The valve opens in 12–14 s so APU speed does not droop. Duct pressure should rise through ~40 psi.",
        hint: "APU BLEED switch. Watch duct PSI.",
        done: (s) => s.apuBleed && s.apuBleedValve > 0.7,
      },
      {
        id: "pack",
        title: "Packs off (training tip)",
        why: "Packs steal manifold air. For a strong start, close them so the starter sees full duct pressure.",
        hint: "L PACK and R PACK off.",
        done: (s) => !s.packL && !s.packR,
      },
      {
        id: "grd",
        title: "Engine 1 START to GRD",
        why: "Energizes the starter-valve solenoid. START VALVE OPEN must illuminate.",
        hint: "START 1 rotary to GRD.",
        done: (s) => s.start1 === "GRD" || s.n2_1 > 15,
      },
      {
        id: "idle",
        title: "Start lever IDLE at ~20% N2",
        why: "Introduces fuel and fires the igniters. EGT and fuel flow come alive.",
        hint: "ENG 1 start lever.",
        done: (s) => s.lever1 && s.n2_1 > 20,
      },
      {
        id: "cutout",
        title: "Starter cutout 35–40% N2",
        why: "The valve must close. A light that stays on after cutout is an immediate shutdown item.",
        hint: "Watch START VALVE OPEN go dark and N2 continue climbing.",
        done: (s) => derive(s).eng1Running,
      },
    ],
  },
  {
    id: "dual-bleed",
    category: "normal",
    title: "Dual bleed caution",
    ata: "36",
    summary: "See why APU bleed and engine bleed together light DUAL BLEED and MASTER CAUTION.",
    steps: [
      {
        id: "apu-b",
        title: "APU running with bleed open",
        why: "APU is a ground/backup pneumatic source on the same manifold as the engines.",
        hint: "Use the APU running preset, APU BLEED on.",
        done: (s) => derive(s).apuAvailable && s.apuBleed,
      },
      {
        id: "eng",
        title: "Open an engine bleed with APU bleed cross-feed",
        why: "With APU BLEED open, an engine BLEED valve open, and the isolation valve open, the DUAL BLEED warning illuminates.",
        hint: "With APU BLEED ON, set ISOLATION OPEN and then BLEED 1 ON.",
        done: (s) => derive(s).dualBleed,
      },
      {
        id: "fix",
        title: "Close APU bleed",
        why: "Standard: after engine bleed is available, APU bleed off. Isolation AUTO manages the rest.",
        hint: "APU BLEED off. DUAL BLEED should go dark.",
        done: (s) => derive(s).eng1Running && s.bleed1 && !derive(s).dualBleed,
      },
    ],
  },
  {
    id: "hydraulics",
    category: "normal",
    title: "Hydraulic A / B / standby",
    ata: "29",
    summary: "Engine pumps make A. Electric pumps make B. Standby covers rudder and leading edges if A dies.",
    steps: [
      {
        id: "eng",
        title: "Run at least one engine",
        why: "System A engine-driven pumps live on the accessory gearboxes.",
        hint: "Complete an engine start, ENG HYD pumps on.",
        done: (s) => (derive(s).eng1Running || derive(s).eng2Running) && s.hydAPress > 2000,
      },
      {
        id: "elec",
        title: "Put an AC source on the bus, then ELEC HYD",
        why: "System B pumps are 115V AC motor-driven. APU GEN or engine GEN must be on.",
        hint: "APU GEN or GEN 1, then ELEC 1 HYD PUMP.",
        done: (s) => s.hydBPress > 2000,
      },
      {
        id: "leak",
        title: "Inject a System A leak",
        why: "LOW PRESSURE on A. In AUTO, the standby pump should pick up rudder / LE devices.",
        hint: "Faults → System A leak. Watch STBY RUD ON.",
        done: (s) => s.faults.hydALeak && derive(s).stbyOn,
      },
    ],
  },
  {
    id: "gear",
    category: "normal",
    title: "Gear cycle",
    ata: "32",
    summary: "Gear is System A only. Airborne logic is simulated by lifting weight-on-wheels.",
    steps: [
      {
        id: "press",
        title: "System A pressurized",
        why: "Selector valve, actuators, uplocks, and steering all drink from A.",
        hint: "Engines running with ENG HYD pumps on.",
        done: (s) => s.hydAPress > 2000 || (s.hydGroundPowerConnected && s.groundInterconnect && s.wow && s.parkingBrake && derive(s).hydB > 1500),
      },
      {
        id: "air",
        title: "Lift weight-on-wheels",
        why: "On the ground the lever latch and steering logic assume WOW. Training: go AIR.",
        hint: "AIR / GND toggle on the status strip.",
        done: (s) => !s.wow,
      },
      {
        id: "up",
        title: "Gear lever UP",
        why: "Cable/drum to the selector valve. Watch the trucks tuck into the wells.",
        hint: "GEAR UP. Transit lights until uplock.",
        done: (s) => s.gearPos < 0.08,
      },
      {
        id: "dn",
        title: "Gear lever DN",
        why: "Reverse the selector. Confirm three green (gear down and locked).",
        hint: "GEAR DN.",
        done: (s) => s.gear === "DN" && s.gearPos > 0.95,
      },
    ],
  },
  {
    id: "emergency-gear-selector-position-disagree",
    category: "emergency",
    title: "Landing gear selector / position disagreement",
    ata: "32",
    summary: "Recognize a mismatch between the LANDING GEAR selector and the actual gear position, then use the independent manual-extension releases when normal hydraulic extension is unavailable.",
    steps: [
      {
        id: "identify",
        title: "Confirm selector / gear position disagreement",
        why: "The warning condition exists when the selector commands UP while any gear is not up, or commands DN while any gear is not down-and-locked.",
        hint: "Check the three individual gear indications and the selector/position agreement display in the Servicing / Test panel.",
        done: (s) => derive(s).gearPositionDisagree,
      },
      {
        id: "off",
        title: "Return the landing gear selector to OFF",
        why: "The simulator requires the selector to be OFF before an individual manual-extension T-handle can be operated.",
        hint: "Select OFF, then verify the selector no longer commands hydraulic movement.",
        done: (s) => derive(s).gearPositionDisagree && s.gear === "OFF",
      },
      {
        id: "manual",
        title: "Manually extend the affected gear",
        why: "Each manual-extension release is independent. Pulling a T-handle releases only its corresponding uplock; that gear then travels through its full range to down-and-locked without moving the other two gears.",
        hint: "Pull and release the NOSE, LEFT MAIN, or RIGHT MAIN manual-extension handle corresponding to the gear that has not reached down-and-locked.",
        done: (s) => derive(s).gearDown,
      },
      {
        id: "verify",
        title: "Verify all three gears down and locked",
        why: "The final condition is three independent down-and-locked positions with the corresponding green indications and no selector/position disagreement.",
        hint: "Confirm NOSE, LEFT MAIN, and RIGHT MAIN are DOWN / LOCKED and the disagreement indication is clear.",
        done: (s) => {
          const d = derive(s);
          return d.gearDown && !d.gearPositionDisagree;
        },
      },
    ],
  },
  {
    id: "emergency-engine-fire",
    category: "emergency",
    title: "Engine fire — fire-system response",
    ata: "26",
    summary: "Training sequence based on the supplied 737-200 fire-protection description: detect, isolate the engine, arm the extinguisher, then select a bottle.",
    steps: [
      {
        id: "detect",
        title: "Confirm ENGINE FIRE warning",
        why: "The fire-warning system provides the visual warning; the handle is the response, not the cause of the warning.",
        hint: "Inject ENGINE 1 or ENGINE 2 FIRE from the separate Training Console Fault Injection panel.",
        done: (s) => s.faults.engineFire1 || s.faults.engineFire2,
      },
      {
        id: "pull",
        title: "Pull the affected engine fire handle",
        why: "The supplied ATA 26 description states that pulling the handle arms the extinguishing system and shuts down the engine and associated components.",
        hint: "Use the actual P8 fire handle or the corresponding cockpit control — do not use the fault injector as the response.",
        done: (s) => (s.faults.engineFire1 && s.engine1FirePulled) || (s.faults.engineFire2 && s.engine2FirePulled),
      },
      {
        id: "isolate",
        title: "Verify engine isolation effects",
        why: "The supplied fire-system test procedure observes fuel shutoff, System A hydraulic shutoff, engine bleed-valve closure and generator low-voltage indication after handle operation.",
        hint: "Watch the component/system-flow display and P5/P1-P3 indications.",
        done: (s) => {
          const d = derive(s);
          const engine1Stopped = s.engine1FirePulled && !d.eng1Running;
          const engine2Stopped = s.engine2FirePulled && !d.eng2Running;
          return engine1Stopped || engine2Stopped;
        },
      },
      {
        id: "bottle",
        title: "Select an extinguisher bottle",
        why: "After the handle is armed, the engine fire switch can be rotated to select the applicable bottle discharge path.",
        hint: "Rotate the pulled handle in the simulator. The two bottle paths are represented separately.",
        done: (s) => s.fireBottleLDischarged || s.fireBottleRDischarged,
      },
    ],
  },
  {
    id: "emergency-apu-fire",
    category: "emergency",
    title: "APU fire — normal / remote response",
    ata: "26",
    summary: "Training sequence for the APU fire system, including the separate remote wheel-well control panel.",
    steps: [
      {
        id: "detect",
        title: "Confirm APU FIRE warning",
        why: "The supplied ATA 26 description identifies APU fire warning and the associated cockpit/remote indications.",
        hint: "Inject APU FIRE from Fault Injection.",
        done: (s) => s.faults.apuFireDetected,
      },
      {
        id: "pull",
        title: "Pull the APU fire handle",
        why: "Pulling the APU fire handle arms the extinguishing system and shuts down the APU and associated components.",
        hint: "Use the cockpit APU FIRE control, or the remote wheel-well control when the procedure is being trained from that station.",
        done: (s) => s.apuFirePulled,
      },
      {
        id: "shutdown",
        title: "Verify APU shutdown / isolation",
        why: "The APU fire system is designed to shut down the APU before the extinguisher is discharged.",
        hint: "Watch APU RPM, fuel/inlet-door state and the fire-system component chain.",
        done: (s) => s.apuFirePulled && s.apuRpm < 10,
      },
      {
        id: "discharge",
        title: "Discharge the APU bottle",
        why: "The supplied manual states that the bottle may be discharged after the fire switch is pulled; the remote panel uses a spring-loaded discharge switch.",
        hint: "Use the APU BOTTLE DISCH control after the handle is armed.",
        done: (s) => s.apuBottleFired,
      },
    ],
  },
  {
    id: "emergency-hydraulic-a-loss",
    category: "emergency",
    title: "System A hydraulic loss — standby response",
    ata: "29 / 27",
    summary: "Train the loss of System A and observe the standby hydraulic path to the rudder and leading-edge devices.",
    steps: [
      {
        id: "fault",
        title: "Inject System A hydraulic loss",
        why: "The training fault represents loss of System A pressure rather than directly moving a final indication.",
        hint: "Fault Injection → System A leak.",
        done: (s) => s.faults.hydALeak,
      },
      {
        id: "standby",
        title: "Confirm standby hydraulic activation",
        why: "The simulator models standby hydraulic power for the rudder and leading-edge devices when normal hydraulic authority is unavailable.",
        hint: "Watch STBY RUD and the hydraulic component flow.",
        done: (s) => derive(s).standbyRudderPowered,
      },
      {
        id: "control",
        title: "Exercise the rudder",
        why: "The standby system is represented as the alternate hydraulic source for rudder control in this trainer.",
        hint: "Move the rudder pedals and observe the rudder surface/PCU response.",
        done: (s) => Math.abs(s.rudderPedal) > 0.1,
      },
    ],
  },
  {
    id: "emergency-electrical-source-loss",
    category: "emergency",
    title: "DC source loss — backup path",
    ata: "24",
    summary: "Inject a transformer-rectifier failure and observe the backup DC path and indications.",
    steps: [
      {
        id: "source",
        title: "Establish normal electrical power",
        why: "The backup path is meaningful only when the normal DC distribution is operating first.",
        hint: "Use APU or engine generation and confirm DC power on the electrical indication panel.",
        done: (s) => derive(s).dcPower,
      },
      {
        id: "fault",
        title: "Inject a TR failure",
        why: "The supplied ATA 24 material describes TR3 as the backup DC source path and emphasizes observing breakers, lights and annunciations when troubleshooting.",
        hint: "Fault Injection → TR1 or TR2 failure.",
        done: (s) => s.faults.tr1Failure || s.faults.tr2Failure,
      },
      {
        id: "backup",
        title: "Observe the backup DC path",
        why: "Watch the TR indication, affected DC bus and the simulator's component-flow representation rather than changing a final indication directly.",
        hint: "Open Component / System Flow and inspect the DC path.",
        done: (s) => {
          const d = derive(s);
          return (s.faults.tr1Failure || s.faults.tr2Failure) && d.dcPower;
        },
      },
    ],
  },

];
