package com.oersted.trainer.ui.cockpit

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.oersted.trainer.sim.Derived
import com.oersted.trainer.sim.FireProtectionRules
import com.oersted.trainer.sim.FireTrainerViewRules as F
import com.oersted.trainer.sim.SimState
import com.oersted.trainer.ui.common.Classic737Palette
import kotlinx.coroutines.delay

/**
 * Port of components/panel/FireProtectionTrainer.tsx (the whole Fire Protection screen): warning-light strip with fire test, the Engine 1 /
 * APU / Engine 2 cards (the live EngineCutaway / ApuDiagram with fire-loop, flame, mist and isolation-valve overlays, chips, handle and bottle
 * buttons), the main wheel well and cargo compartment scenes, the mitigation (recall item) lists with "Fire persists after 1st bottle", the
 * electrical / hydraulic / pneumatic supply chips, Set up / Clear all and the footnote. Handlers are FireProtectionRules; text and per-card
 * state logic are FireTrainerViewRules (tested). SVG <animate> = one InfiniteTransition clock read in the draw phase. Compose only.
 */
private val Ok = Color(F.OK)
private val Warn = Color(F.WARN)
private val Caut = Color(F.CAUT)
private val Sub = Color(F.SUB)
private val Dark = Color(0xFF0B0D10)

private fun toneColor(tone: String) = when (tone) { "warn" -> Warn; "caution" -> Caut; "ok" -> Ok; else -> Classic737Palette.Subtle }

@Composable
private fun FireCard(title: String, state: String, tone: String, content: @Composable ColumnScope.() -> Unit) {
    val border = when (tone) { "warn" -> Warn.copy(alpha = 0.7f); "caution" -> Caut.copy(alpha = 0.6f); else -> Classic737Palette.Border }
    Column(Modifier.fillMaxWidth().background(Classic737Palette.Panel.copy(alpha = 0.4f), RoundedCornerShape(8.dp)).border(1.dp, border, RoundedCornerShape(8.dp)).padding(8.dp)) {
        Row(Modifier.fillMaxWidth().padding(bottom = 6.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text(title.uppercase(), color = Classic737Palette.Fg, fontSize = 10.sp, letterSpacing = 0.05.em, modifier = Modifier.weight(1f))
            Text(state.uppercase(), color = toneColor(tone), fontFamily = FontFamily.Monospace, fontSize = 8.sp, textAlign = TextAlign.End)
        }
        content()
    }
}

@Composable
private fun ChipRow(chips: List<F.ChipData>, cols: Int = 4) {
    Column(Modifier.fillMaxWidth().padding(top = 6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        for (row in chips.chunked(cols)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                for (c in row) {
                    Column(
                        Modifier.weight(1f).background(Classic737Palette.Inset, RoundedCornerShape(4.dp)).border(1.dp, Classic737Palette.Border, RoundedCornerShape(4.dp)).padding(horizontal = 6.dp, vertical = 4.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(c.label.uppercase(), color = Classic737Palette.Subtle, fontFamily = FontFamily.Monospace, fontSize = 8.sp, lineHeight = 9.sp, textAlign = TextAlign.Center)
                        Text(c.text.uppercase(), color = if (c.warn) Warn else if (c.on) Ok else Classic737Palette.Subtle, fontFamily = FontFamily.Monospace, fontSize = 8.sp, lineHeight = 9.sp, textAlign = TextAlign.Center)
                    }
                }
                repeat(cols - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

@Composable
private fun MonoLabel(text: String, modifier: Modifier = Modifier) =
    Text(text.uppercase(), color = Classic737Palette.Subtle, fontFamily = FontFamily.Monospace, fontSize = 8.sp, letterSpacing = 0.05.em, modifier = modifier)

// ───────────────────────── drawing helpers (SVG units) ─────────────────────────

private fun O(x: Double, y: Double) = Offset(x.toFloat(), y.toFloat())

private fun dashed(a: Float, b: Float, phase: Float = 0f): PathEffect = PathEffect.dashPathEffect(floatArrayOf(a, b), phase)

private fun DrawScope.txt(tm: TextMeasurer, text: String, x: Double, baseline: Double, size: Double, color: Color, middle: Boolean = false, bold: Boolean = true) {
    val lay = tm.measure(text, TextStyle(color = color, fontSize = size.toFloat().toSp(), fontFamily = FontFamily.Monospace, fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal))
    val left = if (middle) x.toFloat() - lay.size.width / 2f else x.toFloat()
    drawText(lay, topLeft = Offset(left, baseline.toFloat() - lay.firstBaseline))
}

private fun cubic2(p: DoubleArray): Path = Path().apply {
    moveTo(p[0].toFloat(), p[1].toFloat())
    cubicTo(p[2].toFloat(), p[3].toFloat(), p[4].toFloat(), p[5].toFloat(), p[6].toFloat(), p[7].toFloat())
    cubicTo(p[8].toFloat(), p[9].toFloat(), p[10].toFloat(), p[11].toFloat(), p[12].toFloat(), p[13].toFloat())
    close()
}

/** web <Flames>: red outer and yellow inner tongues with their own opacity cycles. */
private fun DrawScope.flames(clock: State<Float>, cx: Double, base: Double, size: Double, n: Int, spread: Double, alpha: Float = 1f) {
    val t = clock.value.toDouble()
    for (f in F.flames(cx, base, size, n, spread)) {
        drawPath(cubic2(f.outer), Color(0xFFFF5A36), alpha = (F.sweep(t, f.outerDur, 0.95, 0.5) * alpha).toFloat())
        drawPath(cubic2(f.inner), Color(0xFFFFC94A), alpha = (F.sweep(t, f.innerDur, 1.0, 0.55) * alpha).toFloat())
    }
}

/** web <Mist>: five white puffs fading in and out. */
private fun DrawScope.mist(clock: State<Float>, cx: Double, cy: Double, r: Double) {
    val t = clock.value.toDouble()
    for (i in 0 until 5) {
        val m = F.mistPuff(cx, cy, r, i)
        drawCircle(Color(0xFFF2F6FA), m[2].toFloat(), O(m[0], m[1]), alpha = F.sweep(t, 1.1 + i * 0.2, 0.15, 0.5).toFloat())
    }
}

private fun DrawScope.glowEllipse(clock: State<Float>, cx: Double, cy: Double, rx: Double, ry: Double) {
    val a = F.sweep(clock.value.toDouble(), 0.8, 0.9, 0.4).toFloat()
    val br = Brush.radialGradient(0f to Color(0xFFFF8A3A).copy(alpha = 0.85f), 1f to Color(0xFFFF3B1F).copy(alpha = 0f), center = Offset.Zero, radius = rx.toFloat())
    withTransform({ translate(cx.toFloat(), cy.toFloat()); scale(1f, (ry / rx).toFloat(), Offset.Zero) }) { drawCircle(br, rx.toFloat(), Offset.Zero, alpha = a) }
}

private fun DrawScope.valveBox(tm: TextMeasurer, label: String, x: Double, y: Double, w: Double, textY: Double, size: Double, fill: Color, shut: Boolean) {
    val c = if (shut) Warn else Ok
    drawRoundRect(fill, O(x - w / 2, y), Size(w.toFloat(), 34f), CornerRadius(7f))
    drawRoundRect(c, O(x - w / 2, y), Size(w.toFloat(), 34f), CornerRadius(7f), style = Stroke(3f))
    txt(tm, "$label ${if (shut) "SHUT" else "OPEN"}", x, textY, size, c, middle = true)
}

private fun DrawScope.engineOverlay(tm: TextMeasurer, clock: State<Float>, e: F.Eng, agent: Boolean, mistOn: Boolean) {
    val loop = Color(F.loopColor(e.fire, e.pulled))
    withTransform({ scale(size.width / 1581f, size.height / 506f, Offset.Zero) }) {
        val st = Stroke(5f, pathEffect = dashed(16f, 9f))
        drawPath(Path().apply { moveTo(250f, 96f); lineTo(640f, 96f); lineTo(740f, 118f); lineTo(1120f, 118f) }, loop, alpha = 0.95f, style = st)
        drawPath(Path().apply { moveTo(250f, 428f); lineTo(640f, 428f); lineTo(740f, 410f); lineTo(1120f, 410f) }, loop, alpha = 0.95f, style = st)
        for (x in listOf(330.0, 560.0, 830.0, 1060.0)) {
            val top = if (x > 700) 118.0 else 96.0
            val bot = if (x > 700) 410.0 else 428.0
            for (y in listOf(top, bot)) { drawCircle(Dark, 9f, O(x, y)); drawCircle(loop, 9f, O(x, y), style = Stroke(3f)) }
        }
        txt(tm, F.engineLoopLabel(e), 252.0, 76.0, 26.0, loop)
        if (e.fire) {
            glowEllipse(clock, 820.0, 260.0, 330.0, 200.0)
            flames(clock, 760.0, 150.0, 150.0, 3, 1.5)
            flames(clock, 900.0, 400.0, 110.0, 2, 1.6)
        }
        if (agent && mistOn) mist(clock, 820.0, 250.0, 90.0)
        for ((l, x) in listOf("FUEL" to 300.0, "HYD" to 470.0, "BLEED" to 640.0)) valveBox(tm, l, x, 452.0, 110.0, 476.0, 22.0, Dark, e.pulled)
    }
}

private fun DrawScope.apuOverlay(tm: TextMeasurer, clock: State<Float>, s: SimState, mistOn: Boolean) {
    val fire = s.faults.apuFireDetected
    val loop = Color(F.loopColor(fire, s.apuFirePulled))
    withTransform({ scale(size.width / 975f, size.width / 975f, Offset.Zero); translate(-20f, -12f) }) {
        drawRoundRect(loop, O(640.0, 128.0), Size(330f, 330f), CornerRadius(26f), style = Stroke(5f, pathEffect = dashed(18f, 10f)))
        for ((x, y) in listOf(655.0 to 200.0, 655.0 to 390.0, 800.0 to 133.0, 800.0 to 452.0, 955.0 to 290.0)) {
            drawCircle(Color.White, 9f, O(x, y)); drawCircle(loop, 9f, O(x, y), style = Stroke(4f))
        }
        txt(tm, F.apuLoopLabel(s), 645.0, 112.0, 22.0, loop)
        if (fire) {
            glowEllipse(clock, 780.0, 290.0, 210.0, 190.0)
            flames(clock, 760.0, 160.0, 120.0, 3, 1.5)
            flames(clock, 770.0, 430.0, 95.0, 2, 1.7)
        }
        if (s.apuBottleFired && mistOn) mist(clock, 790.0, 290.0, 80.0)
        for ((l, x) in listOf("FUEL" to 110.0, "BLEED" to 250.0, "GEN" to 390.0)) valveBox(tm, l, x, 585.0, 100.0, 609.0, 21.0, Color.White, s.apuFirePulled)
    }
}

// ───────────────────────── the screen ─────────────────────────

@Composable
fun FireProtectionTrainerView(s: SimState, d: Derived, cockpit: CockpitModel) {
    val tm = rememberTextMeasurer()
    var test by remember { mutableStateOf(false) }
    var stubborn by remember { mutableStateOf(false) }
    val mist = remember { mutableStateMapOf<String, Long>() }
    LaunchedEffect(test) { if (test) { delay(3000); test = false } }
    LaunchedEffect(mist.isNotEmpty()) {
        while (mist.isNotEmpty()) {
            delay(700)
            val now = System.currentTimeMillis()
            mist.keys.toList().filter { now - (mist[it] ?: now) >= 5000 }.forEach { mist.remove(it) }
        }
    }
    val tr = rememberInfiniteTransition(label = "fire")
    val clock = tr.animateFloat(0f, 3600f, infiniteRepeatable(tween(3_600_000, easing = LinearEasing)), label = "clock")

    fun act(puffKey: String? = null, f: (SimState) -> FireProtectionRules.Outcome?) {
        val o = f(cockpit.simState.value) ?: return
        if (puffKey != null) mist[puffKey] = System.currentTimeMillis()
        val m = o.message
        if (m != null) cockpit.applySimNote(m) { o.state } else cockpit.applySim { o.state }
    }

    val f = s.faults
    val dc = d.dcPower
    val gearAvg = F.gearAvg(s)
    val cfWarn = d.cargoFwdFireWarn
    val caWarn = d.cargoAftFireWarn
    val apuFire = f.apuFireDetected

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        // warning lights
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            for (row in F.warningLights(s, d, test).chunked(4)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    for ((l, on) in row) {
                        Text(
                            "${l.uppercase()}\n${if (on) "● ON" else "○ OFF"}", color = if (on) Warn else Classic737Palette.Subtle, fontFamily = FontFamily.Monospace, fontSize = 8.sp, textAlign = TextAlign.Center,
                            modifier = Modifier.weight(1f).background(if (on) Warn.copy(alpha = 0.2f) else Classic737Palette.Inset, RoundedCornerShape(4.dp))
                                .border(1.dp, if (on) Warn else Classic737Palette.Border, RoundedCornerShape(4.dp)).padding(horizontal = 4.dp, vertical = 6.dp),
                        )
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Row(Modifier.weight(1f)) {
                MonoLabel("Indications ")
                Text((if (dc) "POWERED" else "NO DC POWER — warnings unavailable"), color = if (dc) Ok else Warn, fontFamily = FontFamily.Monospace, fontSize = 8.sp)
            }
            WebButton("Fire test", enabled = dc) { test = true }
        }

        fun engineCard(n: Int): @Composable () -> Unit = {
            val e = F.eng(s, d, n)
            val agent = s.fireBottleLDischarged || s.fireBottleRDischarged
            FireCard("Engine $n · fire protection", F.engineState(e), F.engineTone(e)) {
                Box(Modifier.fillMaxWidth()) {
                    EngineCutaway(n, e.n1, e.n2, e.egt, e.valve, e.fuel, e.running, Modifier.fillMaxWidth())
                    Canvas(Modifier.matchParentSize()) { engineOverlay(tm, clock, e, agent, mist.containsKey("e$n")) }
                }
                ChipRow(F.engineChips(e))
                Spacer(Modifier.height(6.dp))
                ButtonGrid(listOf(
                    GridBtn(F.engineHandleLabel(e), enabled = e.pulled || e.fire, tint = if (e.pulled) Warn else null) { act { FireProtectionRules.pullEngineHandle(it, n, e.fire) } },
                    GridBtn("◀ Bottle L", enabled = e.pulled && !s.fireBottleLDischarged) { act("e$n") { FireProtectionRules.dischargeEngineBottle(it, n, true, stubborn) } },
                    GridBtn("Bottle R ▶", enabled = e.pulled && !s.fireBottleRDischarged) { act("e$n") { FireProtectionRules.dischargeEngineBottle(it, n, false, stubborn) } },
                    GridBtn("Inject fire", tint = Warn) { act { FireProtectionRules.injectFault(it, if (n == 1) "engineFire1" else "engineFire2") } },
                ), cols = 4, gap = 4)
                Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.Center) {
                    Text("BOTTLE L ${if (s.fireBottleLDischarged) "DISCHARGED" else "CHARGED"}", color = if (s.fireBottleLDischarged) Caut else Ok, fontFamily = FontFamily.Monospace, fontSize = 8.sp)
                    Text(" · ", color = Classic737Palette.Subtle, fontFamily = FontFamily.Monospace, fontSize = 8.sp)
                    Text("BOTTLE R ${if (s.fireBottleRDischarged) "DISCHARGED" else "CHARGED"}", color = if (s.fireBottleRDischarged) Caut else Ok, fontFamily = FontFamily.Monospace, fontSize = 8.sp)
                    Text(" (shared by both engines)", color = Classic737Palette.Subtle, fontFamily = FontFamily.Monospace, fontSize = 8.sp)
                }
            }
        }

        engineCard(1)()

        // APU
        FireCard("APU · fire protection", F.apuState(s, d), F.apuTone(s)) {
            Box(Modifier.fillMaxWidth()) {
                ApuDiagram(s.apuDoor, s.apuFuelValve, s.apuStarter, s.apuRpm, s.apuEgt, s.apuOilPsi, s.apuBleedValve, d.apuGenOnBus, s.apuMaster == "OFF", F.apuDoorJammed(s))
                Canvas(Modifier.matchParentSize()) { apuOverlay(tm, clock, s, mist.containsKey("apu")) }
            }
            ChipRow(F.apuChips(s, d))
            Spacer(Modifier.height(6.dp))
            ButtonGrid(listOf(
                GridBtn(if (s.apuFirePulled) "Pulled · reset" else "Pull APU handle", tint = if (s.apuFirePulled) Warn else null) { act { FireProtectionRules.pullApuHandle(it) } },
                GridBtn("Discharge bottle", enabled = s.apuFirePulled && !s.apuBottleFired) { act("apu") { FireProtectionRules.dischargeApuBottle(it) } },
                GridBtn("Inject fire", tint = Warn) { act { FireProtectionRules.injectFault(it, "apuFireDetected") } },
            ), cols = 3, gap = 4)
            Text("APU BOTTLE ${if (s.apuBottleFired) "DISCHARGED" else "CHARGED"}", color = if (s.apuBottleFired) Caut else Ok, fontFamily = FontFamily.Monospace, fontSize = 8.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(top = 4.dp))
        }

        engineCard(2)()

        // wheel well
        FireCard("Main wheel well · overheat detection", F.wheelWellState(s), if (s.wheelWellFire) "warn" else "ok") {
            Canvas(Modifier.fillMaxWidth().aspectRatio(400f / 210f).clip(RoundedCornerShape(8.dp)).background(Dark).border(1.dp, Classic737Palette.Border, RoundedCornerShape(8.dp))) {
                wheelWellScene(tm, clock, s, gearAvg)
            }
            ChipRow(F.wheelWellChips(s))
            Spacer(Modifier.height(6.dp))
            ButtonGrid(listOf(
                GridBtn("Inject fire", tint = Warn) { act { FireProtectionRules.injectWheelWellFire(it) } },
                GridBtn("Gear lever UP") { act { FireProtectionRules.setGearLever(it, false) } },
                GridBtn("Gear lever DOWN", accent = s.gear == "DN") { act { FireProtectionRules.setGearLever(it, true) } },
            ), cols = 3, gap = 4)
        }

        // cargo
        FireCard("Cargo compartments · smoke / fire", F.cargoState(s, cfWarn, caWarn), F.cargoTone(s, cfWarn, caWarn)) {
            Canvas(Modifier.fillMaxWidth().aspectRatio(400f / 190f).clip(RoundedCornerShape(8.dp)).background(Dark).border(1.dp, Classic737Palette.Border, RoundedCornerShape(8.dp))) {
                cargoScene(tm, clock, s, cfWarn, caWarn, mist.containsKey("cargo"))
            }
            ChipRow(F.cargoChips(s))
            Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                MonoLabel("Effectivity SB 26A1081")
                WebButton(if (s.cargoFireInstalled) "INSTALLED" else "NOT INSTALLED", accent = s.cargoFireInstalled) { act { FireProtectionRules.toggleCargoInstalled(it) } }
                if (s.cargoFireInstalled) {
                    WebButton("Loop A ${if (s.cargoLoopA) "OK" else "FAIL"}", accent = s.cargoLoopA) { act { FireProtectionRules.toggleCargoLoop(it, true) } }
                    WebButton("Loop B ${if (s.cargoLoopB) "OK" else "FAIL"}", accent = s.cargoLoopB) { act { FireProtectionRules.toggleCargoLoop(it, false) } }
                }
            }
            Spacer(Modifier.height(6.dp))
            ButtonGrid(listOf(
                GridBtn("Inject FWD cargo fire", tint = Warn) { act { FireProtectionRules.injectCargoFire(it, true) } },
                GridBtn("Inject AFT cargo fire", tint = Warn) { act { FireProtectionRules.injectCargoFire(it, false) } },
                GridBtn("Arm FWD", enabled = s.cargoFireInstalled, accent = s.cargoArmed == "FWD") { act { FireProtectionRules.armCargo(it, "FWD") } },
                GridBtn("Arm AFT", enabled = s.cargoFireInstalled, accent = s.cargoArmed == "AFT") { act { FireProtectionRules.armCargo(it, "AFT") } },
            ), cols = 2, gap = 4)
            WebButton("Cargo fire DISCHARGE", Modifier.fillMaxWidth().padding(top = 4.dp), enabled = s.cargoFireInstalled && !s.cargoBottleDischarged && s.cargoArmed != "NONE", tint = Warn) {
                act("cargo") { FireProtectionRules.dischargeCargo(it) }
            }
        }

        // mitigation
        Column {
            Row(Modifier.fillMaxWidth().padding(bottom = 4.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                MonoLabel("Mitigation · recall items", Modifier.weight(1f))
                WebButton("Fire persists after 1st bottle: ${if (stubborn) "ON" else "OFF"}", accent = stubborn) { stubborn = !stubborn }
            }
            val lists = F.mitigation(s, d)
            if (lists.isEmpty()) {
                Text(F.emptyMitigationText(s), color = Classic737Palette.Subtle, fontSize = 9.sp, lineHeight = 12.sp, modifier = Modifier.fillMaxWidth().background(Classic737Palette.Inset, RoundedCornerShape(4.dp)).border(1.dp, Classic737Palette.Border, RoundedCornerShape(4.dp)).padding(horizontal = 8.dp, vertical = 6.dp))
            }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                for (l in lists) {
                    Column(Modifier.fillMaxWidth().background(Classic737Palette.Inset, RoundedCornerShape(8.dp)).border(1.dp, Classic737Palette.Border, RoundedCornerShape(8.dp)).padding(8.dp)) {
                        Text(l.title.uppercase(), color = Classic737Palette.Fg, fontSize = 9.sp, letterSpacing = 0.025.em, modifier = Modifier.padding(bottom = 4.dp))
                        for ((t, done) in l.steps) {
                            Row(Modifier.padding(vertical = 2.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(if (done) "☑" else "☐", color = if (done) Ok else Classic737Palette.Subtle, fontSize = 9.sp)
                                Text(t, color = if (done) Ok else Classic737Palette.Subtle, fontSize = 9.sp, lineHeight = 12.sp)
                            }
                        }
                        if (l.note != null) {
                            Box(Modifier.padding(top = 4.dp).fillMaxWidth().height(1.dp).background(Classic737Palette.Border))
                            Text(l.note, color = Classic737Palette.Subtle, fontSize = 8.sp, lineHeight = 11.sp, modifier = Modifier.padding(top = 4.dp))
                        }
                    }
                }
            }
            val lost = F.lost(s, d)
            if (lost.isNotEmpty()) {
                Text("Effect of handle(s): ${lost.joinToString(" · ")}.", color = Classic737Palette.Subtle, fontSize = 9.sp, lineHeight = 12.sp,
                    modifier = Modifier.padding(top = 8.dp).fillMaxWidth().background(Classic737Palette.Inset, RoundedCornerShape(4.dp)).border(1.dp, Classic737Palette.Border, RoundedCornerShape(4.dp)).padding(horizontal = 8.dp, vertical = 6.dp))
            }
        }

        // downstream power
        Column { MonoLabel("Electrical supply", Modifier.padding(bottom = 4.dp)); ChipRow(F.electricalChips(s, d)) }
        Column { MonoLabel("Hydraulic power", Modifier.padding(bottom = 4.dp)); ChipRow(F.hydraulicChips(s, d)) }
        Column { MonoLabel("Pneumatic power", Modifier.padding(bottom = 4.dp)); ChipRow(F.pneumaticChips(s, d)) }

        ButtonGrid(listOf(
            GridBtn("Set up: engines + APU running") { act { FireProtectionRules.setupRunning(it, System.currentTimeMillis().toDouble()) } },
            GridBtn("Clear all fires · reset") { mist.clear(); act { FireProtectionRules.clearAll(it) } },
        ), cols = 2, gap = 4)
        Text(F.FOOTNOTE, color = Classic737Palette.Subtle, fontSize = 8.sp, lineHeight = 13.sp)
    }
}

private fun DrawScope.wheelWellScene(tm: TextMeasurer, clock: State<Float>, s: SimState, gearAvg: Double) {
    val t = clock.value.toDouble()
    val lvl = s.wheelWellLevel
    withTransform({ scale(size.width / 400f, size.width / 400f, Offset.Zero) }) {
        drawRect(Color(0xFF12161B), O(0.0, 150.0), Size(400f, 60f))
        drawRect(Color(0xFF1B2027), O(0.0, 40.0), Size(400f, 110f)); drawRect(Color(0xFF4A5560), O(0.0, 40.0), Size(400f, 110f), style = Stroke(1f))
        txt(tm, "MAIN WHEEL WELL (cutaway, looking forward)", 10.0, 22.0, 9.0, Sub, bold = false)
        drawRoundRect(Color(0xFF0F1318), O(110.0, 48.0), Size(180f, 102f), CornerRadius(8f))
        drawRoundRect(if (s.wheelWellFire) Warn else Color(0xFF66727E), O(110.0, 48.0), Size(180f, 102f), CornerRadius(8f), style = Stroke(2f))
        val loop = if (s.wheelWellFire) Warn else Ok
        drawPath(Path().apply { moveTo(118f, 58f); lineTo(282f, 58f) }, loop, style = Stroke(3f, pathEffect = dashed(8f, 5f)))
        txt(tm, if (s.wheelWellFire) "OVERHEAT LOOP TRIPPED" else "OVERHEAT LOOP NORMAL", 200.0, 70.0, 8.0, loop, middle = true, bold = false)
        drawLine(Color(0xFF7D8995), O(110.0, 150.0), O(110.0 - 44 * gearAvg, 150 + 22 * gearAvg), strokeWidth = 3f)
        drawLine(Color(0xFF7D8995), O(290.0, 150.0), O(290.0 + 44 * gearAvg, 150 + 22 * gearAvg), strokeWidth = 3f)
        withTransform({ translate(0f, (gearAvg * 62).toFloat()) }) {
            drawRect(Color(0xFF8B95A1), O(196.0, 70.0), Size(8f, 48f))
            for (x in listOf(182.0, 218.0)) {
                drawCircle(Color(0xFF20242B), 22f, O(x, 116.0)); drawCircle(Color(0xFFA9B3BD), 22f, O(x, 116.0), style = Stroke(3f)); drawCircle(Color(0xFF66727E), 8f, O(x, 116.0))
            }
            if (lvl > 0.05) {
                val g = Brush.radialGradient(0f to Color(0xFFFF8A3A).copy(alpha = 0.8f), 1f to Color(0xFFFF3B1F).copy(alpha = 0f), center = O(200.0, 116.0), radius = 34f)
                drawCircle(g, 34f, O(200.0, 116.0), alpha = (0.4 + lvl * 0.6).toFloat().coerceIn(0f, 1f))
            }
        }
        if (lvl > 0.05) {
            val ga = Math.min(1.0, 0.4 + lvl).toFloat()
            val g = Brush.radialGradient(0f to Color(0xFFFF8A3A).copy(alpha = 0.8f), 1f to Color(0xFFFF3B1F).copy(alpha = 0f), center = Offset.Zero, radius = 80f)
            withTransform({ translate(200f, 100f); scale(1f, 45f / 80f, Offset.Zero) }) { drawCircle(g, 80f, Offset.Zero, alpha = (0.6 * lvl * ga).toFloat()) }
            flames(clock, 200.0, 148 + gearAvg * 30, 22 + lvl * 62, 3, 1.7, ga)
        }
        if (gearAvg > 0.6) {
            val ph = ((32 * ((t % 0.7) / 0.7))).toFloat()
            for (i in 0..2) drawLine(Color(0xFF4DD0C8).copy(alpha = 0.8f), O(20.0, 180.0 + i * 10), O(90.0, 180.0 + i * 10), strokeWidth = 2f, pathEffect = dashed(10f, 6f, ph))
            txt(tm, "AIRFLOW COOLS THE WELL", 20.0, 172.0, 8.0, Color(0xFF4DD0C8), bold = false)
        }
        if (gearAvg < 0.3 && s.wheelWellFire) txt(tm, "ENCLOSED · FIRE BUILDING", 200.0, 200.0, 9.0, Warn, middle = true, bold = false)
        drawRoundRect(Dark, O(340.0, 50.0), Size(12f, 96f), CornerRadius(3f)); drawRoundRect(Color(0xFF4A5560), O(340.0, 50.0), Size(12f, 96f), CornerRadius(3f), style = Stroke(1f))
        drawRect(if (lvl > 0.6) Warn else Caut, O(341.0, 147 - 94 * lvl), Size(10f, (94 * lvl).toFloat()))
        txt(tm, "FIRE", 346.0, 162.0, 7.0, Sub, middle = true, bold = false)
    }
}

private fun DrawScope.cargoScene(tm: TextMeasurer, clock: State<Float>, s: SimState, cfWarn: Boolean, caWarn: Boolean, mistOn: Boolean) {
    val t = clock.value.toDouble()
    val inst = s.cargoFireInstalled
    val dim = if (inst) 1f else 0.45f
    val grey = Color(0xFF3A414A)
    withTransform({ scale(size.width / 400f, size.width / 400f, Offset.Zero) }) {
        txt(tm, if (inst) "CARGO COMPARTMENTS (side cutaway, nose left)" else "CARGO FIRE SYSTEM NOT INSTALLED · SB 26A1081", 10.0, 16.0, 9.0, Sub, bold = false)
        if (inst) {
            for ((x, ok, label, tx) in listOf(LoopBadge(280.0, s.cargoLoopA, "LOOP A", 306.0), LoopBadge(338.0, s.cargoLoopB, "LOOP B", 364.0))) {
                val c = if (ok) Ok else Warn
                drawRoundRect(Color(0xFF0F1318), O(x, 6.0), Size(52f, 14f), CornerRadius(3f)); drawRoundRect(c, O(x, 6.0), Size(52f, 14f), CornerRadius(3f), style = Stroke(1.5f))
                txt(tm, label, tx, 16.0, 7.0, c, middle = true, bold = false)
            }
        }
        val hull = Path().apply {
            moveTo(8f, 105f); cubicTo(8f, 60f, 40f, 46f, 90f, 46f); lineTo(320f, 46f); cubicTo(365f, 46f, 392f, 72f, 392f, 105f)
            cubicTo(392f, 140f, 365f, 152f, 320f, 152f); lineTo(90f, 152f); cubicTo(40f, 152f, 8f, 140f, 8f, 105f); close()
        }
        drawPath(hull, Color(0xFF161B21), alpha = dim); drawPath(hull, Color(0xFF66727E), alpha = dim, style = Stroke(2f))
        drawLine(grey.copy(alpha = dim), O(20.0, 98.0), O(382.0, 98.0), strokeWidth = 1f, pathEffect = dashed(4f, 3f))
        txt(tm, "PASSENGER CABIN", 200.0, 82.0, 8.0, Sub.copy(alpha = dim), middle = true, bold = false)
        for ((name, x, w, fire, lv) in listOf(CargoComp("FWD", 62.0, 116.0, s.cargoFwdFire, s.cargoFwdLevel), CargoComp("AFT", 250.0, 116.0, s.cargoAftFire, s.cargoAftLevel))) {
            val armed = inst && s.cargoArmed == name
            val warned = if (name == "FWD") cfWarn else caWarn
            val col = if (!inst) grey else if (warned || fire) Warn else if (lv > 0.05) Caut else if (armed) Color(0xFF4DA3FF) else Color(0xFF66727E)
            val a = if (inst) 1f else 0.4f
            drawRoundRect(Color(0xFF0F1318), O(x, 104.0), Size(w.toFloat(), 40f), CornerRadius(6f), alpha = a)
            drawRoundRect(col, O(x, 104.0), Size(w.toFloat(), 40f), CornerRadius(6f), alpha = a, style = Stroke(2.2f))
            txt(tm, "$name CARGO ${if (!inst) "· N/A" else if (armed) "· ARMED" else ""}".trimEnd(), x + 6, 116.0, 8.0, col.copy(alpha = a))
            drawCircle(Dark, 4f, O(x + w - 14, 112.0), alpha = a)
            drawCircle(if (!inst) grey else if (warned || fire) Warn else Ok, 4f, O(x + w - 14, 112.0), alpha = a, style = Stroke(2f))
            if (inst && lv > 0.05) for (i in 0..3) {
                val base = 128.0 - (i % 2) * 6
                val cy = F.sweep(t, 1.6 + i * 0.3, base, base - 10)
                drawCircle(Color(0xFF9AA4AE), (5 + lv * 11).toFloat(), O(x + 20 + i * (w - 40) / 3, cy), alpha = (0.15 + lv * 0.4).toFloat())
            }
            if (inst && fire && lv > 0.12) flames(clock, x + w / 2, 142.0, 10 + lv * 26, 2, 1.6)
            if (inst && s.cargoBottleDischarged && armed && mistOn) mist(clock, x + w / 2, 128.0, 16.0)
            val pipe = Path().apply { moveTo(200f, 165f); lineTo((x + w / 2).toFloat(), 165f); lineTo((x + w / 2).toFloat(), 144f) }
            val pa = if (inst) 1f else 0.35f
            if (armed) drawPath(pipe, Color(0xFF4DA3FF), alpha = pa, style = Stroke(2.5f)) else drawPath(pipe, grey, alpha = pa, style = Stroke(1.5f, pathEffect = dashed(4f, 3f)))
        }
        val ac = if (!inst) grey else if (s.cargoBottleDischarged) Caut else Ok
        val aa = if (inst) 1f else 0.4f
        drawRoundRect(Color(0xFF0F1318), O(186.0, 160.0), Size(28f, 22f), CornerRadius(6f), alpha = aa)
        drawRoundRect(ac, O(186.0, 160.0), Size(28f, 22f), CornerRadius(6f), alpha = aa, style = Stroke(2f))
        txt(tm, if (inst) "AGENT" else "N/A", 200.0, 175.0, 7.0, ac.copy(alpha = aa), middle = true, bold = false)
    }
}

private data class LoopBadge(val x: Double, val ok: Boolean, val label: String, val tx: Double)
private data class CargoComp(val name: String, val x: Double, val w: Double, val fire: Boolean, val lv: Double)
