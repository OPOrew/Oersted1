import { useShallow } from "zustand/react/shallow";
import type { ReactNode } from "react";
import { useSimPick, useDerivedPick } from "@/lib/sim/store";
import { useMip } from "@/lib/sim/mipLocal";
import { useCaptainFeeds } from "@/components/panel/captainFeeds";
import { AdiReal, AltReal, AsiReal, HsiReal, RmiReal } from "@/components/panel/instruments";
import { VerticalSpeed } from "@/components/panel/SixPack";
import { Dial, GearPair } from "@/components/panel/EngineInstrumentPanel";
import { FlapDial } from "@/components/panel/MainInstrumentPanel";

/**
 * Live instruments shared by the Autopilot and Navigation tabs (the flight-phase readout shows these instead of text values):
 *   InstrumentStrip = the captain's ADI / HSI / RMI / airspeed / altimeter / vertical speed, fed exactly like the main panel
 *   SystemsCluster  = flap position dial, gear position lights (red / green), EPR 1 / EPR 2 dials, speedbrake and autopilot text
 */

const KG = 33.8639; // hPa per inHg

export function Cell({ label, aspect, children }: { label: string; aspect: number; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mx-auto w-full max-w-[210px] overflow-hidden rounded border border-[#2a2f36] bg-[#0b0d10]" style={{ aspectRatio: String(aspect) }}>
        {children}
      </div>
      <div className="mt-0.5 text-center font-mono text-[8px] uppercase text-subtle">{label}</div>
    </div>
  );
}

export function InstrumentStrip() {
  const f = useCaptainFeeds();
  const { s, m, pw, capt, captPowered, failC, navC, tasKt, gsKt, adiNavC } = f;
  const slip = Math.max(-1, Math.min(1, s.rudderPedal));
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      <Cell label="ADI" aspect={242 / 254}>
        <AdiReal slip={slip} powered={pw} test={pw && m.adiTestCapt} fail={failC} pitch={m.attCapt.pitch} roll={m.attCapt.roll} fd={m.fdCmd} nav={adiNavC} />
      </Cell>
      <Cell label="HSI" aspect={232 / 202}>
        <HsiReal powered={pw} fail={failC} hdg={m.attCapt.hdg} tas={tasKt} gs={gsKt} crs={m.selCrs} bug={m.selHdg} nav={navC} navOn={m.navOn} tuned={m.navTuned} />
      </Cell>
      <Cell label="RMI" aspect={154 / 176}>
        <RmiReal powered={pw} fail={failC} hdg={m.attCapt.hdg} dme1Nm={f.dmeNm(0, failC.dme1)} dme2Nm={f.dmeNm(1, failC.dme2)} brg1={f.rmiBrg(0, m.adfBrg1)} brg2={f.rmiBrg(1, m.adfBrg2)} />
      </Cell>
      <Cell label="Airspeed" aspect={1}>
        <AsiReal data={capt} powered={captPowered} bugKt={m.bugCapt} />
      </Cell>
      <Cell label="Altimeter" aspect={1}>
        <AltReal data={capt} powered={captPowered} mb={s.psBaroCaptHpa} hg={s.psBaroCaptHpa / KG} />
      </Cell>
      <Cell label="Vertical speed" aspect={1}>
        <VerticalSpeed data={capt} />
      </Cell>
    </div>
  );
}

const RED = "#d65a4a";

/** Flaps, gear, thrust (EPR), speedbrake and autopilot state: the real indicators, not numbers. */
export function SystemsCluster() {
  const s = useSimPick("flapPos", "flaps", "ltTest", "speedBrake", "spoilerPos");
  const d = useDerivedPick("dcPower", "epr1", "epr2", "gearLights");
  const m = useMip(useShallow((st) => ({ apAil: st.apAil, apElev: st.apElev })));
  const gl = d.gearLights;
  const test = !!(s.ltTest && d.dcPower);
  const spoilerPct = Math.round(Math.max(0, Math.min(1, Number(s.spoilerPos ?? 0))) * 100);
  const lever = String(s.speedBrake ?? "-");
  const apOn = !!(m.apAil || m.apElev);
  const apText = apOn ? `ARMED · ${[m.apAil ? "AIL" : "", m.apElev ? "ELEV" : ""].filter(Boolean).join(" + ")}` : "UNARMED";
  return (
    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div className="min-w-0 rounded border border-border bg-inset p-1.5">
        <div className="mx-auto aspect-square w-full max-w-[110px] rounded-full bg-[#050607] p-1"><FlapDial units={Number(s.flapPos ?? s.flaps ?? 0)} /></div>
        <div className="mt-0.5 text-center font-mono text-[8px] uppercase text-subtle">Flap position</div>
      </div>
      <div className="min-w-0 rounded border border-border bg-inset p-1.5">
        <div className="flex flex-col items-center gap-1">
          <GearPair text="NOSE GEAR" red={test || gl.nose.red} green={test || gl.nose.green} />
          <div className="flex gap-1">
            <GearPair text="LEFT GEAR" red={test || gl.leftMain.red} green={test || gl.leftMain.green} />
            <GearPair text="RIGHT GEAR" red={test || gl.rightMain.red} green={test || gl.rightMain.green} />
          </div>
        </div>
        <div className="mt-0.5 text-center font-mono text-[8px] uppercase text-subtle">Gear lights · red transit · green down &amp; locked</div>
      </div>
      <div className="min-w-0 rounded border border-border bg-inset p-1.5">
        <div className="flex justify-center gap-1">
          <Dial size={78} label="EPR 1" value={d.epr1} min={1} max={2.4} major={0.4} minor={2} digits={2} caption={d.epr1.toFixed(2)} bands={[{ from: 2.0, to: 2.4, color: RED }]} />
          <Dial size={78} label="EPR 2" value={d.epr2} min={1} max={2.4} major={0.4} minor={2} digits={2} caption={d.epr2.toFixed(2)} bands={[{ from: 2.0, to: 2.4, color: RED }]} />
        </div>
        <div className="mt-0.5 text-center font-mono text-[8px] uppercase text-subtle">Thrust · EPR</div>
      </div>
      <div className="grid min-w-0 grid-rows-2 gap-2">
        <div className="rounded border border-border bg-inset px-1.5 py-1">
          <div className="font-display text-[7px] uppercase tracking-[.12em] text-subtle">Speedbrake (actual)</div>
          <div className="truncate font-mono text-[10px] uppercase text-fg">{lever} · spoilers {spoilerPct}%</div>
        </div>
        <div className="rounded border border-border bg-inset px-1.5 py-1">
          <div className="font-display text-[7px] uppercase tracking-[.12em] text-subtle">Autopilot</div>
          <div className={`truncate font-mono text-[10px] uppercase ${apOn ? "text-emerald-300" : "text-fg"}`}>{apText}</div>
        </div>
      </div>
    </div>
  );
}
