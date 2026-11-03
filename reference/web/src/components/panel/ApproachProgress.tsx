import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Light } from "@/lib/sim/autoflight";

/** Approach progress display (AMM 22-11-0): VOR/LOC and GLIDE SLOPE lights, amber = armed, green = captured; press to test. */
export function ApproachProgress({ ann, pw }: { ann: { voc: Light; gs: Light }; pw: boolean }) {
  const [test, setTest] = useState(false);
  const lamp = (label: string, l: Light) => {
    const st: Light = !pw ? "OFF" : test ? "GREEN" : l;
    const cls = st === "GREEN" ? "border-[#9dffae] bg-[#27b84a] text-[#031a08] shadow-[0_0_10px_rgba(60,230,100,.8)]" : st === "AMBER" ? "border-[#ffd27a] bg-[#e9a93a] text-[#2a1b00] shadow-[0_0_10px_rgba(233,169,58,.8)]" : "border-[#2a2f36] bg-[#15181c] text-[#4a4f57]";
    return <div className={cn("flex flex-1 items-center justify-center rounded-[2px] border px-0.5 text-center font-mono text-[7px] font-bold leading-tight", cls)}>{label}</div>;
  };
  return (
    <button type="button" aria-label="Approach progress display (press to test)" className="flex size-full select-none flex-col gap-0.5 rounded-[3px] border border-[#05070a] bg-[#0b0d10] p-0.5" onPointerDown={() => setTest(true)} onPointerUp={() => setTest(false)} onPointerLeave={() => setTest(false)}>
      {lamp("VOR/LOC", ann.voc)}
      {lamp("GLIDE SLOPE", ann.gs)}
    </button>
  );
}
