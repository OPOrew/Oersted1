// Timed-tick parity for flightPhases.ts controllerTick(). Drives the web controller through its captured interval with
// controlled performance.now / Date.now, runs the web sim tick between controller ticks, and records for every controller
// event: the store values it READ (first-read values, before the event), the live navigation / guidance objects, and every
// leaf it CHANGED. Writes PhaseTickWebParityTest.kt (events replayed in Kotlin with the same inputs).
// Usage: TSX_TSCONFIG_PATH=<web>/tsconfig.json node_modules/.bin/tsx fn/dump-phase-tick.mts <web src dir> <out.kt> [ticks]
import { writeFileSync } from "fs";
const [SRC, OUT, TICKS_ARG] = process.argv.slice(2);
const TICKS = Number(TICKS_ARG ?? 180);
const BASE = 1700000000000;
let T = 10000; // ms, the controlled performance.now()
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
const { usePedestal } = await import(SRC + "/lib/sim/pedestal.ts");
const plan = {
  version: 1, activatedAt: "2026-11-02T00:00:00Z", callsign: "TEST", departure: "RPLL", destination: "WSSS", alternate: "", departureRunway: "06", arrivalRunway: "02L",
  cruiseAltitudeFt: 35000, cruiseSpeedKt: 250, sid: "", enrouteRoute: "", star: "", approach: "", procedureStatus: "unverified", waypoints: [],
};
store.set(ACTIVE_FLIGHT_PLAN_KEY, JSON.stringify(plan));

// ---- recording proxies over the store reads ----
let recording = false;
const reads: Record<string, Set<string>> = { sim: new Set(), mip: new Set(), ped: new Set() };
function proxify(obj: any, prefix: string, bucket: string): any {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return obj;
  return new Proxy(obj, {
    get(t, k, r) {
      const v = Reflect.get(t, k, r);
      if (typeof k !== "string") return v;
      const p = prefix ? prefix + "." + k : k;
      if (v !== null && typeof v === "object" && !Array.isArray(v)) return proxify(v, p, bucket);
      if (recording && (v === undefined || typeof v !== "function")) reads[bucket].add(p);
      return v;
    },
  });
}
const origSim = useSim.getState, origMip = useMip.getState, origPed = usePedestal.getState;
(useSim as any).getState = () => proxify(origSim(), "", "sim");
(useMip as any).getState = () => proxify(origMip(), "", "mip");
(usePedestal as any).getState = () => proxify(origPed(), "", "ped");

function flat(v: any, prefix: string, out: Record<string, any>) {
  if (v && typeof v === "object" && !Array.isArray(v)) { for (const [k, x] of Object.entries(v)) flat(x, prefix ? prefix + "." + k : k, out); }
  else if (!Array.isArray(v) && typeof v !== "function" && !prefix.startsWith("__")) out[prefix] = v === undefined ? null : v;
  return out;
}
const enc = (v: any) => (v === null || v === undefined ? null : v);
const events: any[] = [];
function runEvent(kind: string, t: number, action: () => unknown) {
  const pre = { sim: flat(origSim(), "", {}), mip: flat(origMip(), "", {}), ped: flat(origPed(), "", {}) };
  const nav = fn.getLiveFlightNavigation(), guide = fn.getLiveFlightGuidance();
  const phasePre = pc.usePhase.getState().phase;
  for (const b of Object.keys(reads)) reads[b].clear();
  recording = true;
  const result = action();
  recording = false;
  const post = { sim: flat(origSim(), "", {}), mip: flat(origMip(), "", {}), ped: flat(origPed(), "", {}) };
  const changed: Record<string, [string, any][]> = {};
  for (const b of ["sim", "mip", "ped"]) {
    changed[b] = [];
    for (const k of Object.keys(post[b])) if (pre[b][k] !== post[b][k]) changed[b].push([k, enc(post[b][k])]);
  }
  const snap: Record<string, [string, any][]> = {};
  for (const b of ["sim", "mip", "ped"]) snap[b] = [...reads[b]].sort().map((k) => [k, enc(pre[b][k])]);
  events.push({ kind, t, result: result === true || result === false ? result : null, snap, changed, nav: nav ? JSON.parse(JSON.stringify(nav)) : null, guide: JSON.parse(JSON.stringify(guide)), phasePost: pc.usePhase.getState().phase, phasePre });
}
// ---- the scripted sequence ----
runEvent("load", T, () => pc.loadPlanIntoControls());
runEvent("ensure", T, () => pc.ensureFlightPhaseController());
runEvent("start", T, () => pc.startPhase("TAKEOFF"));
for (let i = 0; i < TICKS; i++) {
  T += 250; // exact in binary, so dt is identical on both sides (0.2 s is not exact)
  for (let s = 0; s < 6; s++) (origSim() as any).tick(1 / 30);
  runEvent("tick", T, () => { if (tickFn) tickFn(); });
}
// ---- emit Kotlin ----
const q = (s: string) => JSON.stringify(s);
const lit = (v: any) => (v === null || v === undefined ? "null" : typeof v === "boolean" ? String(v) : typeof v === "number" ? (Number.isInteger(v) ? v + ".0" : String(v)) : q(String(v)));
const pairs = (arr: [string, any][]) => `arrayOf<Pair<String, Any?>>(${arr.map(([k, v]) => `${q(k)} to ${lit(v)}`).join(", ")})`;
const navK = (n: any) => {
  if (!n) return "null";
  const parts = Object.entries(n).map(([k, v]) => {
    let val: string = lit(v);
    if (k === "phase") val = `FlightPhase.values().first { it.label == ${q(v as string)} }`;
    if (k === "positionMode") val = `PositionMode.values().first { it.label == ${q(v as string)} }`;
    if (k === "version" || k === "activeLegIndex") val = String(v);
    if (k === "guidanceVertMode") val = v === null ? "null" : `VertMode.${v}`;
    return `${k} = ${val}`;
  });
  return `FlightNavigationState(${parts.join(", ")})`;
};
const guideK = (g: any) => `GuidanceResult(${Object.entries(g).map(([k, v]) => `${k} = ${k === "vertMode" ? `VertMode.${v}` : lit(v)}`).join(", ")})`;
const CHUNK = 20;
const evList = events.map((e) => {
  const expect = [
    ...e.changed.sim.map(([k, v]: any) => `        check("sim:${k}", ${lit(v)}, get(w.sim, ${q(k)}))`),
    ...e.changed.mip.map(([k, v]: any) => `        check("mip:${k}", ${lit(v)}, get(w.mip, ${q(k)}))`),
    ...e.changed.ped.map(([k, v]: any) => `        check("ped:${k}", ${lit(v)}, get(w.ped, ${q(k)}))`),
  ].join("\n");
  const act = e.kind === "load" ? `assertTrue(c.loadPlanIntoControls())` : e.kind === "ensure" ? `c.ensureRunning()` : e.kind === "start" ? `assertTrue(c.startPhase(Phase.TAKEOFF))` : `c.tick(${(e.t / 1000).toFixed(3)})`;
  return `        // ${e.kind} @${e.t}
        w.t = ${(e.t / 1000).toFixed(3)}
        w.sim = build(*${pairs(e.snap.sim)})
        w.mip = build(*${pairs(e.snap.mip)})
        w.ped = build(*${pairs(e.snap.ped)})
        w.nav = ${navK(e.nav)}
        w.guide = ${guideK(e.guide)}
        ${act}
${expect}
        assertTrue(c.phase.label == ${q(e.phasePost)})`;
});
const chunks: string[] = [];
for (let i = 0; i < evList.length; i += CHUNK) chunks.push(evList.slice(i, i + CHUNK).join("\n"));
const chunkCalls = chunks.map((_, i) => `        chunk${i}(w, c)`).join("\n");
const chunkFns = chunks.map((body, i) => `    private fun chunk${i}(w: TickWorld, c: PhaseController) {\n${body}\n    }`);
writeFileSync(OUT, `// GENERATED by tools/parity/fn/dump-phase-tick.mts from the web controllerTick() (flightPhases.ts). Do not hand-edit.
package com.oersted.trainer.sim

import com.oersted.trainer.sim.FlightPhases.Phase
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PhaseTickWebParityTest {
    private class TickWorld(var t: Double, var plan: ActiveFlightPlan?) : PhaseWorld {
        var sim: Map<String, Any?> = emptyMap()
        var mip: Map<String, Any?> = emptyMap()
        var ped: Map<String, Any?> = emptyMap()
        var nav: FlightNavigationState? = null
        var guide: GuidanceResult = INACTIVE_GUIDANCE
        override fun nowMs(): Long = 1700000000000L + (t * 1000).toLong()
        override fun perfSec(): Double = t
        override fun activePlan(): ActiveFlightPlan? = plan
        override fun resetNavigation(plan: ActiveFlightPlan) {}
        override fun liveNavigation(): FlightNavigationState? = nav
        override fun liveGuidance(): GuidanceResult = guide
        override fun simLive(): Map<String, Any?> = sim
        override fun simSnapshot(): Map<String, Any?> = sim
        override fun patchSim(p: Map<String, Any?>) { sim = sim + p }
        override fun mipLive(): Map<String, Any?> = mip
        override fun mipSnapshot(): Map<String, Any?> = mip
        override fun patchMip(p: Map<String, Any?>) { mip = mip + p }
        override fun pedestalLive(): Map<String, Any?> = ped
        override fun patchPedestal(p: Map<String, Any?>) { ped = ped + p }
    }

    /** Nested maps from dotted keys ("att.hdg" -> {att: {hdg: v}}), the shape PhaseController.path reads. */
    private fun build(vararg kv: Pair<String, Any?>): Map<String, Any?> {
        val root = LinkedHashMap<String, Any?>()
        for ((k, v) in kv) {
            val parts = k.split(".")
            var m = root
            for (i in 0 until parts.size - 1) {
                @Suppress("UNCHECKED_CAST")
                m = m.getOrPut(parts[i]) { LinkedHashMap<String, Any?>() } as LinkedHashMap<String, Any?>
            }
            m[parts.last()] = v
        }
        return root
    }

    private fun get(m: Map<String, Any?>, key: String): Any? {
        var cur: Any? = m
        for (p in key.split(".")) cur = (cur as? Map<*, *>)?.get(p)
        return cur
    }

    private fun check(name: String, expected: Any?, actual: Any?) {
        if (expected is Double) assertEquals(name, expected, (actual as Number).toDouble(), 1e-6)
        else assertEquals(name, expected, actual)
    }

    @Test fun controllerTickMatchesWebAcrossTakeoff() {
        val w = TickWorld(10.0, ActiveFlightPlan(
            activatedAt = "2026-11-02T00:00:00Z", callsign = "TEST", departure = "RPLL", destination = "WSSS",
            alternate = "", departureRunway = "06", arrivalRunway = "02L", cruiseAltitudeFt = 35000.0, cruiseSpeedKt = 250.0,
            sid = "", enrouteRoute = "", star = "", approach = "", procedureStatus = "unverified",
            waypoints = emptyList(), arrival = null, timeCompression = null,
        ))
        val c = PhaseController(w)
${chunkCalls}
    }

${chunkFns.join("\n\n")}
}
`);

// ---- end-to-end file: the Kotlin sim tick + controller over the same web run ----
const E2E_OUT = process.argv[5];
if (E2E_OUT) {
  const pairsK = (arr: [string, any][]) => `arrayOf<Pair<String, Any?>>(${arr.map(([k, v]) => `${q(k)} to ${lit(v)}`).join(", ")})`;
  const evK = events.map((e) => {
    const nav = e.nav ? `NavSum(${lit(e.nav.latitude)}, ${lit(e.nav.longitude)}, ${e.nav.activeLegIndex}, ${q(e.nav.phase)})` : "null";
    return `        Ev(${q(e.kind)}, ${(e.t).toFixed(1)}, ${pairsK(e.snap.sim)}, ${pairsK(e.snap.mip)}, ${pairsK(e.changed.sim)}, ${pairsK(e.changed.mip)}, ${q(e.phasePost)}, ${nav}),`;
  });
  const CH = 40;
  const chunksE: string[] = [];
  for (let i = 0; i < evK.length; i += CH) chunksE.push(evK.slice(i, i + CH).join("\n"));
  const fnsE = chunksE.map((b, i) => `    private fun part${i}(): List<Ev> = listOf(\n${b}\n    )`);
  const callsE = chunksE.map((_, i) => `part${i}()`).join(" + ");
  writeFileSync(E2E_OUT, `// GENERATED by tools/parity/fn/dump-phase-tick.mts (end-to-end): the Kotlin SimStore tick and PhaseController, through SimPhaseWorld,
// over the same web run as PhaseTickWebParityTest. Do not hand-edit.
package com.oersted.trainer.sim

import com.oersted.trainer.sim.FlightPhases.Phase
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PhaseE2EWebParityTest {
    private data class NavSum(val lat: Double, val lon: Double, val leg: Int, val phase: String)
    private data class Ev(
        val kind: String,
        val tMs: Double,
        val snapSim: Array<Pair<String, Any?>>,
        val snapMip: Array<Pair<String, Any?>>,
        val changedSim: Array<Pair<String, Any?>>,
        val changedMip: Array<Pair<String, Any?>>,
        val phase: String,
        val nav: NavSum?,
    )

${fnsE.join("\n\n")}

    private fun getPath(m: Map<String, Any?>, key: String): Any? {
        var cur: Any? = m
        for (p in key.split(".")) cur = (cur as? Map<*, *>)?.get(p)
        return cur
    }

    private fun check(name: String, expected: Any?, actual: Any?) {
        if (expected is Number) {
            val a = (actual as? Number) ?: throw AssertionError("$name: expected $expected, got $actual")
            assertEquals(name, expected.toDouble(), a.toDouble(), 1e-6)
        } else assertEquals(name, expected, actual)
    }

    @Test fun endToEndTakeoffMatchesWeb() {
        val base = 1700000000000L
        var tMs = 10000.0
        val plan = ActiveFlightPlan(
            activatedAt = "2026-11-02T00:00:00Z", callsign = "TEST", departure = "RPLL", destination = "WSSS",
            alternate = "", departureRunway = "06", arrivalRunway = "02L", cruiseAltitudeFt = 35000.0, cruiseSpeedKt = 250.0,
            sid = "", enrouteRoute = "", star = "", approach = "", procedureStatus = "unverified",
            waypoints = emptyList(), arrival = null, timeCompression = null,
        )
        val nav = FlightNavigator()
        val store = SimStore(initialSimState(), nav, { plan }, { (base + tMs).toDouble() })
        val mip = MipLocal.Holder()
        val ped = Pedestal.Holder()
        val w = SimPhaseWorld(store, mip, ped, nav, { base + tMs.toLong() }, { tMs / 1000.0 }, { plan })
        val c = PhaseController(w)
        for (e in ${callsE}) {
            tMs = e.tMs
            if (e.kind == "tick") repeat(6) { store.tick(1.0 / 30.0) }
            val simNow = SimPhaseWorld.simToMap(store.current())
            val mipNow = SimPhaseWorld.mipToMap(mip.state)
            for ((k, v) in e.snapSim) check("pre sim:" + k + " @" + tMs, v, getPath(simNow, k))
            for ((k, v) in e.snapMip) check("pre mip:" + k + " @" + tMs, v, getPath(mipNow, k))
            e.nav?.let { n ->
                val live = w.liveNavigation()!!
                check("pre nav.lat @" + tMs, n.lat, live.latitude)
                check("pre nav.lon @" + tMs, n.lon, live.longitude)
                assertEquals("pre nav.leg @" + tMs, n.leg, live.activeLegIndex)
            }
            when (e.kind) {
                "load" -> assertTrue(c.loadPlanIntoControls())
                "ensure" -> c.ensureRunning()
                "start" -> assertTrue(c.startPhase(Phase.TAKEOFF))
                else -> c.tick(tMs / 1000.0)
            }
            val simPost = SimPhaseWorld.simToMap(store.current())
            val mipPost = SimPhaseWorld.mipToMap(mip.state)
            for ((k, v) in e.changedSim) check("post sim:" + k + " @" + tMs, v, getPath(simPost, k))
            for ((k, v) in e.changedMip) check("post mip:" + k + " @" + tMs, v, getPath(mipPost, k))
            assertEquals("phase @" + tMs, e.phase, c.phase.label)
        }
    }
}
`);
console.log("e2e events", events.length, "file", E2E_OUT);
}

console.log("events", events.length, "changed sim/mip/ped", events.reduce((a, e) => a + e.changed.sim.length + e.changed.mip.length + e.changed.ped.length, 0));
