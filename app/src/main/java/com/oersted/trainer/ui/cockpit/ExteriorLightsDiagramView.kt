package com.oersted.trainer.ui.cockpit

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.imageResource
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.text.style.TextOverflow
import com.oersted.trainer.R
import com.oersted.trainer.sim.ExteriorLightsData as D
import com.oersted.trainer.sim.LightStatus

/**
 * Port of components/panel/ExteriorLightsDiagram.tsx: the AMM 33-40-0 exterior-lighting art in four views (Top / Side (L) / Front /
 * Rear) with a numbered marker per light, a Zoom / Fit toggle (220 % width, horizontal scroll) and a legend with live status.
 * Marker tables, names, lens footprints, leader geometry and legend status text are in sim/ExteriorLightsData.kt (tested). The art
 * is drawn inverted with a screen blend at 0.85 opacity on #0d1115, as in the web CSS. The SVG <animate> flashes (0.8 s strobe,
 * 1.3 s other, triangle wave) are InfiniteTransitions read only in the draw phase. Compose only; verify on a device.
 */

private val LineC = Color(0xFF39414B)
private val SubtleC = Color(0xFF8F9AA5)
private val OkC = Color(0xFF65C798)
private val WarnC = Color(0xFFE5A23A)
private val FgC = Color(0xFFE6E1D2)
private val AccentC = Color(0xFFD6A845)
private val InsetC = Color(0xFF0E1013)
private val SkinBg = Color(0xFF0D1115)

private val INVERT = ColorMatrix(floatArrayOf(
    -1f, 0f, 0f, 0f, 255f,
    0f, -1f, 0f, 0f, 255f,
    0f, 0f, -1f, 0f, 255f,
    0f, 0f, 0f, 1f, 0f,
))

private fun artFor(key: String): Int = when (key) {
    "side" -> R.drawable.ext_side
    "front" -> R.drawable.ext_front
    "rear" -> R.drawable.ext_rear
    else -> R.drawable.ext_aerial
}

private fun lightCol(name: String): Color = Color(D.COLORS[name] ?: D.COLORS.getValue("white"))

private fun O(x: Double, y: Double) = Offset(x.toFloat(), y.toFloat())

@Composable
private fun StatusDot(l: LightStatus?, sizeDp: Int = 11) {
    val tr = rememberInfiniteTransition(label = "dot")
    val pulse by tr.animateFloat(1f, 0.35f, infiniteRepeatable(tween(450), RepeatMode.Reverse), label = "p")
    val lit = l != null && l.lit
    val base = if (lit) (0.4 + 0.6 * l!!.level).toFloat() else 1f
    Box(
        Modifier.size(sizeDp.dp).alpha(if (lit && l!!.flash != null) base * pulse else base)
            .background(if (lit) lightCol(l!!.color) else Color(0xFF23272C), CircleShape).border(1.dp, Color(0x66000000), CircleShape),
    )
}

@Composable
private fun ToggleBtn(text: String, active: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier.background(if (active) AccentC.copy(alpha = 0.10f) else InsetC, RoundedCornerShape(4.dp))
            .border(1.dp, if (active) AccentC.copy(alpha = 0.6f) else LineC, RoundedCornerShape(4.dp))
            .clickable { onClick() }.padding(horizontal = 6.dp, vertical = 7.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text.uppercase(), color = if (active) FgC else SubtleC, fontSize = 8.sp, maxLines = 1) }
}

@Composable
fun ExteriorLightsDiagram(lights: List<LightStatus>) {
    var viewKey by remember { mutableStateOf("aerial") }
    var zoom by remember { mutableStateOf(false) }
    var sel by remember { mutableStateOf<Int?>(null) }
    val v = D.VIEWS.getValue(viewKey)

    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
            for (k in D.VIEW_ORDER) ToggleBtn(D.VIEWS.getValue(k).label, viewKey == k, Modifier.weight(1f)) { viewKey = k; sel = null }
            ToggleBtn(if (zoom) "Fit" else "Zoom", zoom) { zoom = !zoom }
        }

        ExteriorCanvas(v, lights, sel, zoom) { n -> sel = if (sel == n) null else n }

        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            for (n in D.numbers(v)) {
                val rs = D.rowStatus(v, n, lights)
                val first = rs.ls.firstOrNull()
                val nm = D.NAMES.getValue(n)
                Row(
                    Modifier.fillMaxWidth().background(InsetC, RoundedCornerShape(4.dp))
                        .border(1.dp, if (sel == n) AccentC.copy(alpha = 0.6f) else LineC, RoundedCornerShape(4.dp))
                        .clickable { sel = if (sel == n) null else n }.padding(horizontal = 8.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(n.toString(), color = FgC, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 8.sp, modifier = Modifier.width(16.dp), maxLines = 1)
                    StatusDot(first)
                    Column(Modifier.weight(1f)) {
                        Text(nm.name.uppercase(), color = FgC, fontSize = 8.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(
                            (nm.note + (if (sel == n && first != null) " · ${first.supply} · CB ${first.cb}" else "")).uppercase(),
                            color = SubtleC, fontFamily = FontFamily.Monospace, fontSize = 7.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Text(
                        D.statusText(rs).uppercase(),
                        color = if (rs.lit > 0) OkC else if (rs.reason != null) WarnC else SubtleC,
                        fontFamily = FontFamily.Monospace, fontSize = 7.sp, maxLines = 1,
                    )
                }
            }
        }
        Text(
            "DASHED RING = UNDERSIDE OR NOT VISIBLE FROM THIS VIEW · SOURCE: AMM 33-40-0 FIG. 1, 33-41 TO 33-49 · STROBES, TAXI AND LOGO LIGHTS ARE INSTALLED ON SOME AIRPLANES ONLY",
            color = SubtleC, fontFamily = FontFamily.Monospace, fontSize = 7.sp, lineHeight = 9.sp, modifier = Modifier.padding(horizontal = 4.dp),
        )
    }
}

@Composable
private fun ExteriorCanvas(v: D.ViewDef, lights: List<LightStatus>, sel: Int?, zoom: Boolean, onSelect: (Int) -> Unit) {
    val tm = rememberTextMeasurer()
    val art = ImageBitmap.imageResource(artFor(v.key))
    val tr = rememberInfiniteTransition(label = "ext-flash")
    // SVG <animate values="a;b;a"> is a triangle wave: 0 -> 1 -> 0 over the duration.
    val strobe by tr.animateFloat(0f, 1f, infiniteRepeatable(tween(400, easing = LinearEasing), RepeatMode.Reverse), label = "strobe")
    val slow by tr.animateFloat(0f, 1f, infiniteRepeatable(tween(650, easing = LinearEasing), RepeatMode.Reverse), label = "slow")
    val scroll = rememberScrollState()

    BoxWithConstraints(Modifier.fillMaxWidth().background(SkinBg, RoundedCornerShape(4.dp)).border(1.dp, LineC, RoundedCornerShape(4.dp)).horizontalScroll(scroll)) {
        val w = if (zoom) maxWidth * 2.2f else maxWidth
        val h = w * (v.h / v.w).toFloat()
        Canvas(
            Modifier.width(w).height(h).pointerInput(v.key) {
                detectTapGestures { off ->
                    val sc = size.width / v.w.toFloat()
                    D.hitNumber(v, (off.x / sc).toDouble(), (off.y / sc).toDouble())?.let { onSelect(it) }
                }
            },
        ) {
            val sc = size.width / v.w.toFloat()
            drawImage(art, dstSize = IntSize(size.width.toInt(), size.height.toInt()), alpha = 0.85f, colorFilter = ColorFilter.colorMatrix(INVERT), blendMode = BlendMode.Screen)
            withTransform({ scale(sc, sc, Offset.Zero) }) {
                for (mk in v.marks) {
                    val l = lights.firstOrNull { it.id == mk.id } ?: continue
                    val t = if (l.flash == "strobe") strobe else slow
                    marker(tm, mk, l, sel == mk.n, t)
                }
            }
        }
    }
}

private fun DrawScope.lensBody(ln: D.Lens, mk: D.Mk, fill: Color?, brush: Brush?, stroke: Color, sw: Float, a: Float) {
    val rx = ln.w / 2; val ry = ln.h / 2
    val shape = Path()
    when (ln.shape) {
        "rect" -> shape.addRoundRect(androidx.compose.ui.geometry.RoundRect(Rect(O(mk.x - rx, mk.y - ry), Size(ln.w.toFloat(), ln.h.toFloat())), CornerRadius(1.6f)))
        "dome" -> {
            shape.moveTo((mk.x - rx).toFloat(), (mk.y + ry * 0.6).toFloat())
            shape.arcTo(Rect(O(mk.x - rx, mk.y + ry * 0.6 - ry * 1.4), Size(ln.w.toFloat(), (ry * 2.8).toFloat())), 180f, 180f, false)
            shape.close()
        }
        else -> shape.addOval(Rect(O(mk.x - rx, mk.y - ry), Size(ln.w.toFloat(), ln.h.toFloat())))
    }
    if (fill != null) drawPath(shape, fill.copy(alpha = fill.alpha * a)) else if (brush != null) drawPath(shape, brush, alpha = a)
    drawPath(shape, stroke.copy(alpha = stroke.alpha * a), style = Stroke(sw, join = StrokeJoin.Round))
}

private fun DrawScope.marker(tm: TextMeasurer, mk: D.Mk, l: LightStatus, isSel: Boolean, t: Float) {
    val c = lightCol(l.color)
    val ln = D.lensFor(mk.id)
    val rx = ln.w / 2; val ry = ln.h / 2
    val ld = D.leader(mk)
    val bright = if (l.lit) D.glowAlpha(l.level).toFloat() else 0f
    val flashing = l.lit && l.flash != null
    val c0 = O(mk.x, mk.y)

    // light spilling over the skin around the fixture
    if (l.lit) {
        val r = D.glowRadius(l.level).toFloat()
        val ga = if (flashing) bright + (0.05f - bright) * t else bright
        drawCircle(
            Brush.radialGradient(0f to c.copy(alpha = 0.95f), 0.35f to c.copy(alpha = 0.45f), 1f to c.copy(alpha = 0f), center = c0, radius = r),
            r, c0, alpha = ga.coerceIn(0f, 1f), blendMode = BlendMode.Screen,
        )
    }
    if (mk.hidden) {
        drawOval(Color(0xFF8A95A0).copy(alpha = 0.85f), O(mk.x - rx - 4, mk.y - ry - 4), Size((2 * (rx + 4)).toFloat(), (2 * (ry + 4)).toFloat()),
            style = Stroke(1.2f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(3f, 2.5f))))
    }
    // leader line + number badge
    drawLine(Color(0xFF9AA5B0).copy(alpha = 0.75f), O(ld.sx, ld.sy), O(ld.ex, ld.ey), strokeWidth = 0.9f)

    // bezel + lens (only the lens group flashes, not the number)
    val a = if (flashing) 1f + (0.2f - 1f) * t else 1f
    lensBody(ln, mk, Color(0xFF0B0E11), null, Color(0xFFAAB4BE), 3f, a)
    if (l.lit) lensBody(ln, mk, c, null, Color.White, 0.8f, a)
    else {
        val glass = Brush.radialGradient(
            0f to Color(0xFF4A545E), 1f to Color(0xFF14181C),
            center = O(mk.x - rx + ln.w * 0.35, mk.y - ry + ln.h * 0.30), radius = (0.8 * maxOf(ln.w, ln.h)).toFloat(),
        )
        lensBody(ln, mk, null, glass, Color(0xFF5A6672), 0.8f, a)
    }
    if (l.lit) {
        drawOval(Color.White.copy(alpha = ((0.55 + 0.4 * l.level) * a).toFloat().coerceIn(0f, 1f)), O(mk.x - rx * 0.45, mk.y - ry * 0.45), Size((rx * 0.9).toFloat(), (ry * 0.9).toFloat()))
    } else {
        drawOval(Color.White.copy(alpha = 0.35f * a), O(mk.x - rx * 0.3 - rx * 0.3, mk.y - ry * 0.35 - ry * 0.22), Size((rx * 0.6).toFloat(), (ry * 0.44).toFloat()))
    }
    if (isSel) drawCircle(Color.White, (maxOf(rx, ry) + 6).toFloat(), c0, style = Stroke(1.8f))
    val bc = O(ld.lx, ld.ly)
    drawCircle(SkinBg, 9.5f, bc)
    drawCircle(if (isSel) Color.White else Color(0xFF9AA5B0), 9.5f, bc, style = Stroke(if (isSel) 1.8f else 1f))
    val lay = tm.measure(mk.n.toString(), TextStyle(color = Color(0xFFF2F4F6), fontSize = 12.toFloat().toSp(), fontWeight = FontWeight.Bold))
    drawText(lay, topLeft = Offset(bc.x - lay.size.width / 2f, bc.y + 0.5f - lay.size.height / 2f))
}
