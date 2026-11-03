/** Shared building blocks for the realistic 737-200 overhead panels. */
import { useEffect, useId, useRef, useState, type ReactNode, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";

export function PanelShell({
  title,
  children,
  maxWidth = 440,
}: {
  title: string;
  children: ReactNode;
  maxWidth?: number;
}) {
  return (
    <div
      data-panel-scroll
      className="panel-scroll relative w-full min-w-0 max-w-full overflow-x-auto overflow-y-hidden rounded-md border-2 border-[#1a1c18] shadow-xl"
      style={{
        background: "linear-gradient(180deg, #3e413b 0%, #32352f 45%, #2a2c28 100%)",
        maxWidth: "min(100%, " + String(maxWidth) + "px)",
      }}
    >
      <div className="relative border-b border-[#1e201c] bg-[#2e312c]/90 px-2 py-1 sm:px-3">
        <h2 className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#e0d8c0]">
          {title}
        </h2>
      </div>
      <div className="relative min-w-0 px-2 py-2 sm:px-3 sm:py-3" data-keep-cols>{children}</div>
    </div>
  );
}

type Tone = "caution" | "ok" | "warn" | "blue" | "white";
export function Cap({ label, on, tone = "caution" }: { label: string; on: boolean; tone?: Tone }) {
  const c: Record<Tone, string> = {
    caution: on ? "bg-amber-400 text-black shadow-[0_0_6px_#fbbf24]" : "bg-[#2a2410] text-[#5a5030]",
    ok: on ? "bg-green-400 text-black shadow-[0_0_6px_#4ade80]" : "bg-[#0f2a14] text-[#2a5a30]",
    warn: on ? "bg-red-500 text-white shadow-[0_0_6px_#ef4444]" : "bg-[#2a1010] text-[#5a2020]",
    blue: on ? "bg-sky-400 text-black shadow-[0_0_6px_#38bdf8]" : "bg-[#0f1a2a] text-[#2a3a5a]",
    white: on ? "bg-stone-100 text-black shadow-[0_0_6px_#fff]" : "bg-[#2a2a28] text-[#5a5850]",
  };
  return (
    <div
      className={cn(
        "min-w-[52px] rounded-[2px] border border-[#1a1a18] px-1 py-0.5 text-center font-mono text-[6px] font-bold uppercase leading-tight tracking-wide whitespace-pre-line",
        c[tone],
      )}
    >
      {label}
    </div>
  );
}

/** Round analog gauge, needle sweeps min..max over a 270° arc (-135..+135). */
export function RoundGauge({
  label,
  value,
  min,
  max,
  ticks = 6,
  unit,
  size = 64,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  ticks?: number;
  unit?: string;
  size?: number;
}) {
  const f = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
  const ang = -135 + f * 270;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`${label} ${Math.round(value)}${unit ?? ""}`}>
        <circle cx="50" cy="50" r="47" fill="#0c0c0b" stroke="#1a1a18" strokeWidth="3" />
        {Array.from({ length: ticks }).map((_, i) => {
          const a = ((-135 + (i / (ticks - 1)) * 270) * Math.PI) / 180;
          const x1 = 50 + Math.sin(a) * 38;
          const y1 = 50 - Math.cos(a) * 38;
          const x2 = 50 + Math.sin(a) * 44;
          const y2 = 50 - Math.cos(a) * 44;
          const tx = 50 + Math.sin(a) * 30;
          const ty = 50 - Math.cos(a) * 30 + 2;
          const v = min + (i / (ticks - 1)) * (max - min);
          return (
            <g key={i}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#d8d0b8" strokeWidth="1.6" />
              <text x={tx} y={ty} fontSize="8" fill="#d8d0b8" textAnchor="middle" fontFamily="monospace">
                {Math.round(v)}
              </text>
            </g>
          );
        })}
        <text x="50" y="68" fontSize="9" fill="#d8d0b8" textAnchor="middle" fontFamily="monospace">
          {label}
        </text>
        <g style={{ transform: `rotate(${ang}deg)`, transformOrigin: "50px 50px", transition: "transform 0.4s ease-out" }}>
          <line x1="50" y1="50" x2="50" y2="14" stroke="#f4efe0" strokeWidth="2.2" strokeLinecap="round" />
        </g>
        <circle cx="50" cy="50" r="4" fill="#2a2a28" stroke="#6a6558" />
      </svg>
      <span className="font-mono text-[6px] text-[#b0a890]">
        {Math.round(value * 10) / 10}
        {unit ? ` ${unit}` : ""}
      </span>
    </div>
  );
}

/** Momentary push button; calls onPress on down and onRelease on up. */
export function PushButton({
  label,
  onDown,
  onUp,
}: {
  label: string;
  onDown: () => void;
  onUp: () => void;
}) {
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        onDown();
      }}
      onPointerUp={onUp}
      onPointerLeave={onUp}
      onPointerCancel={onUp}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
      className="flex select-none flex-col items-center gap-0.5 panel-interactive"
      style={{ touchAction: "none", WebkitTouchCallout: "none" as never }}
    >
      <span className="font-mono text-[6px] uppercase text-[#c8c0a8]">{label}</span>
      <span className="h-5 w-5 rounded-full border border-[#111] bg-[radial-gradient(circle_at_35%_30%,#777,#222)] shadow-inner active:translate-y-px" />
    </button>
  );
}


/* ------------------------------------------------------------------ */
/*  Realistic controls (SVG — centred by construction)                 */
/* ------------------------------------------------------------------ */

const uid = (raw: string) => raw.replace(/[^a-zA-Z0-9]/g, "");
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export type SwitchPos = { id: string; label: string };
type LitTone = "green" | "amber" | "blue" | "red";
const LED: Record<LitTone, string> = { green: "#4ade80", amber: "#fbbf24", blue: "#60a5fa", red: "#f87171" };
const CAP_TONE: Record<LitTone, string> = {
  green: "text-green-300",
  amber: "text-amber-300",
  blue: "text-blue-300",
  red: "text-red-300",
};

/**
 * Real toggle switch: a metal lever on a collar that tilts toward the selected end
 * (2 positions) or sits upright in the middle (3 positions).
 * options[0] is the TOP (or LEFT when horizontal) position, the last option is the opposite end.
 * Tap above / below the pivot (left / right when horizontal) to throw the lever.
 * `guarded` shows a red guard that must be lifted first (tap once to lift, tap the guard strip to close).
 */
export function ToggleLever({
  label,
  options,
  value,
  onChange,
  lit,
  litTone = "green",
  guarded = false,
  disabled = false,
  horizontal = false,
  scale = 1,
  showCaption = true,
}: {
  label?: string;
  options: SwitchPos[];
  value: string;
  onChange: (id: string) => void;
  lit?: boolean;
  litTone?: LitTone;
  guarded?: boolean;
  disabled?: boolean;
  horizontal?: boolean;
  scale?: number;
  showCaption?: boolean;
}) {
  const gid = uid(useId());
  const [guardOpen, setGuardOpen] = useState(false);
  const n = options.length;
  const idx = Math.max(0, options.findIndex((o) => o.id === value));
  const pose: "a" | "c" | "b" = n === 2 ? (idx === 0 ? "a" : "b") : idx === 0 ? "a" : idx === n - 1 ? "b" : "c";
  const cx = 50;
  const cy = 47;

  const throwTo = (e: MouseEvent<SVGSVGElement>) => {
    if (disabled) return;
    const r = e.currentTarget.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * 100;
    const vy = ((e.clientY - r.top) / r.height) * 90;
    const along = horizontal ? vx : vy;
    if (guarded) {
      if (guardOpen && along < 11) return setGuardOpen(false);
      if (!guardOpen) return setGuardOpen(true);
    }
    const toFirst = along < (horizontal ? 50 : cy);
    const next = n === 2 ? (toFirst ? 0 : 1) : clamp(idx + (toFirst ? -1 : 1), 0, n - 1);
    if (next !== idx) onChange(options[next].id);
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (disabled) return;
    const back = e.key === "ArrowUp" || e.key === "ArrowLeft";
    const fwd = e.key === "ArrowDown" || e.key === "ArrowRight";
    if (!back && !fwd) return;
    e.preventDefault();
    if (guarded && !guardOpen) return setGuardOpen(true);
    const next = n === 2 ? (back ? 0 : 1) : clamp(idx + (back ? -1 : 1), 0, n - 1);
    if (next !== idx) onChange(options[next].id);
  };

  const fade = { transition: "opacity 140ms ease-out" } as const;
  const labelPos = (i: number) => {
    const f = n === 1 ? 0.5 : i / (n - 1);
    return horizontal ? { x: 20 + f * 60, y: 82, anchor: "middle" as const } : { x: 72, y: 27 + f * 50, anchor: "start" as const };
  };

  return (
    <div className={cn("flex select-none flex-col items-center gap-0.5", disabled && "opacity-40")}>
      {label ? (
        <span className="max-w-[84px] text-center font-mono text-[7px] uppercase leading-tight tracking-wider text-[#c8c0a8]">
          {label}
        </span>
      ) : null}
      <svg
        viewBox="0 0 100 90"
        width={64 * scale}
        height={57.6 * scale}
        role="switch"
        aria-checked={idx === 0}
        aria-label={`${label ?? "switch"} ${options[idx]?.label ?? ""}`}
        tabIndex={0}
        onClick={throwTo}
        onKeyDown={onKey}
        style={{ overflow: "visible", cursor: disabled ? "not-allowed" : "pointer", outline: "none" }}
      >
        <defs>
          <linearGradient id={`${gid}m`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#5a5c57" />
            <stop offset="0.45" stopColor="#c9cbc3" />
            <stop offset="1" stopColor="#6a6c66" />
          </linearGradient>
          <radialGradient id={`${gid}c`} cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stopColor="#b9bbb3" />
            <stop offset="1" stopColor="#4a4c47" />
          </radialGradient>
        </defs>
        <g transform={horizontal ? `rotate(-90 ${cx} ${cy})` : undefined}>
          <rect x="32" y="12" width="36" height="70" rx="5" fill="#222421" stroke="#0e0f0e" strokeWidth="1.5" />
          <circle cx={cx} cy={cy} r="12" fill={`url(#${gid}c)`} stroke="#0e0f0e" strokeWidth="1.5" />
          {/* lever: toward first end */}
          <g style={{ ...fade, opacity: pose === "a" ? 1 : 0 }}>
            <rect x="46.5" y="22" width="7" height="26" rx="3.5" fill={`url(#${gid}m)`} stroke="#0e0f0e" />
            <circle cx={cx} cy="22" r="6" fill="#d4d6ce" stroke="#0e0f0e" />
          </g>
          {/* lever: toward last end */}
          <g style={{ ...fade, opacity: pose === "b" ? 1 : 0 }}>
            <rect x="46.5" y="46" width="7" height="26" rx="3.5" fill={`url(#${gid}m)`} stroke="#0e0f0e" />
            <circle cx={cx} cy="72" r="6" fill="#d4d6ce" stroke="#0e0f0e" />
          </g>
          {/* lever: centre (pointing at the viewer) */}
          <g style={{ ...fade, opacity: pose === "c" ? 1 : 0 }}>
            <circle cx={cx} cy={cy} r="8" fill="#cfd1c9" stroke="#0e0f0e" />
            <circle cx={cx - 2} cy={cy - 2} r="2.5" fill="#f5f6f0" />
          </g>
          {guarded && (
            <>
              <rect
                x="35"
                y="20"
                width="30"
                height="54"
                rx="3"
                fill="#c0452a"
                stroke="#6a2412"
                strokeWidth="1.5"
                style={{ ...fade, opacity: guardOpen ? 0 : 0.88 }}
              />
              <rect
                x="35"
                y="2"
                width="30"
                height="8"
                rx="2"
                fill="#c0452a"
                stroke="#6a2412"
                strokeWidth="1.5"
                style={{ ...fade, opacity: guardOpen ? 1 : 0 }}
              />
            </>
          )}
        </g>
        {lit !== undefined && (
          <circle
            cx={horizontal ? cx : 22}
            cy={horizontal ? 70 : cy}
            r="3.5"
            fill={lit ? LED[litTone] : "#1c1e1a"}
            stroke="#0e0f0e"
            style={lit ? { filter: `drop-shadow(0 0 3px ${LED[litTone]})` } : undefined}
          />
        )}
        {options.map((o, i) => {
          const p = labelPos(i);
          return (
            <text
              key={o.id}
              x={p.x}
              y={p.y}
              textAnchor={p.anchor}
              fontSize="9"
              fontFamily="monospace"
              fontWeight="bold"
              fill={i === idx ? "#f0ebe0" : "#807b6c"}
            >
              {o.label}
            </text>
          );
        })}
      </svg>
      {showCaption && (
        <span className={cn("font-mono text-[6px] uppercase", lit ? CAP_TONE[litTone] : "text-[#777]")}>
          {options[idx]?.label}
        </span>
      )}
    </div>
  );
}

/** Convenience: 2-position ON/OFF toggle (ON = up). */
export function OnOffToggle({
  label,
  on,
  onToggle,
  lit,
  litTone,
  onLabel = "ON",
  offLabel = "OFF",
  disabled,
  guarded,
  horizontal,
  scale,
}: {
  label?: string;
  on: boolean;
  onToggle: () => void;
  lit?: boolean;
  litTone?: LitTone;
  onLabel?: string;
  offLabel?: string;
  disabled?: boolean;
  guarded?: boolean;
  horizontal?: boolean;
  scale?: number;
}) {
  return (
    <ToggleLever
      label={label}
      options={[
        { id: "on", label: onLabel },
        { id: "off", label: offLabel },
      ]}
      value={on ? "on" : "off"}
      onChange={() => onToggle()}
      lit={lit}
      litTone={litTone}
      disabled={disabled}
      guarded={guarded}
      horizontal={horizontal}
      scale={scale}
    />
  );
}

export type KnobOpt<T extends string> = { id: T; label: string; angle?: number };

function spreadAngles(n: number): number[] {
  if (n === 1) return [0];
  const step = n <= 2 ? 80 : Math.min(45, 240 / (n - 1));
  const span = step * (n - 1);
  return Array.from({ length: n }, (_, i) => -span / 2 + i * step);
}

function KnobBody({ gid, angle, tone }: { gid: string; angle: number; tone: "white" | "black" | "grey" }) {
  const face = tone === "white" ? "#efebe0" : tone === "grey" ? "#9a9c95" : "#2c2d2b";
  const mark = tone === "black" ? "#f0ebe0" : "#26262a";
  return (
    <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: "50px 50px", transition: "transform 200ms ease-out" }}>
      <polygon points="43,40 57,40 50,21" fill={face} stroke="#0e0f0e" strokeWidth="1" />
      <circle cx="50" cy="50" r="19" fill={`url(#${gid}k)`} stroke="#0e0f0e" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="14.5" fill={face} opacity="0.55" />
      <rect x="48.4" y="29" width="3.2" height="12" rx="1.2" fill={mark} />
    </g>
  );
}

function KnobDefs({ gid, tone }: { gid: string; tone: "white" | "black" | "grey" }) {
  const [a, b] =
    tone === "white" ? ["#fbf9f1", "#bdb9ab"] : tone === "grey" ? ["#c4c6bf", "#6c6e68"] : ["#4a4b48", "#151615"];
  return (
    <defs>
      <radialGradient id={`${gid}k`} cx="0.35" cy="0.3" r="0.85">
        <stop offset="0" stopColor={a} />
        <stop offset="1" stopColor={b} />
      </radialGradient>
    </defs>
  );
}

/**
 * Real rotary selector: dial with printed detent labels and a knob whose pointer turns to the selected detent.
 * Tap a label to jump to it, or tap the left / right half of the knob to turn it one detent.
 */
export function RotaryKnob<T extends string>({
  label,
  options,
  value,
  onChange,
  size = 80,
  tone = "white",
  showValue = true,
}: {
  label?: string;
  options: KnobOpt<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: number;
  tone?: "white" | "black" | "grey";
  showValue?: boolean;
}) {
  const gid = uid(useId());
  const n = options.length;
  const spread = spreadAngles(n);
  const ang = options.map((o, i) => o.angle ?? spread[i]);
  const idx = Math.max(0, options.findIndex((o) => o.id === value));
  const step = (dir: -1 | 1) => {
    const next = clamp(idx + dir, 0, n - 1);
    if (next !== idx) onChange(options[next].id);
  };
  const turn = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    step((e.clientX - r.left) / r.width < 0.5 ? -1 : 1);
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      step(-1);
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      step(1);
    }
  };

  return (
    <div className="flex select-none flex-col items-center gap-0.5">
      {label ? (
        <span className="max-w-[110px] text-center font-mono text-[7px] uppercase leading-tight tracking-wider text-[#c8c0a8]">
          {label}
        </span>
      ) : null}
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        role="slider"
        tabIndex={0}
        aria-label={`${label ?? "selector"} ${options[idx]?.label.replace("\n", " ") ?? ""}`}
        aria-valuemin={0}
        aria-valuemax={n - 1}
        aria-valuenow={idx}
        onClick={turn}
        onKeyDown={onKey}
        style={{ overflow: "visible", cursor: "pointer", outline: "none" }}
      >
        <KnobDefs gid={gid} tone={tone} />
        <circle cx="50" cy="50" r="47" fill="#1e201d" stroke="#0e0f0e" strokeWidth="1.5" />
        {options.map((o, i) => {
          const a = (ang[i] * Math.PI) / 180;
          const x1 = 50 + Math.sin(a) * 42;
          const y1 = 50 - Math.cos(a) * 42;
          const x2 = 50 + Math.sin(a) * 46;
          const y2 = 50 - Math.cos(a) * 46;
          return <line key={`t${o.id}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={i === idx ? "#f0ebe0" : "#6a6558"} strokeWidth="1.6" />;
        })}
        <KnobBody gid={gid} angle={ang[idx]} tone={tone} />
        {options.map((o, i) => {
          const a = (ang[i] * Math.PI) / 180;
          const lx = 50 + Math.sin(a) * 34;
          const ly = 50 - Math.cos(a) * 34;
          const lines = o.label.split("\n");
          return (
            <g
              key={o.id}
              onClick={(e) => {
                e.stopPropagation();
                onChange(o.id);
              }}
              style={{ cursor: "pointer" }}
            >
              <circle cx={lx} cy={ly} r="9" fill="transparent" />
              <text
                x={lx}
                y={ly - ((lines.length - 1) * 4) / 2 + 2.5}
                textAnchor="middle"
                fontSize="7.5"
                fontFamily="monospace"
                fontWeight="bold"
                fill={i === idx ? "#f0ebe0" : "#807b6c"}
              >
                {lines.map((ln, k) => (
                  <tspan key={k} x={lx} dy={k === 0 ? 0 : 8}>
                    {ln}
                  </tspan>
                ))}
              </text>
            </g>
          );
        })}
      </svg>
      {showValue && (
        <span className="font-mono text-[6px] uppercase text-amber-300/90">{options[idx]?.label.replace("\n", " ")}</span>
      )}
    </div>
  );
}

/**
 * Rotary knob for a continuous value with a digital window (FLT ALT, LAND ALT, cabin rate…).
 * Press and hold the right half to turn up, the left half to turn down.
 */
export function NumberKnob({
  label,
  value,
  min,
  max,
  step,
  onChange,
  fmt = (v) => String(v),
  size = 64,
  tone = "white",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  fmt?: (v: number) => string;
  size?: number;
  tone?: "white" | "black" | "grey";
}) {
  const gid = uid(useId());
  const valRef = useRef(value);
  valRef.current = value;
  const t1 = useRef<number | undefined>(undefined);
  const t2 = useRef<number | undefined>(undefined);
  const stop = () => {
    window.clearTimeout(t1.current);
    window.clearInterval(t2.current);
  };
  useEffect(() => stop, []);
  const nudge = (dir: -1 | 1) => onChange(clamp(valRef.current + dir * step, min, max));
  const down = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const dir: -1 | 1 = (e.clientX - r.left) / r.width < 0.5 ? -1 : 1;
    stop();
    nudge(dir);
    t1.current = window.setTimeout(() => {
      t2.current = window.setInterval(() => nudge(dir), 90);
    }, 350);
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      nudge(-1);
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      nudge(1);
    }
  };
  const f = clamp((value - min) / (max - min || 1), 0, 1);
  const angle = -135 + f * 270;
  return (
    <div className="flex select-none flex-col items-center gap-0.5">
      <span className="text-center font-mono text-[7px] uppercase tracking-wider text-[#c8c0a8]">{label}</span>
      <div className="min-w-[44px] rounded-[2px] border border-[#111] bg-black px-1.5 py-0.5 text-center font-mono text-[10px] text-amber-300">
        {fmt(value)}
      </div>
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        onPointerDown={down}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onKeyDown={onKey}
        style={{ overflow: "visible", cursor: "pointer", outline: "none", touchAction: "none" }}
      >
        <KnobDefs gid={gid} tone={tone} />
        <circle cx="50" cy="50" r="47" fill="#1e201d" stroke="#0e0f0e" strokeWidth="1.5" />
        {Array.from({ length: 11 }).map((_, i) => {
          const a = ((-135 + (i / 10) * 270) * Math.PI) / 180;
          return (
            <line
              key={i}
              x1={50 + Math.sin(a) * 38}
              y1={50 - Math.cos(a) * 38}
              x2={50 + Math.sin(a) * 45}
              y2={50 - Math.cos(a) * 45}
              stroke="#8a8578"
              strokeWidth={i % 5 === 0 ? 2 : 1}
            />
          );
        })}
        <KnobBody gid={gid} angle={angle} tone={tone} />
      </svg>
    </div>
  );
}
