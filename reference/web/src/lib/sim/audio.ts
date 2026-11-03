/* Cockpit sounds — aural warnings prefer the supplied sample files under /sounds/;
   engines / gear / flaps / switches stay synthesised (Web Audio API).
   Samples used when present:
     /sounds/fire-bell-loop.mp3  — continuous fire warning bell
     /sounds/stickshaker.mp3                         — stall stick-shaker (looped while test/condition active)
     /sounds/autopilot-disconnect.mp3|.wav           — A/P disconnect wailer (looped while latched)
     /sounds/engine-idle-loop.mp3, /sounds/engine-power-loop.mp3 — recorded JT8D-15 (737-200 ground run: idle + 98 % N1), seamless
                                                     loops blended / pitched by N1 for each engine
   Fallback: original synthesised bell / shaker / wailer / engine if a file fails to load.
   Driven by sim state through useSimAudio(). */
import { useCallback, useEffect, useRef, useState } from "react";
import { newAcousticSpool, stepAcousticSpool, type AcousticSpool } from "./engineSpoolAudio";

export type SimAudioInputs = {
  apuRpm: number; // 0–100 (%)
  apuStarter: boolean;
  n2: [number, number]; // 0–100 (%)
  n1?: [number, number]; // 0–100 (%) — fan speed; drives the thrust-dependent engine sound
  startValve: [boolean, boolean];
  startSw: [string, string]; // "OFF" | "GRD" | "IGN_L" | "IGN_R" | "FLT"
  lever: [boolean, boolean]; // fuel / start lever
  fire: { e1: boolean; e2: boolean; apu: boolean };
  // ── optional extras: gear, flight controls, brakes and systems ──
  fireOther?: boolean; // wheel well / cargo fire warning (rings the bell too)
  gear?: [number, number, number]; // nose, left main, right main: 0 = up/locked, 1 = down/locked
  gearLever?: string; // "UP" | "OFF" | "DN"
  gearHorn?: boolean;
  apWarn?: boolean; // autopilot disconnect wailer (737-200 AWM)
  stallWarn?: boolean; // stick-shaker (stall warning)
  machWarn?: boolean; // Mach / airspeed warning clacker
  /** GPWS SYS TEST held (MIP) — plays full vocabulary sample */
  gpwsTest?: boolean;
  /** Below-glideslope alert (Mode 5) — loops glideslope sample */
  glideslopeWarn?: boolean;
  /** Take-off configuration warning and/or cabin altitude > ~10 000 ft (intermittent horn) */
  configOrCabinHorn?: boolean;
  flapPos?: number; // 0–1
  flapLever?: number;
  lePos?: number; // 0–1 (leading-edge devices)
  spoilerPos?: number; // 0–1
  speedBrake?: string;
  apuDoor?: number; // 0–1
  hydPressure?: [number, number, number]; // system A, B, standby (psi)
  hydPumps?: number; // pumps currently running
  elecPumps?: boolean; // an electric pump is running
  wow?: boolean;
  groundSpeedKt?: number;
  rwyPhase?: string; // "IDLE" | "APPROACH" | "ROLLOUT" | "STOPPED" | "OVERRUN"
  wheelSpeeds?: [number, number, number, number]; // LI, LO, RI, RO (kt)
  wheelBrake?: [number, number, number, number]; // brake pressure at LI, LO, RI, RO (psi)
  antiskid?: boolean;
  parkingBrake?: boolean;
  reversers?: [boolean, boolean];
  relays?: boolean[]; // contactor-type states: any change gives a relay clunk
  packs?: [boolean, boolean];
  fuelPumps?: number; // fuel pumps running
  acPower?: boolean;
  dcPower?: boolean;
  fireHandles?: boolean[]; // E1, E2, APU fire handles pulled
  bottles?: boolean[]; // fire bottles discharged
  signs?: [string, string]; // seat belt, no smoking
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let enabled = false;
let volume = 0.6;
let apuVoice: { update: (rpm: number, starter: boolean) => void } | null = null;
let engVoices: { update: (n1: number, n2: number, valve: boolean, snap?: boolean) => void }[] = [];
let engSnap = true; // first engine update after the sound is switched on: adopt the real engine state, don't spool up from zero
let lastSwitchClick = 0;
let lastLever: [boolean, boolean] = [false, false];
let lastClick: [number, number] = [0, 0];
let bellNext = 0; // audio-clock time of the next scheduled fire-bell strike (0 = bell not ringing)
let bellK = 0; // strike counter: the hammer alternates between two gongs

/* ── Supplied sample files (preferred over synthesised aural warnings) ── */
const SAMPLE_PATHS = {
  fireBell: ["/sounds/fire-bell-loop.mp3"],
  stickshaker: ["/sounds/stickshaker.mp3"],
  apDisconnect: ["/sounds/autopilot-disconnect.mp3", "/sounds/autopilot-disconnect.wav"],
  glideslope: ["/sounds/glideslope.mp3"],
  gpwsVocab: ["/sounds/gpws-vocabulary.mp3"],
  configCabinHorn: ["/sounds/takeoff-config-cabin-altitude.mp3"],
  // Recorded engine, cut into two pre-crossfaded seamless loops (native BufferSource.loop is click-free on these)
  engineIdle: ["/sounds/engine-idle-loop.mp3"],
  engineRun: ["/sounds/engine-power-loop.mp3"],
} as const;

type SampleKey = keyof typeof SAMPLE_PATHS;
const sampleBuf: Partial<Record<SampleKey, AudioBuffer>> = {};
let samplesLoading: Promise<void> | null = null;

/** Continuous sample loop: gain-gated so start/stop is click-free. */
type SampleLoop = { set: (on: boolean) => void; dispose: () => void };
const sampleLoops: Partial<Record<SampleKey, SampleLoop>> = {};
let sampleFireOn = false;
let sampleShakerOn = false;
let sampleWailerOn = false;
let sampleGsOn = false;
let sampleGpwsOn = false;
let sampleHornOn = false;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

async function decodeSample(c: AudioContext, url: string): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return await c.decodeAudioData(ab.slice(0));
  } catch {
    return null;
  }
}

async function loadSamples(c: AudioContext) {
  if (samplesLoading) return samplesLoading;
  samplesLoading = (async () => {
    for (const key of Object.keys(SAMPLE_PATHS) as SampleKey[]) {
      if (sampleBuf[key]) continue;
      for (const url of SAMPLE_PATHS[key]) {
        const buf = await decodeSample(c, url);
        if (buf) {
          sampleBuf[key] = buf;
          break;
        }
      }
    }
  })();
  return samplesLoading;
}

/**
 * Seamless continuous sample player.
 * Native BufferSource.loop often clicks or gaps at the seam (especially short clips
 * and ~20–30 s loops on mobile). We schedule successive plays with a short crossfade
 * overlap so the fire bell / stick-shaker never drop or chunk no matter how long held.
 */
function mkSampleLoop(c: AudioContext, dest: AudioNode, buf: AudioBuffer, gain = 0.4): SampleLoop {
  const bus = c.createGain();
  bus.gain.value = 0;
  bus.connect(dest);

  const dur = Math.max(0.05, buf.duration);
  // Crossfade window: short clips need a larger relative overlap; long loops a fixed ~80 ms
  const xfade = clamp(Math.min(0.12, dur * 0.08), 0.04, 0.12);
  const step = Math.max(0.05, dur - xfade); // when to start the next copy

  let on = false;
  let nextAt = 0;
  let timer: number | null = null;
  const live: AudioBufferSourceNode[] = [];

  const startOne = (at: number) => {
    const src = c.createBufferSource();
    src.buffer = buf;
    const env = c.createGain();
    // Fade in / out within the overlap so seams are inaudible
    const t0 = Math.max(at, c.currentTime);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(1, t0 + xfade);
    // Hold, then fade out just before natural end so the next copy is already up
    const fadeOutAt = t0 + Math.max(xfade, dur - xfade);
    env.gain.setValueAtTime(1, fadeOutAt);
    env.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    src.connect(env);
    env.connect(bus);
    try {
      src.start(t0);
      src.stop(t0 + dur + 0.02);
    } catch { /* context closed */ }
    live.push(src);
    src.onended = () => {
      const i = live.indexOf(src);
      if (i >= 0) live.splice(i, 1);
      try { src.disconnect(); env.disconnect(); } catch { /* */ }
    };
  };

  const schedule = () => {
    if (!on) return;
    const now = c.currentTime;
    // Keep at least ~1.5 buffers ahead so a busy main thread cannot starve audio
    while (nextAt < now + step * 1.6) {
      if (nextAt < now - 0.05) nextAt = now;
      startOne(nextAt);
      nextAt += step;
    }
    timer = window.setTimeout(schedule, Math.max(30, step * 400));
  };

  const stopAll = () => {
    if (timer != null) { window.clearTimeout(timer); timer = null; }
    const t = c.currentTime;
    for (const s of live.splice(0)) {
      try { s.stop(t + 0.05); } catch { /* */ }
    }
    nextAt = 0;
  };

  return {
    set(want: boolean) {
      const t = c.currentTime;
      if (want && !on) {
        on = true;
        nextAt = t;
        bus.gain.cancelScheduledValues(t);
        bus.gain.setTargetAtTime(gain, t, 0.015);
        schedule();
      } else if (!want && on) {
        on = false;
        bus.gain.cancelScheduledValues(t);
        bus.gain.setTargetAtTime(0, t, 0.05);
        // Let the fade finish, then tear down sources
        window.setTimeout(stopAll, 120);
      }
    },
    dispose() {
      on = false;
      stopAll();
      try { bus.disconnect(); } catch { /* */ }
    },
  };
}

function ensureSampleLoops(c: AudioContext) {
  if (!master) return;
  // Gains kept moderate so overlapping crossfades never clip the master bus
  if (sampleBuf.fireBell && !sampleLoops.fireBell) {
    sampleLoops.fireBell = mkSampleLoop(c, master, sampleBuf.fireBell, 0.42);
  }
  if (sampleBuf.stickshaker && !sampleLoops.stickshaker) {
    sampleLoops.stickshaker = mkSampleLoop(c, master, sampleBuf.stickshaker, 0.38);
  }
  if (sampleBuf.apDisconnect && !sampleLoops.apDisconnect) {
    sampleLoops.apDisconnect = mkSampleLoop(c, master, sampleBuf.apDisconnect, 0.4);
  }
  if (sampleBuf.glideslope && !sampleLoops.glideslope) {
    sampleLoops.glideslope = mkSampleLoop(c, master, sampleBuf.glideslope, 0.4);
  }
  if (sampleBuf.gpwsVocab && !sampleLoops.gpwsVocab) {
    sampleLoops.gpwsVocab = mkSampleLoop(c, master, sampleBuf.gpwsVocab, 0.42);
  }
  if (sampleBuf.configCabinHorn && !sampleLoops.configCabinHorn) {
    sampleLoops.configCabinHorn = mkSampleLoop(c, master, sampleBuf.configCabinHorn, 0.4);
  }
}

/* Speed of a changing value, robust to uneven sampling. The sim state reaches the audio code through
   React renders, which on a busy 3D page arrive irregularly: some 100 ms audio ticks see no new value even
   though the surface is still moving. Comparing consecutive ticks made every motor / hiss gate on and off
   (and re-fired the "stopped moving" thumps). Here the last measured speed is held for a short time. */
const rates = new Map<string, { v: number; t: number; r: number }>();
function rate(key: string, v: number, now: number): number {
  const s = rates.get(key);
  if (!s) { rates.set(key, { v, t: now, r: 0 }); return 0; }
  if (v !== s.v) {
    const gap = now - s.t;
    const dt = gap > 0.5 ? 0.1 : clamp(gap, 0.03, 0.5);
    s.r = Math.abs(v - s.v) / dt;
    s.v = v; s.t = now;
  } else if (now - s.t > 0.4) {
    s.r = 0;
  }
  return s.r;
}

/* A sound group's output bus. Looping oscillators / noise keep costing CPU even at zero gain, and ~60 of
   them running at once makes phones drop audio buffers. A bus is only connected to the master while its
   group is audible (and for a moment after, so the fade-out finishes). */
type Bus = { node: GainNode; set: (want: boolean) => void };
function mkBus(c: AudioContext): Bus {
  const node = c.createGain();
  let on = false;
  let off: number | undefined;
  return {
    node,
    set(want: boolean) {
      if (want) {
        if (off !== undefined) { window.clearTimeout(off); off = undefined; }
        if (!on) { node.connect(master!); on = true; }
      } else if (on && off === undefined) {
        off = window.setTimeout(() => { node.disconnect(); on = false; off = undefined; }, 1500);
      }
    },
  };
}

function noiseSource(c: AudioContext): AudioBufferSourceNode {
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  src.start(0, Math.random() * (noiseBuf?.duration ?? 1)); // random phase so layers don't share one noise pattern
  return src;
}

function build() {
  const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
  let made: AudioContext;
  try { made = new AC({ latencyHint: "playback" }); } catch { made = new AC(); } // "playback" = largest audio buffer = fewest dropouts when the phone is busy drawing panels (costs ~50-100 ms before a click is heard; use "balanced" for snappier clicks)
  const c = made;
  ctx = c;
  master = c.createGain();
  master.gain.value = volume;
  const comp = c.createDynamicsCompressor();
  // gentle bus compressor: the default (ratio 12, 3 ms attack) ducked the engine drone on every click / thump
  comp.threshold.value = -12; comp.knee.value = 18; comp.ratio.value = 3;
  comp.attack.value = 0.01; comp.release.value = 0.4;
  master.connect(comp);
  comp.connect(c.destination);

  noiseBuf = c.createBuffer(1, c.sampleRate * 4, c.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  // ── APU: quiet tail-mounted turbine — soft whine + low gas rumble + starter motor buzz ──
  // Kept well below the main engines: the APU sits in the tail, far from the flight deck.
  {
    const apuBus = mkBus(c);
    const out = apuBus.node;
    const whine = c.createOscillator(); whine.type = "sawtooth";
    const whine2 = c.createOscillator(); whine2.type = "triangle";
    const wLp = c.createBiquadFilter(); wLp.type = "lowpass"; wLp.frequency.value = 1700;
    const wGain = c.createGain(); wGain.gain.value = 0;
    whine.connect(wLp); whine2.connect(wLp); wLp.connect(wGain); wGain.connect(out);
    whine.start(); whine2.start();

    const nz = noiseSource(c);
    const nBp = c.createBiquadFilter(); nBp.type = "bandpass"; nBp.Q.value = 0.6;
    const nLp = c.createBiquadFilter(); nLp.type = "lowpass"; nLp.frequency.value = 1500;
    const nGain = c.createGain(); nGain.gain.value = 0;
    nz.connect(nBp); nBp.connect(nLp); nLp.connect(nGain); nGain.connect(out);

    const st = c.createOscillator(); st.type = "sawtooth";
    const stLp = c.createBiquadFilter(); stLp.type = "lowpass"; stLp.frequency.value = 420;
    const stGain = c.createGain(); stGain.gain.value = 0;
    st.connect(stLp); stLp.connect(stGain); stGain.connect(out);
    st.start();

    apuVoice = {
      update(rpm, starter) {
        const t = c.currentTime;
        const r = clamp(rpm / 100, 0, 1);
        const on = r > 0.02;
        apuBus.set(on || starter);
        const f = 220 + r * 1000;
        whine.frequency.setTargetAtTime(f, t, 0.08);
        whine2.frequency.setTargetAtTime(f * 1.5, t, 0.08);
        wGain.gain.setTargetAtTime(on ? 0.004 + 0.014 * r : 0, t, 0.15);
        nBp.frequency.setTargetAtTime(250 + r * 700, t, 0.1);
        nGain.gain.setTargetAtTime(on ? 0.004 + 0.03 * Math.pow(r, 1.2) : 0, t, 0.2);
        st.frequency.setTargetAtTime(55 + r * 90, t, 0.1);
        stGain.gain.setTargetAtTime(starter ? 0.035 * (1 - r * 0.6) : 0, t, 0.1);
      },
    };
  }

  // ── Engine space: a big-hall reverb with long decorrelated L/R tails plus a soft stereo echo, so the engines
  // sound like they sit in a large open space around the listener rather than inside the speaker.
  const engFx = (() => {
    const sr = c.sampleRate;
    const len = Math.floor(sr * 1.3); // short tail: long convolutions are the most expensive Web Audio node
    const ir = c.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const tt = i / sr;
        const dark = 0.55 - 0.47 * Math.min(1, tt / 1.0); // tail gets darker as it decays (air absorption)
        lp += dark * ((Math.random() * 2 - 1) - lp);
        d[i] = lp * Math.exp(-tt / 0.4) * Math.min(1, tt / 0.02);
      }
      // a few discrete early reflections, different for each ear
      for (const [ms, g] of ch === 0 ? [[23, 0.5], [41, 0.35], [67, 0.3], [97, 0.22]] : [[29, 0.5], [53, 0.33], [79, 0.28], [113, 0.2]]) {
        d[Math.floor(sr * ms / 1000)] += g * (ch === 0 ? 1 : -1);
      }
    }
    const send = c.createGain(); send.gain.value = 1;
    const pre = c.createDelay(0.2); pre.delayTime.value = 0.03;
    const conv = c.createConvolver(); conv.buffer = ir;
    const wet = c.createGain(); wet.gain.value = 0.2;
    send.connect(pre); pre.connect(conv); conv.connect(wet); wet.connect(master!);
    // stereo ping-pong-ish echo (190 ms / 270 ms), low feedback, darker on every repeat
    const eL = c.createDelay(1), eR = c.createDelay(1);
    eL.delayTime.value = 0.19; eR.delayTime.value = 0.27;
    const eFb = c.createGain(); eFb.gain.value = 0.32;
    const eLp = c.createBiquadFilter(); eLp.type = "lowpass"; eLp.frequency.value = 1500;
    const eOut = c.createGain(); eOut.gain.value = 0.08;
    const merge = c.createChannelMerger(2);
    send.connect(eLp); eLp.connect(eL); eL.connect(eR); eR.connect(eFb); eFb.connect(eL);
    eL.connect(merge, 0, 0); eR.connect(merge, 0, 1); merge.connect(eOut); eOut.connect(master!);
    return { send };
  })();

  // ── Engines (JT8D-ish) ──
  // Layers: fan tone (N1, with harmonic) · compressor whine (N2) · jet roar (filtered noise
  // that opens up with thrust, with slow turbulence) · low body rumble · starter air rush.
  // The two engines are detuned slightly so they beat against each other like real twins.
  engVoices = [-0.4, 0.4].map((pan, idx) => {
    const detune = idx === 0 ? 0.992 : 1.008;
    const bus = mkBus(c);
    const p = c.createStereoPanner(); p.pan.value = pan * 1.8; p.connect(bus.node); // wider than before: one engine well out to each side
    const sendG = c.createGain(); sendG.gain.value = 0.9; p.connect(sendG); sendG.connect(engFx.send);

    // fan tone (N1)
    const fanA = c.createOscillator(); fanA.type = "triangle";
    const fanB = c.createOscillator(); fanB.type = "sine";
    const fanLp = c.createBiquadFilter(); fanLp.type = "lowpass"; fanLp.frequency.value = 1800;
    const fanGain = c.createGain(); fanGain.gain.value = 0;
    const fanBGain = c.createGain(); fanBGain.gain.value = 0.45;
    fanA.connect(fanLp); fanB.connect(fanBGain); fanBGain.connect(fanLp);
    fanLp.connect(fanGain); fanGain.connect(p);
    fanA.start(); fanB.start();

    // compressor whine (N2) — soft sines, not a saw
    const cmpA = c.createOscillator(); cmpA.type = "sine";
    const cmpB = c.createOscillator(); cmpB.type = "sine";
    const cmpLp = c.createBiquadFilter(); cmpLp.type = "lowpass"; cmpLp.frequency.value = 4800;
    const cmpGain = c.createGain(); cmpGain.gain.value = 0;
    const cmpBGain = c.createGain(); cmpBGain.gain.value = 0.5;
    cmpA.connect(cmpLp); cmpB.connect(cmpBGain); cmpBGain.connect(cmpLp);
    cmpLp.connect(cmpGain); cmpGain.connect(p);
    cmpA.start(); cmpB.start();

    // jet roar: broadband noise, opens up with thrust, slow turbulence from an LFO
    const roar = noiseSource(c);
    const rLp = c.createBiquadFilter(); rLp.type = "lowpass"; rLp.Q.value = 0.7;
    const rGain = c.createGain(); rGain.gain.value = 0;
    roar.connect(rLp); rLp.connect(rGain); rGain.connect(p);
    const lfo = c.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 0.31 + idx * 0.13;
    const lfoDepth = c.createGain(); lfoDepth.gain.value = 0;
    lfo.connect(lfoDepth); lfoDepth.connect(rGain.gain); lfo.start();

    // low body rumble (band of noise rather than a pure sub-bass tone: audible on phone speakers)
    const body = noiseSource(c);
    const bBp = c.createBiquadFilter(); bBp.type = "bandpass"; bBp.Q.value = 0.9;
    const bGain = c.createGain(); bGain.gain.value = 0;
    body.connect(bBp); bBp.connect(bGain); bGain.connect(p);

    // starter air rush
    const rush = noiseSource(c);
    const rHp = c.createBiquadFilter(); rHp.type = "highpass"; rHp.frequency.value = 1400;
    const rushGain = c.createGain(); rushGain.gain.value = 0;
    rush.connect(rHp); rHp.connect(rushGain); rushGain.connect(p);

    // Whale moan + sub-bass removed — they were producing a continuous low-frequency
    // piston-like drone (modeled after high-bypass engines) that did not match the JT8D.

    // Punch: recorded layer goes through a low shelf (chest / boom) and a high shelf (crisp whine, snap)
    const smpIn = c.createGain();
    const lowShelf = c.createBiquadFilter(); lowShelf.type = "lowshelf"; lowShelf.frequency.value = 180; lowShelf.gain.value = 9; // restored stronger bass
    const hiShelf = c.createBiquadFilter(); hiShelf.type = "highshelf"; hiShelf.frequency.value = 3000; hiShelf.gain.value = 3;
    smpIn.connect(lowShelf); lowShelf.connect(hiShelf); hiShelf.connect(p);

    // Recorded engine layer (idle + high-power loops). The sample buffers finish loading after build(), so the
    // layer is attached on the first update that finds them. Until then / without the files the synth above plays alone.
    let smp: { idle: AudioBufferSourceNode; run: AudioBufferSourceNode; idleG: GainNode; runG: GainNode } | null = null;
    const attachSamples = () => {
      if (smp || !sampleBuf.engineIdle || !sampleBuf.engineRun) return;
      const mk = (buf: AudioBuffer) => {
        const src = c.createBufferSource();
        src.buffer = buf; src.loop = true;
        const g = c.createGain(); g.gain.value = 0;
        src.connect(g); g.connect(smpIn);
        src.start(0, Math.random() * buf.duration); // each engine starts at its own point in the loop
        return { src, g };
      };
      const i = mk(sampleBuf.engineIdle);
      const r = mk(sampleBuf.engineRun);
      smp = { idle: i.src, run: r.src, idleG: i.g, runG: r.g };
    };

    let spool: AcousticSpool = newAcousticSpool();
    let spoolAt = 0;

    return {
      update(simN1: number, simN2: number, valve: boolean, snap = false) {
        const t = c.currentTime;
        // cancel pending automation first: otherwise events pile up on every param each tick and the audio thread slows down over time
        const ramp = (prm: AudioParam, v: number, tc: number) => { prm.cancelScheduledValues(t); prm.setTargetAtTime(v, t, tc); };
        bus.set(simN2 > 2 || valve);
        // The sound follows an acoustic spool model (rotor inertia, rounded S-curve, roar lagging the rotors), not the raw
        // sim values, so a lever slam or a preset jump is heard as a smooth spool-up / spool-down rather than a step.
        const nowMs = performance.now();
        const dtS = spoolAt ? (nowMs - spoolAt) / 1000 : 0;
        spoolAt = nowMs;
        spool = stepAcousticSpool(spool, simN1, simN2, dtS, snap || dtS > 0.6);
        const n1 = spool.n1, n2 = spool.n2;
        const jet = spool.jet; // exhaust-noise thrust, lags the rotors
        const r2 = clamp(n2 / 100, 0, 1);
        // effective spool: N1 when running, an N2-based guess while only motoring on the starter
        const eff = clamp(Math.max(n1, n2 * 0.5) / 100, 0, 1);
        const spinning = n2 > 6;

        attachSamples();
        const sf = smp ? 0.3 : 1; // the recording carries the roar / body / fan: keep only a little synth (whine, starter rush)
        const startAmt = clamp(1 - (eff - 0.16) / 0.16, 0, 1); // 1 while starting / winding down below idle, 0 at idle and above

        const fanF = (70 + eff * 430) * detune;
        ramp(fanA.frequency, fanF, 0.12);
        ramp(fanB.frequency, fanF * 2.01, 0.12);
        ramp(fanGain.gain, spinning ? sf * (0.008 + 0.05 * Math.pow(eff, 1.2)) : 0, 0.2);

        const cmpF = (r2 < 0.57 ? 700 + (r2 / 0.57) * 1300 : 2000 + ((r2 - 0.57) / 0.43) * 1700) * detune; // 2.0 kHz idle -> 3.7 kHz full, as measured on the 737-200 recording
        ramp(cmpA.frequency, cmpF, 0.1);
        ramp(cmpB.frequency, cmpF * 1.51, 0.1);
        ramp(cmpGain.gain, n2 > 10 ? (smp ? 0.9 : 1) * (0.004 + 0.03 * r2 * r2) : 0, 0.2);

        ramp(rLp.frequency, 300 + eff * 2200, 0.15);
        const roarBase = n2 > 8 ? 0.02 + 0.045 * Math.min(1, n2 / 57) + 0.18 * Math.pow(Math.max(0.2, 0.32 + 0.68 * jet), 1.3) : 0;
        ramp(rGain.gain, roarBase * sf, 0.25);
        ramp(lfoDepth.gain, roarBase * sf * 0.22, 0.25);

        ramp(bBp.frequency, 180 + eff * 200, 0.2);
        ramp(bGain.gain, n2 > 8 ? (sf * 0.6 + (smp ? 0.4 * startAmt : 0)) * (0.03 + 0.06 * eff) : 0, 0.3); // mild low body rumble at idle and above (no whale)

        ramp(rushGain.gain, valve && n2 < 48 ? 0.02 + 0.05 * (1 - n2 / 50) : 0, 0.15);

        // whale moan and sub-bass removed

        if (smp) {
          // lit: 0 while only motoring on the starter, 1 once the engine has spooled to idle (eff ~ 0.32 = idle N1)
          // th : thrust above idle, 0 at idle -> 1 at max N1
          const lit = clamp((eff - 0.16) / 0.16, 0, 1);
          const th = clamp((eff - 0.32) / 0.68, 0, 1); // rotor speed -> pitch
          // loudness / timbre follow the exhaust (lags the rotors): the whine climbs first, the roar builds behind it
          const thG = clamp(jet, 0, 1);
          // recording: idle is ~15 dB below high power, so overall level follows that spread (jet noise rises steeply near full thrust)
          const level = (0.17 + 0.83 * Math.pow(thG, 1.45)) * Math.pow(lit, 1.4) * 0.55;
          // equal-power crossfade idle -> high-power loop between 10 % and 80 % of the thrust range
          const x = clamp((thG - 0.1) / 0.7, 0, 1);
          const wRun = Math.sin(x * x * (3 - 2 * x) * Math.PI / 2);
          const wIdle = Math.cos(x * x * (3 - 2 * x) * Math.PI / 2);
          ramp(smp.idleG.gain, level * wIdle, 0.12);
          ramp(smp.runG.gain, level * wRun, 0.12);
          // pitch climbs with the spool: the whole sound rises from a low growl as the engine winds up to idle, then with thrust
          // Pitch tracks engine speed: a JT8D's compressor whine climbs ~1.8x from idle to full power (about 2.0 -> 3.7 kHz in the
          // recording). The idle loop is recorded at idle pitch, the power loop at ~98 % N1, so each is shifted to the same
          // moving pitch, which keeps the whine rising smoothly through the crossfade instead of swapping between two tones.
          const rise = 1 + 1.15 * th; // wider pitch sweep: idle -> takeoff climbs by more than an octave
          ramp(smp.idle.playbackRate, (0.42 + 0.58 * lit) * (0.8 + 0.2 * lit) * Math.min(rise, 1.85) * detune, 0.14); // (0.88 + 0.12 * lit): a little lower in pitch while starting
          ramp(lowShelf.gain, 9 + 5 * startAmt, 0.2); // deep chest bass, even more while starting
          ramp(smp.run.playbackRate, (rise / 1.9) * detune, 0.14); // = 1.0 at max N1, where the recording was made
        }
      },
    };
  });
  fx = buildFx(c);
}

/** Short mechanical switch click (down-click + lighter release). Silent unless the sound button is on. */
export function playSwitchClick() {
  const c = ctx;
  if (!enabled || !c || !master || !noiseBuf || c.state !== "running") return;
  const t = c.currentTime;
  if (t - lastSwitchClick < 0.035) return; // many controls changed in one patch -> a single click
  lastSwitchClick = t;
  const pitch = 0.92 + Math.random() * 0.16;
  const tick = (at: number, amp: number, freq: number) => {
    const src = c.createBufferSource(); src.buffer = noiseBuf;
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = freq * pitch; bp.Q.value = 3;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(amp, at + 0.0015);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.014);
    src.connect(bp); bp.connect(g); g.connect(master!);
    src.start(at, Math.random() * 1.5, 0.03);
    // body thump under the tick
    const o = c.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(190 * pitch, at); o.frequency.exponentialRampToValueAtTime(90, at + 0.03);
    const og = c.createGain();
    og.gain.setValueAtTime(0.0001, at);
    og.gain.exponentialRampToValueAtTime(amp * 0.5, at + 0.002);
    og.gain.exponentialRampToValueAtTime(0.0001, at + 0.035);
    o.connect(og); og.connect(master!);
    o.start(at); o.stop(at + 0.045);
  };
  tick(t, 0.4, 2800);        // down-click
  tick(t + 0.022, 0.2, 3600); // release
}

function click(c: AudioContext, pan: number) {
  const t = c.currentTime;
  const src = c.createBufferSource(); src.buffer = noiseBuf;
  const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 3200; bp.Q.value = 2;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.25, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
  const p = c.createStereoPanner(); p.pan.value = pan;
  src.connect(bp); bp.connect(g); g.connect(p); p.connect(master!);
  src.start(t, Math.random(), 0.03);
}

function lightOff(c: AudioContext, pan: number) {
  const t = c.currentTime;
  const src = c.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(180, t); lp.frequency.exponentialRampToValueAtTime(700, t + 0.6);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.35, t + 0.12);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
  const p = c.createStereoPanner(); p.pan.value = pan;
  src.connect(lp); lp.connect(g); g.connect(p); p.connect(master!);
  src.start(t); src.stop(t + 1.2);
}

/* ── Tunables for the aural warnings (change these to taste) ── */
const BELL_PERIOD = 0.15;   // s between fire-bell strikes (~6.7 strikes/s: a fast electric-bell ring, not a slow chime)
const BELL_BASE = [1170, 1235]; // Hz: the two gongs the hammer alternates between
const WAIL_HZ = 1.5;        // A/P disconnect siren sweeps per second
const WAIL_CENTER = 1000;   // Hz: centre of the siren sweep
const WAIL_CENTS = 520;     // sweep depth either side of centre (cents; 520 ≈ 740 ↔ 1350 Hz)
const SHAKER_REVS = [17, 18]; // stick-shaker motor revolutions per second (captain, first officer)
const CLACK_HZ = 8;         // Mach / airspeed warning clacks per second

/** 737-200 fire warning bell: an electric gong. One call = one hammer strike at audio time `at`.
 *  Hard clapper transient + inharmonic metal partials (plate/bell ratios) that decay fast, so strikes
 *  at ~6.7/s run together into a continuous harsh clangour rather than separate "dings". */
function bell(c: AudioContext, at: number, k: number) {
  const base = BELL_BASE[k % 2] * (1 + (Math.random() - 0.5) * 0.004);
  const amp = 0.85 + Math.random() * 0.3; // no two strikes identical
  const pan = k % 2 ? 0.08 : -0.08;
  // [frequency ratio, amplitude, decay seconds]
  const modes: [number, number, number][] = [
    [1, 0.24, 0.36],
    [1.004, 0.1, 0.3], // near-unison partner: slow shimmer / beating in the ring
    [2.32, 0.15, 0.24],
    [4.25, 0.1, 0.15],
    [6.63, 0.06, 0.09],
    [9.38, 0.035, 0.06],
  ];
  modes.forEach(([r, a, d]) => {
    const f = base * r;
    if (f > 12000) return;
    const o = c.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(f, at);
    o.frequency.exponentialRampToValueAtTime(f * 0.992, at + d); // tiny downward drift as the strike rings out
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(a * amp, at + 0.0015);
    g.gain.exponentialRampToValueAtTime(0.0001, at + d);
    const p = c.createStereoPanner(); p.pan.value = pan;
    o.connect(g); g.connect(p); p.connect(master!);
    o.start(at); o.stop(at + d + 0.03);
  });
  // clapper hitting the gong: bright click + a dull knock of the hammer armature
  noiseBurst(c, pan, at, 0.16 * amp, 0.0006, 0.011, "bandpass", 4200, 1.1);
  toneBurst(c, pan, at, 0.07 * amp, 230, 120, 0.001, 0.03);
}

/* ═════════════════ Extra sound effects ═════════════════
   Landing gear (uplock release, door open, hydraulic motor, slipstream, downlock / uplock thunks,
   wheel spin-down, free-fall manual extension, gear horn), flaps & slats, spoilers / speed brake,
   APU door, hydraulic pumps, touchdown (squeal, thump, spin-up, nose slap), runway rumble & joints,
   brakes (hiss, antiskid chatter, tyre squeal), reversers, contactors, fire handles / bottles,
   parking brake, cabin chimes, pack / avionics / fuel-pump ambience. All synthesized. */

type Fx = {
  gear: (hyd: number, free: number, wind: number) => void;
  flap: (level: number) => void;
  door: (level: number) => void;
  spoiler: (level: number) => void;
  hyd: (press: number, pumps: number, elec: boolean) => void;
  roll: (r: number, grass: boolean) => void;
  skid: (squeal: number, pitchHz: number, chatter: number) => void;
  brake: (p: number) => void;
  rev: (level: number) => void;
  amb: (ac: boolean, dc: boolean, packs: number, fuel: number) => void;
  horn: (on: boolean) => void;
  wailer: (on: boolean) => void;
  shaker: (on: boolean) => void;
  clacker: (on: boolean) => void;
};

type Prev = {
  t: number; gear: [number, number, number]; lever?: string; flapPos: number; flapLever: number; lePos: number;
  spoiler: number; speedBrake?: string; apuDoor: number; wow: boolean; rev: [boolean, boolean];
  relays: boolean[]; fire: boolean[]; bottles: boolean[]; signs?: [string, string]; parking: boolean;
  brake: number; valve: [boolean, boolean];
};

let fx: Fx | null = null;
let prev: Prev | null = null;
let lastJoint = 0;
let flapMoving = false;
let leMoving = false;
let doorMoving = false;

function env(g: GainNode, at: number, amp: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(amp, 0.0002), at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
}

function noiseBurst(c: AudioContext, pan: number, at: number, amp: number, attack: number, decay: number, type: BiquadFilterType, freq: number, q: number) {
  const src = c.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain(); env(g, at, amp, attack, decay);
  const p = c.createStereoPanner(); p.pan.value = pan;
  src.connect(f); f.connect(g); g.connect(p); p.connect(master!);
  src.start(at, Math.random() * 1.5, attack + decay + 0.05);
}

function toneBurst(c: AudioContext, pan: number, at: number, amp: number, f0: number, f1: number, attack: number, decay: number, type: OscillatorType = "sine") {
  const o = c.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, at);
  o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), at + attack + decay);
  const g = c.createGain(); env(g, at, amp, attack, decay);
  const p = c.createStereoPanner(); p.pan.value = pan;
  o.connect(g); g.connect(p); p.connect(master!);
  o.start(at); o.stop(at + attack + decay + 0.05);
}

/** Swept band of noise: air rush, hydraulic hiss, wheel spin-up. */
function whoosh(c: AudioContext, pan: number, amp: number, dur: number, f0: number, f1: number, d = 0, type: BiquadFilterType = "bandpass", q = 0.8) {
  const t = c.currentTime + d;
  const src = c.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = c.createGain(); env(g, t, amp, dur * 0.3, dur * 0.7);
  const p = c.createStereoPanner(); p.pan.value = pan;
  src.connect(f); f.connect(g); g.connect(p); p.connect(master!);
  src.start(t, Math.random() * 1.5, dur + 0.1);
}

function thump(c: AudioContext, pan: number, amp: number, d = 0) {
  const t = c.currentTime + d;
  toneBurst(c, pan, t, amp, 120, 38, 0.004, 0.24);
  noiseBurst(c, pan, t, amp * 0.7, 0.003, 0.09, "lowpass", 320, 0.7);
}

function clunk(c: AudioContext, pan: number, amp: number, d = 0) {
  const t = c.currentTime + d;
  toneBurst(c, pan, t, amp * 0.8, 170, 70, 0.002, 0.09);
  noiseBurst(c, pan, t, amp * 0.6, 0.001, 0.035, "bandpass", 1500, 2);
  toneBurst(c, pan, t, amp * 0.17, 430, 420, 0.001, 0.08);
  toneBurst(c, pan, t, amp * 0.1, 1180, 1160, 0.001, 0.06);
}

/** Gear locking down / up: heavy actuator thunk with a metallic latch ring. */
function lockThunk(c: AudioContext, pan: number, amp: number, d = 0) {
  thump(c, pan, amp, d);
  clunk(c, pan, amp * 0.7, d + 0.012);
}

function tyreChirp(c: AudioContext, pan: number, amp: number, d = 0) {
  const t = c.currentTime + d;
  noiseBurst(c, pan, t, amp, 0.004, 0.22, "bandpass", 1400, 6);
  toneBurst(c, pan, t, amp * 0.25, 960, 800, 0.004, 0.18, "sawtooth");
}

/** Wheels coasting down in the well after retraction (brake / friction spin-down). */
function wheelSpinDown(c: AudioContext, pan: number, d = 0) {
  const t = c.currentTime + d;
  toneBurst(c, pan, t, 0.03, 300, 55, 0.05, 1.6, "triangle");
  whoosh(c, pan, 0.05, 1.6, 700, 120, d);
}

function chime(c: AudioContext, notes: number[], gap = 0.2) {
  notes.forEach((f, i) => {
    const t = c.currentTime + i * gap;
    toneBurst(c, 0, t, 0.17, f, f, 0.005, 0.75);
    toneBurst(c, 0, t, 0.05, f * 2.01, f * 2.01, 0.005, 0.45);
  });
}

/** One-second seamless loop whose content is synthesized event by event (indices wrap, so tails of the
 *  last event run into the start of the first). Peak-normalized. Looping a buffer gives a crisp repeating
 *  mechanical pattern, which oscillators + LFOs can't: those sound like a synth, not a motor or relay. */
function loopBuffer(c: AudioContext, fill: (d: Float32Array, sr: number) => void): AudioBuffer {
  const sr = c.sampleRate;
  const b = c.createBuffer(1, sr, sr);
  const d = b.getChannelData(0);
  fill(d, sr);
  let pk = 0;
  for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
  if (pk > 0) for (let i = 0; i < d.length; i++) d[i] /= pk;
  return b;
}

/** Stick shaker: an eccentric weight on a motor shaft. Each revolution = a heavy thump as the weight swings
 *  round, a smaller rebound, and loose column linkage rattling. `revs` revolutions per second. */
function shakerLoop(c: AudioContext, revs: number): AudioBuffer {
  return loopBuffer(c, (d, sr) => {
    const add = (at: number, k: number, v: number) => { d[(at + k) % d.length] += v; };
    const thump = (at: number, amp: number, f: number, decay: number) => {
      const len = Math.floor(decay * 4 * sr);
      for (let k = 0; k < len; k++) {
        const t = k / sr;
        add(at, k, amp * Math.sin(2 * Math.PI * (f + f * 0.45 * Math.exp(-t / 0.008)) * t) * Math.exp(-t / decay));
      }
    };
    const rattle = (at: number, amp: number, decay: number) => {
      const len = Math.floor(decay * 5 * sr);
      for (let k = 0; k < len; k++) add(at, k, amp * (Math.random() * 2 - 1) * Math.exp(-(k / sr) / decay));
    };
    const per = sr / revs;
    for (let n = 0; n < revs; n++) {
      const at = Math.floor(n * per);
      const amp = 0.8 + Math.random() * 0.4;
      thump(at, amp, 92, 0.02);
      rattle(at, amp * 0.55, 0.0035);
      const re = at + Math.floor(per * (0.4 + Math.random() * 0.1)); // weight rebounding off its stop
      thump(re, amp * 0.42, 150, 0.012);
      rattle(re, amp * 0.28, 0.003);
      for (let j = 0; j < 2; j++) rattle(at + Math.floor(per * (0.12 + Math.random() * 0.75)), 0.1 + Math.random() * 0.12, 0.002); // loose linkage
    }
  });
}

/** Mach / airspeed warning clacker: a relay-driven hammer, hard "clack" with a small armature bounce. */
function clackLoop(c: AudioContext, hz: number): AudioBuffer {
  return loopBuffer(c, (d, sr) => {
    const per = sr / hz;
    for (let n = 0; n < hz; n++) {
      const at = Math.floor(n * per);
      const amp = n % 2 ? 0.88 : 1;
      const hit = (off: number, a: number) => {
        const len = Math.floor(0.03 * sr);
        for (let k = 0; k < len; k++) {
          const t = k / sr;
          const v = (Math.random() * 2 - 1) * Math.exp(-t / 0.0045) + 0.7 * Math.sin(2 * Math.PI * 210 * t) * Math.exp(-t / 0.011);
          d[(at + Math.floor(off * sr) + k) % d.length] += a * v;
        }
      };
      hit(0, amp);
      hit(0.0065, amp * 0.45); // bounce
    }
  });
}

function buildFx(c: AudioContext): Fx {
  const m = master!;
  let dst: AudioNode = m; // where the voices created next are connected (one bus per sound group)
  const noiseVoice = (type: BiquadFilterType, freq: number, q: number, pan = 0) => {
    const s = noiseSource(c);
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = 0;
    const p = c.createStereoPanner(); p.pan.value = pan;
    s.connect(f); f.connect(g); g.connect(p); p.connect(dst);
    return { f, g };
  };
  const toneVoice = (type: OscillatorType, freq: number, lpHz: number, pan = 0) => {
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = lpHz;
    const g = c.createGain(); g.gain.value = 0;
    const p = c.createStereoPanner(); p.pan.value = pan;
    o.connect(lp); lp.connect(g); g.connect(p); p.connect(dst); o.start();
    return { o, g };
  };
  const T = () => c.currentTime;
  const bGear = mkBus(c), bFlap = mkBus(c), bDoor = mkBus(c), bSpoil = mkBus(c), bHyd = mkBus(c), bRoll = mkBus(c);
  const bSkid = mkBus(c), bBrake = mkBus(c), bRev = mkBus(c), bAmb = mkBus(c), bHorn = mkBus(c);
  const bWail = mkBus(c), bShake = mkBus(c), bClack = mkBus(c);

  // ── landing gear: hydraulic motor + actuator rumble + slipstream / free-fall wind ──
  dst = bGear.node;
  const gMotor = toneVoice("sawtooth", 150, 700);
  const gMotor2 = toneVoice("triangle", 300, 900);
  const gRumble = noiseVoice("bandpass", 120, 1.0);
  const gWind = noiseVoice("bandpass", 650, 0.5);
  const gWindHi = noiseVoice("highpass", 1800, 0.5);

  // ── flaps / slats: gearbox motor + track whir ──
  dst = bFlap.node;
  const fMotor = toneVoice("sawtooth", 92, 600);
  const fMotor2 = toneVoice("triangle", 185, 900);
  const fWhir = noiseVoice("bandpass", 760, 1.3);

  // ── APU door motor ──
  dst = bDoor.node;
  const dMotor = toneVoice("sawtooth", 120, 500);
  const dWhir = noiseVoice("bandpass", 520, 1.2);

  // ── spoilers: hydraulic rush ──
  dst = bSpoil.node;
  const sHiss = noiseVoice("bandpass", 1100, 0.7);
  const sRumble = noiseVoice("lowpass", 240, 0.7);

  // ── hydraulic pumps ──
  dst = bHyd.node;
  const hEng = toneVoice("sawtooth", 260, 800, -0.3);
  const hElec = toneVoice("sine", 330, 1200, 0.3);
  const hElec2 = toneVoice("sine", 333, 1200, 0.3);

  // ── tyres on the runway ──
  dst = bRoll.node;
  const rRumble = noiseVoice("lowpass", 160, 0.8);
  const rHum = noiseVoice("bandpass", 420, 1.4);
  const rBump = c.createOscillator(); rBump.type = "sine"; rBump.frequency.value = 3.2;
  const rBumpD = c.createGain(); rBumpD.gain.value = 0;
  rBump.connect(rBumpD); rBumpD.connect(rRumble.g.gain); rBump.start();

  // ── tyre squeal + antiskid valve chatter ──
  dst = bSkid.node;
  const kSqueal = noiseVoice("bandpass", 1300, 9);
  const kSqLfo = c.createOscillator(); kSqLfo.type = "sine"; kSqLfo.frequency.value = 7;
  const kSqLfoD = c.createGain(); kSqLfoD.gain.value = 0;
  kSqLfo.connect(kSqLfoD); kSqLfoD.connect(kSqueal.f.frequency); kSqLfo.start();
  const kBuzz = toneVoice("sawtooth", 125, 650);
  const kGate = c.createOscillator(); kGate.type = "square"; kGate.frequency.value = 17;
  const kGateD = c.createGain(); kGateD.gain.value = 0;
  kGate.connect(kGateD); kGateD.connect(kBuzz.g.gain); kGate.start();

  // ── brakes ──
  dst = bBrake.node;
  const bHiss = noiseVoice("bandpass", 650, 0.9);
  const bGroan = toneVoice("sawtooth", 70, 260);

  // ── thrust reverser roar ──
  dst = bRev.node;
  const vRoar = noiseVoice("lowpass", 800, 0.7);
  const vLow = noiseVoice("lowpass", 160, 0.8);

  // ── ambience: AC hum, avionics fans, pack airflow, fuel pumps ──
  dst = bAmb.node;
  const aHum = toneVoice("sine", 400, 1200);
  const aHum2 = toneVoice("sine", 800, 1500);
  const aFan = noiseVoice("bandpass", 2300, 0.8);
  const aPack = noiseVoice("bandpass", 3000, 0.5);
  const aFuel = toneVoice("triangle", 118, 500);

  // ── gear warning horn (intermittent) ──
  const hornA = c.createOscillator(); hornA.type = "square"; hornA.frequency.value = 425;
  const hornB = c.createOscillator(); hornB.type = "square"; hornB.frequency.value = 850;
  const hornLp = c.createBiquadFilter(); hornLp.type = "lowpass"; hornLp.frequency.value = 2200;
  const hornBG = c.createGain(); hornBG.gain.value = 0.4;
  const hornPulse = c.createGain(); hornPulse.gain.value = 0.5;
  const hornLfo = c.createOscillator(); hornLfo.type = "square"; hornLfo.frequency.value = 2.2;
  const hornLfoD = c.createGain(); hornLfoD.gain.value = 0.5;
  const hornEn = c.createGain(); hornEn.gain.value = 0;
  hornA.connect(hornLp); hornB.connect(hornBG); hornBG.connect(hornLp);
  hornLp.connect(hornPulse); hornPulse.connect(hornEn); hornEn.connect(bHorn.node);
  hornLfo.connect(hornLfoD); hornLfoD.connect(hornPulse.gain);
  hornA.start(); hornB.start(); hornLfo.start();

  // ── autopilot disconnect wailer: a siren ──
  // Saw + octave-up square, both swept up and down in pitch by a triangle LFO (constant sweep rate in
  // cents, so it rises and falls like a siren rather than wobbling like a vibrato), then band-limited like a
  // small cockpit speaker.
  const wailA = c.createOscillator(); wailA.type = "sawtooth"; wailA.frequency.value = WAIL_CENTER;
  const wailB = c.createOscillator(); wailB.type = "square"; wailB.frequency.value = WAIL_CENTER * 2;
  const wailBG = c.createGain(); wailBG.gain.value = 0.22;
  const wailBp = c.createBiquadFilter(); wailBp.type = "peaking"; wailBp.frequency.value = 1500; wailBp.Q.value = 0.9; wailBp.gain.value = 5;
  const wailLp = c.createBiquadFilter(); wailLp.type = "lowpass"; wailLp.frequency.value = 3400;
  const wailLfo = c.createOscillator(); wailLfo.type = "triangle"; wailLfo.frequency.value = WAIL_HZ;
  const wailLfoD = c.createGain(); wailLfoD.gain.value = WAIL_CENTS;
  const wailEn = c.createGain(); wailEn.gain.value = 0;
  wailA.connect(wailBp); wailB.connect(wailBG); wailBG.connect(wailBp);
  wailBp.connect(wailLp); wailLp.connect(wailEn); wailEn.connect(bWail.node);
  wailLfo.connect(wailLfoD); wailLfoD.connect(wailA.detune); wailLfoD.connect(wailB.detune);
  wailA.start(); wailB.start(); wailLfo.start();

  // ── stall stick-shakers: one eccentric-weight motor on each control column ──
  // Two looped recordings-by-construction at slightly different speeds (17 and 18 rev/s) so they beat
  // against each other like two unsynchronised motors; they spin up when the warning starts and coast down
  // when it stops.
  const shEn = c.createGain(); shEn.gain.value = 0; shEn.connect(bShake.node);
  const shVoices = SHAKER_REVS.map((revs, i) => {
    const src = c.createBufferSource(); src.buffer = shakerLoop(c, revs); src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1700; lp.Q.value = 0.6;
    const g = c.createGain(); g.gain.value = 0.8;
    const p = c.createStereoPanner(); p.pan.value = i === 0 ? -0.3 : 0.3;
    src.connect(lp); lp.connect(g); g.connect(p); p.connect(shEn);
    src.start();
    return src;
  });
  let shOn = false;

  // ── Mach / airspeed warning clacker ──
  const clEn = c.createGain(); clEn.gain.value = 0; clEn.connect(bClack.node);
  {
    const src = c.createBufferSource(); src.buffer = clackLoop(c, CLACK_HZ); src.loop = true;
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1900; bp.Q.value = 0.6;
    src.connect(bp); bp.connect(clEn); src.start();
  }

  return {
    gear(hyd, free, wind) {
      const t = T();
      bGear.set(hyd > 0.01 || free > 0.01 || wind > 0.01);
      gMotor.o.frequency.setTargetAtTime(130 + hyd * 70, t, 0.1);
      gMotor2.o.frequency.setTargetAtTime(262 + hyd * 140, t, 0.1);
      gMotor.g.gain.setTargetAtTime(0.016 * hyd, t, 0.12);
      gMotor2.g.gain.setTargetAtTime(0.008 * hyd, t, 0.12);
      gRumble.g.gain.setTargetAtTime(0.1 * Math.max(hyd * 0.7, free), t, 0.1);
      gWind.f.frequency.setTargetAtTime(500 + 500 * wind, t, 0.15);
      gWind.g.gain.setTargetAtTime(0.06 * wind + 0.05 * free, t, 0.15);
      gWindHi.g.gain.setTargetAtTime(0.012 * wind + 0.03 * free, t, 0.15);
    },
    flap(level) {
      const t = T();
      bFlap.set(level > 0.01);
      fMotor.o.frequency.setTargetAtTime(80 + 40 * level, t, 0.1);
      fMotor2.o.frequency.setTargetAtTime(160 + 80 * level, t, 0.1);
      fMotor.g.gain.setTargetAtTime(0.02 * level, t, 0.1);
      fMotor2.g.gain.setTargetAtTime(0.008 * level, t, 0.1);
      fWhir.g.gain.setTargetAtTime(0.045 * level, t, 0.12);
    },
    door(level) {
      const t = T();
      bDoor.set(level > 0.01);
      dMotor.g.gain.setTargetAtTime(0.012 * level, t, 0.1);
      dWhir.g.gain.setTargetAtTime(0.03 * level, t, 0.1);
    },
    spoiler(level) {
      const t = T();
      bSpoil.set(level > 0.01);
      sHiss.g.gain.setTargetAtTime(0.07 * level, t, 0.08);
      sRumble.g.gain.setTargetAtTime(0.08 * level, t, 0.08);
    },
    hyd(press, pumps, elec) {
      const t = T();
      const on = pumps > 0 && press > 300 ? 1 : 0;
      bHyd.set(on === 1);
      const pr = clamp(press / 3000, 0, 1);
      hEng.o.frequency.setTargetAtTime(230 + pr * 120, t, 0.2);
      hEng.g.gain.setTargetAtTime(on ? 0.004 + 0.008 * pr : 0, t, 0.25);
      hElec.g.gain.setTargetAtTime(on && elec ? 0.003 + 0.004 * pr : 0, t, 0.25);
      hElec2.g.gain.setTargetAtTime(on && elec ? 0.003 + 0.004 * pr : 0, t, 0.25);
    },
    roll(r, grass) {
      const t = T();
      bRoll.set(r > 0.005);
      rRumble.f.frequency.setTargetAtTime((grass ? 90 : 130) + r * (grass ? 300 : 650), t, 0.2);
      // runway joints / bumps modulate the rumble
      rBump.frequency.setTargetAtTime(1 + r * (grass ? 5 : 9), t, 0.2);
      rBumpD.gain.setTargetAtTime((grass ? 0.09 : 0.035) * r, t, 0.2);
      rRumble.g.gain.setTargetAtTime((grass ? 0.16 : 0.1) * Math.pow(r, 0.8) * (grass ? 1.3 : 1), t, 0.2);
      rHum.f.frequency.setTargetAtTime(300 + r * 700, t, 0.2);
      rHum.g.gain.setTargetAtTime(0.045 * r, t, 0.2);
    },
    skid(squeal, pitchHz, chatter) {
      const t = T();
      bSkid.set(squeal > 0.005 || chatter > 0.005);
      kSqueal.f.frequency.setTargetAtTime(pitchHz, t, 0.06);
      kSqLfoD.gain.setTargetAtTime(squeal * 220, t, 0.1);
      kSqueal.g.gain.setTargetAtTime(0.18 * squeal, t, 0.06);
      kGateD.gain.setTargetAtTime(0.03 * chatter, t, 0.05);
    },
    brake(p) {
      const t = T();
      bBrake.set(p > 0.005);
      bHiss.f.frequency.setTargetAtTime(500 + 500 * p, t, 0.15);
      bHiss.g.gain.setTargetAtTime(0.05 * p, t, 0.12);
      bGroan.g.gain.setTargetAtTime(0.014 * p * p, t, 0.15);
    },
    rev(level) {
      const t = T();
      bRev.set(level > 0.005);
      vRoar.g.gain.setTargetAtTime(0.2 * level, t, 0.25);
      vRoar.f.frequency.setTargetAtTime(500 + 1500 * level, t, 0.25);
      vLow.g.gain.setTargetAtTime(0.14 * level, t, 0.3);
    },
    amb(ac, dc, packs, fuel) {
      const t = T();
      bAmb.set(ac || dc || packs > 0 || fuel > 0);
      aHum.g.gain.setTargetAtTime(ac ? 0.005 : 0, t, 0.3);
      aHum2.g.gain.setTargetAtTime(ac ? 0.002 : 0, t, 0.3);
      aFan.g.gain.setTargetAtTime(dc ? 0.004 : 0, t, 0.4);
      aPack.g.gain.setTargetAtTime(packs * 0.011, t, 0.5);
      aFuel.g.gain.setTargetAtTime(fuel > 0 ? 0.004 + 0.002 * Math.min(3, fuel) : 0, t, 0.3);
    },
    horn(on) {
      bHorn.set(on);
      hornEn.gain.setTargetAtTime(on ? 0.1 : 0, T(), 0.02);
    },
    wailer(on) {
      bWail.set(on);
      wailEn.gain.setTargetAtTime(on ? 0.1 : 0, T(), 0.025);
    },
    shaker(on) {
      const t = T();
      bShake.set(on);
      if (on !== shOn) {
        shOn = on;
        shVoices.forEach((v) => {
          const r = v.playbackRate;
          r.cancelScheduledValues(t);
          r.setValueAtTime(on ? 0.5 : Math.max(r.value, 0.6), t); // motor spins up from slow / coasts down
          r.linearRampToValueAtTime(on ? 1 : 0.55, t + (on ? 0.45 : 0.4));
        });
      }
      shEn.gain.setTargetAtTime(on ? 0.35 : 0, t, on ? 0.03 : 0.12); // louder so mobile speakers hear the stick-shaker
    },
    clacker(on) {
      bClack.set(on);
      clEn.gain.setTargetAtTime(on ? 0.17 : 0, T(), 0.01);
    },
  };
}

function extras(c: AudioContext, inp: SimAudioInputs, now: number) {
  const g = inp.gear ?? [0, 0, 0];
  const wp = inp.wheelBrake ?? [0, 0, 0, 0];
  const brake = (wp[0] + wp[1] + wp[2] + wp[3]) / 4 / 3000;
  const cur: Prev = {
    t: now, gear: [g[0], g[1], g[2]], lever: inp.gearLever, flapPos: inp.flapPos ?? 0, flapLever: inp.flapLever ?? 0,
    lePos: inp.lePos ?? 0, spoiler: inp.spoilerPos ?? 0, speedBrake: inp.speedBrake, apuDoor: inp.apuDoor ?? 0,
    wow: !!inp.wow, rev: inp.reversers ?? [false, false], relays: inp.relays ?? [], fire: inp.fireHandles ?? [],
    bottles: inp.bottles ?? [], signs: inp.signs, parking: !!inp.parkingBrake, brake, valve: inp.startValve,
  };
  const p = prev;
  prev = cur;
  const vel = (key: string, a: number) => rate(key, a, now);
  const gs = inp.groundSpeedKt ?? 0;
  const pans = [0, -0.55, 0.55];

  // ── landing gear ──
  let hyd = 0, free = 0, wind = 0;
  for (let i = 0; i < 3; i++) {
    const v = vel(`gear${i}`, cur.gear[i]);
    if (v > 0.04) {
      if (v > 1.2) { free = Math.max(free, clamp(v / 4, 0.4, 1)); wind = Math.max(wind, 1); }
      else { hyd = Math.max(hyd, clamp(v / 0.5, 0.3, 1)); wind = Math.max(wind, 0.7); }
    }
    if (!p) continue;
    const a = p.gear[i], b = cur.gear[i], pan = pans[i];
    const manual = v > 1.2;
    if (a <= 0.02 && b > 0.02) { clunk(c, pan, 0.34); thump(c, pan, 0.2, 0.05); whoosh(c, pan, 0.07, 0.6, 250, 900, 0.05); } // uplock release + door opens
    if (a > 0.98 && b <= 0.98) clunk(c, pan, 0.22);                                                                          // downlock released
    if (a < 0.98 && b >= 0.98) lockThunk(c, pan, manual ? 0.52 : 0.42, i * 0.06);                                            // down and locked
    if (a > 0.02 && b <= 0.02) lockThunk(c, pan, 0.38, i * 0.05);                                                            // up and locked
    if (a > 0.1 && b <= 0.1) { thump(c, pan, 0.2, 0.02); whoosh(c, pan, 0.05, 0.4, 900, 300); }                              // doors close
    if (a > 0.85 && b <= 0.85) wheelSpinDown(c, pan, 0.1);                                                                   // wheels spin down in the well
  }
  if (p && cur.lever !== undefined && p.lever !== undefined && cur.lever !== p.lever) { clunk(c, 0, 0.3); clunk(c, 0, 0.14, 0.12); }
  fx?.gear(hyd, free, inp.wow ? wind * 0.3 : wind);
  // Prefer supplied samples for aural warnings; synth is fallback
  ensureSampleLoops(c);

  // Gear warning / take-off config / cabin altitude — same intermittent horn family on classics
  const wantHorn = !!(inp.gearHorn || inp.configOrCabinHorn);
  if (sampleLoops.configCabinHorn) {
    if (wantHorn !== sampleHornOn) {
      sampleLoops.configCabinHorn.set(wantHorn);
      sampleHornOn = wantHorn;
    }
    fx?.horn(false);
  } else {
    fx?.horn(wantHorn);
  }

  const wantWail = !!inp.apWarn;
  if (sampleLoops.apDisconnect) {
    if (wantWail !== sampleWailerOn) {
      sampleLoops.apDisconnect.set(wantWail);
      sampleWailerOn = wantWail;
    }
    fx?.wailer(false);
  } else {
    fx?.wailer(wantWail);
  }

  const wantShake = !!inp.stallWarn;
  if (sampleLoops.stickshaker) {
    if (wantShake !== sampleShakerOn) {
      sampleLoops.stickshaker.set(wantShake);
      sampleShakerOn = wantShake;
    }
    fx?.shaker(false);
  } else {
    fx?.shaker(wantShake);
  }

  // GPWS SYS TEST → full vocabulary sample (loop while TEST held)
  const wantGpws = !!inp.gpwsTest;
  if (sampleLoops.gpwsVocab) {
    if (wantGpws !== sampleGpwsOn) {
      sampleLoops.gpwsVocab.set(wantGpws);
      sampleGpwsOn = wantGpws;
    }
  }

  // Mode 5 below-glideslope (also covered inside GPWS vocab test)
  const wantGs = !!inp.glideslopeWarn && !wantGpws;
  if (sampleLoops.glideslope) {
    if (wantGs !== sampleGsOn) {
      sampleLoops.glideslope.set(wantGs);
      sampleGsOn = wantGs;
    }
  }

  fx?.clacker(!!inp.machWarn);

  // ── flaps and leading-edge devices ──
  const vf = vel("flap", cur.flapPos);
  const vl = vel("le", cur.lePos);
  const flapNow = vf > 0.015, leNow = vl > 0.015;
  if (p) {
    if (flapMoving && !flapNow) thump(c, -0.2, 0.14);
    if (leMoving && !leNow) clunk(c, 0.2, 0.22);
    if (cur.flapLever !== p.flapLever) {
      noiseBurst(c, 0, c.currentTime, 0.2, 0.001, 0.015, "bandpass", 1900, 3);
      noiseBurst(c, 0, c.currentTime + 0.04, 0.16, 0.001, 0.015, "bandpass", 2400, 3);
      clunk(c, 0, 0.12, 0.02);
    }
  }
  flapMoving = flapNow; leMoving = leNow;
  fx?.flap(clamp(Math.max(vf / 0.4, vl / 0.5 * 0.7), 0, 1));

  // ── spoilers / speed brake ──
  const vs = vel("spoiler", cur.spoiler);
  if (p) {
    if (p.spoiler < 0.97 && cur.spoiler >= 0.97) thump(c, 0, 0.24);
    if (p.spoiler > 0.03 && cur.spoiler <= 0.03) thump(c, 0, 0.16);
    if (cur.speedBrake !== undefined && p.speedBrake !== undefined && cur.speedBrake !== p.speedBrake) { clunk(c, 0.15, 0.26); clunk(c, 0.15, 0.12, 0.1); }
  }
  fx?.spoiler(clamp(vs / 1.0, 0, 1));

  // ── APU door ──
  const vd = vel("door", cur.apuDoor);
  const doorNow = vd > 0.01;
  if (p && doorMoving && !doorNow) thump(c, 0.5, 0.18);
  doorMoving = doorNow;
  fx?.door(clamp(vd / 0.3, 0, 1));

  // ── hydraulics ──
  const hp = inp.hydPressure ?? [0, 0, 0];
  fx?.hyd(Math.max(hp[0], hp[1], hp[2]), inp.hydPumps ?? 0, !!inp.elecPumps);

  // ── ground: touchdown, rollout, brakes ──
  const rolling = !!inp.wow && gs > 2;
  const grass = inp.rwyPhase === "OVERRUN";
  const r = rolling ? clamp(gs / 150, 0, 1) : 0;
  fx?.roll(r, grass);
  if (p && !p.wow && cur.wow && gs > 40) {
    const k = clamp(gs / 130, 0.4, 1);
    tyreChirp(c, -0.4, 0.3 * k); tyreChirp(c, 0.4, 0.26 * k, 0.025);
    thump(c, -0.3, 0.55 * k); thump(c, 0.3, 0.5 * k, 0.02);
    whoosh(c, 0, 0.1 * k, 1.3, 150, 700, 0.05, "lowpass", 0.7);
    thump(c, 0, 0.32, 1.1 + 0.5 * (1 - k)); clunk(c, 0, 0.18, 1.12 + 0.5 * (1 - k)); // nose gear slaps down
  }
  if (rolling && !grass && now - lastJoint > Math.max(0.16, 25 / (Math.max(gs, 1) * 0.5144))) {
    lastJoint = now;
    const a = 0.04 + 0.06 * r;
    thump(c, Math.random() * 0.5 - 0.25, a);
    thump(c, Math.random() * 0.5 - 0.25, a * 0.7, 0.09);
  }
  // tyre squeal from slip, antiskid valve chatter while the system is modulating
  const ws = inp.wheelSpeeds ?? [0, 0, 0, 0];
  let slip = 0, modulating = 0;
  for (let k = 0; k < 4; k++) {
    if (gs > 15 && wp[k] > 200) {
      const s = clamp(1 - ws[k] / gs, 0, 1);
      slip = Math.max(slip, s);
      if (s > 0.12) modulating = Math.max(modulating, clamp((s - 0.1) / 0.3, 0, 1));
    }
  }
  fx?.skid(rolling ? clamp((slip - 0.25) / 0.5, 0, 1) : 0, 1100 + gs * 3, inp.antiskid && rolling ? modulating : 0);
  fx?.brake(rolling ? brake * clamp(gs / 40, 0.25, 1) : 0);
  if (p) {
    if (p.brake < 0.05 && cur.brake >= 0.05) whoosh(c, 0, 0.1, 0.3, 2500, 1200);
    if (p.brake > 0.2 && cur.brake < 0.05) whoosh(c, 0, 0.12, 0.35, 3000, 1500);
    if (p.parking !== cur.parking) { clunk(c, 0, 0.26); noiseBurst(c, 0, c.currentTime + 0.05, 0.12, 0.01, 0.2, "highpass", 2500, 0.7); }
  }

  // ── thrust reversers ──
  const n1 = inp.n1 ?? [0, 0];
  let revLevel = 0;
  for (let i = 0; i < 2; i++) {
    if (cur.rev[i]) revLevel = Math.max(revLevel, clamp(n1[i] / 100, 0, 1) * 0.9 + 0.1);
    if (!p) continue;
    const pan = i === 0 ? -0.4 : 0.4;
    if (!p.rev[i] && cur.rev[i]) { clunk(c, pan, 0.4); clunk(c, pan, 0.3, 0.14); thump(c, pan, 0.3, 0.05); whoosh(c, pan, 0.1, 0.7, 300, 1400, 0.1); }
    if (p.rev[i] && !cur.rev[i]) { thump(c, pan, 0.3); clunk(c, pan, 0.3, 0.05); }
  }
  fx?.rev(inp.wow ? revLevel : 0);

  // ── electrical contactors, start valves, fire handles and bottles ──
  if (p) {
    cur.relays.forEach((v, i) => { if (v !== p.relays[i] && p.relays[i] !== undefined) { clunk(c, -0.3 + (i % 4) * 0.2, 0.16, i * 0.05); clunk(c, -0.3 + (i % 4) * 0.2, 0.08, i * 0.05 + 0.045); } });
    cur.valve.forEach((v, i) => { if (v && !p.valve[i]) { clunk(c, i === 0 ? -0.4 : 0.4, 0.12); whoosh(c, i === 0 ? -0.4 : 0.4, 0.06, 0.4, 600, 2200, 0.03); } });
    cur.fire.forEach((v, i) => {
      if (p.fire[i] === undefined || v === p.fire[i]) return;
      if (v) { clunk(c, 0, 0.42); thump(c, 0, 0.28, 0.02); } else clunk(c, 0, 0.26);
    });
    cur.bottles.forEach((v, i) => {
      if (!v || p.bottles[i]) return;
      const pan = i === 0 ? -0.3 : i === 1 ? 0.3 : 0;
      thump(c, pan, 0.5); clunk(c, pan, 0.3, 0.02); whoosh(c, pan, 0.14, 1.6, 4000, 1500, 0.08, "highpass", 0.5);
    });
    if (cur.signs && p.signs) {
      if (cur.signs[0] !== p.signs[0]) chime(c, [1046, 784]);
      else if (cur.signs[1] !== p.signs[1]) chime(c, [1175]);
    }
  }

  // ── ambience ──
  const packs = (inp.packs?.[0] ? 1 : 0) + (inp.packs?.[1] ? 1 : 0);
  fx?.amb(!!inp.acPower, !!inp.dcPower, packs, inp.fuelPumps ?? 0);
}

/** Engine voices run on a faster timer than the rest of the sound so the spool glides instead of stepping. */
function tickEngines(inp: SimAudioInputs) {
  const c = ctx;
  if (!enabled || !c || !master || c.state !== "running") { engSnap = true; return; }
  for (let i = 0; i < 2; i++) engVoices[i]?.update(inp.n1?.[i] ?? 0, inp.n2[i], inp.startValve[i], engSnap);
  engSnap = false;
}

function tick(inp: SimAudioInputs) {
  const c = ctx;
  if (!enabled || !c || !master || c.state !== "running") return;
  apuVoice?.update(inp.apuRpm, inp.apuStarter);
  const now = c.currentTime;
  for (let i = 0; i < 2; i++) {
    const n2 = inp.n2[i];
    const pan = i === 0 ? -0.4 : 0.4;
    // ignition ticks while the start switch is selected, lever open and the engine is spooling
    if (inp.startSw[i] !== "OFF" && inp.lever[i] && n2 > 10 && n2 < 50 && now - lastClick[i] > 0.11) {
      click(c, pan);
      lastClick[i] = now;
    }
    // light-off when the lever is opened while the engine is already turning
    if (inp.lever[i] && !lastLever[i] && n2 > 12 && n2 < 60) lightOff(c, pan);
    lastLever[i] = inp.lever[i];
  }
  extras(c, inp, now);
  // Fire bell: prefer supplied sample (continuous while any fire / OVHT-FIRE test is active).
  // Fallback: synthesised electric-gong strikes scheduled on the audio clock.
  const wantBell = !!(inp.fire.e1 || inp.fire.e2 || inp.fire.apu || inp.fireOther);
  ensureSampleLoops(c);
  if (sampleLoops.fireBell) {
    if (wantBell !== sampleFireOn) {
      sampleLoops.fireBell.set(wantBell);
      sampleFireOn = wantBell;
    }
    bellNext = 0; // do not also run the synth bell
  } else if (wantBell) {
    if (bellNext < now) bellNext = now + 0.02; // (re)starting
    while (bellNext < now + 0.22) {
      bell(c, bellNext, bellK++);
      bellNext += BELL_PERIOD * (1 + (Math.random() - 0.5) * 0.06);
    }
  } else {
    bellNext = 0;
  }
}

async function setEnabled(on: boolean) {
  if (on) {
    if (!ctx) build();
    await ctx?.resume();
    prev = null;
    engSnap = true;
    bellNext = 0;
    rates.clear(); // no burst of event sounds for changes made while sound was off
    // Load supplied aural samples (fire bell, stick-shaker, AP disconnect) once AudioContext is live
    if (ctx) {
      await loadSamples(ctx);
      ensureSampleLoops(ctx);
    }
    enabled = true;
  } else {
    enabled = false;
    sampleLoops.fireBell?.set(false);
    sampleLoops.stickshaker?.set(false);
    sampleLoops.apDisconnect?.set(false);
    sampleLoops.glideslope?.set(false);
    sampleLoops.gpwsVocab?.set(false);
    sampleLoops.configCabinHorn?.set(false);
    sampleFireOn = false;
    sampleShakerOn = false;
    sampleWailerOn = false;
    sampleGsOn = false;
    sampleGpwsOn = false;
    sampleHornOn = false;
    await ctx?.suspend();
  }
}

/** Mount once (Cockpit). Sound stays off until the person taps the sound button (browser autoplay rule). */
export function useSimAudio(inputs: SimAudioInputs) {
  const ref = useRef(inputs);
  ref.current = inputs;
  const [on, setOn] = useState(false);
  const [vol, setVol] = useState(volume);

  useEffect(() => {
    const id = window.setInterval(() => tick(ref.current), 100);
    const engId = window.setInterval(() => tickEngines(ref.current), 90);
    return () => {
      window.clearInterval(id);
      window.clearInterval(engId);
      enabled = false;
      ctx?.suspend().catch(() => undefined);
    };
  }, []);

  const toggle = useCallback(async () => {
    const next = !enabled;
    await setEnabled(next);
    setOn(next);
  }, []);

  const setVolume = useCallback((v: number) => {
    volume = clamp(v, 0, 1);
    if (master && ctx) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
    setVol(volume);
  }, []);

  return { on, vol, toggle, setVolume };
}
