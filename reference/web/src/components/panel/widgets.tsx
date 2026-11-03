import type { ReactNode } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function CaptionLight({
  label,
  on,
  tone = "caution",
  className,
}: {
  label: string;
  on: boolean;
  tone?: "caution" | "ok" | "warn" | "elec";
  className?: string;
}) {
  const lit = {
    caution: "bg-caution text-accent-fg shadow-[0_0_12px_rgba(224,168,74,0.55)]",
    ok: "bg-ok text-accent-fg shadow-[0_0_12px_rgba(61,214,140,0.45)]",
    warn: "bg-warn text-fg shadow-[0_0_14px_rgba(226,75,75,0.6)]",
    elec: "bg-elec text-accent-fg shadow-[0_0_12px_rgba(126,200,227,0.45)]",
  }[tone];
  return (
    <div
      className={cn(
        "flex min-h-8 min-w-[4.5rem] items-center justify-center rounded-[3px] border px-1.5 py-1 text-center font-display text-[10px] font-semibold leading-tight tracking-wide",
        on ? lit : "border-line bg-inset text-subtle/80",
        on ? "border-transparent" : "",
        className,
      )}
    >
      {label}
    </div>
  );
}

export function Rocker({
  label,
  on,
  onLabel = "ON",
  offLabel = "OFF",
  onChange,
  lit,
  disabled = false,
}: {
  label: string;
  on: boolean;
  onLabel?: string;
  offLabel?: string;
  onChange: (v: boolean) => void;
  lit?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="flex w-[4.6rem] flex-col items-center gap-1.5">
      <span className="font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
        {label}
      </span>
      <button
        type="button"
        aria-pressed={on}
        onClick={() => onChange(!on)}
        disabled={disabled}
        className={cn("relative h-14 w-11 rounded-[4px] border border-[#4c535c] bg-[#101318] p-0.5 shadow-[inset_0_2px_5px_rgba(0,0,0,.8),0_2px_4px_rgba(0,0,0,.35)]", disabled && "cursor-default opacity-60")}
      >
        <span className="absolute left-1 top-1 font-mono text-[6px] text-[#7e8791]">{onLabel}</span>
        <span className="absolute left-1 bottom-1 font-mono text-[6px] text-[#59616b]">{offLabel}</span>
        <span className={cn("absolute left-1/2 z-10 h-8 w-[7px] -translate-x-1/2 rounded-full bg-gradient-to-r from-[#5b636c] via-[#d4d7da] to-[#535b64] shadow-[0_2px_3px_rgba(0,0,0,.75)] transition-transform duration-150", on ? "top-1 rotate-[18deg]" : "top-5 -rotate-[18deg]")} />
        <span className={cn("absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border", (lit ?? on) ? "border-ok/60 bg-ok/20" : "border-[#343a42] bg-[#15191e]")} />
      </button>
      <span
        className={cn(
          "size-1.5 rounded-full",
          (lit ?? on) ? "bg-ok glow-ok" : "bg-line",
        )}
      />
    </div>
  );
}


export function GuardedRocker({
  label,
  on,
  onChange,
  lit,
  onLabel = "ON",
  offLabel = "OFF",
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
  lit?: boolean;
  onLabel?: string;
  offLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex w-[5.2rem] flex-col items-center gap-1">
      <span className="font-display text-[9px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</span>
      <div className="relative h-[4.4rem] w-[3.2rem]">
        <button type="button" aria-label={`${label} guard`} onClick={() => setOpen(!open)}
          className={cn("absolute inset-x-1 top-0 z-20 h-5 rounded-t-md border border-[#7c838b] bg-[#59616a] text-[7px] font-bold uppercase tracking-wider text-[#171a1d] shadow-[inset_0_1px_0_rgba(255,255,255,.25),0_2px_3px_rgba(0,0,0,.5)]", open && "-translate-y-1")}>
          GUARD
        </button>
        <button type="button" aria-pressed={on} disabled={!open} onClick={() => onChange(!on)}
          className={cn("absolute left-2 top-3 h-12 w-11 rounded-sm border border-[#343a40] bg-[#111418] shadow-inner transition-opacity", !open && "opacity-55 cursor-not-allowed")}>
          <span className={cn("absolute left-2 right-2 h-5 rounded-[2px] border text-[8px] font-display font-bold tracking-wider transition-all", on ? "top-1 border-ok/50 bg-[#424a52] text-ok" : "top-6 border-border bg-[#252a30] text-subtle")}>{on ? onLabel : offLabel}</span>
        </button>
      </div>
      <span className={cn("size-1.5 rounded-full", (lit ?? on) ? "bg-ok glow-ok" : "bg-line")} />
    </div>
  );
}

export function ThreePos({
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
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
        {label}
      </span>
      <div className="flex flex-col overflow-hidden rounded-sm border border-line bg-inset">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={cn(
              "min-w-[4.4rem] px-2 py-1.5 font-display text-[10px] font-semibold tracking-wider",
              value === opt.id ? "bg-fg text-accent-fg" : "text-muted hover:text-fg",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ThreeToggle({
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
  return (
    <div className="flex w-[5.4rem] flex-col items-center gap-1.5">
      <span className="font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</span>
      <div className="relative h-16 w-11 rounded-md border border-[#4d5560] bg-[#15191f] shadow-[inset_0_2px_5px_rgba(0,0,0,0.7),0_2px_4px_rgba(0,0,0,0.45)]">
        <div className="absolute left-1/2 top-1 bottom-1 w-[3px] -translate-x-1/2 rounded-full bg-[#090b0e]" />
        {options.map((opt, i) => {
          const y = 10 + i * (44 / Math.max(1, options.length - 1));
          const active = value === opt.id;
          return (
            <button key={opt.id} type="button" aria-label={`${label} ${opt.label}`} aria-pressed={active}
              onClick={() => onChange(opt.id)} className="absolute left-1/2 z-10 -translate-x-1/2"
              style={{ top: `${y}px` }}>
              <span className={cn("block h-3 w-3 rounded-full border", active ? "border-fg bg-[#c8ccd0] shadow-[0_0_5px_rgba(255,255,255,0.25)]" : "border-line bg-[#343b44]")} />
            </button>
          );
        })}
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 h-9 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-[#70777e] via-[#d1d3d5] to-[#666d73] shadow-[0_2px_3px_rgba(0,0,0,0.65)]" style={{ transform: `translate(-50%, -50%) rotate(${Math.max(-28, Math.min(28, (options.findIndex(o => o.id === value) - 1) * 28))}deg)` }} />
      </div>
      <span className="font-mono text-[9px] uppercase tracking-wider text-subtle">{options.find(o => o.id === value)?.label ?? value}</span>
    </div>
  );
}

export function Rotary({
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
  const idx = Math.max(0, options.findIndex((o) => o.id === value));
  const count = Math.max(1, options.length - 1);
  const angle = -55 + (idx / count) * 110;

  return (
    <div className="flex w-[6.4rem] flex-col items-center gap-1.5">
      <span className="font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
        {label}
      </span>
      <div className="relative h-[5.8rem] w-[6.4rem]">
        <div className="absolute left-1/2 top-1/2 size-[4.5rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-line bg-[#0b0d10] shadow-[inset_0_2px_5px_rgba(255,255,255,0.04),inset_0_-4px_8px_rgba(0,0,0,0.8),0_2px_5px_rgba(0,0,0,0.45)]" />
        <div className="absolute left-1/2 top-1/2 size-[3.45rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#4a5260] bg-[radial-gradient(circle_at_35%_28%,#586170_0%,#303744_32%,#1b2029_72%,#11151b_100%)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.18),inset_0_-4px_8px_rgba(0,0,0,0.55),0_2px_3px_rgba(0,0,0,0.65)] transition-transform duration-150" style={{ transform: `translate(-50%, -50%) rotate(${angle}deg)` }}>
          <span className="absolute left-1/2 top-[5px] h-[1.05rem] w-[3px] -translate-x-1/2 rounded-full bg-[#e7e2d6] shadow-[0_0_3px_rgba(255,255,255,0.35)]" />
          <span className="absolute left-[9px] top-[9px] size-[5px] rounded-full bg-white/15" />
        </div>

        {options.map((opt, i) => {
          const a = -55 + (i / count) * 110;
          const rad = (a * Math.PI) / 180;
          const x = 50 + Math.sin(rad) * 43;
          const y = 50 - Math.cos(rad) * 43;
          return (
            <button
              key={opt.id}
              type="button"
              aria-label={`${label} ${opt.label}`}
              aria-pressed={value === opt.id}
              onClick={() => onChange(opt.id)}
              className={cn(
                "absolute -translate-x-1/2 -translate-y-1/2 rounded px-1 py-0.5 font-display text-[8px] font-bold tracking-wider transition-colors",
                value === opt.id ? "text-fg" : "text-muted hover:text-fg",
              )}
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <span className="font-mono text-[9px] uppercase tracking-wider text-subtle">{value}</span>
    </div>
  );
}

export function FireHandle({
  pulled,
  onToggle,
  onRotate,
  label,
}: {
  pulled: boolean;
  onToggle: () => void;
  onRotate?: (direction: "L" | "R") => void;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={onToggle}
        className="flex flex-col items-center gap-1"
        aria-pressed={pulled}
      >
        <span className="font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
          {label}
        </span>
        <span
          className={cn(
            "relative h-16 w-10 rounded-sm border transition-transform duration-200",
            pulled
              ? "translate-y-2 border-warn bg-warn text-fg"
              : "border-warn/50 bg-warn/80 text-fg",
          )}
        >
          <span className="absolute inset-x-1 top-1 h-2 rounded-sm bg-fg/30" />
          <span className="absolute inset-x-0 bottom-2 text-center font-display text-[9px] font-bold tracking-wider">
            FIRE
          </span>
        </span>
      </button>
      {pulled && onRotate && (
        <div className="grid grid-cols-2 gap-1">
          <button type="button" aria-label={`${label} rotate left bottle`} onClick={() => onRotate("L")} className="rounded border border-warn/50 bg-inset px-2 py-1 text-[8px] font-bold">L</button>
          <button type="button" aria-label={`${label} rotate right bottle`} onClick={() => onRotate("R")} className="rounded border border-warn/50 bg-inset px-2 py-1 text-[8px] font-bold">R</button>
        </div>
      )}
    </div>
  );
}

export function Tape({
  label,
  value,
  unit,
  max,
  tone = "ok",
}: {
  label: string;
  value: number;
  unit: string;
  max: number;
  tone?: "ok" | "caution" | "elec" | "hyd-a" | "hyd-b" | "pneumatic";
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const color = {
    ok: "bg-ok",
    caution: "bg-caution",
    elec: "bg-elec",
    "hyd-a": "bg-hyd-a",
    "hyd-b": "bg-hyd-b",
    pneumatic: "bg-pneumatic",
  }[tone];
  return (
    <div className="min-w-[4.8rem]">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
          {label}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-fg">
          {Math.round(value)}
          <span className="ml-0.5 text-subtle">{unit}</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-inset">
        <div className={cn("h-full rounded-full transition-[width] duration-200", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Module({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "relative min-w-0 self-start overflow-hidden rounded-[5px] border border-[#555d66] bg-[linear-gradient(180deg,#292e34,#1c2025)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.06),inset_0_-3px_7px_rgba(0,0,0,.35),0_3px_8px_rgba(0,0,0,.35)]",
        className,
      )}
    >
      <span className="pointer-events-none absolute left-1 top-1 size-1 rounded-full bg-[#777f87] shadow-[0_0_2px_rgba(255,255,255,.35)]" />
      <span className="pointer-events-none absolute right-1 top-1 size-1 rounded-full bg-[#777f87] shadow-[0_0_2px_rgba(255,255,255,.35)]" />
      <header className="mb-3 border-b border-[#505760] pb-2 font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-[#c5cbd1]">
        {title}
      </header>
      <div className="flex flex-wrap items-start justify-center gap-3">{children}</div>
    </section>
  );
}

export function ControlSlider({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}) {
  const safe = Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
  return (
    <label className="block rounded-md border border-border bg-inset p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-display text-[9px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</span>
        <output className="font-mono text-[9px] text-subtle">{safe.toFixed(2)}</output>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={safe}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--color-accent)] disabled:opacity-40"
      />
    </label>
  );
}
