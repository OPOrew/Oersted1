import { Suspense, lazy, useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { publishActiveFlightPlan, type ActiveArrival, type ActiveFlightPlan, type ActiveIls } from "@/lib/sim/activeFlightPlan";
import { AIRPORT_DATA, NAV_DATA_EDITIONS, RPLL_SIDS, RPLL_SID_NOTES, WSSS_ILS_02L, buildSidWaypoints, buildVectorArrival, sidProcedureName } from "@/lib/sim/navData";
import { CHANGI_NAVAIDS, type Navaid } from "@/lib/sim/navaids-changi";
import { AIRPORT_COORDS } from "@/lib/sim/airportCoords";
// Leaflet needs `window` at import time, so the map picker is only loaded in the browser (never during server rendering).
const NavaidStationPicker = lazy(() => import("@/components/panel/NavaidStationPicker"));
import { useMip } from "@/lib/sim/mipLocal";
import { loadPlanIntoControls } from "@/lib/sim/flightPhases";
import { FLIGHT_NAV_STATE_EVENT, departureRunwayHeadingMag, readFlightNavigationState, type FlightNavigationState } from "@/lib/sim/flightNavigation";
import { Button } from "@/components/ui/button";
import { ArrowDownToLine, ArrowUpRight, ClipboardList, MapPinned, PlaneTakeoff, RotateCcw, Route as RouteIcon, Save, Trash2 } from "lucide-react";

export const Route = createFileRoute("/flight-plan")({ component: FlightPlanPage });

type Waypoint = { id: string; name: string; latitude: number; longitude: number; altitudeFt: number; speedKt: number; source?: "charted" | "user" | "vector" };
type Plan = {
  callsign: string;
  destinationKind?: "airport" | "point-of-interest";
  destinationLat?: number;
  destinationLon?: number;
  departure: string;
  destination: string;
  alternate: string;
  departureRunway: string;
  arrivalRunway: string;
  cruiseAltitudeFt: number;
  cruiseSpeedKt: number;
  reserveFuelLb: number;
  routeText: string;
  sid: string;
  enrouteRoute: string;
  star: string;
  approach: string;
  procedureStatus: "unverified" | "chart-checked";
  cruiseTopOfClimbNm: number;
  descentStartNm: number;
  approachAltitudeFt: number;
  waypoints: Waypoint[];
  /** vectored ILS arrival (PLAN NAV hands over to the ILS from the last vector fix) */
  arrival?: ActiveArrival;
  /** ILS / localizer selected as the approach guidance source (separate from the destination airport) */
  ils?: ActiveIls;
  /** En-route time compression (1 = real time); position only, speed and altitude are unchanged */
  timeCompression?: number;
};

const isIlsNavaid = (n: Navaid) => n.kind === "ILS" || n.kind === "LOC";
const ilsFromNavaid = (n: Navaid): ActiveIls => ({
  id: n.id, ident: n.ident, name: n.name, airport: n.airport, runway: n.runway ?? "",
  frequencyMHz: n.frequency, courseMag: n.courseMag ?? 0, latitude: n.lat, longitude: n.lon,
});

const DEFAULT_PLAN: Plan = {
  callsign: "OERSTED 01",
  departure: "RPLL",
  destination: "WSSS",
  destinationKind: "airport",
  destinationLat: WSSS_ILS_02L.thrLat,
  destinationLon: WSSS_ILS_02L.thrLon,
  alternate: "",
  departureRunway: "06",
  arrivalRunway: "",
  cruiseAltitudeFt: 25000,
  cruiseSpeedKt: 250,
  reserveFuelLb: 3000,
  routeText: "",
  sid: "",
  enrouteRoute: "",
  star: "",
  approach: "",
  procedureStatus: "unverified",
  cruiseTopOfClimbNm: 30,
  descentStartNm: 180,
  approachAltitudeFt: 3000,
  waypoints: [],
};
const STORAGE_KEY = "oersted-flight-plan-v1";
const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);

function FlightPlanPage() {
  const [plan, setPlan] = useState<Plan>(DEFAULT_PLAN);
  const [loaded, setLoaded] = useState(false);
  const [clientReady, setClientReady] = useState(false);
  useEffect(() => setClientReady(true), []);
  const [waypointName, setWaypointName] = useState("");
  const [waypointAlt, setWaypointAlt] = useState("10000");
  const [waypointSpeed, setWaypointSpeed] = useState("210");
  const [waypointLat, setWaypointLat] = useState("");
  const [waypointLon, setWaypointLon] = useState("");
  const [selectedNavaidId, setSelectedNavaidId] = useState("");
  const [notice, setNotice] = useState("Planning workspace ready. No route has been loaded into the aircraft model.");
  const [aircraftNav, setAircraftNav] = useState<FlightNavigationState | null>(null);
  const planNav = useMip((m) => m.planNav);
  const planNavStatus = useMip((m) => m.planNavStatus);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Plan>;
        setPlan({ ...DEFAULT_PLAN, ...parsed, waypoints: Array.isArray(parsed.waypoints) ? parsed.waypoints.map((wp: any) => ({ latitude: 0, longitude: 0, source: "user", ...wp })) : [] });
        setNotice("Saved flight plan restored from this device.");
      }
    } catch {
      setNotice("Saved plan could not be read; using a clean plan.");
    }
    setLoaded(true);
  }, []);

  // Keep the editable route and waypoint list on this device continuously, not only
  // when the user presses Save/Load. This lets the planner survive panel switches
  // and page reloads without activating the plan in the aircraft model.
  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
    } catch {
      // Keep editing available if browser storage is blocked or full.
    }
  }, [loaded, plan]);

  useEffect(() => {
    const refreshNav = () => setAircraftNav(readFlightNavigationState());
    refreshNav();
    window.addEventListener(FLIGHT_NAV_STATE_EVENT, refreshNav);
    window.addEventListener("storage", refreshNav);
    return () => { window.removeEventListener(FLIGHT_NAV_STATE_EVENT, refreshNav); window.removeEventListener("storage", refreshNav); };
  }, []);

  const update = <K extends keyof Plan>(key: K, value: Plan[K]) => setPlan((current) => ({ ...current, [key]: value }));
  const profile = useMemo(() => makeProfile(plan.cruiseAltitudeFt), [plan.cruiseAltitudeFt]);
  const canSave = /^[A-Z0-9]{4}$/.test(plan.departure.trim().toUpperCase()) && /^[A-Z0-9]{4}$/.test(plan.destination.trim().toUpperCase());
  const canLoadToAircraft = loaded && canSave;

  const activeFrom = (p: Plan): Omit<ActiveFlightPlan, "version" | "activatedAt"> => ({
    callsign: p.callsign,
    departure: p.departure,
    destination: p.destination,
    alternate: p.alternate,
    departureRunway: p.departureRunway,
    arrivalRunway: p.arrivalRunway,
    cruiseAltitudeFt: p.cruiseAltitudeFt,
    cruiseSpeedKt: p.cruiseSpeedKt,
    sid: p.sid,
    enrouteRoute: p.enrouteRoute,
    star: p.star,
    approach: p.approach,
    procedureStatus: p.procedureStatus,
    waypoints: p.waypoints.map(({ id, name, latitude, longitude, altitudeFt, speedKt }) => ({ id, name, latitude, longitude, altitudeFt, speedKt })),
    ...(p.arrival ? { arrival: p.arrival } : {}),
    ...(p.ils ? { ils: p.ils } : {}),
    timeCompression: p.timeCompression ?? 15,
  });
  /** Publish the plan, preset the runway heading and arm PLAN NAV. The aircraft stays parked: nothing moves until TAKEOFF is pressed in the Navigation phases. */
  const publishAndArm = (p: Plan) => {
    const active = publishActiveFlightPlan(activeFrom(p));
    const hdg = departureRunwayHeadingMag(active);
    const mip = useMip.getState();
    useMip.setState({ planNav: true, ...(hdg != null ? { attHdgReq: { n: mip.attHdgReq.n + 1, hdg } } : {}) });
    loadPlanIntoControls(); // puts the plan into the cockpit controls (runway heading / course, flaps, PLAN NAV ...) and moves the flight phases to READY
    return hdg;
  };
  const vectorArrivalFor = (lat: number, lon: number) => {
    const { waypoints } = buildVectorArrival(WSSS_ILS_02L, lat, lon);
    const arrival: ActiveArrival = {
      kind: "vector-ils", airport: "WSSS", runway: WSSS_ILS_02L.runway, sceneId: WSSS_ILS_02L.id,
      firstFixName: waypoints[0].name, lastFixName: waypoints[waypoints.length - 1].name,
      ilsFrequencyMHz: WSSS_ILS_02L.frequencyMHz, courseMag: WSSS_ILS_02L.courseMag,
    };
    return { waypoints: waypoints as Waypoint[], arrival };
  };

  /** The WSSS RWY 02L ILS (ICW) from the station catalog: the localizer used by the vectored arrival. */
  const icwIls = (): ActiveIls | undefined => {
    const n = CHANGI_NAVAIDS.find((x) => x.id === "WSSS-ILS-02L");
    return n ? ilsFromNavaid(n) : undefined;
  };

  /** Use an ILS / localizer station as the approach guidance source. Does not change the destination airport. */
  const setIls = (station: Navaid) => {
    if (!isIlsNavaid(station)) { setNotice(`${station.ident} is not an ILS / localizer station.`); return; }
    const ils = ilsFromNavaid(station);
    const dest = plan.destination.trim().toUpperCase();
    const keepsVectors = !plan.arrival || (plan.arrival.sceneId === WSSS_ILS_02L.id && station.id === "WSSS-ILS-02L");
    setPlan((current) => ({
      ...current,
      ils,
      arrivalRunway: ils.runway || current.arrivalRunway,
      approach: `ILS ${ils.ident} ${ils.frequencyMHz.toFixed(2)} MHz RWY ${ils.runway}, course ${String(Math.round(ils.courseMag)).padStart(3, "0")}° - ${station.source}`,
      // A vectored arrival is built for ILS 02L only; choosing another ILS drops it so guidance and radio tuning agree.
      ...(keepsVectors ? {} : { arrival: undefined, waypoints: current.waypoints.filter((w) => w.source !== "vector") }),
    }));
    setSelectedNavaidId(station.id);
    const mismatch = station.airport && dest && station.airport !== dest ? ` Note: this ILS belongs to ${station.airport}, but the destination is ${dest}.` : "";
    setNotice(`${station.ident} (${station.name}, ${station.frequency.toFixed(2)} MHz, course ${String(Math.round(ils.courseMag)).padStart(3, "0")}°) set as the ILS for the approach. The destination airport is unchanged; the Navigation map tunes this ILS as the last radio target.${keepsVectors ? "" : " The synthetic vectored arrival was removed because it only applies to ILS 02L."}${mismatch}`);
  };
  const clearIls = () => { setPlan((current) => ({ ...current, ils: undefined })); setNotice("ILS removed from the plan."); };

  const loadManilaSingaporePreset = () => {
    const sidWps = buildSidWaypoints("VERDE") as Waypoint[];
    const verde = sidWps[sidWps.length - 1];
    const vec = vectorArrivalFor(verde.latitude, verde.longitude);
    const preset: Plan = {
      callsign: "OERSTED 01",
      departure: "RPLL",
      destination: "WSSS",
      destinationKind: "airport",
      destinationLat: WSSS_ILS_02L.thrLat,
      destinationLon: WSSS_ILS_02L.thrLon,
      alternate: "WMKK",
      departureRunway: "24",
      arrivalRunway: "02L",
      cruiseAltitudeFt: 31000,
      cruiseSpeedKt: 430,
      reserveFuelLb: 6000,
      routeText: "RPLL RWY 24 VERDE2B, then direct to VCT-A (synthetic vector point), then radar vectors to ILS RWY 02L at WSSS. The VERDE to VCT-A leg is NOT a charted ATS route (Kota Kinabalu / Kuala Lumpur FIR charts are not loaded). VCT-A/B/C are not charted fixes: they stand in for ATC vectors.",
      sid: `VERDE2B (RWY 24: ${RPLL_SIDS.VERDE.initial["24"]}; track out MIA R182 to TAALA, VERDE) - ${NAV_DATA_EDITIONS.rpllSid}`,
      enrouteRoute: "VERDE DCT VCT-A - not a charted ATS route",
      star: "NONE - current WSSS STARs are RNAV (GNSS), which a 737-200 cannot fly; radar vectors VCT-A / VCT-B / VCT-C instead",
      approach: `ILS/DME RWY 02L (ICW ${WSSS_ILS_02L.frequencyMHz.toFixed(1)}), course 023 deg, ADNIK FAF 4.6 DME - ${NAV_DATA_EDITIONS.wsssIls02L}`,
      procedureStatus: "unverified",
      cruiseTopOfClimbNm: 30,
      descentStartNm: 180,
      approachAltitudeFt: 3500,
      waypoints: [...sidWps, ...vec.waypoints],
      arrival: vec.arrival,
      ils: icwIls(),
    };
    setPlan(preset);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preset));
      publishAndArm(preset);
      setNotice("Manila → Singapore loaded: RWY 24 VERDE2B with published fixes, then vectors to ILS RWY 02L. The aircraft is parked and lined up on RWY 24 with PLAN NAV armed. Nothing moves until you press TAKEOFF in Navigation; PLAN NAV then steers only while the autopilot AIL (and ELEV for altitude, pitch switch OFF) is engaged. Procedures stay marked unverified; check them against current charts.");
    } catch {
      setNotice("Preset loaded in the planner, but browser storage was unavailable; it could not be sent to the aircraft model.");
    }
  };

  const loadToAircraft = () => {
    if (!canSave) { setNotice("Enter valid four-character departure and destination airport identifiers before loading the route."); return; }
    try {
      const hdg = publishAndArm(plan);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
      setNotice(`Flight plan ${plan.departure} → ${plan.destination} loaded.${hdg != null ? ` Aircraft lined up on RWY ${plan.departureRunway} (${String(Math.round(hdg)).padStart(3, "0")}° magnetic).` : ""} Aircraft is parked and PLAN NAV is armed: nothing moves until you press TAKEOFF in Navigation. PLAN NAV then steers only while the autopilot AIL (and ELEV for altitude) is engaged; the HDG SEL switch or ALT HOLD always overrides it.`);
    } catch {
      setNotice("Could not activate the plan because browser storage is unavailable.");
    }
  };

  const togglePlanNav = () => {
    const next = !useMip.getState().planNav;
    useMip.setState({ planNav: next });
    setNotice(next ? "PLAN NAV armed. Engage AIL on the autopilot to steer along the plan; engage ELEV with the pitch switch OFF to follow its altitudes." : "PLAN NAV off. The autopilot flies the heading bug and ALT HOLD as before.");
  };

  const applySid = (base: string) => {
    const name = sidProcedureName(base, plan.departureRunway);
    const def = RPLL_SIDS[base];
    if (!name || !def) { setNotice(`No SID data for ${base} on RWY ${plan.departureRunway || "?"}. Published data is encoded for RWY 06, 24 and 13.`); return; }
    const sidWps = buildSidWaypoints(base) as Waypoint[];
    const rwy = plan.departureRunway as "06" | "24" | "13";
    setPlan((current) => ({
      ...current,
      sid: `${name} (RWY ${rwy}: ${def.initial[rwy]}; track out MIA R${def.radial}) - ${NAV_DATA_EDITIONS.rpllSid}${def.remarks ? `. ${def.remarks}` : ""}`,
      waypoints: [...sidWps, ...current.waypoints.filter((w) => !w.id.startsWith("SID-"))],
    }));
    setNotice(`${name} applied with published fix coordinates. ${RPLL_SID_NOTES} Check against the current chart.`);
  };

  const applyVectorArrival = () => {
    const base = plan.waypoints.filter((w) => w.source !== "vector");
    const from = base[base.length - 1];
    const dep = AIRPORT_DATA[plan.departure];
    const lat = from?.latitude ?? dep?.arpLat;
    const lon = from?.longitude ?? dep?.arpLon;
    if (lat == null || lon == null) { setNotice("Add at least one waypoint first so the vector pattern can be placed on the correct side of the final course."); return; }
    const vec = vectorArrivalFor(lat, lon);
    setPlan((current) => ({
      ...current,
      destination: "WSSS", destinationKind: "airport", arrivalRunway: WSSS_ILS_02L.runway,
      destinationLat: WSSS_ILS_02L.thrLat, destinationLon: WSSS_ILS_02L.thrLon, approachAltitudeFt: 3500,
      star: "NONE - radar vectors VCT-A / VCT-B / VCT-C (current WSSS STARs are RNAV GNSS)",
      approach: `ILS/DME RWY 02L (ICW ${WSSS_ILS_02L.frequencyMHz.toFixed(1)}) - ${NAV_DATA_EDITIONS.wsssIls02L}`,
      waypoints: [...current.waypoints.filter((w) => w.source !== "vector"), ...vec.waypoints],
      arrival: vec.arrival,
      ils: icwIls() ?? current.ils,
    }));
    setNotice("Vectored ILS arrival to WSSS RWY 02L added (VCT-A downwind, VCT-B base, VCT-C intercept). These fixes are synthetic, not charted.");
  };

  const setHeadingBugForNextLeg = () => {
    if (!aircraftNav || aircraftNav.bearingToNextDeg == null) {
      setNotice("No active waypoint bearing is available. Load a plan with a geographic destination or waypoint first.");
      return;
    }
    const target = (((Math.round(aircraftNav.bearingToNextDeg - (aircraftNav.magVarDeg ?? 0)) % 360) + 360) % 360);
    useMip.getState().set({ selHdg: target });
    setNotice(`Heading selector set to ${String(target).padStart(3, "0")}° from the current bearing to ${aircraftNav.activeLegName || "the next waypoint"}. This is a one-time magnetic heading-bug update: engage HDG SEL on the modeled autopilot panel if desired. Use PLAN NAV to follow the whole route.`);
  };

  const savePlan = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
      setNotice("Flight plan saved on this device. The map and profiles use this plan, and PLAN NAV on the trainer autopilot uses it for guidance when activated.");
    } catch {
      setNotice("Unable to save in browser storage. Check available device storage or browser permissions.");
    }
  };
  const resetPlan = () => {
    setPlan(DEFAULT_PLAN);
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* storage may be unavailable */ }
    setNotice("Plan reset to the default flight-planning template.");
  };
  const addSelectedNavaid = () => {
    const station = CHANGI_NAVAIDS.find((n) => n.id === selectedNavaidId && n.available);
    if (!station) { setNotice("Select an active VOR, NDB, or ILS station on the map first."); return; }
    if (plan.waypoints.some((wp) => wp.id === station.id || wp.name === station.ident)) { setNotice(`${station.ident} is already in the route.`); return; }
    const altitude = clamp(Number(waypointAlt) || 0, 0, 45000);
    const speed = clamp(Number(waypointSpeed) || 0, 0, 400);
    const wp: Waypoint = { id: station.id, name: station.ident, latitude: station.lat, longitude: station.lon, altitudeFt: altitude, speedKt: speed, source: station.source.includes("CAAS AIP") ? "charted" : "user" };
    setPlan((current) => ({ ...current, waypoints: [...current.waypoints, wp] }));
    setWaypointName(station.ident); setWaypointLat(String(station.lat)); setWaypointLon(String(station.lon));
    setNotice(`${station.ident} added to the route (${station.frequency.toFixed(station.kind === "NDB" ? 0 : 2)} ${station.kind === "NDB" ? "kHz" : "MHz"}). ${station.source.includes("approximate map coordinates") || station.source.includes("screenshot") ? "This station is screenshot-derived and its current CAAP AIP data is not yet verified." : "Verify station and route details against current official charts."}`);
  };
  const addWaypoint = () => {
    const name = waypointName.trim().toUpperCase();
    if (!name) { setNotice("Enter a waypoint identifier before adding it."); return; }
    const latitude = Number(waypointLat); const longitude = Number(waypointLon);
    if (!waypointLat.trim() || !waypointLon.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) { setNotice("Enter valid waypoint latitude (-90 to 90) and longitude (-180 to 180) so it can be plotted geographically."); return; }
    if (plan.waypoints.some((wp) => wp.name === name)) { setNotice(`${name} is already in the route.`); return; }
    setPlan((current) => ({ ...current, waypoints: [...current.waypoints, { id: `${Date.now()}-${name}`, name, latitude, longitude, source: "user", altitudeFt: clamp(Number(waypointAlt) || 0, 0, 45000), speedKt: clamp(Number(waypointSpeed) || 0, 0, 400) }] }));
    setWaypointName(""); setWaypointLat(""); setWaypointLon("");
    setNotice(`${name} added and plotted using the coordinates you entered. Confirm coordinates against an official chart before use.`);
  };

  return (
    <AppShell>
      <div className="space-y-4">
        <section className="rounded-xl border border-border bg-surface p-4 shadow-panel sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-display text-[11px] uppercase tracking-[0.2em] text-subtle">Flight operations · Plan-driven guidance (PLAN NAV)</p>
              <h1 className="mt-1 flex items-center gap-2 font-display text-3xl font-semibold tracking-tight"><PlaneTakeoff className="size-7 text-accent"/> Flight Plan & Profile</h1>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">Plan a route, then load it to the aircraft: the route shows on the P8 FreeFlight unit and PLAN NAV can steer the modeled autopilot along it. A real 737-200 has no FMC or LNAV, so this is a trainer aid; the HDG SEL switch and ALT HOLD always override it.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={loadManilaSingaporePreset} className="gap-2"><MapPinned className="size-4"/> Load Manila → Singapore preset</Button>
              <Button onClick={loadToAircraft} disabled={!canLoadToAircraft} title={!canSave ? "Enter valid four-character departure and destination airport identifiers" : "Load this route into the aircraft"} className="gap-2"><PlaneTakeoff className="size-4"/> Load to Aircraft</Button>
              <Button onClick={savePlan} disabled={!loaded} className="gap-2"><Save className="size-4"/> Save plan</Button>
              <Button variant="outline" onClick={resetPlan} className="gap-2"><RotateCcw className="size-4"/> Reset</Button>
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-caution/30 bg-caution/10 px-3 py-2 text-sm text-fg">
            <strong>Integration status:</strong> Departure and destination airports are explicit route endpoints; added VOR/NDB fixes remain ordered intermediate waypoints. The ILS/localizer you select is the radio-guidance source for the approach (the last radio target in the Navigation map), not a substitute for the destination airport point. Load to Aircraft publishes the route to the P8 FreeFlight FPL display and lines the aircraft up on the departure runway. PLAN NAV follows the active route; on a configured vectored arrival it can tune the ILS and select AUTO APP. Speed is advisory only (no autothrottle). SID, ATS route, STAR, approach and runway selections must be checked against current official charts; this is a training plan, not an operational clearance.
          </div>
          <div className="mt-3 rounded-lg border border-border bg-inset px-3 py-2 text-sm text-muted" role="status">{notice}</div>
          <div className="mt-3 rounded-xl border border-accent/30 bg-panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-display text-sm font-semibold uppercase tracking-wider">Aircraft navigation state</h2><p className="mt-1 text-xs text-muted">Shared geographic state driven by simulated heading and groundspeed. PLAN NAV uses it to steer the modeled autopilot.</p></div><span className="rounded-full border border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide">{aircraftNav?.phase ?? "NO ACTIVE PLAN"}</span></div>
            {aircraftNav ? <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric label="Current position" value={`${aircraftNav.latitude.toFixed(4)}, ${aircraftNav.longitude.toFixed(4)}`}/>
              <Metric label="Heading / GS" value={`${aircraftNav.headingDeg.toFixed(0)}° / ${aircraftNav.groundSpeedKt.toFixed(0)} kt`}/>
              <Metric label="Next leg" value={aircraftNav.activeLegName || "—"}/>
              <Metric label="Bearing / range" value={`${aircraftNav.bearingToNextDeg == null ? "---" : aircraftNav.bearingToNextDeg.toFixed(0)+"°"} / ${aircraftNav.distanceToNextNm == null ? "---" : aircraftNav.distanceToNextNm.toFixed(1)+" NM"}`}/>
              <Metric label="Desired leg track" value={aircraftNav.desiredTrackDeg == null ? "---" : `${aircraftNav.desiredTrackDeg.toFixed(0)}° TRUE`}/>
              <Metric label="Cross-track error" value={aircraftNav.crossTrackNm == null ? "---" : `${aircraftNav.crossTrackNm >= 0 ? "R" : "L"} ${Math.abs(aircraftNav.crossTrackNm).toFixed(2)} NM`}/>
              <Metric label="Track / heading error" value={aircraftNav.trackErrorDeg == null ? "---" : `${aircraftNav.trackErrorDeg >= 0 ? "+" : ""}${aircraftNav.trackErrorDeg.toFixed(0)}°`}/>
              <Metric label="PLAN NAV heading / altitude" value={`${aircraftNav.guidanceHeadingMagDeg == null || aircraftNav.guidanceHeadingMagDeg === undefined ? "---" : String(Math.round(aircraftNav.guidanceHeadingMagDeg)).padStart(3, "0") + "° M"} / ${aircraftNav.guidanceTargetAltFt == null || aircraftNav.guidanceTargetAltFt === undefined ? "---" : fmt(aircraftNav.guidanceTargetAltFt) + " ft"}`}/>
              <Metric label="Vertical mode / speed advisory" value={`${aircraftNav.guidanceVertMode ?? "---"} / ${aircraftNav.guidanceSpeedKt == null || aircraftNav.guidanceSpeedKt === undefined ? "---" : aircraftNav.guidanceSpeedKt + " kt IAS"}`}/>
              <Metric label="Descent starts in" value={aircraftNav.guidanceDistToTodNm == null || aircraftNav.guidanceDistToTodNm === undefined ? "---" : aircraftNav.guidanceDistToTodNm <= 0 ? "Descending" : `${aircraftNav.guidanceDistToTodNm.toFixed(0)} NM`}/>
              <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-4">
                <Button variant="secondary" onClick={setHeadingBugForNextLeg} disabled={aircraftNav.bearingToNextDeg == null} className="gap-2"><RouteIcon className="size-4"/> Set heading bug to next waypoint</Button>
                <Button variant={planNav ? "default" : "outline"} onClick={togglePlanNav} className="gap-2"><RouteIcon className="size-4"/> PLAN NAV: {planNav ? "ARMED" : "OFF"}</Button>
                <span className="text-xs text-muted">Status: {planNavStatus}</span>
              </div>
              <div className="col-span-2 sm:col-span-4 text-xs text-muted">Route guidance is a training calculation. The button copies the current bearing to the existing heading selector as a one-time update; PLAN NAV is the switch that follows the route. Position source: {aircraftNav.positionMode}. Updated {new Date(aircraftNav.updatedAt).toLocaleTimeString()}.</div>
            </div> : <p className="mt-3 text-sm text-muted">Load a plan to initialize the geographic aircraft position at the departure airport.</p>}
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
          <section className="rounded-xl border border-border bg-panel p-4 sm:p-5">
            <SectionTitle icon={<ClipboardList className="size-4"/>} title="Departure and destination airports" subtitle="Airport endpoints, runway choices, and planned operating targets"/>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Callsign / flight ID"><input value={plan.callsign} onChange={(e) => update("callsign", e.target.value.toUpperCase())} className={inputClass} placeholder="OERSTED 01" /></Field>
              <Field label="Departure airport (ICAO)"><input value={plan.departure} onChange={(e) => update("departure", e.target.value.toUpperCase().slice(0, 4))} className={inputClass} maxLength={4} placeholder="RPLL" /></Field>
              <Field label={plan.destinationKind === "point-of-interest" ? "Destination point of interest (sim code)" : "Destination airport (ICAO)"}><input value={plan.destination} onChange={(e) => update("destination", e.target.value.toUpperCase().slice(0, 4))} className={inputClass} maxLength={4} placeholder="Enter destination" /></Field>
              <Field label="Alternate airport (ICAO)"><input value={plan.alternate} onChange={(e) => update("alternate", e.target.value.toUpperCase().slice(0, 4))} className={inputClass} maxLength={4} placeholder="Optional" /></Field>
              <Field label="Departure runway"><input value={plan.departureRunway} onChange={(e) => update("departureRunway", e.target.value.toUpperCase().slice(0, 3))} className={inputClass} placeholder="06" /></Field>
              <Field label={plan.destinationKind === "point-of-interest" ? "Arrival runway (not applicable to POI)" : "Arrival runway"}><input value={plan.arrivalRunway} onChange={(e) => update("arrivalRunway", e.target.value.toUpperCase().slice(0, 3))} className={inputClass} placeholder="Set after choosing destination" /></Field>
              <Field label="Planned cruise altitude (ft)"><input type="number" min={0} max={41000} step={1000} value={plan.cruiseAltitudeFt} onChange={(e) => update("cruiseAltitudeFt", clamp(Number(e.target.value) || 0, 0, 41000))} className={inputClass}/></Field>
              <Field label="Planned cruise speed (kt) — target only"><input type="number" min={100} max={400} value={plan.cruiseSpeedKt} onChange={(e) => update("cruiseSpeedKt", clamp(Number(e.target.value) || 100, 100, 400))} className={inputClass}/></Field>
              <Field label="Reserve fuel planning value (lb)"><input type="number" min={0} max={50000} step={500} value={plan.reserveFuelLb} onChange={(e) => update("reserveFuelLb", clamp(Number(e.target.value) || 0, 0, 50000))} className={inputClass}/></Field>
              <Field label="Route / airway notes"><input value={plan.routeText} onChange={(e) => update("routeText", e.target.value.toUpperCase())} className={inputClass} placeholder="Enter route notes or airway identifiers"/></Field>
            </div>
            <div className="mt-4 rounded-lg border border-border bg-inset p-3">
              <div className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wider"><RouteIcon className="size-4 text-accent"/> Intermediate navigation waypoints</div>
              <p className="mt-1 text-xs leading-relaxed text-muted">Choose a radio-navigation station from the map or enter a custom fix. Selected stations are appended in route order; altitude and speed are planned constraints, not immediate aircraft commands.</p>
              {clientReady ? <Suspense fallback={<div className="mt-3 flex h-56 items-center justify-center rounded-lg border border-border bg-[#0b1118] text-sm text-muted">Loading navigation map…</div>}><NavaidStationPicker departure={plan.departure} destination={plan.destination} selectedId={selectedNavaidId} ilsId={plan.ils?.id} onSetIls={setIls} onSetDeparture={(code) => { update("departure", code); setNotice(`${code} set as departure airport endpoint. It is not an intermediate radio waypoint.`); }} onSetDestination={(code) => { update("destination", code); setNotice(`${code} set as destination airport endpoint. Select the ILS approach separately.`); }} onSelect={(station) => { setSelectedNavaidId(station.id); setWaypointName(station.ident); setWaypointLat(String(station.lat)); setWaypointLon(String(station.lon)); setNotice(`${station.ident} selected · ${station.name} · ${station.frequency.toFixed(station.kind === "NDB" ? 0 : 2)} ${station.kind === "NDB" ? "kHz" : "MHz"}. Add it to insert it into the route.`); }} /></Suspense> : <div className="mt-3 flex h-56 items-center justify-center rounded-lg border border-border bg-[#0b1118] text-sm text-muted">Loading navigation map…</div>}
              <div className="mt-3 rounded-lg border border-border bg-surface p-3" aria-label="Complete route sequence">
                <div className="font-display text-xs font-semibold uppercase tracking-wider">Route sequence · airport endpoints included</div>
                <div className="mt-2 space-y-2">
                  <div className="flex items-center gap-3 rounded-md border border-sky-400/40 bg-sky-400/5 px-3 py-2">
                    <span className="grid size-7 place-items-center rounded-full border border-sky-400 text-[10px] font-bold text-sky-300">DEP</span>
                    <div className="min-w-0 flex-1"><div className="text-sm font-semibold">{plan.departure || "Departure not set"}</div><div className="text-xs text-muted">{AIRPORT_COORDS[plan.departure]?.label ?? "Airport reference not available in local coordinate table"}</div></div>
                    <span className="text-[10px] text-sky-300">START</span>
                  </div>
                  {plan.waypoints.map((wp, index) => <div key={`route-seq-${wp.id}-${index}`} className="flex items-center gap-3 rounded-md border border-border px-3 py-2"><span className="grid size-7 place-items-center rounded-full border border-accent/60 text-[10px] font-bold">{index + 1}</span><div className="min-w-0 flex-1"><div className="text-sm font-semibold">{wp.name}</div><div className="text-xs text-muted">{wp.latitude.toFixed(5)}, {wp.longitude.toFixed(5)}</div></div><span className="text-[10px] text-muted">WAYPOINT</span></div>)}
                  {plan.ils && <div className="flex items-center gap-3 rounded-md border border-rose-400/40 bg-rose-400/5 px-3 py-2"><span className="grid size-7 place-items-center rounded-full border border-rose-400 text-[10px] font-bold text-rose-300">ILS</span><div className="min-w-0 flex-1"><div className="text-sm font-semibold">{plan.ils.ident} · RWY {plan.ils.runway}</div><div className="text-xs text-muted">{plan.ils.name} · {plan.ils.frequencyMHz.toFixed(2)} MHz · course {String(Math.round(plan.ils.courseMag)).padStart(3, "0")}°</div></div><button type="button" onClick={clearIls} className="rounded p-2 text-muted hover:bg-raised" aria-label="Remove ILS from the plan"><Trash2 className="size-4"/></button></div>}
                  <div className="flex items-center gap-3 rounded-md border border-amber-400/40 bg-amber-400/5 px-3 py-2"><span className="grid size-7 place-items-center rounded-full border border-amber-400 text-[10px] font-bold text-amber-300">ARR</span><div className="min-w-0 flex-1"><div className="text-sm font-semibold">{plan.destination || "Destination not set"}</div><div className="text-xs text-muted">{AIRPORT_COORDS[plan.destination]?.label ?? "Airport reference not available in local coordinate table"}</div></div><span className="text-[10px] text-amber-300">END</span></div>
                </div>
                <p className="mt-2 text-[11px] text-muted">Use “Use as departure” or “Use as destination” on the map to update the airport endpoint rows, and “Use as ILS” on an ILS/LOC station to set the approach ILS. The ILS row is guidance for the approach, not a route endpoint; the VOR/NDB/ILS stations in this route are what the Navigation map tunes, in order.</p>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <input value={waypointName} onChange={(e) => setWaypointName(e.target.value.toUpperCase())} className={inputClass} placeholder="Waypoint ID" aria-label="Waypoint identifier"/>
                <input type="number" step="0.00001" value={waypointLat} onChange={(e) => setWaypointLat(e.target.value)} className={inputClass} aria-label="Waypoint latitude" placeholder="Latitude (decimal degrees)"/>
                <input type="number" step="0.00001" value={waypointLon} onChange={(e) => setWaypointLon(e.target.value)} className={inputClass} aria-label="Waypoint longitude" placeholder="Longitude (decimal degrees)"/>
                <div className="grid grid-cols-2 gap-2"><input type="number" value={waypointAlt} onChange={(e) => setWaypointAlt(e.target.value)} className={inputClass} aria-label="Waypoint planned altitude in feet" placeholder="Altitude ft"/><input type="number" value={waypointSpeed} onChange={(e) => setWaypointSpeed(e.target.value)} className={inputClass} aria-label="Waypoint planned speed in knots" placeholder="Speed kt"/></div>
                <div className="flex flex-wrap gap-2 sm:col-span-2"><Button onClick={addSelectedNavaid} disabled={!selectedNavaidId}>Add selected station</Button><Button variant="secondary" onClick={addWaypoint}>Add custom waypoint with coordinates</Button></div>
              </div>
              {plan.waypoints.length === 0 ? <p className="mt-3 rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted">No waypoints added yet.</p> : <div className="mt-3 space-y-2">{plan.waypoints.map((wp, index) => <div key={`${wp.id}-${index}`} className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface px-3 py-2"><span className="grid size-7 place-items-center rounded-full bg-raised font-mono text-xs">{index + 1}</span><div className="min-w-0 flex-1"><div className="font-display font-semibold">{wp.name}</div><div className="text-xs text-muted">{wp.latitude.toFixed(5)}, {wp.longitude.toFixed(5)} · Plan {fmt(wp.altitudeFt)} ft · {wp.speedKt ? `${wp.speedKt} kt` : "No speed constraint"} · {wp.source === "charted" ? "Chart/AIP catalog" : wp.source === "vector" ? "Synthetic vector" : "User/screenshot-derived"}</div></div><div className="flex items-center gap-1"><button type="button" disabled={index === 0} className="rounded p-2 text-muted hover:bg-raised disabled:opacity-30" aria-label={`Move ${wp.name} up`} onClick={() => setPlan((current) => { const waypoints = [...current.waypoints]; [waypoints[index - 1], waypoints[index]] = [waypoints[index], waypoints[index - 1]]; return { ...current, waypoints }; })}><ArrowDownToLine className="size-4 rotate-180"/></button><button type="button" disabled={index === plan.waypoints.length - 1} className="rounded p-2 text-muted hover:bg-raised disabled:opacity-30" aria-label={`Move ${wp.name} down`} onClick={() => setPlan((current) => { const waypoints = [...current.waypoints]; [waypoints[index], waypoints[index + 1]] = [waypoints[index + 1], waypoints[index]]; return { ...current, waypoints }; })}><ArrowDownToLine className="size-4"/></button><button type="button" className="rounded p-2 text-muted hover:bg-raised hover:text-warn" aria-label={`Remove ${wp.name}`} onClick={() => setPlan((current) => ({ ...current, waypoints: current.waypoints.filter((item) => item.id !== wp.id) }))}><Trash2 className="size-4"/></button></div></div>)}</div>}
            </div>
          </section>

          <div className="space-y-4">
            <section className="rounded-xl border border-border bg-panel p-4 sm:p-5">
              <SectionTitle icon={<MapPinned className="size-4"/>} title="Geographic route map" subtitle="Geographic endpoints and entered waypoint coordinates"/>
              <GeographicRouteMap departure={plan.departure || "----"} destination={plan.destination || "DEST?"} alternate={plan.alternate} waypoints={plan.waypoints} navigation={aircraftNav}/>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Metric label="Departure" value={plan.departure || "—"}/><Metric label="Destination" value={plan.destination || "Not set"}/><Metric label="Waypoints" value={String(plan.waypoints.length)}/>{plan.destinationKind === "point-of-interest" && plan.destinationLat != null && plan.destinationLon != null && <Metric label="Destination coordinates" value={`${plan.destinationLat.toFixed(5)}, ${plan.destinationLon.toFixed(5)}`}/> }
              </div>
              {!canSave && <p className="mt-3 text-xs text-caution">Enter a valid four-character departure and destination ICAO identifier before saving this as a complete route.</p>}
            </section>
            <section className="rounded-xl border border-border bg-panel p-4 sm:p-5">
              <SectionTitle icon={<ArrowUpRight className="size-4"/>} title="Cruise profile" subtitle="Top-of-climb, cruise altitude and descent planning"/>
              <div className="mt-3 overflow-hidden rounded-lg border border-border bg-[#111820] p-2">
                <svg viewBox="0 0 600 310" role="img" aria-label="Illustrative vertical flight profile from departure through climb, cruise, descent and approach" className="h-auto w-full">
                  <defs><linearGradient id="profileFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#55c7b3" stopOpacity="0.32"/><stop offset="100%" stopColor="#55c7b3" stopOpacity="0.02"/></linearGradient></defs>
                  {Array.from({ length: 6 }, (_, i) => <g key={i}><line x1="54" y1={26 + i * 45} x2="578" y2={26 + i * 45} stroke="#44505c" strokeDasharray="4 5"/><text x="45" y={30 + i * 45} textAnchor="end" fontSize="11" fill="#a6b2c0">{fmt(Math.round((5 - i) * plan.cruiseAltitudeFt / 5))}</text></g>)}
                  <text x="14" y="160" transform="rotate(-90 14 160)" fontSize="11" fill="#a6b2c0">Altitude (ft)</text>
                  <path d={profile.path + " L578 251 L54 251 Z"} fill="url(#profileFill)"/>
                  <path d={profile.path} fill="none" stroke="#55c7b3" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/>
                  {profile.points.map((point) => <g key={point.label}><circle cx={point.x} cy={point.y} r="4" fill="#d5fff5" stroke="#55c7b3" strokeWidth="2"/><text x={point.x} y={Math.max(15, point.y - 12)} textAnchor="middle" fontSize="10" fill="#edf5f7">{point.label}</text></g>)}
                  {[[54,"DEP"],[150,"CLB"],[270,"CRZ"],[390,"DSC"],[490,"APP"],[578,"ARR"]].map(([x,label]) => <text key={String(label)} x={Number(x)} y="278" textAnchor="middle" fontSize="10" fill="#a6b2c0">{label}</text>)}
                  <text x="316" y="300" textAnchor="middle" fontSize="11" fill="#a6b2c0">Flight phase (schematic, not to scale)</text>
                </svg>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2"><Metric label="Cruise target" value={`${fmt(plan.cruiseAltitudeFt)} ft`}/><Metric label="Cruise speed target" value={`${plan.cruiseSpeedKt} kt`}/></div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Top of climb from departure (NM)"><input type="number" min={0} max={1500} value={plan.cruiseTopOfClimbNm} onChange={(e) => update("cruiseTopOfClimbNm", clamp(Number(e.target.value) || 0, 0, 1500))} className={inputClass}/></Field><Field label="En-route time compression"><select value={plan.timeCompression ?? 15} onChange={(e) => update("timeCompression", Number(e.target.value))} className={inputClass}><option value={1}>1x (real time)</option><option value={5}>5x</option><option value={10}>10x</option><option value={15}>15x (default)</option><option value={20}>20x</option></select></Field><Field label="Descent start before destination (NM)"><input type="number" min={0} max={1500} value={plan.descentStartNm} onChange={(e) => update("descentStartNm", clamp(Number(e.target.value) || 0, 0, 1500))} className={inputClass}/></Field></div>
              <p className="mt-3 text-xs leading-relaxed text-muted">Planning visualization only. It does not calculate aircraft performance, fuel burn, terrain clearance, step climbs or ATC restrictions.</p>
            </section>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-xl border border-border bg-panel p-4 sm:p-5">
            <SectionTitle icon={<ArrowUpRight className="size-4"/>} title="Landing profile" subtitle="Descent and approach targets, separate from cruise planning"/>
            <div className="mt-3 rounded-md border border-border bg-inset p-3"><div className="font-display text-xs font-semibold uppercase tracking-wider">ILS / localizer to use</div><p className="mt-1 text-xs text-muted">Select the approach station for the chosen arrival runway separately from the destination airport. The airport marker defines where the route ends; the ILS frequency supplies approach guidance. You can also tap an ILS/LOC station on the map and choose “Use as ILS”.</p>
              <div className="mt-2 flex flex-wrap items-center gap-2"><select aria-label="ILS / localizer" value={plan.ils?.id ?? ""} onChange={(e) => { if (!e.target.value) { clearIls(); return; } const n = CHANGI_NAVAIDS.find((x) => x.id === e.target.value); if (n) setIls(n); }} className={inputClass + " min-w-0 flex-1"}><option value="">No ILS selected</option>{[...CHANGI_NAVAIDS.filter((n) => n.available && isIlsNavaid(n))].sort((a, b) => Number(b.airport === plan.destination.trim().toUpperCase()) - Number(a.airport === plan.destination.trim().toUpperCase())).map((n) => <option key={n.id} value={n.id}>{n.airport} RWY {n.runway ?? "?"} · {n.ident} {n.frequency.toFixed(2)} MHz · {String(Math.round(n.courseMag ?? 0)).padStart(3, "0")}°</option>)}</select>{plan.ils && <Button variant="secondary" onClick={clearIls}>Clear ILS</Button>}</div>
              {plan.ils && <p className="mt-2 text-xs text-fg">Selected: <strong>{plan.ils.ident}</strong> · {plan.ils.name} · {plan.ils.frequencyMHz.toFixed(2)} MHz · course {String(Math.round(plan.ils.courseMag)).padStart(3, "0")}°</p>}</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Initial approach target altitude (ft)"><input type="number" min={0} max={20000} step={500} value={plan.approachAltitudeFt} onChange={(e) => update("approachAltitudeFt", clamp(Number(e.target.value) || 0, 0, 20000))} className={inputClass}/></Field>
              <Field label="Arrival runway"><input value={plan.arrivalRunway} onChange={(e) => update("arrivalRunway", e.target.value.toUpperCase().slice(0, 3))} className={inputClass} placeholder="Select from current chart"/></Field>
            </div>
            <div className="mt-3 rounded-lg border border-border bg-[#111820] p-2">
              <svg viewBox="0 0 600 180" className="h-auto w-full" role="img" aria-label="Landing profile schematic showing descent to approach altitude and runway">
                <defs><linearGradient id="landingFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#e9b86c" stopOpacity="0.3"/><stop offset="100%" stopColor="#e9b86c" stopOpacity="0.02"/></linearGradient></defs>
                {[0,1,2,3].map((i)=><line key={i} x1="44" y1={20+i*38} x2="580" y2={20+i*38} stroke="#44505c" strokeDasharray="4 5"/>)}
                <path d={`M48 30 L210 45 L345 ${Math.max(75, 130-plan.approachAltitudeFt/20000*35)} L500 145 L580 145 L580 160 L48 160 Z`} fill="url(#landingFill)"/>
                <path d={`M48 30 L210 45 L345 ${Math.max(75, 130-plan.approachAltitudeFt/20000*35)} L500 145 L580 145`} fill="none" stroke="#e9b86c" strokeWidth="3" strokeLinejoin="round"/>
                <text x="48" y="18" fontSize="10" fill="#edf5f7">DESCENT</text><text x="345" y="65" fontSize="10" fill="#edf5f7" textAnchor="middle">APPROACH {fmt(plan.approachAltitudeFt)} ft</text><text x="550" y="132" fontSize="10" fill="#edf5f7" textAnchor="middle">RWY</text><text x="300" y="175" fontSize="10" fill="#a6b2c0" textAnchor="middle">Schematic only · chart constraints not loaded</text>
              </svg>
            </div>
            <p className="mt-2 text-xs text-muted">Approach altitude is a planning target, not a published minimum or a command to the aircraft.</p>
          </section>
          <section className="rounded-xl border border-border bg-panel p-4 sm:p-5">
            <SectionTitle icon={<ClipboardList className="size-4"/>} title="Procedures and runway selection" subtitle="Enter identifiers from current official aeronautical charts"/>
            <div className="mt-3 grid gap-3">
              {plan.departure === "RPLL" ? <Field label="Charted RPLL SID (AIP AMDT 003/25, published fix coordinates)"><select value="" onChange={(e) => { if (e.target.value) applySid(e.target.value); }} className={inputClass}><option value="">Select a SID for RWY {plan.departureRunway || "?"}…</option>{Object.keys(RPLL_SIDS).map((base) => { const name = sidProcedureName(base, plan.departureRunway); return <option key={base} value={base} disabled={!name}>{name ?? `${base} (RWY ${plan.departureRunway || "?"} not encoded)`}</option>; })}</select></Field> : null}
              <Field label="Departure SID"><input value={plan.sid} onChange={(e) => update("sid", e.target.value.toUpperCase())} className={inputClass} placeholder="Charted SID identifier"/></Field>
              <Field label="En-route ATS route / waypoint sequence"><textarea value={plan.enrouteRoute} onChange={(e) => update("enrouteRoute", e.target.value.toUpperCase())} className={`${inputClass} min-h-20`} placeholder="Enter charted route and fixes"/></Field>
              <Field label="Arrival STAR"><input value={plan.star} onChange={(e) => update("star", e.target.value.toUpperCase())} className={inputClass} placeholder="Charted STAR identifier"/></Field>
              <Button variant="secondary" onClick={applyVectorArrival} className="gap-2"><RouteIcon className="size-4"/> Use vectored ILS arrival (WSSS RWY 02L)</Button>
              <Field label="Approach procedure"><input value={plan.approach} onChange={(e) => update("approach", e.target.value.toUpperCase())} className={inputClass} placeholder="e.g. charted ILS/RNAV approach identifier"/></Field>
              <label className="flex items-start gap-2 rounded-md border border-caution/30 bg-caution/10 p-3 text-sm"><input type="checkbox" checked={plan.procedureStatus === "chart-checked"} onChange={(e) => update("procedureStatus", e.target.checked ? "chart-checked" : "unverified")} className="mt-1"/><span><strong>Procedures checked against current charts</strong><span className="mt-1 block text-xs text-muted">Only check this after manually verifying SID, en-route route, STAR, approach and runways against current official charts. The application does not verify these fields automatically.</span></span></label>
              <div className="rounded-md border border-border bg-inset px-3 py-2 text-sm"><strong>Status:</strong> {plan.procedureStatus === "chart-checked" ? "User marked chart-checked (not independently verified by Oersted)." : "Unverified — procedure names and runway selections are not confirmed."}</div>
            </div>
          </section>
        </div>

        <section className="rounded-xl border border-border bg-inset p-4">
          <div className="flex items-start gap-3"><ArrowDownToLine className="mt-0.5 size-5 text-accent"/><div><h2 className="font-display text-base font-semibold">Next integration milestone</h2><p className="mt-1 text-sm leading-relaxed text-muted">The active plan now initializes a shared geographic position and tracks it from the simulated aircraft heading and groundspeed. Next, refine airport/runway reference points and connect course guidance to the supported navigation equipment. The existing 737-200 avionics and autopilot logic should remain configuration-appropriate; this page does not add FMC, LNAV or VNAV capability.</p></div></div>
        </section>
      </div>
    </AppShell>
  );
}

function makeProfile(cruiseAltitude: number) {
  const safeAlt = Math.max(0, Math.min(41000, cruiseAltitude));
  const raw = [{x:54,y:251,label:""},{x:100,y:251-safeAlt/41000*190,label:"TO"},{x:170,y:251-safeAlt/41000*220,label:"CLB"},{x:270,y:251-safeAlt/41000*220,label:"CRZ"},{x:365,y:251-safeAlt/41000*175,label:"DSC"},{x:465,y:251-safeAlt/41000*65,label:"APP"},{x:578,y:251,label:""}];
  return { points: raw.filter((p) => p.label), path: raw.map((p,i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ") };
}
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
const inputClass = "min-w-0 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg outline-none transition focus:border-accent focus:ring-1 focus:ring-accent";
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block min-w-0"><span className="mb-1.5 block font-display text-[11px] font-semibold uppercase tracking-[0.13em] text-subtle">{label}</span>{children}</label>; }
function SectionTitle({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) { return <div className="flex items-start gap-2.5"><span className="mt-0.5 text-accent">{icon}</span><div><h2 className="font-display text-lg font-semibold">{title}</h2><p className="text-xs text-muted">{subtitle}</p></div></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-md border border-border bg-inset px-3 py-2"><div className="font-display text-[10px] uppercase tracking-[0.15em] text-subtle">{label}</div><div className="mt-1 truncate font-mono text-sm font-semibold text-fg">{value}</div></div>; }
function GeographicRouteMap({ departure, destination, alternate, waypoints, navigation }: { departure: string; destination: string; alternate: string; waypoints: Waypoint[]; navigation: FlightNavigationState | null }) {
  const start = AIRPORT_COORDS[departure];
  const end = AIRPORT_COORDS[destination];
  const coords = [ ...(start ? [{ name: departure, lat: start.lat, lon: start.lon, kind: "airport" }] : []), ...waypoints.filter(w => Number.isFinite(w.latitude) && Number.isFinite(w.longitude) && (w.latitude !== 0 || w.longitude !== 0)).map(w => ({ name: w.name, lat: w.latitude, lon: w.longitude, kind: "waypoint" })), ...(end ? [{ name: destination, lat: end.lat, lon: end.lon, kind: "airport" }] : []) ];
  const routeCoords = coords.length ? coords : [{ name: departure, lat: 14.5086, lon: 121.0198, kind: "airport" }, { name: destination, lat: 1.3502, lon: 103.9940, kind: "airport" }];
  const hasAircraft = !!navigation && navigation.positionMode !== "NO GEOGRAPHIC REFERENCE" && Number.isFinite(navigation.latitude) && Number.isFinite(navigation.longitude);
  const boundsPoints = [...routeCoords, ...(hasAircraft ? [{ lat: navigation!.latitude, lon: navigation!.longitude }] : [])];
  const minLat = Math.min(...boundsPoints.map(p=>p.lat)) - 1.0, maxLat = Math.max(...boundsPoints.map(p=>p.lat)) + 1.0;
  const minLon = Math.min(...boundsPoints.map(p=>p.lon)) - 1.0, maxLon = Math.max(...boundsPoints.map(p=>p.lon)) + 1.0;
  const project = (lat:number, lon:number) => ({ x: 42 + (lon-minLon)/Math.max(0.1,maxLon-minLon)*516, y: 25 + (maxLat-lat)/Math.max(0.1,maxLat-minLat)*205 });
  const pts = routeCoords.map(p => ({ ...p, ...project(p.lat,p.lon) }));
  const aircraftPoint = hasAircraft ? project(navigation!.latitude, navigation!.longitude) : null;
  const distance = start && end ? haversineNm(start.lat,start.lon,end.lat,end.lon) : null;
  return <div className="mt-3 rounded-lg border border-border bg-[#111820] p-2">
    <svg viewBox="0 0 600 270" role="img" aria-label={`Geographic route map from ${departure} to ${destination}${hasAircraft ? " with simulated aircraft position" : ""}`} className="h-auto w-full">
      <defs><pattern id="geoGrid" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0H0V30" fill="none" stroke="#35414e" strokeWidth="0.7"/></pattern></defs><rect width="600" height="270" fill="url(#geoGrid)"/>
      {[0,1,2,3,4,5].map(i=><g key={i}><line x1={42+i*103} y1="18" x2={42+i*103} y2="238" stroke="#45515d" strokeDasharray="2 6"/><text x={42+i*103} y="254" textAnchor="middle" fontSize="9" fill="#8d9cab">{(minLon+(maxLon-minLon)*i/5).toFixed(1)}°E</text></g>)}
      <path d={pts.map((p,i)=>`${i===0?"M":"L"}${p.x} ${p.y}`).join(" ")} fill="none" stroke="#55c7b3" strokeWidth="2.5" strokeDasharray="6 4"/>
      {pts.map((p,i)=><g key={`${p.name}-${i}`}><circle cx={p.x} cy={p.y} r={p.kind==="airport"?6:4.5} fill={p.kind==="airport"?"#e9b86c":"#55c7b3"} stroke="#101820" strokeWidth="2"/><text x={p.x} y={p.y+(p.y<42?16:-10)} textAnchor="middle" fontSize="10" fill="#edf5f7">{p.name}</text></g>)}
      {aircraftPoint && <g><circle cx={aircraftPoint.x} cy={aircraftPoint.y} r="9" fill="#e5f5ff" fillOpacity="0.16" stroke="#8bd5ff" strokeWidth="1.5"/><path d={`M ${aircraftPoint.x} ${aircraftPoint.y-7} L ${aircraftPoint.x+5} ${aircraftPoint.y+5} L ${aircraftPoint.x} ${aircraftPoint.y+2} L ${aircraftPoint.x-5} ${aircraftPoint.y+5} Z`} fill="#8bd5ff" stroke="#10202c" strokeWidth="1"/><text x={aircraftPoint.x+10} y={aircraftPoint.y-9} fontSize="10" fill="#8bd5ff">AIRCRAFT</text></g>}
      <text x="12" y="266" fontSize="9" fill="#a6b2c0">ROUTE GEOMETRY + SIMULATED POSITION · NOT A CHARTED ATS ROUTE</text>
    </svg>
    <div className="mt-2 grid grid-cols-2 gap-2"><Metric label={`${departure} reference`} value={start?`${start.lat.toFixed(4)}, ${start.lon.toFixed(4)}`:"Coordinates not in local airport table"}/><Metric label={`${destination} reference`} value={end?`${end.lat.toFixed(4)}, ${end.lon.toFixed(4)}`:"Coordinates not in local airport table"}/></div>
    {distance !== null && <p className="mt-2 text-xs text-muted">Great-circle reference: approximately {Math.round(distance).toLocaleString("en-US")} NM. Straight-line reference only; the actual route depends on charted procedures, airways, clearances and restrictions.</p>}
    {hasAircraft && <p className="mt-1 text-xs text-muted">Aircraft position: {navigation!.latitude.toFixed(4)}, {navigation!.longitude.toFixed(4)} · {navigation!.positionMode.toLowerCase()}.</p>}
    {alternate && <p className="mt-1 text-xs text-muted">Alternate {alternate}: {AIRPORT_COORDS[alternate] ? `${AIRPORT_COORDS[alternate].lat.toFixed(4)}, ${AIRPORT_COORDS[alternate].lon.toFixed(4)}` : "not plotted (add airport coordinates to local table)"}.</p>}
  </div>;
}
function haversineNm(lat1:number, lon1:number, lat2:number, lon2:number) { const r=3440.065; const rad=(v:number)=>v*Math.PI/180; const dLat=rad(lat2-lat1), dLon=rad(lon2-lon1); const a=Math.sin(dLat/2)**2+Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLon/2)**2; return 2*r*Math.asin(Math.sqrt(a)); }
