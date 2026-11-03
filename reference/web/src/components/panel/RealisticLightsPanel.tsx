/**
 * Realistic 737-200 Lights — fixed layout (Exterior / Flight deck / Signs).
 *
 * Exterior:
 *   [ LDG L RETR ] [ LDG R RETR ] [ FIXED L ] [ FIXED R ]
 *   [ RWY L ] [ RWY R ] [ TAXI ] [ WING ] [ LOGO ] [ WHEEL WELL ]
 *   [ ANTI COLL ] [ POSITION ]
 *
 * Flight deck:
 *   [ DOME ] [ MASTER DIM ] [ ANNUN TEST ]
 *   [ MAP L/R ] [ STORM ] [ COMPASS ] [ OBSERVER ] [ LTSHIELD ]
 *
 * Signs:
 *   [ NO SMOKING ] [ SEAT BELTS ] [ EMER LIGHTS ]
 */

import type { ReactNode } from "react";
import { useSim, useDerivedPick } from "@/lib/sim/store";
import { lightsControlsInitial } from "@/lib/sim/lights";
import { cn } from "@/lib/utils";
import { OnOffToggle, RotaryKnob, ToggleLever } from "./OverheadParts";

function CapLight({
  label,
  on,
  tone = "ok",
}: {
  label: string;
  on: boolean;
  tone?: "caution" | "ok" | "warn";
}) {
  const colors = {
    caution: on ? "bg-amber-400 text-black shadow-[0_0_6px_#fbbf24]" : "bg-[#2a2410] text-[#5a5030]",
    ok: on ? "bg-green-400 text-black shadow-[0_0_6px_#4ade80]" : "bg-[#0f2a14] text-[#2a5a30]",
    warn: on ? "bg-red-500 text-white shadow-[0_0_6px_#ef4444]" : "bg-[#2a1010] text-[#5a2020]",
  };
  return (
    <div
      className={cn(
        "min-w-[48px] rounded-[2px] border border-[#1a1a18] px-1 py-0.5 text-center font-mono text-[6px] font-bold uppercase leading-tight",
        colors[tone],
      )}
    >
      {label}
    </div>
  );
}

function VertRocker({
  label,
  on,
  onToggle,
  lit,
  onLabel = "ON",
  offLabel = "OFF",
  disabled,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
  lit?: boolean;
  onLabel?: string;
  offLabel?: string;
  disabled?: boolean;
}) {
  return (
    <OnOffToggle label={label} on={on} onToggle={onToggle} lit={lit} litTone="green" onLabel={onLabel} offLabel={offLabel} disabled={disabled} />
  );
}

/** 3-position selector: a toggle lever for up to 3 positions, a rotary knob for more. */
function ThreePos({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
}) {
  if (options.length > 3) {
    return <RotaryKnob label={label} options={options} value={value} onChange={onChange} size={84} tone="black" />;
  }
  return <ToggleLever label={label} options={options} value={value} onChange={onChange} />;
}

function useLit() {
  const d = useDerivedPick("lights");
  return (id: string) =>
    d.lights?.find((l: { id: string; lit?: boolean }) => l.id === id)?.lit ?? false;
}

function PanelShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      data-panel-scroll
      className="panel-scroll relative w-full min-w-0 max-w-full overflow-x-auto overflow-y-hidden rounded-md border-2 border-[#1a1c18] shadow-xl"
      style={{
        background: "linear-gradient(180deg, #3e413b 0%, #32352f 45%, #2a2c28 100%)",
        maxWidth: "min(100%, 480px)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />
      <div className="relative border-b border-[#1e201c] bg-[#2e312c]/90 px-2 py-1 sm:px-3">
        <h2 className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#e0d8c0]">
          {title}
        </h2>
      </div>
      <div className="relative min-w-0 px-2 py-2 sm:px-3 sm:py-3" data-keep-cols>{children}</div>
    </div>
  );
}

export function RealisticLightsPanel() {
  const s = useSim();
  const d = useDerivedPick("dcPower");
  const lit = useLit();
  const test = s.ltTest && d.dcPower;

  return (
    <div className="min-w-0 max-w-full space-y-3">
      {/* ========== EXTERIOR ========== */}
      <PanelShell title="EXTERIOR LIGHTS · P5">
        {/* Landing */}
        <div className="flex flex-wrap items-start justify-center gap-3">
          <ThreePos
            label="LDG L RETR"
            value={s.ltRetL}
            options={[
              { id: "RETRACT", label: "RETR" },
              { id: "EXT", label: "EXT" },
              { id: "ON", label: "ON" },
            ]}
            onChange={(id) => s.patch({ ltRetL: id as typeof s.ltRetL })}
          />
          <ThreePos
            label="LDG R RETR"
            value={s.ltRetR}
            options={[
              { id: "RETRACT", label: "RETR" },
              { id: "EXT", label: "EXT" },
              { id: "ON", label: "ON" },
            ]}
            onChange={(id) => s.patch({ ltRetR: id as typeof s.ltRetR })}
          />
          <VertRocker label="FIXED L" on={s.ltFixedL} onToggle={() => s.patch({ ltFixedL: !s.ltFixedL })} lit={lit("ldg-fix-l")} />
          <VertRocker label="FIXED R" on={s.ltFixedR} onToggle={() => s.patch({ ltFixedR: !s.ltFixedR })} lit={lit("ldg-fix-r")} />
        </div>

        {/* Taxi / wing / logo */}
        <div className="mt-3 flex flex-wrap items-start justify-center gap-2 border-t border-[#1e201c]/70 pt-2">
          <VertRocker label="RWY L" on={s.ltTurnoffL} onToggle={() => s.patch({ ltTurnoffL: !s.ltTurnoffL })} lit={lit("rwy-l")} />
          <VertRocker label="RWY R" on={s.ltTurnoffR} onToggle={() => s.patch({ ltTurnoffR: !s.ltTurnoffR })} lit={lit("rwy-r")} />
          <VertRocker label="TAXI" on={s.ltTaxi} onToggle={() => s.patch({ ltTaxi: !s.ltTaxi })} lit={lit("taxi")} />
          <VertRocker label="WING" on={s.ltWing} onToggle={() => s.patch({ ltWing: !s.ltWing })} lit={lit("wing")} />
          <VertRocker label="LOGO" on={s.ltLogo} onToggle={() => s.patch({ ltLogo: !s.ltLogo })} lit={lit("logo")} />
          <VertRocker label="WHEEL WELL" on={s.ltWheelWell} onToggle={() => s.patch({ ltWheelWell: !s.ltWheelWell })} lit={lit("wheelwell")} />
        </div>

        {/* Beacon + Position */}
        <div className="mt-3 flex flex-wrap items-start justify-center gap-4 border-t border-[#1e201c]/70 pt-2">
          <VertRocker
            label="ANTI COLL"
            on={s.ltAntiCol}
            onToggle={() => s.patch({ ltAntiCol: !s.ltAntiCol })}
            lit={lit("beacon-top") || lit("beacon-bot")}
          />
          <ThreePos
            label="POSITION"
            value={s.ltPosition}
            options={[
              { id: "OFF", label: "OFF" },
              { id: "STEADY", label: "STEADY" },
              { id: "STROBE_STEADY", label: "STRB+S" },
            ]}
            onChange={(id) => s.patch({ ltPosition: id as typeof s.ltPosition })}
          />
        </div>
      </PanelShell>

      {/* ========== FLIGHT DECK ========== */}
      <PanelShell title="FLIGHT DECK LIGHTING · P5">
        <div className="flex flex-wrap items-start justify-center gap-3">
          <ThreePos
            label="DOME"
            value={s.ltDome}
            options={[
              { id: "BRT", label: "BRT" },
              { id: "DIM", label: "DIM" },
              { id: "OFF", label: "OFF" },
            ]}
            onChange={(id) => s.patch({ ltDome: id as typeof s.ltDome })}
          />
          <VertRocker
            label="MASTER DIM"
            on={s.ltMasterDim === "DIM"}
            onToggle={() => s.patch({ ltMasterDim: s.ltMasterDim === "DIM" ? "BRT" : "DIM" })}
            onLabel="DIM"
            offLabel="BRT"
          />
          <VertRocker
            label="ANNUN TEST"
            on={s.ltTest}
            onToggle={() => s.patch({ ltTest: !s.ltTest })}
            lit={!!test}
            onLabel="TEST"
            offLabel="OFF"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-start justify-center gap-2 border-t border-[#1e201c]/70 pt-2">
          <VertRocker label="MAP L" on={s.ltMapCapt} onToggle={() => s.patch({ ltMapCapt: !s.ltMapCapt })} lit={lit("map-capt")} />
          <VertRocker label="MAP R" on={s.ltMapFo} onToggle={() => s.patch({ ltMapFo: !s.ltMapFo })} lit={lit("map-fo")} />
          <VertRocker label="STORM" on={s.ltStorm} onToggle={() => s.patch({ ltStorm: !s.ltStorm })} lit={lit("storm")} />
          <VertRocker label="COMPASS" on={s.ltCompass} onToggle={() => s.patch({ ltCompass: !s.ltCompass })} lit={lit("compass")} />
          <VertRocker label="OBSERVER" on={s.ltObserver} onToggle={() => s.patch({ ltObserver: !s.ltObserver })} lit={lit("observer")} />
          <VertRocker label="LTSHIELD EMER" on={s.ltShieldEmer} onToggle={() => s.patch({ ltShieldEmer: !s.ltShieldEmer })} lit={lit("shield-emer")} />
        </div>

        {/* Panel brightness */}
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[#1e201c]/70 pt-2 sm:grid-cols-4">
          {(
            [
              ["OVHD", "ltPanelOvhd"],
              ["CAPT", "ltPanelCapt"],
              ["F/O", "ltPanelFo"],
              ["PED", "ltPanelPed"],
            ] as const
          ).map(([label, key]) => {
            const val = Number((s as unknown as Record<string, number>)[key] ?? 0);
            return (
              <button
                key={key}
                type="button"
                className="rounded border border-[#3a3d38] bg-[#1c1e1a] px-2 py-1 font-mono text-[7px] text-[#c8c0a8] hover:bg-[#2a2c28]"
                onClick={() => {
                  const next = val >= 0.95 ? 0 : Math.min(1, val + 0.25);
                  s.patch({ [key]: next } as never);
                }}
              >
                {label} {Math.round(val * 100)}%
              </button>
            );
          })}
        </div>
      </PanelShell>

      {/* ========== SIGNS / EMERGENCY ========== */}
      <PanelShell title="SIGNS / EMERGENCY · P5">
        <div className="flex flex-wrap items-start justify-center gap-4">
          <ThreePos
            label="NO SMOKING"
            value={s.ltNoSmoking}
            options={[
              { id: "ON", label: "ON" },
              { id: "AUTO", label: "AUTO" },
              { id: "OFF", label: "OFF" },
            ]}
            onChange={(id) => s.patch({ ltNoSmoking: id as typeof s.ltNoSmoking })}
          />
          <ThreePos
            label="SEAT BELTS"
            value={s.ltSeatBelt}
            options={[
              { id: "ON", label: "ON" },
              { id: "AUTO", label: "AUTO" },
              { id: "OFF", label: "OFF" },
            ]}
            onChange={(id) => s.patch({ ltSeatBelt: id as typeof s.ltSeatBelt })}
          />
          <ThreePos
            label="EMER LIGHTS"
            value={s.ltEmergency}
            options={[
              { id: "ON", label: "ON" },
              { id: "ARMED", label: "ARMED" },
              { id: "OFF", label: "OFF" },
            ]}
            onChange={(id) =>
              s.patch({ ltEmergency: id as typeof s.ltEmergency }, `EMER LIGHTS ${id}`)
            }
          />
        </div>

        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <CapLight label="NO SMOKING" on={lit("sign-ns")} tone="caution" />
          <CapLight label="FASTEN BELTS" on={lit("sign-sb")} tone="caution" />
          <CapLight label="EMER LTS ON" on={lit("emer-aisle")} tone="ok" />
        </div>

        <button
          type="button"
          onClick={() => s.patch({ ...lightsControlsInitial })}
          className="mt-3 w-full rounded border border-[#3a3d38] bg-[#1c1e1a] px-2 py-1.5 font-mono text-[7px] uppercase tracking-wide text-[#c8c0a8] hover:bg-[#2a2c28]"
        >
          All lights switches off
        </button>
      </PanelShell>
    </div>
  );
}

