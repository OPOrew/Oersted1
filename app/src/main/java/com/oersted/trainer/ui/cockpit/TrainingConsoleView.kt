package com.oersted.trainer.ui.cockpit

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.layout.Box
import com.oersted.trainer.ui.common.Classic737Palette
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.oersted.trainer.sim.Derived
import com.oersted.trainer.sim.FuelAndGroundRules
import com.oersted.trainer.sim.SimActions
import com.oersted.trainer.sim.HydraulicTrainerRules
import com.oersted.trainer.sim.SimState
import com.oersted.trainer.sim.TrainingConsoleRules
import com.oersted.trainer.ui.overhead.FltCtrlPanel
import com.oersted.trainer.ui.overhead.FuelPanel
import com.oersted.trainer.ui.overhead.HydDoorsCvr
import com.oersted.trainer.ui.overhead.P5Cutout
import com.oersted.trainer.ui.panel.MipBrakePanel
import com.oersted.trainer.ui.panel.MipHydDials

private val ConsoleBg = Color(0xFF171816)

/**
 * Full-screen TRAINING console (routes/cockpit.tsx TrainingConsole). Shell and the sections whose rules are ported:
 * Flight Controls, Landing Gear, Brakes / Antiskid. Other sections show a placeholder until their panels are ported.
 * Switch state comes from [s]; every press goes through [change] with a pure rule from [TrainingConsoleRules].
 * Not compiled in the sandbox; verify on CI.
 */
@Composable
fun TrainingConsoleView(
    s: SimState,
    d: Derived,
    change: ((SimState) -> SimState) -> Unit,
    note: (String, SimState.() -> Unit) -> Unit,
    cockpit: CockpitModel,
    onClose: () -> Unit,
    audioEnabled: Boolean = true,
) {
    var section by remember { mutableStateOf(TrainingConsoleRules.DEFAULT_SECTION) }
    var sectionsCollapsed by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize().background(ConsoleBg)) {
        // header: eyebrow + title + BUILD tag, Show / Hide sections and Close (web: border-b #403b2d px-3 py-3)
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 12.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("SEPARATE TRAINING INTERFACE", color = Color(0xFFB7AB87), fontSize = 10.sp, letterSpacing = 0.18.em)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Training Console", color = Classic737Palette.Fg, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                    Text("BUILD HYD-PNEU-AC-CAB-V8", color = Classic737Palette.Accent, fontFamily = FontFamily.Monospace, fontSize = 8.sp, letterSpacing = 0.05.em, modifier = Modifier.padding(start = 4.dp))
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ConsoleBtn(if (sectionsCollapsed) "Show sections ▾" else "Hide sections ▴") { sectionsCollapsed = !sectionsCollapsed }
                ConsoleBtn("Close", onClick = onClose)
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(TrainingRule))
        if (!sectionsCollapsed) {
            // grid-cols-2, sm:3 (640), md:4 (768), lg:6 (1024)
            BoxWithConstraints(Modifier.fillMaxWidth().padding(8.dp)) {
                val cols = if (maxWidth >= 1024.dp) 6 else if (maxWidth >= 768.dp) 4 else if (maxWidth >= 640.dp) 3 else 2
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    TrainingConsoleRules.SECTIONS.chunked(cols).forEach { row ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            row.forEach { name ->
                                val on = section == name
                                Box(
                                    Modifier.weight(1f).background(if (on) Classic737Palette.Accent.copy(alpha = 0.10f) else Classic737Palette.Inset, RoundedCornerShape(4.dp))
                                        .border(1.dp, if (on) Classic737Palette.Accent.copy(alpha = 0.6f) else Classic737Palette.Border, RoundedCornerShape(4.dp))
                                        .clickable { section = name; sectionsCollapsed = true }.padding(horizontal = 8.dp, vertical = 8.dp),
                                ) { Text(name.uppercase(), color = if (on) Classic737Palette.Fg else Classic737Palette.Subtle, fontSize = 9.sp, letterSpacing = 0.025.em) }
                            }
                            repeat(cols - row.size) { Box(Modifier.weight(1f)) }
                        }
                    }
                }
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(TrainingRule))
        } else {
            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("SECTION:", color = Classic737Palette.Subtle, fontSize = 10.sp, letterSpacing = 0.025.em)
                Text(
                    section.uppercase(), color = Classic737Palette.Fg, fontSize = 10.sp, letterSpacing = 0.025.em,
                    modifier = Modifier.background(Classic737Palette.Accent.copy(alpha = 0.10f), RoundedCornerShape(4.dp))
                        .border(1.dp, Classic737Palette.Accent.copy(alpha = 0.4f), RoundedCornerShape(4.dp)).padding(horizontal = 8.dp, vertical = 2.dp),
                )
                Box(Modifier.weight(1f))
                Text(
                    "CHANGE ▾", color = Classic737Palette.Subtle, fontSize = 9.sp,
                    modifier = Modifier.background(Classic737Palette.Inset, RoundedCornerShape(4.dp)).border(1.dp, Classic737Palette.Border, RoundedCornerShape(4.dp))
                        .clickable { sectionsCollapsed = false }.padding(horizontal = 8.dp, vertical = 2.dp),
                )
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(TrainingRule))
        }
        Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(12.dp)) {
            when (section) {
                "Flight Controls" -> TrainingGroup("Flight Controls") { FlightControlsSection(s, d, change, cockpit) }
                "Landing Gear" -> TrainingGroup("Landing Gear") { LandingGearTrainerSection(s, d, change, note) }
                "Brakes / Antiskid" -> TrainingGroup("Brakes / Antiskid") { BrakesSection(s, d, change, cockpit) }
                "Hydraulics" -> HydraulicsSection(s, d, change, cockpit)
                "Fuel" -> TrainingGroup("ATA 28 · Fuel Feed / Quantity / Crossfeed") { FuelSection(s, d, change, cockpit) }
                "Engine Start" -> TrainingGroup("Engine Start") { EngineStartTrainerSection(s, d, change, cockpit) }
                "Electrical Power" -> ElectricalTrainerSection(s, d, change, cockpit)
                "Pneumatic" -> TrainingGroup("ATA 36 · Pneumatic / Bleed Air Distribution") { PneumaticTrainerSection(s, d, change, cockpit) }
                "Air Conditioning" -> TrainingGroup("ATA 21 · Air Conditioning (AMM Ch. 21)") { AirConditioningTrainerSection(s, d, change, cockpit) }
                "Cabin Pressurization" -> TrainingGroup("ATA 21 · Cabin Pressurization (AMM Ch. 21)") { CabinPressTrainerSection(s, d, change, cockpit) }
                "APU" -> TrainingGroup("APU") { ApuTrainerSection(s, d, cockpit) }
                "Fire Protection" -> TrainingGroup("Fire Protection") { FireTrainerSection(s, d, cockpit) }
                "Ice & Rain" -> TrainingGroup("Ice & Rain Protection") { IceRainTrainerSection(s, d, cockpit) }
                "Pitot / Static" -> TrainingGroup("Pitot / Static") { PitotStaticTrainerSection(s, d, cockpit) }
                "Navigation" -> TrainingGroup("Navigation") {
                    NavigationTrainerSection(s, d, cockpit)
                    com.oersted.trainer.ui.common.Fold("VHF COM", hint = "receive + simulated PTT · ATA 23") { RadioCommsTrainer(cockpit, audioEnabled) }
                }
                "Autopilot" -> TrainingGroup("Autopilot simulator / Flight Director") { AutopilotTrainerSection(s, cockpit) }
                "Lights" -> TrainingGroup("Lights") { LightsTrainerSection(s, d, cockpit) }
                "Fault Injection" -> FaultInjectionSection(s, d, cockpit)
                "Component / System Flow" -> TrainingGroup("Live component flow") { ComponentFlowSection(s, d) }
                else -> Text("$section: not ported yet.", style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

@Composable
private fun HydraulicsSection(s: SimState, d: Derived, change: ((SimState) -> SimState) -> Unit, cockpit: CockpitModel) {
    // the real P5 hydraulic panel (engine / electric pumps, standby) and the real MIP pressure dials
    P5Cutout(cockpit, 3) { p -> HydDoorsCvr(p, true) }
    BoxWithConstraints(Modifier.fillMaxWidth()) { MipHydDials(cockpit, maxWidth) }
    Spacer(Modifier.height(8.dp))
    HydraulicsFlowDiagram(s, d)
    Spacer(Modifier.height(8.dp))
    // web order: drawing → "P5 / Trainer controls" switch strip + A · B · S pressure chips
    HydraulicsTrainerControls(s, d, change)
}

@Composable
private fun FlightControlsSection(s: SimState, d: Derived, change: ((SimState) -> SimState) -> Unit, cockpit: CockpitModel) {
    // the real P5 FLIGHT CONTROL panel (FLT CONTROL A / B, spoilers, alternate flaps)
    P5Cutout(cockpit, 0) { p -> FltCtrlPanel(p) }
    WebButton("Center flight controls", Modifier.fillMaxWidth().padding(top = 8.dp)) { change(TrainingConsoleRules::centerFlightControls) }
    TrainingSub("Servicing / Test") {
        ButtonGrid(listOf(
            GridBtn("Ground-sensing test override · ${if (s.groundSenseTest) "ACTIVE" else "OFF"}") { change(TrainingConsoleRules::toggleGroundSenseTest) },
            GridBtn("Airborne test override · ${if (s.airborneTest) "ACTIVE" else "OFF"}") { change(TrainingConsoleRules::toggleAirborneTest) },
            GridBtn("Ground hydraulic servicing · ${if (s.hydServicingConnected) "CONNECTED" else "DISCONNECTED"}") { change(TrainingConsoleRules::toggleHydServicingConnected) },
            GridBtn("Ground power cart (GPU) · ${if (s.externalPowerConnected) "CONNECTED" else "DISCONNECTED"}") { change(TrainingConsoleRules::toggleExternalPowerConnected) },
        ))
    }
    TrainingSubHeader("Yoke / rudder inputs → flight-control surfaces")
    FlightModeControlView(s, d, cockpit)
    // web FlightControlsModule: surface diagram + readouts (the B737200ControlStand aside is the P5 cutout above / P8 pedestal tab)
    Spacer(Modifier.height(8.dp))
    com.oersted.trainer.ui.panel.FlightControlsModule(s, d)
    Spacer(Modifier.height(12.dp))
    val six by cockpit.sixPack.collectAsState()
    SixPackView(six)
    FlightControlInputsView(cockpit)
}

@Composable
private fun BrakesSection(s: SimState, d: Derived, change: ((SimState) -> SimState) -> Unit, cockpit: CockpitModel) {
    // the real main instrument panel anti-skid toggles, AUTO BRAKE knob and brake lights
    BoxWithConstraints(Modifier.fillMaxWidth()) { MipBrakePanel(cockpit, maxWidth) }
    Spacer(Modifier.height(8.dp))
    TrainingSubHeader("Servicing / Test")
    Chip("ANTISKID ${if (d.antiskidOperational) "OPERABLE" else "INOP"} · AUTOBRAKE ${if (d.autobrakeArmed) "ARMED" else "NOT ARMED"}", d.antiskidOperational && d.autobrakeArmed, Modifier.fillMaxWidth())
    TrainingSubHeader("Landing / rollout trainer")
    BrakeRunwayTrainer(s, d, cockpit)
    TrainingSubHeader("Main gear wheels")
    BrakeWheelPanelView(s, d)
}

@Composable
private fun FuelSection(s: SimState, d: Derived, change: ((SimState) -> SimState) -> Unit, cockpit: CockpitModel) {
    val pct = { v: Double -> if (d.fuelQuantityIndicationPowered) "%.1f%%".format(v) else "NO IND" }
    // three tank cards: label, QTY, LOW PRESSURE / PRESSURE OK
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        for ((label, qty, low) in listOf(Triple("NO. 1 TANK", s.fuelTank1, d.fuelLowPressure1), Triple("CENTER TANK", s.fuelTankCenter, d.fuelCenterLowPressure), Triple("NO. 2 TANK", s.fuelTank2, d.fuelLowPressure2))) {
            Column(
                Modifier.weight(1f).background(Classic737Palette.Inset, RoundedCornerShape(4.dp)).border(1.dp, Classic737Palette.Border, RoundedCornerShape(4.dp)).padding(8.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(label, color = Classic737Palette.Subtle, fontFamily = FontFamily.Monospace, fontSize = 9.sp)
                Text("QTY ${pct(qty)}".uppercase(), color = Classic737Palette.Fg, fontFamily = FontFamily.Monospace, fontSize = 9.sp)
                Text(if (low) "LOW PRESSURE" else "PRESSURE OK", color = if (low) Classic737Palette.Warn else Classic737Palette.Ok, fontFamily = FontFamily.Monospace, fontSize = 9.sp)
            }
        }
    }
    Spacer(Modifier.height(8.dp))
    // the real P5 FUEL panel replaces the web's six BOOST buttons (TANK 1 / CTR / TANK 2 pumps)
    P5Cutout(cockpit, 0) { p -> FuelPanel(p, true) }
    Spacer(Modifier.height(8.dp))
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        WebButton("CROSSFEED VALVE · ${FuelAndGroundRules.crossfeedLabel(s.fuelCrossfeed, d.fuelShutoff1Open || d.fuelShutoff2Open)}", Modifier.weight(1f), accent = true) { change { FuelAndGroundRules.toggleCrossfeed(it) } }
        InfoBox("SCAVENGE · ${if (d.fuelScavengeActive) "${Math.round(Math.max(0.0, 1200 - s.fuelScavengeTimer))}S REMAIN" else "OFF / WAITING"}", Modifier.weight(1f))
    }
    TrainingSub("Engine fuel shutoff / fire isolation") {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            InfoBox("ENG 1 SHUTOFF · ${if (d.fuelShutoff1Open) "OPEN" else "CLOSED"} · ${"%.0f".format(d.fuelFeedPressure1)} PSI", Modifier.weight(1f), if (d.fuelShutoff1Open) Classic737Palette.Ok else Classic737Palette.Warn, (if (d.fuelShutoff1Open) Classic737Palette.Ok else Classic737Palette.Warn).copy(alpha = 0.5f))
            InfoBox("ENG 2 SHUTOFF · ${if (d.fuelShutoff2Open) "OPEN" else "CLOSED"} · ${"%.0f".format(d.fuelFeedPressure2)} PSI", Modifier.weight(1f), if (d.fuelShutoff2Open) Classic737Palette.Ok else Classic737Palette.Warn, (if (d.fuelShutoff2Open) Classic737Palette.Ok else Classic737Palette.Warn).copy(alpha = 0.5f))
        }
        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            InfoBox("ENG 1 SOURCE · ${d.fuelFeedSource1}", Modifier.weight(1f), size = 8)
            InfoBox("ENG 2 SOURCE · ${d.fuelFeedSource2}", Modifier.weight(1f), size = 8)
        }
    }
    TrainingSub("Servicing / fault test") {
        ButtonGrid(listOf(
            GridBtn("SET LOW FUEL · 25%") { change { FuelAndGroundRules.setLowFuel(it) } },
            GridBtn("RESET QUANTITY · 100%") { change { FuelAndGroundRules.resetQuantity(it) } },
        ))
    }
}


/** Web "Live component flow" group. The component masterlist drawing is not ported yet. */
@Composable
private fun ComponentFlowSection(s: SimState, d: Derived) {
    for (row in TrainingConsoleRules.componentFlowRows(s, d)) {
        Text(row, style = MaterialTheme.typography.bodySmall, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp))
    }
}

/** Header button of the web console: rounded border-border bg-inset px-2 py-1, 10 px uppercase. */
@Composable
private fun ConsoleBtn(text: String, onClick: () -> Unit) {
    Text(
        text.uppercase(), color = Classic737Palette.Fg, fontSize = 10.sp,
        modifier = Modifier.background(Classic737Palette.Inset, RoundedCornerShape(4.dp)).border(1.dp, Classic737Palette.Border, RoundedCornerShape(4.dp))
            .clickable { onClick() }.padding(horizontal = 8.dp, vertical = 4.dp),
    )
}
