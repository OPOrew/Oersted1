// Long end-to-end parity: web store tick + controller over N controller ticks (250 ms, 6 sim ticks each) with scripted
// phase starts. Checkpoints every CK ticks record the full controller-relevant sim / MIP / nav values after the tick.
// The Kotlin side runs its own sim tick + controller + SimPhaseWorld and compares at the checkpoints.
// Usage: TSX_TSCONFIG_PATH=<web>/tsconfig.json node_modules/.bin/tsx fn/dump-phase-long.mts <web src> <sim-kt> <out.kt> [N] [CK]
import { readFileSync, writeFileSync } from "fs";
const [SRC, SIMKT, OUT, NARG, CKARG] = process.argv.slice(2);
const N = Number(NARG ?? 5000), CK = Number(CKARG ?? 25);
const FINE_FROM = Number(process.env.FINE_FROM ?? 1e12), FINE_TO = Number(process.env.FINE_TO ?? -1);
const BASE = 1700000000000;
let T = 10000;
const store = new Map<string, string>();
let tickFn: (() => void) | null = null;
(globalThis as any).window = {
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, String(v)); }, removeItem: (k: string) => { store.delete(k); } },
  addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
  setInterval: (fn: () => void) => { tickFn = fn; return 1; }, clearInterval: () => { tickFn = null; },
  setTimeout: () => 0, clearTimeout: () => {},
};
(globalThis as any).CustomEvent = class { type: string; detail: any; constructor(t: string, o: any = {}) { this.type = t; this.detail = o.detail; } };
Object.defineProperty(globalThis, "performance", { value: { now: () => T }, configurable: true });
Date.now = () => BASE + T;
const { ACTIVE_FLIGHT_PLAN_KEY } = await import(SRC + "/lib/sim/activeFlightPlan.ts");
const pc = await import(SRC + "/lib/sim/flightPhases.ts");
const fn = await import(SRC + "/lib/sim/flightNavigation.ts");
const { useSim } = await import(SRC + "/lib/sim/store.ts");
const { useMip } = await import(SRC + "/lib/sim/mipLocal.ts");
// Vectored ILS arrival to WSSS 02L, built exactly as flight-plan.tsx vectorArrivalFor does (web buildVectorArrival).
const nd: any = await import(SRC + "/lib/sim/navData.ts");
const ILS = nd.WSSS_ILS_02L;
const depArp = nd.AIRPORT_DATA.RPLL;
const vec = nd.buildVectorArrival(ILS, depArp.arpLat, depArp.arpLon);
const wps = vec.waypoints.map((w: any) => ({ id: w.id, name: w.name, latitude: w.latitude, longitude: w.longitude, altitudeFt: w.altitudeFt, speedKt: w.speedKt }));
const arrivalObj = { kind: "vector-ils", airport: "WSSS", runway: ILS.runway, sceneId: ILS.id, firstFixName: wps[0].name, lastFixName: wps[wps.length - 1].name, ilsFrequencyMHz: ILS.frequencyMHz, courseMag: ILS.courseMag };
const plan = {
  version: 1, activatedAt: "2026-11-02T00:00:00Z", callsign: "TEST", departure: "RPLL", destination: "WSSS", alternate: "", departureRunway: "06", arrivalRunway: "02L",
  cruiseAltitudeFt: 35000, cruiseSpeedKt: 250, sid: "", enrouteRoute: "", star: "", approach: "", procedureStatus: "unverified", waypoints: wps, arrival: arrivalObj,
};
store.set(ACTIVE_FLIGHT_PLAN_KEY, JSON.stringify(plan));
// Scripted phase starts by tick index (gates decide; the result is recorded and replayed).
const ACTIONS: Record<number, string> = { 1200: "CLIMB", 2400: "CRUISE", 3600: "DESCENT", 4400: "APPROACH", 6200: "LAND" };
const SIM_KEYS = [...readFileSync(SIMKT, "utf8").matchAll(/"(\w+)" to s\./g)].map((m) => m[1]);
const MIP_KEYS = ["apAil", "apElev", "apHdgSw", "apNav", "fdMode", "navResetN", "planNav", "planNavStatus", "attLive", "selHdg", "selCrs", "xpdrMode", "apWarn", "apWhy"];
const flatOf = (v: any, prefix: string, out: Record<string, any>) => {
  if (v && typeof v === "object" && !Array.isArray(v)) { for (const [k, x] of Object.entries(v)) flatOf(x, prefix ? prefix + "." + k : k, out); }
  else if (!Array.isArray(v) && typeof v !== "function") out[prefix] = v;
  return out;
};
const lit = (v: any) => (v === null || v === undefined ? "null" : typeof v === "boolean" ? String(v) : typeof v === "number" ? (Number.isInteger(v) ? v + ".0" : String(v)) : JSON.stringify(String(v)));
function routeNmOf(): number { const pts: any[] = (fn as any).planRoutePoints(plan); let t = 0; for (let q = 1; q < pts.length; q++) t += (fn as any).distanceNm(pts[q-1].latitude, pts[q-1].longitude, pts[q].latitude, pts[q].longitude); return t; }
const acts: string[] = [];
const checks: string[] = [];
const simNum = (x: any) => typeof x === "number" ? x : null;
function snapshot(i: number, phase: string) {
  const s: any = useSim.getState();
  const m: any = useMip.getState();
  const sf = flatOf(s, "", {}), mf = flatOf(m, "", {});
  const nav = fn.getLiveFlightNavigation();
  const sim = SIM_KEYS.map((k) => `${JSON.stringify(k)} to ${lit(sf[k] ?? null)}`).join(", ");
  const mip = MIP_KEYS.map((k) => `${JSON.stringify(k)} to ${lit(mf[k] ?? null)}`).concat([`"attHdgReq.n" to ${lit(mf["attHdgReq.n"] ?? null)}`]).join(", ");
  const navS = nav ? `NavSum(${lit(nav.latitude)}, ${lit(nav.longitude)}, ${nav.activeLegIndex}, ${lit(nav.phase)})` : "null";
  const gd: any = fn.getLiveFlightGuidance();
  const guideS = `arrayOf<Pair<String, Any?>>("guide.distToTodNm" to ${lit(gd?.distToTodNm ?? null)}, "guide.targetAltFt" to ${lit(gd?.targetAltFt ?? null)}, "guide.vertMode" to ${lit(gd?.vertMode ?? null)}, "nav.dDest" to ${lit((fn.getLiveFlightNavigation() as any)?.distanceToDestinationNm ?? null)}, "nav.routeNm" to ${lit(routeNmOf())})`;
  checks.push(`        Ck(${i}, arrayOf<Pair<String, Any?>>(${sim}), arrayOf<Pair<String, Any?>>(${mip}), ${navS}, ${lit(phase)}, ${guideS}),`);
  void simNum;
}
// ---- setup at T=10000: load, ensure, start TAKEOFF (as the short run) ----
const r0 = pc.loadPlanIntoControls();
pc.ensureFlightPhaseController();
const rTo = pc.startPhase("TAKEOFF");
acts.push(`        Act(0, "TAKEOFF", ${rTo}),`);
void r0;
let phaseLabel = pc.usePhase.getState().phase;
for (let i = 1; i <= N; i++) {
  T += 250;
  for (let s = 0; s < 6; s++) (useSim.getState() as any).tick(1 / 30);
  const act = ACTIONS[i];
  if (act) {
    const r = pc.startPhase(act as any);
    acts.push(`        Act(${i}, ${lit(act)}, ${r}),`);
  } else {
    if (tickFn) tickFn();
  }
  phaseLabel = pc.usePhase.getState().phase;
  if (i % CK === 0 || act || (i >= FINE_FROM && i <= FINE_TO)) snapshot(i, phaseLabel);
}
const kd = (x: number) => { const t = String(x); return /[.eE]/.test(t) ? t : t + ".0"; };
const wpsKt = wps.map((w: any) => `ActiveFlightWaypoint(id = ${JSON.stringify(w.id)}, name = ${JSON.stringify(w.name)}, latitude = ${kd(w.latitude)}, longitude = ${kd(w.longitude)}, altitudeFt = ${kd(w.altitudeFt)}, speedKt = ${kd(w.speedKt)})`).join(", ");
const arrKt = `ActiveArrival(kind = "vector-ils", airport = "WSSS", runway = ${JSON.stringify(ILS.runway)}, sceneId = ${JSON.stringify(ILS.id)}, firstFixName = ${JSON.stringify(arrivalObj.firstFixName)}, lastFixName = ${JSON.stringify(arrivalObj.lastFixName)}, ilsFrequencyMHz = ${kd(ILS.frequencyMHz)}, courseMag = ${kd(ILS.courseMag)})`;
const chunk = (arr: string[], n: number, name: string, ty: string) => {
  const out: string[] = [];
  for (let i = 0; i < arr.length; i += n) out.push(`    private fun ${name}${out.length}(): List<${ty}> = listOf<${ty}>(\n${arr.slice(i, i + n).join("\n")}\n    )`);
  return out;
};
const ckFns = chunk(checks, 25, "ck", "Ck");
const actFns = chunk(acts, 25, "act", "Act");
writeFileSync(OUT, `// GENERATED by tools/parity/fn/dump-phase-long.mts (long end-to-end, ${N} controller ticks, checkpoint every ${CK}). Do not hand-edit.
package com.oersted.trainer.sim

import com.oersted.trainer.sim.FlightPhases.Phase
import org.junit.Assert.assertEquals
import org.junit.Test

class PhaseLongE2EWebParityTest {
    private data class NavSum(val lat: Double, val lon: Double, val leg: Int, val phase: String)
    private data class Ck(val i: Int, val sim: Array<Pair<String, Any?>>, val mip: Array<Pair<String, Any?>>, val nav: NavSum?, val phase: String, val guide: Array<Pair<String, Any?>>)
    private data class Act(val i: Int, val phase: String, val result: Boolean)

${ckFns.join("\n\n")}

${actFns.join("\n\n")}

    private fun getPath(m: Map<String, Any?>, key: String): Any? {
        var cur: Any? = m
        for (p in key.split(".")) cur = (cur as? Map<*, *>)?.get(p)
        return cur
    }

    private fun check(name: String, expected: Any?, actual: Any?) {
        if (expected is Number) {
            val a = (actual as? Number) ?: throw AssertionError("$name: expected $expected, got $actual")
            assertEquals(name, expected.toDouble(), a.toDouble(), maxOf(1e-6, 1e-6 * Math.abs(expected.toDouble())))
        } else assertEquals(name, expected, actual)
    }

    @Test fun longRunMatchesWeb() {
        val base = 1700000000000L
        var tMs = 10000.0
        val plan = ActiveFlightPlan(
            activatedAt = "2026-11-02T00:00:00Z", callsign = "TEST", departure = "RPLL", destination = "WSSS",
            alternate = "", departureRunway = "06", arrivalRunway = "02L", cruiseAltitudeFt = 35000.0, cruiseSpeedKt = 250.0,
            sid = "", enrouteRoute = "", star = "", approach = "", procedureStatus = "unverified",
            waypoints = listOf(${wpsKt}), arrival = ${arrKt}, timeCompression = null,
        )
        val nav = FlightNavigator()
        val store = SimStore(initialSimState(), nav, { plan }, { (base + tMs).toDouble() })
        val mip = MipLocal.Holder()
        val w = SimPhaseWorld(store, mip, Pedestal.Holder(), nav, { base + tMs.toLong() }, { tMs / 1000.0 }, { plan })
        val c = PhaseController(w)
        assertEquals(true, c.loadPlanIntoControls())
        c.ensureRunning()
        val acts: List<Act> = ${actFns.map((_, i) => `act${i}()`).join(" + ")}
        val cks: List<Ck> = ${ckFns.map((_, i) => `ck${i}()`).join(" + ")}
        val actByIdx = acts.associateBy { it.i }
        actByIdx[0]?.let { a0 -> assertEquals("start TAKEOFF @0", a0.result, c.startPhase(Phase.TAKEOFF)) }
        val ckByIdx = cks.map { it as Ck }.associateBy { it.i }
        for (i in 1..${N}) {
            tMs = 10000.0 + 250.0 * i
            repeat(6) { store.tick(1.0 / 30.0) }
            val a = actByIdx[i]
            if (a != null) {
                val got = when (a.phase) { "CLIMB" -> c.startPhase(Phase.CLIMB); "CRUISE" -> c.startPhase(Phase.CRUISE); "DESCENT" -> c.startPhase(Phase.DESCENT); "APPROACH" -> c.startPhase(Phase.APPROACH); "LAND" -> c.startPhase(Phase.LAND); else -> c.startPhase(Phase.TAKEOFF) }
                assertEquals("start ${"$"}{a.phase} @${"$"}i", a.result, got)
            } else c.tick(tMs / 1000.0)
            val k = ckByIdx[i]
            if (k != null) {
                val simNow = SimPhaseWorld.simToMap(store.current())
                val mipNow = SimPhaseWorld.mipToMap(mip.state)
                assertEquals("phase @" + i, k.phase, c.phase.label)
                val g = w.liveGuidance()
                val gMap = mapOf<String, Any?>("guide.distToTodNm" to g.distToTodNm, "guide.targetAltFt" to g.targetAltFt, "guide.vertMode" to g.vertMode?.toString(), "nav.dDest" to w.liveNavigation()?.distanceToDestinationNm, "nav.routeNm" to FlightPhaseControl.totalRouteDistanceNm(plan))
                for ((key, v) in k.guide) check(key + " @" + i, v, gMap[key])
                for ((key, v) in k.sim) check("sim:" + key + " @" + i, v, getPath(simNow, key))
                for ((key, v) in k.mip) check("mip:" + key + " @" + i, v, getPath(mipNow, key))
                k.nav?.let { n ->
                    val live = w.liveNavigation()!!
                    check("nav.lat @" + i, n.lat, live.latitude)
                    check("nav.lon @" + i, n.lon, live.longitude)
                    assertEquals("nav.leg @" + i, n.leg, live.activeLegIndex)
                }
            }
        }
    }
}
`);
console.log("ticks", N, "checkpoints", checks.length, "actions", acts.length);
