package com.oersted.trainer.ui.cockpit

import androidx.compose.foundation.background
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
) {
    var section by remember { mutableStateOf(TrainingConsoleRules.DEFAULT_SECTION) }
    var sectionsCollapsed by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize().background(ConsoleBg).padding(12.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column {
                Text("Separate training interface", color = Color(0xFFB7AB87), style = MaterialTheme.typography.labelSmall)
                Text("Training Console", style = MaterialTheme.typography.titleLarge)
            }
            OutlinedButton(onClick = onClose) { Text("Close") }
        }
        Spacer(Modifier.height(8.dp))
        OutlinedButton(onClick = { sectionsCollapsed = !sectionsCollapsed }) {
            Text(if (sectionsCollapsed) "Show sections" else "Hide sections")
        }
        if (!sectionsCollapsed) {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                TrainingConsoleRules.SECTIONS.chunked(3).forEach { row ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        row.forEach { name ->
                            OutlinedButton(
                                onClick = { section = name; sectionsCollapsed = true },
                                modifier = Modifier.weight(1f),
                            ) { Text(name, style = MaterialTheme.typography.labelSmall) }
                        }
                    }
                    Spacer(Modifier.height(4.dp))
                }
            }
        } else {
            Text("Section: $section", style = MaterialTheme.typography.labelMedium)
        }
        Spacer(Modifier.height(8.dp))
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
            when (section) {
                "Flight Controls" -> FlightControlsSection(s, change, cockpit)
                "Landing Gear" -> LandingGearTrainerSection(s, d, change, note)
                "Brakes / Antiskid" -> BrakesSection(s, change, cockpit)
                "Hydraulics" -> HydraulicsSection(s, d, change, cockpit)
                "Fuel" -> FuelSection(s, d, change, cockpit)
                "Engine Start" -> EngineStartTrainerSection(s, d, change, cockpit)
                "Electrical Power" -> ElectricalTrainerSection(s, d, change, cockpit)
                "Pneumatic" -> PneumaticTrainerSection(s, d, change, cockpit)
                "Air Conditioning" -> AirConditioningTrainerSection(cockpit)
                "Cabin Pressurization" -> CabinPressTrainerSection(cockpit)
                "APU" -> ApuTrainerSection(s, d, change, cockpit)
                "Fire Protection" -> FireTrainerSection(s, d, cockpit)
                "Ice & Rain" -> IceRainTrainerSection(cockpit)
                "Pitot / Static" -> PitotStaticTrainerSection(cockpit)
                "Navigation" -> NavigationTrainerSection(cockpit)
                "Autopilot" -> AutopilotTrainerSection(cockpit)
                "Lights" -> LightsTrainerSection(cockpit)
                "Fault Injection" -> FaultInjectionSection(s, d, cockpit)
                else -> Text("$section: not ported yet.", style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

@Composable
private fun SwitchButton(label: String, on: Boolean, enabled: Boolean = true, onClick: () -> Unit) {
    OutlinedButton(onClick = onClick, enabled = enabled, modifier = Modifier.fillMaxWidth()) {
        Text("$label · ${TrainingConsoleRules.onOff(on)}", style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
private fun StateButton(text: String, enabled: Boolean = true, onClick: () -> Unit) {
    OutlinedButton(onClick = onClick, enabled = enabled, modifier = Modifier.fillMaxWidth()) {
        Text(text, style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
private fun HydraulicsSection(s: SimState, d: Derived, change: ((SimState) -> SimState) -> Unit, cockpit: CockpitModel) {
    Text("Hydraulics", style = MaterialTheme.typography.titleMedium)
    // the real P5 hydraulic panel (engine / electric pumps, standby) and the real MIP pressure dials
    P5Cutout(cockpit, 3) { p -> HydDoorsCvr(p, true) }
    BoxWithConstraints(Modifier.fillMaxWidth()) { MipHydDials(cockpit, maxWidth) }
    StateButton("GND INTERCONNECT · ${HydraulicTrainerRules.interconnectState(s.groundInterconnect)}") {
        change { HydraulicTrainerRules.toggle(it, "groundInterconnect") }
    }
    val onGround = HydraulicTrainerRules.groundServicingEnabled(s)
    SwitchButton("GND SERVICING", s.hydServicingConnected, onGround) { change { HydraulicTrainerRules.toggle(it, "hydServicingConnected") } }
    SwitchButton("GND HYD POWER", s.hydGroundPowerConnected, onGround) { change { HydraulicTrainerRules.toggle(it, "hydGroundPowerConnected") } }
    SwitchButton("GND AIR CART", s.groundPneumaticConnected, onGround) { change { HydraulicTrainerRules.toggleGroundAirCart(it) } }
    Text("Hydraulic flow drawing: not ported yet.", style = MaterialTheme.typography.bodySmall)
}

@Composable
private fun FlightControlsSection(s: SimState, change: ((SimState) -> SimState) -> Unit, cockpit: CockpitModel) {
    Text("Flight Controls", style = MaterialTheme.typography.titleMedium)
    // the real P5 FLIGHT CONTROL panel (FLT CONTROL A / B, spoilers, alternate flaps)
    P5Cutout(cockpit, 0) { p -> FltCtrlPanel(p) }
    Button(onClick = { change(TrainingConsoleRules::centerFlightControls) }, modifier = Modifier.fillMaxWidth()) {
        Text("Center flight controls", style = MaterialTheme.typography.labelSmall)
    }
    Text("Servicing / Test", style = MaterialTheme.typography.labelLarge)
    SwitchButton("Ground-sensing test override", s.groundSenseTest) { change(TrainingConsoleRules::toggleGroundSenseTest) }
    SwitchButton("Airborne test override", s.airborneTest) { change(TrainingConsoleRules::toggleAirborneTest) }
    SwitchButton("Ground hydraulic servicing", s.hydServicingConnected) { change(TrainingConsoleRules::toggleHydServicingConnected) }
    SwitchButton("Ground power cart (GPU)", s.externalPowerConnected) { change(TrainingConsoleRules::toggleExternalPowerConnected) }
}

@Composable
private fun BrakesSection(s: SimState, change: ((SimState) -> SimState) -> Unit, cockpit: CockpitModel) {
    Text("Brakes / Antiskid", style = MaterialTheme.typography.titleMedium)
    // the real main instrument panel anti-skid toggles, AUTO BRAKE knob and brake lights
    BoxWithConstraints(Modifier.fillMaxWidth()) { MipBrakePanel(cockpit, maxWidth) }
}

@Composable
private fun FuelSection(s: SimState, d: Derived, change: ((SimState) -> SimState) -> Unit, cockpit: CockpitModel) {
    Text("Fuel", style = MaterialTheme.typography.titleMedium)
    val pct = { v: Double -> if (d.fuelQuantityIndicationPowered) "%.1f%%".format(v) else "NO IND" }
    Text("TANK 1 ${pct(s.fuelTank1)}   CTR ${pct(s.fuelTankCenter)}   TANK 2 ${pct(s.fuelTank2)}", style = MaterialTheme.typography.bodySmall)
    // the real P5 FUEL panel (six boost pumps, crossfeed)
    P5Cutout(cockpit, 0) { p -> FuelPanel(p, true) }
    StateButton("SET LOW FUEL · 25%") { change { FuelAndGroundRules.setLowFuel(it) } }
    StateButton("RESET QUANTITY · 100%") { change { FuelAndGroundRules.resetQuantity(it) } }
}

