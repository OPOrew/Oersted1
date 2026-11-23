@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.oersted.trainer.ui.flightplan

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.oersted.trainer.platform.PlanStore
import com.oersted.trainer.sim.FlightPlanDraft
import com.oersted.trainer.sim.FlightPlanEdits
import com.oersted.trainer.sim.FlightPlanIls
import com.oersted.trainer.sim.FlightPlanPageRules as R
import com.oersted.trainer.sim.FlightPlanPresets
import com.oersted.trainer.sim.FlightPlanProcedures
import com.oersted.trainer.sim.FlightRoute
import com.oersted.trainer.sim.NavData
import com.oersted.trainer.sim.NavaidsChangi
import com.oersted.trainer.ui.cockpit.CockpitModel
import com.oersted.trainer.ui.common.Classic737Palette
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * Port of routes/flight-plan.tsx, in the web's order: header with the preset / load / save / reset buttons, integration
 * status and notice, "Aircraft navigation state", "Departure and destination airports" (fields, station map, route
 * sequence, waypoint editor), "Geographic route map", "Cruise profile", "Landing profile", "Procedures and runway selection"
 * and the milestone card. The web's two-column (xl) layouts are stacked, as on its phone breakpoint. Pure logic is in
 * FlightPlanPageRules / FlightPlanEdits / FlightPlanIls / FlightPlanProcedures; drawings in FlightPlanDrawings.kt;
 * the Leaflet station picker is NavaidStationPickerView.kt. Not compiled in the sandbox (needs the Android SDK).
 */
@Composable
fun FlightPlanScreen(store: PlanStore, cockpit: CockpitModel) {
    val scheme = MaterialTheme.colorScheme
    var plan by remember { mutableStateOf(store.load()) }
    var notice by remember { mutableStateOf(if (store.exists()) "Saved flight plan restored from this device." else R.INITIAL_NOTICE) }
    var wpName by remember { mutableStateOf("") }
    var wpAlt by remember { mutableStateOf("10000") }
    var wpSpeed by remember { mutableStateOf("210") }
    var wpLat by remember { mutableStateOf("") }
    var wpLon by remember { mutableStateOf("") }
    var selectedNavaidId by remember { mutableStateOf("") }
    // The web keeps the plan in localStorage continuously, not only on Save.
    LaunchedEffect(plan) { store.save(plan) }

    val aircraftNav by cockpit.navState.collectAsState()
    val mip by cockpit.mipState.collectAsState()
    val canSave = R.canSave(plan.departure, plan.destination)
    val muted = scheme.onSurfaceVariant

    /** publishAndArm: publish the plan, preset the runway heading and arm PLAN NAV. Returns the runway heading. */
    fun publishAndArm(p: FlightPlanDraft): Double? {
        cockpit.activate(p)
        return FlightRoute.departureRunwayHeadingMag(p.toActive(Instant.now().toString()))
    }

    fun setIls(station: NavaidsChangi.Navaid) {
        if (!FlightPlanIls.isIlsNavaid(station)) { notice = "${station.ident} is not an ILS / localizer station."; return }
        val keepsVectors = plan.arrival == null || (plan.arrival!!.sceneId == NavData.WSSS_ILS_02L.id && station.id == "WSSS-ILS-02L")
        val ils = FlightPlanIls.fromNavaid(station)
        plan = FlightPlanIls.set(plan, station)
        selectedNavaidId = station.id
        notice = R.ilsSetNotice(station, ils, plan.destination.trim().uppercase(), keepsVectors)
    }

    fun clearIls() { plan = FlightPlanIls.clear(plan); notice = R.ILS_CLEARED_NOTICE }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        // ── header ──
        PlanSection(color = scheme.surface) {
            Text("FLIGHT OPERATIONS · PLAN-DRIVEN GUIDANCE (PLAN NAV)", color = Classic737Palette.Subtle, fontSize = 11.sp, letterSpacing = 0.2.em)
            Text("✈ Flight Plan & Profile", color = scheme.onSurface, fontSize = 30.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.02).em, modifier = Modifier.padding(top = 4.dp))
            Text(
                "Plan a route, then load it to the aircraft: the route shows on the P8 FreeFlight unit and PLAN NAV can steer the modeled autopilot along it. A real 737-200 has no FMC or LNAV, so this is a trainer aid; the HDG SEL switch and ALT HOLD always override it.",
                color = muted, fontSize = 14.sp, lineHeight = 22.sp, modifier = Modifier.padding(top = 8.dp),
            )
            Box(Modifier.padding(top = 12.dp)) {
                PlanFlow {
                    PlanButton("Load Manila → Singapore preset", variant = PlanBtn.SECONDARY) {
                        val preset = FlightPlanPresets.manilaSingapore()
                        plan = preset; store.save(preset); publishAndArm(preset)
                        notice = R.PRESET_NOTICE
                    }
                    PlanButton("Load to Aircraft", enabled = canSave) {
                        if (!canSave) { notice = R.INVALID_AIRPORTS_NOTICE } else {
                            val hdg = publishAndArm(plan); store.save(plan); notice = R.loadedNotice(plan, hdg)
                        }
                    }
                    PlanButton("Save plan") { store.save(plan); notice = R.SAVED_NOTICE }
                    PlanButton("Reset", variant = PlanBtn.OUTLINE) { plan = FlightPlanDraft(); store.clear(); notice = R.RESET_NOTICE }
                }
            }
            val caution = Classic737Palette.Caution
            Box(Modifier.padding(top = 16.dp).fillMaxWidth().background(caution.copy(alpha = 0.10f), RoundedCornerShape(8.dp)).border(1.dp, caution.copy(alpha = 0.3f), RoundedCornerShape(8.dp)).padding(horizontal = 12.dp, vertical = 8.dp)) {
                Text(
                    "Integration status: Departure and destination airports are explicit route endpoints; added VOR/NDB fixes remain ordered intermediate waypoints. The ILS/localizer you select is the radio-guidance source for the approach (the last radio target in the Navigation map), not a substitute for the destination airport point. Load to Aircraft publishes the route to the P8 FreeFlight FPL display and lines the aircraft up on the departure runway. PLAN NAV follows the active route; on a configured vectored arrival it can tune the ILS and select AUTO APP. Speed is advisory only (no autothrottle). SID, ATS route, STAR, approach and runway selections must be checked against current official charts; this is a training plan, not an operational clearance.",
                    color = scheme.onSurface, fontSize = 14.sp, lineHeight = 20.sp,
                )
            }
            Box(Modifier.padding(top = 12.dp).fillMaxWidth().background(planInset(), RoundedCornerShape(8.dp)).border(1.dp, planBorder(), RoundedCornerShape(8.dp)).padding(horizontal = 12.dp, vertical = 8.dp)) {
                Text(notice, color = muted, fontSize = 14.sp, lineHeight = 20.sp)
            }
            // Aircraft navigation state
            val nav = aircraftNav
            Column(Modifier.padding(top = 12.dp).fillMaxWidth().background(scheme.surfaceVariant.copy(alpha = 0.4f), RoundedCornerShape(12.dp)).border(1.dp, scheme.primary.copy(alpha = 0.3f), RoundedCornerShape(12.dp)).padding(16.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Column(Modifier.weight(1f)) {
                        Text("AIRCRAFT NAVIGATION STATE", color = scheme.onSurface, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.08.em)
                        Text("Shared geographic state driven by simulated heading and groundspeed. PLAN NAV uses it to steer the modeled autopilot.", color = muted, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp))
                    }
                    Text(
                        (nav?.phase?.label ?: "NO ACTIVE PLAN").uppercase(), color = scheme.onSurface, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.05.em,
                        modifier = Modifier.padding(start = 8.dp).border(1.dp, planBorder(), RoundedCornerShape(50)).padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                }
                if (nav != null) {
                    Box(Modifier.padding(top = 12.dp)) { PlanMetricGrid(R.navMetrics(nav), cols = 2) }
                    Box(Modifier.padding(top = 8.dp)) {
                        PlanFlow {
                            PlanButton("Set heading bug to next waypoint", variant = PlanBtn.SECONDARY, enabled = nav.bearingToNextDeg != null) {
                                if (nav.bearingToNextDeg == null) { notice = R.NO_BEARING_NOTICE } else {
                                    val target = FlightPlanEdits.headingBugTarget(nav.bearingToNextDeg, nav.magVarDeg ?: 0.0)
                                    cockpit.updateMip { it.copy(selHdg = target.toDouble()) }
                                    notice = R.headingBugNotice(target, nav.activeLegName)
                                }
                            }
                            PlanButton("PLAN NAV: ${if (mip.planNav) "ARMED" else "OFF"}", variant = if (mip.planNav) PlanBtn.DEFAULT else PlanBtn.OUTLINE) {
                                val next = !mip.planNav
                                cockpit.updateMip { it.copy(planNav = next) }
                                notice = R.planNavNotice(next)
                            }
                        }
                    }
                    Text("Status: ${mip.planNavStatus}", color = muted, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
                    val clock = try { DateTimeFormatter.ofPattern("h:mm:ss a").format(Instant.parse(nav.updatedAt).atZone(ZoneId.systemDefault())) } catch (e: Exception) { nav.updatedAt }
                    Text(R.navFootnote(nav, clock), color = muted, fontSize = 12.sp, lineHeight = 16.sp, modifier = Modifier.padding(top = 8.dp))
                } else {
                    Text("Load a plan to initialize the geographic aircraft position at the departure airport.", color = muted, fontSize = 14.sp, modifier = Modifier.padding(top = 12.dp))
                }
            }
        }

        // ── Departure and destination airports ──
        PlanSection {
            PlanSectionTitle("▤", "Departure and destination airports", "Airport endpoints, runway choices, and planned operating targets")
            Column(Modifier.padding(top = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                PlanField("Callsign / flight ID") { PlanInput(plan.callsign, { plan = plan.copy(callsign = it.uppercase()) }, placeholder = "OERSTED 01") }
                PlanField("Departure airport (ICAO)") { PlanInput(plan.departure, { plan = plan.copy(departure = it.uppercase().take(4)) }, placeholder = "RPLL") }
                PlanField(if (plan.destinationKind == "point-of-interest") "Destination point of interest (sim code)" else "Destination airport (ICAO)") {
                    PlanInput(plan.destination, { plan = plan.copy(destination = it.uppercase().take(4)) }, placeholder = "Enter destination")
                }
                PlanField("Alternate airport (ICAO)") { PlanInput(plan.alternate, { plan = plan.copy(alternate = it.uppercase().take(4)) }, placeholder = "Optional") }
                PlanField("Departure runway") { PlanInput(plan.departureRunway, { plan = plan.copy(departureRunway = it.uppercase().take(3)) }, placeholder = "06") }
                PlanField(if (plan.destinationKind == "point-of-interest") "Arrival runway (not applicable to POI)" else "Arrival runway") {
                    PlanInput(plan.arrivalRunway, { plan = plan.copy(arrivalRunway = it.uppercase().take(3)) }, placeholder = "Set after choosing destination")
                }
                PlanField("Planned cruise altitude (ft)") { PlanNumberInput(plan.cruiseAltitudeFt, 0.0, 0.0, 41000.0) { plan = plan.copy(cruiseAltitudeFt = it) } }
                PlanField("Planned cruise speed (kt) — target only") { PlanNumberInput(plan.cruiseSpeedKt, 100.0, 100.0, 400.0) { plan = plan.copy(cruiseSpeedKt = it) } }
                PlanField("Reserve fuel planning value (lb)") { PlanNumberInput(plan.reserveFuelLb, 0.0, 0.0, 50000.0) { plan = plan.copy(reserveFuelLb = it) } }
                PlanField("Route / airway notes") { PlanInput(plan.routeText, { plan = plan.copy(routeText = it.uppercase()) }, placeholder = "Enter route notes or airway identifiers") }
            }

            // Intermediate navigation waypoints
            Column(Modifier.padding(top = 16.dp).fillMaxWidth().background(planInset(), RoundedCornerShape(8.dp)).border(1.dp, planBorder(), RoundedCornerShape(8.dp)).padding(12.dp)) {
                Text("◈ INTERMEDIATE NAVIGATION WAYPOINTS", color = scheme.onSurface, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.08.em)
                Text("Choose a radio-navigation station from the map or enter a custom fix. Selected stations are appended in route order; altitude and speed are planned constraints, not immediate aircraft commands.", color = muted, fontSize = 12.sp, lineHeight = 18.sp, modifier = Modifier.padding(top = 4.dp))
                NavaidStationPicker(
                    departure = plan.departure, destination = plan.destination, selectedId = selectedNavaidId, ilsId = plan.ils?.id,
                    onSelect = { st ->
                        selectedNavaidId = st.id; wpName = st.ident; wpLat = R.jsNum(st.lat); wpLon = R.jsNum(st.lon)
                        notice = R.stationSelectedNotice(st)
                    },
                    onSetDeparture = { code -> plan = plan.copy(departure = code); notice = "$code set as departure airport endpoint. It is not an intermediate radio waypoint." },
                    onSetDestination = { code -> plan = plan.copy(destination = code); notice = "$code set as destination airport endpoint. Select the ILS approach separately." },
                    onSetIls = { setIls(it) },
                )

                // Route sequence
                Column(Modifier.padding(top = 12.dp).fillMaxWidth().background(scheme.surface, RoundedCornerShape(8.dp)).border(1.dp, planBorder(), RoundedCornerShape(8.dp)).padding(12.dp)) {
                    Text("ROUTE SEQUENCE · AIRPORT ENDPOINTS INCLUDED", color = scheme.onSurface, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.08.em)
                    Column(Modifier.padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        val sky = Color(0xFF7DD3FC); val rose = Color(0xFFFDA4AF); val amber = Color(0xFFFCD34D)
                        RouteRow("DEP", sky, plan.departure.ifEmpty { "Departure not set" }, R.airportLabel(plan.departure), "START", sky, tint = Color(0xFF38BDF8))
                        plan.waypoints.forEachIndexed { index, wp ->
                            RouteRow("${index + 1}", scheme.primary, wp.name, R.latLonText(wp), "WAYPOINT", muted, tint = null)
                        }
                        plan.ils?.let { ils ->
                            RouteRow("ILS", rose, R.ilsRowTitle(ils), R.ilsRowDetail(ils), null, rose, tint = Color(0xFFFB7185), trailing = { PlanIconButton("🗑") { clearIls() } })
                        }
                        RouteRow("ARR", amber, plan.destination.ifEmpty { "Destination not set" }, R.airportLabel(plan.destination), "END", amber, tint = Color(0xFFFBBF24))
                    }
                    Text(
                        "Use “Use as departure” or “Use as destination” on the map to update the airport endpoint rows, and “Use as ILS” on an ILS/LOC station to set the approach ILS. The ILS row is guidance for the approach, not a route endpoint; the VOR/NDB/ILS stations in this route are what the Navigation map tunes, in order.",
                        color = muted, fontSize = 11.sp, lineHeight = 16.sp, modifier = Modifier.padding(top = 8.dp),
                    )
                }

                // custom waypoint inputs
                Column(Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    PlanInput(wpName, { wpName = it.uppercase() }, placeholder = "Waypoint ID")
                    PlanInput(wpLat, { wpLat = it }, placeholder = "Latitude (decimal degrees)", numeric = true, decimal = true)
                    PlanInput(wpLon, { wpLon = it }, placeholder = "Longitude (decimal degrees)", numeric = true, decimal = true)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Box(Modifier.weight(1f)) { PlanInput(wpAlt, { wpAlt = it }, placeholder = "Altitude ft", numeric = true) }
                        Box(Modifier.weight(1f)) { PlanInput(wpSpeed, { wpSpeed = it }, placeholder = "Speed kt", numeric = true) }
                    }
                    PlanFlow {
                        PlanButton("Add selected station", enabled = selectedNavaidId.isNotEmpty()) {
                            val station = NavaidsChangi.CHANGI_NAVAIDS.firstOrNull { it.id == selectedNavaidId && it.available }
                            if (station == null) { notice = R.NO_STATION_NOTICE } else when (val r = FlightPlanEdits.addNavaid(plan, station, wpAlt, wpSpeed)) {
                                is FlightPlanEdits.Result.Refused -> notice = r.reason
                                is FlightPlanEdits.Result.Added -> {
                                    plan = r.draft; wpName = station.ident; wpLat = R.jsNum(station.lat); wpLon = R.jsNum(station.lon)
                                    notice = R.navaidAddedNotice(station)
                                }
                            }
                        }
                        PlanButton("Add custom waypoint with coordinates", variant = PlanBtn.SECONDARY) {
                            when (val r = FlightPlanEdits.addUserWaypoint(plan, wpName, wpLat, wpLon, wpAlt, wpSpeed, "${System.currentTimeMillis()}-${wpName.trim().uppercase()}")) {
                                is FlightPlanEdits.Result.Refused -> notice = r.reason
                                is FlightPlanEdits.Result.Added -> {
                                    val name = wpName.trim().uppercase()
                                    plan = r.draft; wpName = ""; wpLat = ""; wpLon = ""
                                    notice = R.addedCustomNotice(name)
                                }
                            }
                        }
                    }
                }

                // waypoint list
                if (plan.waypoints.isEmpty()) {
                    Text(
                        "No waypoints added yet.", color = muted, fontSize = 14.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                        modifier = Modifier.padding(top = 12.dp).fillMaxWidth().border(1.dp, planBorder(), RoundedCornerShape(6.dp)).padding(horizontal = 12.dp, vertical = 16.dp),
                    )
                } else {
                    Column(Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        plan.waypoints.forEachIndexed { index, wp ->
                            Row(
                                Modifier.fillMaxWidth().background(scheme.surface, RoundedCornerShape(6.dp)).border(1.dp, planBorder(), RoundedCornerShape(6.dp)).padding(horizontal = 12.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                Box(Modifier.background(scheme.surfaceVariant, androidx.compose.foundation.shape.CircleShape).padding(horizontal = 9.dp, vertical = 5.dp)) {
                                    Text("${index + 1}", color = scheme.onSurface, fontFamily = FontFamily.Monospace, fontSize = 12.sp)
                                }
                                Column(Modifier.weight(1f)) {
                                    Text(wp.name, color = scheme.onSurface, fontWeight = FontWeight.SemiBold)
                                    Text(R.waypointMeta(wp), color = muted, fontSize = 12.sp)
                                }
                                PlanIconButton("↑", enabled = index > 0) { plan = plan.copy(waypoints = R.moveWaypoint(plan.waypoints, index, -1)) }
                                PlanIconButton("↓", enabled = index < plan.waypoints.size - 1) { plan = plan.copy(waypoints = R.moveWaypoint(plan.waypoints, index, 1)) }
                                PlanIconButton("🗑", tint = Classic737Palette.Warn) { plan = plan.copy(waypoints = R.removeWaypoint(plan.waypoints, wp.id)) }
                            }
                        }
                    }
                }
            }
        }

        // ── Geographic route map ──
        PlanSection {
            PlanSectionTitle("◎", "Geographic route map", "Geographic endpoints and entered waypoint coordinates")
            Box(Modifier.padding(top = 12.dp)) {
                GeographicRouteMapView(plan.departure.ifEmpty { "----" }, plan.destination.ifEmpty { "DEST?" }, plan.alternate, plan.waypoints, aircraftNav)
            }
            val metrics = buildList {
                add("Departure" to plan.departure.ifEmpty { "—" }); add("Destination" to plan.destination.ifEmpty { "Not set" }); add("Waypoints" to plan.waypoints.size.toString())
                if (plan.destinationKind == "point-of-interest" && plan.destinationLat != null && plan.destinationLon != null) add("Destination coordinates" to "${R.toFixed(plan.destinationLat!!, 5)}, ${R.toFixed(plan.destinationLon!!, 5)}")
            }
            Box(Modifier.padding(top = 12.dp)) { PlanMetricGrid(metrics, cols = 2) }
            if (!canSave) Text("Enter a valid four-character departure and destination ICAO identifier before saving this as a complete route.", color = Classic737Palette.Caution, fontSize = 12.sp, modifier = Modifier.padding(top = 12.dp))
        }

        // ── Cruise profile ──
        PlanSection {
            PlanSectionTitle("↗", "Cruise profile", "Top-of-climb, cruise altitude and descent planning")
            Box(Modifier.padding(top = 12.dp)) { CruiseProfileView(plan.cruiseAltitudeFt) }
            Box(Modifier.padding(top = 12.dp)) { PlanMetricGrid(listOf("Cruise target" to "${R.fmt(plan.cruiseAltitudeFt)} ft", "Cruise speed target" to "${R.jsNum(plan.cruiseSpeedKt)} kt"), cols = 2) }
            Column(Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                PlanField("Top of climb from departure (NM)") { PlanNumberInput(plan.cruiseTopOfClimbNm, 0.0, 0.0, 1500.0) { plan = plan.copy(cruiseTopOfClimbNm = it) } }
                PlanField("En-route time compression") {
                    val opts = FlightPlanEdits.TIME_COMPRESSION_OPTIONS.map { v ->
                        Triple(R.jsNum(v), when (v) { 1.0 -> "1x (real time)"; 15.0 -> "15x (default)"; else -> "${R.jsNum(v)}x" }, true)
                    }
                    PlanSelect(opts.firstOrNull { it.first == R.jsNum(plan.timeCompression) }?.second ?: "${R.jsNum(plan.timeCompression)}x", opts) { v ->
                        plan = FlightPlanEdits.withTimeCompression(plan, v.toDouble())
                    }
                }
                PlanField("Descent start before destination (NM)") { PlanNumberInput(plan.descentStartNm, 0.0, 0.0, 1500.0) { plan = plan.copy(descentStartNm = it) } }
            }
            Text("Planning visualization only. It does not calculate aircraft performance, fuel burn, terrain clearance, step climbs or ATC restrictions.", color = muted, fontSize = 12.sp, lineHeight = 18.sp, modifier = Modifier.padding(top = 12.dp))
        }

        // ── Landing profile ──
        PlanSection {
            PlanSectionTitle("↗", "Landing profile", "Descent and approach targets, separate from cruise planning")
            Column(Modifier.padding(top = 12.dp).fillMaxWidth().background(planInset(), RoundedCornerShape(6.dp)).border(1.dp, planBorder(), RoundedCornerShape(6.dp)).padding(12.dp)) {
                Text("ILS / LOCALIZER TO USE", color = scheme.onSurface, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.08.em)
                Text("Select the approach station for the chosen arrival runway separately from the destination airport. The airport marker defines where the route ends; the ILS frequency supplies approach guidance. You can also tap an ILS/LOC station on the map and choose “Use as ILS”.", color = muted, fontSize = 12.sp, lineHeight = 18.sp, modifier = Modifier.padding(top = 4.dp))
                val ilsList = R.ilsOptions(plan.destination)
                val ilsOpts = listOf(Triple("", "No ILS selected", true)) + ilsList.map { Triple(it.id, R.ilsOptionLabel(it), true) }
                Column(Modifier.padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    PlanSelect(ilsOpts.firstOrNull { it.first == (plan.ils?.id ?: "") }?.second ?: "No ILS selected", ilsOpts) { id ->
                        if (id.isEmpty()) clearIls() else ilsList.firstOrNull { it.id == id }?.let { setIls(it) }
                    }
                    if (plan.ils != null) Box { PlanButton("Clear ILS", variant = PlanBtn.SECONDARY) { clearIls() } }
                }
                plan.ils?.let { Text("Selected: ${R.ilsSelectedText(it)}", color = scheme.onSurface, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp)) }
            }
            Column(Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                PlanField("Initial approach target altitude (ft)") { PlanNumberInput(plan.approachAltitudeFt, 0.0, 0.0, 20000.0) { plan = plan.copy(approachAltitudeFt = it) } }
                PlanField("Arrival runway") { PlanInput(plan.arrivalRunway, { plan = plan.copy(arrivalRunway = it.uppercase().take(3)) }, placeholder = "Select from current chart") }
            }
            Box(Modifier.padding(top = 12.dp)) { LandingProfileView(plan.approachAltitudeFt) }
            Text("Approach altitude is a planning target, not a published minimum or a command to the aircraft.", color = muted, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
        }

        // ── Procedures and runway selection ──
        PlanSection {
            PlanSectionTitle("▤", "Procedures and runway selection", "Enter identifiers from current official aeronautical charts")
            Column(Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (plan.departure == "RPLL") {
                    PlanField("Charted RPLL SID (AIP AMDT 003/25, published fix coordinates)") {
                        PlanSelect("Select a SID for RWY ${plan.departureRunway.ifEmpty { "?" }}…", R.sidOptions(plan.departureRunway)) { base ->
                            when (val r = FlightPlanProcedures.applySid(plan, base, plan.departureRunway)) {
                                is FlightPlanProcedures.Result.Refused -> notice = r.reason
                                is FlightPlanProcedures.Result.Applied -> { plan = r.draft; notice = r.notice }
                            }
                        }
                    }
                }
                PlanField("Departure SID") { PlanInput(plan.sid, { plan = plan.copy(sid = it.uppercase()) }, placeholder = "Charted SID identifier") }
                PlanField("En-route ATS route / waypoint sequence") { PlanInput(plan.enrouteRoute, { plan = plan.copy(enrouteRoute = it.uppercase()) }, placeholder = "Enter charted route and fixes", singleLine = false, minLines = 3) }
                PlanField("Arrival STAR") { PlanInput(plan.star, { plan = plan.copy(star = it.uppercase()) }, placeholder = "Charted STAR identifier") }
                PlanButton("Use vectored ILS arrival (WSSS RWY 02L)", variant = PlanBtn.SECONDARY, modifier = Modifier.fillMaxWidth()) {
                    when (val r = FlightPlanProcedures.applyVectorArrival(plan)) {
                        is FlightPlanProcedures.Result.Refused -> notice = r.reason
                        is FlightPlanProcedures.Result.Applied -> { plan = r.draft; notice = r.notice }
                    }
                }
                PlanField("Approach procedure") { PlanInput(plan.approach, { plan = plan.copy(approach = it.uppercase()) }, placeholder = "e.g. charted ILS/RNAV approach identifier") }
                val caution = Classic737Palette.Caution
                Row(
                    Modifier.fillMaxWidth().background(caution.copy(alpha = 0.10f), RoundedCornerShape(6.dp)).border(1.dp, caution.copy(alpha = 0.3f), RoundedCornerShape(6.dp)).padding(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Checkbox(plan.procedureStatus == "chart-checked", { plan = plan.copy(procedureStatus = if (it) "chart-checked" else "unverified") })
                    Column {
                        Text("Procedures checked against current charts", color = scheme.onSurface, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                        Text("Only check this after manually verifying SID, en-route route, STAR, approach and runways against current official charts. The application does not verify these fields automatically.", color = muted, fontSize = 12.sp, lineHeight = 18.sp, modifier = Modifier.padding(top = 4.dp))
                    }
                }
                Text(
                    "Status: ${R.procedureStatusText(plan.procedureStatus)}", color = scheme.onSurface, fontSize = 14.sp,
                    modifier = Modifier.fillMaxWidth().background(planInset(), RoundedCornerShape(6.dp)).border(1.dp, planBorder(), RoundedCornerShape(6.dp)).padding(horizontal = 12.dp, vertical = 8.dp),
                )
            }
        }

        // ── milestone ──
        PlanSection(color = planInset()) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("⤓", color = scheme.primary, fontSize = 18.sp)
                Column {
                    Text("Next integration milestone", color = scheme.onSurface, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                    Text(
                        "The active plan now initializes a shared geographic position and tracks it from the simulated aircraft heading and groundspeed. Next, refine airport/runway reference points and connect course guidance to the supported navigation equipment. The existing 737-200 avionics and autopilot logic should remain configuration-appropriate; this page does not add FMC, LNAV or VNAV capability.",
                        color = muted, fontSize = 14.sp, lineHeight = 22.sp, modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }
        }
    }
}

/** One row of the "Route sequence" card (DEP / numbered waypoint / ILS / ARR). */
@Composable
private fun RouteRow(badge: String, badgeColor: Color, title: String, detail: String, tag: String?, tagColor: Color, tint: Color?, trailing: (@Composable () -> Unit)? = null) {
    val scheme = MaterialTheme.colorScheme
    val shape = RoundedCornerShape(6.dp)
    Row(
        Modifier.fillMaxWidth().then(if (tint != null) Modifier.background(tint.copy(alpha = 0.05f), shape).border(1.dp, tint.copy(alpha = 0.4f), shape) else Modifier.border(1.dp, planBorder(), shape))
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        PlanBadgeCircle(badge, badgeColor)
        Column(Modifier.weight(1f)) {
            Text(title, color = scheme.onSurface, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            Text(detail, color = scheme.onSurfaceVariant, fontSize = 12.sp)
        }
        if (tag != null) Text(tag, color = tagColor, fontSize = 10.sp)
        trailing?.invoke()
    }
}

/** web `<input type="number">` driven by `clamp(Number(v) || fallback, lo, hi)`: the typed text stays while editing, the clamped value goes to the plan. */
@Composable
private fun PlanNumberInput(value: Double, fallback: Double, lo: Double, hi: Double, onCommit: (Double) -> Unit) {
    var text by remember { mutableStateOf(R.jsNum(value)) }
    LaunchedEffect(value) { if (R.numberFromText(text, fallback, lo, hi) != value) text = R.jsNum(value) }
    PlanInput(text, { t -> text = t; onCommit(R.numberFromText(t, fallback, lo, hi)) }, numeric = true)
}
