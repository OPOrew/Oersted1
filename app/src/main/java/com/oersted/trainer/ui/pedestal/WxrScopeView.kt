package com.oersted.trainer.ui.pedestal

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import com.oersted.trainer.sim.WxrScopeModel as W
import com.oersted.trainer.sim.WxrWorld
import com.oersted.trainer.ui.cockpit.CockpitModel
import kotlinx.coroutines.delay

/**
 * Port of WxrScope in components/panel/PrimusWxr.tsx: the Sperry Primus 90 indicator picture in the web's 200 x 150 view box
 * (range marks, AZIM strobes, TEST pattern, storm cells / MAP coast and cities, noise, sweep line, colour bar, TGT / FRZ / VAR /
 * mode field). The scope re-reads the radar nav position (published about 2.5 times a second) and the live weather cells; the
 * warm-up clock follows `useWxrWarm`. Logic is in sim/WxrScopeModel.kt. Compose only; verified on CI.
 */
@Composable
fun WxrScope(cockpit: CockpitModel, modifier: Modifier = Modifier) {
    val m by cockpit.mipState.collectAsState()
    val d by cockpit.derived.collectAsState()
    val s by cockpit.simState.collectAsState()
    val power = d.dcPower
    // web useWxrWarm: stamp the time the radar left PUSH; clear it when power or the mode goes away
    LaunchedEffect(power, m.radarMode, m.radarStbyAt) {
        if (!power || m.radarMode == 0) {
            if (m.radarStbyAt != 0.0) cockpit.updateMip { it.copy(radarStbyAt = 0.0) }
        } else if (m.radarStbyAt == 0.0) cockpit.updateMip { it.copy(radarStbyAt = System.currentTimeMillis().toDouble()) }
    }
    var tick by remember { mutableIntStateOf(0) }
    val warm = W.warm(m.radarStbyAt, System.currentTimeMillis().toDouble())
    LaunchedEffect(power, m.radarMode, warm) {
        // one-second re-check while the 70 s warm-up runs, otherwise follow the nav position / live cells at the web's 400 ms publish rate
        while (true) { delay(if (power && m.radarMode != 0 && !warm) 1000 else 400); tick++ }
    }
    // reading [tick] here makes the scope re-read the nav position and live cells on every pass
    val nav = run { tick; cockpit.wxrNav.state }
    val liveCells = run { tick; cockpit.liveWx.state.cells }
    val cells = liveCells.ifEmpty { WxrWorld.WX_CELLS }
    val tm = rememberTextMeasurer()

    val mode = W.WXR_MODES[m.radarMode]
    val test = m.radarRange == 0
    val map = mode == "MAP"
    val h = W.halfAngle(m.radarSector)
    val live = W.live(power, warm, mode)
    val field = W.field(mode, warm, test)
    val variable = W.variable(m.radarGain, mode, test)
    val altFt = s.psFlightAltFt
    val rangeNm = W.rangeNm(m.radarRange)
    val tgtHit = W.targetHit(live, m.radarTgt, map, cells, nav, m.radarTilt, altFt)

    val tr = rememberInfiniteTransition(label = "wxr")
    val half = (W.period(m.radarSector) * 500).toInt()
    val sweep by tr.animateFloat(-h.toFloat(), h.toFloat(), infiniteRepeatable(tween(half, easing = LinearEasing), RepeatMode.Reverse), label = "sweep")
    val blinkPhase by tr.animateFloat(0f, 1f, infiniteRepeatable(tween(1000, easing = LinearEasing)), label = "blink")
    val held = remember { floatArrayOf(0f) }
    if (!m.radarFrz) held[0] = sweep
    val sweepAngle = if (m.radarFrz) held[0] else sweep
    val blinkOn = blinkPhase < 0.5f

    Box(modifier.background(Color(0xFF050806))) {
        if (power) {
            Canvas(Modifier.fillMaxSize().graphicsLayer(alpha = W.intensity(m.radarInt).toFloat())) {
                val sc = minOf(size.width / 200f, size.height / 150f)
                val ox = (size.width - 200f * sc) / 2f
                val oy = (size.height - 150f * sc) / 2f
                withTransform({ translate(ox, oy); scale(sc, sc, Offset.Zero) }) {
                    drawWxr(tm, m, mode, map, test, h, live, field, variable, rangeNm, tgtHit, nav, cells, altFt, sweepAngle, blinkOn)
                }
            }
        }
        // glass reflection: linear-gradient(125deg, rgba(255,255,255,.08), transparent 38%)
        Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(Color(0x14FFFFFF), Color.Transparent), start = Offset.Zero, end = Offset(180f, 260f))))
    }
}

private fun hex(v: Long) = Color(0xFF000000 or v)

private fun pathPt(p: Path, op: Pair<Double, Double>, first: Boolean) {
    if (first) p.moveTo(op.first.toFloat(), op.second.toFloat()) else p.lineTo(op.first.toFloat(), op.second.toFloat())
}

private fun circRect(r: Double) = Rect((W.CX - r).toFloat(), (W.CY - r).toFloat(), (W.CX + r).toFloat(), (W.CY + r).toFloat())

/** web `band`: annular sector between r0 and r1, +-h degrees. */
private fun band(r0: Double, r1: Double, h: Double): Path = Path().apply {
    val a = W.pt(r0, -h); moveTo(a.first.toFloat(), a.second.toFloat())
    arcTo(circRect(r0), (-h - 90).toFloat(), (2 * h).toFloat(), false)
    val b = W.pt(r1, h); lineTo(b.first.toFloat(), b.second.toFloat())
    arcTo(circRect(r1), (h - 90).toFloat(), (-2 * h).toFloat(), false)
    close()
}

/** web `arc`: stroke-only arc at radius r, +-h degrees. */
private fun arcPath(r: Double, h: Double): Path = Path().apply {
    val a = W.pt(r, -h); moveTo(a.first.toFloat(), a.second.toFloat())
    arcTo(circRect(r), (-h - 90).toFloat(), (2 * h).toFloat(), false)
}

private fun DrawScope.label(tm: TextMeasurer, text: String, x: Double, y: Double, size: Double, color: Color, bold: Boolean = false, alpha: Float = 1f) {
    val style = TextStyle(color = color.copy(alpha = alpha), fontSize = size.toFloat().toSp(), fontFamily = FontFamily.Monospace, fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal)
    val lr = tm.measure(text, style)
    drawText(lr, topLeft = Offset(x.toFloat(), (y - lr.firstBaseline).toFloat()))
}

private fun DrawScope.drawWxr(
    tm: TextMeasurer, m: com.oersted.trainer.sim.MipLocal.MipState, mode: String, map: Boolean, test: Boolean, h: Double, live: Boolean, field: String,
    variable: Boolean, rangeNm: Double, tgtHit: Boolean, nav: WxrWorld.WxrNav, cells: List<WxrWorld.WxCell>, altFt: Double, sweepAngle: Float, blinkOn: Boolean,
) {
    val markCol = if (map) hex(0x3DDC84) else hex(0x35D0E0)
    val lvl = W.levelColors(map).map { hex(it) }
    val white = hex(0xE6EFE6)
    if (live) {
        // five range marks
        for (i in 1..5) {
            val r = (W.R / 5) * i
            drawPath(arcPath(r, h), markCol, alpha = 0.85f, style = Stroke(0.8f))
            label(tm, W.fmt((rangeNm / 5) * i), W.CX + 3, W.CY - r + 8, 6.0, markCol)
        }
        if (m.radarAzim) for (a in listOf(-60.0, -30.0, 0.0, 30.0, 60.0)) {
            if (kotlin.math.abs(a) > h) continue
            val e = W.pt(W.R, a)
            drawLine(markCol, Offset(W.CX.toFloat(), W.CY.toFloat()), Offset(e.first.toFloat(), e.second.toFloat()), 0.6f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(2f, 3f)), alpha = 0.7f)
        }
        if (test) {
            // AMM 34-41-01 self-test pattern
            val R = W.R
            drawPath(band(R * 0.2, R * 0.35, h), lvl[0], alpha = 0.8f)
            drawPath(band(R * 0.35, R * 0.5, h), lvl[1], alpha = 0.8f)
            drawPath(band(R * 0.5, R * 0.65, h), lvl[2], alpha = 0.85f)
            drawPath(band(R * 0.65, R * 0.8, h), lvl[1], alpha = 0.8f)
            drawPath(band(R * 0.75, R * 1.0, minOf(15.0, h)), lvl[2], alpha = 0.9f)
            drawPath(band(R * 0.85, R * 0.95, h), lvl[0])
        } else {
            val wedge = Path().apply {
                moveTo(W.CX.toFloat(), W.CY.toFloat())
                val a = W.pt(W.R, -h); lineTo(a.first.toFloat(), a.second.toFloat())
                arcTo(circRect(W.R), (-h - 90).toFloat(), (2 * h).toFloat(), false)
                close()
            }
            clipPath(wedge) {
                if (!map) {
                    for (c in W.cellDraws(cells, nav, rangeNm, m.radarTilt, altFt, m.radarGain, mode)) {
                        withTransform({ translate(c.px.toFloat(), c.py.toFloat()); rotate(c.rot.toFloat(), Offset.Zero) }) {
                            fun ell(k: Double, color: Color, a: Float) = drawOval(color, Offset((-c.rx * k).toFloat(), (-c.ry * k).toFloat()), Size((2 * c.rx * k).toFloat(), (2 * c.ry * k).toFloat()), alpha = a)
                            ell(1.0, lvl[0], 0.85f)
                            if (c.shown > 1) ell(0.62, lvl[1], 0.9f)
                            if (c.shown > 2 && !(mode == "CYC" && !blinkOn)) ell(0.3, lvl[2], 1f)
                        }
                    }
                } else {
                    val coast = Path()
                    WxrWorld.WX_COAST.forEachIndexed { i, (x, y) -> pathPt(coast, W.mapPoint(x, y, nav, rangeNm), i == 0) }
                    drawPath(coast, lvl[0], alpha = 0.9f, style = Stroke(2.2f, join = StrokeJoin.Miter))
                    drawPath(coast, lvl[1], alpha = 0.9f, style = Stroke(0.8f, join = StrokeJoin.Miter))
                    for ((x, y) in WxrWorld.WX_CITIES) {
                        val p = W.mapPoint(x, y, nav, rangeNm)
                        drawCircle(lvl[2], 3f, Offset(p.first.toFloat(), p.second.toFloat()))
                    }
                }
            }
        }
        if (!test && (map || variable)) {
            for ((a, r) in W.noise(h, map, m.radarGain)) {
                val p = W.pt(r * (if (map) 1 else 3), a)
                drawCircle(lvl[0], 0.9f, Offset(p.first.toFloat(), p.second.toFloat()), alpha = 0.6f)
            }
        }
        // sweep line, rotating about the antenna
        rotate(sweepAngle, Offset(W.CX.toFloat(), W.CY.toFloat())) {
            drawLine(hex(0xDFE8DF), Offset(W.CX.toFloat(), W.CY.toFloat()), Offset(W.CX.toFloat(), (W.CY - W.R).toFloat()), 1f, alpha = 0.75f)
        }
        // colour bar legend with level numbers, upper right
        lvl.forEachIndexed { i, c ->
            drawRect(c, Offset(176f, 6f + i * 11f), Size(8f, 8f))
            label(tm, "${i + 1}", 187.0, 13.0 + i * 11, 7.0, white)
        }
    }
    if (m.radarTgt) {
        drawRect(hex(0xFF3B30), Offset(3f, 3f), Size(22f, 11f))
        label(tm, if (tgtHit) "TGT" else "T", 6.0, 12.0, 8.0, Color.White, bold = true)
    }
    if (m.radarFrz && field != "PUSH" && field != "STBY" && field != "WAIT" && blinkOn) label(tm, "FRZ", 4.0, 133.0, 8.0, white)
    if (variable && !m.radarFrz && field != "WAIT") label(tm, "VAR", 4.0, 133.0, 8.0, white)
    label(tm, field, 4.0, 144.0, 9.0, if (field == "WAIT" || field == "PUSH") hex(0xF2D84A) else white)
}
