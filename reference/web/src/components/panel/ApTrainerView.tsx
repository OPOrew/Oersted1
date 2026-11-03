import { useEffect, useRef, useState } from "react";
import { Panel } from "@/components/panel/MainInstrumentPanel";
import { cn } from "@/lib/utils";

/**
 * Autopilot / navigation view for the Training Console: the actual main instrument panel (glareshield with the FD-108 + SP-77 controls and warning lamps,
 * captain group, centre, first-officer group), not a copy. Every control and instrument is the live one. It opens at a readable size; use the buttons to jump
 * to the captain's side, the autopilot controls or the first officer's side, and the size buttons to zoom. The attitude / autopilot model is shared with the
 * panel on the page (only one copy runs it), so it keeps working in every page view.
 */
const DESIGN_W = 3060;
/* horizontal centres (design px) of the areas to jump to */
const JUMP = { capt: 640, ap: 1530, fo: 2560 } as const;

export function ApTrainerView({ focus = "ap" }: { focus?: "nav" | "ap" }) {
  const wrap = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [h, setH] = useState(900);
  useEffect(() => {
    const upd = () => setH(inner.current?.offsetHeight || 900);
    upd();
    const ro = new ResizeObserver(upd);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, []);
  const jump = (key: keyof typeof JUMP, behavior: ScrollBehavior = "smooth") => {
    const el = wrap.current;
    if (!el) return;
    el.scrollTo({ left: Math.max(0, JUMP[key] * scale - el.clientWidth / 2), top: 0, behavior });
  };
  /* open on the area for this section: the captain's HSI / RMI for navigation, the glareshield A/P controls for the autopilot */
  useEffect(() => { jump(focus === "nav" ? "capt" : "ap", "auto"); }, [focus, scale]); // eslint-disable-line react-hooks/exhaustive-deps
  const btn = "rounded border px-2 py-1.5 font-display text-[9px] uppercase tracking-wide";

  return (
    <div className="mt-2 w-full rounded border border-[#30353b] bg-[#0a0c0f] p-1.5">
      <div className="mb-1.5 flex flex-wrap items-center gap-1">
        {([["capt", "Captain"], ["ap", "A/P controls"], ["fo", "First officer"]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => jump(k)} className={cn(btn, "border-border bg-surface text-fg hover:bg-panel")}>{l}</button>
        ))}
        <span className="ml-auto font-mono text-[8px] uppercase text-subtle">Size</span>
        {([0.35, 0.5, 0.75, 1] as const).map((z) => (
          <button key={z} type="button" onClick={() => setScale(z)} className={cn("rounded border px-1.5 py-1 font-mono text-[9px]", scale === z ? "border-accent/70 bg-accent/10 text-accent" : "border-border bg-inset text-subtle")}>{Math.round(z * 100)}%</button>
        ))}
      </div>
      <div ref={wrap} data-scaled-panel className="max-h-[75vh] overflow-auto overscroll-contain panel-scroll rounded border border-[#343a42] bg-[#121417] p-1">
        <div style={{ width: DESIGN_W * scale, height: h * scale }}>
          <div ref={inner} style={{ width: DESIGN_W, transform: `scale(${scale})`, transformOrigin: "top left" }}>
            <Panel />
          </div>
        </div>
      </div>
    </div>
  );
}
