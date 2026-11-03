/**
 * Interactive Navigation Map for the Training Console.
 * Uses Leaflet so the student can zoom and pan freely.
 *
 * OFFLINE: base chart is drawn locally (grid + land outlines). No tile server
 * or CDN is required — works without network once the app is loaded.
 *
 * Shows:
 *  - Live aircraft position + heading
 *  - Flight-plan waypoints and route line
 *  - Changi / route navaids (VOR, ILS, NDB)
 *  - Current target highlighted
 *  - Auto-frequency switch status
 *
 * Requires: npm install leaflet react-leaflet
 * (and the Leaflet CSS import in the app root or this file)
 */
import React, { useEffect, useMemo, useState, useRef } from "react";
import { MapContainer, Marker, Popup, Polyline, Circle, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cn } from "@/lib/utils";
import { CHANGI_NAVAIDS } from "@/lib/sim/navaids-changi";
import { RPLL_WSSS_SEQUENCE, buildPlanSequence, findNextSequenceItem, SWITCH_DISTANCE_NM, type SequenceItem } from "@/lib/sim/routeSequence";
import { usePedestal } from "@/lib/sim/pedestal";
import { useMip } from "@/lib/sim/mipLocal";
import { isAutomaticNavTuneWrite, tuneNav1 } from "@/lib/sim/navReceiver";
import { getLiveFlightNavigation, readFlightNavigationState, planRoutePoints as buildActivePlanRoutePoints } from "@/lib/sim/flightNavigation";
import { useActiveFlightPlan, readActiveFlightPlan } from "@/lib/sim/activeFlightPlan";
import { sampleLiveWeather } from "@/lib/sim/liveWeather";

// Keep the Leaflet integration at an explicit typing boundary. This project
// previously omitted Leaflet's separate DefinitelyTyped package, which made
// the React-Leaflet component option types collapse and generated false prop
// errors (center, icon, path options, etc.). The runtime components are still
// React-Leaflet's actual components; proper Leaflet typings can replace these
// aliases without changing any map behavior.
const LeafletMapContainer: any = MapContainer;
const LeafletTileLayer: any = TileLayer;
const LeafletPolyline: any = Polyline;
const LeafletMarker: any = Marker;
const LeafletCircle: any = Circle;
const LeafletPopup: any = Popup;

// All markers use L.DivIcon — no default PNG markers, no CDN required.


const waypointIcon = new L.DivIcon({
  className: "oersted-navaid-icon",
  html: `<div aria-label="Flight-plan waypoint" style="width:12px;height:12px;box-sizing:border-box;border:1.5px solid #e7edf4;border-radius:2px;background:#182534;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 1px #263748;"><span style="width:4px;height:4px;border-radius:50%;background:#5cc8ff;display:block;"></span></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

// Consistent station symbology: VOR, VOR/DME and DME use the same square
// radio-aid mark; NDBs use a circular compass mark; ILS/LOC uses a horizontal bar.
const ndbIcon = new L.DivIcon({
  className: "oersted-navaid-icon",
  html: `<div aria-label="NDB" style="width:14px;height:14px;box-sizing:border-box;border:1.5px solid #e7edf4;border-radius:50%;background:#182534;color:#e7edf4;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;line-height:1;box-shadow:0 0 0 1px #263748;">⊕</div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const vorIcon = new L.DivIcon({
  className: "oersted-navaid-icon",
  html: `<div aria-label="VOR/DME" style="width:14px;height:14px;box-sizing:border-box;border:1.5px solid #e7edf4;border-radius:2px;background:#182534;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 1px #263748;"><span style="width:3px;height:3px;border-radius:50%;background:#e7edf4;display:block;"></span></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const ilsIcon = new L.DivIcon({
  className: "oersted-navaid-icon",
  html: `<div aria-label="ILS/LOC" style="width:14px;height:8px;box-sizing:border-box;background:#182534;border:1.5px solid #e7edf4;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 1px #263748;"><span style="width:4px;height:4px;border-radius:50%;background:#e7edf4;display:block;"></span></div>`,
  iconSize: [14, 8],
  iconAnchor: [7, 4],
});

/** Top-down twin-engine 737-200 silhouette. The nose points north at 000° heading. */
function makeAircraftIcon() {
  return new L.DivIcon({
    className: "oersted-aircraft-marker",
    html: `<div class="oersted-aircraft-rotation" style="width:44px;height:44px;transform:rotate(0deg);transform-origin:50% 50%;transition:transform 180ms linear;">
      <svg width="44" height="44" viewBox="0 0 44 44" role="img" aria-label="Boeing 737-200 aircraft">
        <defs>
          <linearGradient id="b732-fuselage" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#c6a72a"/>
            <stop offset="0.45" stop-color="#fff17a"/>
            <stop offset="1" stop-color="#d6b82f"/>
          </linearGradient>
        </defs>
        <!-- Swept low-mounted wings and the compact rear stabilizer of a 737-200 -->
        <path d="M19.4 18.8 L4 26.5 L3.3 30.6 L19.2 26.6 L24.8 26.6 L40.7 30.6 L40 26.5 L24.6 18.8 Z" fill="#ffeb3b" stroke="#10161b" stroke-width="1.25" stroke-linejoin="round"/>
        <path d="M20.1 34.1 L12.4 37.9 L11.8 40.4 L20.1 38.4 L23.9 38.4 L32.2 40.4 L31.6 37.9 L23.9 34.1 Z" fill="#f5d94d" stroke="#10161b" stroke-width="1.1" stroke-linejoin="round"/>
        <!-- paired JT8D nacelles under the wings -->
        <path d="M11.1 22.9 Q9.2 24.1 9.8 27.3 L11.3 30.3 Q13.4 30.6 14.3 27.5 L14.8 24.5 Q13.5 22.4 11.1 22.9 Z" fill="#4c5962" stroke="#111820" stroke-width="1"/>
        <path d="M32.9 22.9 Q34.8 24.1 34.2 27.3 L32.7 30.3 Q30.6 30.6 29.7 27.5 L29.2 24.5 Q30.5 22.4 32.9 22.9 Z" fill="#4c5962" stroke="#111820" stroke-width="1"/>
        <!-- fuselage and cockpit/nose details -->
        <path d="M22 2.2 C19.8 5.5 19.4 9.8 19.4 14.4 L19.4 35.1 L17.5 39.1 L22 40.4 L26.5 39.1 L24.6 35.1 L24.6 14.4 C24.6 9.8 24.2 5.5 22 2.2 Z" fill="url(#b732-fuselage)" stroke="#10161b" stroke-width="1.2" stroke-linejoin="round"/>
        <path d="M20.2 8.5 L23.8 8.5 L23.5 11.1 L20.5 11.1 Z" fill="#263c4b" stroke="#111820" stroke-width="0.45"/>
        <path d="M20.1 13.5 L23.9 13.5" stroke="#5d6a72" stroke-width="0.65"/>
        <path d="M20.1 32.4 L23.9 32.4" stroke="#65727a" stroke-width="0.65"/>
      </svg>
    </div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

function distanceNmBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const p1 = radians(lat1);
  const p2 = radians(lat2);
  const dp = radians(lat2 - lat1);
  const dl = radians(lon2 - lon1);
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 3440.065 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const activeStationIcon = new L.DivIcon({
  className: "",
  html: `<div style="width:22px;height:22px;border-radius:50%;background:#3b82f6;box-shadow:0 0 12px 6px rgba(59,130,246,0.7);animation:pulse 1.2s infinite;"></div>
         <style>@keyframes pulse{0%{transform:scale(1);opacity:1}50%{transform:scale(1.4);opacity:0.6}100%{transform:scale(1);opacity:1}}</style>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

function AutoFit({ points }: { points: [number, number][] }) {
  const map = useMap();
  const lastFitKey = React.useRef("");
  const fitKey = points.map(([lat, lon]) => `${lat.toFixed(5)},${lon.toFixed(5)}`).join("|");
  useEffect(() => {
    if (points.length > 1 && fitKey !== lastFitKey.current) {
      map.fitBounds(points as any, { padding: [30, 30], maxZoom: 8 });
      lastFitKey.current = fitKey;
    }
  }, [fitKey, points, map]);
  return null;
}

type AircraftMarkerHandle = { getElement: () => HTMLElement | null; setLatLng?: (p: [number, number]) => unknown };

/**
 * Moves the aircraft symbol (and, when following, the map) every animation frame instead of whenever React happens to re-render.
 * The simulator publishes the position a few times a second; between two updates the position is extrapolated along the
 * current ground track at the current effective speed (including the en-route time compression), so the symbol glides
 * instead of jumping. Each new simulator update re-bases the extrapolation. Dragging the map switches Follow off.
 */
function SmoothAircraft({ markerRef, follow, onUserDrag }: { markerRef: React.RefObject<AircraftMarkerHandle | null>; follow: boolean; onUserDrag: () => void }) {
  const map = useMap();
  const followRef = useRef(follow);
  const dragRef = useRef(onUserDrag);
  useEffect(() => {
    followRef.current = follow;
    dragRef.current = onUserDrag;
  });
  useEffect(() => {
    const onDrag = () => dragRef.current();
    map.on("dragstart", onDrag);
    return () => {
      map.off("dragstart", onDrag);
    };
  }, [map]);
  useEffect(() => {
    const MPS_PER_KT = 0.514444;
    const M_PER_DEG = 111320;
    let raf = 0;
    let baseLat = NaN;
    let baseLon = NaN;
    let baseT = 0;
    const loop = (nowMs: number) => {
      raf = requestAnimationFrame(loop);
      const st = getLiveFlightNavigation();
      if (!st || !Number.isFinite(st.latitude) || !Number.isFinite(st.longitude)) return;
      if (st.latitude !== baseLat || st.longitude !== baseLon) {
        baseLat = st.latitude;
        baseLon = st.longitude;
        baseT = nowMs;
      }
      const dt = Math.min(0.5, (nowMs - baseT) / 1000); // never run ahead of a stalled simulator
      const speed = (st.groundSpeedKt || 0) * MPS_PER_KT * (st.timeCompression ?? 1);
      let lat = st.latitude;
      let lon = st.longitude;
      if (speed > 0.5) {
        const trk = (((st.trackTrueDeg ?? st.headingDeg + (st.magVarDeg ?? 0)) % 360) * Math.PI) / 180;
        lat += (speed * dt * Math.cos(trk)) / M_PER_DEG;
        lon += (speed * dt * Math.sin(trk)) / (M_PER_DEG * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
      }
      markerRef.current?.setLatLng?.([lat, lon]);
      if (followRef.current) {
        const p = map.latLngToContainerPoint([lat, lon]);
        const c = map.getSize().divideBy(2);
        const dx = p.x - c.x;
        const dy = p.y - c.y;
        if (dx * dx + dy * dy >= 0.5) map.panBy([dx, dy], { animate: false });
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [map, markerRef]);
  return null;
}

export function InteractiveNavMap({ className }: { className?: string }) {
  // Client-only: Leaflet cannot run during SSR
  if (typeof window === "undefined") {
    return <div className={cn("h-[min(480px,52svh)] min-h-[220px] rounded border border-border bg-surface flex items-center justify-center text-xs text-muted", className)} data-map-viewport>Loading map…</div>;
  }

  const [navState, setNavState] = useState(readFlightNavigationState());
  const [seqIndex, setSeqIndex] = useState(0);
  const [status, setStatus] = useState("Waiting for aircraft position…");
  // The map is a display of the aircraft simulator, never a second flight
  // simulator. Position and heading below are read only from live telemetry.
  const heading = navState?.headingDeg ?? 0;
  // The map is north-up TRUE: point the symbol along the direction the aircraft is actually moving (the route track when it is following the route).
  const symbolDeg = navState?.trackTrueDeg ?? ((heading + (navState?.magVarDeg ?? 0) + 360) % 360);
  // Only the marker element is needed for heading rotation; keep this small
  // structural type so the map does not depend on @types/leaflet being installed.
  const aircraftMarkerRef = useRef<AircraftMarkerHandle | null>(null);
  const aircraftIcon = useMemo(() => makeAircraftIcon(), []);
  // No dependency list on purpose: the Leaflet marker element may not exist yet when the heading first arrives (and an unchanged heading never re-runs a keyed
  // effect), which left the symbol pointing north while the aircraft flew another way. Re-applying the rotation after every render is cheap.
  useEffect(() => {
    const aircraft = aircraftMarkerRef.current?.getElement()?.querySelector<HTMLElement>(".oersted-aircraft-rotation");
    if (aircraft) aircraft.style.transform = `rotate(${symbolDeg}deg)`;
  });
  const [follow, setFollow] = useState(true);
  const [log, setLog] = useState<string[]>([]);
  const [manualTune, setManualTune] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("oersted-nav-auto-tune") === "off";
  });
  const [night, setNight] = useState(false);
  const [wxOpen, setWxOpen] = useState(false);
  const [wxData, setWxData] = useState<{ metar: string; taf: string; pirep: string; error?: string } | null>(null);
  const [wxLoading, setWxLoading] = useState(false);
  const [radarOn, setRadarOn] = useState(false);
  const [radarUrl, setRadarUrl] = useState<string | null>(null);
  const pedestal = usePedestal();

  // A pilot change on the pedestal takes priority over the automatic tuner.
  // Disable auto-tune for this receiver when NAV1 is changed outside an auto handoff.
  useEffect(() => {
    let previousAct = usePedestal.getState().navL.act;
    const unsubscribe = usePedestal.subscribe((state) => {
      const currentAct = state.navL.act;
      if (currentAct !== previousAct) {
        previousAct = currentAct;
        if (!isAutomaticNavTuneWrite()) {
          window.localStorage.setItem("oersted-nav-auto-tune", "off");
          setManualTune(true);
          setStatus("Manual NAV1 tuning · automatic handoff paused");
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Poll navigation state
  useEffect(() => {
    // 300 ms (was 800): the aircraft symbol must visibly answer glareshield / heading inputs; setState with the same live object is a no-op re-render.
    const id = setInterval(() => setNavState(readFlightNavigationState()), 300);
    return () => clearInterval(id);
  }, []);

  // Sample live precipitation for the weather radar every ~2 minutes when position is known
  useEffect(() => {
    if (!navState?.latitude || !navState?.longitude) return;
    const run = () => sampleLiveWeather(navState.latitude, navState.longitude);
    run();
    const id = setInterval(run, 120000);
    return () => clearInterval(id);
  }, [navState?.latitude, navState?.longitude]);

  async function loadWeather() {
    const plan = readActiveFlightPlan();
    const dep = plan?.departure || "RPLL";
    const dest = plan?.destination || "WSSS";
    const phAndEnroute = ["RPLL", "RPLC", "RPVM", "RPVP", "RPSP", "RPVB", "WSSS", "WMKK", "VTBS", "VVTS"];
    const ids = Array.from(new Set([dep, dest, ...phAndEnroute].filter(Boolean))).join(",");
    setWxLoading(true);
    setWxData(null);
    try {
      let metar = "";
      try {
        const r = await fetch(`https://metar.vatsim.net/${ids}`);
        if (r.ok) metar = await r.text();
      } catch { /* continue */ }
      if (!metar) {
        const r = await fetch(`https://aviationweather.gov/api/data/metar?ids=${ids}&format=raw`);
        if (r.ok) metar = await r.text();
      }
      let taf = "";
      try {
        const r = await fetch(`https://aviationweather.gov/api/data/taf?ids=${ids}&format=raw`);
        if (r.ok) taf = await r.text();
      } catch { /* optional */ }
      let pirep = "";
      try {
        const r = await fetch(`https://aviationweather.gov/api/data/pirep?id=${ids}&format=raw&age=2`);
        if (r.ok) pirep = await r.text();
      } catch { /* optional */ }
      setWxData({
        metar: metar.trim() || "No METAR",
        taf: taf.trim() || "No TAF",
        pirep: pirep.trim() || "No recent PIREPs",
      });
      (globalThis as any).__oerstedLastMetar = metar;
    } catch (e) {
      setWxData({ metar: "", taf: "", pirep: "", error: "Weather fetch failed (network or CORS). Try again later." });
    } finally {
      setWxLoading(false);
    }
  }

  async function loadRadar() {
    try {
      const res = await fetch("https://api.rainviewer.com/public/weather-maps.json");
      if (!res.ok) return;
      const data = await res.json();
      const frames = data?.radar?.past;
      if (!frames?.length) return;
      const latest = frames[frames.length - 1];
      const host = data.host || "https://tilecache.rainviewer.com";
      const url = `${host}${latest.path}/256/{z}/{x}/{y}/2/1_1.png`;
      setRadarUrl(url);
    } catch {
      setRadarUrl(null);
    }
  }

  function resetToRunway() {
    // Reset only the map's radio-target tracking. Do not reposition or move
    // the aircraft; the Flight Plan / TAKEOFF controls own aircraft motion.
    setSeqIndex(0);
    setLog([]);
    setStatus("Navigation display reset · aircraft position unchanged");
  }

  // Subscribe to the shared active-plan bridge so loading a plan in the Flight Plan
  // panel updates this map immediately, including when the panel was already mounted.
  const plan = useActiveFlightPlan();
  const waypoints = plan?.waypoints ?? [];

  // Radio targets come from the SUPPLIED flight plan: its VOR / NDB stations in route order, then its selected ILS.
  // The fixed Manila -> Changi list is only a fallback while no plan has been loaded at all.
  const sequence: SequenceItem[] = useMemo(() => (plan ? buildPlanSequence(plan) : RPLL_WSSS_SEQUENCE), [plan]);
  const planKey = plan?.activatedAt ?? "none";
  const lastPlanKey = useRef(planKey);
  useEffect(() => {
    // A newly loaded plan restarts the radio sequence from its first station.
    if (lastPlanKey.current !== planKey) { lastPlanKey.current = planKey; setSeqIndex(0); setLog([]); }
  }, [planKey]);

  // Set the selected course from the first plan station when a plan loads
  useEffect(() => {
    const first = sequence[0];
    if (plan && first?.courseMag != null) {
      // The selected course is an MIP/HSI selector, not a centre-pedestal field.
      useMip.setState({ selCrs: first.courseMag });
    }
  }, [planKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-frequency switch logic
  useEffect(() => {
    if (!navState) return;
    const { next, index, distanceNm } = findNextSequenceItem(
      navState.latitude,
      navState.longitude,
      seqIndex,
      sequence,
    );
    if (next && index !== seqIndex && !manualTune) {
      if (next.kind === "NDB") {
        // Tune ADF (kHz)
        usePedestal.setState({
          adf: { l: Math.round(next.frequency), r: pedestal.adf.r },
        });
        setStatus(`Auto-tuned ADF to ${Math.round(next.frequency)} kHz (${next.name}) · ${distanceNm.toFixed(1)} NM`);
      } else {
        // Tune NAV1 (VOR / ILS) — pedestal is authority; MIP mirrors via owner loop
        tuneNav1(next.frequency, { powerOn: true, source: "auto" });
        setStatus(`Auto-tuned NAV1 to ${next.frequency.toFixed(2)} (${next.name}) · ${distanceNm.toFixed(1)} NM`);
      }
      setLog((prev) => [`${new Date().toLocaleTimeString()} → ${next.name}`, ...prev].slice(0, 8));
      setSeqIndex(index);
    }
  }, [navState, seqIndex, sequence, pedestal.navL.stby]);

  const acPos: [number, number] = navState
    ? [navState.latitude, navState.longitude]
    : [14.5085, 121.0195];
  // The aircraft symbol is moved every frame by SmoothAircraft; React only supplies where it starts.
  const [markerStart] = useState<[number, number]>(acPos);

  // Use the same active-plan route model as flight guidance: departure reference,
  // every user-added waypoint in order, then destination/arrival threshold. Previously
  // this map connected only the intermediate waypoints, so a one-fix plan had no line
  // and the trainer could appear to ignore the loaded route.
  const planRoutePoints: [number, number][] = plan
    ? buildActivePlanRoutePoints(plan)
        .filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180)
        .map((p) => [p.latitude, p.longitude] as [number, number])
    : [];
  const routePoints: [number, number][] = planRoutePoints.length > 1
    ? planRoutePoints
    : sequence.map((s) => [s.lat, s.lon] as [number, number]);
  const seqPoints = sequence.map((s) => [s.lat, s.lon] as [number, number]);
  const currentTarget = sequence[Math.min(seqIndex, sequence.length - 1)];
  const nextTarget = sequence[seqIndex + 1];
  const currentRangeNm = currentTarget && navState
    ? distanceNmBetween(navState.latitude, navState.longitude, currentTarget.lat, currentTarget.lon)
    : null;
  const frequencyText = (item: typeof nextTarget) => !item ? "—" : item.kind === "NDB"
    ? `${Math.round(item.frequency)} kHz`
    : `${item.frequency.toFixed(2)} MHz`;

  return (
    <div className={cn("min-w-0 max-w-full rounded border border-border overflow-hidden", className)} data-map-viewport style={{ filter: night ? "brightness(0.4) contrast(1.2) saturate(0.6)" : "none" }}>
      <div className="bg-surface px-2 py-2 font-mono text-[9px] uppercase text-subtle">
        <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
          <span className="min-w-0 font-semibold tracking-wide text-fg">Interactive Navigation Map</span>
          <span className="shrink-0 text-[8px] text-subtle">{plan ? `${plan.departure} → ${plan.destination}` : "RPLL → WSSS"}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={() => setFollow((f) => !f)} className="rounded px-2 py-1 text-[9px] font-mono uppercase" style={{ background: follow ? "#22c55e" : "#4b5563", color: "#fff" }}>Follow {follow ? "ON" : "OFF"}</button>
          <button onClick={() => setManualTune((m) => { const next = !m; window.localStorage.setItem("oersted-nav-auto-tune", next ? "off" : "on"); return next; })} className="rounded px-2 py-1 text-[9px] font-mono uppercase" style={{ background: manualTune ? "#f59e0b" : "#16a34a", color: "#fff" }} aria-pressed={!manualTune}>
            {manualTune ? "AUTO TUNE OFF" : "AUTO TUNE ON"}
          </button>
          <button onClick={() => setNight((n) => !n)} className="rounded px-2 py-1 text-[9px] font-mono uppercase" style={{ background: night ? "#1e293b" : "#64748b", color: "#fff" }}>
            {night ? "NIGHT" : "DAY"}
          </button>
          <button onClick={() => { setWxOpen((o) => !o); if (!wxOpen && !wxData) loadWeather(); }} className="rounded px-2 py-1 text-[9px] font-mono uppercase" style={{ background: wxOpen ? "#0ea5e9" : "#0369a1", color: "#fff" }}>
            WX {wxOpen ? "ON" : "OFF"}
          </button>
          <button onClick={() => { setRadarOn((r) => !r); if (!radarOn && !radarUrl) loadRadar(); }} className="rounded px-2 py-1 text-[9px] font-mono uppercase" style={{ background: radarOn ? "#ef4444" : "#7f1d1d", color: "#fff" }}>
            RADAR {radarOn ? "ON" : "OFF"}
          </button>
          <button onClick={resetToRunway} className="rounded bg-neutral-600 px-2 py-1 text-[9px] font-mono uppercase text-white">RESET TRACK</button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 border-t border-border bg-[#0b0f12] p-2 sm:grid-cols-2">
        <section className="min-w-0 rounded border border-emerald-500/35 bg-emerald-950/20 p-2" aria-label="Current tracking">
          <div className="mb-1 text-[8px] font-bold tracking-[0.16em] text-emerald-300">CURRENT TRACKING</div>
          <div className="break-words text-[10px] font-semibold leading-snug text-neutral-100">{currentTarget?.name ?? (plan ? "No VOR / NDB / ILS in plan" : "Awaiting route")}</div>
          <div className="mt-2 flex items-center justify-between gap-1 text-[8px] text-neutral-400">
            <span>RANGE</span><span className="tabular-nums text-emerald-200">{currentRangeNm == null ? "—" : `${currentRangeNm.toFixed(1)} NM`}</span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-1 text-[8px] text-neutral-400">
            <span>TYPE</span><span className="text-neutral-200">{currentTarget?.kind ?? "—"}</span>
          </div>
        </section>
        <section className="min-w-0 rounded border border-amber-500/35 bg-amber-950/20 p-2" aria-label="Next tracking target">
          <div className="mb-1 text-[8px] font-bold tracking-[0.16em] text-amber-300">NEXT TARGET</div>
          <div className="break-words text-[10px] font-semibold leading-snug text-neutral-100">{nextTarget?.name ?? (sequence.length ? "END OF SEQUENCE" : "—")}</div>
          <div className="mt-2 flex items-center justify-between gap-1 text-[8px] text-neutral-400">
            <span>FREQUENCY</span><span className="text-amber-200">{frequencyText(nextTarget)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-1 text-[8px] text-neutral-400">
            <span>TYPE</span><span className="text-neutral-200">{nextTarget?.kind ?? "—"}</span>
          </div>
        </section>
      </div>
      <div role="status" aria-live="polite" className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1 border-t border-border bg-neutral-950 px-2 py-1.5 font-mono text-[8px] leading-snug">
        <span className="shrink-0 font-bold tracking-wide text-sky-300">NAV EVENT</span>
        <span className="min-w-0 flex-1 break-words text-neutral-300">{status}</span>
        <span className={cn("shrink-0", navState ? "text-emerald-300" : "text-amber-300")}>{navState ? "SIM TELEMETRY" : "WAITING"}</span>
      </div>
      {wxOpen && (
        <div className="border-t border-sky-800 bg-sky-950/40 px-2 py-2 font-mono text-[8px] leading-snug text-sky-100">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-bold tracking-wide text-sky-300">WEATHER — METAR / TAF / PIREP (PH + ENROUTE) + LIVE RADAR</span>
            <button onClick={loadWeather} disabled={wxLoading} className="rounded bg-sky-700 px-1.5 py-0.5 text-[7px] uppercase text-white disabled:opacity-50">
              {wxLoading ? "LOADING…" : "REFRESH"}
            </button>
          </div>
          {wxData?.error ? (
            <div className="text-amber-300">{wxData.error}</div>
          ) : wxData ? (
            <>
              <div className="text-[7px] text-amber-200">Live radar intensity is fed to the cockpit weather radar. In precipitation the aircraft sees reduced visibility.</div>
              <div className="grid gap-1.5">
                <div><span className="text-sky-400">METAR</span><pre className="mt-0.5 whitespace-pre-wrap text-[7px] text-neutral-200">{wxData.metar}</pre></div>
                <div><span className="text-sky-400">TAF</span><pre className="mt-0.5 whitespace-pre-wrap text-[7px] text-neutral-200">{wxData.taf}</pre></div>
                <div><span className="text-sky-400">PIREP</span><pre className="mt-0.5 whitespace-pre-wrap text-[7px] text-neutral-200">{wxData.pirep}</pre></div>
              </div>
            </>
          ) : (
            <div className="text-neutral-400">Click REFRESH to load weather for the flight-plan airports.</div>
          )}
        </div>
      )}
      <LeafletMapContainer
        center={acPos}
        zoom={6}
        style={{ height: "min(480px, 52svh)", width: "100%", background: "#0d1217" }}
        scrollWheelZoom
      >
        {/* Restore the real geographic chart instead of the training-only grid. */}
        <LeafletTileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        {radarOn && radarUrl && (
          <LeafletTileLayer
            attribution='&copy; <a href="https://www.rainviewer.com">RainViewer</a>'
            url={radarUrl}
            opacity={0.6}
            maxNativeZoom={7}
            maxZoom={12}
          />
        )}
        {/* Fit only when the planned route changes. Including the live aircraft
            position here caused fitBounds to run on every telemetry refresh,
            repeatedly zooming/panning the map and making it feel laggy. */}
        <AutoFit points={[...routePoints, ...(planRoutePoints.length ? [] : seqPoints)]} />
        <SmoothAircraft markerRef={aircraftMarkerRef} follow={follow} onUserDrag={() => setFollow(false)} />

        {/* Flight plan route */}
        {routePoints.length > 1 && (
          <LeafletPolyline positions={routePoints} color="#5cc8ff" weight={2} dashArray="6 6" />
        )}
        {/* Radial / course line from current station to aircraft */}
        {sequence[seqIndex] && (
          <LeafletPolyline
            positions={[
              [sequence[seqIndex].lat, sequence[seqIndex].lon],
              acPos,
            ]}
            color="#f59e0b"
            weight={2}
            dashArray="4 4"
          />
        )}



        {/* Waypoints */}
        {waypoints.map((w, index) => (
          <LeafletMarker key={`${w.id}-${index}`} position={[w.latitude, w.longitude]} icon={waypointIcon}>
            <LeafletPopup>
              <strong>WP {index + 1} · {w.name}</strong><br />
              {w.latitude.toFixed(5)}, {w.longitude.toFixed(5)}<br />
              {w.altitudeFt} ft · {w.speedKt ? `${w.speedKt} kt` : "No speed constraint"}
            </LeafletPopup>
          </LeafletMarker>
        ))}

        {/* Stations — labels hidden until click; active one is pulsing blue */}
        {sequence.map((s, i) => {
          const isActive = i === seqIndex;
          return (
            <LeafletMarker
              key={s.id}
              position={[s.lat, s.lon]}
              icon={isActive ? activeStationIcon : (s.kind === "NDB" ? ndbIcon : s.kind === "ILS" ? ilsIcon : vorIcon)}
            >
              <LeafletPopup>
                <strong>{s.name}</strong><br />
                {s.frequency} {s.kind === "NDB" ? "kHz" : "MHz"} · {s.kind}
              </LeafletPopup>
            </LeafletMarker>
          );
        })}

        {/* Full available radio-navigation catalog (including Philippine VOR/DME stations). */}
        {CHANGI_NAVAIDS.filter((n) => n.available).map((n) => (
          <LeafletMarker
            key={`catalog-${n.id}`}
            position={[n.lat, n.lon]}
            icon={n.kind === "NDB" ? ndbIcon : n.kind === "ILS" || n.kind === "LOC" ? ilsIcon : vorIcon}
          >
            <LeafletPopup>
              <strong>{n.name}</strong><br />
              {n.ident} · {n.frequency} {n.kind === "NDB" ? "kHz" : "MHz"}<br />
              {n.kind}{n.runway ? ` · RWY ${n.runway}` : ""}<br />
              {n.source.toLowerCase().includes("approximate") ? "Approximate coordinates; AIP verification pending" : n.source}
            </LeafletPopup>
          </LeafletMarker>
        ))}

        {/* Aircraft */}
        <LeafletCircle
          center={acPos}
          radius={12000}
          pathOptions={{ color: "#ffeb3b", weight: 3, fillOpacity: 0.3 }}
        />
        {wxData && !wxData.error && [
          { icao: "RPLL", lat: 14.5086, lon: 121.0194 },
          { icao: "RPLC", lat: 15.1860, lon: 120.5600 },
          { icao: "RPVM", lat: 10.3075, lon: 123.9794 },
          { icao: "RPVP", lat: 9.7421, lon: 118.7587 },
          { icao: "WSSS", lat: 1.3644, lon: 103.9915 },
          { icao: "WMKK", lat: 2.7456, lon: 101.7099 },
        ].map((ap) => (
          <LeafletMarker key={`wx-${ap.icao}`} position={[ap.lat, ap.lon]} icon={waypointIcon}>
            <LeafletPopup>
              <div className="font-mono text-[9px]">
                <div className="font-bold">{ap.icao}</div>
                <div className="text-sky-300">Weather loaded — see WX panel</div>
              </div>
            </LeafletPopup>
          </LeafletMarker>
        ))}
        <LeafletMarker ref={aircraftMarkerRef} key="aircraft-marker" position={markerStart} icon={aircraftIcon}>
          <LeafletPopup>
            Aircraft<br />
            HDG {navState?.headingDeg?.toFixed(0) ?? "---"}° · TRK {symbolDeg.toFixed(0)}°T<br />
            ALT {navState?.altitudeFt?.toFixed(0) ?? "---"} ft
          </LeafletPopup>
        </LeafletMarker>
      </LeafletMapContainer>
      <div className="bg-surface px-2 py-1 font-mono text-[9px] text-subtle flex flex-wrap gap-x-4 gap-y-1">
        <span>Bearing: {heading.toFixed(0)}°</span>
        <span>DME: {currentRangeNm == null ? "—" : `${currentRangeNm.toFixed(1)} NM`}</span>
        <span>XTK: {((heading - (sequence[seqIndex]?.courseMag ?? heading)) * 0.5).toFixed(1)} NM</span>
        <span>GS: {Math.round(navState?.groundSpeedKt ?? 0)} kt</span>
        <span>Status: {!navState ? "WAITING FOR TELEMETRY" : (navState.groundSpeedKt > 1 ? "MOVING WITH SIM" : "PARKED · WAITING FOR TAKEOFF")}</span>
        <span className="text-emerald-300">Current target: {sequence[seqIndex]?.name ?? "—"}</span>
        {sequence[seqIndex]?.note && <span className="text-amber-300">Target note: {sequence[seqIndex].note}</span>}
      </div>
      {log.length > 0 && (
        <div className="bg-neutral-900 px-2 py-1 font-mono text-[8px] text-neutral-400 max-h-16 overflow-auto">
          {log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
      <div className="bg-surface px-2 py-1 font-mono text-[8px] text-dim">
        Zoom with mouse wheel · Drag to pan · Green circle = current auto-tune target ({SWITCH_DISTANCE_NM} NM)
      </div>
    </div>
  );
}

export default InteractiveNavMap;