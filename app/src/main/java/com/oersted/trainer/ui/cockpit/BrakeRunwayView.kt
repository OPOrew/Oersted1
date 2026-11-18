package com.oersted.trainer.ui.cockpit

import android.graphics.Paint
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.oersted.trainer.sim.BrakeRunwayRules
import com.oersted.trainer.sim.BrakeRunwayRules.Hold
import com.oersted.trainer.sim.BrakeRunwayRules.Own
import com.oersted.trainer.sim.Derived
import com.oersted.trainer.sim.PATCH_END_M
import com.oersted.trainer.sim.PATCH_START_M
import com.oersted.trainer.sim.RUNWAY_AIMPOINT_M
import com.oersted.trainer.sim.RUNWAY_HALF_WIDTH_M
import com.oersted.trainer.sim.RUNWAY_LENGTH_M
import com.oersted.trainer.sim.SimState
import kotlinx.coroutines.delay
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/**
 * Port of BrakeRunwayTrainer.tsx: top-down landing / rollout scene (Canvas), readouts, per-wheel status, rudder pedals with toe
 * brakes (hold gestures or Latch), coaching hints and scenario buttons. Rules and scenario patches are [BrakeRunwayRules]; the
 * physics is the sim step (StepPart3). The aircraft plan uses flat fills instead of the web's metal gradient. Compose only.
 */

private val BLine = Color(0xFF39414B)
private val BSubtle = Color(0xFF8F9AA5)
private val BOk = Color(0xFF65C798)
private val BWarn = Color(0xFFE24B4B)
private val BCaution = Color(0xFFE0A84A)
private val BAccent = Color(0xFFD6A845)
private val BFg = Color(0xFFE6E1D2)
private val BInset = Color(0xFF0E1013)

private fun tone(t: String): Color = when (t) { "warn" -> BWarn; "caution" -> BCaution; "ok" -> BOk; else -> BSubtle }

private data class Mark(val x: Double, val p: Double, val k: String)

private fun path(d: String): Path = PathParser().parsePathString(d).toPath()
private val NOSE_BODY = path("M320 50 C302 68 298 92 298 115 L298 300 C298 324 308 338 320 344 C332 338 342 324 342 300 L342 115 C342 92 338 68 320 50 Z")
private val WING_L = path("M298 140 L55 195 L100 222 L298 205 Z")
private val WING_R = path("M342 140 L585 195 L540 222 L342 205 Z")
private val TAIL_L = path("M298 305 L195 322 L215 336 L298 335 Z")
private val TAIL_R = path("M342 305 L445 322 L425 336 L342 335 Z")
private val SHADOW_WINGS = path("M298 140 L55 195 L100 222 L298 205 Z M342 140 L585 195 L540 222 L342 205 Z")
private val FIN = path("M310 344 L330 344 L320 356 Z")

@Composable
private fun BBtn(text: String, on: Boolean = false, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier.background(if (on) Color(0xFF1B1F25) else BInset, RoundedCornerShape(4.dp)).border(1.dp, if (on) BAccent else BLine, RoundedCornerShape(4.dp))
            .clickable { onClick() }.padding(horizontal = 6.dp, vertical = 9.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text.uppercase(), color = BFg, fontSize = 9.sp, textAlign = TextAlign.Center) }
}

@Composable
private fun Readout(label: String, value: String, color: Color = BFg, modifier: Modifier) {
    Column(modifier.background(BInset, RoundedCornerShape(4.dp)).border(1.dp, BLine, RoundedCornerShape(4.dp)).padding(vertical = 4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label, color = BSubtle, fontSize = 8.sp, fontFamily = FontFamily.Monospace)
        Text(value.uppercase(), color = color, fontSize = 9.sp, fontFamily = FontFamily.Monospace)
    }
}

@Composable
private fun Pedal(side: String, push: Double, toe: Double, onPush: (Boolean) -> Unit, onToe: (Boolean) -> Unit, modifier: Modifier) {
    fun Modifier.press(f: (Boolean) -> Unit) = this.pointerInput(Unit) { detectTapGestures(onPress = { f(true); tryAwaitRelease(); f(false) }) }
    Column(modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(if (side == "L") "LEFT PEDAL" else "RIGHT PEDAL", color = BSubtle, fontSize = 8.sp, fontFamily = FontFamily.Monospace, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        val toeShape = RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp)
        Box(
            Modifier.fillMaxWidth().height(48.dp).background(Color(0xFF0E1116), toeShape).border(2.dp, if (toe > 0.05) BCaution else BLine, toeShape).press(onToe),
            contentAlignment = Alignment.BottomCenter,
        ) {
            Box(Modifier.fillMaxWidth().height((48 * toe).toFloat().dp).background(BCaution.copy(alpha = (0.15 + toe * 0.7).toFloat()), toeShape))
            Box(Modifier.fillMaxWidth().height(48.dp), contentAlignment = Alignment.Center) { Text("TOE BRAKE ${floor(toe * 100 + 0.5).toLong()}%", color = BFg, fontSize = 9.sp) }
        }
        val bodyShape = RoundedCornerShape(bottomStart = 12.dp, bottomEnd = 12.dp)
        Box(Modifier.fillMaxWidth().height(80.dp).background(Color(0xFF1B1F25), bodyShape).border(2.dp, if (push > 0.04) BAccent else BLine, bodyShape).press(onPush), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(top = (12 - push * 16).toFloat().coerceAtLeast(0f).dp)) {
                Text("▲", color = BFg, fontSize = 9.sp)
                Text("PUSH · RUDDER $side", color = BFg, fontSize = 9.sp)
                Text("${floor(push * 100 + 0.5).toLong()}%", color = BSubtle, fontSize = 8.sp, fontFamily = FontFamily.Monospace)
            }
        }
    }
}

private fun DrawScope.label(text: String, x: Float, y: Float, size: Float, color: Color, center: Boolean = false) {
    val argb = android.graphics.Color.argb((color.alpha * 255).toInt(), (color.red * 255).toInt(), (color.green * 255).toInt(), (color.blue * 255).toInt())
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    paint.color = argb
    paint.textSize = size
    paint.typeface = android.graphics.Typeface.MONOSPACE
    paint.textAlign = if (center) Paint.Align.CENTER else Paint.Align.LEFT
    drawIntoCanvas { c -> c.nativeCanvas.drawText(text, x, y, paint) }
}

@Composable
internal fun BrakeRunwayTrainer(s: SimState, d: Derived, cockpit: CockpitModel) {
    val R = BrakeRunwayRules
    val marks = remember { ArrayList<Mark>() }
    var hold by remember { mutableStateOf(Hold()) }
    var latch by remember { mutableStateOf(false) }
    val holdNow by rememberUpdatedState(hold)
    val latchNow by rememberUpdatedState(latch)
    fun press(key: String, down: Boolean) {
        val h = hold
        if (latchNow) { if (down) hold = toggle(h, key); return }
        hold = setKey(h, key, down)
    }

    // pedal input: ramp while held, spring back on release (web 33 ms interval)
    LaunchedEffect(Unit) {
        var own = Own()
        while (true) {
            delay(33)
            val st = cockpit.simState.value
            val t = R.pedalTick(holdNow, own, st.rudderPedal, st.leftBrakePedal, st.rightBrakePedal, 0.033)
            own = t.own
            if (t.rudder != st.rudderPedal || t.left != st.leftBrakePedal || t.right != st.rightBrakePedal) {
                cockpit.patchSim { rudderPedal = t.rudder; leftBrakePedal = t.left; rightBrakePedal = t.right }
            }
        }
    }

    val gs = s.groundSpeedKt
    val phase = s.rwyPhase
    val hdg = s.rwyHdgDeg
    val lat = s.rwyLatM
    val live = R.isLive(phase)
    val rolling = R.isRolling(phase)
    val acPos = s.rwyPosM

    // tyre marks: recorded where a wheel is skidding
    LaunchedEffect(s.rwyPosM, s.rwyLatM, phase) {
        if (phase == "IDLE" || phase == "APPROACH") { marks.clear(); return@LaunchedEffect }
        val r = hdg * Math.PI / 180
        for (k in R.KEYS) {
            if (gs > 20 && s.wow && R.slip(s, k) > 0.5 && R.brakePsi(s, k) > 150) {
                val wx = R.WHEEL_X.getValue(k)
                val dx = wx * R.K * cos(r); val dy = wx * R.K * sin(r)
                val x = R.clamp(R.CX + lat * R.SX, -30.0, R.W + 30) + dx
                val p = acPos - dy / R.SY
                val last = marks.lastOrNull { it.k == k }
                if (last == null || abs(last.p - p) > 0.35) marks.add(Mark(x, p, k))
            }
        }
        while (marks.size > 1600) marks.removeAt(0)
    }

    val statuses = R.KEYS.associateWith { R.status(s, d, it) }
    val veering = R.veering(s)
    val veerTone = if (R.severe(s)) BWarn else BCaution
    val veerDir = R.veerDir(hdg); val driftDir = R.driftDir(lat)
    val rudderCmd = s.rudderPedal
    val banner = s.rwyNote

    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("PHASE $phase", color = BSubtle, fontSize = 9.sp, fontFamily = FontFamily.Monospace)
            Text(banner.uppercase(), color = tone(R.bannerTone(s, d)), fontSize = 9.sp, fontFamily = FontFamily.Monospace, textAlign = TextAlign.End, modifier = Modifier.weight(1f).padding(start = 8.dp))
        }

        // ---------- top-down scene ----------
        Box(Modifier.fillMaxWidth().background(BInset, RoundedCornerShape(8.dp)).border(1.dp, BLine, RoundedCornerShape(8.dp))) {
            Canvas(Modifier.fillMaxWidth().aspectRatio((R.W / R.H).toFloat())) {
                val sc = (size.width / R.W).toFloat()
                withTransform({ scale(sc, sc, Offset.Zero) }) {
                    scene(s, d, R, marks, statuses, acPos, hdg, lat, rudderCmd, phase, gs, veering, veerDir, driftDir)
                }
            }
        }

        // readouts
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Readout("GS", "${floor(gs + 0.5).toLong()} KT", modifier = Modifier.weight(1f))
            Readout("DECEL", "${java.math.BigDecimal(s.actualDecel).setScale(1, java.math.RoundingMode.HALF_UP)}", modifier = Modifier.weight(1f))
            Readout("HDG", R.hdgText(s), if (veering) veerTone else BFg, Modifier.weight(1f))
            Readout("OFFSET", R.offsetText(s), if (abs(lat) > 15) BWarn else BFg, Modifier.weight(1f))
            Readout("RWY LEFT", R.rwyLeft(s), if (acPos > RUNWAY_LENGTH_M) BWarn else BFg, Modifier.weight(1f))
        }

        // per-wheel status
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            for (k in R.KEYS) {
                val st = statuses.getValue(k)
                val ratio = if (gs > 1 && s.wow) min(1.0, R.wheelSpeed(s, k) / gs) else 0.0
                val wear = R.wear(s, k)
                val psi = R.brakePsi(s, k)
                Column(Modifier.weight(1f).background(BInset, RoundedCornerShape(4.dp)).border(1.dp, BLine, RoundedCornerShape(4.dp)).padding(4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(k.uppercase(), color = BFg, fontSize = 9.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(3.dp))
                    Box(Modifier.fillMaxWidth().height(6.dp).background(Color(0xFF1B1F25), RoundedCornerShape(3.dp))) {
                        Box(Modifier.fillMaxWidth(ratio.toFloat().coerceIn(0f, 1f)).height(6.dp).background(if (ratio < 0.5 && s.wow && gs > 20) BWarn else BOk, RoundedCornerShape(3.dp)))
                    }
                    Spacer(Modifier.height(2.dp))
                    Box(Modifier.fillMaxWidth().height(4.dp).background(Color(0xFF1B1F25), RoundedCornerShape(2.dp))) {
                        Box(Modifier.fillMaxWidth((psi / 3000).toFloat().coerceIn(0f, 1f)).height(4.dp).background(BCaution, RoundedCornerShape(2.dp)))
                    }
                    Text(st.text, color = tone(st.tone), fontSize = 8.sp, fontFamily = FontFamily.Monospace, modifier = Modifier.padding(top = 3.dp))
                    Text("${floor(psi + 0.5).toLong()} PSI", color = BSubtle, fontSize = 8.sp, fontFamily = FontFamily.Monospace)
                    if (wear > 0.02) Text("FLAT ${floor(wear * 100 + 0.5).toLong()}%", color = if (wear > 0.9) BWarn else BCaution, fontSize = 8.sp, fontFamily = FontFamily.Monospace)
                }
            }
        }
        Text("■ WHEEL SPD / GS   ■ BRAKE PSI", color = BSubtle, fontSize = 8.sp, fontFamily = FontFamily.Monospace)

        // ---------- rudder pedals with toe brakes ----------
        Column(Modifier.fillMaxWidth().background(BInset, RoundedCornerShape(8.dp)).border(1.dp, BLine, RoundedCornerShape(8.dp)).padding(8.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("RUDDER PEDALS · TOE BRAKES", color = BSubtle, fontSize = 9.sp, fontFamily = FontFamily.Monospace)
                Text("RUDDER ${if (rudderCmd < -0.03) "L" else if (rudderCmd > 0.03) "R" else ""} ${floor(abs(rudderCmd) * 100 + 0.5).toLong()}% · NWS ${floor(d.noseWheelSteeringAngle + 0.5).toLong()}°", color = BFg, fontSize = 9.sp, fontFamily = FontFamily.Monospace)
            }
            Spacer(Modifier.height(6.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                val both = hold.pushL && hold.pushR
                Text(if (both) "BOTH PEDALS PUSHED — RUDDER CANCELS OUT" else "PUSH ONE PEDAL TO YAW THAT WAY", color = if (both) BCaution else BSubtle, fontSize = 8.sp, fontFamily = FontFamily.Monospace, modifier = Modifier.weight(1f))
                BBtn("Latch ${if (latch) "ON" else "OFF"}", on = latch) { latch = !latch; hold = Hold() }
            }
            Spacer(Modifier.height(6.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Pedal("L", max(0.0, -rudderCmd), s.leftBrakePedal, { press("pushL", it) }, { press("toeL", it) }, Modifier.weight(1f))
                Pedal("R", max(0.0, rudderCmd), s.rightBrakePedal, { press("pushR", it) }, { press("toeR", it) }, Modifier.weight(1f))
            }
            Text(
                "Push a pedal (lower pad) for rudder / nose-wheel steering; press its toe pad to brake that side only. Hold both toe pads for symmetric braking. Two fingers work together (e.g. right pedal push + left toe brake). With one finger, turn Latch ON: tap a pad to hold it, tap again to release. Pushing both rudder pads cancels out, like linked pedals.",
                color = BSubtle, fontSize = 8.sp, lineHeight = 11.sp, modifier = Modifier.padding(top = 4.dp),
            )
        }

        for (h in R.hints(s, d)) Text(h, color = BSubtle, fontSize = 9.sp, lineHeight = 12.sp, modifier = Modifier.fillMaxWidth().background(BInset, RoundedCornerShape(4.dp)).border(1.dp, BLine, RoundedCornerShape(4.dp)).padding(horizontal = 8.dp, vertical = 6.dp))

        // scenarios
        fun scenario(note: String, runway: String? = null, patch: String? = null, autobrake: Int? = null, asOn: Boolean? = null) {
            marks.clear(); hold = Hold()
            cockpit.applySimNote(note) { R.start(it, runway, patch, autobrake, asOn) }
        }
        BBtn("Dry · autobrake MED · antiskid on", modifier = Modifier.fillMaxWidth()) { scenario("Scenario: DRY runway, AUTOBRAKE MED, antiskid ON.", "DRY", "NONE", 2, true) }
        BBtn("Wet · autobrake MAX · antiskid cycling", modifier = Modifier.fillMaxWidth()) { scenario("Scenario: WET runway, AUTOBRAKE MAX — antiskid will modulate.", "WET", "NONE", 3, true) }
        BBtn("Ice patch LEFT · autobrake · pulls right", modifier = Modifier.fillMaxWidth()) { scenario("Scenario: ICE PATCH on the LEFT half, AUTOBRAKE MED — aircraft will pull right. Correct with LEFT rudder.", "DRY", "LEFT", 2, true) }
        BBtn("Ice patch RIGHT · manual · antiskid OFF", modifier = Modifier.fillMaxWidth()) { scenario("Scenario: ICE PATCH on the RIGHT half, manual braking, antiskid OFF — wheels lock, aircraft pulls left.", "DRY", "RIGHT", 0, false) }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            for (r in listOf("DRY", "WET", "ICY")) BBtn(r, on = s.runway == r, modifier = Modifier.weight(1f)) { cockpit.patchSimNote("Runway surface $r.") { runway = r } }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            for (p in listOf("NONE", "LEFT", "RIGHT")) BBtn(if (p == "NONE") "No patch" else "Ice $p", on = s.rwyPatch == p, modifier = Modifier.weight(1f)) { cockpit.patchSimNote("Ice patch: $p.") { rwyPatch = p } }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            BBtn("Speedbrake ${if (s.speedBrake == "ARMED") "ARMED" else s.speedBrake}", on = s.speedBrake == "ARMED", modifier = Modifier.weight(1f)) { cockpit.patchSimNote("Speedbrake lever toggled.") { speedBrake = if (speedBrake == "ARMED") "DOWN" else "ARMED" } }
            BBtn("${if (live) "Restart" else "Start"} approach", modifier = Modifier.weight(1f)) { scenario("Landing approach started with current switches.") }
            BBtn("Reset", modifier = Modifier.weight(1f)) { marks.clear(); cockpit.applySimNote("Landing trainer reset.") { R.reset(it) } }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("SIM SPEED", color = BSubtle, fontSize = 8.sp, fontFamily = FontFamily.Monospace, modifier = Modifier.weight(1f))
            for (ts in listOf(1, 4, 10)) BBtn("×$ts", on = s.timeScale == ts.toDouble(), modifier = Modifier.weight(0.5f)) { cockpit.patchSimNote("Sim speed ×$ts.") { timeScale = ts.toDouble() } }
        }
        Text(
            "Improved training model: peak-friction µ-slip curve (peak near 12–15 % slip), pair locked-wheel protection (AMM 32-42), and antiskid modulation that targets the rising side of the curve. Still not a certified performance model. Rudder is aerodynamic (weak below ~60 kt); nose-wheel steering and toe brakes take over at low speed.",
            color = BSubtle, fontSize = 8.sp, lineHeight = 11.sp,
        )
    }
}

private fun toggle(h: BrakeRunwayRules.Hold, key: String): BrakeRunwayRules.Hold = when (key) {
    "pushL" -> h.copy(pushL = !h.pushL); "pushR" -> h.copy(pushR = !h.pushR); "toeL" -> h.copy(toeL = !h.toeL); else -> h.copy(toeR = !h.toeR)
}
private fun setKey(h: BrakeRunwayRules.Hold, key: String, v: Boolean): BrakeRunwayRules.Hold = when (key) {
    "pushL" -> h.copy(pushL = v); "pushR" -> h.copy(pushR = v); "toeL" -> h.copy(toeL = v); else -> h.copy(toeR = v)
}

/** The 400 x 440 design-unit scene (web SVG). */
private fun DrawScope.scene(
    s: SimState, d: Derived, R: BrakeRunwayRules, marks: List<Mark>, statuses: Map<String, BrakeRunwayRules.WheelStatus>,
    acPos: Double, hdg: Double, lat: Double, rudderCmd: Double, phase: String, gs: Double, veering: Boolean, veerDir: String, driftDir: String,
) {
    fun yOf(p: Double) = (R.AC_Y + (acPos - p) * R.SY).toFloat()
    val W = R.W.toFloat(); val H = R.H.toFloat(); val CX = R.CX.toFloat()
    val acX = R.clamp(R.CX + lat * R.SX, -30.0, R.W + 30).toFloat()
    val alt = if (phase == "APPROACH") s.rwyAltFt else 0.0
    val scaleUp = (1 + alt / 900).toFloat()
    val rwyL = (R.CX - RUNWAY_HALF_WIDTH_M * R.SX).toFloat(); val rwyR = (R.CX + RUNWAY_HALF_WIDTH_M * R.SX).toFloat()
    val paleLine = Color(0xFFE7E2D6)

    drawRect(Color(0xFF18211B), Offset.Zero, Size(W, H))
    val topY = yOf(RUNWAY_LENGTH_M); val botY = yOf(0.0)
    drawRect(Color(0xFF2C3138), Offset(rwyL, topY), Size(rwyR - rwyL, botY - topY))
    if (s.runway == "WET") drawRect(Color(0xFF3D5F86).copy(alpha = 0.35f), Offset(rwyL, topY), Size(rwyR - rwyL, botY - topY))
    if (s.runway == "ICY") drawRect(Color(0xFF9FD0EA).copy(alpha = 0.35f), Offset(rwyL, topY), Size(rwyR - rwyL, botY - topY))
    if (s.rwyPatch != "NONE") {
        val px = if (s.rwyPatch == "LEFT") rwyL else CX
        drawRect(Color(0xFF9FD0EA).copy(alpha = 0.35f), Offset(px, yOf(PATCH_END_M)), Size(CX - rwyL, yOf(PATCH_START_M) - yOf(PATCH_END_M)))
        drawRect(Color(0xFFBFE6F7).copy(alpha = 0.7f), Offset(px, yOf(PATCH_END_M)), Size(CX - rwyL, yOf(PATCH_START_M) - yOf(PATCH_END_M)), style = Stroke(1f))
        label("ICE", px + 4, yOf(PATCH_END_M) + 12, 8f, Color(0xFFD8F0FB))
    }
    drawLine(paleLine.copy(alpha = 0.55f), Offset(rwyL + 4, 0f), Offset(rwyL + 4, H), 1.5f)
    drawLine(paleLine.copy(alpha = 0.55f), Offset(rwyR - 4, 0f), Offset(rwyR - 4, H), 1.5f)
    var p = Math.ceil((acPos - 60) / 30) * 30
    while (p < acPos + 130) {
        if (p > 20 && p < RUNWAY_LENGTH_M - 40) drawRect(paleLine.copy(alpha = 0.8f), Offset(CX - 1.5f, yOf(p + 9)), Size(3f, (18 * R.SY).toFloat()))
        p += 30
    }
    for (i in 0 until 8) drawRect(paleLine.copy(alpha = 0.85f), Offset(rwyL + 10 + i * ((rwyR - rwyL - 20) / 8), yOf(28.0)), Size(7f, (24 * R.SY / 3).toFloat()))
    for ((i, pp) in listOf(RUNWAY_AIMPOINT_M, 150.0, 450.0).withIndex()) {
        val hgt = ((if (i == 0) 22 else 12) * R.SY).toFloat()
        drawRect(paleLine.copy(alpha = 0.75f), Offset(CX - 40, yOf(pp + 22)), Size(6f, hgt))
        drawRect(paleLine.copy(alpha = 0.75f), Offset(CX + 34, yOf(pp + 22)), Size(6f, hgt))
    }
    for (m in listOf(150, 300, 450, 600, 900, 1200, 1500)) { val y = yOf(m.toDouble()); if (y > -20 && y < H + 20) label("$m m", rwyR + 6, y + 3, 8f, Color(0xFF8B95A1)) }
    drawRect(Color(0xFFE24B4B).copy(alpha = 0.9f), Offset(rwyL, topY - 3), Size(rwyR - rwyL, 5f))
    label("RUNWAY END", CX, topY - 8, 9f, Color(0xFFE24B4B), center = true)

    for (m in marks) { val y = yOf(m.p); if (y > -4 && y < H + 4) drawRect(Color(0xFF050607).copy(alpha = 0.85f), Offset((m.x - 1.2).toFloat(), y - 1.1f), Size(2.4f, 2.6f)) }

    if (alt > 0) {
        withTransform({ translate(acX + (alt * 0.05).toFloat(), R.AC_Y.toFloat() + (alt * 0.06).toFloat()); rotate(hdg.toFloat(), Offset.Zero); scale(R.K.toFloat(), R.K.toFloat(), Offset.Zero); translate(-320f, -R.PIVOT_Y.toFloat()) }) {
            drawPath(NOSE_BODY, Color.Black.copy(alpha = 0.3f)); drawPath(SHADOW_WINGS, Color.Black.copy(alpha = 0.3f))
        }
    }

    val spoilers = s.spoilerPos > 0.5
    val rudderDeg = (-R.clamp(d.controlSurfaces.rudder, -1.0, 1.0) * 30).toFloat()
    val nws = R.clamp(d.noseWheelSteeringAngle, -78.0, 78.0).toFloat()
    withTransform({ translate(acX, R.AC_Y.toFloat()); rotate(hdg.toFloat(), Offset.Zero); scale(R.K.toFloat() * scaleUp, R.K.toFloat() * scaleUp, Offset.Zero); translate(-320f, -R.PIVOT_Y.toFloat()) }) {
        val metal = Color(0xFF48525C); val edge = Color(0xFF7D8995); val st = Stroke(2.5f)
        drawPath(WING_L, metal); drawPath(WING_L, edge, style = st)
        drawPath(WING_R, metal); drawPath(WING_R, edge, style = st)
        drawPath(TAIL_L, Color(0xFF2E353D)); drawPath(TAIL_L, edge, style = st)
        drawPath(TAIL_R, Color(0xFF2E353D)); drawPath(TAIL_R, edge, style = st)
        for (x in listOf(205, 229, 253, 277, 345, 369, 393, 417)) {
            drawRect(if (spoilers) Color(0xFF5FAE8F) else Color(0xFF454F5A), Offset(x.toFloat(), 190f), Size(18f, 12f))
            drawRect(Color(0xFF98A3AE), Offset(x.toFloat(), 190f), Size(18f, 12f), style = Stroke(1f))
        }
        drawPath(NOSE_BODY, metal); drawPath(NOSE_BODY, edge, style = st)
        drawLine(Color(0xFF6D7884), Offset(320f, 70f), Offset(320f, 330f), 1.5f)
        drawPath(FIN, metal); drawPath(FIN, edge, style = Stroke(1.5f))
        withTransform({ rotate(rudderDeg, Offset(320f, 352f)) }) {
            drawRect(if (abs(rudderCmd) > 0.04) Color(0xFFE0A84A) else Color(0xFF454F5A), Offset(316.5f, 352f), Size(7f, 40f))
        }
        withTransform({ rotate(nws, Offset(320f, 100f)) }) {
            drawRect(if (d.noseWheelSteeringAvailable) Color(0xFFCDD5DC) else Color(0xFF6B737C), Offset(314f, 88f), Size(12f, 24f))
        }
        for (k in R.KEYS) {
            val hot = statuses.getValue(k).hot
            val fill = when (hot) { 3 -> Color(0xFFE24B4B); 2 -> Color(0xFFE0A84A); 1 -> Color(0xFF3DD68C); else -> Color(0xFF9AA4AE) }
            val wx = R.WHEEL_X.getValue(k).toFloat()
            drawRect(fill, Offset(320 + wx - 5, R.PIVOT_Y.toFloat() - 15), Size(10f, 30f))
            drawRect(Color(0xFF0E1116), Offset(320 + wx - 5, R.PIVOT_Y.toFloat() - 15), Size(10f, 30f), style = Stroke(1.5f))
            if (hot == 3) for (i in 0..2) drawCircle(Color(0xFFD4D4D4).copy(alpha = (0.5f - i * 0.14f)), 8f + i * 5, Offset(320 + wx + (if (i % 2 == 1) 6 else -6), R.PIVOT_Y.toFloat() + 28 + i * 18))
        }
    }
    if (phase == "IDLE") label("SELECT A SCENARIO OR START APPROACH", CX, (R.AC_Y - 60).toFloat(), 11f, Color(0xFF8B95A1), center = true)
    if (phase == "APPROACH") label("${floor(alt + 0.5).toLong()} FT AGL · ${floor(gs + 0.5).toLong()} KT", 12f, 20f, 10f, Color(0xFF8B95A1))
    if (veering) {
        val c = if (R.severe(s)) Color(0xFFE24B4B) else Color(0xFFE0A84A)
        drawRect(Color(0xFF0E1116).copy(alpha = 0.85f), Offset(CX - 88, 10f), Size(176f, 26f))
        drawRect(c, Offset(CX - 88, 10f), Size(176f, 26f), style = Stroke(1f))
        val dir = veerDir.ifEmpty { driftDir }
        label("${if (dir == "LEFT") "◀ VEERING LEFT" else "VEERING RIGHT ▶"} · ${floor(abs(lat) + 0.5).toLong()} m", CX, 27f, 11f, c, center = true)
    }
}
