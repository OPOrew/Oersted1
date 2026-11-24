@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.oersted.trainer.ui.panel

import com.oersted.trainer.ui.common.insetShadow
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.oersted.trainer.sim.B737200ControlStandRules as R
import com.oersted.trainer.sim.PedestalLeversRules
import com.oersted.trainer.ui.cockpit.CockpitModel
import com.oersted.trainer.ui.common.Classic737Palette
import com.oersted.trainer.ui.pedestal.FlapLeverQuadrant
import com.oersted.trainer.ui.pedestal.SpeedBrakeLever

/**
 * Port of components/panel/B737200ControlStand.tsx: the compact CENTER CONTROL STAND · 737-200 (speed brake lever, two thrust levers
 * with reverse levers, fuel cutoff levers, flap lever, parking brake, stab trim cutouts, optional SPOILER A / B guarded rockers).
 * [scaleToFit] lays the stand out at 1040 dp and scales it down to the container (web ScaledStand, max 0.5). Rules are in
 * sim/B737200ControlStandRules.kt. Compose only; verified on CI.
 */
private fun c(v: Long) = Color(0xFF000000 or v)
private val Slot = c(0x080A0D)
private val Cream = c(0xD7D0BD)
private val Cream2 = c(0xC9C1AD)
private val MetalBrush get() = Brush.horizontalGradient(listOf(c(0x777B80), c(0x34383D), c(0x777B80)))

@Composable
fun B737200ControlStand(cockpit: CockpitModel, compact: Boolean = false, spoilerSwitches: Boolean = false, scaleToFit: Boolean = false) {
    if (!scaleToFit) {
        StandInner(cockpit, compact, spoilerSwitches)
        return
    }
    // web ScaledStand: fixed design width, scaled down (never above MAX_SCALE) and the height follows the scale
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val scale = R.scale(maxWidth.value.toDouble()).toFloat()
        Layout(content = { Box(Modifier.requiredWidth(R.DESIGN_W.dp)) { StandInner(cockpit, false, spoilerSwitches) } }) { measurables, constraints ->
            val p = measurables.first().measure(Constraints(minWidth = 0, maxWidth = Constraints.Infinity, minHeight = 0, maxHeight = Constraints.Infinity))
            val w = constraints.maxWidth
            layout(w, (p.height * scale).toInt()) {
                p.placeWithLayer(0, 0) {
                    scaleX = scale; scaleY = scale
                    transformOrigin = TransformOrigin(0f, 0f)
                }
            }
        }
    }
}

@Composable
private fun StandInner(cockpit: CockpitModel, compact: Boolean, spoilerSwitches: Boolean) {
    val s by cockpit.simState.collectAsState()
    val d by cockpit.derived.collectAsState()
    val hydAok = R.hydOk(d.hydA, d.flightControlAAvailable)
    val hydBok = R.hydOk(d.hydB, d.flightControlBAvailable)
    val card = RoundedCornerShape(12.dp)
    val inner = RoundedCornerShape(8.dp)
    Column(Modifier.fillMaxWidth().background(c(0x202328), card).border(1.dp, c(0x4A4F56), card).padding(12.dp)) {
        Row(Modifier.fillMaxWidth().padding(bottom = 8.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
            Column(Modifier.weight(1f)) {
                Text("CENTER CONTROL STAND · 737-200", color = c(0xB9AF98), fontSize = 10.sp, letterSpacing = 0.18.em)
                Text("Thrust quadrant / flight controls", color = Classic737Palette.Fg, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
            }
            Text("THRUST ${R.pedestalLabel(s.throttle1, s.throttle2)}", color = Classic737Palette.Subtle, fontFamily = FontFamily.Monospace, fontSize = 8.sp)
        }
        Column(Modifier.fillMaxWidth().background(Brush.verticalGradient(listOf(c(0x282C31), c(0x111419))), inner).insetShadow(inner, 30.dp, Color.Black.copy(alpha = 0.6f)).border(1.dp, c(0x0A0C0F), inner).padding(12.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(if (compact) 8.dp else 12.dp), verticalAlignment = Alignment.CenterVertically) {
                SpeedBrakeLever(s.speedBrake, { v -> cockpit.patchSimNote(PedestalLeversRules.speedBrakeNote(v)) { speedBrake = v } })
                val box = RoundedCornerShape(4.dp)
                Column(Modifier.weight(1f).background(c(0x191C20), box).border(1.dp, c(0x484D52), box).padding(12.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(if (compact) 12.dp else 24.dp)) {
                        for (n in 1..2) {
                            val throttle = if (n == 1) s.throttle1 else s.throttle2
                            val running = if (n == 1) d.eng1Running else d.eng2Running
                            val commandedRev = if (n == 1) s.rev1 else s.rev2
                            val rev = if (n == 1) d.thrustReverser1Active else d.thrustReverser2Active
                            val firePulled = if (n == 1) s.engine1FirePulled else s.engine2FirePulled
                            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                                LeverSlot(
                                    height = if (compact) 160 else 208, value = throttle, label = "Engine $n thrust lever", rev = rev,
                                    onValue = { v -> cockpit.patchSim { if (n == 1) throttle1 = v else throttle2 = v } },
                                    onReverse = {
                                        val r = R.reverser(n, commandedRev, s.wow, running, throttle, firePulled, d.hydA)
                                        if (!r.allowed) cockpit.patchSimNote(r.note) {}
                                        else cockpit.patchSimNote(r.note) { if (n == 1) rev1 = !commandedRev else rev2 = !commandedRev }
                                    },
                                )
                                Text("THRUST $n", color = Cream, fontFamily = FontFamily.Monospace, fontSize = 8.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.12.em, modifier = Modifier.padding(top = 4.dp))
                                Row(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Tag(if (running) "RUN" else "OFF", if (running) Classic737Palette.Ok.copy(alpha = 0.6f) else Classic737Palette.Border, if (running) Classic737Palette.Ok else Classic737Palette.Subtle)
                                    Tag("REV", if (rev) Classic737Palette.Warn.copy(alpha = 0.6f) else Classic737Palette.Border, if (rev) Classic737Palette.Warn else Classic737Palette.Subtle)
                                }
                            }
                        }
                    }
                    Row(Modifier.fillMaxWidth().padding(top = 16.dp), horizontalArrangement = Arrangement.spacedBy(48.dp, Alignment.CenterHorizontally), verticalAlignment = Alignment.Bottom) {
                        FuelCutoff("ENG 1 FUEL", s.lever1) { v -> cockpit.patchSim { lever1 = v } }
                        FuelCutoff("ENG 2 FUEL", s.lever2) { v -> cockpit.patchSim { lever2 = v } }
                    }
                    Box(Modifier.fillMaxWidth().padding(top = 12.dp), contentAlignment = Alignment.Center) {
                        Text(
                            "IDLE · THRUST LEVERS · FUEL CUTOFF · REVERSE", color = c(0xBDB5A2), fontFamily = FontFamily.Monospace, fontSize = 6.sp, letterSpacing = 0.15.em,
                            modifier = Modifier.background(c(0x111317), RoundedCornerShape(4.dp)).border(1.dp, c(0x5C5F62), RoundedCornerShape(4.dp)).padding(horizontal = 12.dp, vertical = 4.dp),
                        )
                    }
                }
                FlapLeverQuadrant(s.flaps, s.flapPos, { v -> cockpit.patchSimNote(PedestalLeversRules.flapNote(v)) { flaps = v } })
            }
            Box(Modifier.padding(top = 12.dp).fillMaxWidth().height(1.dp).background(c(0x383D43)))
            FlowRow(
                Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("PARKING BRAKE", color = Cream, fontFamily = FontFamily.Monospace, fontSize = 7.sp, modifier = Modifier.background(c(0x171A1E), RoundedCornerShape(4.dp)).border(1.dp, c(0x5C6065), RoundedCornerShape(4.dp)).padding(horizontal = 12.dp, vertical = 8.dp))
                    Box(
                        Modifier.size(width = 28.dp, height = 56.dp).offset(y = if (s.parkingBrake) 8.dp else 0.dp).background(MetalBrush, CircleShape).border(1.dp, c(0x111317), CircleShape)
                            .clickable { cockpit.patchSim { parkingBrake = !s.parkingBrake } },
                    )
                    Text(if (s.parkingBrake) "SET / PULLED" else "RELEASED", color = Classic737Palette.Subtle, fontFamily = FontFamily.Monospace, fontSize = 7.sp)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(20.dp), verticalAlignment = Alignment.CenterVertically) {
                    Toggle("STAB TRIM CUTOUT A", s.stabTrimCutoutA) { v -> cockpit.patchSimNote(R.cutoutNote("A", v)) { stabTrimCutoutA = v } }
                    Toggle("STAB TRIM CUTOUT B", s.stabTrimCutoutB) { v -> cockpit.patchSimNote(R.cutoutNote("B", v)) { stabTrimCutoutB = v } }
                }
                if (spoilerSwitches) {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Bottom) {
                        PanelGuardedRocker("SPOILER A", s.spoilerA, { v -> cockpit.patchSim { spoilerA = v } }, lit = hydAok && s.spoilerA)
                        PanelGuardedRocker("SPOILER B", s.spoilerB, { v -> cockpit.patchSim { spoilerB = v } }, lit = hydBok && s.spoilerB)
                    }
                }
                Column(
                    Modifier.background(c(0x111317), RoundedCornerShape(4.dp)).border(1.dp, c(0x3D4248), RoundedCornerShape(4.dp)).padding(horizontal = 12.dp, vertical = 8.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text("STAB TRIM", color = c(0xBDB5A2), fontFamily = FontFamily.Monospace, fontSize = 7.sp)
                    Text("INDICATION / WHEEL NOT YET MODELED", color = Classic737Palette.Subtle, fontFamily = FontFamily.Monospace, fontSize = 6.sp)
                }
            }
        }
    }
}

@Composable
private fun Tag(text: String, border: Color, ink: Color) {
    Text(text, color = ink, fontFamily = FontFamily.Monospace, fontSize = 6.sp, modifier = Modifier.border(1.dp, border, RoundedCornerShape(4.dp)).padding(horizontal = 4.dp, vertical = 2.dp))
}

/** web LeverSlot + VerticalLever + reverse lever: dark slot, 180 dp track with a 28 x 36 thumb, reverse handle riding above it. */
@Composable
private fun LeverSlot(height: Int, value: Double, label: String, rev: Boolean, onValue: (Double) -> Unit, onReverse: () -> Unit) {
    val shape = RoundedCornerShape(4.dp)
    Box(Modifier.size(width = 48.dp, height = height.dp).background(Slot, shape).insetShadow(shape, 12.dp, Color.Black.copy(alpha = 0.9f)).border(1.dp, c(0x090B0E), shape).padding(4.dp), contentAlignment = Alignment.BottomCenter) {
        Box(
            Modifier.align(Alignment.BottomCenter).size(width = 32.dp, height = R.TRACK_H.dp)
                .pointerInput(label) {
                    detectDragGestures(
                        onDragStart = { o -> onValue(R.valueAt((o.y / density).toDouble())) },
                        onDrag = { change, _ -> change.consume(); onValue(R.valueAt((change.position.y / density).toDouble())) },
                    )
                },
        ) {
            Box(Modifier.align(Alignment.TopCenter).padding(vertical = 0.dp).width(8.dp).fillMaxHeightDp().background(c(0x111419), CircleShape))
            Box(
                Modifier.align(Alignment.TopCenter).offset(y = R.thumbTop(value).dp).size(width = 28.dp, height = R.THUMB_H.dp)
                    .background(Brush.horizontalGradient(listOf(c(0x858A8F), c(0x3E4247), c(0x888D92))), RoundedCornerShape(2.dp)).border(1.dp, c(0x090A0C), RoundedCornerShape(2.dp)),
            )
        }
        Box(
            Modifier.align(Alignment.TopCenter).offset(y = if (rev) (-8 - 16).dp else (-8).dp).size(width = 16.dp, height = 40.dp)
                .background(Brush.horizontalGradient(listOf(c(0x676C71), c(0x2F3338), c(0x676C71))), RoundedCornerShape(4.dp)).border(1.dp, c(0x15171A), RoundedCornerShape(4.dp))
                .clickable(onClick = onReverse),
        )
    }
}

private fun Modifier.fillMaxHeightDp(): Modifier = this.height(R.TRACK_H.dp)

@Composable
private fun FuelCutoff(label: String, idle: Boolean, onChange: (Boolean) -> Unit) {
    Column(Modifier.clickable { onChange(!idle) }, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        val shape = RoundedCornerShape(4.dp)
        Box(Modifier.size(width = 32.dp, height = 64.dp).background(c(0x090B0D), shape).insetShadow(shape, 8.dp, Color.Black.copy(alpha = 0.8f)).border(1.dp, c(0x090B0D), shape)) {
            Box(
                Modifier.align(if (idle) Alignment.TopCenter else Alignment.BottomCenter).padding(vertical = 4.dp).size(width = 20.dp, height = 40.dp)
                    .background(Brush.horizontalGradient(listOf(c(0x777777), c(0x34383C), c(0x777777))), RoundedCornerShape(2.dp)).border(1.dp, c(0x111111), RoundedCornerShape(2.dp)),
            )
        }
        Text(label, color = Cream, fontFamily = FontFamily.Monospace, fontSize = 7.sp)
        Text(if (idle) "IDLE" else "CUTOFF", color = Classic737Palette.Subtle, fontFamily = FontFamily.Monospace, fontSize = 6.sp)
    }
}

@Composable
private fun Toggle(label: String, on: Boolean, onChange: (Boolean) -> Unit) {
    Column(Modifier.clickable { onChange(!on) }, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        val shape = RoundedCornerShape(4.dp)
        Box(Modifier.size(width = 28.dp, height = 44.dp).background(c(0x111419), shape).border(1.dp, c(0x555A60), shape).border(1.dp, c(0x6B5B3E), shape)) {
            Box(
                Modifier.align(if (on) Alignment.TopCenter else Alignment.BottomCenter).padding(vertical = 4.dp).size(width = 12.dp, height = 20.dp)
                    .background(MetalBrush, RoundedCornerShape(2.dp)).border(1.dp, c(0x090A0C), RoundedCornerShape(2.dp)),
            )
        }
        Text(label, color = Cream2, fontFamily = FontFamily.Monospace, fontSize = 7.sp, textAlign = TextAlign.Center, modifier = Modifier.widthIn(max = 72.dp))
    }
}
