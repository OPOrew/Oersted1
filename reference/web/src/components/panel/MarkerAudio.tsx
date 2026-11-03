import { useEffect, useRef } from "react";
import { useMip } from "@/lib/sim/mipLocal";
import { useDerived } from "@/lib/sim/store";
import { activeMarker, markerKeyed, markerSpec } from "@/lib/sim/markerBeacons";

/**
 * Marker beacon tones (synthetic, Web Audio — no recording): OUTER 400 Hz dashes, MIDDLE 1300 Hz dot-dash, INNER 3000 Hz dots.
 * Silent unless the page SOUND switch is on, DC power is available and a marker is actually being received.
 * Mounted once on the cockpit page so the tone is heard wherever the trainee is looking (map, panel, training console).
 */
export function MarkerAudioDriver({ enabled }: { enabled: boolean }) {
  const m = useMip();
  const d = useDerived();
  const powered = !!d.dcPower;
  const id = enabled && powered && m.navOn ? activeMarker(m.markers ?? { om: false, mm: false, im: false }) : null;
  const ctxRef = useRef<{ ctx: AudioContext; osc: OscillatorNode; gain: GainNode } | null>(null);

  useEffect(() => {
    if (!id) return;
    let graph = ctxRef.current;
    if (!graph) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      graph = ctxRef.current = { ctx, osc, gain };
    }
    const { ctx, osc, gain } = graph;
    if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
    osc.frequency.setValueAtTime(markerSpec(id).hz, ctx.currentTime);
    const tick = () => gain.gain.setTargetAtTime(markerKeyed(id, performance.now() / 1000) ? 0.12 : 0, ctx.currentTime, 0.004);
    tick();
    const iv = setInterval(tick, 20);
    return () => { clearInterval(iv); gain.gain.setTargetAtTime(0, ctx.currentTime, 0.01); };
  }, [id]);

  useEffect(() => () => { const g = ctxRef.current; if (g) { try { g.osc.stop(); void g.ctx.close(); } catch { /* already closed */ } ctxRef.current = null; } }, []);
  return null;
}
