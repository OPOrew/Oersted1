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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import com.oersted.trainer.sim.PitotSchematicRules as R
import com.oersted.trainer.sim.PitotStatic
import com.oersted.trainer.sim.SimState
import com.oersted.trainer.sim.SvgLines
import kotlin.math.cos
import kotlin.math.sin

/**
 * Port of PitotStaticSchematic (components/panel/PitotStaticDiagram.tsx): 640x410 plumbing drawing from the four probes through
 * the source selectors to the CAPT / F-O ASI, altimeter and VSI miniatures, with live line colours, flowing dashes, probe halos,
 * RBF covers, flag chips and the legend. The logic is in sim/PitotSchematicRules.kt and sim/SvgLines.kt (tested).
 * The CSS animations (flow 0.8 s / 2.4 s, pulse 1.3 s) are InfiniteTransitions read in the draw phase. Compose only; verify on a device.
 */
private val TXT = Color(0xFFAAB3BC)
private val DIM = Color(0xFF6E7D8A)
private val PRED = Color(0xFFFF9C9C)

private fun c(v: Long) = Color(v)

private class Ctx(val ds: DrawScope, val k: Float, val tm: TextMeasurer, val fast: Float, val slow: Float, val pulse: Float)

private fun Ctx.o(x: Number, y: Number) = Offset(x.toFloat() * k, y.toFloat() * k)

/** SVG text: [y] is the baseline; anchor 0 = start, 1 = middle, 2 = end. */
private fun Ctx.t(text: String, x: Number, y: Number, size: Float, color: Color, anchor: Int = 0, bold: Boolean = false, spacing: Float = 0f) {
    with(ds) {
        val style = TextStyle(color = color, fontSize = (size * k).toSp(), fontFamily = FontFamily.Monospace, fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal, letterSpacing = (spacing * k).toSp())
        val lay = tm.measure(text, style)
        val left = x.toFloat() * k - (if (anchor == 1) lay.size.width / 2f else if (anchor == 2) lay.size.width.toFloat() else 0f)
        drawText(lay, topLeft = Offset(left, y.toFloat() * k - lay.firstBaseline))
    }
}

private fun Ctx.line(d: String, color: Long, flow: R.Flow = R.Flow.NONE, dim: Boolean = false) {
    val alpha = if (dim) 0.35f else 1f
    val path = Path()
    for (sub in SvgLines.parse(d)) {
        sub.forEachIndexed { i, p -> if (i == 0) path.moveTo(p.first.toFloat() * k, p.second.toFloat() * k) else path.lineTo(p.first.toFloat() * k, p.second.toFloat() * k) }
    }
    ds.drawPath(path, Color(0xFF10151A).copy(alpha = alpha), style = Stroke(5f * k, join = StrokeJoin.Round))
    val effect = when (flow) {
        R.Flow.FAST -> PathEffect.dashPathEffect(floatArrayOf(5f * k, 4f * k), (1f - fast) * 18f * k)
        R.Flow.SLOW -> PathEffect.dashPathEffect(floatArrayOf(5f * k, 4f * k), (1f - slow) * 18f * k)
        R.Flow.NONE -> if (dim) PathEffect.dashPathEffect(floatArrayOf(3f * k, 4f * k)) else null
    }
    ds.drawPath(path, c(color).copy(alpha = alpha), style = Stroke(2.4f * k, join = StrokeJoin.Round, pathEffect = effect))
}

private fun Ctx.probe(cx: Int, cy: Int, tag: String, st: R.PState, heated: Boolean, staticBlocked: Boolean, alignLeft: Boolean) {
    val fill = if (st == R.PState.OK) c(R.GREEN) else if (st == R.PState.ICE) c(R.ICE) else c(R.RED)
    if (heated) ds.drawCircle(Color(0xFFFF9D3A).copy(alpha = pulse), 14f * k, o(cx, cy))
    ds.drawCircle(Color(0xFF12161B), 7f * k, o(cx, cy))
    ds.drawCircle(Color(0xFFD2D7DC), 7f * k, o(cx, cy), style = Stroke(1f * k))
    ds.drawCircle(fill, 3.4f * k, o(cx, cy))
    if (st == R.PState.ICE) ds.drawCircle(c(R.ICE).copy(alpha = 0.9f), 9.5f * k, o(cx, cy), style = Stroke(2.6f * k))
    if (st == R.PState.COVER) {
        ds.drawRoundRect(c(R.RED).copy(alpha = 0.85f), o(cx - 8, cy - 8), Size(16f * k, 16f * k), CornerRadius(2f * k))
        t("RBF", cx, cy + 3, 7f, Color.White, 1)
    }
    if (st == R.PState.BLOCKED) {
        ds.drawLine(c(R.RED), o(cx - 6, cy - 6), o(cx + 6, cy + 6), 2f * k)
        ds.drawLine(c(R.RED), o(cx + 6, cy - 6), o(cx - 6, cy + 6), 2f * k)
    }
    if (staticBlocked) ds.drawCircle(c(R.RED), 2.6f * k, o(cx, cy + 11))
    t(tag, if (alignLeft) cx + 12 else cx - 12, cy + 3, 7.5f, TXT, if (alignLeft) 0 else 2)
}

private fun Ctx.valve(cx: Int, cy: Int, label: String, alt: Boolean) {
    ds.drawRoundRect(Color(0xFF14181D), o(cx - 30, cy - 12), Size(60f * k, 26f * k), CornerRadius(3f * k))
    ds.drawRoundRect(if (alt) c(R.AMBER) else Color(0xFF39434D), o(cx - 30, cy - 12), Size(60f * k, 26f * k), CornerRadius(3f * k), style = Stroke(1.2f * k))
    t(label, cx, cy - 2, 6.5f, TXT, 1)
    t(if (alt) "ALTERNATE" else "NORMAL", cx, cy + 9, 8f, if (alt) c(R.AMBER) else c(R.GREEN), 1, bold = true)
}

private fun Ctx.mini(cx: Int, cy: Int, kind: R.Kind, data: PitotStatic.SideAirData) {
    val rr = 24f
    val m = R.mini(kind, data)
    ds.drawCircle(Color(0xFF07090C), rr * k, o(cx, cy))
    ds.drawCircle(if (m.fault) c(R.RED) else Color(0xFF39414A), rr * k, o(cx, cy), style = Stroke(1.6f * k))
    for (a in R.tickAngles(kind)) {
        val r = R.rad(a)
        ds.drawLine(Color(0xFF5B6670), o(cx + cos(r) * (rr - 5), cy + sin(r) * (rr - 5)), o(cx + cos(r) * (rr - 1), cy + sin(r) * (rr - 1)), 1f * k)
    }
    t(kind.name, cx, cy - 8, 6f, TXT, 1)
    val (tx, ty) = R.needleTip(m.angleDeg, rr.toDouble())
    ds.drawLine(Color(0xFFF5F7FA), o(cx, cy), o(cx + tx, cy + ty), 2f * k, StrokeCap.Round)
    ds.drawCircle(Color(0xFFF5F7FA), 2.2f * k, o(cx, cy))
    if (m.fault) {
        ds.drawRoundRect(Color(0xFF3A0D0D), o(cx - 11, cy + 6), Size(22f * k, 9f * k), CornerRadius(1.5f * k))
        ds.drawRoundRect(c(R.RED), o(cx - 11, cy + 6), Size(22f * k, 9f * k), CornerRadius(1.5f * k), style = Stroke(0.8f * k))
        t("FLAG", cx, cy + 13, 6f, PRED, 1)
    }
    t(m.readout, cx, cy + rr + 11, 7.5f, if (m.fault) PRED else Color(0xFFCFE0EE), 1)
}

private fun Ctx.chip(x: Int, y: Int, label: String, ok: Boolean, w: Float = 92f) {
    ds.drawRoundRect(Color(0xFF14181D), o(x, y), Size(w * k, 16f * k), CornerRadius(3f * k))
    ds.drawRoundRect(if (ok) Color(0xFF2F5A43) else c(R.RED), o(x, y), Size(w * k, 16f * k), CornerRadius(3f * k), style = Stroke(1f * k))
    ds.drawCircle(if (ok) c(R.GREEN) else c(R.RED), 3f * k, o(x + 8, y + 8))
    t(label, x + 15, y + 11, 7f, TXT)
}

private fun Ctx.legend(x: Int, y: Int, color: Long, text: String, dash: Boolean = false) {
    ds.drawLine(c(color), o(x, y), o(x + 16, y), 2.4f * k, pathEffect = if (dash) PathEffect.dashPathEffect(floatArrayOf(4f * k, 3f * k)) else null)
    t(text, x + 21, y + 3, 7f, TXT)
}

private fun Ctx.flags(x: Int, y: Int, flags: List<String>) {
    R.flagChips(flags).forEachIndexed { i, f ->
        val yy = y + i * 14
        ds.drawRoundRect(Color(0xFF14181D), o(x - f.width / 2, yy), Size(f.width.toFloat() * k, 12f * k), CornerRadius(2f * k))
        ds.drawRoundRect(c(f.color), o(x - f.width / 2, yy), Size(f.width.toFloat() * k, 12f * k), CornerRadius(2f * k), style = Stroke(0.9f * k))
        t(f.text, x, yy + 8.5, 6.5f, c(f.color), 1)
    }
}

@Composable
fun PitotStaticSchematicView(air: PitotStatic.AirData, s: SimState, dc: Boolean, captData: PitotStatic.SideAirData, foData: PitotStatic.SideAirData) {
    val tm = rememberTextMeasurer()
    val tr = rememberInfiniteTransition(label = "psd")
    val fast = tr.animateFloat(0f, 1f, infiniteRepeatable(tween(800, easing = LinearEasing)), label = "fast")
    val slow = tr.animateFloat(0f, 1f, infiniteRepeatable(tween(2400, easing = LinearEasing)), label = "slow")
    val pulse = tr.animateFloat(0.35f, 0.9f, infiniteRepeatable(tween(650, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "pulse")

    Canvas(
        Modifier.fillMaxWidth().aspectRatio(640f / 410f)
            .background(Color(0xFF0B0D10), RoundedCornerShape(8.dp)).border(1.dp, Color(0xFF2C323D), RoundedCornerShape(8.dp)),
    ) {
        val x = Ctx(this, size.width / 640f, tm, fast.value, slow.value, pulse.value)
        with(x) {
            val ram = s.psFlightCasKt > 0
            val heatL = captData.probe.heaterOn
            val heatR = foData.probe.heaterOn
            val ul = R.pState(s.psPitotCaptCover, s.psPitotCaptBlocked, captData.probe.iced)
            val ur = R.pState(s.psPitotFoCover, s.psPitotFoBlocked, foData.probe.iced)
            val lr = R.pState(s.psPitotAux1Cover, s.psPitotAux1Blocked, air.aux1.iced)
            val ll = R.pState(s.psPitotAux2Cover, s.psPitotAux2Blocked, air.aux2.iced)
            val captTrapped = R.trapped(s.psStaticCaptL, s.psStaticCaptR, s.psAltStaticCapt)
            val foTrapped = R.trapped(s.psStaticFoL, s.psStaticFoR, s.psAltStaticFo)
            val cOut = R.outColor(s.psAltStaticCapt, captTrapped)
            val fOut = R.outColor(s.psAltStaticFo, foTrapped)

            // nose / probe area
            val nose = Path().apply {
                moveTo(226f * k, 24f * k); cubicTo(226f * k, 8f * k, 244f * k, 4f * k, 320f * k, 4f * k)
                cubicTo(396f * k, 4f * k, 414f * k, 8f * k, 414f * k, 24f * k); lineTo(414f * k, 112f * k)
                cubicTo(414f * k, 120f * k, 404f * k, 124f * k, 320f * k, 124f * k); cubicTo(236f * k, 124f * k, 226f * k, 120f * k, 226f * k, 112f * k); close()
            }
            ds.drawPath(nose, Color(0xFF12161B))
            ds.drawPath(nose, Color(0xFF2D3741), style = Stroke(1f * k))
            t("FORWARD FUSELAGE · PROBES", 320, 16, 7f, DIM, 1, spacing = 1f)

            // pitot lines
            line("M262 43 V22 H14 V275 H36", R.pitotColor(ul), R.pitotFlow(ul, ram))
            line("M378 43 V22 H626 V275 H604", R.pitotColor(ur), R.pitotFlow(ur, ram))

            // static: CAPT = UL + LR
            line("M269 50 H196 V128", R.portColor(s.psStaticCaptL, s.psAltStaticCapt), R.portFlow(s.psStaticCaptL, s.psAltStaticCapt), s.psAltStaticCapt)
            line("M378 102 V128 H120 V138", R.portColor(s.psStaticCaptR, s.psAltStaticCapt), R.portFlow(s.psStaticCaptR, s.psAltStaticCapt), s.psAltStaticCapt)
            ds.drawCircle(c(R.mainColor(s.psStaticCaptL, s.psStaticCaptR, s.psAltStaticCapt)), 2.6f * k, o(196, 128))
            // static: F/O = UR + LL
            line("M371 50 H444 V140", R.portColor(s.psStaticFoR, s.psAltStaticFo), R.portFlow(s.psStaticFoR, s.psAltStaticFo), s.psAltStaticFo)
            line("M262 102 V140 H520 V138", R.portColor(s.psStaticFoL, s.psAltStaticFo), R.portFlow(s.psStaticFoL, s.psAltStaticFo), s.psAltStaticFo)
            ds.drawCircle(c(R.mainColor(s.psStaticFoL, s.psStaticFoR, s.psAltStaticFo)), 2.6f * k, o(444, 140))

            // alternate static ports, station 406
            ds.drawRoundRect(if (s.psAltStaticCapt) c(R.AMBER) else Color(0xFF59636D), o(26, 150), Size(9f * k, 22f * k), CornerRadius(2f * k))
            ds.drawRoundRect(if (s.psAltStaticFo) c(R.AMBER) else Color(0xFF59636D), o(605, 150), Size(9f * k, 22f * k), CornerRadius(2f * k))
            t("ALT STATIC L", 22, 186, 6.5f, TXT); t("STN 406", 22, 195, 6.5f, DIM)
            t("ALT STATIC R", 618, 186, 6.5f, TXT, 2); t("STN 406", 618, 195, 6.5f, DIM, 2)
            line("M35 161 H90", R.AMBER, if (s.psAltStaticCapt) R.Flow.SLOW else R.Flow.NONE, !s.psAltStaticCapt)
            line("M605 161 H550", R.AMBER, if (s.psAltStaticFo) R.Flow.SLOW else R.Flow.NONE, !s.psAltStaticFo)

            // selector valves
            valve(120, 152, "CAPT STATIC SRC", s.psAltStaticCapt)
            valve(520, 152, "F/O STATIC SRC", s.psAltStaticFo)

            // valve outputs to instrument static ports
            line("M120 166 V232", cOut, R.outFlow(captTrapped)); line("M60 232 H180", cOut); line("M60 232 V251 M120 232 V251 M180 232 V251", cOut)
            line("M520 166 V232", fOut, R.outFlow(foTrapped)); line("M460 232 H580", fOut); line("M460 232 V251 M520 232 V251 M580 232 V251", fOut)

            // probes on top of the lines
            probe(262, 50, "CAPT", ul, heatL, s.psStaticCaptL, true)
            probe(378, 50, "F/O", ur, heatR, s.psStaticFoR, false)
            probe(262, 102, "AUX 2", ll, heatL, s.psStaticFoL, true)
            probe(378, 102, "AUX 1", lr, heatR, s.psStaticCaptR, false)

            // instruments
            t("CAPT", 62, 222, 7f, DIM, 1, spacing = 1f); t("F/O", 578, 222, 7f, DIM, 1, spacing = 1f)
            mini(60, 275, R.Kind.ASI, captData); mini(120, 275, R.Kind.ALT, captData); mini(180, 275, R.Kind.VSI, captData)
            mini(580, 275, R.Kind.ASI, foData); mini(520, 275, R.Kind.ALT, foData); mini(460, 275, R.Kind.VSI, foData)

            // centre status
            chip(274, 170, "AUX 1 PITOT · ${if (air.aux1PitotOk) "OK" else "FAULT"}", air.aux1PitotOk)
            chip(274, 190, "AUX 2 PITOT · ${if (air.aux2PitotOk) "OK" else "FAULT"}", air.aux2PitotOk)
            chip(274, 210, "ELEV PITOT L · ${if (air.elevPitotLOk) "OK" else "FAULT"}", air.elevPitotLOk)
            chip(274, 230, "ELEV PITOT R · ${if (air.elevPitotROk) "OK" else "FAULT"}", air.elevPitotROk)
            t("AUX / ELEV PITOT", 320, 262, 6.5f, DIM, 1); t("HEALTH ONLY", 320, 271, 6.5f, DIM, 1)
            if (air.disagree) {
                ds.drawRoundRect(Color(0xFF3A0D0D).copy(alpha = pulse.value), o(244, 290), Size(152f * k, 18f * k), CornerRadius(3f * k))
                ds.drawRoundRect(c(R.RED).copy(alpha = pulse.value), o(244, 290), Size(152f * k, 18f * k), CornerRadius(3f * k), style = Stroke(1f * k))
                t("CAPT / F/O DISAGREE", 320, 302, 7.5f, PRED.copy(alpha = pulse.value), 1)
            }

            // flags under each cluster
            flags(110, 322, captData.flags); flags(530, 322, foData.flags)

            // legend
            legend(14, 396, R.GREEN, "PITOT (RAM)"); legend(118, 396, R.BLUE, "STATIC"); legend(196, 396, R.AMBER, "ALTERNATE")
            legend(290, 396, R.RED, "BLOCKED / TRAPPED"); legend(430, 396, R.ICE, "ICED"); legend(490, 396, R.GREY, "NOT SELECTED", true)
            if (!dc) t("NO DC · INSTRUMENTS UNPOWERED", 626, 399, 6.5f, DIM, 2)
        }
    }
}
