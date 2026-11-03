import { useState } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { CHANGI_NAVAIDS, type Navaid } from "@/lib/sim/navaids-changi";
import { AIRPORT_COORDS } from "@/lib/sim/airportCoords";

/** Leaflet touches `window` when it is imported, so this file must only be loaded in the browser (see the lazy import in routes/flight-plan.tsx). */
const isIlsNavaid = (n: Navaid) => n.kind === "ILS" || n.kind === "LOC";

export default function NavaidStationPicker({ departure, destination, selectedId, ilsId, onSelect, onSetDeparture, onSetDestination, onSetIls }: { departure: string; destination: string; selectedId: string; ilsId?: string; onSelect: (station: Navaid) => void; onSetDeparture: (code: string) => void; onSetDestination: (code: string) => void; onSetIls: (station: Navaid) => void }) {
  const [visibleKinds, setVisibleKinds] = useState({ vor: true, ndb: true, ils: true });
  const stations = CHANGI_NAVAIDS.filter((n) => {
    if (!n.available) return false;
    if (n.kind === "VOR" || n.kind === "VOR_DME") return visibleKinds.vor;
    if (n.kind === "NDB") return visibleKinds.ndb;
    if (n.kind === "ILS" || n.kind === "LOC") return visibleKinds.ils;
    return false;
  });
  const selected = stations.find((n) => n.id === selectedId);
  const labelKind = (kind: Navaid["kind"]) => kind === "VOR" || kind === "VOR_DME" ? "VOR" : kind === "NDB" ? "NDB" : "ILS/LOC";
  const markerIcon = (station: Navaid, chosen: boolean) => {
    const kind = labelKind(station.kind);
    // Match the compact Navigation Trainer symbology: dark marker, light border,
    // and a centered dot/compass mark instead of oversized colored geometry.
    const border = chosen ? "#fbbf24" : "#e7edf4";
    const symbol = kind === "VOR"
      ? `<rect x="4" y="4" width="16" height="16" rx="2" fill="#182534" stroke="${border}" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="#e7edf4"/>`
      : kind === "NDB"
        ? `<circle cx="12" cy="12" r="8" fill="#182534" stroke="${border}" stroke-width="2"/><path d="M12 7 L12 17 M7 12 L17 12" stroke="#e7edf4" stroke-width="1.5"/>`
        : `<rect x="3" y="7" width="18" height="10" rx="1" fill="#182534" stroke="${border}" stroke-width="2"/><circle cx="12" cy="12" r="2" fill="#e7edf4"/>`;
    return L.divIcon({ className: "oersted-navaid-map-marker", html: `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">${chosen ? '<circle cx="12" cy="12" r="11" fill="none" stroke="#f8fafc" stroke-width="1.5"/>' : ""}${symbol}</svg>`, iconSize: [14, 14], iconAnchor: [7, 7] });
  };
  if (typeof window === "undefined") return <div className="mt-3 flex h-56 items-center justify-center rounded-lg border border-border bg-[#0b1118] text-sm text-muted">Loading navigation map…</div>;
  return <div className="mt-3 overflow-hidden rounded-lg border border-border bg-[#0b1118]">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2"><div className="text-xs font-semibold text-fg">Select a station on the map</div><div className="text-[10px] text-muted">Pan and zoom the chart; tap a station symbol to select</div></div>
    <div className="w-full" style={{ height: "min(48svh, 440px)", minHeight: "260px" }}>
      <MapContainer center={[10.5, 114.5]} zoom={4} minZoom={2} maxZoom={12} scrollWheelZoom style={{ height: "100%", width: "100%", background: "#0d1217" }}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
        {([ { code: departure.trim().toUpperCase(), role: "DEP", color: "#38bdf8" }, { code: destination.trim().toUpperCase(), role: "DEST", color: "#fbbf24" } ] as const).map((airport) => {
          const point = AIRPORT_COORDS[airport.code];
          if (!point) return null;
          const airportIcon = L.divIcon({ className: "oersted-airport-map-marker", html: `<span style="display:flex;align-items:center;gap:3px;white-space:nowrap;font:700 9px/1 sans-serif;color:#f8fafc;text-shadow:0 1px 3px #000"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${airport.color};border:1px solid #fff;box-shadow:0 0 0 2px #101820"></span><span style="background:#101820dd;border:1px solid ${airport.color};border-radius:3px;padding:2px 3px">${airport.role} ${airport.code}</span></span>`, iconSize: [62, 16], iconAnchor: [5, 8] });
          return <Marker key={`airport-${airport.role}-${airport.code}`} position={[point.lat, point.lon]} icon={airportIcon} zIndexOffset={1000}><Popup><strong>{airport.role} · {airport.code}</strong><br />{point.label}<br />Airport endpoint (not a radio-navigation station).<div style={{display:"flex",gap:"6px",marginTop:"8px",flexWrap:"wrap"}}>{airport.role === "DEP" ? <button type="button" style={{padding:"5px 7px",border:"1px solid #38bdf8",borderRadius:"5px",background:"#101820",color:"#f8fafc",fontSize:"11px"}} onClick={() => onSetDeparture(airport.code)}>Use as departure</button> : <button type="button" style={{padding:"5px 7px",border:"1px solid #fbbf24",borderRadius:"5px",background:"#101820",color:"#f8fafc",fontSize:"11px"}} onClick={() => onSetDestination(airport.code)}>Use as destination</button>}</div></Popup></Marker>;
        })}
        {stations.map((station) => <Marker key={station.id} position={[station.lat, station.lon]} icon={markerIcon(station, selectedId === station.id)} eventHandlers={{ click: () => onSelect(station) }}>
          <Popup><strong>{station.ident} · {station.name}</strong><br />{station.frequency} {station.kind === "NDB" ? "kHz" : "MHz"} · {station.kind.replace("_", "/")}<br />{station.source}{isIlsNavaid(station) ? <div style={{display:"flex",gap:"6px",marginTop:"8px",flexWrap:"wrap"}}><button type="button" style={{padding:"5px 7px",border:"1px solid #fb7185",borderRadius:"5px",background:"#101820",color:"#f8fafc",fontSize:"11px"}} onClick={() => onSetIls(station)}>{ilsId === station.id ? "ILS selected ✓" : "Use as ILS"}</button></div> : null}</Popup>
        </Marker>)}
      </MapContainer>
    </div>
    <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-2 py-1.5 text-[9px] leading-tight text-muted" aria-label="Map station filters">
      <button type="button" aria-pressed={visibleKinds.vor} onClick={() => setVisibleKinds((v) => ({ ...v, vor: !v.vor }))} style={{ fontSize: "8px", lineHeight: "10px", padding: "2px 4px", minHeight: 0 }} className={`inline-flex items-center gap-1 rounded border ${visibleKinds.vor ? "border-sky-400/60 bg-sky-400/10 text-sky-200" : "border-border opacity-60"}`}><svg width="9" height="9" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1 L1 10 L11 10 Z" fill="#38bdf8"/></svg>VOR</button>
      <button type="button" aria-pressed={visibleKinds.ndb} onClick={() => setVisibleKinds((v) => ({ ...v, ndb: !v.ndb }))} style={{ fontSize: "8px", lineHeight: "10px", padding: "2px 4px", minHeight: 0 }} className={`inline-flex items-center gap-1 rounded border ${visibleKinds.ndb ? "border-violet-400/60 bg-violet-400/10 text-violet-200" : "border-border opacity-60"}`}><svg width="9" height="9" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1 L11 6 L6 11 L1 6 Z" fill="#a78bfa"/></svg>NDB</button>
      <button type="button" aria-pressed={visibleKinds.ils} onClick={() => setVisibleKinds((v) => ({ ...v, ils: !v.ils }))} style={{ fontSize: "8px", lineHeight: "10px", padding: "2px 4px", minHeight: 0 }} className={`inline-flex items-center gap-1 rounded border ${visibleKinds.ils ? "border-rose-400/60 bg-rose-400/10 text-rose-200" : "border-border opacity-60"}`}><svg width="9" height="9" viewBox="0 0 12 12" aria-hidden="true"><rect x="1" y="1" width="10" height="10" rx="1" fill="#fb7185"/></svg>ILS/LOC</button>
      <button type="button" onClick={() => setVisibleKinds({ vor: true, ndb: false, ils: false })} style={{ fontSize: "8px", lineHeight: "10px", padding: "2px 4px", minHeight: 0 }} className="rounded border border-border hover:bg-raised">VOR only</button>
      <button type="button" onClick={() => setVisibleKinds({ vor: false, ndb: true, ils: false })} style={{ fontSize: "8px", lineHeight: "10px", padding: "2px 4px", minHeight: 0 }} className="rounded border border-border hover:bg-raised">NDB only</button>
      <button type="button" onClick={() => setVisibleKinds({ vor: true, ndb: true, ils: true })} style={{ fontSize: "8px", lineHeight: "10px", padding: "2px 4px", minHeight: 0 }} className="rounded border border-border hover:bg-raised">All</button>
      <span className="basis-full px-0.5">Selected station has a white ring.</span>
    </div>
    {selected && <div className="grid gap-2 border-t border-border bg-[#14212d] p-3 sm:grid-cols-[1fr_auto] sm:items-center"><div><div className="text-sm font-semibold text-white">{selected.ident} · {selected.name}</div><div className="mt-1 text-xs text-slate-300">{selected.frequency} {selected.kind === "NDB" ? "kHz" : "MHz"} · {selected.kind.replace("_", "/")} · {selected.lat.toFixed(5)}, {selected.lon.toFixed(5)}</div><div className="mt-1 text-[10px] text-slate-400">{selected.source}</div></div>{isIlsNavaid(selected) ? <button type="button" onClick={() => onSetIls(selected)} className="rounded border border-rose-400 bg-rose-400/10 px-3 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-400/20">{ilsId === selected.id ? "ILS selected ✓" : "Use as ILS"}</button> : <span className="rounded border border-border px-2 py-1 text-[10px] text-slate-200">AVAILABLE IN PLANNER</span>}</div>}
  </div>;
}

