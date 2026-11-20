package com.oersted.trainer.ui.cockpit

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
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
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.input.pointer.PointerId
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.oersted.trainer.sim.Derived
import com.oersted.trainer.sim.FlightInputRules as R
import com.oersted.trainer.sim.FlightModes
import com.oersted.trainer.sim.SimState
import com.oersted.trainer.ui.panel.PanelControlSlider
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * Port of FlightModeControl.tsx, FlightControlInputs.tsx and SteeringControls.tsx for the Flight Controls trainer:
 * Ground/Flight selector with airspeed/altitude sliders, a draggable two-axis yoke with self-centering, the A/P disengage
 * switch, the linked rudder pedals with toe-brake pads, and the nose wheel tiller. The math is in sim/FlightInputRules.kt
 * (unit tested); this file only gathers touch input and draws. Multi-touch: a yoke finger, a pedal finger and each toe pad
 * are tracked independently. Compose only; verify on a device.
 */

private val Fg = Color(0xFFE7E2D6)
private val Subtle = Color(0xFF8F9AA5)
private val Inset = Color(0xFF0E1116)
private val Edge = Color(0xFF39414B)
private val Pad = Color(0xFF0C0F13)
private val Amber = Color(0xFFE0A84A)
private val Ok = Color(0xFF6BD08A)

private fun cockpitPatch(cockpit: CockpitModel, note: String, map: Map<String, Any?>) =
    cockpit.applySimNote(note) { s -> com.oersted.trainer.sim.SimPhaseWorld.applySim(s, map) }

@Composable
private fun SmallMono(text: String, color: Color = Subtle, modifier: Modifier = Modifier) =
    Text(text, color = color, fontFamily = FontFamily.Monospace, fontSize = 9.sp, modifier = modifier)

@Composable
private fun Boxed(modifier: Modifier = Modifier, content: @Composable () -> Unit) =
    Box(modifier.fillMaxWidth().background(Pad, RoundedCornerShape(8.dp)).border(1.dp, Edge, RoundedCornerShape(8.dp)).padding(8.dp)) { content() }

/** Web FlightModeControl: Ground / Flight buttons, AIRBORNE / ON GROUND badge, airspeed + altitude sliders, no-hydraulics warning. */
@Composable
fun FlightModeControlView(s: SimState, d: Derived, cockpit: CockpitModel, children: @Composable () -> Unit = {}) {
    val flight = !s.wow
    Column(Modifier.fillMaxWidth().background(Inset, RoundedCornerShape(8.dp)).border(1.dp, Color(0xFF2C323D), RoundedCornerShape(8.dp)).padding(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text("FLIGHT MODE", color = Subtle, fontSize = 10.sp, letterSpacing = 0.16.em, fontWeight = FontWeight.SemiBold)
            Text(
                if (flight) "AIRBORNE · WOW OFF" else "ON GROUND · WOW ON",
                color = if (flight) Color(0xFF6EE7B7) else Subtle, fontFamily = FontFamily.Monospace, fontSize = 8.sp,
                modifier = Modifier.border(1.dp, if (flight) Color(0x6610B981) else Color(0xFF2C323D), RoundedCornerShape(4.dp)).padding(horizontal = 8.dp, vertical = 4.dp),
            )
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            for ((label, active) in listOf("Ground" to !flight, "Flight" to flight)) {
                Box(
                    Modifier.weight(1f)
                        .background(if (active) Color(0x1A5B8DEF) else Color(0xFF151A21), RoundedCornerShape(4.dp))
                        .border(1.dp, if (active) Color(0x995B8DEF) else Color(0xFF2C323D), RoundedCornerShape(4.dp))
                        .clip(RoundedCornerShape(4.dp))
                        .clickable {
                            if (label == "Ground") cockpitPatch(cockpit, R.GROUND_NOTE, R.groundModePatch())
                            else cockpitPatch(cockpit, R.FLIGHT_NOTE, FlightModes.flightModePatch(s.psFlightAltFt))
                        }
                        .padding(vertical = 10.dp),
                    contentAlignment = Alignment.Center,
                ) { Text(label.uppercase(), color = if (active) Fg else Subtle, fontSize = 10.sp, letterSpacing = 0.08.em) }
            }
        }
        if (flight) {
            PanelControlSlider("AIRSPEED · ${Math.round(s.psFlightCasKt)} KT", s.psFlightCasKt, { v -> cockpit.applySim { st -> com.oersted.trainer.sim.SimPhaseWorld.applySim(st, R.airspeedPatch((v / 5).roundToInt() * 5.0)) } }, min = 60.0, max = 350.0)
            PanelControlSlider("ALTITUDE · ${Math.round(s.psFlightAltFt)} FT", s.psFlightAltFt, { v -> cockpit.applySim { st -> com.oersted.trainer.sim.SimPhaseWorld.applySim(st, R.altitudePatch((v / 500).roundToInt() * 500.0)) } }, min = 0.0, max = 41000.0)
            children()
            if (!(d.flightControlAAvailable || d.flightControlBAvailable)) {
                Text("NO FLIGHT-CONTROL HYDRAULIC POWER — SURFACES WILL NOT RESPOND.", color = Color(0xFFFCD34D), fontFamily = FontFamily.Monospace, fontSize = 8.sp)
            }
        }
        Text("Flight sets the airborne state with engines running and hydraulic systems A/B on so the yoke and pedals drive the surfaces and the six-pack attitude. Ground restores weight-on-wheels with the gear down.", color = Subtle, fontSize = 8.sp, lineHeight = 11.sp)
    }
}

private class YokeHold { var held = false; var x0 = 0f; var y0 = 0f; var pitch0 = 0.0; var roll0 = 0.0 }

/** Web FlightControlInputs (compact): yoke pad with two-axis drag, self-centering, pitch/roll readout and the A/P disengage switch, then the steering controls. */
@Composable
fun FlightControlInputsView(cockpit: CockpitModel, title: String = "Flight Controls trainer inputs") {
    val s by cockpit.simState.collectAsState()
    val hold = remember { YokeHold() }
    LaunchedEffect(Unit) {
        var last = 0L
        while (true) {
            androidx.compose.runtime.withFrameNanos { now ->
                val dt = if (last == 0L) 0.0 else min(0.05, (now - last) / 1e9)
                last = now
                if (!hold.held) {
                    val st = cockpit.simState.value
                    val p = R.springReturn(st.yokePitch, dt, R.YOKE_RATE)
                    val r = R.springReturn(st.yokeRoll, dt, R.YOKE_RATE)
                    if (p != st.yokePitch || r != st.yokeRoll) cockpit.patchSim { yokePitch = p; yokeRoll = r }
                }
            }
        }
    }
    val pitch = R.clamp(s.yokePitch, -1.0, 1.0)
    val roll = R.clamp(s.yokeRoll, -1.0, 1.0)
    val density = LocalDensity.current.density

    Column(Modifier.fillMaxWidth().background(Color(0xFF151A21), RoundedCornerShape(12.dp)).border(1.dp, Color(0xFF2C323D), RoundedCornerShape(12.dp)).padding(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column {
                Text("ATA 27 · PRIMARY FLIGHT CONTROLS", color = Subtle, fontSize = 10.sp, letterSpacing = 0.16.em)
                Text(title, color = Fg, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            }
            Column(horizontalAlignment = Alignment.End) {
                SmallMono("PITCH ${Math.round(pitch * 100)}%")
                SmallMono("ROLL ${Math.round(roll * 100)}%")
            }
        }
        Boxed {
            Column(Modifier.fillMaxWidth()) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    SmallMono("CONTROL COLUMN / YOKE"); SmallMono("2-AXIS · SELF-CENTERING", Fg)
                }
                Canvas(
                    Modifier.fillMaxWidth().aspectRatio(320f / 230f).pointerInput(Unit) {
                        awaitEachGesture {
                            val down = awaitFirstDown()
                            down.consume()
                            // web: scale = min(w / 320, h / 300) in CSS px; gain = 2.8 / max(scale, 0.2)
                            val wDp = size.width / density
                            val hDp = size.height / density
                            val gain = R.yokeDragGain(min(wDp / 320.0, hDp / 300.0))
                            val st = cockpit.simState.value
                            hold.x0 = down.position.x; hold.y0 = down.position.y
                            hold.pitch0 = st.yokePitch; hold.roll0 = st.yokeRoll
                            hold.held = true
                            try {
                                while (true) {
                                    val ev = awaitPointerEvent()
                                    val ch = ev.changes.firstOrNull { it.id == down.id } ?: break
                                    if (!ch.pressed) break
                                    val dx = (ch.position.x - hold.x0) / density.toDouble()
                                    val dy = (ch.position.y - hold.y0) / density.toDouble()
                                    val nr = R.yokeRollFromDrag(hold.roll0, dx, gain)
                                    val np = R.yokePitchFromDrag(hold.pitch0, dy, gain)
                                    cockpit.patchSim { yokeRoll = nr; yokePitch = np }
                                    ch.consume()
                                }
                            } finally { hold.held = false }
                        }
                    },
                ) { drawYoke(pitch, roll) }
                Spacer(Modifier.height(6.dp))
                Box(
                    Modifier.fillMaxWidth().background(Color(0xFF3A0F0C), RoundedCornerShape(6.dp)).border(1.dp, Color(0xFF5A1F1A), RoundedCornerShape(6.dp)).clip(RoundedCornerShape(6.dp))
                        .clickable { cockpit.updateMip { it.copy(apAil = false, apElev = false, apWarn = false) } }
                        .padding(vertical = 8.dp),
                    contentAlignment = Alignment.Center,
                ) { Text("A/P DISENGAGE (CONTROL WHEEL SWITCH)", color = Color(0xFFFFB3A8), fontFamily = FontFamily.Monospace, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.1.em) }
            }
        }
        SteeringControlsView(cockpit)
        Text("The yoke and pedals write the same shared simulator inputs used by the flight-control, attitude and instrument models. Touch input is tracked per finger, so a yoke movement and a rudder / toe-brake input can be held at the same time.", color = Subtle, fontSize = 8.sp, lineHeight = 11.sp)
    }
}

// ---------- yoke drawing (web viewBox 0 0 320 230) ----------

private val Metal = Brush.verticalGradient(listOf(Color(0xFF8B9298), Color(0xFF3E444A), Color(0xFF171B1F)))
private val Grip = Brush.horizontalGradient(listOf(Color(0xFF20252A), Color(0xFF050709), Color(0xFF20252A)))

private fun DrawScope.drawYoke(pitch: Double, roll: Double) {
    val k = size.width / 320f
    fun o(x: Float, y: Float) = Offset(x * k, y * k)
    drawRoundRect(Color(0xFF11151A), o(5f, 5f), Size(310f * k, 220f * k), CornerRadius(12f * k))
    drawRoundRect(Color(0xFF2A323A), o(5f, 5f), Size(310f * k, 220f * k), CornerRadius(12f * k), style = Stroke(1f * k))
    val dash = PathEffect.dashPathEffect(floatArrayOf(5f * k, 6f * k))
    drawLine(Color(0xFF303840), o(160f, 25f), o(160f, 204f), 3f * k, pathEffect = dash)
    drawLine(Color(0xFF303840), o(44f, 115f), o(276f, 115f), 3f * k, pathEffect = dash)
    // column base
    drawRoundRect(Metal, o(152f, 150f), Size(16f * k, 62f * k), CornerRadius(5f * k))
    drawRoundRect(Color(0xFF20262C), o(140f, 196f), Size(40f * k, 20f * k), CornerRadius(6f * k))
    drawRoundRect(Color(0xFF777F87), o(140f, 196f), Size(40f * k, 20f * k), CornerRadius(6f * k), style = Stroke(1f * k))
    drawCircle(Color(0xFF0B0D10), 4.5f * k, o(160f, 206f))
    val pivot = o(160f, 105f)
    withTransform({
        scale((1 + pitch * 0.12).toFloat(), (1 + pitch * 0.12).toFloat(), pivot)
        rotate((roll * 32).toFloat(), pivot)
    }) {
        drawRoundRect(Metal, o(151f, 52f), Size(18f * k, 106f * k), CornerRadius(7f * k))
        val left = Path().apply {
            moveTo(151f * k, 78f * k); cubicTo(124f * k, 58f * k, 90f * k, 55f * k, 61f * k, 75f * k)
            cubicTo(47f * k, 85f * k, 43f * k, 105f * k, 49f * k, 124f * k); cubicTo(54f * k, 139f * k, 66f * k, 151f * k, 84f * k, 157f * k)
        }
        val right = Path().apply {
            moveTo(169f * k, 78f * k); cubicTo(196f * k, 58f * k, 230f * k, 55f * k, 259f * k, 75f * k)
            cubicTo(273f * k, 85f * k, 277f * k, 105f * k, 271f * k, 124f * k); cubicTo(266f * k, 139f * k, 254f * k, 151f * k, 236f * k, 157f * k)
        }
        drawPath(left, Grip, style = Stroke(16f * k, cap = StrokeCap.Round))
        drawPath(right, Grip, style = Stroke(16f * k, cap = StrokeCap.Round))
        val hl = Path().apply { moveTo(151f * k, 78f * k); cubicTo(124f * k, 58f * k, 90f * k, 55f * k, 61f * k, 75f * k) }
        val hr = Path().apply { moveTo(169f * k, 78f * k); cubicTo(196f * k, 58f * k, 230f * k, 55f * k, 259f * k, 75f * k) }
        drawPath(hl, Color(0xFF777F87), style = Stroke(3f * k, cap = StrokeCap.Round))
        drawPath(hr, Color(0xFF777F87), style = Stroke(3f * k, cap = StrokeCap.Round))
        for (x in floatArrayOf(62f, 219f)) {
            drawRoundRect(Color(0xFF15191D), o(x, 68f), Size(39f * k, 48f * k), CornerRadius(6f * k))
            drawRoundRect(Color(0xFF606A73), o(x, 68f), Size(39f * k, 48f * k), CornerRadius(6f * k), style = Stroke(2f * k))
        }
        drawCircle(if (abs(roll) > 0.08) Amber else Color(0xFF59636D), 5f * k, o(81f, 91f))
        drawCircle(if (abs(pitch) > 0.08) Amber else Color(0xFF59636D), 5f * k, o(239f, 91f))
    }
}

// ---------- steering: rudder pedals + toe brakes + tiller ----------

private class SteerHold { var rud = false; var til = false; var tl = false; var tr = false }

@Composable
fun SteeringControlsView(cockpit: CockpitModel) {
    val s by cockpit.simState.collectAsState()
    val d by cockpit.derived.collectAsState()
    val hold = remember { SteerHold() }
    LaunchedEffect(Unit) {
        var last = 0L
        while (true) {
            androidx.compose.runtime.withFrameNanos { now ->
                val dt = if (last == 0L) 0.0 else min(0.05, (now - last) / 1e9)
                last = now
                val st = cockpit.simState.value
                val rud = if (!hold.rud && st.rudderPedal != 0.0) R.springReturn(st.rudderPedal, dt, R.RUDDER_RATE) else st.rudderPedal
                val til = if (!hold.til && st.tiller != 0.0) R.springReturn(st.tiller, dt, R.TILLER_RATE) else st.tiller
                val nl = R.toeBrake(st.leftBrakePedal, hold.tl, dt)
                val nr = R.toeBrake(st.rightBrakePedal, hold.tr, dt)
                if (rud != st.rudderPedal || til != st.tiller || nl != st.leftBrakePedal || nr != st.rightBrakePedal) {
                    cockpit.patchSim { rudderPedal = rud; tiller = til; leftBrakePedal = nl; rightBrakePedal = nr }
                }
            }
        }
    }
    val r = s.rudderPedal
    val nws = d.noseWheelSteeringAvailable
    val nwsAngle = d.noseWheelSteeringAngle
    val tAng = R.clamp(s.tiller, -1.0, 1.0) * R.TILLER_MAX_DEG

    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Boxed {
            Column(Modifier.fillMaxWidth()) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    SmallMono("RUDDER PEDALS · TOE BRAKES")
                    SmallMono("RUDDER ${if (r < -0.03) "L" else if (r > 0.03) "R" else ""} ${Math.round(abs(r) * 100)}%", Fg)
                }
                Canvas(
                    Modifier.fillMaxWidth().aspectRatio(360f / 230f).pointerInput(Unit) { pedalGestures(cockpit, hold) },
                ) { drawPedals(r, s.leftBrakePedal, s.rightBrakePedal) }
                Text("Drag a pedal plate forward (up) to push it; the linkage moves the other pedal aft. Press and hold the top pad for that side's toe brake — two fingers work at once. Pedals spring back to neutral when released. Pedal steering adds only ±7° at the nose wheel.", color = Subtle, fontSize = 8.sp, lineHeight = 11.sp)
            }
        }
        Boxed {
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    SmallMono("NOSE WHEEL STEERING TILLER"); SmallMono(if (nws) "NWS ACTIVE" else "NWS INOP", if (nws) Ok else Subtle)
                }
                Canvas(
                    Modifier.fillMaxWidth(0.7f).aspectRatio(200f / 190f).pointerInput(Unit) { tillerGestures(cockpit, hold) },
                ) { drawTiller(tAng) }
                Row(Modifier.fillMaxWidth().background(Inset, RoundedCornerShape(4.dp)).border(1.dp, Color(0xFF2C323D), RoundedCornerShape(4.dp)).padding(horizontal = 8.dp, vertical = 4.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Canvas(Modifier.height(40.dp).aspectRatio(60f / 50f)) { drawNoseWheel(if (nws) nwsAngle else 0.0) }
                    SmallMono("NWS ${Math.round(nwsAngle)}° · ${if (nws) "SYSTEM A" else "OFF"}")
                }
                Text("Drag the knob around its pivot (±78°); it springs to centre on release. Steering works only with the nose gear down, on the ground, with HYD A pressure.", color = Subtle, fontSize = 8.sp, lineHeight = 11.sp)
            }
        }
    }
}

private val PedalMetal = Brush.verticalGradient(listOf(Color(0xFF808B96), Color(0xFF3B434B)))

private fun pedalOffsets(r: Double): Pair<Float, Float> = Pair((r * R.PEDAL_TRAVEL).toFloat(), (-r * R.PEDAL_TRAVEL).toFloat())

private fun toePadHeight(toe: Double): Float = (34 - toe * 10).toFloat()

private fun DrawScope.drawPedals(r: Double, toeL: Double, toeR: Double) {
    val k = size.width / 360f
    fun o(x: Float, y: Float) = Offset(x * k, y * k)
    drawRoundRect(Color(0xFF12161B), o(6f, 6f), Size(348f * k, 218f * k), CornerRadius(12f * k))
    drawRoundRect(Color(0xFF2A323A), o(6f, 6f), Size(348f * k, 218f * k), CornerRadius(12f * k), style = Stroke(1f * k))
    drawRoundRect(Color(0xFF59636E), o(60f, 44f), Size(240f * k, 10f * k), CornerRadius(5f * k))
    rotate((-r * 22).toFloat(), o(180f, 49f)) {
        drawRoundRect(Color(0xFF69747F), o(172f, 32f), Size(16f * k, 34f * k), CornerRadius(5f * k))
        drawCircle(Color(0xFF222930), 5f * k, o(180f, 49f))
        drawLine(Color(0xFFA9B3BD), o(120f, 49f), o(240f, 49f), 3f * k)
    }
    val (offL, offR) = pedalOffsets(r)
    fun pedal(cx: Float, off: Float, toe: Double, pushed: Double) {
        drawLine(Color(0xFF6F7983), o(cx, 52f), o(cx, 112f + off), 9f * k, StrokeCap.Round)
        drawLine(Color(0xFFAAB4BE), o(cx, 52f), o(cx, 112f + off), 3f * k, StrokeCap.Round)
        val sc = (1 - pushed * 0.04).toFloat()
        withTransform({ translate(0f, off * k); scale(sc, sc, o(cx, 150f)) }) {
            drawRoundRect(PedalMetal, o(cx - 52f, 108f), Size(104f * k, 84f * k), CornerRadius(9f * k))
            drawRoundRect(if (pushed > 0.05) Amber else Color(0xFF5B6570), o(cx - 52f, 108f), Size(104f * k, 84f * k), CornerRadius(9f * k), style = Stroke(3f * k))
            for (i in 0..5) drawLine(Color(0xFF1D232A), o(cx - 40f, 152f + i * 6.5f), o(cx + 40f, 152f + i * 6.5f), 2.5f * k)
            val padH = toePadHeight(toe)
            val c = Color((40 + toe * 190).toInt().coerceIn(0, 255), (46 + toe * 120).toInt().coerceIn(0, 255), (54 - toe * 20).toInt().coerceIn(0, 255))
            drawRoundRect(c, o(cx - 46f, 110f), Size(92f * k, padH * k), CornerRadius(7f * k))
            drawRoundRect(if (toe > 0.05) Amber else Color(0xFF7B8692), o(cx - 46f, 110f), Size(92f * k, padH * k), CornerRadius(7f * k), style = Stroke(2.5f * k))
            for (i in 0..2) drawLine(Color(0xFF10151A), o(cx - 36f, 118f + i * 6f), o(cx + 36f, 118f + i * 6f), 2f * k)
        }
    }
    pedal(105f, offL, toeL, maxOf(0.0, -r))
    pedal(255f, offR, toeR, maxOf(0.0, r))
}

/** Pointer handling for both pedals: each finger is bound on press to a toe pad, a pedal plate (rudder drag), or nothing. */
private suspend fun androidx.compose.ui.input.pointer.PointerInputScope.pedalGestures(cockpit: CockpitModel, hold: SteerHold) {
    awaitPointerEventScope {
        // pointer id -> role: "TL" / "TR" toe pads; "L" / "R" rudder drag with start data
        val roles = HashMap<PointerId, String>()
        var dragSide = ""; var dragY0 = 0f; var dragR0 = 0.0
        var dragId: PointerId? = null
        while (true) {
            val ev = awaitPointerEvent(PointerEventPass.Main)
            val k = size.width / 360f
            val r = cockpit.simState.value.rudderPedal
            val (offL, offR) = pedalOffsets(r)
            val tl = cockpit.simState.value.leftBrakePedal
            val tr = cockpit.simState.value.rightBrakePedal
            for (ch in ev.changes) {
                val x = ch.position.x / k; val y = ch.position.y / k
                if (ch.pressed && !roles.containsKey(ch.id) && ch.previousPressed.not()) {
                    // pad is hit first (it sits on the plate's upper edge)
                    fun inPad(cx: Float, off: Float, toe: Double) = x >= cx - 46 && x <= cx + 46 && y >= 110 + off && y <= 110 + off + toePadHeight(toe)
                    fun inPlate(cx: Float, off: Float) = x >= cx - 52 && x <= cx + 52 && y >= 108 + off && y <= 192 + off
                    when {
                        inPad(105f, offL, tl) -> { roles[ch.id] = "TL"; hold.tl = true; ch.consume() }
                        inPad(255f, offR, tr) -> { roles[ch.id] = "TR"; hold.tr = true; ch.consume() }
                        inPlate(105f, offL) && dragId == null -> { roles[ch.id] = "L"; dragId = ch.id; dragSide = "L"; dragY0 = ch.position.y; dragR0 = r; hold.rud = true; ch.consume() }
                        inPlate(255f, offR) && dragId == null -> { roles[ch.id] = "R"; dragId = ch.id; dragSide = "R"; dragY0 = ch.position.y; dragR0 = r; hold.rud = true; ch.consume() }
                    }
                } else if (ch.pressed && roles[ch.id] != null) {
                    if (ch.id == dragId) {
                        // web: fwd = (y0 - y) * k / TRAVEL with k = 230 / rect.height, i.e. svg units
                        val fwd = ((dragY0 - ch.position.y) / (size.width / 360f)).toDouble()
                        val next = R.rudderFromPedalDrag(dragSide == "L", dragR0, fwd)
                        cockpit.patchSim { rudderPedal = next }
                    }
                    ch.consume()
                } else if (!ch.pressed && roles.containsKey(ch.id)) {
                    when (roles.remove(ch.id)) {
                        "TL" -> hold.tl = false
                        "TR" -> hold.tr = false
                        else -> { if (ch.id == dragId) { dragId = null; hold.rud = false } }
                    }
                    ch.consume()
                }
            }
        }
    }
}

// ---------- tiller ----------

private fun tillerPt(deg: Double, rad: Double): Pair<Float, Float> =
    Pair((100 + rad * sin(Math.toRadians(deg))).toFloat(), (110 - rad * cos(Math.toRadians(deg))).toFloat())

private fun DrawScope.drawTiller(tAngDeg: Double) {
    val k = size.width / 200f
    fun o(x: Float, y: Float) = Offset(x * k, y * k)
    drawRoundRect(Color(0xFF12161B), o(4f, 4f), Size(192f * k, 182f * k), CornerRadius(12f * k))
    drawRoundRect(Color(0xFF2A323A), o(4f, 4f), Size(192f * k, 182f * k), CornerRadius(12f * k), style = Stroke(1f * k))
    // scale arc -78..78 deg, radius 78 about (100,110)
    drawArc(Color(0xFF3A444E), startAngle = -90f - 78f, sweepAngle = 156f, useCenter = false, topLeft = o(100f - 78f, 110f - 78f), size = Size(156f * k, 156f * k), style = Stroke(2f * k))
    for (t in intArrayOf(-78, -60, -40, -20, 0, 20, 40, 60, 78)) {
        val (x1, y1) = tillerPt(t.toDouble(), 72.0); val (x2, y2) = tillerPt(t.toDouble(), 82.0)
        drawLine(if (t == 0) Amber else Color(0xFF8D99A5), o(x1, y1), o(x2, y2), (if (t == 0) 3f else 2f) * k)
    }
    drawCircle(Color(0xFF1B2128), 38f * k, o(100f, 110f))
    drawCircle(Color(0xFF4B5560), 38f * k, o(100f, 110f), style = Stroke(3f * k))
    rotate(tAngDeg.toFloat(), o(100f, 110f)) {
        val knob = Brush.radialGradient(listOf(Color(0xFF6B747D), Color(0xFF252B31)), center = o(96f, 104f), radius = 30f * k)
        drawRoundRect(Color(0xFF59636E), o(94f, 52f), Size(12f * k, 58f * k), CornerRadius(6f * k))
        drawCircle(knob, 13f * k, o(100f, 48f))
        drawCircle(Color(0xFFB8C1C9), 13f * k, o(100f, 48f), style = Stroke(2f * k))
        drawCircle(knob, 25f * k, o(100f, 110f))
        drawCircle(Color(0xFFAAB4BE), 25f * k, o(100f, 110f), style = Stroke(2.5f * k))
        drawCircle(Color(0xFF171C21), 6f * k, o(100f, 110f))
        drawLine(Amber, o(100f, 118f), o(100f, 132f), 3f * k, StrokeCap.Round)
    }
}

private suspend fun androidx.compose.ui.input.pointer.PointerInputScope.tillerGestures(cockpit: CockpitModel, hold: SteerHold) {
    awaitEachGesture {
        val down = awaitFirstDown()
        val k = size.width / 200f
        val cx = size.width / 2f
        val cy = size.height * (110f / 190f)
        fun ang(p: Offset) = R.tillerAngleDeg((p.x - cx).toDouble(), (p.y - cy).toDouble())
        // hit target: invisible circle r = 70 svg units about the pivot
        if (kotlin.math.hypot(down.position.x - cx, down.position.y - cy) > 70f * k) return@awaitEachGesture
        down.consume()
        val a0 = ang(down.position)
        val t0 = cockpit.simState.value.tiller
        hold.til = true
        try {
            while (true) {
                val ev = awaitPointerEvent()
                val ch = ev.changes.firstOrNull { it.id == down.id } ?: break
                if (!ch.pressed) break
                val next = R.tillerFromDrag(a0, t0, ang(ch.position))
                cockpit.patchSim { tiller = next }
                ch.consume()
            }
        } finally { hold.til = false }
    }
}

private fun DrawScope.drawNoseWheel(angleDeg: Double) {
    val k = size.width / 60f
    fun o(x: Float, y: Float) = Offset(x * k, y * k)
    drawLine(Color(0xFF6F7983), o(30f, 2f), o(30f, 22f), 3f * k)
    rotate(angleDeg.toFloat(), o(30f, 24f)) {
        for (x in floatArrayOf(20f, 33f)) {
            drawRoundRect(Color(0xFF10141A), o(x, 12f), Size(7f * k, 24f * k), CornerRadius(3f * k))
            drawRoundRect(Color(0xFF9AA5B0), o(x, 12f), Size(7f * k, 24f * k), CornerRadius(3f * k), style = Stroke(1.5f * k))
        }
    }
}
