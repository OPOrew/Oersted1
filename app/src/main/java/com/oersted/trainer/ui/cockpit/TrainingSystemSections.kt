package com.oersted.trainer.ui.cockpit

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.Dp
import com.oersted.trainer.sim.FlyThePlanRules
import com.oersted.trainer.ui.common.Classic737Palette
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Box
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
    // web PneumaticTrainerPanel is the drawing only (no chips / ground buttons); the real P5 bleed air panel stays as the modernised control
    P5Cutout(cockpit, 4) { p -> BleedPanel(p) }
    Spacer(Modifier.height(8.dp))
    PneumaticFlowDiagram(s, d)
}

@Composable
internal fun AirConditioningTrainerSection(s: SimState, d: Derived, change: Change, cockpit: CockpitModel) {
    P5Cutout(cockpit, 4) { p -> AirCondPanel(p) }
    // web: two HydraulicTrainerSwitch (L PACK / R PACK, detail FLOWING / TRIPPED / NO FLOW), then amber TRIP RESET buttons
    Row(Modifier.fillMaxWidth().padding(bottom = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        HydTrainerSwitch("L PACK", if (s.packL) "ON" else "OFF", SwTone.ACCENT, AirConditioningRules.packDetail(d.packLFlow, s.packTripL), true, Modifier.weight(1f)) { change { AirConditioningRules.togglePack(it, true) } }
        HydTrainerSwitch("R PACK", if (s.packR) "ON" else "OFF", SwTone.ACCENT, AirConditioningRules.packDetail(d.packRFlow, s.packTripR), true, Modifier.weight(1f)) { change { AirConditioningRules.togglePack(it, false) } }
    }
    Row(Modifier.fillMaxWidth().padding(bottom = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        for ((label, left) in listOf("L PACK TRIP RESET" to true, "R PACK TRIP RESET" to false)) {
            val amber = Color(0xFFFCD34D)
            Text(
                label, color = amber, fontFamily = FontFamily.Monospace, fontSize = 8.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                modifier = Modifier.weight(1f).background(amber.copy(alpha = 0.05f), RoundedCornerShape(4.dp)).border(1.dp, Color(0xFFF59E0B).copy(alpha = 0.4f), RoundedCornerShape(4.dp))
                    .clickable { change { AirConditioningRules.resetPackTrip(it, left) } }.padding(horizontal = 8.dp, vertical = 4.dp),
            )
        }
    }
    AirCondTempControls(s, d, change)
    Spacer(Modifier.height(8.dp))
    AirCondFlowDiagram(s, d)
}

@Composable
internal fun CabinPressTrainerSection(s: SimState, d: Derived, change: Change, cockpit: CockpitModel) {
    P5Cutout(cockpit, 4) { p -> PressPanel(p, true) }
    // web: grid-cols-4 gap-1.5; the selected mode gets the accent border / tint
    Row(Modifier.fillMaxWidth().padding(bottom = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        for (m in AirConditioningRules.PRESS_MODES)
            WebButton(AirConditioningRules.pressModeLabel(m), Modifier.weight(1f), true, s.pressMode == m) { change { AirConditioningRules.setPressMode(it, m) } }
    }
    val manual = AirConditioningRules.outflowEnabled(s)
    Row(Modifier.fillMaxWidth().padding(bottom = 12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
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

/**
 * Port of AutopilotSimulator.tsx, one screen with no second simulator: the Navigation tab's map and situation display (no pedestal radios), the
 * FLY THE PLAN button, the flight-phase panel and the real glareshield (scaled to the console width, horizontal scroll below 0.55 so the knobs stay usable).
 */
@Composable
internal fun AutopilotTrainerSection(s: SimState, cockpit: CockpitModel) {
    val plan by cockpit.activePlan.collectAsState()
    val reason = FlyThePlanRules.disabledReason(plan != null)
    Column(Modifier.padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        NavSharedDisplay(cockpit, radios = false)

        Column(Modifier.fillMaxWidth().background(Classic737Palette.Panel, RoundedCornerShape(4.dp)).border(1.dp, Classic737Palette.Border, RoundedCornerShape(4.dp)).padding(8.dp)) {
            val ok = reason.isEmpty()
            Text(
                "FLY THE PLAN", color = if (ok) Color(0xFFA7F3D0) else Classic737Palette.Subtle, fontFamily = FontFamily.Monospace, fontSize = 10.sp,
                modifier = Modifier.alpha(if (ok) 1f else 0.5f).background(if (ok) Color(0x4D022C22) else Color.Transparent, RoundedCornerShape(4.dp))
                    .border(1.dp, if (ok) Color(0x9910B981) else Classic737Palette.Border, RoundedCornerShape(4.dp)).clickable(enabled = ok) { cockpit.flyThePlan() }.padding(horizontal = 12.dp, vertical = 8.dp),
            )
            if (!ok) Text(reason.uppercase(), color = Classic737Palette.Subtle, fontFamily = FontFamily.Monospace, fontSize = 8.sp, modifier = Modifier.padding(top = 6.dp))
        }

        FlightPhasePanel(s, cockpit)

        // ScaledGlareshield: design width 1360, fitted to the console width, Fit width / Full size toggle
        var full by remember { mutableStateOf(false) }
        Column {
            Row(Modifier.fillMaxWidth().padding(bottom = 4.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("GLARESHIELD · THE REAL CONTROLS (SAME STATE AS THE MAIN PANEL)", color = Classic737Palette.Subtle, fontFamily = FontFamily.Monospace, fontSize = 8.sp, modifier = Modifier.weight(1f))
                Text(
                    (if (full) "Fit width" else "Full size").uppercase(), color = Classic737Palette.Subtle, fontFamily = FontFamily.Monospace, fontSize = 8.sp,
                    modifier = Modifier.border(1.dp, Classic737Palette.Border, RoundedCornerShape(4.dp)).clickable { full = !full }.padding(horizontal = 6.dp, vertical = 2.dp),
                )
            }
            // Measure the available width outside the horizontal scroll (inside it maxWidth is infinite and "Fit width" never fits).
            BoxWithConstraints(Modifier.fillMaxWidth()) {
                val w = if (full) 1360.dp else maxOf(maxWidth, (1360 * 0.55f).dp).coerceAtMost(1360.dp)
                Box(Modifier.fillMaxWidth().background(Color(0xFF0B0D10), RoundedCornerShape(4.dp)).border(1.dp, Color(0xFF2A2F36), RoundedCornerShape(4.dp)).horizontalScroll(rememberScrollState())) {
                    GlareshieldPanel(cockpit, w)
                }
            }
        }
    }
}

@Composable
internal fun FaultInjectionSection(s: SimState, d: Derived, cockpit: CockpitModel) {
    FaultModule(cockpit, s)
    Spacer(Modifier.height(8.dp))
    ScenarioModule(cockpit, s, d)
}
