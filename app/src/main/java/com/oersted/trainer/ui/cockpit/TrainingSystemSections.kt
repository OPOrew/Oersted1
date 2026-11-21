package com.oersted.trainer.ui.cockpit

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.oersted.trainer.sim.AirConditioningRules
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
    // real P5 meter, standby power and generator panels
    P5Cutout(cockpit, 1) { p -> MeterPanel(p); StandbyPanel(p); GenPanel(p, true) }
    Spacer(Modifier.height(6.dp))
    // web ElectricalPowerTrainer: header, live flow diagram, controls, relationships and the apply-power walkthrough
    ElectricalPowerFlowPanel(s, d, cockpit, change)
}

@Composable
internal fun PneumaticTrainerSection(s: SimState, d: Derived, change: Change, cockpit: CockpitModel) {
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
    Spacer(Modifier.height(8.dp))
    PneumaticFlowDiagram(s, d)
}

@Composable
internal fun AirConditioningTrainerSection(s: SimState, d: Derived, change: Change, cockpit: CockpitModel) {
    P5Cutout(cockpit, 4) { p -> AirCondPanel(p) }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        ActionButton("L PACK · ${if (s.packL) "ON" else "OFF"}", onClick = { change { AirConditioningRules.togglePack(it, true) } }, modifier = Modifier.weight(1f))
        ActionButton("R PACK · ${if (s.packR) "ON" else "OFF"}", onClick = { change { AirConditioningRules.togglePack(it, false) } }, modifier = Modifier.weight(1f))
    }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        ActionButton("L PACK TRIP RESET", onClick = { change { AirConditioningRules.resetPackTrip(it, true) } }, modifier = Modifier.weight(1f))
        ActionButton("R PACK TRIP RESET", onClick = { change { AirConditioningRules.resetPackTrip(it, false) } }, modifier = Modifier.weight(1f))
    }
    AirCondTempControls(s, d, change)
    Spacer(Modifier.height(8.dp))
    AirCondFlowDiagram(s, d)
}

@Composable
internal fun CabinPressTrainerSection(s: SimState, d: Derived, change: Change, cockpit: CockpitModel) {
    P5Cutout(cockpit, 4) { p -> PressPanel(p, true) }
    val labels = mapOf("AUTO" to "AUTO", "STBY" to "STANDBY", "MAN_AC" to "MANUAL AC", "MAN_DC" to "MANUAL DC")
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        for (m in AirConditioningRules.PRESS_MODES)
            ActionButton(if (s.pressMode == m) "● ${labels[m]}" else labels[m]!!, onClick = { change { AirConditioningRules.setPressMode(it, m) } }, modifier = Modifier.weight(1f))
    }
    val manual = AirConditioningRules.outflowEnabled(s)
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        ActionButton("OUTFLOW VALVE · OPEN", manual, { change { AirConditioningRules.stepOutflow(it, true) } }, Modifier.weight(1f))
        ActionButton("OUTFLOW VALVE · CLOSE", manual, { change { AirConditioningRules.stepOutflow(it, false) } }, Modifier.weight(1f))
    }
    Spacer(Modifier.height(8.dp))
    CabinFlowDiagram(s, d)
}

@Composable
internal fun FireTrainerSection(s: SimState, d: Derived, cockpit: CockpitModel) {
    // web: FireProtectionTrainer, then TrainingSub "Servicing / Test" (FIRE WARN ACTIVE / CLEAR)
    FireProtectionTrainerView(s, d, cockpit)
    TrainingSub("Servicing / Test") { InfoBox("FIRE WARN ${if (d.fireWarn) "ACTIVE" else "CLEAR"}", Modifier.fillMaxWidth()) }
}

@Composable
internal fun AutopilotTrainerSection(s: SimState, cockpit: CockpitModel) {
    // flight phases + live readout, then the real glareshield (MCP, flight mode annunciators) and the real instrument panel
    FlightPhasePanel(s, cockpit)
    Spacer(Modifier.height(6.dp))
    ApTrainerView(cockpit, "ap")
    Spacer(Modifier.height(6.dp))
    BoxWithConstraints(Modifier.fillMaxWidth()) { GlareshieldPanel(cockpit, maxWidth) }
    Todo("Interactive map, runway view and the FLY THE PLAN button: not ported yet.")
}

@Composable
internal fun FaultInjectionSection(s: SimState, d: Derived, cockpit: CockpitModel) {
    FaultModule(cockpit, s)
    Spacer(Modifier.height(8.dp))
    ScenarioModule(cockpit, s, d)
}
