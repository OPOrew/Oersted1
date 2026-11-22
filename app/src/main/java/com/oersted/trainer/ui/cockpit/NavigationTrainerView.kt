package com.oersted.trainer.ui.cockpit

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.oersted.trainer.sim.Derived
import com.oersted.trainer.sim.FlightPhases
import com.oersted.trainer.sim.NavigationPhaseText
import com.oersted.trainer.sim.NavigationTrainerRules
import com.oersted.trainer.sim.SimState
import com.oersted.trainer.ui.common.Fold
import com.oersted.trainer.ui.panel.MainInstrumentPanel
import com.oersted.trainer.ui.panel.PANEL_DESIGN_W
import com.oersted.trainer.ui.pedestal.PedestalRadiosCutout
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * Port of NavigationTrainer.tsx (ATA 34): flight phases panel (FlightPhasePanel.tsx), the real pedestal NAV radios, the live
 * instrument panel (ApTrainerView.tsx), ILS notes, and the source-failure / circuit-breaker / RMI / LRRA controls.
 * Rules: [NavigationTrainerRules], [NavigationPhaseText]; the phase logic is PhaseController through [CockpitModel].
 * NOT ported: the interactive map, the situation display, the "Component flow" drawing (NavAutopilotDiagram), the max-flight-level
 * input. Compose only; verify on CI.
 */

private val LineC = Color(0xFF39414B)
private val SubtleC = Color(0xFF8F9AA5)
private val OkC = Color(0xFF65C798)
private val RedC = Color(0xFFFCA5A5)
private val AmberC = Color(0xFFFDE68A)
private val FgC = Color(0xFFE6E1D2)
private val AccentC = Color(0xFFD6A845)

@Composable
private fun NBtn(
    text: String, modifier: Modifier = Modifier, enabled: Boolean = true, tone: String = "plain", mono: Boolean = false, onClick: () -> Unit,
) {
    val border = when (tone) { "on" -> OkC.copy(alpha = 0.6f); "red" -> Color(0x80EF4444); "amber" -> Color(0x80F59E0B); "accent" -> AccentC.copy(alpha = 0.6f); else -> LineC }
    val color = when (tone) { "on" -> OkC; "red" -> RedC; "amber" -> AmberC; "plain" -> SubtleC; else -> FgC }
    val bg = when (tone) { "on" -> Color(0x3314532D); "red" -> Color(0x4D450A0A); "accent" -> Color(0x1AD6A845); else -> Color.Transparent }
    Text(
        text.uppercase(), color = color, fontSize = 8.sp, fontFamily = if (mono) FontFamily.Monospace else FontFamily.Default,
        modifier = modifier.alpha(if (enabled) 1f else 0.4f).background(bg, RoundedCornerShape(4.dp)).border(1.dp, border, RoundedCornerShape(4.dp))
            .clickable(enabled = enabled, onClick = onClick).padding(horizontal = 6.dp, vertical = 7.dp),
    )
}

@Composable
private fun NLabel(text: String) = Text(text.uppercase(), color = SubtleC, fontSize = 8.sp, modifier = Modifier.padding(top = 6.dp, bottom = 4.dp))

@Composable
private fun NCell(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier.background(Color(0xFF0E1013), RoundedCornerShape(4.dp)).border(1.dp, LineC, RoundedCornerShape(4.dp)).padding(horizontal = 6.dp, vertical = 4.dp)) {
        Text(label.uppercase(), color = SubtleC, fontSize = 7.sp)
        Text(value.uppercase(), color = FgC, fontFamily = FontFamily.Monospace, fontSize = 10.sp, maxLines = 1)
    }
}

@Composable
private fun CellGrid(per: Int, cells: List<Pair<String, String>>) {
    cells.chunked(per).forEach { row ->
        Row(Modifier.fillMaxWidth().padding(bottom = 4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            row.forEach { (k, v) -> NCell(k, v, Modifier.weight(1f)) }
            repeat(per - row.size) { Spacer(Modifier.weight(1f)) }
        }
    }
}

@Composable
private fun Box8(content: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(top = 6.dp).background(Color(0xFF0E1013), RoundedCornerShape(4.dp)).border(1.dp, LineC, RoundedCornerShape(4.dp)).padding(6.dp)) { content() }
}

private val PHASE_BUTTONS = FlightPhases.PHASE_BUTTONS

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun FlightPhasePanel(s: SimState, cockpit: CockpitModel) {
    val plan by cockpit.activePlan.collectAsState()
    val nav by cockpit.navState.collectAsState()
    val pv by cockpit.phaseView.collectAsState()
    val ro by cockpit.readout.collectAsState()
    var showPlan by remember { mutableStateOf(true) }
    val phase = pv.phase
    val loaded = plan != null && phase != FlightPhases.Phase.NO_PLAN
    val eta = NavigationPhaseText.etaMinutes(nav?.distanceToDestinationNm, s.groundSpeedKt, nav?.timeCompression)

    Column(Modifier.fillMaxWidth().padding(top = 6.dp).background(Color(0xFF14171B), RoundedCornerShape(6.dp)).border(1.dp, LineC, RoundedCornerShape(6.dp)).padding(8.dp)) {
        Text("FLIGHT PHASES · ${NavigationPhaseText.planHeader(plan).uppercase()}", color = SubtleC, fontSize = 9.sp, modifier = Modifier.padding(bottom = 6.dp))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            NBtn(if (phase == FlightPhases.Phase.NO_PLAN) "Load plan into controls" else "Reload plan / reset", enabled = plan != null, tone = if (plan != null) "accent" else "plain") { cockpit.reloadPlan() }
            NBtn("Auto phases ${if (pv.auto) "ON" else "OFF"}", tone = if (pv.auto) "on" else "plain") { cockpit.setAutoPhases(!pv.auto) }
            NBtn("Ready for departure", tone = "on") { cockpit.readyForDeparture() }
        }
        if (plan == null) {
            Text(
                "No flight plan is active. Build one on the Flight Plan page and press activate, then come back here. Activating also loads it into these controls.",
                color = SubtleC, fontSize = 9.sp, modifier = Modifier.padding(top = 6.dp),
            )
        }
        Spacer(Modifier.height(6.dp))
        PHASE_BUTTONS.chunked(3).forEach { row ->
            Row(Modifier.fillMaxWidth().padding(bottom = 4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                for (p in row) {
                    val gate = ro.gates[p]
                    val ok = gate?.ok ?: false
                    val prog = NavigationPhaseText.buttonProgress(p, phase)
                    NBtn(p.label, Modifier.weight(1f), enabled = ok, tone = if (prog == "here") "on" else if (prog == "done") "plain" else "accent") { cockpit.startPhase(p) }
                }
            }
        }
        Text(
            pv.hint.uppercase(), color = AmberC, fontFamily = FontFamily.Monospace, fontSize = 9.sp,
            modifier = Modifier.fillMaxWidth().background(Color(0x33451A03), RoundedCornerShape(4.dp)).border(1.dp, Color(0x66F59E0B), RoundedCornerShape(4.dp)).padding(horizontal = 6.dp, vertical = 4.dp),
        )
        Spacer(Modifier.height(6.dp))
        // live instruments (web InstrumentStrip): the controller's readout
        CellGrid(3, listOf(
            "Altitude" to "${NavigationPhaseText.fmtFt(ro.altFt)} ft",
            "CAS" to "${NavigationPhaseText.jsNumber(Math.floor(ro.casKt + 0.5))} kt",
            "V/S" to "${NavigationPhaseText.jsNumber(Math.floor(ro.vsFpm + 0.5))} fpm",
            "Heading" to "${NavigationPhaseText.pad3(ro.headingDeg)}°",
            "Thrust L" to "${NavigationPhaseText.jsNumber(Math.floor(ro.throttle1 * 100 + 0.5))}%",
            "Ground speed" to "${NavigationPhaseText.jsNumber(Math.floor(s.groundSpeedKt + 0.5))} kt",
        ))

        Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("FLIGHT PLAN SECTION", color = SubtleC, fontSize = 8.sp)
            NBtn(if (showPlan) "Hide" else "Show", tone = "accent") { showPlan = !showPlan }
        }
        if (showPlan) {
            if (pv.checklist.isNotEmpty()) {
                Box8 {
                    Text("PLAN LOADED INTO THE CONTROLS · CONFIGURATION LINE IS LIVE", color = SubtleC, fontSize = 8.sp, modifier = Modifier.padding(bottom = 4.dp))
                    ChecklistRow("Aircraft config (live)", NavigationPhaseText.liveConfig(s.noseGearPos, s.leftMainGearPos, s.rightMainGearPos, s.flaps, s.speedBrake), OkC)
                    ChecklistRow("${phase.label} config", FlightPhases.PHASE_CONFIG[phase] ?: "-", FgC)
                    for (c in pv.checklist.filter { !Regex("^gear", RegexOption.IGNORE_CASE).containsMatchIn(it.label) }) ChecklistRow(c.label, c.value, FgC)
                }
            }
            Spacer(Modifier.height(6.dp))
            CellGrid(2, listOf(
                "Planned cruise" to NavigationPhaseText.plannedCruise(plan, null),
                "Altitude target" to NavigationPhaseText.altitudeTarget(phase, plan),
                "PLAN NAV" to if (loaded) "LOADED" else "NOT LOADED",
                "Next waypoint" to NavigationPhaseText.nextWaypoint(nav?.activeLegName, nav?.distanceToNextNm, nav?.bearingToNextDeg),
                "To destination" to NavigationPhaseText.toDestination(nav?.distanceToDestinationNm, eta),
            ))
        }
        if (pv.log.isNotEmpty()) {
            Box8 {
                Text("FLIGHT LOG", color = SubtleC, fontSize = 8.sp, modifier = Modifier.padding(bottom = 4.dp))
                val fmt = remember { java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.UK) }
                for (l in pv.log.reversed().take(8)) {
                    Text("${fmt.format(java.util.Date(l.t))} ${l.text}", color = SubtleC, fontFamily = FontFamily.Monospace, fontSize = 8.sp)
                }
            }
        }
    }
}

@Composable
private fun ChecklistRow(k: String, v: String, valueColor: Color) {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(k.uppercase(), color = SubtleC, fontFamily = FontFamily.Monospace, fontSize = 8.sp, modifier = Modifier.weight(1f))
        Text(v.uppercase(), color = valueColor, fontFamily = FontFamily.Monospace, fontSize = 8.sp, modifier = Modifier.weight(1.4f))
    }
}

/** Design-px horizontal centres of the areas the jump buttons scroll to (web JUMP). */
private val JUMP = mapOf("capt" to 640, "ap" to 1530, "fo" to 2560)

/**
 * Port of ApTrainerView.tsx: the real main instrument panel (glareshield, captain group, centre, first officer) with jump
 * buttons and size buttons. [focus] is "nav" (captain's HSI / RMI) or "ap" (glareshield A/P controls).
 */
@Composable
@OptIn(ExperimentalLayoutApi::class)
internal fun ApTrainerView(cockpit: CockpitModel, focus: String) {
    var scale by remember { mutableStateOf(0.5f) }
    val scroll: ScrollState = rememberScrollState()
    val scope = rememberCoroutineScope()
    val density = LocalDensity.current
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val viewportPx = with(density) { maxWidth.toPx() }
        fun targetFor(key: String): Int = with(density) { ((JUMP.getValue(key) * scale).dp.toPx() - viewportPx / 2).toInt().coerceAtLeast(0) }
        // open on the area for this section (the web effect re-runs on focus and scale)
        LaunchedEffect(focus, scale) {
            snapshotFlow { scroll.maxValue }.first { it > 0 }
            scroll.scrollTo(targetFor(if (focus == "nav") "capt" else "ap"))
        }
        Column(Modifier.fillMaxWidth().background(Color(0xFF0A0C0F), RoundedCornerShape(4.dp)).border(1.dp, Color(0xFF30353B), RoundedCornerShape(4.dp)).padding(6.dp)) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                for ((k, l) in listOf("capt" to "Captain", "ap" to "A/P controls", "fo" to "First officer")) NBtn(l, tone = "accent") { scope.launch { scroll.animateScrollTo(targetFor(k)) } }
                Text("SIZE", color = SubtleC, fontFamily = FontFamily.Monospace, fontSize = 8.sp, modifier = Modifier.padding(horizontal = 4.dp, vertical = 7.dp))
                for (z in listOf(0.35f, 0.5f, 0.75f, 1f)) NBtn("${Math.round(z * 100)}%", tone = if (scale == z) "on" else "plain", mono = true) { scale = z }
            }
            Spacer(Modifier.height(6.dp))
            MainInstrumentPanel(cockpit = cockpit, scale = scale, modifier = Modifier.fillMaxWidth(), scrollState = scroll)
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun NavigationTrainerSection(s: SimState, d: Derived, cockpit: CockpitModel) {
    val mip by cockpit.mipState.collectAsState()
    val ped by cockpit.pedestalState.collectAsState()

    // web NavSharedDisplay: map (InteractiveNavMap) / pedestal NAV radios / situation display, then the flight-phase panel
    NavSharedDisplay(cockpit, radios = true)
    Spacer(Modifier.height(12.dp))
    FlightPhasePanel(s, cockpit)

    Fold("Component flow", hint = "ATA 34 · what feeds what") { NavAutopilotDiagram(cockpit, "nav") }
    Fold("Instrument panel", hint = "live captain / A/P / first officer") { ApTrainerView(cockpit, "nav") }
    Fold("ILS notes", hint = "how the approach sequence works") {
        Text(
            "ILS training sequence: monitor LOC and GS independently as the aircraft moves along the approach. In this model, GS is not valid outside 10 NM from the runway threshold; " +
                "NO GS at 12 NM is therefore expected. The aircraft must be airborne (above 60 kt with WOW off) for the simulated position to advance.",
            color = SubtleC, fontSize = 8.sp, lineHeight = 11.sp,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            "Frequency is set on the centre pedestal NAV 1 head (or via the map / flight-plan load). Turning the pedestal knobs always overrides. " +
                "Kind (VOR vs ILS) follows the station table at the tuned frequency.",
            color = SubtleC, fontSize = 8.sp, lineHeight = 11.sp,
        )
    }
    Fold("Failures, circuit breakers and test", hint = "source failures · CBs · RMI · LRRA") {
        val failLabels = mapOf("gyro1" to "Gyro 1", "gyro2" to "Gyro 2", "gyroAux" to "Gyro AUX", "comp1" to "Comp 1", "comp2" to "Comp 2", "nav1" to "NAV 1", "nav2" to "NAV 2")
        val f = mip.srcFail
        val failOn = mapOf("gyro1" to f.gyro1, "gyro2" to f.gyro2, "gyroAux" to f.gyroAux, "comp1" to f.comp1, "comp2" to f.comp2, "nav1" to f.nav1, "nav2" to f.nav2)
        NLabel("Source failures (VHF NAV · COMPASS · VERTICAL GYRO selectors)")
        NavGrid4(NavigationTrainerRules.SRC_FAIL_KEYS) { k, m ->
            NBtn(failLabels.getValue(k), m, tone = if (failOn.getValue(k)) "red" else "plain", mono = true) { cockpit.updateMip { NavigationTrainerRules.toggleSrcFail(it, k) } }
        }
        val p = mip.srcPower
        val powerOn = mapOf(
            "gyro1Cb" to p.gyro1Cb, "gyro2Cb" to p.gyro2Cb, "gyroAuxCb" to p.gyroAuxCb, "comp1Cb" to p.comp1Cb, "comp2Cb" to p.comp2Cb,
            "nav1Cb" to p.nav1Cb, "nav2Cb" to p.nav2Cb, "nav1GsCb" to p.nav1GsCb, "nav2GsCb" to p.nav2GsCb,
            "dme1Cb" to p.dme1Cb, "dme2Cb" to p.dme2Cb, "adf1Cb" to p.adf1Cb, "adf2Cb" to p.adf2Cb,
            "comm1Cb" to p.comm1Cb, "comm2Cb" to p.comm2Cb, "hf1Cb" to p.hf1Cb, "hf2Cb" to p.hf2Cb, "lrra1Cb" to p.lrra1Cb, "lrra2Cb" to p.lrra2Cb,
        )
        val cbLabels = mapOf(
            "gyro1Cb" to "VG1 CB", "gyro2Cb" to "VG2 CB", "gyroAuxCb" to "VG AUX CB", "comp1Cb" to "COMP1 CB", "comp2Cb" to "COMP2 CB",
            "nav1Cb" to "NAV1 VOR/LOC", "nav2Cb" to "NAV2 VOR/LOC", "nav1GsCb" to "NAV1 G/S", "nav2GsCb" to "NAV2 G/S",
            "dme1Cb" to "DME1 CB", "dme2Cb" to "DME2 CB", "adf1Cb" to "ADF1 CB", "adf2Cb" to "ADF2 CB",
            "comm1Cb" to "VHF1 CB", "comm2Cb" to "VHF2 CB", "hf1Cb" to "HF-1 CB", "hf2Cb" to "HF-2 CB*", "lrra1Cb" to "LRRA1 CB", "lrra2Cb" to "LRRA2 CB",
        )
        NLabel("Circuit breakers (closed = powered path)")
        NavGrid4(NavigationTrainerRules.SRC_POWER_KEYS) { k, m ->
            val closed = powerOn.getValue(k)
            NBtn(cbLabels.getValue(k) + if (closed) "" else " OPEN", m, tone = if (!closed) "red" else "plain", mono = true) { cockpit.updateMip { NavigationTrainerRules.toggleSrcPower(it, k) } }
        }
        Text("* HF-2 CB separation is a trainer assumption pending tail-specific WDM/effectivity verification.", color = SubtleC, fontSize = 8.sp, modifier = Modifier.padding(top = 4.dp))
        Spacer(Modifier.height(6.dp))
        NBtn(if (p.gyroFastErect) "VG FAST ERECT ON (~2.5s)" else "VG FAST ERECT (else ~60s)", tone = if (p.gyroFastErect) "amber" else "plain", mono = true) { cockpit.updateMip { NavigationTrainerRules.toggleGyroFastErect(it) } }
        Spacer(Modifier.height(6.dp))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            NBtn("COMP1 ${if (mip.compSyncFlag.c1) "UNSYNC · HDG FLAG" else "SYNC OK"}", tone = if (mip.compSyncFlag.c1) "red" else "plain", mono = true) { cockpit.updateMip { NavigationTrainerRules.toggleCompSyncFlag(it, true) } }
            NBtn("COMP2 ${if (mip.compSyncFlag.c2) "UNSYNC · HDG FLAG" else "SYNC OK"}", tone = if (mip.compSyncFlag.c2) "red" else "plain", mono = true) { cockpit.updateMip { NavigationTrainerRules.toggleCompSyncFlag(it, false) } }
        }
        Spacer(Modifier.height(6.dp))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            NBtn("COMP1 ${if (ped.compMode.first == 0) "SLAVED" else "DG"}", mono = true) { cockpit.updatePedestal { NavigationTrainerRules.toggleCompMode1(it) } }
            NBtn("COMP2 ${if (ped.compMode.second == 0) "SLAVED" else "DG"}", mono = true) { cockpit.updatePedestal { NavigationTrainerRules.toggleCompMode2(it) } }
        }
        Spacer(Modifier.height(6.dp))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            NBtn("RMI N1 CAPT ${if (ped.rmiNeedle1.first == 0) "VOR" else "ADF"}", mono = true) { cockpit.updatePedestal { NavigationTrainerRules.toggleRmiNeedle1(it) } }
            NBtn("RMI N2 CAPT ${if (ped.rmiNeedle2.first == 0) "VOR" else "ADF"}", mono = true) { cockpit.updatePedestal { NavigationTrainerRules.toggleRmiNeedle2(it) } }
        }
        Spacer(Modifier.height(6.dp))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            NBtn("LRRA1 ${if (ped.lrraTest.first) "TEST" else "NORM"}", mono = true) { cockpit.updatePedestal { NavigationTrainerRules.toggleLrraTest(it, true) } }
            NBtn("LRRA2 ${if (ped.lrraTest.second) "TEST" else "NORM"}", mono = true) { cockpit.updatePedestal { NavigationTrainerRules.toggleLrraTest(it, false) } }
        }
        val l = mip.lrra
        fun h(v: Double?) = if (v == null) "—" else NavigationPhaseText.jsNumber(v)
        Text(
            "LRRA DH: ${ped.lrraDh.first} / ${ped.lrraDh.second} ft · H: ${h(l.h1)} / ${h(l.h2)} ft${if (l.dh1) " · DH1" else ""}${if (l.dh2) " · DH2" else ""}",
            color = SubtleC, fontFamily = FontFamily.Monospace, fontSize = 8.sp, modifier = Modifier.padding(top = 6.dp),
        )
    }
}

/** Web `grid grid-cols-4 gap-1.5`: equal-width cells, four per row. */
@Composable
private fun NavGrid4(keys: List<String>, cell: @Composable (String, Modifier) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        for (row in keys.chunked(4)) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            for (k in row) cell(k, Modifier.weight(1f))
            repeat(4 - row.size) { Spacer(Modifier.weight(1f)) }
        }
    }
}

/**
 * Port of NavSharedDisplay.tsx: the one navigation display shared by the Navigation AND Autopilot tabs.
 *   map = InteractiveNavMap, pedestal NAV radios = the real P8 NAV 1 / NAV 2 / ADF units, situation display.
 * [radios] = false on the Autopilot tab, whose controls are the glareshield instead of the pedestal NAV radios.
 */
@Composable
internal fun NavSharedDisplay(cockpit: CockpitModel, radios: Boolean = true) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        InteractiveNavMap(cockpit)
        if (radios) BoxWithConstraints(Modifier.fillMaxWidth()) { PedestalRadiosCutout(cockpit, maxWidth) }
        SituationDisplay(cockpit, "nav", Modifier.padding(top = 0.dp))
    }
}
