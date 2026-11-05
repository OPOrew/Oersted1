package com.oersted.trainer.ui.cockpit

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
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
import com.oersted.trainer.sim.SimState
import com.oersted.trainer.sim.TrainingConsoleRules

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
    change: ((SimState) -> SimState) -> Unit,
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
                "Flight Controls" -> FlightControlsSection(s, change)
                "Landing Gear" -> LandingGearSection(s, change)
                "Brakes / Antiskid" -> BrakesSection(s, change)
                else -> Text("$section: not ported yet.", style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

@Composable
private fun SwitchButton(label: String, on: Boolean, onClick: () -> Unit) {
    OutlinedButton(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        Text("$label · ${TrainingConsoleRules.onOff(on)}", style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
private fun FlightControlsSection(s: SimState, change: ((SimState) -> SimState) -> Unit) {
    Text("Flight Controls", style = MaterialTheme.typography.titleMedium)
    SwitchButton("FLT CTRL A", s.fltCtrlA) { change(TrainingConsoleRules::toggleFltCtrlA) }
    SwitchButton("FLT CTRL B", s.fltCtrlB) { change(TrainingConsoleRules::toggleFltCtrlB) }
    SwitchButton("SPOILER A", s.spoilerA) { change(TrainingConsoleRules::toggleSpoilerA) }
    SwitchButton("SPOILER B", s.spoilerB) { change(TrainingConsoleRules::toggleSpoilerB) }
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
private fun LandingGearSection(s: SimState, change: ((SimState) -> SimState) -> Unit) {
    Text("Landing Gear", style = MaterialTheme.typography.titleMedium)
    SwitchButton("PARKING BRAKE", s.parkingBrake) { change(TrainingConsoleRules::toggleParkingBrake) }
    Text("Servicing / Test", style = MaterialTheme.typography.labelLarge)
    SwitchButton("Ground hydraulic servicing", s.hydServicingConnected) { change(TrainingConsoleRules::toggleHydServicingConnected) }
    SwitchButton("Ground-sensing test override", s.groundSenseTest) { change(TrainingConsoleRules::toggleGroundSenseTest) }
    SwitchButton("Airborne test override", s.airborneTest) { change(TrainingConsoleRules::toggleAirborneTest) }
    SwitchButton("Ground power cart (GPU)", s.externalPowerConnected) { change(TrainingConsoleRules::toggleExternalPowerConnected) }
    Button(onClick = { change(TrainingConsoleRules::centerTillerAndPedals) }, modifier = Modifier.fillMaxWidth()) {
        Text("Center tiller & pedals", style = MaterialTheme.typography.labelSmall)
    }
    Text("Gear wheel and brake dynamics: not ported yet.", style = MaterialTheme.typography.bodySmall)
}

@Composable
private fun BrakesSection(s: SimState, change: ((SimState) -> SimState) -> Unit) {
    Text("Brakes / Antiskid", style = MaterialTheme.typography.titleMedium)
    SwitchButton("INBD ANTISKID", s.antiskidInbd) { change(TrainingConsoleRules::toggleAntiskidInbd) }
    SwitchButton("OUTBD ANTISKID", s.antiskidOutbd) { change(TrainingConsoleRules::toggleAntiskidOutbd) }
    Text("AUTOBRAKE", style = MaterialTheme.typography.labelLarge)
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        TrainingConsoleRules.AUTOBRAKE_LABELS.forEach { (level, label) ->
            val selected = s.autobrake.toInt() == level
            OutlinedButton(
                onClick = { change { st -> TrainingConsoleRules.setAutobrake(st, level) } },
                modifier = Modifier.weight(1f),
            ) { Text(if (selected) "[$label]" else label, style = MaterialTheme.typography.labelSmall) }
        }
    }
}
