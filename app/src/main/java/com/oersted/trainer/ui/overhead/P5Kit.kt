package com.oersted.trainer.ui.overhead

import com.oersted.trainer.ui.common.insetShadow
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.oersted.trainer.sim.Derived
import com.oersted.trainer.sim.OverheadLocal
import com.oersted.trainer.sim.OverheadP5Rules
import com.oersted.trainer.sim.SimState
import com.oersted.trainer.ui.cockpit.CockpitModel
import com.oersted.trainer.ui.pedestal.Annun
import com.oersted.trainer.ui.pedestal.AnnunTone
import com.oersted.trainer.ui.pedestal.LegendColor
import com.oersted.trainer.ui.pedestal.PlateBorder
import com.oersted.trainer.ui.pedestal.PlateColor
import com.oersted.trainer.ui.pedestal.Screws

/*
 * Primitives of components/panel/OverheadP5.tsx: bat-handle switches, instrument gauges, round buttons and the CSS-grid helpers.
 * Compose only; verified on CI. Sizes are the web's CSS px used as dp inside the scaled P5 canvas.
 */

val P5LightPlate = Color(0xFF9B9EA2)
val P5Ink = Color(0xFF1A1C1F)

/** What every P5 panel reads: the live sim, its derived values and the overhead-local state, plus the ways to change them. */
class P5(val s: SimState, val d: Derived, val o: OverheadLocal.OverheadLocalState, private val model: CockpitModel) {
    /** web `s.patch({...}, note)`: edit a copy of the sim state; a note is written to the event log. */
    fun patch(note: String? = null, edit: SimState.() -> Unit) {
        if (note != null) model.patchSimNote(note, edit) else model.patchSim(edit)
    }

    /** web `useOverheadLocal().set(...)` */
    fun overhead(transform: (OverheadLocal.OverheadLocalState) -> OverheadLocal.OverheadLocalState) = model.updateOverhead(transform)
}

@Composable
fun rememberP5(model: CockpitModel): P5 {
    val s by model.simState.collectAsState()
    val d by model.derived.collectAsState()
    val o by model.overheadState.collectAsState()
    return P5(s, d, o, model)
}

/** web LEGEND: mono bold uppercase cream with .1em tracking; [size] in CSS px (fractions allowed). */
@Composable
fun P5Legend(text: String, size: Float = 8f, modifier: Modifier = Modifier, color: Color = LegendColor, align: TextAlign? = null) {
    Text(
        text = text.uppercase(),
        modifier = modifier,
        color = color,
        fontSize = size.sp,
        lineHeight = (size * 1.15f).sp,
        fontFamily = FontFamily.Monospace,
        fontWeight = FontWeight.Bold,
        letterSpacing = 0.1.em,
        textAlign = align,
    )
}

/** web Cap: centred 6px legend */
@Composable
fun P5Cap(text: String, modifier: Modifier = Modifier, size: Float = 6f, color: Color = LegendColor) {
    P5Legend(text, size, modifier, color, TextAlign.Center)
}

/** Annunciator light with the web's usual className widths: [w] a fixed width in px, else fills the cell ([wide]) or hugs its text. */
@Composable
fun A(label: String, on: Boolean, tone: AnnunTone = AnnunTone.AMBER, small: Boolean = false, w: Int? = null, wide: Boolean = true, onClick: (() -> Unit)? = null, modifier: Modifier = Modifier) {
    val m = if (w != null) Modifier.width(w.dp) else if (wide) Modifier.fillMaxWidth() else Modifier
    Annun(label = label, on = on, tone = tone, small = small, modifier = modifier.then(m), onClick = onClick)
}

// ───────────────────────── layout helpers ─────────────────────────

/** web Row: `flex items-start justify-around gap-1` */
@Composable
fun P5Row(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceAround, verticalAlignment = Alignment.Top) { content() }
}

class GridScope {
    internal val items = mutableListOf<@Composable () -> Unit>()
    fun item(content: @Composable () -> Unit) {
        items += content
    }
}

/** web `grid grid-cols-N` with equal columns: [cols] columns, items placed row by row, cells centre their content. */
@Composable
fun Grid(
    cols: Int,
    modifier: Modifier = Modifier,
    gap: Dp = 2.dp,
    rowGap: Dp = gap,
    align: Alignment.Vertical = Alignment.Top,
    content: GridScope.() -> Unit,
) {
    val items = GridScope().apply(content).items
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(rowGap)) {
        items.chunked(cols).forEach { rowItems ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(gap), verticalAlignment = align) {
                rowItems.forEach { cell -> Box(Modifier.weight(1f), contentAlignment = Alignment.TopCenter) { cell() } }
                repeat(cols - rowItems.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

/** web `grid-cols-[auto_1fr_auto]` (and the like): [lead] and [trail] hug their content, the middle takes the rest. */
@Composable
fun Grid3(
    modifier: Modifier = Modifier,
    gap: Dp = 4.dp,
    align: Alignment.Vertical = Alignment.Top,
    lead: @Composable () -> Unit,
    mid: @Composable () -> Unit,
    trail: @Composable () -> Unit,
) {
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(gap), verticalAlignment = align) {
        lead()
        Box(Modifier.weight(1f), contentAlignment = Alignment.TopCenter) { mid() }
        trail()
    }
}

/** web `grid-cols-[1fr_auto_1fr]`: side columns share the space left by the middle. */
@Composable
fun GridSides(
    modifier: Modifier = Modifier,
    gap: Dp = 4.dp,
    align: Alignment.Vertical = Alignment.Top,
    left: @Composable () -> Unit,
    mid: @Composable () -> Unit,
    right: @Composable () -> Unit,
) {
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(gap), verticalAlignment = align) {
        Box(Modifier.weight(1f), contentAlignment = Alignment.TopCenter) { left() }
        mid()
        Box(Modifier.weight(1f), contentAlignment = Alignment.TopCenter) { right() }
    }
}

/** web `Blank`: a plain grey plate with screws. */
@Composable
fun Blank(h: Int = 60, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(3.dp)
    Box(modifier.fillMaxWidth().heightIn(min = h.dp).background(PlateColor, shape).border(1.dp, PlateBorder, shape)) { Screws() }
}

/** web `Slot`: a dark vertical slot. */
@Composable
fun Slot(h: Int = 46) {
    Box(
        Modifier.width(8.dp).height(h.dp)
            .background(Brush.verticalGradient(listOf(Color(0xFFF2F2F2), Color(0xFF222222))), RoundedCornerShape(50))
            .border(1.dp, Color.Black, RoundedCornerShape(50)),
    )
}

/** web `BlackLabel`: black printed label with cream mono text. */
@Composable
fun BlackLabel(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(modifier.background(Color.Black, RoundedCornerShape(3.dp)).padding(horizontal = 8.dp, vertical = 4.dp), horizontalAlignment = Alignment.CenterHorizontally, content = content)
}

/** web `IndexLock`: the INDEX · TO LOCK plate with vertical text. */
@Composable
fun IndexLock() {
    val shape = RoundedCornerShape(3.dp)
    Box(Modifier.size(width = 44.dp, height = 62.dp).background(Color(0xFF2A2C30), shape).border(1.dp, PlateBorder, shape), contentAlignment = Alignment.Center) {
        P5Legend("INDEX · TO LOCK", 5f, Modifier.wrapContentSize(Alignment.Center, unbounded = true).rotate(90f))
    }
}

// ───────────────────────── switches ─────────────────────────

private val TrackColor = Color(0xFF101214)
private val TrackBorder = Color(0xFF15171A)

/** web VSwitch: vertical bat-handle switch with N positions (top to bottom); tap the track to choose one. */
@Composable
fun VSwitch(
    options: List<String>,
    value: String,
    onChange: (String) -> Unit,
    label: String? = null,
    guarded: Boolean = false,
    spring: String? = null,
    small: Boolean = false,
    legends: List<String>? = null,
) {
    val n = options.size
    val idx = OverheadP5Rules.switchIndex(options, value)
    val h = OverheadP5Rules.vSwitchHeight(n, small)
    val onChangeNow by rememberUpdatedState(onChange)
    val optionsNow by rememberUpdatedState(options)
    val springNow by rememberUpdatedState(spring)
    val shape = RoundedCornerShape(3.dp)
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            if (legends != null) {
                Column(Modifier.height(h.dp), verticalArrangement = Arrangement.SpaceBetween, horizontalAlignment = Alignment.End) {
                    legends.forEachIndexed { i, l -> P5Legend(l, 5f, color = if (i == idx) Color.White else LegendColor) }
                }
            }
            Box(
                Modifier.width(22.dp).height(h.dp)
                    .background(TrackColor, shape)
                    .insetShadow(shape, 6.dp, Color.Black)
                    .border(1.dp, if (guarded) Color(0xFFC03A2A) else TrackBorder, shape)
                    .pointerInput(n) {
                        detectTapGestures(onPress = { pos ->
                            onChangeNow(optionsNow[OverheadP5Rules.switchPick(pos.y.toDouble() / size.height, optionsNow.size)])
                            tryAwaitRelease()
                            springNow?.let { onChangeNow(it) }
                        })
                    },
            ) {
                Box(
                    Modifier.align(Alignment.TopCenter)
                        .offset(y = OverheadP5Rules.vHandleTop(h, n, idx).dp)
                        .width(9.dp).height(OverheadP5Rules.vHandleHeight(h, n).dp)
                        .background(Brush.horizontalGradient(listOf(Color(0xFF9A9EA3), Color(0xFF464A4F), Color(0xFF9A9EA3))), RoundedCornerShape(2.dp))
                        .border(1.dp, Color(0xFF050607), RoundedCornerShape(2.dp)),
                )
            }
        }
        if (!label.isNullOrEmpty()) P5Legend(label, 5.5f, Modifier.widthIn(max = 64.dp), align = TextAlign.Center)
    }
}

/** web HSwitch: horizontal bat-handle switch with N positions (left to right), legends printed above each position. */
@Composable
fun HSwitch(
    options: List<String>,
    value: String,
    onChange: (String) -> Unit,
    label: String? = null,
    legends: List<String>? = null,
    guarded: Boolean = false,
) {
    val n = options.size
    val idx = OverheadP5Rules.switchIndex(options, value)
    val w = OverheadP5Rules.hSwitchWidth(n)
    val onChangeNow by rememberUpdatedState(onChange)
    val optionsNow by rememberUpdatedState(options)
    val shape = RoundedCornerShape(3.dp)
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        if (legends != null) {
            Row(Modifier.width(w.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                legends.forEachIndexed { i, l -> P5Legend(l, 5f, color = if (i == idx) Color.White else LegendColor) }
            }
        }
        Box(
            Modifier.width(w.dp).height(20.dp)
                .background(TrackColor, shape)
                .insetShadow(shape, 6.dp, Color.Black)
                .border(1.dp, if (guarded) Color(0xFFC03A2A) else TrackBorder, shape)
                .pointerInput(n) {
                    detectTapGestures(onPress = { pos ->
                        onChangeNow(optionsNow[OverheadP5Rules.switchPick(pos.x.toDouble() / size.width, optionsNow.size)])
                    })
                },
        ) {
            Box(
                Modifier.align(Alignment.CenterStart)
                    .offset(x = OverheadP5Rules.hHandleLeft(w, n, idx).dp)
                    .height(9.dp).width(OverheadP5Rules.hHandleWidth(w, n).dp)
                    .background(Brush.verticalGradient(listOf(Color(0xFF9A9EA3), Color(0xFF464A4F), Color(0xFF9A9EA3))), RoundedCornerShape(2.dp))
                    .border(1.dp, Color(0xFF050607), RoundedCornerShape(2.dp)),
            )
        }
        if (!label.isNullOrEmpty()) P5Legend(label, 5.5f, Modifier.widthIn(max = 80.dp), align = TextAlign.Center)
    }
}

/** web OnOff: upper position ON, lower OFF. */
@Composable
fun OnOff(on: Boolean, onChange: (Boolean) -> Unit, label: String? = null, small: Boolean = false, guarded: Boolean = false, legends: List<String>? = null) {
    VSwitch(listOf("ON", "OFF"), if (on) "ON" else "OFF", { onChange(it == "ON") }, label, guarded, null, small, legends)
}

/** web OffOn: upper position OFF, lower ON (how the reference picture prints most two-position toggles). */
@Composable
fun OffOn(on: Boolean, onChange: (Boolean) -> Unit, label: String? = null, small: Boolean = false, legends: List<String>? = null) {
    VSwitch(listOf("OFF", "ON"), if (on) "ON" else "OFF", { onChange(it == "ON") }, label, false, null, small, legends ?: listOf("OFF", "ON"))
}

/** web RedGuarded: a switch under a red guard. */
@Composable
fun RedGuarded(value: String, options: List<String>, onChange: (String) -> Unit, label: String? = null, legends: List<String>? = null) {
    val shape = RoundedCornerShape(3.dp)
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        if (label != null) P5Cap(label)
        Box(Modifier.background(Color(0xFFB51F1F), shape).insetShadow(shape, 8.dp, Color.Black.copy(alpha = 0.55f)).border(2.dp, Color(0xFF7B1515), shape).padding(4.dp)) {
            VSwitch(options, value, onChange, null, false, null, true, legends ?: options)
        }
    }
}

/** web RoundBtn: a 20px round push button with an optional legend; [onPress] on touch down, [onRelease] on lift. */
@Composable
fun RoundBtn(label: String? = null, onPress: (() -> Unit)? = null, onRelease: (() -> Unit)? = null) {
    val pressNow by rememberUpdatedState(onPress)
    val releaseNow by rememberUpdatedState(onRelease)
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        if (label != null) P5Legend(label, 5.5f)
        Box(
            Modifier.size(20.dp)
                .background(Brush.radialGradient(listOf(Color(0xFFE3E4E6), Color(0xFF8D9095), Color(0xFF4B4E53))), CircleShape)
                .border(2.dp, P5Ink, CircleShape)
                .pointerInput(Unit) {
                    detectTapGestures(onPress = {
                        pressNow?.invoke()
                        tryAwaitRelease()
                        releaseNow?.invoke()
                    })
                },
        )
    }
}

// ───────────────────────── gauges ─────────────────────────

private val gaugePaint by lazy {
    android.graphics.Paint().apply {
        isAntiAlias = true
        typeface = android.graphics.Typeface.MONOSPACE
        textAlign = android.graphics.Paint.Align.CENTER
    }
}

/** Draws [s] centred at (x, y) of the 100 x 100 design face, scaled by [k]. */
private fun DrawScope.svgText(s: String, x: Double, y: Double, fontSize: Double, color: Color, k: Float, bold: Boolean = false) {
    val p = gaugePaint
    p.color = color.toArgb()
    p.textSize = (fontSize * k).toFloat()
    p.isFakeBoldText = bold
    drawContext.canvas.nativeCanvas.drawText(s, (x * k).toFloat(), (y * k).toFloat(), p)
}

/** web Gauge: P5 instrument face, black upper face over a grey lower case, compact aircraft-style scale. */
@Composable
fun Gauge(label: String? = null, sub: String? = null, value: Double, min: Double, max: Double, size: Dp = 54.dp, ticks: Int = 5, redFrom: Double? = null) {
    val f = OverheadP5Rules.gaugeFraction(value, min, max)
    val a = OverheadP5Rules.gaugeAngle(f)
    val nums = OverheadP5Rules.gaugeNums(label, min, max, ticks)
    val unit = OverheadP5Rules.gaugeUnit(label, sub)
    val subLine = OverheadP5Rules.gaugeSubLine(label, sub)
    Canvas(Modifier.size(size)) {
        val k = this.size.width / 100f
        fun px(v: Double) = (v * k).toFloat()
        val face = Path().apply {
            moveTo(px(4.0), px(54.0))
            arcTo(Rect(px(4.0), px(8.0), px(96.0), px(100.0)), 180f, 180f, false)
            lineTo(px(96.0), px(91.0))
            quadraticBezierTo(px(96.0), px(96.0), px(91.0), px(96.0))
            lineTo(px(9.0), px(96.0))
            quadraticBezierTo(px(4.0), px(96.0), px(4.0), px(91.0))
            close()
        }
        drawPath(face, Color(0xFF0C0D0F))
        drawPath(face, Color(0xFFA1A4A7), style = Stroke(width = px(2.0)))
        val lower = Path().apply {
            moveTo(px(4.0), px(54.0))
            arcTo(Rect(px(4.0), px(8.0), px(96.0), px(100.0)), 180f, -180f, false)
            lineTo(px(96.0), px(96.0))
            lineTo(px(4.0), px(96.0))
            close()
        }
        drawPath(lower, Color(0xFF777A7E))
        val n = nums.size
        nums.forEachIndexed { i, num ->
            val d = OverheadP5Rules.gaugeTickAngle(i, n)
            val (x1, y1) = OverheadP5Rules.gaugePoint(d, 36.0)
            val (x2, y2) = OverheadP5Rules.gaugePoint(d, 44.0)
            val v = OverheadP5Rules.gaugeTickValue(i, n, min, max)
            val red = redFrom != null && v >= redFrom
            val c = if (red) Color(0xFFEF5757) else Color(0xFFF3EDDA)
            drawLine(c, Offset(px(x1), px(y1)), Offset(px(x2), px(y2)), strokeWidth = px(1.35))
            val (tx, ty) = OverheadP5Rules.gaugePoint(d, 29.0)
            svgText(num, tx, ty + 2, 5.1, c, k)
        }
        svgText(unit, 50.0, 64.0, 5.2, Color(0xFF151619), k, bold = true)
        svgText(subLine, 50.0, 72.0, 4.5, Color(0xFF151619), k)
        val (nx, ny) = OverheadP5Rules.gaugePoint(a, 33.0)
        drawLine(Color(0xFFF5EFDA), Offset(px(50.0), px(54.0)), Offset(px(nx), px(ny)), strokeWidth = px(2.1), cap = StrokeCap.Round)
        drawCircle(Color(0xFF222428), px(3.0), Offset(px(50.0), px(54.0)))
        drawCircle(Color(0xFFB4B7BA), px(3.0), Offset(px(50.0), px(54.0)), style = Stroke(width = px(0.7)))
    }
}

/** web MixDial: small round COLD-HOT valve-position dial, with a slider when [onChange] is given. */
@Composable
fun MixDial(value: Double, size: Dp = 38.dp, onChange: ((Double) -> Unit)? = null, disabled: Boolean = false) {
    val a = OverheadP5Rules.mixDialAngle(value)
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Canvas(Modifier.size(size)) {
            val k = this.size.width / 100f
            fun px(v: Double) = (v * k).toFloat()
            drawCircle(Color(0xFF0C0D0F), px(46.0), Offset(px(50.0), px(50.0)))
            drawCircle(Color(0xFFA1A4A7), px(46.0), Offset(px(50.0), px(50.0)), style = Stroke(width = px(3.0)))
            for (i in 0 until 9) {
                val d = -120.0 + i * 30
                val (x1, y1) = OverheadP5Rules.gaugePoint(d, 36.0, 50.0)
                val (x2, y2) = OverheadP5Rules.gaugePoint(d, 44.0, 50.0)
                drawLine(Color(0xFFF3EDDA), Offset(px(x1), px(y1)), Offset(px(x2), px(y2)), strokeWidth = px(2.0))
            }
            svgText("COLD", 22.0, 86.0, 9.0, Color(0xFFF3EDDA), k)
            svgText("HOT", 78.0, 86.0, 9.0, Color(0xFFF3EDDA), k)
            val (nx, ny) = OverheadP5Rules.gaugePoint(a, 34.0, 50.0)
            drawLine(Color(0xFFF5EFDA), Offset(px(50.0), px(50.0)), Offset(px(nx), px(ny)), strokeWidth = px(4.0), cap = StrokeCap.Round)
            drawCircle(Color(0xFF222428), px(6.0), Offset(px(50.0), px(50.0)))
            drawCircle(Color(0xFFB4B7BA), px(6.0), Offset(px(50.0), px(50.0)), style = Stroke(width = px(1.0)))
        }
        if (onChange != null) MiniSlider(value, onChange, !disabled)
    }
}

/** web `<input type=range className="w-14 accent-amber-500">` */
@Composable
fun MiniSlider(value: Double, onChange: (Double) -> Unit, enabled: Boolean) {
    val onChangeNow by rememberUpdatedState(onChange)
    Box(
        Modifier.width(56.dp).height(14.dp).alpha(if (enabled) 1f else 0.4f)
            .pointerInput(enabled) {
                if (!enabled) return@pointerInput
                detectTapGestures(onPress = { onChangeNow((it.x / size.width).toDouble().coerceIn(0.0, 1.0)) })
            }
            .pointerInput(enabled) {
                if (!enabled) return@pointerInput
                detectDragGestures(onDragStart = { onChangeNow((it.x / size.width).toDouble().coerceIn(0.0, 1.0)) }, onDrag = { c, _ -> onChangeNow((c.position.x / size.width).toDouble().coerceIn(0.0, 1.0)) })
            },
    ) {
        Canvas(Modifier.fillMaxWidth().height(14.dp)) {
            val cy = this.size.height / 2
            drawLine(Color(0xFF5A5E64), Offset(4.dp.toPx(), cy), Offset(this.size.width - 4.dp.toPx(), cy), strokeWidth = 3.dp.toPx(), cap = StrokeCap.Round)
            val x = 4.dp.toPx() + value.toFloat().coerceIn(0f, 1f) * (this.size.width - 8.dp.toPx())
            drawCircle(Color(0xFFF59E0B), 5.dp.toPx(), Offset(x, cy))
        }
    }
}

/** web `Readout2`: a small black numeric display. */
@Composable
fun Readout2(value: String, on: Boolean) {
    Box(Modifier.fillMaxWidth().background(Color.Black, RoundedCornerShape(2.dp)).border(1.dp, Color.Black, RoundedCornerShape(2.dp)), contentAlignment = Alignment.Center) {
        Text(OverheadP5Rules.readout2(value, on), color = Color(0xFFF1F1EA), fontSize = 11.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
    }
}

/** web small round lamp (CVR meter and the like) */
@Composable
fun Dot(on: Boolean, litColor: Color, offColor: Color, size: Dp = 7.dp) {
    Box(Modifier.size(size).background(if (on) litColor else offColor, CircleShape))
}

/** Tap without the Material ripple (the web buttons only darken a little). */
@Composable
fun Modifier.tap(onTap: () -> Unit): Modifier {
    val now by rememberUpdatedState(onTap)
    return this.pointerInput(Unit) { detectTapGestures(onTap = { now() }) }
}

/** web `PLATE p-N` without a title: grey plate with border, screws and a column of content. */
@Composable
fun P5Plate(modifier: Modifier = Modifier, pad: Dp = 6.dp, color: Color = PlateColor, screws: Int = 4, gap: Dp = 0.dp, content: @Composable ColumnScope.() -> Unit) {
    val shape = RoundedCornerShape(3.dp)
    Box(modifier.fillMaxWidth().background(color, shape).border(1.dp, PlateBorder, shape)) {
        Screws(screws)
        Column(Modifier.fillMaxWidth().padding(pad), verticalArrangement = Arrangement.spacedBy(gap), content = content)
    }
}

/** CSS `mt-N` */
fun Modifier.mt(px: Int): Modifier = this.padding(top = px.dp)

/** web `border-t border-[#2c2f33]/70 pt-1.5`: a block under a thin top rule. */
@Composable
fun SepBlock(content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxWidth()) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0xFF2C2F33).copy(alpha = 0.7f)))
        Column(Modifier.fillMaxWidth().padding(top = 6.dp), content = content)
    }
}

/** web `<input type=checkbox>` at the 5px legend scale */
@Composable
fun MiniCheck(checked: Boolean, onChange: (Boolean) -> Unit) {
    Box(
        Modifier.size(10.dp)
            .background(if (checked) Color(0xFFE6E1D2) else Color(0xFF14161A), RoundedCornerShape(2.dp))
            .border(1.dp, Color(0xFF8B8E92), RoundedCornerShape(2.dp))
            .tap { onChange(!checked) },
        contentAlignment = Alignment.Center,
    ) {
        if (checked) Text("✓", color = Color.Black, fontSize = 8.sp, fontWeight = FontWeight.Bold)
    }
}
