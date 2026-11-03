/**
 * Acoustic spool model for the engine sound (pure maths, no Web Audio, so it can be unit-tested).
 *
 * The sim's N1/N2 are the "truth", but they can jump (preset states, flight-phase hand-offs, lever slams that
 * the rate-limited sim answers within a couple of seconds). What the ears hear on a real JT8D is:
 *
 *   - rotor speed (whine pitch) has inertia: it starts to move after a short lag, accelerates, runs at a
 *     fuel-schedule-limited rate, then eases into the target with a rounded finish (S-shaped, never a step);
 *   - the exhaust roar (jet noise, ~ velocity^8) lags the rotors a little on the way up and dies away faster
 *     than the rotors wind down on the way back to idle;
 *   - spool-down is lazier than spool-up.
 *
 * Each rotor is a velocity-limited, critically-smoothed follower: the desired speed of change is err / tau
 * (rounded finish) clipped to a maximum rate, and the actual speed of change glides toward that with its own
 * time constant (the S-shaped start). Output is continuous in value and in rate.
 */

export type RotorTune = { tau: number; max: number; vTau: number };

// Idle -> takeoff N1 (about 32 -> 92 %) takes roughly 6-8 s once the acoustic lag is added to the sim's own spool.
export const N1_UP: RotorTune = { tau: 1.0, max: 10.5, vTau: 0.6 };
export const N1_DOWN: RotorTune = { tau: 1.3, max: 8.5, vTau: 0.75 };
export const N2_UP: RotorTune = { tau: 0.9, max: 7.0, vTau: 0.5 };
export const N2_DOWN: RotorTune = { tau: 1.2, max: 6.0, vTau: 0.65 };

/** Jet roar follows thrust (0..1) a little behind the rotors going up, and drops off sooner coming down. */
export const JET_UP_TAU = 1.1;
export const JET_DOWN_TAU = 0.7;

export type AcousticSpool = {
  n1: number; // smoothed fan speed, %
  n2: number; // smoothed core speed, %
  v1: number; // %/s
  v2: number; // %/s
  jet: number; // 0..1 thrust-above-idle as the exhaust sees it
  ready: boolean;
};

export function newAcousticSpool(): AcousticSpool {
  return { n1: 0, n2: 0, v1: 0, v2: 0, jet: 0, ready: false };
}

function follow(x: number, v: number, target: number, h: number, up: RotorTune, down: RotorTune): [number, number] {
  const err = target - x;
  const c = err >= 0 ? up : down;
  const want = Math.max(-down.max, Math.min(up.max, err / c.tau));
  // when the target is hit from above/below the velocity must also die away: the same filter does it
  const a = 1 - Math.exp(-h / c.vTau);
  let nv = v + (want - v) * a;
  let nx = x + nv * h;
  // never overshoot the target (no ringing): clamp and kill the velocity
  if ((target - x) * (target - nx) <= 0) { nx = target; nv = 0; }
  return [nx, nv];
}

/** Thrust above idle, 0..1, from fan speed (idle N1 ~ 32 %, takeoff ~ 92-100 %). */
export function thrustFromN1(n1: number): number {
  return Math.max(0, Math.min(1, (n1 - 32) / 60));
}

/**
 * Advance the model by `dt` seconds toward the sim's current N1/N2.
 * `snap` jumps straight to the targets (first update, or sound just switched on while the engine is already running).
 */
export function stepAcousticSpool(s: AcousticSpool, n1Target: number, n2Target: number, dt: number, snap = false): AcousticSpool {
  if (snap || !s.ready) {
    return { n1: n1Target, n2: n2Target, v1: 0, v2: 0, jet: thrustFromN1(n1Target), ready: true };
  }
  let { n1, n2, v1, v2, jet } = s;
  let rem = Math.max(0, Math.min(dt, 1));
  while (rem > 1e-6) {
    const h = Math.min(0.02, rem);
    rem -= h;
    [n1, v1] = follow(n1, v1, n1Target, h, N1_UP, N1_DOWN);
    [n2, v2] = follow(n2, v2, n2Target, h, N2_UP, N2_DOWN);
    const jt = thrustFromN1(n1);
    const tau = jt >= jet ? JET_UP_TAU : JET_DOWN_TAU;
    jet += (jt - jet) * (1 - Math.exp(-h / tau));
  }
  return { n1, n2, v1, v2, jet, ready: true };
}
