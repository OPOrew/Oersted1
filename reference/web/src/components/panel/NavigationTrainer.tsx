import { useShallow } from "zustand/react/shallow";
import { useMip } from "@/lib/sim/mipLocal";
import { cn } from "@/lib/utils";
import { usePedestal } from "@/lib/sim/pedestal";
import { Fold } from "@/components/panel/Fold";
import { ApTrainerView } from "@/components/panel/ApTrainerView";
import { NavSharedDisplay } from "@/components/panel/NavSharedDisplay";
import { FlightPhasePanel } from "@/components/panel/FlightPhasePanel";
import { NavAutopilotDiagram } from "@/components/panel/NavAutopilotDiagram";

/**
 * Navigation section of the Training Console (ATA 34).
 * Tuning writes into the centre pedestal NAV 1 control head (sole frequency authority).
 * Kind (VOR/ILS) is derived from the station table at that frequency — not from mode buttons alone.
 * Pilot knobs on the pedestal always override.
 */
export function NavigationTrainer() {
  const mip = useMip(useShallow((st) => ({ compSyncFlag: st.compSyncFlag, lrra: st.lrra, set: st.set, srcFail: st.srcFail, srcPower: st.srcPower })));
  return (
    <div className="mt-2 rounded border border-border bg-surface p-2">
      <div className="mb-3"><NavSharedDisplay /></div>
      <FlightPhasePanel />
      <Fold title="Component flow" hint="ATA 34 · what feeds what"><NavAutopilotDiagram focus="nav" /></Fold>
      <Fold title="Instrument panel" hint="live captain / A/P / first officer"><ApTrainerView focus="nav" /></Fold>
      <Fold title="ILS notes" hint="how the approach sequence works"><p className="mt-1 text-[8px] leading-snug text-subtle">
        ILS training sequence: monitor LOC and GS independently as the aircraft moves along the approach.
        In this model, GS is not valid outside 10 NM from the runway threshold; NO GS at 12 NM is therefore expected.
        The aircraft must be airborne (above 60 kt with WOW off) for the simulated position to advance.
      </p>
      <p className="mt-1 text-[8px] leading-snug text-subtle">
        Frequency is set on the centre pedestal NAV 1 head (or via the map / flight-plan load).
        Turning the pedestal knobs always overrides. Kind (VOR vs ILS) follows the station table at the tuned frequency.
      </p></Fold>
      <Fold title="Failures, circuit breakers and test" hint="source failures · CBs · RMI · LRRA"><div className="pt-1.5">
        <div className="mb-1 font-display text-[8px] uppercase tracking-[.14em] text-subtle">Source failures (VHF NAV · COMPASS · VERTICAL GYRO selectors)</div>
        <div className="grid grid-cols-4 gap-1.5">
          {([["gyro1", "Gyro 1"], ["gyro2", "Gyro 2"], ["gyroAux", "Gyro AUX"], ["comp1", "Comp 1"], ["comp2", "Comp 2"], ["nav1", "NAV 1"], ["nav2", "NAV 2"]] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={mip.srcFail[k]}
              onClick={() => mip.set({ srcFail: { ...mip.srcFail, [k]: !mip.srcFail[k] } })}
              className={cn("rounded border px-1 py-1 font-mono text-[8px] uppercase", mip.srcFail[k] ? "border-red-500/50 bg-red-950/30 text-red-300" : "border-border text-subtle")}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mb-1 mt-2 font-display text-[8px] uppercase tracking-[.14em] text-subtle">Circuit breakers (closed = powered path)</div>
        <div className="grid grid-cols-4 gap-1.5">
          {([
            ["gyro1Cb", "VG1 CB"], ["gyro2Cb", "VG2 CB"], ["gyroAuxCb", "VG AUX CB"],
            ["comp1Cb", "COMP1 CB"], ["comp2Cb", "COMP2 CB"],
            ["nav1Cb", "NAV1 VOR/LOC"], ["nav2Cb", "NAV2 VOR/LOC"],
            ["nav1GsCb", "NAV1 G/S"], ["nav2GsCb", "NAV2 G/S"],
            ["dme1Cb", "DME1 CB"], ["dme2Cb", "DME2 CB"],
            ["adf1Cb", "ADF1 CB"], ["adf2Cb", "ADF2 CB"],
            ["comm1Cb", "VHF1 CB"], ["comm2Cb", "VHF2 CB"],
            ["hf1Cb", "HF-1 CB"], ["hf2Cb", "HF-2 CB*"],
            ["lrra1Cb", "LRRA1 CB"], ["lrra2Cb", "LRRA2 CB"],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={!mip.srcPower[k]}
              onClick={() => mip.set({ srcPower: { ...mip.srcPower, [k]: !mip.srcPower[k] } })}
              className={cn("rounded border px-1 py-1 font-mono text-[8px] uppercase", !mip.srcPower[k] ? "border-red-500/50 bg-red-950/30 text-red-300" : "border-border text-subtle")}
            >
              {label}{mip.srcPower[k] ? "" : " OPEN"}
            </button>
          ))}
        </div>
        <div className="mt-1 text-[8px] text-subtle">* HF-2 CB separation is a trainer assumption pending tail-specific WDM/effectivity verification.</div>
        <button
          type="button"
          className={cn("mt-2 rounded border px-2 py-1 font-mono text-[8px] uppercase", mip.srcPower.gyroFastErect ? "border-amber-500/50 text-amber-200" : "border-border text-subtle")}
          onClick={() => mip.set({ srcPower: { ...mip.srcPower, gyroFastErect: !mip.srcPower.gyroFastErect } })}
        >
          {mip.srcPower.gyroFastErect ? "VG FAST ERECT ON (~2.5s)" : "VG FAST ERECT (else ~60s)"}
        </button>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            className={cn("rounded border px-2 py-1 font-mono text-[8px] uppercase", mip.compSyncFlag.c1 ? "border-red-500/50 text-red-300" : "border-border text-subtle")}
            onClick={() => mip.set({ compSyncFlag: { ...mip.compSyncFlag, c1: !mip.compSyncFlag.c1 } })}
          >
            COMP1 {mip.compSyncFlag.c1 ? "UNSYNC · HDG FLAG" : "SYNC OK"}
          </button>
          <button
            type="button"
            className={cn("rounded border px-2 py-1 font-mono text-[8px] uppercase", mip.compSyncFlag.c2 ? "border-red-500/50 text-red-300" : "border-border text-subtle")}
            onClick={() => mip.set({ compSyncFlag: { ...mip.compSyncFlag, c2: !mip.compSyncFlag.c2 } })}
          >
            COMP2 {mip.compSyncFlag.c2 ? "UNSYNC · HDG FLAG" : "SYNC OK"}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button type="button" className="rounded border border-border px-2 py-1 font-mono text-[8px] uppercase text-subtle"
            onClick={() => {
              const ped = usePedestal.getState();
              const c = ped.compMode;
              ped.set({ compMode: [c[0] === 0 ? 1 : 0, c[1]] as [number, number] });
            }}>COMP1 {usePedestal.getState().compMode[0] === 0 ? "SLAVED" : "DG"}</button>
          <button type="button" className="rounded border border-border px-2 py-1 font-mono text-[8px] uppercase text-subtle"
            onClick={() => {
              const ped = usePedestal.getState();
              const c = ped.compMode;
              ped.set({ compMode: [c[0], c[1] === 0 ? 1 : 0] as [number, number] });
            }}>COMP2 {usePedestal.getState().compMode[1] === 0 ? "SLAVED" : "DG"}</button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button type="button" className="rounded border border-border px-2 py-1 font-mono text-[8px] uppercase text-subtle"
            onClick={() => {
              const ped = usePedestal.getState();
              const n = ped.rmiNeedle1;
              ped.set({ rmiNeedle1: [n[0] === 0 ? 1 : 0, n[1]] as [number, number] });
            }}>RMI N1 CAPT {usePedestal.getState().rmiNeedle1[0] === 0 ? "VOR" : "ADF"}</button>
          <button type="button" className="rounded border border-border px-2 py-1 font-mono text-[8px] uppercase text-subtle"
            onClick={() => {
              const ped = usePedestal.getState();
              const n = ped.rmiNeedle2;
              ped.set({ rmiNeedle2: [n[0] === 0 ? 1 : 0, n[1]] as [number, number] });
            }}>RMI N2 CAPT {usePedestal.getState().rmiNeedle2[0] === 0 ? "VOR" : "ADF"}</button>
        </div>
        <div className="mt-1 font-mono text-[8px] text-muted">
                  <div className="mt-2 flex flex-wrap gap-1.5">
          <button type="button" className="rounded border border-border px-2 py-1 font-mono text-[8px] uppercase text-subtle"
            onClick={() => {
              const ped = usePedestal.getState();
              const c = ped.lrraTest;
              ped.set({ lrraTest: [!c[0], c[1]] as [boolean, boolean] });
            }}>LRRA1 {usePedestal.getState().lrraTest[0] ? "TEST" : "NORM"}</button>
          <button type="button" className="rounded border border-border px-2 py-1 font-mono text-[8px] uppercase text-subtle"
            onClick={() => {
              const ped = usePedestal.getState();
              const c = ped.lrraTest;
              ped.set({ lrraTest: [c[0], !c[1]] as [boolean, boolean] });
            }}>LRRA2 {usePedestal.getState().lrraTest[1] ? "TEST" : "NORM"}</button>
        </div>
        LRRA DH: {usePedestal.getState().lrraDh[0]} / {usePedestal.getState().lrraDh[1]} ft · H:
          {" "}{mip.lrra?.h1 ?? "—"} / {mip.lrra?.h2 ?? "—"} ft
          {mip.lrra?.dh1 ? " · DH1" : ""}{mip.lrra?.dh2 ? " · DH2" : ""}
        </div>
      </div></Fold>
    </div>
  );
}
