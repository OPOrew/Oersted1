package com.oersted.trainer.ui.instruments

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.BiasAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.oersted.trainer.sim.SixPackGaugeRules as G
import kotlin.math.sign

/**
 * Port of the gauges in components/panel/SixPack.tsx (737-200 steam-gauge six-pack: dark faces, white markings, yellow / white pointers),
 * drawn in the web's 200 x 200 view box. Pointers ease over 100-120 ms like the web's CSS transitions. Maths in sim/SixPackGaugeRules.kt.
 */
private val FACE = Color(0xFF0B0C0E)
private val TEXT = Color(0xFFF2F2F2)
private val MUTED = Color(0xFF9AA4AD)
private val AMBER = Color(0xFFFFD23A)
private val RED = Color(0xFFFF4D4D)

/** web Gauge: square, round, `border-[#5b6168] bg-[#0b0c0e]`, optional FLAG chip at 14 % from the bottom. */
@Composable
private fun Gauge(fault: Boolean, modifier: Modifier, content: @Composable () -> Unit) {
    Box(modifier.fillMaxWidth().aspectRatio(1f).clip(CircleShape).background(FACE).border(1.dp, Color(0xFF5B6168), CircleShape)) {
        content()
        if (fault) {
            Box(Modifier.align(BiasAlignment(0f, 0.72f))) {
                Text(
                    "FLAG", color = Color(0xFFFCA5A5), fontFamily = FontFamily.Monospace, fontSize = 7.sp,
                    modifier = Modifier.background(Color(0xCC450A0A), RoundedCornerShape(4.dp)).border(1.dp, Color(0x99EF4444), RoundedCornerShape(4.dp)).padding(horizontal = 6.dp, vertical = 2.dp),
                )
            }
        }
    }
}

private fun DrawScope.face() = fCircle(100f, 100f, 96f, FACE)
private fun DrawScope.hub() = fCircle(100f, 100f, 6f, Color(0xFF23282D), Color(0xFF555D64), 1f)

private fun DrawScope.tick(a: Double, r1: Double, r2: Double, w: Double = 1.0, color: Color = TEXT) =
    fLine(pol(100f, 100f, r1.toFloat(), a), pol(100f, 100f, r2.toFloat(), a), color, w.toFloat())

private fun DrawScope.label(r: Double, a: Double, size: Float, text: String, rotate: Boolean = false) {
    val p = pol(100f, 100f, r.toFloat(), a)
    if (rotate) fRotate(a.toFloat(), p.x, p.y) { fText(text, p.x, p.y, size, TEXT) } else fText(text, p.x, p.y, size, TEXT)
}

private fun DrawScope.arc(r: Float, a1: Double, a2: Double, color: Color, w: Float) {
    drawArc(color, (a1 - 90).toFloat(), (a2 - a1).toFloat(), false, Offset(100f - r, 100f - r), Size(2 * r, 2 * r), style = Stroke(w))
}

/** web Pointer: tapered polygon rotated about the dial centre. */
private fun DrawScope.pointer(deg: Float, len: Double, w: Double = 3.0, color: Color = TEXT, tail: Double = 14.0) {
    fRotate(deg, 100f, 100f) {
        fPoly(100f, (100 - len).toFloat(), (100 - w).toFloat(), 100f, (100 - w * 0.6).toFloat(), (100 + tail).toFloat(), (100 + w * 0.6).toFloat(), (100 + tail).toFloat(), (100 + w).toFloat(), 100f, fill = color)
    }
}

@Composable
private fun ease(v: Double, ms: Int = 120): Float {
    val a by animateFloatAsState(v.toFloat(), tween(ms, easing = LinearEasing), label = "sixpack")
    return a
}

@Composable
fun SixPackAirspeed(iasKt: Double, pitotOk: Boolean, modifier: Modifier = Modifier) {
    val deg = ease(G.airspeedPointer(iasKt))
    Gauge(!pitotOk, modifier) {
        FaceCanvas(200f, 200f, Modifier.fillMaxSize()) {
            face()
            for (i in 0..40) { val k = i * 10; tick(G.airspeedAngle(k.toDouble()), if (k % 50 != 0) 88.0 else 80.0, 94.0, if (k % 50 != 0) 1.0 else 2.0) }
            arc(91f, G.airspeedAngle(340.0), G.airspeedAngle(400.0), RED, 4f)
            for (i in 0..8) label(66.0, G.airspeedAngle(i * 50.0), 13f, (i * 50).toString())
            fText("KNOTS", 100f, 62f, 8f, MUTED, mono = true, central = false)
            fRect(76f, 128f, 48f, 18f, Color.Black, Color(0xFF4A525A), 1f, 2f)
            fText(G.iasText(iasKt), 100f, 138f, 13f, TEXT, mono = true)
            pointer(deg, 84.0, color = AMBER)
            hub()
        }
    }
}

@Composable
fun SixPackAttitude(roll: Double, pitch: Double, modifier: Modifier = Modifier) {
    val r = ease(roll, 100)
    val p = ease(pitch, 100)
    Gauge(false, modifier) {
        FaceCanvas(200f, 200f, Modifier.fillMaxSize()) {
            fCircle(100f, 100f, 96f, Color(0xFF5B656C))
            fClipCircle(100f, 100f, 92f) {
                // sky / ground sphere: rotate(-roll) translateY(pitch * 3) about the centre
                withTransformDeg(-r, p * 3f) {
                    fRect(-200f, -400f, 600f, 500f, Color(0xFF2A9FD0))
                    fRect(-200f, 100f, 600f, 500f, Color(0xFF14171A))
                    fLine(-200f, 100f, 400f, 100f, Color.White, 2.5f)
                    for (m in G.PITCH_MARKS) {
                        val y = G.ladderY(m).toFloat(); val w = G.ladderHalfWidth(m).toFloat()
                        fLine(100f - w, y, 100f + w, y, Color.White, 1.5f)
                        if (G.ladderLabelled(m)) fText(kotlin.math.abs(m).toString(), 100f + w + 7f, y, 9f, Color.White, anchor = TextAnchor.START, mono = true)
                    }
                    for (m in G.PITCH_TICKS) { val y = G.ladderY(m).toFloat(); fLine(92f, y, 108f, y, Color.White, 1f) }
                }
            }
            // roll scale moves with the bank
            fRotate(-r, 100f, 100f) {
                for (a in G.ROLL_MARKS) tick(a.toDouble(), G.rollTickInner(a), 92.0, G.rollTickWidth(a), Color.White)
                fPoly(100f, 88f, 94f, 78f, 106f, 78f, fill = Color.White)
            }
            fPoly(100f, 16f, 94f, 7f, 106f, 7f, fill = AMBER)
            // fixed aircraft symbol
            val sym = Path().apply { moveTo(42f, 100f); lineTo(78f, 100f); lineTo(86f, 109f); moveTo(158f, 100f); lineTo(122f, 100f); lineTo(114f, 109f) }
            drawPath(sym, AMBER, style = Stroke(4.5f, cap = StrokeCap.Round, join = StrokeJoin.Round))
            fCircle(100f, 100f, 4.5f, AMBER, Color(0xFF3A2A00), 0.8f)
        }
    }
}

private inline fun DrawScope.withTransformDeg(rotDeg: Float, dy: Float, block: DrawScope.() -> Unit) {
    androidx.compose.ui.graphics.drawscope.withTransform({ rotate(rotDeg, Offset(100f, 100f)); translate(0f, dy) }) { block() }
}

@Composable
fun SixPackAltimeter(altFt: Double, staticOk: Boolean, modifier: Modifier = Modifier) {
    val ten = ease(G.altTenKDeg(altFt)); val hun = ease(G.altHundredsDeg(altFt))
    Gauge(!staticOk, modifier) {
        FaceCanvas(200f, 200f, Modifier.fillMaxSize()) {
            face()
            for (i in 0..49) tick(i * 7.2, if (i % 5 != 0) 88.0 else 80.0, 94.0, if (i % 5 != 0) 1.0 else 2.0)
            for (i in 0..9) label(66.0, i * 36.0, 15f, i.toString())
            fText("ALT", 100f, 52f, 8f, MUTED, mono = true, central = false)
            fRect(112f, 84f, 50f, 16f, Color.Black, Color(0xFF999999), 1f)
            fText(G.altText(altFt), 137f, 92f, 11f, TEXT, mono = true)
            fText("FT · BARO", 100f, 150f, 7f, MUTED, mono = true, central = false)
            pointer(ten, 50.0, 4.5)
            pointer(hun, 84.0, 3.0)
            hub()
        }
    }
}

@Composable
fun SixPackVerticalSpeed(vsiFpm: Double, staticOk: Boolean, modifier: Modifier = Modifier) {
    val deg = ease(G.vsPointer(vsiFpm))
    Gauge(!staticOk, modifier) {
        FaceCanvas(200f, 200f, Modifier.fillMaxSize()) {
            face()
            for (f in G.VS_MARKS) for (g in (if (f == 0) listOf(1) else listOf(1, -1))) {
                val a = G.vsAngle((f * g).toDouble())
                val big = G.vsBig(f)
                tick(a, if (big) 78.0 else 84.0, 94.0, 2.0)
                if (big) label(66.0, a, 11f, G.vsLabel(f))
            }
            fText("UP", 100f, 58f, 8f, TEXT, mono = true, central = false)
            fText("DOWN", 100f, 146f, 8f, TEXT, mono = true, central = false)
            fText("1000 FT/MIN", 100f, 160f, 7f, MUTED, mono = true, central = false)
            fText(G.vsText(vsiFpm), 140f, 112f, 10f, TEXT, mono = true, central = false)
            pointer(deg, 84.0)
            hub()
        }
    }
}

@Composable
fun SixPackHeading(heading: Double, modifier: Modifier = Modifier) {
    val hdg = G.normHeading(heading)
    val card = ease(-hdg)
    Gauge(false, modifier) {
        FaceCanvas(200f, 200f, Modifier.fillMaxSize()) {
            face()
            fRotate(card, 100f, 100f) {
                for (i in 0..71) { val d = i * 5; tick(d.toDouble(), if (d % 10 != 0) 86.0 else 80.0, 92.0, if (d % 10 != 0) 1.0 else 1.5) }
                for (i in 0..11) label(67.0, i * 30.0, 13f, G.headingLabel(i * 30), rotate = true)
            }
            fPoly(100f, 18f, 95f, 6f, 105f, 6f, fill = AMBER)
            fLine(100f, 74f, 100f, 130f, TEXT, 4f); fLine(80f, 104f, 120f, 104f, TEXT, 4f); fLine(92f, 126f, 108f, 126f, TEXT, 4f)
            fRect(78f, 136f, 44f, 16f, Color.Black, Color(0xFF4A525A), 1f, 2f)
            fText(G.headingText(heading), 100f, 144f, 11f, TEXT, mono = true)
        }
    }
}

@Composable
fun SixPackTurnSlip(yawRate: Double, modifier: Modifier = Modifier) {
    val needle = ease(G.turnNeedle(yawRate)); val ball = ease(G.turnBall(yawRate))
    Gauge(false, modifier) {
        FaceCanvas(200f, 200f, Modifier.fillMaxSize()) {
            face()
            for (a in listOf(-20, -10, 0, 10, 20)) tick(a * 3.0, 62.0, 80.0, if (a != 0) 2.0 else 3.0)
            label(70.0, -90.0, 10f, "L"); label(70.0, 90.0, 10f, "R")
            fText("2 MIN", 100f, 52f, 9f, TEXT, mono = true, central = false)
            fRotate(needle, 100f, 100f) {
                fPoly(100f, 100f, 98f, 50f, 102f, 50f, fill = AMBER)
                fLine(62f, 100f, 138f, 100f, AMBER, 4f)
                fCircle(100f, 100f, 6f, AMBER)
            }
            fRect(55f, 132f, 90f, 18f, Color(0xFF050709), Color(0xFF777777), 1f, 9f)
            fLine(94f, 132f, 94f, 150f, Color(0xFFAAAAAA), 1f); fLine(106f, 132f, 106f, 150f, Color(0xFFAAAAAA), 1f)
            fCircle(100f + ball, 141f, 7f, Color(0xFFE8E8E8))
        }
    }
}
