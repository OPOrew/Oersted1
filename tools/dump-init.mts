import { writeFileSync } from "fs";
const SRC = process.argv[2];
const { initialSim } = await import(SRC + "/lib/sim/initial.ts");
writeFileSync(process.argv[3], JSON.stringify(initialSim, null, 1));
console.log("keys", Object.keys(initialSim).length);
