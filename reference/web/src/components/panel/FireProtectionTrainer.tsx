import { useEffect, useState, type ReactNode } from "react";
import { useDerived, useSim } from "@/lib/sim/store";
import { EngineCutaway } from "@/components/panel/EngineCutaway";
import { ApuDiagram } from "@/components/panel/ApuDiagram";

/**
 * Fire Protection trainer. Uses the same JT8D cutaway and APU diagram as the
 * Engine Start / APU panels (driven by the same sim state), with fire-loop,
 * flame and extinguishing-agent overlays on top, plus wheel well and cargo
 * compartment scenes, handles/bottles, mitigation checklists and the
 * electrical / hydraulic / pneumatic power that each action removes.
 */

const OK = "#3dd68c", WARN = "#e24b4b", CAUT = "#e0a84a", SUB = "#7d8895";
const btn = "rounded border border-border bg-inset px-2 py-2 text-[9px] font-display uppercase tracking-wide text-fg hover:bg-panel disabled:opacity-40";
const btnWarn = "rounded border border-warn/50 bg-warn/10 px-2 py-2 text-[9px] font-display uppercase tracking-wide text-fg disabled:opacity-40";
const btnOn = "rounded border border-accent bg-panel px-2 py-2 text-[9px] font-display uppercase tracking-wide text-fg disabled:opacity-40";

function Chip({ label, value, on, warn }: { label: string; value?: string; on: boolean; warn?: boolean }) {
  return (
    <div className="rounded border border-border bg-inset px-1.5 py-1 text-center font-mono text-[8px] uppercase leading-tight">
      <div className="text-subtle">{label}</div>
      <div className={warn ? "text-warn" : on ? "text-ok" : "text-subtle"}>{value ?? (on ? "ON" : "OFF")}</div>
    </div>
  );
}

/** Flame cluster in the host SVG's own units. `size` is the flame height. */
function Flames({ cx, base, size, n = 3, spread = 1 }: { cx: number; base: number; size: number; n?: number; spread?: number }) {
  const w = size * 0.42;
  return (
    <g>
      {Array.from({ length: n }).map((_, i) => {
        const dx = (i - (n - 1) / 2) * w * 1.15 * spread;
        const h = size * (i % 2 ? 0.8 : 1.0);
        const x = cx + dx;
        return (
          <g key={i}>
            <path d={`M${x - w} ${base} C${x - w * 1.3} ${base - h * 0.4} ${x - w * 0.1} ${base - h * 0.55} ${x} ${base - h} C${x + w * 0.2} ${base - h * 0.55} ${x + w * 1.3} ${base - h * 0.4} ${x + w} ${base} Z`} fill="#ff5a36" opacity={0.92}>
              <animate attributeName="opacity" values="0.95;0.5;0.95" dur={`${0.45 + i * 0.13}s`} repeatCount="indefinite" />
            </path>
            <path d={`M${x - w * 0.5} ${base} C${x - w * 0.65} ${base - h * 0.3} ${x} ${base - h * 0.35} ${x} ${base - h * 0.62} C${x + w * 0.1} ${base - h * 0.35} ${x + w * 0.65} ${base - h * 0.3} ${x + w * 0.5} ${base} Z`} fill="#ffc94a" opacity={0.95}>
              <animate attributeName="opacity" values="1;0.55;1" dur={`${0.38 + i * 0.11}s`} repeatCount="indefinite" />
            </path>
          </g>
        );
      })}
    </g>
  );
}

/** White extinguishing-agent mist puffs. */
function Mist({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g>
      {[0, 1, 2, 3, 4].map((i) => (
        <circle key={i} cx={cx + (i - 2) * r * 0.55} cy={cy + (i % 2 ? -1 : 1) * r * 0.25} r={r * (0.5 + (i % 3) * 0.18)} fill="#f2f6fa" opacity={0.42}>
          <animate attributeName="opacity" values="0.15;0.5;0.15" dur={`${1.1 + i * 0.2}s`} repeatCount="indefinite" />
        </circle>
      ))}
    </g>
  );
}

function Card({ title, state, tone, children }: { title: string; state: string; tone: "ok" | "warn" | "caution" | "sub"; children: ReactNode }) {
  const c = tone === "warn" ? "border-warn/70" : tone === "caution" ? "border-caution/60" : "border-border";
  const tc = tone === "warn" ? "text-warn" : tone === "caution" ? "text-caution" : tone === "ok" ? "text-ok" : "text-subtle";
  return (
    <div className={`rounded-lg border ${c} bg-panel/40 p-2`}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="font-display text-[10px] uppercase tracking-wider text-fg">{title}</span>
        <span className={`text-right font-mono text-[8px] uppercase ${tc}`}>{state}</span>
      </div>
      {children}
    </div>
  );
}

export function FireProtectionTrainer() {
  const s = useSim();
  const d = useDerived();
  const [test, setTest] = useState(false);
  const [stubborn, setStubborn] = useState(false); // fire survives the first bottle
  const [mist, setMist] = useState<Record<string, number>>({});
  useEffect(() => { if (!test) return; const id = setTimeout(() => setTest(false), 3000); return () => clearTimeout(id); }, [test]);
  useEffect(() => {
    if (!Object.keys(mist).length) return;
    const id = setInterval(() => setMist((m) => Object.fromEntries(Object.entries(m).filter(([, t]) => Date.now() - t < 5000))), 700);
    return () => clearInterval(id);
  }, [mist]);
  const puff = (k: string) => setMist((m) => ({ ...m, [k]: Date.now() }));

  const f = s.faults;
  const dc = d.dcPower;
  const lit = (real: boolean) => real || (test && dc);
  const gearAvg = (s.noseGearPos + s.leftMainGearPos + s.rightMainGearPos) / 3;
  const wwWarn = dc && s.wheelWellFire;
  // Use derived warnings so effectivity (SB 26A1081) and dual-loop health are respected.
  const cfWarn = d.cargoFwdFireWarn;
  const caWarn = d.cargoAftFireWarn;

  // ---------- actions ----------------------------------------------------------
  const pullEng = (n: 1 | 2) => {
    const p = n === 1 ? s.engine1FirePulled : s.engine2FirePulled;
    const detected = n === 1 ? f.engineFire1 : f.engineFire2;
    if (!p && !detected) return;
    s.patch(n === 1 ? { engine1FirePulled: !p } : { engine2FirePulled: !p },
      p ? `ENG ${n} fire handle reset.` : `ENG ${n} FIRE handle pulled — fuel, bleed, generator and engine hydraulic supply isolated.`);
  };
  const discharge = (n: 1 | 2, b: "L" | "R") => {
    const pulled = n === 1 ? s.engine1FirePulled : s.engine2FirePulled;
    const already = b === "L" ? s.fireBottleLDischarged : s.fireBottleRDischarged;
    if (!pulled || already) return;
    const persists = stubborn && !(s.fireBottleLDischarged || s.fireBottleRDischarged);
    puff(`e${n}`);
    s.patch({ ...(b === "L" ? { fireBottleLDischarged: true } : { fireBottleRDischarged: true }), ...(persists ? {} : { faults: n === 1 ? { engineFire1: false } : { engineFire2: false } }) } as never,
      persists ? `ENG ${n} bottle ${b} discharged — FIRE PERSISTS. Discharge the other bottle.` : `ENG ${n} fire handle rotated ${b === "L" ? "LEFT" : "RIGHT"} — bottle ${b} discharged, fire out.`);
  };
  const pullApu = () => {
    if (!s.apuFirePulled && !f.apuFireDetected) return;
    s.patch({ apuFirePulled: !s.apuFirePulled }, s.apuFirePulled ? "APU fire handle reset." : "APU FIRE handle pulled — APU shut down, fuel, bleed and generator isolated.");
  };
  const dischargeApu = () => {
    if (!s.apuFirePulled || s.apuBottleFired) return;
    puff("apu"); s.patch({ apuBottleFired: true, faults: { apuFireDetected: false } } as never, "APU bottle discharged, fire out.");
  };
  const cargoArm = (c: "FWD" | "AFT") => {
    if (!s.cargoFireInstalled) return;
    s.patch({ cargoArmed: s.cargoArmed === c ? "NONE" : c }, s.cargoArmed === c ? "CARGO FIRE ARM selector OFF." : `CARGO FIRE ARM — ${c} compartment selected.`);
  };
  const cargoDischarge = () => {
    if (!s.cargoFireInstalled || s.cargoArmed === "NONE" || s.cargoBottleDischarged) return;
    puff("cargo"); s.patch({ cargoBottleDischarged: true, cargoAgentTimer: 0 }, `CARGO FIRE DISCH — agent released into the ${s.cargoArmed} compartment.`);
  };
  const setup = () => {
    s.readyApu();
    s.patch({
      battery: true, gen1: true, gen2: true, bleed1: true, bleed2: true, lever1: true, lever2: true,
      n1_1: 35, n1_2: 35, n2_1: 62, n2_2: 62, egt1: 380, egt2: 380, engHyd1: true, engHyd2: true, elecHyd1: true, elecHyd2: true,
      hydAPress: 3000, hydBPress: 3000, gear: "DN", noseGearPos: 1, leftMainGearPos: 1, rightMainGearPos: 1, gearPos: 1,
      engine1FirePulled: false, engine2FirePulled: false, apuFirePulled: false, apuBottleFired: false,
      fireBottleLDischarged: false, fireBottleRDischarged: false,
      wheelWellFire: false, wheelWellLevel: 0, cargoFwdFire: false, cargoAftFire: false, cargoFwdLevel: 0, cargoAftLevel: 0,
      cargoArmed: "NONE", cargoBottleDischarged: false, cargoAgentTimer: 0,
      faults: { engineFire1: false, engineFire2: false, apuFireDetected: false },
    } as never, "Fire trainer: engines and APU running, gear down, all bottles charged.");
  };
  const clearAll = () => { setMist({}); s.patch({
    engine1FirePulled: false, engine2FirePulled: false, apuFirePulled: false, apuBottleFired: false,
    fireBottleLDischarged: false, fireBottleRDischarged: false,
    wheelWellFire: false, wheelWellLevel: 0, cargoFwdFire: false, cargoAftFire: false, cargoFwdLevel: 0, cargoAftLevel: 0,
    cargoArmed: "NONE", cargoBottleDischarged: false, cargoAgentTimer: 0,
    faults: { engineFire1: false, engineFire2: false, apuFireDetected: false },
  } as never, "Fire trainer: fires cleared, handles reset, bottles recharged."); };
  const inject = (k: "engineFire1" | "engineFire2" | "apuFireDetected") => s.patch({ faults: { [k]: true } } as never, `Fire injected: ${k === "engineFire1" ? "ENG 1" : k === "engineFire2" ? "ENG 2" : "APU"}.`);

  // ---------- per-engine data ------------------------------------------------------
  const eng = (n: 1 | 2) => {
    const pulled = n === 1 ? s.engine1FirePulled : s.engine2FirePulled;
    const fire = n === 1 ? f.engineFire1 : f.engineFire2;
    const lever = n === 1 ? s.lever1 : s.lever2;
    const n2 = n === 1 ? s.n2_1 : s.n2_2;
    const running = n === 1 ? d.eng1Running : d.eng2Running;
    const genBus = n === 1 ? d.generator1BusPowered : d.generator2BusPowered;
    const pump = n === 1 ? d.hydAPump1On : d.hydAPump2On;
    const bleedOk = n === 1 ? d.bleed1Available : d.bleed2Available;
    const manifold = n === 1 ? d.leftManifold : d.rightManifold;
    const psi = n === 1 ? d.leftDuctPsi : d.rightDuctPsi;
    const fuel = !pulled && lever && n2 > 18;
    return { n, pulled, fire, running, fuel, genBus, pump, bleedOk: bleedOk && manifold, psi, lever, n2,
      n1v: n === 1 ? s.n1_1 : s.n1_2, egt: n === 1 ? s.egt1 : s.egt2, valve: n === 1 ? d.startValveOpen1 : d.startValveOpen2 };
  };

  const engineCard = (n: 1 | 2) => {
    const e = eng(n);
    const agent = s.fireBottleLDischarged || s.fireBottleRDischarged;
    const loop = e.fire ? WARN : e.pulled ? SUB : OK;
    const state = e.fire ? (e.pulled ? "FIRE · HANDLE PULLED" : "FIRE") : e.pulled ? "SHUT DOWN · HANDLE PULLED" : e.running ? "RUNNING · NORMAL" : "SHUT DOWN";
    return (
      <Card title={`Engine ${n} · fire protection`} state={state} tone={e.fire ? "warn" : e.pulled ? "caution" : "ok"}>
        <div className="relative">
          <EngineCutaway side={n} n1={e.n1v} n2={e.n2} egt={e.egt} starterOn={e.valve} fuelOn={e.fuel} running={e.running} />
          <svg viewBox="0 0 1581 506" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
            <defs><radialGradient id={`eg${n}`}><stop offset="0" stopColor="#ff8a3a" stopOpacity="0.85" /><stop offset="1" stopColor="#ff3b1f" stopOpacity="0" /></radialGradient></defs>
            {/* fire detector loops A (top) and B (bottom) along the case */}
            <path d="M250 96 H640 L740 118 H1120" fill="none" stroke={loop} strokeWidth={5} strokeDasharray="16 9" opacity={0.95} />
            <path d="M250 428 H640 L740 410 H1120" fill="none" stroke={loop} strokeWidth={5} strokeDasharray="16 9" opacity={0.95} />
            {[330, 560, 830, 1060].map((x) => (
              <g key={x}>
                <circle cx={x} cy={x > 700 ? 118 : 96} r={9} fill="#0b0d10" stroke={loop} strokeWidth={3} />
                <circle cx={x} cy={x > 700 ? 410 : 428} r={9} fill="#0b0d10" stroke={loop} strokeWidth={3} />
              </g>
            ))}
            <text x={252} y={76} fontSize={26} fill={loop} fontFamily="monospace" fontWeight={700}>{e.fire ? "FIRE LOOP A + B TRIPPED" : e.pulled ? "LOOPS · HANDLE PULLED" : "FIRE LOOP A / B · NORMAL"}</text>
            {e.fire && (
              <g>
                <ellipse cx={820} cy={260} rx={330} ry={200} fill={`url(#eg${n})`}><animate attributeName="opacity" values="0.9;0.4;0.9" dur="0.8s" repeatCount="indefinite" /></ellipse>
                <Flames cx={760} base={150} size={150} n={3} spread={1.5} />
                <Flames cx={900} base={400} size={110} n={2} spread={1.6} />
              </g>
            )}
            {agent && mist[`e${n}`] && <Mist cx={820} cy={250} r={90} />}
            {/* isolation valves at the case */}
            {([["FUEL", 300], ["HYD", 470], ["BLEED", 640]] as [string, number][]).map(([l, x]) => (
              <g key={l}>
                <rect x={x - 55} y={452} width={110} height={34} rx={7} fill="#0b0d10" stroke={e.pulled ? WARN : OK} strokeWidth={3} />
                <text x={x} y={476} fontSize={22} textAnchor="middle" fill={e.pulled ? WARN : OK} fontFamily="monospace" fontWeight={700}>{l} {e.pulled ? "SHUT" : "OPEN"}</text>
              </g>
            ))}
          </svg>
        </div>
        <div className="mt-1.5 grid grid-cols-4 gap-1">
          <Chip label="FUEL" on={e.fuel} value={e.fuel ? "FLOW" : "CUT OFF"} />
          <Chip label={`GEN ${n}`} on={e.genBus} value={e.genBus ? "ON BUS" : "OFF BUS"} />
          <Chip label="HYD A PUMP" on={e.pump} value={e.pump ? "SUPPLIED" : "NO SUPPLY"} />
          <Chip label="BLEED" on={e.bleedOk} value={e.bleedOk ? `${Math.round(e.psi)} PSI` : "NO BLEED"} />
        </div>
        <div className="mt-1.5 grid grid-cols-4 gap-1">
          <button className={e.pulled ? btnWarn : btn} disabled={!e.pulled && !e.fire} onClick={() => pullEng(n)}>{e.pulled ? "Pulled · reset" : e.fire ? "Pull fire handle" : "Handle locked · no fire"}</button>
          <button className={btn} disabled={!e.pulled || s.fireBottleLDischarged} onClick={() => discharge(n, "L")}>◀ Bottle L</button>
          <button className={btn} disabled={!e.pulled || s.fireBottleRDischarged} onClick={() => discharge(n, "R")}>Bottle R ▶</button>
          <button className={btnWarn} onClick={() => inject(n === 1 ? "engineFire1" : "engineFire2")}>Inject fire</button>
        </div>
        <div className="mt-1 text-center font-mono text-[8px] uppercase">
          <span className={s.fireBottleLDischarged ? "text-caution" : "text-ok"}>BOTTLE L {s.fireBottleLDischarged ? "DISCHARGED" : "CHARGED"}</span> · <span className={s.fireBottleRDischarged ? "text-caution" : "text-ok"}>BOTTLE R {s.fireBottleRDischarged ? "DISCHARGED" : "CHARGED"}</span> <span className="text-subtle">(shared by both engines)</span>
        </div>
      </Card>
    );
  };

  // ---------- APU -----------------------------------------------------------------
  const apuFire = f.apuFireDetected;
  const apuBleedOn = s.apuBleed && s.apuBleedValve > 0.5 && !s.apuFirePulled;
  const apuGen = s.apuGen && d.apuGenOnBus;
  const doorJammed = s.faults.apuDoorJam && s.apuMaster !== "OFF" && s.apuFuelValve > 0.98 && s.apuDoor < 0.98;
  const apuLoop = apuFire ? WARN : s.apuFirePulled ? SUB : OK;

  // ---------- lists (mitigation) -----------------------------------------------------
  const anyBottle = s.fireBottleLDischarged || s.fireBottleRDischarged;
  const lists: { title: string; steps: [string, boolean][]; note?: string }[] = [];
  const engList = (n: 1 | 2) => {
    const e = eng(n);
    if (!e.fire && !e.pulled) return;
    lists.push({
      title: `ENG ${n} FIRE / SEVERE DAMAGE`,
      steps: [
        [`Thrust lever ${n} — CLOSE (retard to idle)`, !e.lever || e.pulled],
        [`ENG ${n} FIRE handle — PULL (isolates fuel, bleed, generator, hydraulic supply)`, e.pulled],
        ["Rotate handle L or R — discharge a bottle", anyBottle],
        ["If fire persists after 30 s — discharge the other bottle", (s.fireBottleLDischarged && s.fireBottleRDischarged) || (anyBottle && !e.fire)],
        [`ENG ${n} FIRE warning — OUT`, !e.fire],
      ],
      note: "After the fire is out: do not restart the engine, land at the nearest suitable airport, expect single-engine performance and loss of that generator, bleed and engine hydraulic pump.",
    });
  };
  engList(1); engList(2);
  if (apuFire || s.apuFirePulled) lists.push({
    title: "APU FIRE",
    steps: [
      ["APU FIRE handle — PULL (APU shuts down automatically)", s.apuFirePulled],
      ["APU bottle — DISCHARGE", s.apuBottleFired],
      ["APU FIRE warning — OUT", !apuFire],
    ],
    note: "On the ground, evacuate if the fire is not extinguished. In flight the APU is not used for the remainder of the flight.",
  });
  if (s.wheelWellFire || s.wheelWellLevel > 0.02) lists.push({
    title: "WHEEL WELL FIRE",
    steps: [
      ["Do NOT leave the gear retracted — fire builds in the closed well", gearAvg > 0.5],
      ["Landing gear lever — DOWN (airflow cools / starves the fire)", s.gear === "DN"],
      ["Gear down and locked", gearAvg > 0.98],
      ["WHEEL WELL warning — OUT", !s.wheelWellFire],
    ],
    note: "Leave the gear extended, land at the nearest suitable airport and expect hot brakes — do not set the parking brake.",
  });
  if (s.cargoFwdFire || s.cargoAftFire || s.cargoFwdLevel > 0.15 || s.cargoAftLevel > 0.15) {
    const comp = s.cargoFwdFire || s.cargoFwdLevel >= s.cargoAftLevel ? "FWD" : "AFT";
    lists.push({
      title: `CARGO FIRE / SMOKE (${comp})`,
      steps: [
        [`CARGO FIRE ARM — select ${comp}`, s.cargoArmed === comp],
        ["CARGO FIRE DISCH — press (agent floods the armed compartment only)", s.cargoBottleDischarged && s.cargoArmed === comp],
        [`CARGO ${comp} warning — OUT`, !(comp === "FWD" ? s.cargoFwdFire : s.cargoAftFire)],
      ],
      note: "Agent only reaches the compartment selected on the ARM switch — arm the wrong one and the fire keeps growing. Then land at the nearest suitable airport; cargo agent lasts a limited time.",
    });
  }

  const lost: string[] = [];
  if (s.engine1FirePulled) lost.push(`GEN 1 ${d.generator1BusPowered ? "still on bus via bus tie" : "off bus"}`, `HYD A pump 1 ${d.hydAPump1On ? "on" : "no supply"}`, `L bleed ${d.bleed1Available ? "on" : "lost"}`);
  if (s.engine2FirePulled) lost.push(`GEN 2 ${d.generator2BusPowered ? "still on bus via bus tie" : "off bus"}`, `HYD A pump 2 ${d.hydAPump2On ? "on" : "no supply"}`, `R bleed ${d.bleed2Available ? "on" : "lost"}`);
  if (s.apuFirePulled) lost.push("APU gen off bus", "APU bleed lost");
  const anyFire = f.engineFire1 || f.engineFire2 || apuFire || s.wheelWellFire || s.cargoFwdFire || s.cargoAftFire;

  return (
    <div className="space-y-2">
      {/* warning lights */}
      <div className="grid grid-cols-4 gap-1 font-mono text-[8px] uppercase">
        {([
          ["FIRE WARN", lit(d.fireWarn)], ["ENG 1", lit(d.engine1FireWarn)], ["ENG 2", lit(d.engine2FireWarn)], ["APU", lit(d.apuFireWarn)],
          ["WHEEL WELL", lit(wwWarn)], ["CARGO FWD", lit(cfWarn)], ["CARGO AFT", lit(caWarn)], ["BELL", d.fireWarn || wwWarn || cfWarn || caWarn],
        ] as [string, boolean][]).map(([l, on]) => (
          <div key={l} className={`rounded border px-1 py-1.5 text-center ${on ? "border-warn bg-warn/20 text-warn" : "border-border bg-inset text-subtle"}`}>{l}<br />{on ? "● ON" : "○ OFF"}</div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 font-mono text-[8px] uppercase text-subtle">
        <span>Indications {dc ? <span className="text-ok">POWERED</span> : <span className="text-warn">NO DC POWER — warnings unavailable</span>}</span>
        <button className={btn} onClick={() => setTest(true)} disabled={!dc}>Fire test</button>
      </div>

      {engineCard(1)}

      {/* APU */}
      <Card title="APU · fire protection" state={apuFire ? (s.apuFirePulled ? "FIRE · HANDLE PULLED" : "FIRE") : s.apuFirePulled ? "SHUT DOWN · HANDLE PULLED" : d.apuAvailable ? `RUNNING ${Math.round(s.apuRpm)}%` : "SHUT DOWN"} tone={apuFire ? "warn" : s.apuFirePulled ? "caution" : "ok"}>
        <div className="relative">
          <ApuDiagram door={s.apuDoor} fuel={s.apuFuelValve} starter={s.apuStarter} rpm={s.apuRpm} egt={s.apuEgt} oilPsi={s.apuOilPsi} bleed={s.apuBleedValve} genOnBus={d.apuGenOnBus} masterOff={s.apuMaster === "OFF"} jam={doorJammed} />
          <svg viewBox="20 12 975 622" className="pointer-events-none absolute inset-0 h-full w-full">
            <defs><radialGradient id="apug"><stop offset="0" stopColor="#ff8a3a" stopOpacity="0.85" /><stop offset="1" stopColor="#ff3b1f" stopOpacity="0" /></radialGradient></defs>
            {/* fire detector loop around the power section */}
            <rect x={640} y={128} width={330} height={330} rx={26} fill="none" stroke={apuLoop} strokeWidth={5} strokeDasharray="18 10" />
            {[[655, 200], [655, 390], [800, 133], [800, 452], [955, 290]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r={9} fill="#fff" stroke={apuLoop} strokeWidth={4} />)}
            <text x={645} y={112} fontSize={22} fill={apuLoop} fontFamily="monospace" fontWeight={700}>{apuFire ? "FIRE DETECTOR TRIPPED" : s.apuFirePulled ? "DETECTOR · HANDLE PULLED" : "FIRE DETECTOR · NORMAL"}</text>
            {apuFire && (
              <g>
                <ellipse cx={780} cy={290} rx={210} ry={190} fill="url(#apug)"><animate attributeName="opacity" values="0.9;0.4;0.9" dur="0.8s" repeatCount="indefinite" /></ellipse>
                <Flames cx={760} base={160} size={120} n={3} spread={1.5} />
                <Flames cx={770} base={430} size={95} n={2} spread={1.7} />
              </g>
            )}
            {s.apuBottleFired && mist.apu && <Mist cx={790} cy={290} r={80} />}
            {([["FUEL", 110], ["BLEED", 250], ["GEN", 390]] as [string, number][]).map(([l, x]) => (
              <g key={l}>
                <rect x={x - 50} y={585} width={100} height={34} rx={7} fill="#fff" stroke={s.apuFirePulled ? WARN : OK} strokeWidth={3} />
                <text x={x} y={609} fontSize={21} textAnchor="middle" fill={s.apuFirePulled ? WARN : OK} fontFamily="monospace" fontWeight={700}>{l} {s.apuFirePulled ? "SHUT" : "OPEN"}</text>
              </g>
            ))}
          </svg>
        </div>
        <div className="mt-1.5 grid grid-cols-4 gap-1">
          <Chip label="APU FUEL" on={s.apuFuelValve > 0.5 && !s.apuFirePulled} value={s.apuFuelValve > 0.5 && !s.apuFirePulled ? "FLOW" : "CUT OFF"} />
          <Chip label="APU GEN" on={apuGen} value={apuGen ? "ON BUS" : "OFF BUS"} />
          <Chip label="APU BLEED" on={apuBleedOn} value={apuBleedOn ? "SUPPLYING" : "NO BLEED"} />
          <Chip label="INLET DOOR" on={s.apuDoor > 0.9} value={s.apuDoor > 0.9 ? "OPEN" : s.apuDoor > 0.05 ? "MOVING" : "CLOSED"} />
        </div>
        <div className="mt-1.5 grid grid-cols-3 gap-1">
          <button className={s.apuFirePulled ? btnWarn : btn} onClick={pullApu}>{s.apuFirePulled ? "Pulled · reset" : "Pull APU handle"}</button>
          <button className={btn} disabled={!s.apuFirePulled || s.apuBottleFired} onClick={dischargeApu}>Discharge bottle</button>
          <button className={btnWarn} onClick={() => inject("apuFireDetected")}>Inject fire</button>
        </div>
        <div className="mt-1 text-center font-mono text-[8px] uppercase"><span className={s.apuBottleFired ? "text-caution" : "text-ok"}>APU BOTTLE {s.apuBottleFired ? "DISCHARGED" : "CHARGED"}</span></div>
      </Card>

      {engineCard(2)}

      {/* WHEEL WELL */}
      <Card title="Main wheel well · overheat detection" state={s.wheelWellFire ? "OVERHEAT WARNING" : s.wheelWellLevel > 0.02 ? "COOLING" : "NORMAL"} tone={s.wheelWellFire ? "warn" : "ok"}>
        <div className="overflow-hidden rounded-lg border border-border bg-[#0b0d10]">
          <svg viewBox="0 0 400 210" className="block w-full" role="img" aria-label="Main wheel well fire scene">
            <defs><radialGradient id="wwg"><stop offset="0" stopColor="#ff8a3a" stopOpacity="0.8" /><stop offset="1" stopColor="#ff3b1f" stopOpacity="0" /></radialGradient></defs>
            <path d="M0 150 L400 150 L400 210 L0 210 Z" fill="#12161b" />
            <path d="M0 40 H400 V150 H0 Z" fill="#1b2027" stroke="#4a5560" />
            <text x={10} y={22} fontSize={9} fill={SUB} fontFamily="monospace">MAIN WHEEL WELL (cutaway, looking forward)</text>
            <rect x={110} y={48} width={180} height={102} rx={8} fill="#0f1318" stroke={s.wheelWellFire ? WARN : "#66727e"} strokeWidth={2} />
            <path d="M118 58 H282" stroke={s.wheelWellFire ? WARN : OK} strokeWidth={3} strokeDasharray="8 5" />
            <text x={200} y={70} fontSize={8} textAnchor="middle" fill={s.wheelWellFire ? WARN : OK} fontFamily="monospace">{s.wheelWellFire ? "OVERHEAT LOOP TRIPPED" : "OVERHEAT LOOP NORMAL"}</text>
            <g stroke="#7d8995" strokeWidth={3}>
              <line x1={110} y1={150} x2={110 - 44 * gearAvg} y2={150 + 22 * gearAvg} />
              <line x1={290} y1={150} x2={290 + 44 * gearAvg} y2={150 + 22 * gearAvg} />
            </g>
            <g transform={`translate(0 ${gearAvg * 62})`}>
              <rect x={196} y={70} width={8} height={48} fill="#8b95a1" />
              <circle cx={182} cy={116} r={22} fill="#20242b" stroke="#a9b3bd" strokeWidth={3} /><circle cx={182} cy={116} r={8} fill="#66727e" />
              <circle cx={218} cy={116} r={22} fill="#20242b" stroke="#a9b3bd" strokeWidth={3} /><circle cx={218} cy={116} r={8} fill="#66727e" />
              {s.wheelWellLevel > 0.05 && <circle cx={200} cy={116} r={34} fill="url(#wwg)" opacity={0.4 + s.wheelWellLevel * 0.6} />}
            </g>
            {s.wheelWellLevel > 0.05 && (
              <g opacity={Math.min(1, 0.4 + s.wheelWellLevel)}>
                <ellipse cx={200} cy={100} rx={80} ry={45} fill="url(#wwg)" opacity={0.6 * s.wheelWellLevel} />
                <Flames cx={200} base={148 + gearAvg * 30} size={22 + s.wheelWellLevel * 62} n={3} spread={1.7} />
              </g>
            )}
            {gearAvg > 0.6 && (
              <g stroke="#4dd0c8" strokeWidth={2} opacity={0.8}>
                {[0, 1, 2].map((i) => <line key={i} x1={20} y1={180 + i * 10} x2={90} y2={180 + i * 10} strokeDasharray="10 6"><animate attributeName="stroke-dashoffset" values="0;-32" dur="0.7s" repeatCount="indefinite" /></line>)}
                <text x={20} y={172} fontSize={8} fill="#4dd0c8" stroke="none" fontFamily="monospace">AIRFLOW COOLS THE WELL</text>
              </g>
            )}
            {gearAvg < 0.3 && s.wheelWellFire && <text x={200} y={200} fontSize={9} textAnchor="middle" fill={WARN} fontFamily="monospace">ENCLOSED · FIRE BUILDING</text>}
            <rect x={340} y={50} width={12} height={96} rx={3} fill="#0b0d10" stroke="#4a5560" />
            <rect x={341} y={147 - 94 * s.wheelWellLevel} width={10} height={94 * s.wheelWellLevel} fill={s.wheelWellLevel > 0.6 ? WARN : CAUT} />
            <text x={346} y={162} fontSize={7} textAnchor="middle" fill={SUB} fontFamily="monospace">FIRE</text>
          </svg>
        </div>
        <div className="mt-1.5 grid grid-cols-4 gap-1">
          <Chip label="GEAR" on={gearAvg > 0.98} value={gearAvg > 0.98 ? "DOWN LOCKED" : gearAvg < 0.02 ? "UP" : "IN TRANSIT"} />
          <Chip label="LEVER" on={s.gear === "DN"} value={s.gear} />
          <Chip label="WELL FIRE" on={false} warn={s.wheelWellFire} value={`${Math.round(s.wheelWellLevel * 100)}%`} />
          <Chip label="HYD A (GEAR)" on={s.hydAPress > 1500} value={`${Math.round(s.hydAPress)} PSI`} />
        </div>
        <div className="mt-1.5 grid grid-cols-3 gap-1">
          <button className={btnWarn} onClick={() => s.patch({ wheelWellFire: true, wheelWellLevel: Math.max(0.15, s.wheelWellLevel) }, "Overheat injected: main wheel well detection loop.")}>Inject fire</button>
          <button className={btn} onClick={() => s.patch({ gear: "UP" }, "Landing gear lever UP (gear retracts into the wheel well).")}>Gear lever UP</button>
          <button className={s.gear === "DN" ? btnOn : btn} onClick={() => s.patch({ gear: "DN" }, "Landing gear lever DOWN — gear extends, airflow cools the wheel well.")}>Gear lever DOWN</button>
        </div>
      </Card>

      {/* CARGO */}
      <Card
        title="Cargo compartments · smoke / fire"
        state={!s.cargoFireInstalled ? "NOT INSTALLED (pre-SB 26A1081)" : cfWarn || caWarn ? "SMOKE / FIRE DETECTED" : s.cargoBottleDischarged ? "AGENT DISCHARGED" : "NORMAL"}
        tone={!s.cargoFireInstalled ? "ok" : cfWarn || caWarn ? "warn" : s.cargoBottleDischarged ? "caution" : "ok"}
      >
        <div className="overflow-hidden rounded-lg border border-border bg-[#0b0d10]">
          <svg viewBox="0 0 400 190" className="block w-full" role="img" aria-label="Cargo compartment fire scene">
            <text x={10} y={16} fontSize={9} fill={SUB} fontFamily="monospace">
              {s.cargoFireInstalled ? "CARGO COMPARTMENTS (side cutaway, nose left)" : "CARGO FIRE SYSTEM NOT INSTALLED · SB 26A1081"}
            </text>
            {/* Dual-loop status badges when installed */}
            {s.cargoFireInstalled && (
              <g>
                <rect x={280} y={6} width={52} height={14} rx={3} fill="#0f1318" stroke={s.cargoLoopA ? OK : WARN} strokeWidth={1.5} />
                <text x={306} y={16} fontSize={7} textAnchor="middle" fill={s.cargoLoopA ? OK : WARN} fontFamily="monospace">LOOP A</text>
                <rect x={338} y={6} width={52} height={14} rx={3} fill="#0f1318" stroke={s.cargoLoopB ? OK : WARN} strokeWidth={1.5} />
                <text x={364} y={16} fontSize={7} textAnchor="middle" fill={s.cargoLoopB ? OK : WARN} fontFamily="monospace">LOOP B</text>
              </g>
            )}
            <path d="M8 105 C8 60 40 46 90 46 H320 C365 46 392 72 392 105 C392 140 365 152 320 152 H90 C40 152 8 140 8 105 Z" fill="#161b21" stroke="#66727e" strokeWidth={2} opacity={s.cargoFireInstalled ? 1 : 0.45} />
            <line x1={20} y1={98} x2={382} y2={98} stroke="#3a414a" strokeDasharray="4 3" opacity={s.cargoFireInstalled ? 1 : 0.45} />
            <text x={200} y={82} fontSize={8} textAnchor="middle" fill={SUB} fontFamily="monospace" opacity={s.cargoFireInstalled ? 1 : 0.45}>PASSENGER CABIN</text>
            {([["FWD", 62, 116, s.cargoFwdFire, s.cargoFwdLevel], ["AFT", 250, 116, s.cargoAftFire, s.cargoAftLevel]] as [string, number, number, boolean, number][]).map(([name, x, w, fire, lv]) => {
              const installed = s.cargoFireInstalled;
              const armed = installed && s.cargoArmed === name;
              const warned = name === "FWD" ? cfWarn : caWarn;
              const col = !installed ? "#3a414a" : warned || fire ? WARN : lv > 0.05 ? CAUT : armed ? "#4da3ff" : "#66727e";
              return (
                <g key={name} opacity={installed ? 1 : 0.4}>
                  <rect x={x} y={104} width={w} height={40} rx={6} fill="#0f1318" stroke={col} strokeWidth={2.2} />
                  <text x={x + 6} y={116} fontSize={8} fill={col} fontFamily="monospace" fontWeight={700}>
                    {name} CARGO {!installed ? "· N/A" : armed ? "· ARMED" : ""}
                  </text>
                  <circle cx={x + w - 14} cy={112} r={4} fill="#0b0d10" stroke={!installed ? "#3a414a" : warned || fire ? WARN : OK} strokeWidth={2} />
                  {installed && lv > 0.05 && [0, 1, 2, 3].map((i) => (
                    <circle key={i} cx={x + 20 + (i * (w - 40)) / 3} cy={128 - (i % 2) * 6} r={5 + lv * 11} fill="#9aa4ae" opacity={0.15 + lv * 0.4}>
                      <animate attributeName="cy" values={`${128 - (i % 2) * 6};${118 - (i % 2) * 6};${128 - (i % 2) * 6}`} dur={`${1.6 + i * 0.3}s`} repeatCount="indefinite" />
                    </circle>
                  ))}
                  {installed && fire && lv > 0.12 && <Flames cx={x + w / 2} base={142} size={10 + lv * 26} n={2} spread={1.6} />}
                  {installed && s.cargoBottleDischarged && armed && mist.cargo && <Mist cx={x + w / 2} cy={128} r={16} />}
                  <path d={`M200 165 H${x + w / 2} V144`} fill="none" stroke={armed ? "#4da3ff" : "#3a414a"} strokeWidth={armed ? 2.5 : 1.5} strokeDasharray={armed ? undefined : "4 3"} opacity={installed ? 1 : 0.35} />
                </g>
              );
            })}
            <rect x={186} y={160} width={28} height={22} rx={6} fill="#0f1318" stroke={!s.cargoFireInstalled ? "#3a414a" : s.cargoBottleDischarged ? CAUT : OK} strokeWidth={2} opacity={s.cargoFireInstalled ? 1 : 0.4} />
            <text x={200} y={175} fontSize={7} textAnchor="middle" fill={!s.cargoFireInstalled ? "#3a414a" : s.cargoBottleDischarged ? CAUT : OK} fontFamily="monospace">
              {s.cargoFireInstalled ? "AGENT" : "N/A"}
            </text>
          </svg>
        </div>
        <div className="mt-1.5 grid grid-cols-4 gap-1">
          <Chip label="FWD SMOKE" on={false} warn={s.cargoFwdFire && s.cargoFireInstalled} value={!s.cargoFireInstalled ? "N/A" : s.cargoFwdFire ? "DETECTED" : "CLEAR"} />
          <Chip label="AFT SMOKE" on={false} warn={s.cargoAftFire && s.cargoFireInstalled} value={!s.cargoFireInstalled ? "N/A" : s.cargoAftFire ? "DETECTED" : "CLEAR"} />
          <Chip label="ARM SWITCH" on={s.cargoArmed !== "NONE"} value={!s.cargoFireInstalled ? "N/A" : s.cargoArmed === "NONE" ? "OFF" : s.cargoArmed} />
          <Chip label="AGENT" on={s.cargoFireInstalled && !s.cargoBottleDischarged} value={!s.cargoFireInstalled ? "N/A" : s.cargoBottleDischarged ? "DISCHARGED" : "CHARGED"} />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1 font-mono text-[8px] uppercase text-subtle">
          <span>Effectivity SB 26A1081</span>
          <button className={s.cargoFireInstalled ? btnOn : btn} onClick={() => s.patch({ cargoFireInstalled: !s.cargoFireInstalled, cargoArmed: "NONE", cargoBottleDischarged: false }, s.cargoFireInstalled ? "Cargo fire system REMOVED (pre-SB / not installed)." : "Cargo fire system INSTALLED (SB 26A1081).")}>
            {s.cargoFireInstalled ? "INSTALLED" : "NOT INSTALLED"}
          </button>
          {s.cargoFireInstalled && (
            <>
              <button className={s.cargoLoopA ? btnOn : btn} onClick={() => s.patch({ cargoLoopA: !s.cargoLoopA }, `Cargo detector loop A ${s.cargoLoopA ? "FAILED" : "OK"}.`)}>Loop A {s.cargoLoopA ? "OK" : "FAIL"}</button>
              <button className={s.cargoLoopB ? btnOn : btn} onClick={() => s.patch({ cargoLoopB: !s.cargoLoopB }, `Cargo detector loop B ${s.cargoLoopB ? "FAILED" : "OK"}.`)}>Loop B {s.cargoLoopB ? "OK" : "FAIL"}</button>
            </>
          )}
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-1">
          <button className={btnWarn} onClick={() => s.patch({ cargoFwdFire: true, cargoFwdLevel: Math.max(0.25, s.cargoFwdLevel) }, "Fire injected: FWD cargo compartment smoke / fire.")}>Inject FWD cargo fire</button>
          <button className={btnWarn} onClick={() => s.patch({ cargoAftFire: true, cargoAftLevel: Math.max(0.25, s.cargoAftLevel) }, "Fire injected: AFT cargo compartment smoke / fire.")}>Inject AFT cargo fire</button>
          <button className={s.cargoArmed === "FWD" ? btnOn : btn} disabled={!s.cargoFireInstalled} onClick={() => cargoArm("FWD")}>Arm FWD</button>
          <button className={s.cargoArmed === "AFT" ? btnOn : btn} disabled={!s.cargoFireInstalled} onClick={() => cargoArm("AFT")}>Arm AFT</button>
          <button className={`${btnWarn} col-span-2`} disabled={!s.cargoFireInstalled || s.cargoBottleDischarged || s.cargoArmed === "NONE"} onClick={cargoDischarge}>Cargo fire DISCHARGE</button>
        </div>
      </Card>

      {/* mitigation */}
      <div>
        <div className="mb-1 flex items-center justify-between gap-2 font-mono text-[8px] uppercase tracking-wider text-subtle">
          <span>Mitigation · recall items</span>
          <button className={stubborn ? btnOn : btn} onClick={() => setStubborn(!stubborn)}>Fire persists after 1st bottle: {stubborn ? "ON" : "OFF"}</button>
        </div>
        {lists.length === 0 && <div className="rounded border border-border bg-inset px-2 py-1.5 text-[9px] leading-snug text-subtle">{anyFire ? "Fire active." : "No fire. Inject one on any unit above, or pull a handle to see what it isolates."} The steps and the effect on power appear here.</div>}
        <div className="space-y-2">
          {lists.map((l) => (
            <div key={l.title} className="rounded-lg border border-border bg-inset p-2">
              <div className="mb-1 font-display text-[9px] uppercase tracking-wide text-fg">{l.title}</div>
              {l.steps.map(([t, done]) => <div key={t} className={`flex gap-2 py-0.5 text-[9px] leading-snug ${done ? "text-ok" : "text-subtle"}`}><span>{done ? "☑" : "☐"}</span><span>{t}</span></div>)}
              {l.note && <div className="mt-1 border-t border-border pt-1 text-[8px] leading-snug text-subtle">{l.note}</div>}
            </div>
          ))}
        </div>
        {lost.length > 0 && <div className="mt-2 rounded border border-border bg-inset px-2 py-1.5 text-[9px] leading-snug text-subtle">Effect of handle(s): {lost.join(" · ")}.</div>}
      </div>

      {/* downstream power */}
      <div>
        <div className="mb-1 font-mono text-[8px] uppercase tracking-wider text-subtle">Electrical supply</div>
        <div className="grid grid-cols-4 gap-1">
          <Chip label="GEN 1 BUS" on={d.generator1BusPowered} /><Chip label="GEN 2 BUS" on={d.generator2BusPowered} />
          <Chip label="APU GEN" on={d.apuGenOnBus} /><Chip label="BATT BUS" on={d.batteryBusPowered} />
          <Chip label="XFR BUS 1" on={d.transferBus1Powered} /><Chip label="XFR BUS 2" on={d.transferBus2Powered} />
          <Chip label="DC BUS 1" on={d.dcBus1Powered} /><Chip label="DC BUS 2" on={d.dcBus2Powered} />
        </div>
      </div>
      <div>
        <div className="mb-1 font-mono text-[8px] uppercase tracking-wider text-subtle">Hydraulic power</div>
        <div className="grid grid-cols-4 gap-1">
          <Chip label="SYS A" on={s.hydAPress > 1500} value={`${Math.round(s.hydAPress)} PSI`} /><Chip label="SYS B" on={s.hydBPress > 1500} value={`${Math.round(s.hydBPress)} PSI`} />
          <Chip label="A PUMP 1 (ENG 1)" on={d.hydAPump1On} /><Chip label="A PUMP 2 (ENG 2)" on={d.hydAPump2On} />
          <Chip label="B PUMP 1 (ELEC)" on={d.hydBPump1On} /><Chip label="B PUMP 2 (ELEC)" on={d.hydBPump2On} />
          <Chip label="RESERVOIR A" on={s.hydAQty > 20} value={`${Math.round(s.hydAQty)}%`} /><Chip label="RESERVOIR B" on={s.hydBQty > 20} value={`${Math.round(s.hydBQty)}%`} />
        </div>
      </div>
      <div>
        <div className="mb-1 font-mono text-[8px] uppercase tracking-wider text-subtle">Pneumatic power</div>
        <div className="grid grid-cols-4 gap-1">
          <Chip label="L MANIFOLD" on={d.leftManifold} value={d.leftManifold ? `${Math.round(d.leftDuctPsi)} PSI` : "OFF"} /><Chip label="R MANIFOLD" on={d.rightManifold} value={d.rightManifold ? `${Math.round(d.rightDuctPsi)} PSI` : "OFF"} />
          <Chip label="APU BLEED" on={apuBleedOn} /><Chip label="ISOL VALVE" on={d.isolationOpen} value={d.isolationOpen ? "OPEN" : "CLOSED"} />
          <Chip label="PACK L" on={d.packLFlow} value={d.packLFlow ? "FLOW" : "OFF"} /><Chip label="PACK R" on={d.packRFlow} value={d.packRFlow ? "FLOW" : "OFF"} />
          <Chip label="ENG 1 BLEED" on={d.bleed1Available} /><Chip label="ENG 2 BLEED" on={d.bleed2Available} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1">
        <button className={btn} onClick={setup}>Set up: engines + APU running</button>
        <button className={btn} onClick={clearAll}>Clear all fires · reset</button>
      </div>
      <p className="text-[8px] leading-relaxed text-subtle">Training visualization: the engine and APU pictures are the same live models as the Engine Start and APU panels. Pulling a fire handle isolates that unit's fuel, generator, hydraulic pump supply and bleed air; bottles are shared between engines; cargo agent only reaches the compartment selected on the ARM switch; a wheel well fire builds with the gear retracted and is cooled by extending it. Simplified — not an aircraft checklist.</p>
    </div>
  );
}
