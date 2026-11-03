// Lists which section FIELDS are NOT returned by the web derive(): node probe-fields.mts <section> <src>
const [SECTION, SRC] = process.argv.slice(2);
const { initialSim } = await import(SRC + "/lib/sim/initial.ts");
const { derive } = await import(SRC + "/lib/sim/derive.ts");
const { FIELDS } = await import(SECTION);
const d: any = derive(initialSim as any);
console.log(FIELDS.filter((f: string) => d[f] === undefined).join("\n") || "(all returned)");
