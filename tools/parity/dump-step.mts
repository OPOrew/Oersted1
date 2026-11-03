// Trajectory parity dump for step(): node dump-step.mts <section.mts> <web src dir> <out.json>
// Each scenario runs the real web step() `steps` times with `dt`, then records every leaf of the final
// state (except the log and dynamic "__" props). Scenario overrides merge into initialSim as in dump-section.
import { writeFileSync } from "fs";
const [SECTION, SRC, OUT] = process.argv.slice(2);
const { initialSim } = await import(SRC + "/lib/sim/initial.ts");
const { step } = await import(SRC + "/lib/sim/derive.ts");
const { SCENARIOS } = await import(SECTION);

function leaves(v: any, prefix: string, out: Record<string, any>) {
  if (v && typeof v === "object" && !Array.isArray(v)) { for (const [k, x] of Object.entries(v)) leaves(x, prefix + "." + k, out); }
  else if (Array.isArray(v)) return; // arrays (log) are not compared
  else out[prefix] = v;
}
const scenarios = SCENARIOS.map(({ name, ov, steps, dt, wx, wxAfter }: any) => {
  const arguments_wxAfter = (i: number) => (wxAfter && i >= wxAfter[0] ? wxAfter[1] : undefined);
  let cur: any = { ...initialSim };
  const merged: any = { ...initialSim };
  for (const [k, v] of Object.entries(ov)) {
    merged[k] = v && typeof v === "object" && !Array.isArray(v) ? { ...(initialSim as any)[k], ...(v as any) } : v;
  }
  cur = merged;
  // Live weather is a global in the web app (liveWeather.ts); set it per tick, optionally changing at wxAfter[0].
  for (let i = 0; i < steps; i++) {
    const wxNow = arguments_wxAfter(i) ?? (wx ?? 0);
    (globalThis as any).__oerstedLiveWxIntensity = wxNow;
    cur = step(cur, dt);
  }
  const flat: Record<string, any> = {};
  for (const [k, v] of Object.entries(cur)) {
    if (k === "log" || k.startsWith("__")) continue;
    leaves(v, k, flat);
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
