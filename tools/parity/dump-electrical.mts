// Runs the real web derive() on each scenario and writes expected electrical outputs (tools/parity/electrical.json).
import { writeFileSync } from "fs";
const SRC = process.argv[2];
const { initialSim } = await import(SRC + "/lib/sim/initial.ts");
const { derive } = await import(SRC + "/lib/sim/derive.ts");
const { ELEC_SCENARIOS } = await import("./scenarios.mts");
const FIELDS = ["dcPower","acPower","acMainBus1Powered","acMainBus2Powered","ac28vMainBus2Powered","transferBus1Powered","transferBus2Powered","dcBus1Powered","dcBus2Powered","tr1Powered","tr2Powered","tr3Powered","batteryBusPowered","ignition1On","ignition2On","externalPowerContactorClosed","externalPowerNotInUse","eng1Running","eng2Running","apuAvailable"];
const out = ELEC_SCENARIOS.map(({ name, ov }) => {
  const { faults, circuitBreakers, ...flat } = ov;
  const s = { ...initialSim, ...flat, faults: { ...initialSim.faults, ...(faults ?? {}) }, circuitBreakers: { ...initialSim.circuitBreakers, ...(circuitBreakers ?? {}) } };
  const d: any = derive(s);
  const expected: Record<string, boolean> = {};
  for (const f of FIELDS) expected[f] = !!d[f];
  return { name, ov, expected };
});
writeFileSync(process.argv[3], JSON.stringify({ fields: FIELDS, scenarios: out }, null, 1));
console.log("scenarios", out.length);
for (const o of out) console.log(o.name, Object.entries(o.expected).filter(([, v]) => v).map(([k]) => k).join(","));
