import type { ReactNode } from "react";
import { computeAirData } from "@/lib/sim/pitotStatic";
import { useSim, useDerivedPick } from "@/lib/sim/store";
import { useMip } from "@/lib/sim/mipLocal";
import { sourcesOf } from "@/lib/sim/sources";

/**
 * Navigation (ATA 34) + autopilot / flight director (ATA 22) component-flow schematic, left to right:
 *   sensors and power -> source selectors -> captain / first-officer sources -> FD-108 + SP-77 (+ glareshield controls) -> instruments, servos, surfaces, attitude model.
 * Everything is coloured from the live model, so a failed gyro / compass / VHF NAV, a lost bus or hydraulic system B, a dropped engage interlock or a missing
 * radio signal shows on the line and box it affects. The flight director and autopilot run from the CAPTAIN's selected sources (MainInstrumentPanel attitude model).
 */
const GREEN = "#3dd68c", GREY = "#4a5560", RED = "#e24b4b", AMBER = "#e0a84a", TXT = "#aab3bc", BOX = "#12171c";
type St = "ok" | "idle" | "fail" | "warn";
const COL: Record<St, string> = { ok: GREEN, idle: GREY, fail: RED, warn: AMBER };

const CSS = `
@keyframes nad-flow { to { stroke-dashoffset: -18; } }
.nad-flow { stroke-dasharray: 5 4; animation: nad-flow .8s linear infinite; }
.nad-fail { stroke-dasharray: 2 4; }
@media (prefers-reduced-motion: reduce) { .nad-flow { animation: none; } }
`;

interface Box { x: number; y: number; w: number; h: number }
const B = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h });
const N = {
  stn: B(10, 14, 128, 36), nav1: B(10, 62, 128, 36), nav2: B(10, 104, 128, 36),
  comp1: B(10, 160, 128, 36), comp2: B(10, 202, 128, 36),
  gyro1: B(10, 258, 128, 36), gyro2: B(10, 300, 128, 36), gyroaux: B(10, 342, 128, 36),
  air: B(10, 440, 128, 36), ra: B(10, 482, 128, 36), dc: B(10, 538, 128, 36), hyd: B(10, 580, 128, 36),
  navsel: B(185, 62, 118, 78), compsel: B(185, 160, 118, 78), gyrosel: B(185, 279, 118, 78),
  csrc: B(350, 70, 122, 130), fsrc: B(350, 240, 122, 130),
  fd: B(520, 60, 150, 86), ap: B(520, 166, 150, 200), ctl: B(520, 386, 150, 62),
  ci: B(720, 40, 150, 170), fi: B(720, 225, 150, 110),
  servo: B(720, 370, 150, 56), surf: B(720, 444, 150, 50), att: B(720, 512, 150, 70),
} as const;
type Id = keyof typeof N;

const NAV_DIM: Id[] = ["air", "ra", "dc", "hyd", "servo", "surf", "att", "ap", "fd", "ctl"];
const AP_DIM: Id[] = ["fsrc", "fi"];

const NAV_NAME = ["MAN", "VOR LOC", "AUTO APP", "MAN G/S"] as const;
const PITCH_NAME = ["TURB", "OFF", "ALT HOLD"] as const;
const FD_NAME = ["GA", "OFF", "HDG", "VOR/LOC", "AUTO APPR"] as const;
const NAV_SEL = ["BOTH ON 1", "NORMAL", "BOTH ON 2"] as const;
const GYRO_SEL = ["CAPT ON AUX", "NORMAL", "F/O ON AUX"] as const;

export function NavAutopilotDiagram({ focus }: { focus?: "nav" | "ap" }) {
  const s = useSim();
  const d = useDerivedPick("acPower", "dcPower", "hydB");
  const m = useMip();

  const pw = !!d.dcPower;
  const hydB = Number(d.hydB ?? 0) >= 1500;
  const src = sourcesOf(m, m.srcFail);
  const C = src.capt, F = src.fo;
  const air = computeAirData(s, d.dcPower, d.acPower);
  const airOk = pw && !!air.capt.staticOk;
  const raOk = pw && !m.fail.ht;
  const attBad = m.fail.att || C.att, hdgBad = m.fail.hdg || C.hdg, navBadC = m.fail.loc || C.nav, navBadF = m.fail.loc || F.nav;
  const il = pw && hydB && !attBad && !hdgBad;
  const ailOn = m.apAil && il, elevOn = m.apElev && il;
  const apOn = ailOn || elevOn;
  const signal = m.navOn && (m.navTuned === "ILS" ? m.nav.locValid : m.nav.vorValid);
  const powered = (ok = true): St => (!pw ? "idle" : ok ? "ok" : "fail");
  const radio = (failed: boolean): St => (failed ? "fail" : m.navOn ? "ok" : "idle");

  /* node states + status text */
  const sensor: Record<string, { st: St; txt: string }> = {
    stn: { st: m.navOn ? "ok" : "idle", txt: m.navOn ? `TUNED ${m.navTuned} · ${signal ? "SIGNAL" : "NO SIGNAL"}` : "STATION OFF" },
    nav1: { st: radio(m.srcFail.nav1), txt: m.srcFail.nav1 ? "FAILED" : m.navOn ? "RECEIVING" : "STANDBY" },
    nav2: { st: radio(m.srcFail.nav2), txt: m.srcFail.nav2 ? "FAILED" : m.navOn ? "RECEIVING" : "STANDBY" },
    comp1: { st: powered(!m.srcFail.comp1), txt: m.srcFail.comp1 ? "FAILED" : pw ? "HDG VALID" : "NO POWER" },
    comp2: { st: powered(!m.srcFail.comp2), txt: m.srcFail.comp2 ? "FAILED" : pw ? "HDG VALID" : "NO POWER" },
    gyro1: { st: powered(!m.srcFail.gyro1), txt: m.srcFail.gyro1 ? "FAILED" : pw ? "ATT VALID" : "NO POWER" },
    gyro2: { st: powered(!m.srcFail.gyro2), txt: m.srcFail.gyro2 ? "FAILED" : pw ? "ATT VALID" : "NO POWER" },
    gyroaux: { st: powered(!m.srcFail.gyroAux), txt: m.srcFail.gyroAux ? "FAILED" : pw ? "ATT VALID" : "NO POWER" },
    air: { st: airOk ? "ok" : pw ? "fail" : "idle", txt: airOk ? `${Math.round(air.capt.altFt)} FT · ${Math.round(air.capt.iasKt)} KT` : pw ? "STATIC FAULT" : "NO POWER" },
    ra: { st: raOk ? "ok" : pw ? "fail" : "idle", txt: raOk ? "VALID" : pw ? "FAILED" : "NO POWER" },
    dc: { st: pw ? "ok" : "fail", txt: pw ? "AVAILABLE" : "LOST" },
    hyd: { st: hydB ? "ok" : "fail", txt: hydB ? "PRESSURE OK" : "NO PRESSURE" },
  };
  const srcSt = (bad: boolean, kind: "nav" | "other"): St => (bad ? "fail" : kind === "nav" ? (m.navOn ? "ok" : "idle") : powered());

  const draw = (id: Id) => N[id];
  const dim = (id: Id) => (focus === "nav" ? NAV_DIM : focus === "ap" ? AP_DIM : []).includes(id);

  /* route helpers: elbow from the right edge of a to the left edge of b, vertical leg at xm */
  const rp = (a: Box, b: Box, xm: number, ya?: number, yb?: number) => {
    const x1 = a.x + a.w, y1 = ya ?? a.y + a.h / 2, x2 = b.x, y2 = yb ?? b.y + b.h / 2;
    return `M${x1} ${y1} H${xm} V${y2} H${x2}`;
  };
  type Edge = { d: string; st: St; a: Id; b: Id; w?: string };
  const E: Edge[] = [];
  const e = (a: Id, b: Id, d: string, st: St) => E.push({ a, b, d, st });

  e("stn", "nav1", `M10 32 H3 V80 H10`, sensor.stn.st);
  e("stn", "nav2", `M3 56 V122 H10`, sensor.stn.st);
  e("nav1", "navsel", rp(N.nav1, N.navsel, 160, 80, N.navsel.y + 22), sensor.nav1.st);
  e("nav2", "navsel", rp(N.nav2, N.navsel, 166, 122, N.navsel.y + 56), sensor.nav2.st);
  e("comp1", "compsel", rp(N.comp1, N.compsel, 160, 178, N.compsel.y + 22), sensor.comp1.st);
  e("comp2", "compsel", rp(N.comp2, N.compsel, 166, 220, N.compsel.y + 56), sensor.comp2.st);
  e("gyro1", "gyrosel", rp(N.gyro1, N.gyrosel, 156, 276, N.gyrosel.y + 18), sensor.gyro1.st);
  e("gyro2", "gyrosel", rp(N.gyro2, N.gyrosel, 163, 318, N.gyrosel.y + 39), sensor.gyro2.st);
  e("gyroaux", "gyrosel", rp(N.gyroaux, N.gyrosel, 170, 360, N.gyrosel.y + 60), sensor.gyroaux.st);

  const chipY = (box: Box, i: number) => box.y + 34 + i * 30 + 9;
  const sels: [Id, number, "nav" | "other", boolean, boolean][] = [["navsel", 0, "nav", navBadC, navBadF], ["compsel", 1, "other", hdgBad, m.fail.hdg || F.hdg], ["gyrosel", 2, "other", attBad, m.fail.att || F.att]];
  sels.forEach(([id, i, kind, badC, badF], k) => {
    e(id, "csrc", rp(N[id], N.csrc, 312 + k * 7, N[id].y + 26, chipY(N.csrc, i)), srcSt(badC, kind));
    e(id, "fsrc", rp(N[id], N.fsrc, 340 - k * 7, N[id].y + 52, chipY(N.fsrc, i)), srcSt(badF, kind));
  });

  const capSrcOk: St = attBad || hdgBad ? "fail" : powered();
  e("csrc", "fd", rp(N.csrc, N.fd, 480, 135, N.fd.y + 40), capSrcOk);
  e("csrc", "ap", rp(N.csrc, N.ap, 486, 160, N.ap.y + 30), capSrcOk);
  e("csrc", "ci", `M411 70 V26 H716 V70 H720`, capSrcOk);
  e("fsrc", "fi", `M411 370 V453 H708 V280 H720`, F.att || F.hdg || m.fail.att || m.fail.hdg ? "fail" : powered());

  e("air", "ap", rp(N.air, N.ap, 492, 458, N.ap.y + 70), airOk ? "ok" : "idle");
  e("ra", "ap", rp(N.ra, N.ap, 498, 500, N.ap.y + 100), raOk ? "ok" : "idle");
  e("dc", "ap", rp(N.dc, N.ap, 504, 556, N.ap.y + 130), pw ? "ok" : "fail");
  e("air", "ci", rp(N.air, N.ci, 688, 458, N.ci.y + 110), airOk ? "ok" : "idle");
  e("ra", "ci", rp(N.ra, N.ci, 694, 500, N.ci.y + 140), raOk ? "ok" : "idle");
  e("ctl", "fd", `M520 417 H510 V${N.fd.y + 66} H520`, "ok");
  e("ctl", "ap", `M595 386 V366`, "ok");
  e("fd", "ci", rp(N.fd, N.ci, 678, N.fd.y + 43, N.ci.y + 85), m.fdCmd.show ? "ok" : "idle");
  e("ap", "servo", rp(N.ap, N.servo, 684, N.ap.y + 100, N.servo.y + 18), m.apWarn ? "warn" : apOn ? "ok" : "idle");
  e("hyd", "servo", rp(N.hyd, N.servo, 700, 598, N.servo.y + 40), hydB ? "ok" : "fail");
  e("servo", "surf", `M795 426 V444`, apOn ? "ok" : "idle");
  e("surf", "att", `M795 494 V512`, apOn ? "ok" : "idle");
  e("att", "ci", `M720 547 H714 V${N.ci.y + 160} H720`, pw ? "ok" : "idle");
  e("att", "fi", `M714 300 H720`, pw ? "ok" : "idle");

  const edgeNode = (ed: Edge) => (
    <g key={ed.a + ed.b + ed.d} opacity={dim(ed.a) || dim(ed.b) ? 0.2 : 1}>
      <path d={ed.d} fill="none" stroke="#0b0e12" strokeWidth="5" strokeLinejoin="round" />
      <path d={ed.d} fill="none" stroke={COL[ed.st]} strokeWidth="2" strokeLinejoin="round" className={ed.st === "ok" ? "nad-flow" : ed.st === "fail" ? "nad-fail" : undefined} markerEnd={`url(#nad-ar-${ed.st})`} />
    </g>
  );

  const Node = ({ id, title, st, lines, children }: { id: Id; title: string; st: St; lines?: string[]; children?: ReactNode }) => {
    const b = draw(id);
    return (
      <g opacity={dim(id) ? 0.3 : 1}>
        <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="5" fill={BOX} stroke={COL[st]} strokeWidth="1.6" />
        <circle cx={b.x + b.w - 9} cy={b.y + 9} r="3.5" fill={COL[st]} />
        <text x={b.x + 8} y={b.y + 15} fill="#e6e1d2" fontSize="10.5" fontWeight="600" fontFamily="ui-monospace,monospace">{title}</text>
        {lines?.map((t, i) => <text key={i} x={b.x + 8} y={b.y + 29 + i * 13} fill={TXT} fontSize="9.5" fontFamily="ui-monospace,monospace">{t}</text>)}
        {children}
      </g>
    );
  };
  const chip = (x: number, y: number, w: number, label: string, st: St) => (
    <g key={label + x + y}>
      <rect x={x} y={y} width={w} height="18" rx="3" fill="#0b0e12" stroke={COL[st]} strokeWidth="1.2" />
      <text x={x + w / 2} y={y + 12.5} fill={COL[st]} fontSize="9.5" textAnchor="middle" fontFamily="ui-monospace,monospace">{label}</text>
    </g>
  );
  const srcBox = (id: "csrc" | "fsrc", title: string, bad: { nav: boolean; hdg: boolean; att: boolean }) => {
    const b = N[id];
    const sts: [string, St][] = [["NAV", srcSt(bad.nav, "nav")], ["HDG", srcSt(bad.hdg, "other")], ["ATT", srcSt(bad.att, "other")]];
    return (
      <Node id={id} title={title} st={sts.some(([, x]) => x === "fail") ? "warn" : pw ? "ok" : "idle"}>
        {sts.map(([l, st], i) => chip(b.x + 14, b.y + 34 + i * 30, 94, l, st))}
      </Node>
    );
  };
  const instrLines = ["ADI · FD bars · G/S", "HSI · CRS / HDG / DEV", "RMI · DME", "ASI · ALT · VSI", "HEIGHT (radio alt)"];
  const selLines = (pos: string) => ["POSITION", pos];

  return (
    <div className="mt-2 rounded border border-[#30353b] bg-[#0a0c0f] p-1.5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="font-display text-[9px] uppercase tracking-[.14em] text-subtle">Component flow · {focus === "nav" ? "navigation (ATA 34)" : focus === "ap" ? "autopilot / flight director (ATA 22)" : "navigation + autopilot"}</div>
        <div className="flex items-center gap-2 font-mono text-[8px] uppercase">
          {([["ok", "Live"], ["idle", "Idle / off"], ["warn", "Degraded"], ["fail", "Failed / lost"]] as const).map(([k, l]) => (
            <span key={k} className="flex items-center gap-1" style={{ color: COL[k] }}><span className="inline-block h-0.5 w-3" style={{ background: COL[k] }} />{l}</span>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox="0 0 880 626" className="w-full min-w-0 max-w-full" role="img" aria-label="Navigation and autopilot component flow">
          <style>{CSS}</style>
          <defs>
            {(["ok", "idle", "fail", "warn"] as const).map((k) => (
              <marker key={k} id={`nad-ar-${k}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill={COL[k]} /></marker>
            ))}
          </defs>
          {([[10, "SENSORS / POWER"], [185, "SELECTORS"], [350, "SIDE SOURCES"], [520, "FD / AUTOPILOT"], [720, "INSTRUMENTS · SURFACES"]] as const).map(([x, t]) => (
            <text key={t} x={x} y="8" fill="#7d7a6c" fontSize="8.5" letterSpacing="1.2" fontFamily="ui-monospace,monospace">{t}</text>
          ))}
          {E.map(edgeNode)}

          <Node id="stn" title="VOR / ILS STATION" st={sensor.stn.st} lines={[sensor.stn.txt]} />
          <Node id="nav1" title="VHF NAV 1" st={sensor.nav1.st} lines={[sensor.nav1.txt]} />
          <Node id="nav2" title="VHF NAV 2" st={sensor.nav2.st} lines={[sensor.nav2.txt]} />
          <Node id="comp1" title="COMPASS 1" st={sensor.comp1.st} lines={[sensor.comp1.txt]} />
          <Node id="comp2" title="COMPASS 2" st={sensor.comp2.st} lines={[sensor.comp2.txt]} />
          <Node id="gyro1" title="VERT GYRO 1" st={sensor.gyro1.st} lines={[sensor.gyro1.txt]} />
          <Node id="gyro2" title="VERT GYRO 2" st={sensor.gyro2.st} lines={[sensor.gyro2.txt]} />
          <Node id="gyroaux" title="VERT GYRO AUX" st={sensor.gyroaux.st} lines={[sensor.gyroaux.txt]} />
          <Node id="air" title="CAPT AIR DATA" st={sensor.air.st} lines={[sensor.air.txt]} />
          <Node id="ra" title="RADIO ALTIMETER" st={sensor.ra.st} lines={[sensor.ra.txt]} />
          <Node id="dc" title="DC POWER" st={sensor.dc.st} lines={[sensor.dc.txt]} />
          <Node id="hyd" title="HYDRAULIC SYS B" st={sensor.hyd.st} lines={[sensor.hyd.txt]} />

          <Node id="navsel" title="VHF NAV SEL" st="ok" lines={selLines(NAV_SEL[m.navSel] ?? "NORMAL")} />
          <Node id="compsel" title="COMPASS SEL" st="ok" lines={selLines(NAV_SEL[m.compSel] ?? "NORMAL")} />
          <Node id="gyrosel" title="VERT GYRO SEL" st="ok" lines={selLines(GYRO_SEL[m.gyroSel] ?? "NORMAL")} />

          {srcBox("csrc", "CAPTAIN SOURCES", { nav: navBadC, hdg: hdgBad, att: attBad })}
          {srcBox("fsrc", "F/O SOURCES", { nav: navBadF, hdg: m.fail.hdg || F.hdg, att: m.fail.att || F.att })}

          <Node id="fd" title="FLT DIR FD-108" st={pw ? (m.fdMode !== 1 ? "ok" : "idle") : "idle"} lines={[`MODE ${FD_NAME[m.fdMode] ?? "OFF"}${m.fdAlt ? " · ALT" : ""}`, m.fdCmd.show ? "BARS SHOWN" : "BARS OUT OF VIEW"]} />
          <Node id="ap" title="AUTOPILOT SP-77" st={m.apWarn ? "warn" : apOn ? "ok" : "idle"} lines={[`AIL ${ailOn ? "ENGAGED" : "OFF"}`, `ELEV ${elevOn ? "ENGAGED" : "OFF"}`, `NAV ${NAV_NAME[m.apNav] ?? "MAN"}`, `PITCH ${PITCH_NAME[m.apPitch] ?? "OFF"}`]}>
            {([["DC", pw], ["HYD B", hydB], ["ATT", !attBad], ["HDG", !hdgBad]] as const).map(([l, ok], i) => chip(N.ap.x + 8 + i * 35, N.ap.y + 94, 32, l, ok ? "ok" : "fail"))}
            <text x={N.ap.x + 8} y={N.ap.y + 128} fill="#8d8a7c" fontSize="8.5" fontFamily="ui-monospace,monospace">engage interlocks</text>
            <text x={N.ap.x + 8} y={N.ap.y + 144} fill={m.navTuned && m.apNav && !signal ? AMBER : "#8d8a7c"} fontSize="8.5" fontFamily="ui-monospace,monospace">{m.apNav && !signal ? "radio mode: no signal" : "uses CAPT sources"}</text>
            {m.apWarn && <text x={N.ap.x + 8} y={N.ap.y + 186} fill={AMBER} fontSize="9.5" fontWeight="700" fontFamily="ui-monospace,monospace">A/P DISCONNECT WARNING</text>}
          </Node>
          <Node id="ctl" title="GLARESHIELD" st="ok" lines={["CRS · HDG · NAV", "PITCH · FD mode"]} />

          <Node id="ci" title="CAPT INSTRUMENTS" st={pw ? (attBad || hdgBad || navBadC ? "warn" : "ok") : "idle"} lines={instrLines} />
          <Node id="fi" title="F/O INSTRUMENTS" st={pw ? (m.fail.att || F.att || m.fail.hdg || F.hdg || navBadF ? "warn" : "ok") : "idle"} lines={instrLines.slice(0, 4)} />
          <Node id="servo" title="A/P SERVOS" st={m.apWarn ? "warn" : apOn ? "ok" : "idle"} lines={["AIL · ELEV", `ROLL ${ailOn ? "ON" : "OFF"} · PITCH ${elevOn ? "ON" : "OFF"}`]} />
          <Node id="surf" title="AILERON / ELEVATOR" st={apOn ? "ok" : "idle"} lines={["hydraulic B"]} />
          <Node id="att" title="ATTITUDE MODEL" st={pw ? "ok" : "idle"} lines={["pitch · roll · hdg", "position vs VOR/ILS"]} />
        </svg>
      </div>
      <p className="mt-1 text-[8px] leading-snug text-subtle">The FD-108 and SP-77 run from the captain's selected sources. The SP-77 AIL / ELEV engage switches hold only while DC power, hydraulic B, valid ATT and valid HDG are all present; if one is lost the switches drop out and the A/P warning flashes. VOR LOC / AUTO APP need a valid signal from the tuned station. The attitude model closes the loop: servo commands move the airplane, whose attitude and position feed the instruments and the radio geometry.</p>
    </div>
  );
}
