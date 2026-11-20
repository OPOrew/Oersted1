package com.oersted.trainer.ui.cockpit

import com.oersted.trainer.ui.overhead.P5Cutout
import com.oersted.trainer.ui.overhead.IcePanel
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.oersted.trainer.sim.Derived
import com.oersted.trainer.sim.IceRainModel
import com.oersted.trainer.sim.IceRainRules
import com.oersted.trainer.sim.SimState
import com.oersted.trainer.ui.panel.LightTone
import com.oersted.trainer.ui.panel.PanelCaptionLight
import com.oersted.trainer.ui.overhead.OffOn
import com.oersted.trainer.ui.overhead.P5Plate
import com.oersted.trainer.ui.overhead.P5Cap

/**
 * Port of IceRainTrainer.tsx (ATA 30): window heat P5-9, probe heat, wing slat / engine cowl anti-ice, wipers and rain
 * repellent, trainer conditions and quick setups. The thermal / ice model is [IceRainModel] (IceRainDiagrams.tsx step) and the
 * switch handlers are [IceRainRules]. The four animated diagrams (cockpit windows, front overview, wing plan, probe locations) are in IceRainDiagramsView.kt;
 * the chips and caption lights carry the same numbers. Compose only; verify on CI.
 */

private val LineC = Color(0xFF39414B)
private val SubtleC = Color(0xFF8F9AA5)
private val OkC = Color(0xFF65C798)
private val WarnC = Color(0xFFE24B4B)
private val CautionC = Color(0xFFFFB340)
private val FgC = Color(0xFFE6E1D2)
private val AccentC = Color(0xFFD6A845)

/** A single real P5 bat-handle switch (the overhead's own [OffOn]) on a plate, with an amber heat lamp above it. */
@Composable
private fun P5RockerSwitch(label: String, on: Boolean, onChange: (Boolean) -> Unit, lit: Boolean) {
    P5Plate(Modifier.width(96.dp), pad = 6.dp, screws = 2) {
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Box(Modifier.size(8.dp).background(if (lit) Color(0xFFFFB347) else Color(0xFF2A2218), CircleShape).border(1.dp, Color(0xFF050607), CircleShape))
            OffOn(on, onChange, null, small = true)
            P5Cap(label)
        }
    }
}

@Composable
private fun IBtn(text: String, on: Boolean = false, warn: Boolean = false, enabled: Boolean = true, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val border = if (on) AccentC else if (warn) WarnC.copy(alpha = 0.5f) else LineC
    val bg = if (on) Color(0xFF1A1E24) else if (warn) Color(0x1AE24B4B) else Color(0xFF0E1013)
    Text(
        text.uppercase(), color = FgC, fontSize = 9.sp,
        modifier = modifier.alpha(if (enabled) 1f else 0.4f).background(bg, RoundedCornerShape(4.dp)).border(1.dp, border, RoundedCornerShape(4.dp))
            .clickable(enabled = enabled, onClick = onClick).padding(horizontal = 8.dp, vertical = 9.dp),
    )
}

/** Spring-loaded (momentary) switch position: active only while the pointer is held. */
@Composable
private fun HoldBtn(text: String, active: Boolean, warn: Boolean = false, enabled: Boolean = true, modifier: Modifier = Modifier, onHold: () -> Unit, onRelease: () -> Unit) {
    val border = if (active) AccentC else if (warn) WarnC.copy(alpha = 0.5f) else LineC
    val bg = if (active) Color(0xFF1A1E24) else if (warn) Color(0x1AE24B4B) else Color(0xFF0E1013)
    val hold by rememberUpdatedState(onHold)
    val release by rememberUpdatedState(onRelease)
    Text(
        text.uppercase(), color = FgC, fontSize = 9.sp,
        modifier = modifier.alpha(if (enabled) 1f else 0.4f).background(bg, RoundedCornerShape(4.dp)).border(1.dp, border, RoundedCornerShape(4.dp))
            .pointerInput(enabled) {
                if (enabled) detectTapGestures(onPress = { hold(); tryAwaitRelease(); release() })
            }.padding(horizontal = 8.dp, vertical = 9.dp),
    )
}

@Composable
private fun IChip(label: String, value: String, on: Boolean, modifier: Modifier = Modifier, warn: Boolean = false, caution: Boolean = false) {
    Column(modifier.background(Color(0xFF0E1013), RoundedCornerShape(4.dp)).border(1.dp, LineC, RoundedCornerShape(4.dp)).padding(horizontal = 6.dp, vertical = 4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label.uppercase(), color = SubtleC, fontFamily = FontFamily.Monospace, fontSize = 8.sp)
        Text(value.uppercase(), color = if (warn) WarnC else if (caution) CautionC else if (on) OkC else SubtleC, fontFamily = FontFamily.Monospace, fontSize = 8.sp)
    }
}

/** Rows of [per] equally wide cells. */
@Composable
private fun Grid(per: Int, cells: List<@Composable (Modifier) -> Unit>) {
    cells.chunked(per).forEach { row ->
        Row(Modifier.fillMaxWidth().padding(bottom = 4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            row.forEach { it(Modifier.weight(1f)) }
            repeat(per - row.size) { Spacer(Modifier.weight(1f)) }
        }
    }
}

@Composable
private fun ICard(title: String, state: String, tone: String, content: @Composable () -> Unit) {
    val c = when (tone) { "warn" -> WarnC; "caution" -> CautionC; else -> OkC }
    Column(Modifier.fillMaxWidth().padding(vertical = 4.dp).background(Color(0xFF14171B), RoundedCornerShape(10.dp)).border(1.dp, LineC, RoundedCornerShape(10.dp)).padding(10.dp)) {
        Row(Modifier.fillMaxWidth().padding(bottom = 8.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text(title.uppercase(), color = FgC, fontSize = 10.sp, modifier = Modifier.weight(1f))
            Text(state, color = c, fontFamily = FontFamily.Monospace, fontSize = 8.sp, modifier = Modifier.border(1.dp, c.copy(alpha = 0.4f), RoundedCornerShape(4.dp)).padding(horizontal = 6.dp, vertical = 2.dp))
        }
        content()
    }
}

@Composable
private fun Sub(text: String) = Text(text.uppercase(), color = SubtleC, fontFamily = FontFamily.Monospace, fontSize = 8.sp, modifier = Modifier.padding(bottom = 4.dp))

@Composable
private fun Note8(text: String) = Text(text, color = SubtleC, fontSize = 8.sp, lineHeight = 11.sp, modifier = Modifier.padding(top = 6.dp))

@Composable
private fun ValveLight(label: String, state: String, modifier: Modifier = Modifier) {
    val a = when (state) { "off" -> 0.15f; "dim" -> 0.5f; else -> 1f }
    Row(modifier.background(Color(0xFF0E1013), RoundedCornerShape(3.dp)).border(1.dp, LineC, RoundedCornerShape(3.dp)).padding(horizontal = 6.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(Modifier.size(10.dp).alpha(a).background(Color(0xFF59B6FF), CircleShape))
        Text(label, color = SubtleC, fontSize = 9.sp)
    }
}

private val WIPER_OPTIONS = listOf("PARK" to "PARK", "LOW" to "LOW", "INT" to "MID", "HIGH" to "HIGH")

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun IceRainTrainerSection(s: SimState, d: Derived, cockpit: CockpitModel) {
    val ac = d.acPower
    val dc = d.dcPower
    val lampTest = s.ltTest && dc
    var airborne by remember { mutableStateOf(false) }
    var rain by remember { mutableStateOf(false) }
    var speed by remember { mutableStateOf(1.0) }
    var wingTest by remember { mutableStateOf(false) }
    // Trainer override: lets you see in-flight wing anti-ice behaviour while the sim sits on the ground.
    val wow = s.wow && !airborne
    val icing = s.icingConditions

    val ac1 = d.electricalSource1 != "NONE"
    val ac2 = d.electricalSource2 != "NONE"
    val ovht = IceRainModel.overheat(s)
    val winEnabled = IceRainModel.winEnabled(s, ac1, ac2, ovht)
    val probeHeated = IceRainModel.probeHeated(s, ac, dc, d.alphaVaneHeatedL, d.alphaVaneHeatedR)
    val valveCmd = IceRainModel.valveCmd(s, ac, wow, wingTest)
    val hotAir = IceRainModel.hotAir(d.leftDuctPsi, d.rightDuctPsi)
    val cowlOpen = IceRainModel.cowlOpen(s, ac)
    val cowlHeated = IceRainModel.cowlHeated(cowlOpen, d.bleed1Available, d.bleed2Available)

    val inputs = IceRainModel.IceInputs(
        speed = speed, icing = icing, rain = rain, oatF = s.ambientTempF ?: 75.0, winEnabled = winEnabled,
        testPwr = s.windowHeatTest == "PWR", probeHeated = probeHeated, valveCmd = valveCmd, hotAir = hotAir, cowlHeated = cowlHeated,
    )
    val inputsNow by rememberUpdatedState(inputs)
    val wipersNow by rememberUpdatedState(s.wiperL to s.wiperR)

    // Animation loop (web useIceRainAnim): thermal / ice state steps every frame and is published about 10 times a second.
    var anim by remember { mutableStateOf(IceRainModel.initialState(inputs.oatF)) }
    val loop = remember { LoopState(anim) }
    val wiperPhases = remember { WiperPhases() }
    LaunchedEffect(Unit) {
        var last = androidx.compose.runtime.withFrameNanos { it }
        var acc = 0.0
        while (true) {
            androidx.compose.runtime.withFrameNanos { now ->
                val dt = minOf(0.25, (now - last) / 1e9)
                last = now
                val l = IceRainModel.wiperStep(loop.phaseL, wipersNow.first, dt)
                val r = IceRainModel.wiperStep(loop.phaseR, wipersNow.second, dt)
                loop.phaseL = l.phase; loop.phaseR = r.phase
                wiperPhases.l = l.phase; wiperPhases.r = r.phase
                loop.st = IceRainModel.step(loop.st, inputsNow, dt, mapOf("L" to l.strokesPerSec, "R" to r.strokesPerSec))
                acc += dt
                if (acc >= 0.1) { acc = 0.0; anim = loop.st }
            }
        }
    }

    // The overhead commands a timed spray pulse in SimState; consume each pulse once here, as the web effect does.
    var seenL by remember { mutableStateOf(s.rainRepelPulseL) }
    var seenR by remember { mutableStateOf(s.rainRepelPulseR) }
    LaunchedEffect(s.rainRepelPulseL, s.rainRepelPulseR, s.faults.rainRepellentFailure, dc) {
        if (seenL != s.rainRepelPulseL) {
            seenL = s.rainRepelPulseL
            if (dc && !s.faults.rainRepellentFailure) { loop.st = IceRainModel.spray(loop.st, "L"); anim = loop.st }
        }
        if (seenR != s.rainRepelPulseR) {
            seenR = s.rainRepelPulseR
            if (dc && !s.faults.rainRepellentFailure) { loop.st = IceRainModel.spray(loop.st, "R"); anim = loop.st }
        }
    }

    // Overheat cutoff (over 145 F while powered) latches the overheat light, like the real controller.
    val tripL1 = anim.win.getValue("L1").trip
    val tripL2 = anim.win.getValue("L2").trip
    val tripR1 = anim.win.getValue("R1").trip
    val tripR2 = anim.win.getValue("R2").trip
    LaunchedEffect(tripL1, tripL2, tripR1, tripR2) {
        IceRainRules.latchWindowOverheat(s, tripL1, tripL2, tripR1, tripR2)?.let { o ->
            cockpit.applySimNote(o.message ?: "") { cur -> IceRainRules.latchWindowOverheat(cur, tripL1, tripL2, tripR1, tripR2)?.state ?: cur }
        }
    }

    fun act(f: (SimState) -> IceRainRules.Outcome) {
        val o = f(s)
        if (o.message != null) cockpit.applySimNote(o.message) { cur -> f(cur).state } else cockpit.applySim { cur -> f(cur).state }
    }
    fun p(edit: SimState.() -> Unit) = cockpit.patchSim(edit)

    val win = anim.win
    fun w(id: String) = win.getValue(id)
    fun onLight(id: String) = w(id).p > 0.004
    val anyWindowOn = s.windowHeatLFwd || s.windowHeatLSide || s.windowHeatRFwd || s.windowHeatRSide
    val anyOvht = ovht.getValue("L1") || ovht.getValue("L2") || ovht.getValue("R1") || ovht.getValue("R2") || s.windowHeatTest == "OVHT"
    val anyProbe = probeHeated.values.any { it }
    val anyEngineAi = s.antiIce1 || s.antiIce2
    val anyWingAi = s.wingAntiIceL || s.wingAntiIceR
    val wingInhibited = anyWingAi && wow && !wingTest
    val lights = mapOf(
        "L" to IceRainModel.valveLight(anim.valve.getValue("L"), s.wingAntiIceL, wingTest, dc),
        "R" to IceRainModel.valveLight(anim.valve.getValue("R"), s.wingAntiIceR, wingTest, dc),
    )
    val valveOpen = mapOf("L" to (anim.valve.getValue("L") > 0.5 && hotAir.getValue("L")), "R" to (anim.valve.getValue("R") > 0.5 && hotAir.getValue("R")))
    val wiping = s.wiperL != "PARK" || s.wiperR != "PARK"
    val wiperState = if (s.wiperL == s.wiperR) s.wiperL else "${s.wiperL}/${s.wiperR}"
    val iceTotal = IceRainModel.iceTotal(anim)
    val alphaIce = s.alphaVaneIceL > 0.05 || s.alphaVaneIceR > 0.05

    fun winChip(label: String, id: String, group: String? = null): @Composable (Modifier) -> Unit = { m ->
        val a = w(id)
        val g = group?.let { w(it) }
        val pw = if (g != null) maxOf(a.p, g.p) else a.p
        IChip(label, IceRainModel.winChipValue(a, g), pw > 0.004, m, warn = ovht.getValue(id) || a.trip)
    }

    Text("Ice & Rain Protection", style = MaterialTheme.typography.titleMedium)
    Column(Modifier.fillMaxWidth().padding(vertical = 4.dp).background(Color(0xFF111418), RoundedCornerShape(10.dp)).border(1.dp, LineC, RoundedCornerShape(10.dp)).padding(10.dp)) {
        Sub("ATA 30 · Ice & rain protection")
        Text(
            "Window heat (30-41), probe heat (30-31), wing slat and engine cowl anti-ice (30-11), wipers and rain repellent (30-42 / 30-43). " +
                "Glass warms and frost clears, slats and cowls clear when hot air flows, wiper blades sweep. Window heat needs AC; probe heat needs DC.",
            color = SubtleC, fontSize = 10.sp, lineHeight = 14.sp,
        )
        Spacer(Modifier.height(6.dp))
        Grid(2, listOf(
            { m -> IChip("AC POWER", if (ac) "AVAILABLE" else "NONE", ac, m) },
            { m -> IChip("WINDOW HEAT", if (anyOvht) "OVHT" else if (anyWindowOn) "ON" else "OFF", anyWindowOn && ac, m, warn = anyOvht) },
            { m -> IChip("PROBE HEAT", if (anyProbe) "ON" else "OFF", anyProbe && dc, m) },
            { m -> IChip("ENG / WING AI", if (anyEngineAi || anyWingAi) "ON" else "OFF", anyEngineAi || anyWingAi, m) },
        ))
    }

    // ——— Trainer conditions ———
    Column(Modifier.fillMaxWidth().padding(vertical = 4.dp).background(Color(0xFF14171B), RoundedCornerShape(10.dp)).border(1.dp, LineC, RoundedCornerShape(10.dp)).padding(10.dp)) {
        Sub("Conditions (trainer)")
        FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            IBtn("Icing conditions · ${if (icing) "ON" else "OFF"}", on = icing) { act { IceRainRules.setIcing(it, !icing) } }
            IBtn("Rain · ${if (rain) "ON" else "OFF"}", on = rain) { rain = !rain }
            IBtn("Airborne logic · ${if (airborne) "ON" else "OFF"}", on = airborne) { airborne = !airborne }
            for (v in listOf(1.0, 10.0, 30.0)) IBtn(if (v == 1.0) "REAL" else "×${v.toInt()}", on = speed == v) { speed = v }
        }
        Spacer(Modifier.height(6.dp))
        Grid(2, listOf(
            { m -> IChip("OAT", "${IceRainModel.oatShown(icing, s.ambientTempF)}°F", false, m) },
            { m -> IChip("ICE ON AIRPLANE", if (iceTotal > 0.05) "${IceRainModel.jsRound(iceTotal * 100)}%" else "CLEAR", iceTotal > 0.05, m, caution = iceTotal > 0.05) },
            { m -> IChip("ALPHA VANE L/R ICE", "${IceRainModel.jsRound(s.alphaVaneIceL * 100)}% / ${IceRainModel.jsRound(s.alphaVaneIceR * 100)}%", alphaIce, m, caution = alphaIce) },
            { m -> IChip("TIME SCALE", if (speed == 1.0) "REAL TIME" else "×${speed.toInt()}", false, m) },
            { m -> IChip("RAIN", if (rain) "ON" else "OFF", rain, m) },
        ))
        Note8(
            "Airborne logic makes the wing anti-ice valves behave as in flight (the landing-gear safety relay no longer inhibits them) without moving the airplane. " +
                "Icing conditions hold the outside air at 25 °F or below with visible moisture: ice builds on anything that is not heated and melts off anything that is. " +
                "REAL runs the 3-minute window-heat power ramp at true speed; ×10 / ×30 compress the thermal and ice processes (wipers always run at real speed).",
        )
    }

    // ——— The real P5 ice module (window heat, pitot-static heat, wing / engine anti-ice) ———
    ICard("P5 overhead · window heat / probe heat / anti-ice", "REAL PANEL", "ok") {
        Sub("Cut-out of the flight-deck panel — same switches and lights as the cockpit tab")
        P5Cutout(cockpit, 3) { pp -> IcePanel(pp) }
    }

    // ——— Window heat P5-9 ———
    ICard("Window heat · P5-9 (ATA 30-41)", if (anyOvht) "OVERHEAT" else if (anyWindowOn && ac) "HEAT APPLIED" else "OFF", if (anyOvht) "caution" else "ok") {
        CockpitWindowsDiagram(anim, ovht, wiperPhases)
        Grid(3, listOf(winChip("L NO.1", "L1"), winChip("L NO.2", "L2"), winChip("L NO.4/5", "L4", "L5"), winChip("R NO.1", "R1"), winChip("R NO.2", "R2"), winChip("R NO.4/5", "R4", "R5")))
        for (side in listOf("L", "R")) {
            val f = "${side}1"; val sd = "${side}2"
            Column(Modifier.fillMaxWidth().padding(bottom = 6.dp).background(Color(0xFF0E1013), RoundedCornerShape(6.dp)).border(1.dp, LineC, RoundedCornerShape(6.dp)).padding(8.dp)) {
                Sub(if (side == "L") "Left" else "Right")
                Grid(2, listOf(
                    { m -> PanelCaptionLight("$side FWD ON", lampTest || (dc && onLight(f) && !ovht.getValue(f)), LightTone.OK, m) },
                    { m -> PanelCaptionLight("$side FWD OVHT", lampTest || (dc && ovht.getValue(f)), LightTone.CAUTION, m) },
                    { m -> PanelCaptionLight("$side SIDE ON", lampTest || (dc && onLight(sd) && !ovht.getValue(sd)), LightTone.OK, m) },
                    { m -> PanelCaptionLight("$side SIDE OVHT", lampTest || (dc && ovht.getValue(sd)), LightTone.CAUTION, m) },
                ))
            }
        }
        Column(Modifier.fillMaxWidth().background(Color(0xFF0E1013), RoundedCornerShape(6.dp)).border(1.dp, LineC, RoundedCornerShape(6.dp)).padding(8.dp)) {
            Sub("Test switch — spring-loaded to centre (hold)")
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                HoldBtn("PWR (hold)", s.windowHeatTest == "PWR", modifier = Modifier.weight(1f), onHold = { act { IceRainRules.setWindowHeatTest(it, "PWR") } }, onRelease = { act { IceRainRules.setWindowHeatTest(it, "OFF") } })
                HoldBtn("OVHT (hold)", s.windowHeatTest == "OVHT", warn = true, modifier = Modifier.weight(1f), onHold = { act { IceRainRules.setWindowHeatTest(it, "OVHT") } }, onRelease = { act { IceRainRules.setWindowHeatTest(it, "OFF") } })
            }
        }
        Note8(
            "AMM 56-10-0: No.1 windshield, No.2 sliding window, No.4 and No.5 eyebrow windows are heated; No.3 is not. FWD switch = No.1, SIDE switch = No.2 + No.4/5. " +
                "No.1 and No.2 are controlled to 107 ±7 °F with power ramping to full over about 3 minutes; No.4/5 are held 80–120 °F by the No.5 thermal switch. " +
                "Power is cut at ≈145 °F (OVHT light, then master caution) — cycle that window switch OFF to reset. Holding PWR forces full power, so a long test on a warm window will trip the overheat cutoff.",
        )
    }

    // ——— Probe / pitot heat ———
    ICard("Probe / pitot heat · P5-9 (ATA 30-31)", if (anyProbe) "HEAT ON" else "OFF", "ok") {
        ProbeHeatDiagram(anim, probeHeated)
        FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            P5RockerSwitch("L ELEV PITOT (TAIL)", s.probeHeatElevL, onChange = { v -> act { IceRainRules.setProbeHeat(it, "probeHeatElevL", v) } }, lit = ac && s.probeHeatElevL && s.psPitotStaticA && s.psCbElevL)
            P5RockerSwitch("R ELEV PITOT (TAIL)", s.probeHeatElevR, onChange = { v -> act { IceRainRules.setProbeHeat(it, "probeHeatElevR", v) } }, lit = ac && s.probeHeatElevR && s.psPitotStaticB && s.psCbElevR)
            P5RockerSwitch("TEMP PROBE", s.probeHeatTemp, onChange = { v -> act { IceRainRules.setProbeHeat(it, "probeHeatTemp", v) } }, lit = ac && s.probeHeatTemp && s.psCbTempL && s.psCbTempR)
            P5RockerSwitch("L ALPHA VANE", s.probeHeatAlphaL, onChange = { v -> act { IceRainRules.setProbeHeat(it, "probeHeatAlphaL", v) } }, lit = d.alphaVaneHeatedL)
            P5RockerSwitch("R ALPHA VANE", s.probeHeatAlphaR, onChange = { v -> act { IceRainRules.setProbeHeat(it, "probeHeatAlphaR", v) } }, lit = d.alphaVaneHeatedR)
        }
        Spacer(Modifier.height(6.dp))
        fun on(b: Boolean) = if (b) "ON" else "OFF"
        Grid(2, listOf(
            { m -> IChip("CAPT PITOT", on(probeHeated.getValue("capt")), probeHeated.getValue("capt"), m) },
            { m -> IChip("F/O PITOT", on(probeHeated.getValue("fo")), probeHeated.getValue("fo"), m) },
            { m -> IChip("ELEV L/R", on(probeHeated.getValue("elevL") || probeHeated.getValue("elevR")), probeHeated.getValue("elevL") || probeHeated.getValue("elevR"), m) },
            { m -> val t = probeHeated.getValue("temp") || probeHeated.getValue("alphaL") || probeHeated.getValue("alphaR"); IChip("TEMP / ALPHA", on(t), t, m) },
        ))
        Note8("With icing conditions on, an unheated probe collects ice; heating clears it in seconds. The probes are on the same P5-9 module as window heat.")
    }

    // ——— Wing / engine anti-ice ———
    val wingState = if (wingInhibited) "WING INHIBITED (GND)"
    else if (valveOpen.getValue("L") || valveOpen.getValue("R") || cowlHeated.getValue(1) || cowlHeated.getValue(2)) "HOT AIR FLOWING"
    else if (anyEngineAi || anyWingAi) "SELECTED" else "OFF"
    ICard("Wing slats / engine cowl anti-ice (ATA 30-11)", wingState, if (wingInhibited) "caution" else "ok") {
        WingAntiIcePlan(anim, s.lePos, hotAir, lights, cowlOpen, cowlHeated, wingInhibited)
        FrontOverviewDiagram(anim, valveOpen, cowlHeated, ovht)
        FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            P5RockerSwitch("ENG 1 FUEL HEAT", s.fuelHeat, onChange = { v -> cockpit.applySim { IceRainRules.setFuelHeat(it, 1, v) } }, lit = d.fuelHeatValveOpen)
            P5RockerSwitch("ENG 2 FUEL HEAT", s.fuelHeat2, onChange = { v -> cockpit.applySim { IceRainRules.setFuelHeat(it, 2, v) } }, lit = d.fuelHeatValve2Open)
        }
        Spacer(Modifier.height(6.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            HoldBtn("WING A/I TEST (hold)", wingTest, warn = true, enabled = ac, modifier = Modifier.weight(1f), onHold = { wingTest = true }, onRelease = { wingTest = false })
            ValveLight("L VALVE OPEN", lights.getValue("L"), Modifier.weight(1f))
            ValveLight("R VALVE OPEN", lights.getValue("R"), Modifier.weight(1f))
        }
        Spacer(Modifier.height(6.dp))
        Grid(3, listOf(
            { m -> PanelCaptionLight("ENG 1 AI", lampTest || (ac && s.antiIce1), LightTone.OK, m) },
            { m -> PanelCaptionLight("ENG 2 AI", lampTest || (ac && s.antiIce2), LightTone.OK, m) },
            { m -> PanelCaptionLight("FUEL HT", lampTest || (ac && s.fuelHeat), LightTone.OK, m) },
            { m -> PanelCaptionLight("WING INHIBIT", lampTest || (dc && wingInhibited), LightTone.CAUTION, m) },
            { m -> PanelCaptionLight("BLEED LOAD", lampTest || (dc && ((s.antiIce1 && d.bleed1Available) || (s.antiIce2 && d.bleed2Available) || valveOpen.getValue("L") || valveOpen.getValue("R"))), LightTone.CAUTION, m) },
        ))
        Note8(
            "AMM 30-11-0: wing anti-ice heats the leading-edge slats only (three slats per wing). One switch drives both motor-driven valves, just outboard of each engine strut. " +
                "The landing-gear safety relay keeps them closed on the ground, so the blue VALVE OPEN light glows bright (valve disagrees with switch) until you hold TEST or are airborne. " +
                "Light: dim = open and agrees, bright = in transit or disagrees. Engine anti-ice heats the cowl lip, inlet guide vanes and nose dome (AMM chapter 75). Both are pneumatic: opening them loads the bleed manifold.",
        )
    }

    // ——— Wipers + rain repellent ———
    ICard("Windshield wipers · rain removal (ATA 30-42)", if (wiping) "WIPING" else "PARK", if (wiping && !rain) "caution" else "ok") {
        Column(Modifier.fillMaxWidth().background(Color(0xFF0E1013), RoundedCornerShape(6.dp)).border(1.dp, LineC, RoundedCornerShape(6.dp)).padding(8.dp)) {
            Sub("Common wiper switch — both No.1 windows")
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                for ((id, label) in WIPER_OPTIONS) IBtn(label, on = s.wiperL == id && s.wiperR == id, modifier = Modifier.weight(1f)) { act { IceRainRules.setWipers(it, id) } }
            }
        }
        Spacer(Modifier.height(6.dp))
        val wetL = anim.win.getValue("L1").wet
        val wetR = anim.win.getValue("R1").wet
        Grid(2, listOf(
            { m -> IChip("WIPERS", if (wiperState == "INT") "MID" else wiperState, wiping, m) },
            { m -> IChip("L NO.1 WET", "${IceRainModel.jsRound(wetL * 100)}%", false, m, caution = wetL > 0.3) },
            { m -> IChip("R NO.1 WET", "${IceRainModel.jsRound(wetR * 100)}%", false, m, caution = wetR > 0.3) },
            { m -> IChip("DRY OPERATION", if (wiping && !rain) "CAUTION" else "—", false, m, warn = wiping && !rain) },
        ))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            HoldBtn("L REPELLENT (press)", anim.repel.getValue("L") > 0.5, modifier = Modifier.weight(1f), onHold = { loop.st = IceRainModel.spray(loop.st, "L"); anim = loop.st }, onRelease = {})
            HoldBtn("R REPELLENT (press)", anim.repel.getValue("R") > 0.5, modifier = Modifier.weight(1f), onHold = { loop.st = IceRainModel.spray(loop.st, "R"); anim = loop.st }, onRelease = {})
        }
        Note8(
            "AMM 30-42-0: independent electric motors, one gang switch. Blades sweep an 84° arc; HIGH is at least 250 strokes/min (LOW and MID speeds here are trainer values). " +
                "Selecting PARK drives the blades home at high speed. Do not run the wipers on a dry windshield. Rain repellent (30-43) is sprayed on each No.1 window separately and works together with the wipers.",
        )
    }

    // ——— Quick setups ———
    Column(Modifier.fillMaxWidth().padding(vertical = 4.dp).background(Color(0xFF14171B), RoundedCornerShape(10.dp)).border(1.dp, LineC, RoundedCornerShape(10.dp)).padding(10.dp)) {
        Sub("Quick setups")
        FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            IBtn("All window heat ON") { act { IceRainRules.allWindowHeatOn(it) } }
            IBtn("All probe heat ON") { act { IceRainRules.allProbeHeatOn(it) } }
            IBtn("Eng + wing AI ON") { act { IceRainRules.engineAndWingAntiIceOn(it) } }
            IBtn("Icing encounter (all unheated)") { act { IceRainRules.setIcing(it, true) }; rain = false }
            IBtn("OVHT test (FWD on)", warn = true) { act { IceRainRules.overheatTestForward(it) } }
            IBtn("All OFF / PARK", on = true) {
                act { IceRainRules.setIcing(it, false) }
                rain = false; wingTest = false
                act { IceRainRules.allOffPark(it) }
            }
        }
    }
}

/** Mutable animation state held outside composition (web stRef + wiper phase refs). */
private class LoopState(var st: IceRainModel.IceState) {
    var phaseL = 0.0
    var phaseR = 0.0
}
