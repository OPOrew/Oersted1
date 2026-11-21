package com.oersted.trainer.ui.cockpit

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.oersted.trainer.sim.ApuTrainerRules
import com.oersted.trainer.sim.Derived
import com.oersted.trainer.sim.SimState
import com.oersted.trainer.ui.overhead.P5ApuControls
import com.oersted.trainer.ui.overhead.P5EngineStartKnobs
import com.oersted.trainer.ui.overhead.rememberP5
import com.oersted.trainer.ui.panel.LightTone
import com.oersted.trainer.ui.panel.PanelCaptionLight

/**
 * Port of ApuTrainer.tsx: gauges, caption lights, the nine-step start sequence tracker and the P5 / APU controls. The rules
 * (steps, AUTO START demo, switch actions) are [ApuTrainerRules]. The P5 APU master switch and engine-start knobs are the real
 * overhead composables cut out of the P5. The animated cutaway is ApuDiagramView.kt. Compose only.
 */

private val ALine = Color(0xFF39414B)
private val ASubtle = Color(0xFF8F9AA5)
private val AOk = Color(0xFF65C798)
private val AWarn = Color(0xFFE24B4B)
private val AAccent = Color(0xFFD6A845)
private val AFg = Color(0xFFE6E1D2)

@Composable
private fun ABtn(text: String, on: Boolean = false, tone: Int = 0, enabled: Boolean = true, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val border = when { on -> AAccent; tone == 1 -> AOk; tone == 2 -> AWarn; else -> ALine }
    val bg = when { on -> Color(0x1AD6A845); tone == 1 -> Color(0x1A65C798); tone == 2 -> Color(0x1AE24B4B); else -> Color(0xFF0E1013) }
    Box(
        modifier.alpha(if (enabled) 1f else 0.45f).background(bg, RoundedCornerShape(4.dp)).border(1.dp, border, RoundedCornerShape(4.dp))
            .clickable(enabled = enabled) { onClick() }.padding(horizontal = 6.dp, vertical = 9.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text.uppercase(), color = AFg, fontSize = 9.sp, textAlign = TextAlign.Center) }
}

@Composable
private fun ATape(label: String, value: Double, unit: String, max: Double, modifier: Modifier) {
    val frac = (value / max).coerceIn(0.0, 1.0).toFloat()
    Column(modifier.background(Color(0xFF0E1013), RoundedCornerShape(4.dp)).border(1.dp, ALine, RoundedCornerShape(4.dp)).padding(6.dp)) {
        Text(label, color = ASubtle, fontSize = 8.sp, fontFamily = FontFamily.Monospace)
        Text("${Math.floor(value + 0.5).toLong()} $unit", color = AFg, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(4.dp))
        Box(Modifier.fillMaxWidth().height(5.dp).background(Color(0x66000000), RoundedCornerShape(3.dp))) {
            Box(Modifier.fillMaxWidth(frac).height(5.dp).background(Color(0xFFFFB340), RoundedCornerShape(3.dp)))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun ApuTrainerSection(s: SimState, d: Derived, cockpit: CockpitModel) {
    var auto by remember { mutableStateOf(false) }
    val lampTest = ApuTrainerRules.lampTest(s, d)
    fun lit(c: Boolean) = ApuTrainerRules.captionLit(s, d, c)
    val jam = ApuTrainerRules.doorJammed(s)
    fun act(a: ApuTrainerRules.Action) { val m = a.message; if (m == null) cockpit.applySim { a.state } else cockpit.applySimNote(m) { a.state } }

    // AUTO START (DEMO): performs the same switch actions a crew would, one step per state change
    LaunchedEffect(auto, s.battery, s.apuMaster, s.apuDoor > 0.98, s.apuRpm < 12, s.apuFirePulled, d.apuAvailable, d.batteryPower, jam) {
        if (!auto) return@LaunchedEffect
        when (ApuTrainerRules.autoStep(s, d)) {
            ApuTrainerRules.AutoAction.Stop -> auto = false
            ApuTrainerRules.AutoAction.SetBattery -> cockpit.patchSim { battery = true }
            ApuTrainerRules.AutoAction.SetMasterOn -> cockpit.patchSim { apuMaster = "ON" }
            ApuTrainerRules.AutoAction.SetMasterStart -> act(ApuTrainerRules.setMaster(s, d, "START"))
            null -> {}
        }
    }

    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("APU", color = AFg, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        if (s.apuFirePulled) {
            Text("APU FIRE HANDLE PULLED — APU SHUT DOWN, FUEL AND GENERATOR ISOLATED", color = AWarn, fontSize = 9.sp,
                modifier = Modifier.fillMaxWidth().background(Color(0x1AE24B4B), RoundedCornerShape(4.dp)).border(1.dp, AWarn, RoundedCornerShape(4.dp)).padding(8.dp))
        }
        ApuDiagram(s.apuDoor, s.apuFuelValve, s.apuStarter, s.apuRpm, s.apuEgt, s.apuOilPsi, s.apuBleedValve, d.apuGenOnBus, s.apuMaster == "OFF", jam)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            ATape("APU RPM", s.apuRpm, "%", 100.0, Modifier.weight(1f))
            ATape("APU EGT", s.apuEgt, "°C", 700.0, Modifier.weight(1f))
            ATape("OIL PRESS", s.apuOilPsi, "psi", 120.0, Modifier.weight(1f))
        }
        FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            PanelCaptionLight("APU LOW OIL", lit(d.apuLowOil), LightTone.WARN)
            PanelCaptionLight("STARTER ON", lit(s.apuStarter), LightTone.CAUTION)
            PanelCaptionLight(if (d.apuAvailable) "APU AVAIL 95%" else "APU NOT AVAIL", lit(d.apuAvailable), LightTone.OK)
            PanelCaptionLight("APU GEN ON BUS", lit(d.apuGenOnBus), LightTone.ELEC)
        }

        Text("START SEQUENCE", color = ASubtle, fontSize = 9.sp, fontFamily = FontFamily.Monospace, modifier = Modifier.padding(top = 6.dp))
        val steps = ApuTrainerRules.startSteps(s, d)
        val states = ApuTrainerRules.stepStates(steps)
        steps.forEachIndexed { i, st ->
            val state = states[i]
            val c = when (state) { ApuTrainerRules.StepState.DONE -> AOk; ApuTrainerRules.StepState.ACTIVE -> AAccent; ApuTrainerRules.StepState.BLOCKED -> AWarn; else -> ALine }
            Row(
                Modifier.fillMaxWidth().alpha(if (state == ApuTrainerRules.StepState.PENDING) 0.7f else 1f)
                    .background(c.copy(alpha = if (state == ApuTrainerRules.StepState.PENDING) 0f else 0.10f), RoundedCornerShape(4.dp))
                    .border(1.dp, c.copy(alpha = if (state == ApuTrainerRules.StepState.PENDING) 1f else 0.6f), RoundedCornerShape(4.dp)).padding(horizontal = 8.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Box(Modifier.size(16.dp).border(1.dp, c, CircleShape), contentAlignment = Alignment.Center) {
                    Text(when (state) { ApuTrainerRules.StepState.DONE -> "✓"; ApuTrainerRules.StepState.BLOCKED -> "!"; else -> "${i + 1}" }, color = c, fontSize = 8.sp, fontFamily = FontFamily.Monospace)
                }
                Column {
                    Text(st.title.uppercase(), color = AFg, fontSize = 9.sp)
                    Text(st.blocked ?: st.detail, color = if (state == ApuTrainerRules.StepState.BLOCKED) AWarn else ASubtle, fontSize = 9.sp, lineHeight = 11.sp)
                }
            }
        }
        Text("Steps 8–9 are load selections made after APU AVAILABLE. Timings are trainer values at 1×; starter cutout and start timeout follow the selected 35%/60 s or 50%/90 s effectivity.", color = ASubtle, fontSize = 9.sp, lineHeight = 12.sp)

        Text("P5 / APU CONTROLS", color = ASubtle, fontSize = 9.sp, fontFamily = FontFamily.Monospace, modifier = Modifier.padding(top = 6.dp))
        // the real P5 APU master switch and engine start knobs
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val p = rememberP5(cockpit)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
                P5ApuControls(p, Modifier.weight(1f))
                P5EngineStartKnobs(p, Modifier.weight(1f))
            }
        }
        ABtn("START EFFECTIVITY · ${if (s.apuStart50PercentEffectivityInstalled) "50% / 90 S MODIFIED" else "35% / 60 S BASELINE"}", on = s.apuStart50PercentEffectivityInstalled, modifier = Modifier.fillMaxWidth()) { act(ApuTrainerRules.toggleStartEffectivity(s)) }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            ABtn("BATTERY · ${if (s.battery) "ON" else "OFF"}", on = s.battery, modifier = Modifier.weight(1f)) { cockpit.applySim { ApuTrainerRules.toggleBattery(it) } }
            ABtn("APU BLEED · ${if (s.apuBleed) "ON" else "OFF"}", on = s.apuBleed, modifier = Modifier.weight(1f)) { cockpit.applySim { ApuTrainerRules.toggleApuBleed(it) } }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            for (m in listOf("OFF", "ON", "START")) ABtn("MASTER $m", on = s.apuMaster == m, modifier = Modifier.weight(1f)) { auto = false; act(ApuTrainerRules.setMaster(s, d, m)) }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            ABtn("APU GEN L · ${if (s.apuLeftControl) "ON" else "OFF"}", on = s.apuLeftControl, enabled = d.apuAvailable, modifier = Modifier.weight(1f)) { cockpit.applySim { ApuTrainerRules.toggleGen(it, d, true) } }
            ABtn("APU GEN R · ${if (s.apuRightControl) "ON" else "OFF"}", on = s.apuRightControl, enabled = d.apuAvailable, modifier = Modifier.weight(1f)) { cockpit.applySim { ApuTrainerRules.toggleGen(it, d, false) } }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            ABtn(if (auto) "AUTO START RUNNING…" else "AUTO START (DEMO)", tone = 1, enabled = !(auto || d.apuAvailable || s.apuFirePulled), modifier = Modifier.weight(1f)) { auto = true }
            ABtn("SHUTDOWN APU", tone = 2, enabled = d.apuAvailable, modifier = Modifier.weight(1f)) { auto = false; cockpit.applySim { ApuTrainerRules.shutdown(it, d) } }
        }
        Text("START NEEDS BATTERY/CONTROL POWER · BASELINE 35% / 60 S; MODIFIED EFFECTIVITY 50% / 90 S · GRD PWR INHIBITS APU GEN · FIRE HANDLE: P8", color = ASubtle, fontSize = 8.sp, fontFamily = FontFamily.Monospace)
    }
}
