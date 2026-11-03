import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { BookOpen, Gauge, LayoutPanelLeft, Plane, PlaneTakeoff, Play, Sun, Moon } from "lucide-react";
import { AMM_META } from "@/data/amm";
import { useSimPick, useDerivedPick } from "@/lib/sim/store";
import { cn } from "@/lib/utils";
import { CaptionLight, Tape } from "@/components/panel/widgets";
import { Button } from "@/components/ui/button";
import { SimTicker } from "./SimTicker";

const NAV = [
  { to: "/", label: "Hangar", icon: Plane },
  { to: "/cockpit", label: "Flight deck", icon: LayoutPanelLeft },
  { to: "/flight-plan", label: "Flight plan", icon: PlaneTakeoff },
  { to: "/procedures", label: "Procedures", icon: Play },
  { to: "/library", label: "Library", icon: BookOpen },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [lightMode, setLightMode] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("classic737-theme");
    const next = saved === "light";
    setLightMode(next);
    document.documentElement.classList.toggle("light-mode", next);
  }, []);

  const toggleTheme = () => {
    const next = !lightMode;
    setLightMode(next);
    document.documentElement.classList.toggle("light-mode", next);
    window.localStorage.setItem("classic737-theme", next ? "light" : "dark");
  };

  return (
    <div className="flex min-h-dvh min-w-0 flex-col overflow-x-clip bg-bg text-fg">
      <SimTicker />
      <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur-sm">
        <div className="mx-auto flex min-w-0 max-w-[1400px] items-center gap-2 px-2 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-md border border-border bg-panel">
              <Gauge className="size-4 text-accent" />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate font-display text-base font-semibold tracking-[0.06em] text-fg sm:text-lg">
                Classic 737 Line Lab
              </span>
              <span className="block truncate font-display text-[10px] uppercase tracking-[0.18em] text-subtle sm:text-[11px]">
                {AMM_META.model} · {AMM_META.book} Rev {AMM_META.revision}
              </span>
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={toggleTheme}
              title={lightMode ? "Switch to dark mode" : "Switch to light mode"}
              aria-label={lightMode ? "Switch to dark mode" : "Switch to light mode"}
              className="gap-2"
            >
              {lightMode ? <Moon className="size-4" /> : <Sun className="size-4" />}
              <span className="hidden sm:inline">{lightMode ? "Dark" : "Light"}</span>
            </Button>
            <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => {
              const active = item.to === "/" ? path === "/" : path.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "inline-flex h-10 items-center gap-2 rounded-md px-3 font-display text-sm font-semibold uppercase tracking-[0.12em]",
                    active ? "bg-raised text-fg" : "text-muted hover:bg-raised hover:text-fg",
                  )}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
            </nav>
          </div>
        </div>
        <StatusStrip />
      </header>
      <main className="mx-auto w-full min-w-0 max-w-[1400px] flex-1 px-2 py-3 pb-24 sm:px-4 sm:py-4 md:pb-6">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden">
        <div className="grid grid-cols-5">
          {NAV.map((item) => {
            const active = item.to === "/" ? path === "/" : path.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 font-display text-[10px] font-semibold uppercase tracking-[0.14em]",
                  active ? "text-fg" : "text-muted",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function StatusStrip() {
  const s = useSimPick("apuRpm", "battery", "hydAPress", "hydBPress", "n2_1", "n2_2", "patch", "readyApu", "reset", "timeScale", "wow");
  const d = useDerivedPick("ductPsi", "fireWarn", "masterCaution");
  return (
    <div className="border-t border-border bg-inset/80">
      <div className="mx-auto flex min-w-0 max-w-[1400px] flex-wrap items-center gap-x-2 gap-y-1.5 px-2 py-1.5 sm:gap-x-4 sm:gap-y-2 sm:px-4 sm:py-2">
        <CaptionLight label="MASTER CAUTION" on={d.masterCaution} tone="caution" />
        <CaptionLight label="FIRE" on={d.fireWarn} tone="warn" />
        <CaptionLight label={s.wow ? "GND" : "AIR"} on={s.battery} tone="elec" />
        <Tape label="APU" value={s.apuRpm} unit="%" max={100} tone="ok" />
        <div className="hidden sm:contents">
          <Tape label="N2-1" value={s.n2_1} unit="%" max={100} tone="caution" />
          <Tape label="N2-2" value={s.n2_2} unit="%" max={100} tone="caution" />
        </div>
        <Tape label="DUCT" value={d.ductPsi} unit="psi" max={50} tone="pneumatic" />
        <div className="hidden md:contents">
          <Tape label="HYD A" value={s.hydAPress} unit="psi" max={3000} tone="hyd-a" />
          <Tape label="HYD B" value={s.hydBPress} unit="psi" max={3000} tone="hyd-b" />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => s.patch({ timeScale: s.timeScale === 1 ? 4 : s.timeScale === 4 ? 10 : 1 })}>
            {s.timeScale}× time
          </Button>
          <Button size="sm" variant="secondary" onClick={() => s.readyApu()}>
            Set APU running
          </Button>
          <Button size="sm" variant="outline" onClick={() => s.reset()}>
            Cold & dark
          </Button>
        </div>
      </div>
    </div>
  );
}
