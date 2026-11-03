// Generates Kotlin sim state classes from types.ts/lights.ts (TS AST) + initialSim runtime values.
import ts from "typescript";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";

const [SRC, OUT_KT, OUT_JSON] = process.argv.slice(2);
const interfaces = new Map<string, ts.InterfaceDeclaration>();
const aliases = new Map<string, ts.TypeNode>();
for (const f of ["types.ts", "lights.ts"].map((f) => join(SRC, "lib/sim", f))) {
  const sf = ts.createSourceFile(f, readFileSync(f, "utf8"), ts.ScriptTarget.ES2022, true);
  for (const st of sf.statements) {
    if (ts.isInterfaceDeclaration(st)) interfaces.set(st.name.text, st);
    if (ts.isTypeAliasDeclaration(st)) aliases.set(st.name.text, st.type);
  }
}

type Info = { kt: string; kind: "prim" | "class" | "list" | "map" | "unknown"; prim?: "boolean" | "number" | "string"; cls?: string; elem?: Info; val?: Info };
type Field = { name: string; info: Info; optional: boolean };

const KW = new Set("as break class continue do else false for fun if in interface is null object package return super this throw true try typealias typeof val var when while".split(" "));
const kname = (n: string) => (KW.has(n) ? "`" + n + "`" : n);
const cap = (n: string) => n[0].toUpperCase() + n.slice(1);

const classes = new Map<string, { fields: Field[]; src: string }>(); // name -> fields + rendered source
const warnings: string[] = [];

function toInfo(t: ts.TypeNode, hint: string): Info {
  const P = (prim: Info["prim"], kt: string): Info => ({ kt, kind: "prim", prim });
  if (t.kind === ts.SyntaxKind.BooleanKeyword) return P("boolean", "Boolean");
  if (t.kind === ts.SyntaxKind.NumberKeyword) return P("number", "Double");
  if (t.kind === ts.SyntaxKind.StringKeyword) return P("string", "String");
  if (ts.isLiteralTypeNode(t)) return ts.isStringLiteral(t.literal) ? P("string", "String") : P("number", "Double");
  if (ts.isUnionTypeNode(t)) {
    const nn = t.types.filter((x) => x.kind !== ts.SyntaxKind.NullKeyword);
    if (nn.length && nn.every((x) => ts.isLiteralTypeNode(x))) {
      const isNum = nn.every((x) => ts.isLiteralTypeNode(x) && ts.isNumericLiteral(x.literal));
      return isNum ? P("number", "Double") : P("string", "String");
    }
    const aliasIsLit = (x: ts.TypeNode): boolean => {
      if (ts.isLiteralTypeNode(x)) return true;
      if (!ts.isTypeReferenceNode(x)) return false;
      const a = aliases.get((x.typeName as ts.Identifier).text);
      return !!a && (ts.isLiteralTypeNode(a) || ts.isUnionTypeNode(a));
    };
    if (nn.length && nn.every(aliasIsLit)) return P("string", "String");
    if (nn.length === 1) return toInfo(nn[0], hint);
    warnings.push(`union at ${hint}`);
    return P("string", "String");
  }
  if (ts.isArrayTypeNode(t)) {
    const e = toInfo(t.elementType, hint + "Item");
    return { kt: `MutableList<${e.kt}>`, kind: "list", elem: e };
  }
  if (ts.isTypeLiteralNode(t)) {
    if (!classes.has(hint)) defineClass(hint, [...t.members]);
    return { kt: hint, kind: "class", cls: hint };
  }
  if (ts.isTypeReferenceNode(t)) {
    const n = (t.typeName as ts.Identifier).text;
    if (n === "Record") {
      const v = toInfo(t.typeArguments![1], hint + "Value");
      return { kt: `MutableMap<String, ${v.kt}>`, kind: "map", val: v };
    }
    if (interfaces.has(n)) {
      if (!classes.has(n)) defineClass(n, [...interfaces.get(n)!.members]);
      return { kt: n, kind: "class", cls: n };
    }
    if (aliases.has(n)) return toInfo(aliases.get(n)!, hint);
    warnings.push(`unknown ${n} at ${hint}`);
  }
  warnings.push(`unhandled ${ts.SyntaxKind[t.kind]} at ${hint}`);
  return P("string", "String");
}

function defineClass(name: string, members: ts.TypeElement[]) {
  classes.set(name, { fields: [], src: "" }); // reserve (cycle guard)
  const fields: Field[] = [];
  for (const m of members) {
    if (!ts.isPropertySignature(m) || !m.type) { warnings.push(`skip member in ${name}`); continue; }
    const fname = (m.name as ts.Identifier).text;
    fields.push({ name: fname, info: toInfo(m.type, name + cap(fname)), optional: !!m.questionToken });
  }
  classes.get(name)!.fields = fields;
  classes.get(name)!.src = renderClass(name, fields);
}

function defaultFor(f: Field): string {
  if (f.optional) return "null";
  const i = f.info;
  if (i.kind === "prim") return i.prim === "boolean" ? "false" : i.prim === "number" ? "0.0" : '""';
  if (i.kind === "list") return "mutableListOf()";
  if (i.kind === "map") return "mutableMapOf()";
  if (i.kind === "class") return `${i.cls}()`;
  return '""';
}

function renderClass(name: string, fields: Field[]): string {
  const L: string[] = [`class ${name} {`];
  for (const f of fields) L.push(`    var ${kname(f.name)}: ${f.info.kt}${f.optional ? "?" : ""} = ${defaultFor(f)}`);
  L.push("", `    fun copy(): ${name} {`, `        val c = ${name}()`);
  for (const f of fields) {
    const n = kname(f.name);
    let e = n;
    if (f.info.kind === "class") e = f.optional ? `${n}?.copy()` : `${n}.copy()`;
    else if (f.info.kind === "list") e = `${n}.toMutableList()`;
    else if (f.info.kind === "map") e = `${n}.toMutableMap()`;
    L.push(`        c.${n} = ${e}`);
  }
  L.push("        return c", "    }", "}");
  return L.join("\n");
}

// ---- initial values ----
const init = JSON.parse(readFileSync(OUT_JSON, "utf8"));
const kstr = (s: string) => '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\$").replace(/\n/g, "\\n") + '"';
const knum = (v: number) => {
  if (!Number.isFinite(v)) throw new Error("non-finite number in initialSim");
  const s = String(v);
  return /[.eE]/.test(s) ? s : s + ".0";
};
function valueExpr(i: Info, v: any): string {
  if (i.kind === "prim") return i.prim === "boolean" ? (v ? "true" : "false") : i.prim === "number" ? knum(v) : kstr(String(v));
  if (i.kind === "list") {
    const el = i.elem!;
    if (!Array.isArray(v) || !v.length) return `mutableListOf<${el.kt}>()`;
    return `mutableListOf<${el.kt}>(${v.map((x: any) => valueExpr(el, x)).join(", ")})`;
  }
  if (i.kind === "map") {
    const es = Object.entries(v);
    if (!es.length) return `mutableMapOf<String, ${i.val!.kt}>()`;
    return `mutableMapOf<String, ${i.val!.kt}>(${es.map(([k, x]) => `${kstr(k)} to ${valueExpr(i.val!, x)}`).join(", ")})`;
  }
  if (i.kind === "class") return `${i.cls}().apply { ${applyBody(i.cls!, v ?? {})} }`;
  return kstr(String(v));
}
function applyBody(cls: string, v: any): string {
  const parts: string[] = [];
  for (const f of classes.get(cls)!.fields) {
    if (v == null || !(f.name in v)) continue;
    parts.push(`${kname(f.name)} = ${valueExpr(f.info, v[f.name])}`);
  }
  return parts.join("; ");
}

const ROOTS = ["SimState", "Faults", "LogEntry", "ComponentStatus", "Derived", "ElectricalUserStatus", "HydraulicUserStatus", "Interlock", "LightStatus", "LightComponent", "LightBuses"];
for (const r of ROOTS) if (interfaces.has(r) && !classes.has(r)) defineClass(r, [...interfaces.get(r)!.members]);

const initBody = applyBody("SimState", init);
const header = `// GENERATED by tools/gen-sim.mts from reference/web/src/lib/sim/{types,lights}.ts. Do not hand-edit.
@file:Suppress("unused", "ClassName", "PropertyName", "LocalVariableName")
package com.oersted.trainer.sim

`;
const body = [...classes.values()].map((c) => c.src).join("\n\n");
const initFn = `\n\n/** Port of initialSim (src/lib/sim/initial.ts). Values are copied from the TS at generation time. */\nfun initialSimState(): SimState = SimState().apply { ${initBody} }\n`;
mkdirSync(dirname(OUT_KT), { recursive: true });
writeFileSync(OUT_KT, header + body + initFn);
console.log("classes:", classes.size, "warnings:", warnings.length);
for (const w of warnings.slice(0, 30)) console.log("  WARN", w);
