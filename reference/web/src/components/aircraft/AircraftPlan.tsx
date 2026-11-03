import { useState } from "react";
import { PARTS, type Part } from "@/data/components";
import { SYSTEMS } from "@/data/systems";
import type { SystemId } from "@/lib/sim/types";
import { useSimPick, useDerivedPick } from "@/lib/sim/store";
import { cn } from "@/lib/utils";

const SYS_COLOR: Record<SystemId, string> = {
  apu: "var(--color-fuel)",
  powerplant: "var(--color-pneumatic)",
  hydraulics: "var(--color-hyd-a)",
  aircond: "var(--color-elec)",
  pneumatic: "var(--color-pneumatic)",
  antiice: "var(--color-pneumatic)",
  cabin: "var(--color-accent)",
  flightcontrols: "var(--color-hyd-b)",
  landinggear: "var(--color-ok)",
  fuel: "var(--color-fuel)",
  fire: "var(--color-warn)",
  electrical: "var(--color-elec)",
  navigation: "#71a8ff",
  lights: "#e9e2a4",
  oxygen: "#d4a5f5",
};

export function AircraftPlan({
  activeSystem,
  selectedId,
  onSelect,
  compact = false,
}: {
  activeSystem?: SystemId;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  compact?: boolean;
}) {
  const s = useSimPick("apuDoor", "bleed1", "bleed2", "flaps", "gearPos", "hydAPress", "hydBPress", "n2_1", "n2_2", "spoilerPos");
  const d = useDerivedPick("controlSurfaces", "ductPsi", "eng1Running", "eng2Running", "packLFlow", "packRFlow", "startValveOpen1", "startValveOpen2");
  const [hover, setHover] = useState<string | null>(null);

  const parts = activeSystem ? PARTS.filter((p) => p.system === activeSystem) : PARTS;
  const gearY = 18 * (1 - s.gearPos);
  const door = s.apuDoor;
  const flap = s.flaps / 40;
  const spoil = s.spoilerPos;
  const spoilL = d.controlSurfaces.spoilerL;
  const spoilR = d.controlSurfaces.spoilerR;

  return (
    <div className="relative">
      <svg
        viewBox="0 0 1200 520"
        className={cn("h-auto w-full", compact ? "max-h-[280px]" : "min-h-[220px] max-h-[560px]")}
        role="img"
        aria-label="Boeing 737-200 top-down systems layout"
      >
        <defs>
          <linearGradient id="fuse" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#3a414c" />
            <stop offset="45%" stopColor="#2a3038" />
            <stop offset="100%" stopColor="#1c2128" />
          </linearGradient>
          <linearGradient id="wing" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#4a5260" />
            <stop offset="100%" stopColor="#2c333d" />
          </linearGradient>
          <filter id="soft">
            <feDropShadow dx="0" dy="8" stdDeviation="6" floodColor="#000" floodOpacity="0.45" />
          </filter>
        </defs>

        <rect width="1200" height="520" fill="transparent" />

        {/* Hangar grid */}
        <g opacity="0.18" stroke="var(--color-line)" strokeWidth="0.6">
          {Array.from({ length: 24 }).map((_, i) => (
            <line key={`v${i}`} x1={i * 50} y1="0" x2={i * 50} y2="520" />
          ))}
          {Array.from({ length: 11 }).map((_, i) => (
            <line key={`h${i}`} x1="0" y1={i * 50} x2="1200" y2={i * 50} />
          ))}
        </g>

        {/* Bleed manifold */}
        <path
          d="M430 248 H980"
          fill="none"
          stroke="var(--color-pneumatic)"
          strokeWidth={d.ductPsi > 20 ? 4 : 2}
          opacity={d.ductPsi > 8 ? 0.9 : 0.25}
          className={d.ductPsi > 20 ? "flow-active" : undefined}
        />
        {/* Hyd A / B lines */}
        <path
          d="M500 210 H760"
          fill="none"
          stroke="var(--color-hyd-a)"
          strokeWidth={s.hydAPress > 1500 ? 3.5 : 2}
          opacity={s.hydAPress > 400 ? 0.95 : 0.22}
          className={s.hydAPress > 1500 ? "flow-active" : undefined}
        />
        <path
          d="M500 268 H760"
          fill="none"
          stroke="var(--color-hyd-b)"
          strokeWidth={s.hydBPress > 1500 ? 3.5 : 2}
          opacity={s.hydBPress > 400 ? 0.95 : 0.22}
          className={s.hydBPress > 1500 ? "flow-active" : undefined}
        />

        {/* Wings */}
        <g filter="url(#soft)">
          <path
            d="M430 248 L780 42 L860 58 L620 248 L860 438 L780 454 L430 248"
            fill="url(#wing)"
            stroke="#6a7382"
            strokeWidth="1.2"
          />
          {/* TE flaps */}
          <path
            d={`M640 198 L820 78 L840 ${78 + flap * 16} L650 ${210 + flap * 10} Z`}
            fill="#1a1f26"
            opacity={0.55 + flap * 0.4}
          />
          <path
            d={`M640 298 L820 418 L840 ${418 - flap * 16} L650 ${290 - flap * 10} Z`}
            fill="#1a1f26"
            opacity={0.55 + flap * 0.4}
          />
          {/* Flight spoilers: left/right wings follow the corresponding
              up-aileron command, while speed-brake deployment supplies the
              symmetric baseline. */}
          <rect x="680" y={118 - spoilL * 10} width="70" height="10" rx="2" fill="var(--color-hyd-b)" opacity={0.3 + spoilL * 0.6} />
          <rect x="680" y={392 + spoilR * 10} width="70" height="10" rx="2" fill="var(--color-hyd-b)" opacity={0.3 + spoilR * 0.6} />
        </g>

        {/* Fuselage */}
        <g filter="url(#soft)">
          <path
            d="M70 248 C90 210, 130 196, 180 196 L980 196 C1040 196, 1100 214, 1148 248 C1100 282, 1040 300, 980 300 L180 300 C130 300, 90 286, 70 248 Z"
            fill="url(#fuse)"
            stroke="#7a8494"
            strokeWidth="1.4"
          />
          {/* cockpit windows */}
          <path d="M118 232 C130 224, 150 220, 172 222 L172 228 C150 226, 132 230, 122 236 Z" fill="#9ec4d8" opacity="0.55" />
          <path d="M118 264 C130 272, 150 276, 172 274 L172 268 C150 270, 132 266, 122 260 Z" fill="#9ec4d8" opacity="0.55" />
          {/* cabin windows */}
          {Array.from({ length: 18 }).map((_, i) => (
            <g key={i}>
              <rect x={210 + i * 38} y="208" width="10" height="7" rx="2" fill="#8fb4c6" opacity="0.35" />
              <rect x={210 + i * 38} y="305" width="10" height="7" rx="2" fill="#8fb4c6" opacity="0.35" />
            </g>
          ))}
          {/* APU tail cone */}
          <path
            d="M1088 248 C1110 236, 1136 236, 1156 248 C1136 260, 1110 260, 1088 248"
            fill="#252b34"
            stroke="#6a7382"
          />
          {/* Inlet door */}
          <rect
            x={1094}
            y={240 - door * 10}
            width="22"
            height="16"
            rx="2"
            fill={door > 0.9 ? "var(--color-ok)" : "#1a1f26"}
            opacity={0.5 + door * 0.5}
            stroke="var(--color-fuel)"
            strokeWidth="1"
          />
        </g>

        {/* JT8D nacelles */}
        <EngineNacelle cx={500} cy={92} running={d.eng1Running} n2={s.n2_1} start={d.startValveOpen1} bleed={s.bleed1 && d.eng1Running} />
        <EngineNacelle cx={500} cy={404} running={d.eng2Running} n2={s.n2_2} start={d.startValveOpen2} bleed={s.bleed2 && d.eng2Running} />

        {/* Gear */}
        <g opacity={0.35 + s.gearPos * 0.65}>
          <ellipse cx="210" cy={248} rx="10" ry={16 - gearY * 0.3} fill="#111" stroke="#888" />
          <ellipse cx="620" cy={318 + gearY} rx="18" ry="12" fill="#111" stroke="#888" />
          <ellipse cx="620" cy={178 - gearY} rx="18" ry="12" fill="#111" stroke="#888" />
        </g>

        {/* Pack bays */}
        <rect x="548" y="228" width="36" height="14" rx="3" fill={d.packLFlow ? "var(--color-elec)" : "#1a1f26"} opacity={d.packLFlow ? 0.85 : 0.4} />
        <rect x="548" y="278" width="36" height="14" rx="3" fill={d.packRFlow ? "var(--color-elec)" : "#1a1f26"} opacity={d.packRFlow ? 0.85 : 0.4} />

        {parts.map((p) => (
          <Hotspot
            key={p.id}
            part={p}
            selected={selectedId === p.id}
            hovered={hover === p.id}
            onEnter={() => setHover(p.id)}
            onLeave={() => setHover(null)}
            onClick={() => onSelect?.(p.id)}
          />
        ))}

        {/* Labels */}
        <text x="86" y="188" fill="var(--color-muted)" fontSize="11" fontFamily="Barlow Condensed, sans-serif" letterSpacing="2">
          NOSE
        </text>
        <text x="1088" y="188" fill="var(--color-muted)" fontSize="11" fontFamily="Barlow Condensed, sans-serif" letterSpacing="2">
          APU
        </text>
        <text x="488" y="36" fill="var(--color-muted)" fontSize="11" fontFamily="Barlow Condensed, sans-serif" letterSpacing="2">
          ENG 1 · JT8D
        </text>
        <text x="488" y="500" fill="var(--color-muted)" fontSize="11" fontFamily="Barlow Condensed, sans-serif" letterSpacing="2">
          ENG 2 · JT8D
        </text>
      </svg>

      {hover && <HoverCard part={PARTS.find((p) => p.id === hover)!} />}
    </div>
  );
}

function EngineNacelle({
  cx,
  cy,
  running,
  n2,
  start,
  bleed,
}: {
  cx: number;
  cy: number;
  running: boolean;
  n2: number;
  start: boolean;
  bleed: boolean;
}) {
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <rect x="-90" y="-22" width="180" height="44" rx="18" fill="#1b2027" stroke="#6a7382" strokeWidth="1.4" />
      <rect x="-70" y="-16" width="130" height="32" rx="14" fill="#11151a" />
      <circle cx="-58" cy="0" r="12" fill="#0a0c0e" stroke={running ? "var(--color-ok)" : "#555"} />
      <g className={n2 > 8 ? (n2 > 40 ? "spool" : "spool-slow") : undefined}>
        <path d="M-58 -8 L-58 8 M-66 0 H-50" stroke={running ? "var(--color-ok)" : "#666"} strokeWidth="1.2" />
      </g>
      {start && <circle cx="70" cy="0" r="6" fill="var(--color-caution)" className="glow-ok" />}
      {bleed && <circle cx="40" cy="-18" r="4" fill="var(--color-pneumatic)" />}
    </g>
  );
}

function Hotspot({
  part,
  selected,
  hovered,
  onEnter,
  onLeave,
  onClick,
}: {
  part: Part;
  selected: boolean;
  hovered: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onClick: () => void;
}) {
  const color = SYS_COLOR[part.system];
  return (
    <g
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onClick}
      className="cursor-pointer"
    >
      <circle
        cx={part.x}
        cy={part.y}
        r={selected || hovered ? 9 : 5.5}
        fill={color}
        opacity={selected ? 1 : hovered ? 0.9 : 0.7}
        stroke="#0a0c0e"
        strokeWidth="1.5"
      />
    </g>
  );
}

function HoverCard({ part }: { part: Part }) {
  const sys = SYSTEMS.find((s) => s.id === part.system);
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 max-w-sm rounded-lg border border-border bg-raised/95 px-3 py-2 shadow-panel">
      <p className="font-display text-[11px] uppercase tracking-[0.16em] text-subtle">
        ATA {part.ata} · {sys?.short}
      </p>
      <p className="mt-0.5 text-sm font-medium text-fg">{part.name}</p>
      <p className="mt-1 line-clamp-2 text-xs text-muted">{part.function}</p>
    </div>
  );
}
