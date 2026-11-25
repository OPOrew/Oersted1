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
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.oersted.trainer.sim.NavAutopilotDiagramRules as D
import com.oersted.trainer.sim.NavAutopilotDiagramRules.St
import com.oersted.trainer.sim.SvgLines
import com.oersted.trainer.ui.common.Classic737Palette
import kotlin.math.atan2

/**
 * Port of NavAutopilotDiagram.tsx (ATA 34 navigation + ATA 22 autopilot / flight director component flow). The state of every node, chip and line is
 * [D.build]; this file only paints it in the web's 880 x 626 viewBox: dashed "nad-flow" lines animate, failed lines are dotted, dimmed items fade.
 */
private fun col(l: Long) = Color(l)
private fun stColor(st: St) = col(D.colorOf(st))
private fun o(x: Number, y: Number) = Offset(x.toFloat(), y.toFloat())

private fun DrawScope.mono(tm: TextMeasurer, text: String, x: Double, baseline: Double, size: Double, color: Color, bold: Boolean = false, middle: Boolean = false, spacing: Double = 0.0) {
    val lay = tm.measure(text, TextStyle(color = color, fontSize = size.toFloat().toSp(), fontFamily = FontFamily.Monospace, fontWeight = if (bold) FontWeight.SemiBold else FontWeight.Normal, letterSpacing = spacing.toFloat().toSp()))
    val left = if (middle) x.toFloat() - lay.size.width / 2f else x.toFloat()
    drawText(lay, topLeft = Offset(left, baseline.toFloat() - lay.firstBaseline))
}

private fun DrawScope.edge(e: D.EdgeV, flow: State<Float>) {
    val pts = SvgLines.parse(e.d).first()
    val path = Path().apply { pts.forEachIndexed { i, p -> if (i == 0) moveTo(p.first.toFloat(), p.second.toFloat()) else lineTo(p.first.toFloat(), p.second.toFloat()) } }
    val a = if (e.dim) 0.2f else 1f
    drawPath(path, Color(0xFF0B0E12).copy(alpha = a), style = Stroke(5f, join = StrokeJoin.Round))
    val c = stColor(e.st).copy(alpha = a)
    val fx = when (e.st) {
        St.OK -> PathEffect.dashPathEffect(floatArrayOf(5f, 4f), 18f - flow.value) // nad-flow: dashoffset 0 -> -18 over .8 s
        St.FAIL -> PathEffect.dashPathEffect(floatArrayOf(2f, 4f), 0f)
        else -> null
    }
    drawPath(path, c, style = Stroke(2f, join = StrokeJoin.Round, pathEffect = fx))
    // marker-end arrow (viewBox 0 0 8 8, refX 7 refY 4, markerWidth 6 in stroke-width units = scale 1.5), oriented along the last segment
    val (px, py) = pts[pts.size - 2]; val (qx, qy) = pts.last()
    val ang = Math.toDegrees(atan2(qy - py, qx - px)).toFloat()
    withTransform({ translate(qx.toFloat(), qy.toFloat()); rotate(ang, Offset.Zero) }) {
        drawPath(Path().apply { moveTo(-10.5f, -6f); lineTo(1.5f, 0f); lineTo(-10.5f, 6f); close() }, c)
    }
}

private fun DrawScope.chip(tm: TextMeasurer, c: D.Chip, alpha: Float) {
    val cc = stColor(c.st).copy(alpha = alpha)
    drawRoundRect(Color(0xFF0B0E12).copy(alpha = alpha), o(c.x, c.y), Size(c.w.toFloat(), 18f), CornerRadius(3f))
    drawRoundRect(cc, o(c.x, c.y), Size(c.w.toFloat(), 18f), CornerRadius(3f), style = Stroke(1.2f))
    mono(tm, c.label, c.x + c.w / 2.0, c.y + 12.5, 9.5, cc, middle = true)
}

private fun DrawScope.node(tm: TextMeasurer, n: D.NodeV) {
    val b = n.box
    val a = if (n.dim) 0.3f else 1f
    val c = stColor(n.st).copy(alpha = a)
    drawRoundRect(col(D.BOX).copy(alpha = a), o(b.x, b.y), Size(b.w.toFloat(), b.h.toFloat()), CornerRadius(5f))
    drawRoundRect(c, o(b.x, b.y), Size(b.w.toFloat(), b.h.toFloat()), CornerRadius(5f), style = Stroke(1.6f))
    drawCircle(c, 3.5f, o(b.x + b.w - 9, b.y + 9))
    mono(tm, n.title, b.x + 8.0, b.y + 15.0, 10.5, Color(0xFFE6E1D2).copy(alpha = a), bold = true)
    n.lines.forEachIndexed { i, t -> mono(tm, t, b.x + 8.0, b.y + 29.0 + i * 13, 9.5, col(D.TXT).copy(alpha = a)) }
    n.chips.forEach { chip(tm, it, a) }
    n.texts.forEach { mono(tm, it.text, it.x.toDouble(), it.y.toDouble(), it.size, col(it.color).copy(alpha = a), bold = it.bold) }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun NavAutopilotDiagram(cockpit: CockpitModel, focus: String?, modifier: Modifier = Modifier) {
    val s by cockpit.simState.collectAsState()
    val d by cockpit.derived.collectAsState()
    val m by cockpit.mipState.collectAsState()
    val model = D.build(s, d, m, focus)
    val tm = rememberTextMeasurer()
    val flow = rememberInfiniteTransition(label = "nad").animateFloat(0f, 18f, infiniteRepeatable(tween(800, easing = LinearEasing), RepeatMode.Restart), label = "flow")
    val border = Color(0xFF30353B)
    Column(modifier.fillMaxWidth().padding(top = 8.dp).background(Color(0xFF0A0C0F), RoundedCornerShape(4.dp)).border(1.dp, border, RoundedCornerShape(4.dp)).padding(6.dp)) {
        FlowRow(Modifier.fillMaxWidth().padding(bottom = 4.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("COMPONENT FLOW · ${D.title(focus).uppercase()}", color = Classic737Palette.Subtle, fontSize = 9.sp, letterSpacing = 0.14.em)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                for ((st, l) in listOf(St.OK to "Live", St.IDLE to "Idle / off", St.WARN to "Degraded", St.FAIL to "Failed / lost")) {
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.width(12.dp).height(2.dp).background(stColor(st)))
                        Text(l.uppercase(), color = stColor(st), fontFamily = FontFamily.Monospace, fontSize = 8.sp)
                    }
                }
            }
        }
        ZoomableFlow(Modifier.fillMaxWidth()) {
        Canvas(Modifier.fillMaxWidth().aspectRatio(D.VBW.toFloat() / D.VBH)) {
            val sc = size.width / D.VBW
            withTransform({ scale(sc, sc, Offset.Zero) }) {
                for ((x, t) in listOf(10 to "SENSORS / POWER", 185 to "SELECTORS", 350 to "SIDE SOURCES", 520 to "FD / AUTOPILOT", 720 to "INSTRUMENTS · SURFACES"))
                    mono(tm, t, x.toDouble(), 8.0, 8.5, Color(0xFF7D7A6C), spacing = 1.2)
                model.edges.forEach { edge(it, flow) }
                model.nodes.forEach { node(tm, it) }
            }
        }
        }
        Text(
            "The FD-108 and SP-77 run from the captain's selected sources. The SP-77 AIL / ELEV engage switches hold only while DC power, hydraulic B, valid ATT and valid HDG are all present; " +
                "if one is lost the switches drop out and the A/P warning flashes. VOR LOC / AUTO APP need a valid signal from the tuned station. The attitude model closes the loop: " +
                "servo commands move the airplane, whose attitude and position feed the instruments and the radio geometry.",
            color = Classic737Palette.Subtle, fontSize = 8.sp, lineHeight = 10.sp, modifier = Modifier.padding(top = 4.dp),
        )
    }
}
