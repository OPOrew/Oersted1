/**
 * Realistic 737-200 Flight Controls panel (P5-3 overhead)
 * Photo-matched style: dark gray-green panel, guarded rockers,
 * alternate flaps, flap lever / speed brake selectors.
 * Note: FLT CTRL A/B and SPOILER A/B also appear on the Hydraulic panel;
 * they are included here for a self-contained view.
 * Wired to existing sim state.
 */

import { useSimPick, useDerivedPick } from "@/lib/sim/store";
import type { AltFlapSwitch, SpeedBrake } from "@/lib/sim/types";
import { cn } from "@/lib/utils";
import { OnOffToggle, RotaryKnob, ToggleLever } from "./OverheadParts";

/* ------------------------------------------------------------------ */
/*  Shared primitives                                                 */
/* ------------------------------------------------------------------ */

function CapLight({
  label,
  on,
  tone = "ok",
}: {
  label: string;
  on: boolean;
  tone?: "caution" | "ok" | "warn" | "elec";
}) {
  const colors = {
    caution: on ? "bg-amber-400 text-black shadow-[0_0_8px_#fbbf24]" : "bg-[#2a2410] text-[#5a5030]",
    ok: on ? "bg-green-400 text-black shadow-[0_0_8px_#4ade80]" : "bg-[#0f2a14] text-[#2a5a30]",
    warn: on ? "bg-red-500 text-white shadow-[0_0_8px_#ef4444]" : "bg-[#2a1010] text-[#5a2020]",
    elec: on ? "bg-blue-400 text-black shadow-[0_0_8px_#60a5fa]" : "bg-[#0f1a2a] text-[#2a3a5a]",
  };
  return (
    <div
      className={cn(
        "min-w-[56px] rounded-[2px] border border-[#1a1a18] px-1.5 py-1 text-center font-mono text-[7px] font-bold uppercase leading-tight tracking-wide transition-all",
        colors[tone],
      )}
    >
      {label}
    </div>
  );
}

function GuardedRocker({
  label,
  on,
  onToggle,
  lit,
  onLabel = "ON",
  offLabel = "OFF",
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
  lit?: boolean;
  onLabel?: string;
  offLabel?: string;
}) {
  return (
    <OnOffToggle label={label} on={on} onToggle={onToggle} lit={lit} litTone="green" onLabel={onLabel} offLabel={offLabel} guarded />
  );
}

/** 3-position selector: a toggle lever for up to 3 positions, a rotary knob for more. */
function RealisticThreePos({
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

/** Multi-position selector that looks like a rotary gate (flap lever style) */
function FlapSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const positions = [0, 1, 2, 5, 10, 15, 25, 30, 40];
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="font-mono text-[8px] uppercase tracking-wider text-[#c8c0a8]">
        FLAP LEVER
      </span>
      <div className="flex flex-wrap justify-center gap-1 rounded border border-[#1e201c] bg-[#1c1e1a] p-1.5">
        {positions.map((p) => {
          const active = value === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              className={cn(
                "min-w-[28px] rounded px-1.5 py-1 font-mono text-[8px] font-bold transition-colors",
                active
                  ? "bg-gradient-to-b from-[#8a8a80] to-[#4a4a44] text-[#f0ebe0] border border-[#555]"
                  : "text-[#6a6558] hover:text-[#c8c0a8]",
              )}
            >
              {p === 0 ? "UP" : p}
            </button>
          );
        })}
      </div>
      <span className="font-mono text-[8px] text-amber-300/90">
        {value === 0 ? "UP" : value}
      </span>
    </div>
  );
}

function SpeedBrakeSelector({
  value,
  onChange,
}: {
  value: SpeedBrake;
  onChange: (v: SpeedBrake) => void;
}) {
  const opts: { id: SpeedBrake; label: string }[] = [
    { id: "DOWN", label: "DOWN" },
    { id: "ARMED", label: "ARM" },
    { id: "FLIGHT", label: "FLIGHT" },
    { id: "UP", label: "UP" },
  ];
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="font-mono text-[8px] uppercase tracking-wider text-[#c8c0a8]">
        SPEED BRAKE
      </span>
      <div className="flex flex-wrap justify-center gap-1 rounded border border-[#1e201c] bg-[#1c1e1a] p-1.5">
        {opts.map((o) => {
          const active = value === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange(o.id)}
              className={cn(
                "min-w-[40px] rounded px-1.5 py-1 font-mono text-[8px] font-bold transition-colors",
                active
                  ? "bg-gradient-to-b from-[#8a8a80] to-[#4a4a44] text-[#f0ebe0] border border-[#555]"
                  : "text-[#6a6558] hover:text-[#c8c0a8]",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      <span className="font-mono text-[8px] text-amber-300/90">{value}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Flight Controls panel                                        */
/* ------------------------------------------------------------------ */

export function RealisticFlightControlsPanel({
  noPedestal = false,
}: {
  /** Hide flap lever + speed brake (they live on the centre control stand) */
  noPedestal?: boolean;
}) {
  const s = useSimPick("altFlapsArm", "altFlapsControl", "flaps", "fltCtrlA", "fltCtrlB", "patch", "speedBrake", "spoilerA", "spoilerB");
  const d = useDerivedPick("alternateFlapArmed", "alternateFlapDrivePowered", "flightControlAAvailable", "flightControlBAvailable", "speedBrakeArmed", "teFlapHydraulicDriveAvailable");

  return (
    <div
      className="relative w-full min-w-0 max-w-full overflow-x-auto overflow-y-hidden rounded-md border-2 border-[#1a1c18] shadow-xl panel-scroll" data-panel-scroll data-keep-cols
      style={{
        background: "linear-gradient(180deg, #3e413b 0%, #32352f 40%, #2a2c28 100%)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      <div className="relative border-b border-[#1e201c] bg-[#2e312c]/80 px-3 py-1.5">
        <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-[#e0d8c0]">
          FLIGHT CONTROLS · P5-3
        </h2>
      </div>

      <div className="relative space-y-4 px-4 py-4">
        {/* ---- FLT CTRL + Spoilers (guarded) ---- */}
        <div className="flex flex-wrap items-start justify-center gap-4">
          <GuardedRocker
            label="FLT CTRL A"
            on={s.fltCtrlA}
            onToggle={() => s.patch({ fltCtrlA: !s.fltCtrlA })}
            lit={!!d.flightControlAAvailable}
          />
          <GuardedRocker
            label="FLT CTRL B"
            on={s.fltCtrlB}
            onToggle={() => s.patch({ fltCtrlB: !s.fltCtrlB })}
            lit={!!d.flightControlBAvailable}
          />
          <GuardedRocker
            label="SPOILER A"
            on={s.spoilerA}
            onToggle={() => s.patch({ spoilerA: !s.spoilerA })}
            lit={!!d.flightControlAAvailable && s.spoilerA}
          />
          <GuardedRocker
            label="SPOILER B"
            on={s.spoilerB}
            onToggle={() => s.patch({ spoilerB: !s.spoilerB })}
            lit={!!d.flightControlBAvailable && s.spoilerB}
          />
        </div>

        {/* ---- Alternate flaps ---- */}
        <div className="flex flex-wrap items-start justify-center gap-4 border-t border-[#1e201c]/80 pt-3">
          <GuardedRocker
            label="ALT FLAPS"
            on={s.altFlapsArm}
            onToggle={() =>
              s.patch(
                {
                  altFlapsArm: !s.altFlapsArm,
                  altFlapsControl: !s.altFlapsArm ? s.altFlapsControl : "OFF",
                },
                !s.altFlapsArm
                  ? "ALTERNATE FLAPS ARM — TE bypass valve moves to bypass and standby hydraulic is available."
                  : "ALTERNATE FLAPS OFF — TE hydraulic motor path restored if serviceable.",
              )
            }
            lit={!!d.alternateFlapArmed}
            onLabel="ARM"
            offLabel="OFF"
          />
          <RealisticThreePos
            label="ALT FLAP POS"
            value={s.altFlapsControl}
            options={[
              { id: "UP", label: "UP" },
              { id: "OFF", label: "OFF" },
              { id: "DN", label: "DN" },
            ]}
            onChange={(id) => {
              const next = id as AltFlapSwitch;
              if (!s.altFlapsArm && next !== "OFF") {
                s.patch({}, "ALTERNATE FLAPS control inhibited — ARM switch first.");
                return;
              }
              s.patch({ altFlapsControl: next }, `ALT FLAPS position ${next}`);
            }}
          />
        </div>

        {/* ---- Flap lever + Speed brake (optional pedestal controls) ---- */}
        {!noPedestal && (
          <div className="flex flex-wrap items-start justify-center gap-6 border-t border-[#1e201c]/80 pt-3">
            <FlapSelector
              value={Number(s.flaps ?? 0)}
              onChange={(n) =>
                s.patch({ flaps: n }, `FLAP LEVER ${n === 0 ? "UP" : n}`)
              }
            />
            <SpeedBrakeSelector
              value={s.speedBrake}
              onChange={(id) =>
                s.patch({ speedBrake: id }, `SPEED BRAKE ${id}`)
              }
            />
          </div>
        )}

        {/* ---- Status ---- */}
        <div className="flex flex-wrap justify-center gap-2 border-t border-[#1e201c]/80 pt-3">
          <CapLight label="SYS A" on={!!d.flightControlAAvailable} tone="ok" />
          <CapLight label="SYS B" on={!!d.flightControlBAvailable} tone="ok" />
          <CapLight label="TE HYD" on={!!d.teFlapHydraulicDriveAvailable} tone="ok" />
          <CapLight label="ALT FLAP" on={!!d.alternateFlapArmed} tone="elec" />
          <CapLight label="ALT MOTOR" on={!!d.alternateFlapDrivePowered} tone="ok" />
          <CapLight label="SPD BRK ARM" on={!!d.speedBrakeArmed} tone="ok" />
        </div>

        <div className="rounded border border-[#1e201c] bg-[#1c1e1a]/80 px-3 py-2 font-mono text-[8px] uppercase tracking-wide text-[#a09880]">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span>
              TE NORMAL HYD:{" "}
              <span className={d.teFlapHydraulicDriveAvailable ? "text-green-400" : "text-[#5a5548]"}>
                {d.teFlapHydraulicDriveAvailable ? "SYSTEM A AVAILABLE" : "UNAVAILABLE"}
              </span>
            </span>
            <span>
              TE BYPASS:{" "}
              <span className={d.alternateFlapArmed ? "text-blue-400" : "text-[#5a5548]"}>
                {d.alternateFlapArmed ? "BYPASS" : "NORMAL"}
              </span>
            </span>
            <span>
              TE ALT MOTOR:{" "}
              <span className={d.alternateFlapDrivePowered ? "text-green-400" : "text-[#5a5548]"}>
                {d.alternateFlapDrivePowered ? "POWERED" : "OFF"}
              </span>
            </span>
          </div>
        </div>
      </div>

      <div className="border-t border-[#1e201c] bg-[#252722]/60 px-3 py-1.5">
        <p className="font-mono text-[7px] leading-relaxed text-[#8a8578]">
          737-200 · Flight controls P5-3 · FLT CTRL A/B · Spoilers · Alternate flaps · Flap lever · Speed brake
        </p>
      </div>
    </div>
  );
}
