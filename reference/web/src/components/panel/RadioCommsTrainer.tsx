import { useEffect, useMemo, useState } from "react";
import { useDerived, useSim } from "@/lib/sim/store";
import { usePedestal } from "@/lib/sim/pedestal";
import { useMip } from "@/lib/sim/mipLocal";

/** Software-only VHF receiver audio. It never transmits RF or connects to real avionics. */
type Channel = { side: "L" | "R"; radio: "VHF-1" | "VHF-2"; frequencyKHz: number; label: string; message: string };
const TRAINING_CHANNELS: Channel[] = [
  { side: "L", radio: "VHF-1", frequencyKHz: 121950, label: "Training Tower", message: "Oersted Training One, runway zero niner, cleared for the simulated approach. Maintain present heading and report established." },
  { side: "L", radio: "VHF-1", frequencyKHz: 121800, label: "Training Ground", message: "Oersted Training One, taxi via the training apron. Hold short of runway zero niner. This is a simulated ground transmission." },
  { side: "R", radio: "VHF-2", frequencyKHz: 119100, label: "Training Approach", message: "Oersted Training One, training approach. Descend to three thousand feet in the simulation and expect the ILS runway zero niner." },
];

function formatMHz(kHz: number) { return `${(kHz / 1000).toFixed(3)} MHz`; }

export function RadioCommsTrainer({ audioEnabled }: { audioEnabled: boolean }) {
  const p = usePedestal();
  const mip = useMip();
  const d = useDerived();
  const s = useSim();
  const [messageStatus, setMessageStatus] = useState("READY · SYNTHETIC TRAINING AUDIO");
  const [volume, setVolume] = useState(0.16);

  const activeChannels = useMemo(() => ([
    { side: "L" as const, radio: "VHF-1" as const, frequencyKHz: p.commL.act, monitor: !!p.mic["L:rx:1"] && !!p.mic["L:vol:VHF-1"] },
    { side: "R" as const, radio: "VHF-2" as const, frequencyKHz: p.commR.act, monitor: !!p.mic["R:rx:2"] && !!p.mic["R:vol:VHF-2"] },
  ]), [p.commL.act, p.commR.act, p.mic]);

  const monitored = activeChannels.find((c) => c.monitor);
  const matching = monitored && TRAINING_CHANNELS.find((c) => c.side === monitored.side && c.frequencyKHz === monitored.frequencyKHz);

  const txSelected =
    (p.mic["L:tx:VHF-1"] && mip.srcPower.comm1Cb && "VHF-1") ||
    (p.mic["L:tx:VHF-2"] && mip.srcPower.comm2Cb && "VHF-2") ||
    (p.mic["R:tx:VHF-1"] && mip.srcPower.comm1Cb && "VHF-1") ||
    (p.mic["R:tx:VHF-2"] && mip.srcPower.comm2Cb && "VHF-2") ||
    null;

  const vhf1Powered = d.dcPower && mip.srcPower.comm1Cb;
  const vhf2Powered = d.dcPower && mip.srcPower.comm2Cb;
  const monPowered = monitored && (monitored.radio === "VHF-1" ? vhf1Powered : vhf2Powered);

  /** Receive: DC + CB + audio enabled + monitor. COMM TEST opens squelch when any COMM CB closed. */
  const receiverPowered = audioEnabled && ((!!monPowered) || (p.commTest && d.dcPower && (mip.srcPower.comm1Cb || mip.srcPower.comm2Cb)));
  /** Transmit: power + CB + PTT + TX select. */
  const maskMicInterlock = s.crewMaskMic && (s.crewOxyMode !== "ON" || s.crewOxyPsi <= 0 || s.faults.oxygenSystemFailure);
  const transmitting = d.dcPower && p.ptt && !!txSelected && !maskMicInterlock;

  // Receiver hiss — louder when COMM TEST is on (squelch open)
  useEffect(() => {
    if (!receiverPowered) return;
    let context: AudioContext | null = null;
    let source: AudioBufferSourceNode | null = null;
    let gain: GainNode | null = null;
    try {
      context = new AudioContext();
      const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.22;
      const noise = context.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 1500;
      filter.Q.value = 0.65;
      gain = context.createGain();
      // COMM TEST ≈ open squelch: stronger hiss; TX mutes receive audio
      const base = p.commTest ? volume * 2.2 : volume;
      // Sidetone while PTT (soft tone); else receiver hiss (louder on COMM TEST)
      gain.gain.value = transmitting ? Math.min(0.12, volume * 0.7) : base;
      noise.connect(filter).connect(gain).connect(context.destination);
      noise.start();
      source = noise;
      void context.resume();
    } catch {
      setMessageStatus("AUDIO UNAVAILABLE · CHECK BROWSER AUDIO PERMISSIONS");
    }
    return () => {
      try { source?.stop(); } catch { /* already stopped */ }
      try { gain?.disconnect(); } catch { /* context closing */ }
      if (context && context.state !== "closed") void context.close();
    };
  }, [receiverPowered, volume, p.commTest, transmitting]);

  // Live status for PTT / COMM TEST
  useEffect(() => {
    if (!d.dcPower) {
      setMessageStatus("INHIBITED · SIMULATED DC POWER OFF");
      return;
    }
    if (maskMicInterlock && p.ptt) {
      setMessageStatus("MASK MICROPHONE INHIBITED · CREW OXYGEN NOT AVAILABLE");
      return;
    }
    if (transmitting) {
      setMessageStatus(`TRANSMIT · ${txSelected} · PTT HELD · SIMULATED ONLY (NO RF)`);
      return;
    }
    if (p.ptt && !txSelected) {
      setMessageStatus("PTT HELD · NO TX RADIO SELECTED ON AUDIO PANEL");
      return;
    }
    if (p.commTest) {
      setMessageStatus("COMM TEST · SQUELCH OPEN · RECEIVER HISS");
      return;
    }
    if (!monitored) {
      setMessageStatus("RECEIVE STANDBY · SELECT VHF ON AUDIO PANEL");
      return;
    }
    if (matching) {
      setMessageStatus(`RECEIVE · ${matching.label.toUpperCase()} · ${formatMHz(matching.frequencyKHz)} · READY`);
      return;
    }
    setMessageStatus(`RECEIVE · ${formatMHz(monitored.frequencyKHz)} · NO SCRIPTED STATION`);
  }, [d.dcPower, transmitting, maskMicInterlock, txSelected, p.ptt, p.commTest, monitored, matching]);

  const playMessage = () => {
    if (!audioEnabled) { setMessageStatus("TURN SOUND ON ABOVE FIRST"); return; }
    if (!d.dcPower) { setMessageStatus("INHIBITED · SIMULATED DC POWER OFF"); return; }
    if (transmitting) { setMessageStatus("RELEASE PTT TO RECEIVE"); return; }
    if (!monitored) { setMessageStatus("NO AUDIO · SELECT VHF-1 OR VHF-2 ON THE AUDIO SELECTOR"); return; }
    if (!matching) { setMessageStatus(`NO SCRIPTED TRAINING STATION ON ${formatMHz(monitored.frequencyKHz)}`); return; }
    if (!("speechSynthesis" in window)) { setMessageStatus("SPEECH SYNTHESIS NOT AVAILABLE IN THIS BROWSER"); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(matching.message);
    utterance.rate = 0.88;
    utterance.pitch = 0.82;
    utterance.volume = Math.max(0.1, Math.min(1, volume * 3));
    utterance.onstart = () => setMessageStatus(`RECEIVING · ${matching.label.toUpperCase()} · ${formatMHz(matching.frequencyKHz)}`);
    utterance.onend = () => setMessageStatus("MESSAGE COMPLETE · RECEIVE STANDBY");
    utterance.onerror = () => setMessageStatus("VOICE PLAYBACK FAILED · TRY THE BROWSER AGAIN");
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => () => { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); }, []);

  return (
    <section className="mt-2 rounded border border-border bg-surface p-2">
      <div className="mb-1 font-display text-[9px] uppercase tracking-[.14em] text-subtle">VHF COM · receive + simulated PTT (ATA 23)</div>
      <div role="note" className="mb-2 rounded border border-amber-500/40 bg-amber-950/20 px-2 py-1.5 font-mono text-[8px] uppercase leading-relaxed text-amber-200">
        SIMULATED VOICE AND STATIC ONLY · NO RF TRANSMISSION · NOT CONNECTED TO REAL ATC
      </div>
      <div className="grid grid-cols-2 gap-2 font-mono text-[8px]">
        <div className="rounded border border-border bg-inset p-2">
          VHF-1 · {formatMHz(p.commL.act)}
          <div className="mt-1 text-subtle">{p.mic["L:rx:1"] && p.mic["L:vol:VHF-1"] ? "AUDIO SELECTED" : "AUDIO NOT SELECTED"}</div>
        </div>
        <div className="rounded border border-border bg-inset p-2">
          VHF-2 · {formatMHz(p.commR.act)}
          <div className="mt-1 text-subtle">{p.mic["R:rx:2"] && p.mic["R:vol:VHF-2"] ? "AUDIO SELECTED" : "AUDIO NOT SELECTED"}</div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-[8px] uppercase">
        <div className={`rounded border px-2 py-1 ${d.dcPower ? "border-emerald-500/40 text-emerald-300" : "border-red-500/50 text-red-300"}`}>
          {d.dcPower ? "DC POWER" : "NO DC"}
        </div>
        <div className={`rounded border px-2 py-1 ${p.commTest ? "border-amber-500/50 text-amber-200" : "border-border text-subtle"}`}>
          {p.commTest ? "COMM TEST ON" : "COMM TEST OFF"}
        </div>
        <div className={`rounded border px-2 py-1 ${transmitting ? "border-amber-400 text-amber-100" : "border-border text-subtle"}`}>
          {transmitting ? `TX ${txSelected}` : p.ptt ? "PTT · NO RADIO" : "RX"}
        </div>
      </div>
      <label className="mt-2 flex items-center gap-2 font-mono text-[8px] uppercase text-subtle">
        Radio audio level
        <input aria-label="Radio audio level" className="min-w-0 flex-1" type="range" min="0.02" max="0.5" step="0.01" value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
      </label>
      <button type="button" onClick={playMessage} className="mt-2 w-full rounded border border-accent/50 bg-accent/10 px-2 py-2 font-mono text-[9px] uppercase text-fg hover:bg-accent/20">
        Play simulated ATC message
      </button>
      <p aria-live="polite" className="mt-2 rounded border border-border bg-inset px-2 py-1.5 font-mono text-[8px] uppercase leading-relaxed text-subtle">{messageStatus}</p>
      <p className="mt-1 text-[8px] leading-relaxed text-subtle">
        Receive: DC power + audio selector VHF + volume. COMM TEST (pedestal VHF head) opens squelch (hiss).
        Transmit: select TX radio on audio panel, hold PTT — simulated only, no RF. If MASK MIC is selected, crew oxygen must be ON and available. Release PTT to return to receive.
      </p>
    </section>
  );
}
