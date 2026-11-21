package com.oersted.trainer.ui.cockpit

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.res.imageResource
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import com.oersted.trainer.R
import com.oersted.trainer.sim.IceRainGeometry as G
import com.oersted.trainer.sim.IceRainModel
import kotlin.math.abs

/**
 * Port of the four animated diagrams of IceRainDiagrams.tsx for the Ice & Rain trainer: cockpit windows (AMM 56-10-0) on the front
 * photo, front overview (engine cowls + slats), wing anti-ice plan, and probe heat spots on the side photo. Geometry is in
 * sim/IceRainGeometry.kt (tested); the thermal / ice state comes from IceRainModel through the trainer's loop. Each diagram is a
 * Canvas in the web viewBox units. Differences from the SVG: blur filters are approximated by a wider, fainter underlay, and the
 * frost / drop patterns are drawn as tiles clipped to the pane. CSS animations (flow 0.7 s, pulse 1.4 s, flash 0.5 s, rise 2.4 s)
 * are InfiniteTransitions read in the draw phase. Compose only; verify on a device.
 */

/** Wiper phases (0..1) written by the trainer's frame loop and read only in the draw phase (no recomposition). */
class WiperPhases {
    var l by mutableDoubleStateOf(0.0)
    var r by mutableDoubleStateOf(0.0)
}

private val HOT = Color(0xFFFF9D3A)
private val ICE_W = Color(0xFFEAF6FF)
private val LABEL = Color(0xFF8EA2B3)
private val DIM = Color(0xFF6E7D8A)

private class IceClock(val flow: State<Float>, val pulse: State<Float>, val flash: State<Float>, val rise: State<Float>)

@Composable
private fun rememberIceClock(): IceClock {
    val tr = rememberInfiniteTransition(label = "ice")
    return IceClock(
        tr.animateFloat(0f, 1f, infiniteRepeatable(tween(700, easing = LinearEasing)), label = "flow"),
        tr.animateFloat(0.55f, 1f, infiniteRepeatable(tween(700, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "pulse"),
        tr.animateFloat(0f, 1f, infiniteRepeatable(tween(500, easing = LinearEasing)), label = "flash"),
        tr.animateFloat(0f, 2.4f, infiniteRepeatable(tween(2400, easing = LinearEasing)), label = "rise"),
    )
}

private fun poly(p: List<Pair<Double, Double>>): Path = Path().apply {
    p.forEachIndexed { i, q -> if (i == 0) moveTo(q.first.toFloat(), q.second.toFloat()) else lineTo(q.first.toFloat(), q.second.toFloat()) }
    close()
}

private fun rgb(t: Triple<Int, Int, Int>, a: Float = 1f) = Color(t.first, t.second, t.third).copy(alpha = a.coerceIn(0f, 1f))

private fun O(x: Double, y: Double) = Offset(x.toFloat(), y.toFloat())

private fun DrawScope.txt(tm: TextMeasurer, text: String, x: Double, y: Double, size: Float, color: Color, anchor: Int = 0, spacing: Float = 0f) {
    val lay = tm.measure(text, TextStyle(color = color, fontSize = size.toSp(), fontFamily = FontFamily.Monospace, letterSpacing = spacing.toSp()))
    val left = x.toFloat() - (if (anchor == 1) lay.size.width / 2f else if (anchor == 2) lay.size.width.toFloat() else 0f)
    drawText(lay, topLeft = Offset(left, y.toFloat() - lay.firstBaseline))
}

private fun flowEffect(clock: IceClock, a: Float, b: Float) = PathEffect.dashPathEffect(floatArrayOf(a, b), (1f - clock.flow.value) * 22f)

/** A canvas in web viewBox units (vx, vy, vw, vh) with an optional photo drawn at the origin, like an SVG with an <image>. */
@Composable
private fun SvgCanvas(vx: Float, vy: Float, vw: Float, vh: Float, bg: ImageBitmap?, content: DrawScope.() -> Unit) {
    Canvas(Modifier.fillMaxWidth().aspectRatio(vw / vh)) {
        val sc = size.width / vw
        clipRect {
            withTransform({ scale(sc, sc, Offset.Zero); translate(-vx, -vy) }) {
                if (bg != null) drawImage(bg)
                content()
            }
        }
    }
}

@Composable
private fun DiagramFrame(padded: Boolean, content: @Composable () -> Unit) {
    androidx.compose.foundation.layout.Box(
        Modifier.fillMaxWidth().padding(bottom = 8.dp).background(Color(0xFF0B0D10), RoundedCornerShape(8.dp)).border(1.dp, Color(0xFF2C323D), RoundedCornerShape(8.dp)).padding(if (padded) 4.dp else 0.dp),
    ) { content() }
}

// ---------- tiled patterns, clipped to a pane ----------

private fun DrawScope.frost(p: List<Pair<Double, Double>>, opacity: Float) {
    if (opacity < 0.02f) return
    val xs = p.map { it.first }; val ys = p.map { it.second }
    val x0 = (Math.floor(xs.min() / 7) * 7).toFloat(); val x1 = xs.max().toFloat()
    val y0 = (Math.floor(ys.min() / 7) * 7).toFloat(); val y1 = ys.max().toFloat()
    clipPath(poly(p)) {
        drawRect(Color(0xFFDFF1FF).copy(alpha = 0.35f * opacity), Offset(x0, y0), Size(x1 - x0 + 7, y1 - y0 + 7))
        val w = Color.White.copy(alpha = 0.9f * opacity)
        var tx = x0
        while (tx <= x1) {
            var ty = y0
            while (ty <= y1) {
                drawLine(w, Offset(tx + 3.5f, ty), Offset(tx + 3.5f, ty + 7), 0.5f); drawLine(w, Offset(tx, ty + 3.5f), Offset(tx + 7, ty + 3.5f), 0.5f)
                drawLine(w, Offset(tx + 1, ty + 1), Offset(tx + 6, ty + 6), 0.5f); drawLine(w, Offset(tx + 6, ty + 1), Offset(tx + 1, ty + 6), 0.5f)
                ty += 7
            }
            tx += 7
        }
    }
}

private fun DrawScope.drops(p: List<Pair<Double, Double>>, opacity: Float) {
    if (opacity < 0.02f) return
    val xs = p.map { it.first }; val ys = p.map { it.second }
    val x0 = (Math.floor(xs.min() / 9) * 9).toFloat(); val x1 = xs.max().toFloat()
    val y0 = (Math.floor(ys.min() / 9) * 9).toFloat(); val y1 = ys.max().toFloat()
    clipPath(poly(p)) {
        var tx = x0
        while (tx <= x1) {
            var ty = y0
            while (ty <= y1) {
                drawCircle(Color(0xFF9FD3FF).copy(alpha = opacity), 1.1f, Offset(tx + 2, ty + 2))
                drawCircle(Color(0xFFBFE3FF).copy(alpha = opacity), 1.4f, Offset(tx + 6.5f, ty + 5))
                drawCircle(Color(0xFF9FD3FF).copy(alpha = opacity), 0.8f, Offset(tx + 3, ty + 7.5f))
                ty += 9
            }
            tx += 9
        }
    }
}

// ---------- window layer (AMM 56-10-0) ----------

private fun DrawScope.windowLayer(tm: TextMeasurer, clock: IceClock, anim: IceRainModel.IceState, ovht: Map<String, Boolean>, wipers: WiperPhases?, detail: Boolean) {
    for (sd in listOf("R", "L")) {
        for (n in listOf("3", "2", "1", "4", "5")) {
            val p = G.winPts(sd, n)
            val c = G.centroid(p)
            if (n == "3") {
                drawPath(poly(p), Color(0xFF16222C).copy(alpha = 0.55f))
                drawPath(poly(p), Color(0xFF52606C), style = Stroke(0.6f))
                if (detail) txt(tm, "3", c.first, c.second + 2, 6f, DIM, 1)
                continue
            }
            val id = "$sd$n"
            val w = anim.win.getValue(id)
            val glow = G.glow(w.t).toFloat()
            val hot = G.heatRgb(w.t)
            val bad = (ovht[id] ?: false) || w.trip
            val minX = p.minOf { it.first }; val wd = p.maxOf { it.first } - minX; val botY = p.maxOf { it.second }
            val path = poly(p)
            drawPath(path, Color(0xFF0B1C28).copy(alpha = 0.62f))
            drawPath(path, rgb(hot, 0.1f + 0.55f * glow))
            for ((a, b) in listOf(p[0] to p[1], p[3] to p[2])) {
                drawLine(rgb(hot, 0.35f * w.p.toFloat()), O(a.first, a.second), O(b.first, b.second), 3.4f)
                drawLine(rgb(hot, 0.15f + 0.85f * w.p.toFloat()), O(a.first, a.second), O(b.first, b.second), 1.1f)
            }
            if (detail && glow > 0.2f) {
                val lines = G.vaporLines(n)
                for (i in 0 until lines) {
                    val ph = (((clock.rise.value - i * 0.6f) % 2.4f) + 2.4f) % 2.4f / 2.4f
                    val op = if (ph < 0.3f) 0.85f * ph / 0.3f else 0.85f * (1f - (ph - 0.3f) / 0.7f)
                    val ty = 5f - 14f * ph * ph
                    val x = (minX + ((i + 1.0) / (lines + 1)) * wd).toFloat()
                    val y = (botY - 4).toFloat() + ty
                    val v = Path().apply { moveTo(x, y); quadraticBezierTo(x + 2, y - 4, x, y - 8); quadraticBezierTo(x - 2, y - 12, x, y - 16) }
                    drawPath(v, Color(0xFFFFD9A0).copy(alpha = op.coerceIn(0f, 1f)), style = Stroke(0.9f))
                }
            }
            if (n == "1") drops(p, (w.wet * 0.9).toFloat())
            if (n == "1" && anim.repel.getValue(sd) > 0.02) drawPath(path, Color(0xFF7FD0FF).copy(alpha = (anim.repel.getValue(sd) * 0.28).toFloat()))
            frost(p, (w.ice * 0.95).toFloat())
            if (bad) drawPath(path, Color(0xFFFF3B2E).copy(alpha = if (clock.flash.value < 0.5f) 0.25f else 1f))
            drawPath(path, Color(0xFF9DB3C4).copy(alpha = 0.7f), style = Stroke(0.6f))
            if (detail) txt(tm, n, c.first, c.second + 2, 6.5f, Color(0xFFCFE0EE).copy(alpha = 0.85f), 1)
        }
    }
    if (detail && wipers != null) {
        for (sd in listOf("R", "L")) {
            val p = G.winPts(sd, "1")
            val pivot = p[3]
            val ph = if (sd == "L") wipers.l else wipers.r
            val ang = IceRainModel.wiperAngle(ph).toFloat()
            clipPath(poly(p)) {
                withTransform({
                    translate(pivot.first.toFloat(), pivot.second.toFloat())
                    scale(if (sd == "L") -1f else 1f, 1f, Offset.Zero)
                    rotate(-ang, Offset.Zero)
                }) {
                    drawLine(Color(0xFFAAB6C1), Offset.Zero, Offset(G.WIPER_LEN.toFloat(), 0f), 1.1f)
                    drawLine(Color(0xFFE7EDF2), Offset((G.WIPER_LEN * 0.3).toFloat(), 0f), Offset(G.WIPER_LEN.toFloat(), 0f), 2.2f)
                }
            }
        }
    }
}

/** Zoomed cockpit-window view for the window-heat card. */
@Composable
fun CockpitWindowsDiagram(anim: IceRainModel.IceState, ovht: Map<String, Boolean>, wipers: WiperPhases) {
    val tm = rememberTextMeasurer(); val clock = rememberIceClock()
    val bg = ImageBitmap.imageResource(R.drawable.front_737)
    DiagramFrame(true) {
        SvgCanvas(1034f, 458f, 262f, 92f, bg) {
            windowLayer(tm, clock, anim, ovht, wipers, true)
            txt(tm, "R WINDOWS", 1070.0, 548.0, 5.5f, LABEL, 1, 1f)
            txt(tm, "L WINDOWS", 1259.0, 548.0, 5.5f, LABEL, 1, 1f)
            txt(tm, "FWD VIEW · AMM 56-10-0", 1165.0, 465.0, 5f, LABEL, 1)
        }
    }
}

// ---------- front overview ----------

private fun DrawScope.cowl(clock: IceClock, cx: Double, heated: Boolean, ice: Double, hubGlow: Boolean) {
    val cy = G.ENG_CY
    if (heated) {
        val ring = Path().apply {
            fillType = PathFillType.EvenOdd
            addOval(androidx.compose.ui.geometry.Rect(Offset((cx - 87).toFloat(), (cy - 87).toFloat()), Size(174f, 174f)))
            addOval(androidx.compose.ui.geometry.Rect(Offset((cx - 56).toFloat(), (cy + 4 - 56).toFloat()), Size(112f, 112f)))
        }
        drawCircle(HOT.copy(alpha = clock.pulse.value * 0.35f), 96f, O(cx, cy), style = Stroke(26f))      // stands in for the blur-lg underlay
        drawPath(ring, HOT.copy(alpha = clock.pulse.value))
    }
    if (hubGlow) drawCircle(HOT.copy(alpha = clock.pulse.value), 15f, O(cx, cy + 2))
    if (ice > 0.02) drawCircle(ICE_W.copy(alpha = 0.92f), (86 - ice * 2).toFloat(), O(cx, cy), style = Stroke((ice * 11).toFloat()))
}

@Composable
fun FrontOverviewDiagram(anim: IceRainModel.IceState, valveOpen: Map<String, Boolean>, cowlHeated: Map<Int, Boolean>, ovht: Map<String, Boolean>) {
    val tm = rememberTextMeasurer(); val clock = rememberIceClock()
    val bg = ImageBitmap.imageResource(R.drawable.front_737)
    DiagramFrame(false) {
        SvgCanvas(0f, 372f, 2336f, 490f, bg) {
            for (sd in listOf("R", "L")) {
                val band = G.frontSlatBand(sd, anim.slat.getValue(sd))
                val heated = valveOpen.getValue(sd)
                val first = band[0]; val last = band[1]
                if (heated) {
                    drawPath(poly(band), HOT.copy(alpha = clock.pulse.value * 0.4f), style = Stroke(18f))
                    drawPath(poly(band), HOT.copy(alpha = clock.pulse.value))
                    drawPath(poly(band), HOT.copy(alpha = 0.5f))
                    drawLine(Color(0xFFFFE2B8), O(first.first, first.second + 8), O(last.first, last.second + 8), 3f, pathEffect = flowEffect(clock, 6f, 5f))
                }
                if (anim.slat.getValue(sd) > 0.02) drawPath(poly(band), ICE_W.copy(alpha = (0.25 + 0.7 * anim.slat.getValue(sd)).toFloat().coerceIn(0f, 1f)))
            }
            cowl(clock, G.ENG_CX.getValue("R"), cowlHeated.getValue(2), anim.cowl.getValue(2), cowlHeated.getValue(2))
            cowl(clock, G.ENG_CX.getValue("L"), cowlHeated.getValue(1), anim.cowl.getValue(1), cowlHeated.getValue(1))
            windowLayer(tm, clock, anim, ovht, null, false)
            txt(tm, "ENG 2 · COWL", 731.0, 838.0, 34f, LABEL, 1, 3f)
            txt(tm, "ENG 1 · COWL", 1598.0, 838.0, 34f, LABEL, 1, 3f)
            txt(tm, "R WING SLATS", 370.0, 520.0, 34f, LABEL, 1, 3f)
            txt(tm, "L WING SLATS", 1960.0, 520.0, 34f, LABEL, 1, 3f)
        }
    }
}

// ---------- wing TAI plan view ----------

private fun DrawScope.wingSide(tm: TextMeasurer, clock: IceClock, side: String, anim: IceRainModel.IceState, lePos: Double, hot: Boolean, light: String, cowlOpen: Boolean, cowlHeated: Boolean) {
    fun m(x: Double) = G.planX(side, x)
    fun pt(x: Double, dy: Double = 0.0) = O(m(x), G.le(x) + dy)
    val valve = anim.valve.getValue(side)
    val flowing = valve > 0.5 && hot
    val iceW = anim.slat.getValue(side)
    val k = if (side == "L") -1.0 else 1.0
    val dx = (k * 1.3 * lePos).toFloat()
    val dy = (-5.9 * lePos).toFloat()
    val vx = m(232.0); val vy = G.le(232.0) + 17
    val nx = m(252.0)
    val iceCowl = anim.cowl.getValue(if (side == "L") 1 else 2)
    val flowAng = if (side == "L") -12.8f else 12.8f
    fun quad(a: Offset, b: Offset, c: Offset, d: Offset) = Path().apply { moveTo(a.x, a.y); lineTo(b.x, b.y); lineTo(c.x, c.y); lineTo(d.x, d.y); close() }

    // Krueger / inboard LE devices - no TAI
    val kr = quad(pt(270.0), pt(296.0), pt(296.0, 11.0), pt(270.0, 11.0))
    drawPath(kr, Color(0xFF1D242C)); drawPath(kr, Color(0xFF4D5964), style = Stroke(0.8f))
    // nacelle
    drawRoundRect(Color(0xFF1B2129), O(nx - 14, 116.0), Size(28f, 58f), CornerRadius(12f))
    drawRoundRect(Color(0xFF6F7C88), O(nx - 14, 116.0), Size(28f, 58f), CornerRadius(12f), style = Stroke(1.2f))
    if (cowlHeated) drawOval(HOT.copy(alpha = clock.pulse.value), O(nx - 15, 112.0), Size(30f, 12f), style = Stroke(5f))
    drawOval(Color(0xFF0D1115), O(nx - 14, 113.0), Size(28f, 10f))
    drawOval(if (cowlHeated) HOT else if (cowlOpen) Color(0xFFC98D44) else Color(0xFF7A8794), O(nx - 14, 113.0), Size(28f, 10f), style = Stroke(if (cowlHeated) 2.4f else 1.4f))
    if (iceCowl > 0.02) drawOval(ICE_W.copy(alpha = 0.92f), O(nx - 15, 111.0), Size(30f, 12f), style = Stroke((iceCowl * 4.5).toFloat()))
    txt(tm, "ENG ${if (side == "L") 1 else 2}", nx, 108.0, 8f, LABEL, 1, 1f)

    // pneumatic duct fuselage -> valve (hot whenever bleed air is available)
    val duct = Path().apply { moveTo(320f, (G.le(296.0) + 17).toFloat()); val a = pt(296.0, 17.0); lineTo(a.x, a.y); lineTo(vx.toFloat(), vy.toFloat()) }
    drawPath(duct, Color(0xFF2C3743), style = Stroke(5f, cap = StrokeCap.Round))
    drawPath(duct, if (hot) Color(0xFFC8742A) else Color(0xFF3F4B57), style = Stroke(2f, pathEffect = if (hot) flowEffect(clock, 6f, 5f) else null))
    // TAI supply manifold behind the slats: valve -> tip
    val man = Path().apply { moveTo(vx.toFloat(), vy.toFloat()); val a = pt(112.0, 17.0); lineTo(a.x, a.y) }
    drawPath(man, Color(0xFF2C3743), style = Stroke(5f, cap = StrokeCap.Round))
    drawPath(man, if (flowing) HOT else Color(0xFF3F4B57), style = Stroke(2f, pathEffect = if (flowing) flowEffect(clock, 6f, 5f) else null))

    for ((xa, xb) in G.SLATS) {
        val xc = (xa + xb) / 2
        // telescoping duct follows the slat
        drawLine(if (flowing) HOT else Color(0xFF52606C), O(m(xc), G.le(xc) + 17), Offset((m(xc) + dx).toFloat(), (G.le(xc) + 5.5 + dy).toFloat()), 2.2f)
        withTransform({ translate(dx, dy) }) {
            val q = quad(pt(xa), pt(xb), pt(xb, 11.0), pt(xa, 11.0))
            drawPath(q, Color(0xFF2A3340)); drawPath(q, Color(0xFF7A8794), style = Stroke(1f))
            if (flowing) {
                drawPath(q, HOT.copy(alpha = clock.pulse.value * 0.5f))
                drawLine(Color(0xFFFFE2B8), O(m(xa + 2), G.le(xa + 2) + 5.5), O(m(xb - 2), G.le(xb - 2) + 5.5), 1.6f, pathEffect = flowEffect(clock, 6f, 5f))
            }
            if (iceW > 0.02) {
                val ip = quad(O(m(xa), G.le(xa) - iceW * 5), O(m(xb), G.le(xb) - iceW * 5), pt(xb), pt(xa))
                drawPath(ip, ICE_W.copy(alpha = 0.92f))
            }
        }
    }

    // TAI control valve - just outboard of the engine strut
    withTransform({ translate(vx.toFloat(), vy.toFloat()) }) {
        drawCircle(Color(0xFF0F151B), 6.5f, Offset.Zero)
        drawCircle(if (valve > 0.97) Color(0xFF3DD68C) else if (valve < 0.03) Color(0xFF6C7884) else Color(0xFFE0A84A), 6.5f, Offset.Zero, style = Stroke(1.6f))
        rotate(flowAng + (90 * (1 - valve)).toFloat(), Offset.Zero) { drawLine(Color(0xFFD6DDE3), Offset(-7f, 0f), Offset(7f, 0f), 2f) }
        val a = if (light == "off") 0.12f else if (light == "dim") 0.5f else if (light == "bright") clock.pulse.value else 1f
        drawCircle(Color(0xFF59B6FF).copy(alpha = a), 3.6f, Offset(0f, 13f))
        drawCircle(Color(0xFF2A4A63), 3.6f, Offset(0f, 13f), style = Stroke(0.8f))
    }
}

@Composable
fun WingAntiIcePlan(
    anim: IceRainModel.IceState, lePos: Double, hotAir: Map<String, Boolean>, lights: Map<String, String>,
    cowlOpen: Map<Int, Boolean>, cowlHeated: Map<Int, Boolean>, inhibited: Boolean = false,
) {
    val tm = rememberTextMeasurer(); val clock = rememberIceClock()
    DiagramFrame(true) {
        SvgCanvas(30f, 76f, 580f, 160f, null) {
            fun wing(top: Float, bottom: Float) = Brush.verticalGradient(listOf(Color(0xFF66727E), Color(0xFF252B32)), startY = top, endY = bottom)
            val fus = Path().apply {
                moveTo(320f, 50f); cubicTo(302f, 68f, 298f, 92f, 298f, 115f); lineTo(298f, 300f); cubicTo(298f, 324f, 308f, 338f, 320f, 344f)
                cubicTo(332f, 338f, 342f, 324f, 342f, 300f); lineTo(342f, 115f); cubicTo(342f, 92f, 338f, 68f, 320f, 50f); close()
            }
            drawPath(fus, wing(50f, 344f)); drawPath(fus, Color(0xFF7D8995), style = Stroke(2f))
            val lw = Path().apply { moveTo(298f, 140f); lineTo(55f, 195f); lineTo(100f, 222f); lineTo(298f, 205f); close() }
            val rw = Path().apply { moveTo(342f, 140f); lineTo(585f, 195f); lineTo(540f, 222f); lineTo(342f, 205f); close() }
            drawPath(lw, wing(140f, 222f)); drawPath(lw, Color(0xFF7D8995), style = Stroke(2f))
            drawPath(rw, wing(140f, 222f)); drawPath(rw, Color(0xFF7D8995), style = Stroke(2f))
            wingSide(tm, clock, "L", anim, lePos, hotAir.getValue("L"), lights.getValue("L"), cowlOpen.getValue(1), cowlHeated.getValue(1))
            wingSide(tm, clock, "R", anim, lePos, hotAir.getValue("R"), lights.getValue("R"), cowlOpen.getValue(2), cowlHeated.getValue(2))
            txt(tm, "L WING · SLATS (TAI)", 70.0, 226.0, 8f, LABEL, 0, 1f)
            txt(tm, "R WING · SLATS (TAI)", 570.0, 226.0, 8f, LABEL, 2, 1f)
            txt(tm, "PNEU", 320.0, 176.0, 7f, DIM, 1)
            if (inhibited) {
                val a = clock.pulse.value
                drawRoundRect(Color(0xFF2A1D08).copy(alpha = a), Offset(190f, 84f), Size(260f, 14f), CornerRadius(3f))
                drawRoundRect(Color(0xFFE0A84A).copy(alpha = a), Offset(190f, 84f), Size(260f, 14f), CornerRadius(3f), style = Stroke(0.8f))
                txt(tm, "WING A/I INHIBITED ON GROUND · HOLD TEST OR SELECT AIRBORNE", 320.0, 94.0, 7.5f, Color(0xFFF0C066).copy(alpha = a), 1, 0.6f)
            }
        }
    }
}

// ---------- probe heat (side photo) ----------

@Composable
fun ProbeHeatDiagram(anim: IceRainModel.IceState, heated: Map<String, Boolean>) {
    val clock = rememberIceClock()
    val bg = ImageBitmap.imageResource(R.drawable.probe_heat_side_v2)
    DiagramFrame(false) {
        SvgCanvas(0f, 0f, 1619f, 971f, bg) {
            for (pr in G.PROBE_XY) {
                val on = pr.ids.any { heated[it] == true }
                val ice = pr.ids.maxOf { anim.probe.getValue(it) }
                val r = pr.r.toFloat()
                if (on) {
                    val glowR = r * 1.7f
                    val brush = Brush.radialGradient(
                        0f to Color(0xFFFF8A1E).copy(alpha = 0.95f), 0.45f to HOT.copy(alpha = 0.5f), 1f to HOT.copy(alpha = 0f),
                        center = O(pr.x, pr.y), radius = glowR,
                    )
                    drawCircle(brush, glowR, O(pr.x, pr.y), alpha = clock.pulse.value)
                }
                if (ice > 0.02) {
                    val rr = (4 + ice * r * 0.9).toFloat()
                    drawCircle(ICE_W.copy(alpha = 0.95f), rr, O(pr.x, pr.y))
                    drawCircle(Color(0xFF9FD3FF).copy(alpha = 0.95f), rr, O(pr.x, pr.y), style = Stroke(2f))
                }
            }
        }
    }
}
