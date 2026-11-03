// SimTick parity dump: runs the real web store tick() (store.ts) for each step.mts scenario and records every leaf
// of the final state. Usage: node_modules/.bin/tsx dump-tick.mts <section.mts> <web src dir> <out.json>
import { writeFileSync } from "fs";
const [SECTION, SRC, OUT] = process.argv.slice(2);
const { initialSim } = await import(SRC + "/lib/sim/initial.ts");
const { useSim } = await import(SRC + "/lib/sim/store.ts");
const { SCENARIOS } = await import(SECTION);

function leaves(v: any, prefix: string, out: Record<string, any>) {
  if (v && typeof v === "object" && !Array.isArray(v)) { for (const [k, x] of Object.entries(v)) leaves(x, prefix + "." + k, out); }
  else if (Array.isArray(v)) return;
  else out[prefix] = v;
}
const scenarios = SCENARIOS.map(({ name, ov, steps, dt, wx, wxAfter }: any) => {
  const merged: any = { ...initialSim };
  for (const [k, v] of Object.entries(ov)) {
    merged[k] = v && typeof v === "object" && !Array.isArray(v) ? { ...(initialSim as any)[k], ...(v as any) } : v;
  }
  // zustand setState merges top-level keys; start from the initial values so no scenario leaks into the next.
  useSim.setState(merged as any, false);
  for (let i = 0; i < steps; i++) {
    const wxNow = wxAfter && i >= wxAfter[0] ? wxAfter[1] : (wx ?? 0);
    (globalThis as any).__oerstedLiveWxIntensity = wxNow;
    useSim.getState().tick(dt);
  }
  const cur: any = useSim.getState();
  const flat: Record<string, any> = {};
  for (const [k, v] of Object.entries(initialSim)) {
    if (k === "log" || k.startsWith("__")) continue;
    leaves(cur[k], k, flat);
  }
  const expected: Record<string, any> = {};
  for (const [k, v] of Object.entries(flat)) {
    if (k.split(".").some((p) => p.startsWith("__"))) continue;
    expected[k] = typeof v === "number" || typeof v === "string" || typeof v === "boolean" || v === null ? v : null;
  }
  return { name, ov, steps, dt, wx: wx ?? 0, wxAfter: wxAfter ?? null, expected };
});
const fields = Object.keys(scenarios[0].expected);
writeFileSync(OUT, JSON.stringify({ fields, scenarios }, null, 1));
console.log("scenarios", scenarios.length, "fields", fields.length);
