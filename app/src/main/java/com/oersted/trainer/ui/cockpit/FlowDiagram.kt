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
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.oersted.trainer.sim.FlowWires
import com.oersted.trainer.sim.FlowWires.Tone

/**
 * Compose side of the web's measured wire layer (routes/cockpit.tsx: HydraulicNode / HydraulicUserWire / HydraulicReturn /
 * HydWireLayer / useWireGeometry). Every node registers its layout rectangle (the web's `data-hyd` id) in a [FlowGeo]; the router in
 * [FlowWires] turns the rectangles into orthogonal wires which [FlowWireLayer] draws over the diagram, with a moving dash when
 * the wire is live. All sizes are dp, equal to the web's CSS px. Compose only; verify on a device.
 */
internal val FlowAccent = Color(0xFF8BA4B8)
internal val FlowHydA = Color(0xFF5B8FD4)
internal val FlowHydB = Color(0xFF3DD68C)
internal val FlowHydS = Color(0xFFD4A34A)
internal val FlowSubtle = Color(0xFF5C616C)
internal val FlowBorder = Color(0xFF2C323D)
internal val FlowInset = Color(0xFF0E1116)
internal val FlowOk = Color(0xFF3DD68C)
internal val FlowFg = Color(0xFFE7E2D6)

internal fun Tone.color(): Color = when (this) { Tone.A -> FlowHydA; Tone.B -> FlowHydB; Tone.STANDBY -> FlowHydS; Tone.GROUND -> FlowAccent }

/** Measured node rectangles in dp, relative to the diagram root. */
internal class FlowGeo(private val density: Float) {
    var root: LayoutCoordinates? = null
    val nodes = HashMap<String, LayoutCoordinates>()
    var rects by mutableStateOf<Map<String, FlowWires.Rect>>(emptyMap())

    fun refresh() {
        val rc = root ?: return
        if (!rc.isAttached) return
        val m = HashMap<String, FlowWires.Rect>()
        for ((k, c) in nodes) {
            if (!c.isAttached) continue
            val b = rc.localBoundingBoxOf(c, false)
            m[k] = FlowWires.Rect((b.left / density).toDouble(), (b.right / density).toDouble(), (b.top / density).toDouble(), (b.bottom / density).toDouble())
        }
        if (m != rects) rects = m
    }
}

internal fun Modifier.flowId(geo: FlowGeo, id: String?): Modifier =
    if (id == null) this else this.onGloballyPositioned { geo.nodes[id] = it; geo.refresh() }

@Composable
internal fun FlowRoot(modifier: Modifier = Modifier, wires: (Map<String, FlowWires.Rect>) -> List<FlowWires.Wire>, content: @Composable (FlowGeo) -> Unit) {
    val density = LocalDensity.current.density
    val geo = remember(density) { FlowGeo(density) }
    // The web grid keeps its desktop proportions on a phone (the page scrolls sideways); squeezing it makes labels wrap per letter,
    // so below FLOW_MIN_W the diagram keeps that width and scrolls horizontally. ZoomableFlow adds the − / FIT / + zoom and pinch.
    ZoomableFlow(modifier, minNaturalWidth = FLOW_MIN_W) {
        Box(Modifier.fillMaxWidth().onGloballyPositioned { geo.root = it; geo.refresh() }) {
            content(geo)
            FlowWireLayer(wires(geo.rects), Modifier.matchParentSize())
        }
    }
}

private val FLOW_MIN_W: Dp = 680.dp

@Composable
internal fun FlowIcon(name: String?, color: Color, size: Dp) {
    val paths = remember(name) { (FlowIcons.paths[name] ?: emptyList()).map { PathParser().parsePathString(it).toPath() } }
    Canvas(Modifier.size(size)) {
        val sc = this.size.width / 24f
        withTransform({ scale(sc, sc, Offset.Zero) }) {
            for (p in paths) drawPath(p, color, style = Stroke(1.5f, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
    }
}

private fun Modifier.tinted(c: Color, active: Boolean, border: Float, fill: Float, shape: RoundedCornerShape): Modifier =
    if (active) this.background(c.copy(alpha = fill), shape).border(1.dp, c.copy(alpha = border), shape)
    else this.background(FlowInset, shape).border(1.dp, FlowBorder, shape)

/** web HydraulicNode. */
@Composable
internal fun FlowNode(
    geo: FlowGeo, id: String?, icon: String?, title: String, active: Boolean, tone: Tone = Tone.A, subtitle: String? = null,
    compact: Boolean = false, minimal: Boolean = false, liveText: String = "PRESSURIZED", offText: String = "OFF", modifier: Modifier = Modifier,
) {
    val c = tone.color()
    val fg = if (active) c else FlowSubtle
    val shape = RoundedCornerShape(8.dp)
    Column(
        modifier.flowId(geo, id).tinted(c, active, 0.6f, 0.10f, shape)
            .padding(horizontal = if (compact) 6.dp else 8.dp, vertical = if (compact) 6.dp else 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (icon != null) FlowIcon(icon, fg, if (compact) 16.dp else 20.dp)
        Text(
            title.uppercase(), color = fg, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center,
            fontSize = if (compact) (if (minimal) 7.sp else 8.sp) else 9.sp, letterSpacing = if (compact) (if (minimal) 0.02.em else 0.08.em) else 0.12.em,
            lineHeight = if (compact) 9.sp else 11.sp,
        )
        if (!minimal && subtitle != null) Text(subtitle.uppercase(), color = fg.copy(alpha = 0.8f), textAlign = TextAlign.Center, fontSize = if (compact) 6.sp else 7.sp, lineHeight = if (compact) 8.sp else 9.sp, modifier = Modifier.padding(top = if (compact) 2.dp else 4.dp))
        if (!minimal) Text((if (active) liveText else offText).uppercase(), color = fg, fontFamily = FontFamily.Monospace, textAlign = TextAlign.Center, fontSize = if (compact) 6.sp else 7.sp, modifier = Modifier.padding(top = if (compact) 2.dp else 4.dp))
    }
}

/** web HydraulicReturn. */
@Composable
internal fun FlowReturn(geo: FlowGeo, id: String?, icon: String?, title: String, subtitle: String, active: Boolean, tone: Tone, modifier: Modifier = Modifier) {
    val c = tone.color()
    val fg = if (active) c else FlowSubtle
    Column(modifier.flowId(geo, id).tinted(c, active, 0.5f, 0.05f, RoundedCornerShape(8.dp)).padding(6.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        if (icon != null) FlowIcon(icon, fg, 16.dp)
        Text(title.uppercase(), color = fg, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center, fontSize = 7.sp, letterSpacing = 0.1.em, lineHeight = 9.sp)
        Text(subtitle.uppercase(), color = fg.copy(alpha = 0.8f), textAlign = TextAlign.Center, fontSize = 6.sp, lineHeight = 8.sp, modifier = Modifier.padding(top = 2.dp))
    }
}

/** web hydUserIcon. */
internal fun flowUserIcon(user: String): String {
    val u = user.uppercase()
    return when {
        "SPOILER" in u -> "spoiler"; "AILERON" in u -> "aileron"; "FLAP" in u || "SLAT" in u -> "flaps"
        "GEAR" in u || "STEERING" in u -> "gear"; "ELEVATOR" in u -> "elevator"; "RUDDER" in u -> "rudder"
        "BRAKE" in u -> "brake"; "REVERSER" in u -> "reverser"; else -> "actuator"
    }
}

/** web HydraulicUserWire (compact). */
@Composable
internal fun FlowUserChip(geo: FlowGeo, id: String?, user: String, active: Boolean, tone: Tone, modifier: Modifier = Modifier) {
    val c = tone.color()
    val fg = if (active) c else FlowSubtle
    val shape = RoundedCornerShape(6.dp)
    Row(
        modifier.flowId(geo, id).clip(shape).background(Color(0xFF0A0D10), shape).border(1.dp, if (active) c.copy(alpha = 0.4f) else FlowBorder, shape).padding(horizontal = 6.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        FlowIcon(flowUserIcon(user), fg, 12.dp)
        Text(user.uppercase(), color = fg, fontSize = 6.sp, letterSpacing = 0.05.em, lineHeight = 7.sp, modifier = Modifier.weight(1f))
        Text(if (active) "PRESSURE" else "OFF", color = if (active) FlowOk else FlowSubtle, fontFamily = FontFamily.Monospace, fontSize = 5.sp)
    }
}

/** web HydWireLayer: dim base wire, animated dash on live wires, arrow heads and junction dots. */
@Composable
internal fun FlowWireLayer(wires: List<FlowWires.Wire>, modifier: Modifier) {
    val density = LocalDensity.current.density
    val tState = rememberInfiniteTransition(label = "flow").animateFloat(0f, 10f, infiniteRepeatable(tween(900, easing = LinearEasing), RepeatMode.Restart), label = "dash")
    val paths = remember(wires) {
        wires.mapIndexed { i, w ->
            val others = wires.filterIndexed { j, _ -> j != i }.map { it.pts }
            val p = Path()
            for (cmd in FlowWires.pathCmds(w.pts, others)) when (cmd) {
                is FlowWires.Cmd.Move -> p.moveTo(cmd.x.toFloat(), cmd.y.toFloat())
                is FlowWires.Cmd.Line -> p.lineTo(cmd.x.toFloat(), cmd.y.toFloat())
                is FlowWires.Cmd.Hop -> {
                    val cx = (cmd.x - cmd.dir * cmd.r).toFloat()
                    val r = cmd.r.toFloat()
                    p.arcTo(androidx.compose.ui.geometry.Rect(cx - r, cmd.y.toFloat() - r, cx + r, cmd.y.toFloat() + r), if (cmd.dir > 0) 180f else 0f, if (cmd.dir > 0) 180f else -180f, false)
                }
            }
            p
        }
    }
    Canvas(modifier) {
        val t = tState.value   // read in the draw phase only, so the animation never recomposes the layer
        withTransform({ scale(density, density, Offset.Zero) }) {
            wires.forEachIndexed { i, w ->
                val col = if (w.active) w.tone.color() else FlowSubtle
                val gAlpha = if (w.active) 1f else 0.45f
                drawPath(paths[i], col.copy(alpha = (if (w.active) 0.35f else 0.8f) * gAlpha), style = Stroke(1.25f, cap = StrokeCap.Round, join = StrokeJoin.Round))
                if (w.active) drawPath(paths[i], col, style = Stroke(1.5f, cap = StrokeCap.Round, join = StrokeJoin.Round, pathEffect = PathEffect.dashPathEffect(floatArrayOf(4f, 6f), 10f - t)))
                if (w.arrow) FlowWires.arrowHead(w.pts)?.let { h ->
                    val hp = Path().apply { moveTo(h[0].x.toFloat(), h[0].y.toFloat()); lineTo(h[1].x.toFloat(), h[1].y.toFloat()); lineTo(h[2].x.toFloat(), h[2].y.toFloat()); close() }
                    drawPath(hp, col.copy(alpha = gAlpha))
                }
                for (d in w.dots) drawCircle(col.copy(alpha = gAlpha), 1.9f, Offset(d.x.toFloat(), d.y.toFloat()))
            }
        }
    }
}
