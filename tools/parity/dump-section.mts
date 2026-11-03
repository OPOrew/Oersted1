// Generic parity dump: node dump-section.mts <section.mts> <web src dir> <out.json>
// Runs the real web derive() on each scenario. Throws if a listed field is NOT returned by derive()
// (locals are invisible and would otherwise be silently recorded as false).
import { writeFileSync } from "fs";
const [SECTION, SRC, OUT] = process.argv.slice(2);
const { initialSim } = await import(SRC + "/lib/sim/initial.ts");
const { derive } = await import(SRC + "/lib/sim/derive.ts");
const { FIELDS, SCENARIOS, EXPR = {} } = await import(SECTION);
// Flatten plain-object outputs into dotted leaf names (e.g. gearLights.nose.green), matching Kotlin's nested classes.
function leaves(v: any, prefix: string, out: Record<string, any>) {
  if (v && typeof v === "object" && !Array.isArray(v)) { for (const [k, x] of Object.entries(v)) leaves(x, prefix + "." + k, out); }
  else if (Array.isArray(v)) out[prefix] = v.map((x: any) => (x && typeof x === "object" ? Object.values(x).join("|") : String(x))).join("\n");
  else out[prefix] = v;
}
const scenarios = SCENARIOS.map(({ name, ov }: any) => {
  const merged: any = { ...initialSim };
  for (const [k, v] of Object.entries(ov)) {
    merged[k] = v && typeof v === "object" && !Array.isArray(v) ? { ...(initialSim as any)[k], ...(v as any) } : v;
  }
  const d: any = derive(merged);
  const expected: Record<string, boolean | number | string> = {};
  for (const f of FIELDS) {
    // Dotted names (e.g. "brakeSource.li") walk into nested outputs.
    const val: any = f.split(".").reduce((o: any, k: string) => (o == null ? undefined : o[k]), d);
    if (val === undefined) throw new Error(`derive() does not return "${f}" (scenario ${name})`);
    const flat: Record<string, any> = {};
    leaves(val, f, flat);
    for (const [k, v] of Object.entries(flat)) expected[k] = typeof v === "number" || typeof v === "string" ? v : !!v;
  }
  return { name, ov, expected };
});
const outFields = Object.keys(scenarios[0].expected);
writeFileSync(OUT, JSON.stringify({ fields: outFields, scenarios, expr: EXPR }, null, 1));
console.log("scenarios", scenarios.length, "fields", outFields.length);
