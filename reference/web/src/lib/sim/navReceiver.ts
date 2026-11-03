/**
 * ATA 34 — NAV receiver authority.
 *
 * Centre pedestal NAV 1 / NAV 2 active frequencies are the sole authority for
 * what the VHF NAV receivers are tuned to. The Navigation Trainer, map auto-tune,
 * and Flight Plan Load may *write into* the pedestal; pilot knobs always override.
 *
 * MIP instruments and AFCS read from this module (via pedestal state), never from
 * a parallel trainer-only frequency that can diverge from the control heads.
 */
import { usePedestal } from "@/lib/sim/pedestal";
import { useMip } from "@/lib/sim/mipLocal";
import { findTrainingNavStation, type NavStationKind } from "@/lib/sim/radionav";
import { findChangiNavaid } from "@/lib/sim/navaids-changi";

let automaticTuneWrite = false;

/** True only while this module writes a frequency as an automatic handoff. */
export function isAutomaticNavTuneWrite(): boolean { return automaticTuneWrite; }

/** Pedestal stores kHz×1000 style ints (e.g. 110900 → 110.90 MHz). */
export function mhzFromPedestalRaw(raw: number): number {
  return raw / 1000;
}

export function pedestalRawFromMhz(mhz: number): number {
  return Math.round(mhz * 1000);
}

/** Active frequency of NAV 1 or NAV 2 in MHz. */
export function pedestalNavMhz(side: "L" | "R"): number {
  const p = usePedestal.getState();
  const st = side === "L" ? p.navL : p.navR;
  return mhzFromPedestalRaw(st.act);
}

/**
 * Which physical receiver feeds a pilot side given the VHF NAV transfer switch.
 * navSel: 0 = BOTH ON 1, 1 = NORMAL (CAPT→1, F/O→2), 2 = BOTH ON 2
 */
export function navSideForPilot(pilot: "CAPT" | "FO", navSel: number): "L" | "R" {
  if (navSel === 0) return "L";
  if (navSel === 2) return "R";
  return pilot === "CAPT" ? "L" : "R";
}

export interface ResolvedNavReceiver {
  side: "L" | "R";
  frequencyMHz: number;
  /** Derived from the training station table; null if off-frequency / unknown. */
  kind: NavStationKind | null;
  stationId: string | null;
}

/** Resolve the receiver that should drive instruments for one pilot. */
export function resolveNavReceiver(pilot: "CAPT" | "FO", navSel: number): ResolvedNavReceiver {
  const side = navSideForPilot(pilot, navSel);
  const frequencyMHz = pedestalNavMhz(side);
  const trainingStation = findTrainingNavStation(frequencyMHz);
  const catalogStation = findChangiNavaid(frequencyMHz, "VOR") ?? findChangiNavaid(frequencyMHz, "ILS");
  const station = trainingStation ?? (catalogStation ? {
    id: catalogStation.id,
    kind: (catalogStation.kind === "ILS" || catalogStation.kind === "LOC" ? "ILS" : "VOR") as NavStationKind,
  } : null);
  return {
    side,
    frequencyMHz,
    kind: station ? station.kind : null,
    stationId: station ? station.id : null,
  };
}

/**
 * Tune NAV 1 (left) active frequency and optionally mirror into MIP display state.
 * Used by Flight Plan Load, map auto-tune, and Navigation Trainer.
 * Does not engage autopilot.
 */
export function tuneNav1(mhz: number, opts?: { powerOn?: boolean; stbyMhz?: number; source?: "manual" | "auto" | "plan" }): void {
  const raw = pedestalRawFromMhz(mhz);
  const ped = usePedestal.getState();
  automaticTuneWrite = opts?.source === "auto";
  try {
    usePedestal.setState({
      navL: {
        act: raw,
        stby: opts?.stbyMhz !== undefined ? pedestalRawFromMhz(opts.stbyMhz) : ped.navL.stby,
      },
    });
  } finally { automaticTuneWrite = false; }
  const trainingStation = findTrainingNavStation(mhz);
  const catalogStation = findChangiNavaid(mhz, "VOR") ?? findChangiNavaid(mhz, "ILS");
  const kind: NavStationKind | null = trainingStation?.kind ?? (catalogStation ? (catalogStation.kind === "ILS" || catalogStation.kind === "LOC" ? "ILS" : "VOR") : null);
  const mipUpd: Record<string, unknown> = {
    navFrequencyMHz: mhz,
  };
  if (kind) mipUpd.navTuned = kind;
  if (opts?.powerOn) mipUpd.navOn = true;
  useMip.setState(mipUpd as never);
}

/** Tune NAV 2 (right) active frequency only (pedestal authority). */
export function tuneNav2(mhz: number): void {
  const raw = pedestalRawFromMhz(mhz);
  const ped = usePedestal.getState();
  usePedestal.setState({
    navR: { act: raw, stby: ped.navR.stby },
  });
}

/**
 * Sync MIP mirror fields from pedestal NAV 1.
 * Call once per frame from the MIP owner loop so displays stay aligned when the
 * pilot turns the pedestal knobs. Pedestal always wins.
 */
export function syncMipNavFromPedestal(): { frequencyMHz: number; kind: NavStationKind | null; changed: boolean } {
  const mhz = pedestalNavMhz("L");
  const trainingStation = findTrainingNavStation(mhz);
  const catalogStation = findChangiNavaid(mhz, "VOR") ?? findChangiNavaid(mhz, "ILS");
  const stationKind = trainingStation?.kind ?? (catalogStation ? (catalogStation.kind === "ILS" || catalogStation.kind === "LOC" ? "ILS" : "VOR") : null);
  const kind = stationKind;
  const m = useMip.getState();
  const freqChanged = Math.abs(m.navFrequencyMHz - mhz) > 0.0005;
  const kindChanged = kind !== null && m.navTuned !== kind;
  if (freqChanged || kindChanged) {
    useMip.setState({
      navFrequencyMHz: mhz,
      ...(kind ? { navTuned: kind } : {}),
    });
  }
  return { frequencyMHz: mhz, kind, changed: freqChanged || kindChanged };
}
