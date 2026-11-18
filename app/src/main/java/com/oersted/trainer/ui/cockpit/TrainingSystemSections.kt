package com.oersted.trainer.ui.cockpit

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.oersted.trainer.sim.Derived
import com.oersted.trainer.sim.ElectricalTrainerRules
import com.oersted.trainer.sim.EngineStartTrainerRules
import com.oersted.trainer.sim.FuelAndGroundRules
import com.oersted.trainer.sim.SimState
import com.oersted.trainer.ui.glareshield.GlareshieldPanel
import com.oersted.trainer.ui.overhead.AirCondPanel
import com.oersted.trainer.ui.overhead.BleedPanel
import com.oersted.trainer.ui.overhead.BottomStrip
import com.oersted.trainer.ui.overhead.CabinServicePanel
import com.oersted.trainer.ui.overhead.CargoFirePanel
import com.oersted.trainer.ui.overhead.DomeWhite
import com.oersted.trainer.ui.overhead.GenPanel
import com.oersted.trainer.ui.overhead.IcePanel
import com.oersted.trainer.ui.overhead.MeterPanel
import com.oersted.trainer.ui.overhead.P5ApuControls
import com.oersted.trainer.ui.overhead.P5Cutout
import com.oersted.trainer.ui.overhead.P5WideCutout
import com.oersted.trainer.ui.overhead.PressPanel
import com.oersted.trainer.ui.overhead.StandbyPanel
import com.oersted.trainer.ui.overhead.rememberP5
import com.oersted.trainer.ui.panel.ElectricalDistributionModule
import com.oersted.trainer.ui.panel.FaultModule
import com.oersted.trainer.ui.panel.FireModule
import com.oersted.trainer.ui.panel.ScenarioModule
import com.oersted.trainer.ui.pedestal.PedestalFireCutout
import com.oersted.trainer.ui.pedestal.PedestalRadiosCutout

/**
 * Remaining Training Console sections, built from cut-outs of the real panels (P5 overhead panels, pedestal FIRE and radio
 * stacks, glareshield, existing training modules) plus the few training-only buttons whose rules are already ported.
 * The web's large flow drawings (HydraulicNode diagrams of the Pneumatic / Air Conditioning / Cabin Pressurization / Electrical
 * trainers) and the section-specific trainers (Pitot/Static faults, Ice & Rain scenarios, Lights scenarios, Navigation phase
 * controller, Autopilot simulator panel) are not ported yet; see docs/HANDOFF.md. Compose only; verify on CI.
 */


@Composable
private fun Title(text: String) = Text(text, style = MaterialTheme.typography.titleMedium)

@Composable
private fun Todo(text: String) = Text(text, style = MaterialTheme.typography.bodySmall)

@Composable
internal fun ElectricalTrainerSection(s: SimState, d: Derived, change: Change, cockpit: CockpitModel) {
    Title("Electrical Power")
    // real P5 meter, standby power and generator panels
    P5Cutout(cockpit, 1) { p -> MeterPanel(p); StandbyPanel(p); GenPanel(p, true) }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        ActionButton(EngineStartTrainerRules.batteryLabel(s.battery), onClick = { change(ElectricalTrainerRules::toggleBattery) }, modifier = Modifier.weight(1f))
        ActionButton(EngineStartTrainerRules.groundPowerLabel(s.externalPowerConnected), onClick = { change(FuelAndGroundRules::toggleGroundPowerCart) }, modifier = Modifier.weight(1f))
    }
    Spacer(Modifier.height(6.dp))
    ElectricalDistributionModule(s, d)
    Todo("Electrical flow drawing: not ported yet.")
}

@Composable
internal fun PneumaticTrainerSection(s: SimState, d: Derived, change: Change, cockpit: CockpitModel) {
    Title("Pneumatic")
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Chip(EngineStartTrainerRules.ductChip("L", d.leftDuctPsi), EngineStartTrainerRules.ductOk(d.leftDuctPsi), Modifier.weight(1f))
        Chip(EngineStartTrainerRules.ductChip("R", d.rightDuctPsi), EngineStartTrainerRules.ductOk(d.rightDuctPsi), Modifier.weight(1f))
    }
    // real P5 bleed air panel
    P5Cutout(cockpit, 4) { p -> BleedPanel(p) }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        ActionButton(EngineStartTrainerRules.groundAirLabel(s.groundPneumaticConnected), s.wow, { change(FuelAndGroundRules::toggleGroundAirCart) }, Modifier.weight(1f))
        ActionButton(EngineStartTrainerRules.apuLabel(s.apuMaster == "OFF", d.apuAvailable), onClick = { change(FuelAndGroundRules::toggleApuAndBleed) }, modifier = Modifier.weight(1f))
    }
    Todo("Bleed air distribution drawing: not ported yet.")
}

@Composable
internal fun AirConditioningTrainerSection(cockpit: CockpitModel) {
    Title("Air Conditioning")
    P5Cutout(cockpit, 4) { p -> AirCondPanel(p) }
    Todo("Pack flow drawing: not ported yet.")
}

@Composable
internal fun CabinPressTrainerSection(cockpit: CockpitModel) {
    Title("Cabin Pressurization")
    P5Cutout(cockpit, 4) { p -> PressPanel(p, true) }
    Todo("Pressurization flow drawing: not ported yet.")
}

@Composable
internal fun ApuTrainerSection(s: SimState, d: Derived, change: Change, cockpit: CockpitModel) {
    Title("APU")
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Chip("APU ${if (s.apuMaster == "OFF") "OFF" else if (d.apuAvailable) "AVAILABLE" else "STARTING"}", d.apuAvailable, Modifier.weight(1f))
        Chip("RPM ${Math.round(s.apuRpm)}%", d.apuAvailable, Modifier.weight(1f))
        Chip("EGT ${Math.round(s.apuEgt)}°C", false, Modifier.weight(1f))
    }
    // real P5 APU master switch
    BoxWithConstraints(Modifier.fillMaxWidth()) { com.oersted.trainer.ui.overhead.P5ApuControls(rememberP5(cockpit), Modifier.fillMaxWidth(0.4f)) }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        ActionButton(EngineStartTrainerRules.batteryLabel(s.battery), onClick = { change(ElectricalTrainerRules::toggleBattery) }, modifier = Modifier.weight(1f))
        ActionButton("APU BLEED · ${com.oersted.trainer.sim.TrainingConsoleRules.onOff(s.apuBleed)}", onClick = { change(com.oersted.trainer.sim.ApuTrainerRules::toggleApuBleed) }, modifier = Modifier.weight(1f))
    }
    ActionButton("Set APU running", onClick = { cockpit.readyApu() })
    Todo("APU start-step checklist and APU panel drawing: not ported yet.")
}

@Composable
internal fun FireTrainerSection(s: SimState, d: Derived, cockpit: CockpitModel) {
    Title("Fire Protection")
    Chip("FIRE WARN ${if (d.fireWarn) "ACTIVE" else "CLEAR"}", !d.fireWarn)
    Spacer(Modifier.height(6.dp))
    // real pedestal FIRE / OVERHEAT panel and the real P5 cargo fire panel
    BoxWithConstraints(Modifier.fillMaxWidth()) { PedestalFireCutout(cockpit, maxWidth) }
    P5Cutout(cockpit, 1) { p -> CargoFirePanel(p) }
    FireModule(cockpit, s, d)
}

@Composable
internal fun IceRainTrainerSection(cockpit: CockpitModel) {
    Title("Ice & Rain Protection")
    P5Cutout(cockpit, 3) { p -> IcePanel(p) }
    Todo("Ice and rain scenario controls: not ported yet.")
}

@Composable
internal fun NavigationTrainerSection(cockpit: CockpitModel) {
    Title("Navigation")
    BoxWithConstraints(Modifier.fillMaxWidth()) { PedestalRadiosCutout(cockpit, maxWidth) }
    Todo("Navigation phase controller and VHF COM trainer: not ported yet.")
}

@Composable
internal fun AutopilotTrainerSection(cockpit: CockpitModel) {
    Title("Autopilot / Flight Director")
    // the real glareshield (MCP, flight mode annunciators)
    BoxWithConstraints(Modifier.fillMaxWidth()) { GlareshieldPanel(cockpit, maxWidth) }
    Todo("Autopilot simulator panel: not ported yet.")
}

@Composable
internal fun FaultInjectionSection(s: SimState, d: Derived, cockpit: CockpitModel) {
    FaultModule(cockpit, s)
    Spacer(Modifier.height(8.dp))
    ScenarioModule(cockpit, s, d)
}
