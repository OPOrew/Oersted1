@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.oersted.trainer.ui.panel

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
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
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.oersted.trainer.sim.Derived
import com.oersted.trainer.sim.FlightControlsComponentRules as R
import com.oersted.trainer.sim.SimState
import com.oersted.trainer.ui.common.Classic737Palette
import kotlin.math.max
import kotlin.math.min

/**
 * Port of FlightControlsModule / FlightControlComponentView (components/panel/Overhead.tsx, mounted by routes/cockpit.tsx
 * in "Yoke / rudder inputs → flight-control surfaces"): the 640 x 425 surface diagram (ailerons, elevator, rudder bar,
 * eight spoiler panels, LE devices, flap gauge, PCU lamps, surface key) and the readout cards. Logic is in
 * [R] (FlightControlsComponentRules). The web `aside` slot (B737200ControlStand with spoiler switches) is the optional [aside] lambda.
 */
private val Inset = Color(0xFF0E1013)

private fun hex(s: String): Color = Color(("FF" + s.removePrefix("#")).toLong(16))
private fun O(x: Double, y: Double) = Offset(x.toFloat(), y.toFloat())

private val C_UP = hex("5fae8f"); private val C_UP_S = hex("9fd9c2")
private val C_DN = hex("c9903f"); private val C_DN_S = hex("e2b877")
private val C_NEUTRAL = hex("454f5a"); private val C_NEUTRAL_S = hex("98a3ae")
private val C_LE_EXT = hex("4fa8d8"); private val C_LE_EXT_S = hex("8ccbe8")
private val C_LOCK_S = hex("5a636d")
private val C_TXT = hex("aeb7c0"); private val C_DIM = hex("6d7884")

private fun poly(vararg p: Double): Path = Path().apply {
    moveTo(p[0].toFloat(), p[1].toFloat())
    var i = 2
    while (i < p.size) { lineTo(p[i].toFloat(), p[i + 1].toFloat()); i += 2 }
    close()
}

private fun DrawScope.txt(tm: TextMeasurer, text: String, x: Double, baseline: Double, size: Double, color: Color, anchor: Int = 0) {
    val lay = tm.measure(text, TextStyle(color = color, fontSize = size.toFloat().toSp(), fontFamily = FontFamily.SansSerif))
    val left = when (anchor) { 1 -> x.toFloat() - lay.size.width / 2f; 2 -> x.toFloat() - lay.size.width; else -> x.toFloat() }
    drawText(lay, topLeft = Offset(left, baseline.toFloat() - lay.firstBaseline))
}

private fun DrawScope.ln(x1: Double, y1: Double, x2: Double, y2: Double, c: Color, w: Double, dash: FloatArray? = null, round: Boolean = false) =
    drawLine(c, O(x1, y1), O(x2, y2), w.toFloat(), cap = if (round) StrokeCap.Round else StrokeCap.Butt, pathEffect = dash?.let { PathEffect.dashPathEffect(it, 0f) })

private fun DrawScope.rr(x: Double, y: Double, w: Double, h: Double, r: Double, fill: Brush?, fillColor: Color?, stroke: Color, sw: Double, alpha: Float = 1f) {
    val tl = O(x, y); val sz = Size(w.toFloat(), h.toFloat()); val cr = CornerRadius(r.toFloat())
    if (fill != null) drawRoundRect(fill, tl, sz, cr, alpha = alpha) else if (fillColor != null) drawRoundRect(fillColor, tl, sz, cr, alpha = alpha)
    drawRoundRect(stroke, tl, sz, cr, alpha = alpha, style = Stroke(sw.toFloat()))
}

private fun DrawScope.dot(cx: Double, cy: Double, r: Double, fill: Color?, stroke: Color, sw: Double = 1.0, alpha: Float = 1f) {
    if (fill != null) drawCircle(fill, r.toFloat(), O(cx, cy), alpha = alpha)
    drawCircle(stroke, r.toFloat(), O(cx, cy), alpha = alpha, style = Stroke(sw.toFloat()))
}

/** SVG pattern "gndLock": #2c3138 ground with 2-wide #4a525c diagonal bars every 6 (patternTransform rotate(45)). */
private fun DrawScope.hatch(clip: Path, alpha: Float) {
    val b = clip.getBounds()
    clipPath(clip) {
        drawPath(clip, hex("2c3138"), alpha = alpha)
        val cx = (b.left + b.right) / 2; val cy = (b.top + b.bottom) / 2
        val reach = max(b.width, b.height) + 12f
        val d = 0.70710678f
        var t = -reach
        while (t <= reach) {
            // normal (d, d), direction (-d, d)
            val px = cx + t * d; val py = cy + t * d
            drawLine(hex("4a525c"), Offset(px + reach * d, py - reach * d), Offset(px - reach * d, py + reach * d), 2f, alpha = alpha)
            t += 6f
        }
    }
}

private fun DrawScope.chevron(up: Boolean, cx: Double, cy: Double, fill: Color, stroke: Color, alpha: Float = 1f) {
    val p = if (up) poly(cx - 5, cy + 4, cx + 5, cy + 4, cx, cy - 5) else poly(cx - 5, cy - 4, cx + 5, cy - 4, cx, cy + 5)
    drawPath(p, fill, alpha = alpha)
    drawPath(p, stroke, alpha = alpha, style = Stroke(0.75f))
}

private fun DrawScope.deflectionSurface(x: Double, y: Double, w: Double, h: Double, value: Double, amp: Double, chevronX: Double) {
    val up = value > 0.04; val down = value < -0.04
    val fill = if (up) C_UP else if (down) C_DN else C_NEUTRAL
    val stroke = if (up) C_UP_S else if (down) C_DN_S else C_NEUTRAL_S
    translate(0f, (-value * amp).toFloat()) {
        rr(x, y, w, h, 3.0, null, fill, stroke, 1.5)
        if (up || down) chevron(up, chevronX, y + h / 2, fill, stroke)
    }
}

private fun DrawScope.aileronPanel(x: Double, y: Double, w: Double, h: Double, value: Double, chevronX: Double) {
    val up = value > 0.04; val down = value < -0.04
    val mag = min(Math.abs(value), 1.0)
    val fill = if (up) C_UP else if (down) C_DN else C_NEUTRAL
    val stroke = if (up) C_UP_S else if (down) C_DN_S else C_NEUTRAL_S
    val a = (0.55 + mag * 0.45).toFloat()
    rr(x, y, w, h, 3.0, null, fill, stroke, 1.5, a)
    if (up || down) chevron(up, chevronX, y + h / 2, fill, stroke, a)
}

private fun DrawScope.spoilerPanel(x: Double, y: Double, w: Double, h: Double, deploy: Double, locked: Boolean) {
    val mag = min(max(deploy, 0.0), 1.0)
    val up = mag > 0.04
    val cx = x + w / 2; val cy = y + h / 2
    val a = if (locked) 0.7f else (0.55 + mag * 0.45).toFloat()
    val sx = if (locked) 1f else (1 - mag * 0.22).toFloat()
    withTransform({ scale(sx, 1f, O(cx, cy)) }) {
        val r = androidx.compose.ui.geometry.Rect(O(x, y), Size(w.toFloat(), h.toFloat()))
        if (locked) {
            val p = Path().apply { addRoundRect(androidx.compose.ui.geometry.RoundRect(r, CornerRadius(2f))) }
            hatch(p, a)
            drawPath(p, C_LOCK_S, alpha = a, style = Stroke(1.25f))
        } else rr(x, y, w, h, 2.0, null, if (up) C_UP else C_NEUTRAL, if (up) C_UP_S else C_NEUTRAL_S, 1.25, a)
    }
}

private fun DrawScope.travelGuide(x: Double, y1: Double, y2: Double) {
    ln(x, y1, x, y2, hex("3f4750"), 1.0, floatArrayOf(2f, 3f))
    dot(x, y1, 1.6, hex("3f4750"), hex("3f4750"), 0.0); dot(x, y2, 1.6, hex("3f4750"), hex("3f4750"), 0.0)
}

private fun DrawScope.travelGuideX(y: Double, x1: Double, x2: Double) {
    ln(x1, y, x2, y, hex("3f4750"), 1.0, floatArrayOf(2f, 3f))
    dot(x1, y, 1.6, hex("3f4750"), hex("3f4750"), 0.0); dot(x2, y, 1.6, hex("3f4750"), hex("3f4750"), 0.0)
}

private fun DrawScope.leStrip(points: DoubleArray, driveAvailable: Boolean, extended: Boolean, transit: Boolean) {
    val locked = !driveAvailable
    val a = if (locked) 0.7f else if (extended) 0.9f else if (transit) 0.8f else 0.5f
    val p = poly(*points)
    if (locked) hatch(p, a) else drawPath(p, if (extended) C_LE_EXT else if (transit) C_DN else hex("343c45"), alpha = a)
    drawPath(p, if (locked) C_LOCK_S else if (extended) C_LE_EXT_S else if (transit) C_DN_S else hex("7d8995"), alpha = a, style = Stroke(1.25f))
}

@Composable
fun FlightControlsModule(s: SimState, d: Derived, aside: (@Composable () -> Unit)? = null) {
    PanelModule("Flight controls · training") {
        FlightControlComponentView(s, d, aside)
    }
}

@Composable
private fun FlightControlComponentView(s: SimState, d: Derived, aside: (@Composable () -> Unit)?) {
    val m = R.model(s, d)
    val surface = d.controlSurfaces
    val leDrive = d.leDriveAvailable; val leExt = d.leExtended; val leTransit = d.leTransit
    val tm = rememberTextMeasurer()
    val pulse by rememberInfiniteTransition(label = "le").animateFloat(
        initialValue = 1f, targetValue = 1f,
        animationSpec = infiniteRepeatable(keyframes { durationMillis = 900; 1f at 0; 0.35f at 450; 1f at 900 }, RepeatMode.Restart), label = "lePulse",
    )
    val shape = RoundedCornerShape(8.dp)
    Column(Modifier.fillMaxWidth().background(Color(0xFF090B0E), shape).border(1.dp, Classic737Palette.Border, shape).padding(12.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Column(Modifier.weight(1f)) {
                Text("FLIGHT CONTROLS — COMPONENT VIEW", color = Classic737Palette.Fg, fontSize = 10.sp, letterSpacing = 0.14.em)
                Text("Control input → PCU → hydraulic source → surface", color = Classic737Palette.Subtle, fontSize = 9.sp, modifier = Modifier.padding(top = 2.dp))
            }
            Text("A/B + STBY RUD", color = Classic737Palette.Subtle, fontFamily = FontFamily.Monospace, fontSize = 8.sp,
                modifier = Modifier.border(1.dp, Classic737Palette.Border, RoundedCornerShape(4.dp)).padding(horizontal = 8.dp, vertical = 4.dp))
        }
        Column(
            Modifier.padding(top = 8.dp).fillMaxWidth().border(1.dp, hex("39414b"), RoundedCornerShape(6.dp))
                .background(Brush.radialGradient(listOf(hex("303842"), hex("12161b"), hex("080a0d")), radius = 520f), RoundedCornerShape(6.dp)).padding(8.dp),
        ) {
            Canvas(Modifier.fillMaxWidth().aspectRatio(640f / 425f)) {
                val sc = size.width / 640f
                withTransform({ scale(sc, sc, Offset.Zero) }) {
                    val metal = { top: Double, bottom: Double -> Brush.verticalGradient(listOf(hex("66727e"), hex("252b32")), startY = top.toFloat(), endY = bottom.toFloat()) }
                    val edge = hex("7d8995")
                    // fuselage / wings / tailplanes
                    val fus = Path().apply {
                        moveTo(320f, 50f); cubicTo(302f, 68f, 298f, 92f, 298f, 115f); lineTo(298f, 300f); cubicTo(298f, 324f, 308f, 338f, 320f, 344f)
                        cubicTo(332f, 338f, 342f, 324f, 342f, 300f); lineTo(342f, 115f); cubicTo(342f, 92f, 338f, 68f, 320f, 50f); close()
                    }
                    drawPath(fus, metal(50.0, 344.0)); drawPath(fus, edge, style = Stroke(2f))
                    val wl = poly(298.0, 140.0, 55.0, 195.0, 100.0, 222.0, 298.0, 205.0)
                    val wr = poly(342.0, 140.0, 585.0, 195.0, 540.0, 222.0, 342.0, 205.0)
                    for (w in listOf(wl, wr)) { val b = w.getBounds(); drawPath(w, metal(b.top.toDouble(), b.bottom.toDouble())); drawPath(w, edge, style = Stroke(2f)) }
                    for (t in listOf(poly(298.0, 305.0, 195.0, 322.0, 215.0, 336.0, 298.0, 335.0), poly(342.0, 305.0, 445.0, 322.0, 425.0, 336.0, 342.0, 335.0))) {
                        drawPath(t, hex("2e353d")); drawPath(t, edge, style = Stroke(2f))
                    }
                    travelGuide(248.0, 307.0, 354.0); travelGuide(392.0, 307.0, 354.0)
                    aileronPanel(108.0, 206.0, 95.0, 15.0, surface.aileronL, 100.0)
                    aileronPanel(437.0, 206.0, 95.0, 15.0, surface.aileronR, 540.0)
                    // upper-wing spoilers, outboard → inboard each side
                    spoilerPanel(205.0, 190.0, 18.0, 12.0, m.gndDeploy, m.gndSpoilerLocked)
                    spoilerPanel(229.0, 190.0, 18.0, 12.0, m.spoiler2, false)
                    spoilerPanel(253.0, 190.0, 18.0, 12.0, m.spoiler3, false)
                    spoilerPanel(277.0, 190.0, 18.0, 12.0, m.gndDeploy, m.gndSpoilerLocked)
                    spoilerPanel(345.0, 190.0, 18.0, 12.0, m.gndDeploy, m.gndSpoilerLocked)
                    spoilerPanel(369.0, 190.0, 18.0, 12.0, m.spoiler6, false)
                    spoilerPanel(393.0, 190.0, 18.0, 12.0, m.spoiler7, false)
                    spoilerPanel(417.0, 190.0, 18.0, 12.0, m.gndDeploy, m.gndSpoilerLocked)
                    txt(tm, "SPLR 1·2·3·4", 250.0, 183.0, 7.0, C_DIM, 1)
                    txt(tm, "SPLR 5·6·7·8", 390.0, 183.0, 7.0, C_DIM, 1)
                    // trailing-edge flaps (same flapPos on both segments / sides)
                    for (fx in listOf(205.0, 252.0, 392.0, 345.0)) {
                        val mag = min(max(m.teFlapFrac, 0.0), 1.0)
                        val down = mag > 0.04
                        translate(0f, (mag * 10).toFloat()) {
                            rr(fx, 206.0, 43.0, 15.0, 2.0, null, if (down) C_DN else C_NEUTRAL, if (down) C_DN_S else C_NEUTRAL_S, 1.25, (0.55 + mag * 0.45).toFloat())
                        }
                    }
                    // leading-edge devices (parallelogram strips along the wing sweep)
                    leStrip(doubleArrayOf(108.0, 183.0, 203.0, 161.5, 203.0, 172.5, 108.0, 194.0), leDrive, leExt, leTransit)
                    leStrip(doubleArrayOf(205.0, 161.05, 295.0, 140.68, 295.0, 151.68, 205.0, 172.05), leDrive, leExt, leTransit)
                    leStrip(doubleArrayOf(532.0, 183.0, 437.0, 161.5, 437.0, 172.5, 532.0, 194.0), leDrive, leExt, leTransit)
                    leStrip(doubleArrayOf(435.0, 161.05, 345.0, 140.68, 345.0, 151.68, 435.0, 172.05), leDrive, leExt, leTransit)
                    deflectionSurface(200.0, 324.0, 95.0, 13.0, surface.elevator, R.ELEV_AMP, 193.0)
                    deflectionSurface(345.0, 324.0, 95.0, 13.0, surface.elevator, R.ELEV_AMP, 447.0)
                    ln(320.0, 90.0, 320.0, 222.0, C_DIM, 1.5, floatArrayOf(4f, 4f))
                    // PCU block
                    rr(258.0, 222.0, 124.0, 18.0, 5.0, null, hex("20262d"), hex("7c8794"), 1.0)
                    txt(tm, "FLIGHT CONTROL PCUs", 320.0, 234.0, 10.0, hex("b8c0c8"), 1)
                    val lamp = hex("9ba6b2")
                    dot(320.0, 256.0, 8.0, if (m.a) hex("477b63") else hex("343c45"), lamp); txt(tm, "A", 336.0, 260.0, 10.0, C_TXT)
                    dot(320.0, 272.0, 8.0, if (m.b) hex("477b63") else hex("343c45"), lamp); txt(tm, "B", 336.0, 276.0, 10.0, C_TXT)
                    dot(320.0, 288.0, 8.0, if (m.rud) hex("477b63") else hex("343c45"), lamp); txt(tm, "STBY RUD", 336.0, 292.0, 10.0, C_TXT)
                    // tail fin + rudder bar (hinged at the fin top, swings like a pendulum)
                    ln(320.0, 344.0, 320.0, 355.0, edge, 7.0, round = true)
                    val fin = poly(310.0, 344.0, 330.0, 344.0, 320.0, 355.0)
                    drawPath(fin, metal(344.0, 355.0)); drawPath(fin, edge, style = Stroke(1.5f))
                    travelGuideX(393.0, 295.0, 345.0)
                    run {
                        val right = surface.rudder > 0.04; val left = surface.rudder < -0.04
                        val fill = if (right) C_UP else if (left) C_DN else hex("63343d")
                        val stroke = if (right) C_UP_S else if (left) C_DN_S else hex("a57b84")
                        rotate((-surface.rudder * 32).toFloat(), O(320.0, 355.0)) { rr(316.0, 355.0, 8.0, 35.0, 3.0, null, fill, stroke, 1.5) }
                    }
                    txt(tm, "◀ L", 280.0, 398.0, 7.0, C_DIM, 1); txt(tm, "R ▶", 360.0, 398.0, 7.0, C_DIM, 1)
                    txt(tm, "RUDDER", 320.0, 412.0, 10.0, C_TXT, 1)
                    // surface key
                    rr(480.0, 45.0, 150.0, 135.0, 6.0, null, hex("12161b"), hex("39414b"), 1.0)
                    txt(tm, "SURFACE KEY", 555.0, 58.0, 9.0, hex("9ba6b2"), 1)
                    dot(497.0, 73.0, 5.0, C_UP, C_UP_S); txt(tm, "TE UP · RUDDER RIGHT", 508.0, 76.0, 7.5, C_TXT)
                    dot(497.0, 90.0, 5.0, C_DN, C_DN_S); txt(tm, "TE DOWN · RUDDER LEFT", 508.0, 93.0, 7.5, C_TXT)
                    dot(497.0, 107.0, 5.0, C_NEUTRAL, C_NEUTRAL_S); txt(tm, "NEUTRAL", 508.0, 110.0, 7.5, C_TXT)
                    rr(492.0, 119.0, 10.0, 8.0, 1.5, null, C_UP, C_UP_S, 1.0); txt(tm, "SPOILER EXTENDED", 508.0, 126.0, 7.5, C_TXT)
                    rr(492.0, 136.0, 10.0, 8.0, 1.5, null, C_LE_EXT, C_LE_EXT_S, 1.0); txt(tm, "LE DEVICES EXTENDED", 508.0, 143.0, 7.5, C_TXT)
                    run {
                        val keyP = Path().apply { addRoundRect(androidx.compose.ui.geometry.RoundRect(androidx.compose.ui.geometry.Rect(O(492.0, 153.0), Size(10f, 8f)), CornerRadius(1.5f))) }
                        hatch(keyP, 1f); drawPath(keyP, C_LOCK_S, style = Stroke(1f))
                    }
                    txt(tm, "LOCKED (NO DRIVE/AIR)", 508.0, 160.0, 7.5, C_TXT)
                    // callouts
                    txt(tm, "LEFT AILERON", 10.0, 190.0, 10.0, C_TXT); ln(85.0, 187.0, 112.0, 210.0, C_DIM, 1.0)
                    txt(tm, "RIGHT AILERON", 504.0, 190.0, 10.0, C_TXT); ln(500.0, 187.0, 528.0, 210.0, C_DIM, 1.0)
                    txt(tm, "ELEVATOR", 286.0, 366.0, 10.0, C_TXT)
                    txt(tm, "CONTROL CABLE / INPUT", 260.0, 78.0, 10.0, C_TXT)
                    // flap position gauge: one needle over a 120° arc, flap-unit detent labels
                    val gx = R.G_CX; val gy = R.G_CY; val gr = R.G_R
                    txt(tm, "FLAP POSITION", gx, gy - gr - 14, 8.0, hex("9ba6b2"), 1)
                    val dial = Path()
                    for (i in 0..24) { val p = R.polar(gx, gy, gr, 150.0 - i * 5); if (i == 0) dial.moveTo(p.first.toFloat(), p.second.toFloat()) else dial.lineTo(p.first.toFloat(), p.second.toFloat()) }
                    drawPath(dial, hex("4a525c"), style = Stroke(2f))
                    for (v in R.FLAP_TICKS) {
                        val ang = R.flapAngle(v.toDouble())
                        val outer = R.polar(gx, gy, gr, ang); val inner = R.polar(gx, gy, gr - 7, ang); val label = R.polar(gx, gy, gr + 11, ang)
                        ln(inner.first, inner.second, outer.first, outer.second, hex("8a95a1"), 1.5)
                        txt(tm, if (v == 0) "UP" else v.toString(), label.first, label.second + 3, 7.0, hex("8a95a1"), 1)
                    }
                    val tip = R.polar(gx, gy, gr - 9, R.flapAngle(s.flapPos))
                    ln(gx, gy, tip.first, tip.second, hex("e8eef2"), 2.25, round = true)
                    dot(gx, gy, 4.5, hex("20262d"), hex("8a95a1"), 1.25)
                    val leA = if (leTransit) pulse else 1f
                    val leC = O(gx, gy + 34)
                    if (!leDrive) {
                        val cp = Path().apply { addOval(androidx.compose.ui.geometry.Rect(leC, 6f)) }
                        hatch(cp, leA)
                    } else drawCircle(if (leExt) C_LE_EXT else if (leTransit) C_DN else hex("2c333b"), 6f, leC, alpha = leA)
                    drawCircle(if (!leDrive) C_LOCK_S else if (leExt) C_LE_EXT_S else if (leTransit) C_DN_S else hex("7d8995"), 6f, leC, alpha = leA, style = Stroke(1.25f))
                    txt(tm, "LE FLAPS", gx + 12, gy + 37, 7.0, C_TXT)
                }
            }
        }
        // web readout grid: grid-cols-2 gap-2, or (with an aside) one column of readouts beside the aside at 1fr : 1.6fr
        val readouts: @Composable (Modifier, Boolean) -> Unit = { mod, single ->
            FlowRow(mod, horizontalArrangement = Arrangement.spacedBy(if (single) 6.dp else 8.dp), verticalArrangement = Arrangement.spacedBy(if (single) 6.dp else 8.dp), maxItemsInEachRow = if (single) 1 else 2) {
                for ((label, value) in R.readouts(s, d)) {
                    Column(Modifier.weight(1f).background(Inset, RoundedCornerShape(4.dp)).border(1.dp, Classic737Palette.Border, RoundedCornerShape(4.dp)).padding(horizontal = 8.dp, vertical = 6.dp)) {
                        Text(label, color = Classic737Palette.Subtle, fontFamily = FontFamily.Monospace, fontSize = 8.sp)
                        Text(value, color = Classic737Palette.Fg, fontFamily = FontFamily.Monospace, fontSize = 8.sp, modifier = Modifier.padding(top = 2.dp))
                    }
                }
            }
        }
        if (aside == null) readouts(Modifier.fillMaxWidth().padding(top = 8.dp), false)
        else Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Top) {
            readouts(Modifier.weight(1f), true)
            Box(Modifier.weight(1.6f)) { aside() }
        }
    }
}
