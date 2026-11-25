package com.oersted.trainer.ui.cockpit

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.runtime.withFrameNanos
import kotlinx.coroutines.flow.collectLatest
import kotlin.math.roundToInt

/** Zoom limits of a flow diagram (web LiveFlowDiagram allows 0.55..1.8 with 0.1 steps; a phone needs a wider range). */
internal const val FLOW_ZOOM_MIN = 0.3f
internal const val FLOW_ZOOM_MAX = 3.0f
private const val FLOW_ZOOM_STEP = 0.25f

/**
 * Pan + zoom shell for the flow diagrams.
 *
 * The diagram is laid out once at its natural width ([minNaturalWidth] or the available width, whichever is larger) and then scaled
 * about its top-left corner with a graphics layer, so the drawing, the measured wire geometry (FlowGeo works in the diagram's own
 * unscaled space) and the hit-testing all stay exact. The scaled size is what the layout reports, so a zoomed-in diagram scrolls
 * sideways inside the card and downwards with the page; a zoomed-out one simply gets smaller.
 *
 * Controls: − / FIT / 100 % / + buttons, and a two-finger pinch anywhere on the diagram (anchored on the pinch centre). Single-finger
 * drags are left alone, so they still pan the diagram sideways or scroll the page.
 */
@Composable
internal fun ZoomableFlow(
    modifier: Modifier = Modifier,
    minNaturalWidth: Dp = 0.dp,
    content: @Composable () -> Unit,
) {
    var zoom by remember { mutableFloatStateOf(1f) }
    val scroll = rememberScrollState()
    // x position (in unscaled diagram px) that must stay under screen x `anchorScreen` while the zoom changes
    val anchor = remember { floatArrayOf(0f, 0f) }
    // [0] = viewport width in px, [1] = zoom that fits the whole diagram width (plain holders: only read by the buttons)
    val view = remember { floatArrayOf(0f, 1f) }

    fun setZoom(next: Float, screenX: Float, restart: Boolean) {
        val n = next.coerceIn(FLOW_ZOOM_MIN, FLOW_ZOOM_MAX)
        if (restart) anchor[0] = (scroll.value + screenX) / zoom
        anchor[1] = screenX
        zoom = n
    }

    // After the layout of the new size has run, put the anchored point back under the finger / viewport centre.
    LaunchedEffect(Unit) {
        snapshotFlow { zoom }.collectLatest { z ->
            withFrameNanos { }
            withFrameNanos { }
            scroll.scrollTo(((anchor[0] * z) - anchor[1]).roundToInt().coerceAtLeast(0))
        }
    }

    Column(modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        ZoomBar(
            percent = Math.round(zoom * 100),
            onOut = { setZoom(zoom - FLOW_ZOOM_STEP, view[0] / 2f, true) },
            onIn = { setZoom(zoom + FLOW_ZOOM_STEP, view[0] / 2f, true) },
            onFit = { setZoom(view[1], view[0] / 2f, true) },
            onReset = { setZoom(1f, view[0] / 2f, true) },
        )
        BoxWithConstraints(
            Modifier.fillMaxWidth().pinchToZoom(
                onStart = { cx -> setZoom(zoom, cx, true) },
                onPinch = { factor, cx -> setZoom(zoom * factor, cx, false) },
            ),
        ) {
            val natural = if (maxWidth < minNaturalWidth) minNaturalWidth else maxWidth
            view[0] = with(LocalDensity.current) { maxWidth.toPx() }
            view[1] = (maxWidth.value / natural.value).coerceIn(FLOW_ZOOM_MIN, FLOW_ZOOM_MAX)
            Box(Modifier.horizontalScroll(scroll)) {
                ScaledLayout(natural, { zoom }, content)
            }
        }
    }
}

/** Lays [content] out at [naturalWidth] and reports / draws it at the current zoom (top-left origin). */
@Composable
private fun ScaledLayout(naturalWidth: Dp, zoom: () -> Float, content: @Composable () -> Unit) {
    Layout(content = { content() }) { measurables, _ ->
        val wPx = naturalWidth.roundToPx()
        val placeables = measurables.map {
            it.measure(Constraints(minWidth = wPx, maxWidth = wPx, minHeight = 0, maxHeight = Constraints.Infinity))
        }
        val z = zoom()
        val w = (wPx * z).roundToInt()
        val h = ((placeables.maxOfOrNull { it.height } ?: 0) * z).roundToInt()
        layout(w, h) {
            placeables.forEach {
                it.placeWithLayer(0, 0) {
                    val zz = zoom()
                    scaleX = zz
                    scaleY = zz
                    transformOrigin = TransformOrigin(0f, 0f)
                }
            }
        }
    }
}

/**
 * Two-finger pinch on the Initial pass: once two pointers are down the movement is consumed (so the horizontal scroller and the page do
 * not also scroll); with one pointer nothing is consumed.
 */
private fun Modifier.pinchToZoom(onStart: (Float) -> Unit, onPinch: (Float, Float) -> Unit): Modifier = pointerInput(Unit) {
    awaitEachGesture {
        awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
        var started = false
        do {
            val event = awaitPointerEvent(PointerEventPass.Initial)
            val down = event.changes.filter { it.pressed }
            if (down.size >= 2) {
                val a = down[0]
                val b = down[1]
                val before = (a.previousPosition - b.previousPosition).getDistance()
                val now = (a.position - b.position).getDistance()
                val cx = (a.position.x + b.position.x) / 2f
                if (!started) { started = true; onStart(cx) }
                if (before > 0f && now > 0f) onPinch(now / before, cx)
                event.changes.forEach { if (it.positionChanged()) it.consume() }
            }
        } while (event.changes.any { it.pressed })
    }
}

@Composable
private fun ZoomBar(percent: Int, onOut: () -> Unit, onIn: () -> Unit, onFit: () -> Unit, onReset: () -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            "PINCH OR − + TO ZOOM · DRAG TO PAN", color = FlowSubtle, fontFamily = FontFamily.Monospace, fontSize = 7.sp,
            modifier = Modifier.weight(1f).padding(start = 2.dp),
        )
        ZoomBtn("−", onOut)
        ZoomBtn("FIT", onFit)
        ZoomBtn("$percent%", onReset, minWidth = 48.dp)
        ZoomBtn("+", onIn)
    }
}

@Composable
private fun ZoomBtn(text: String, onClick: () -> Unit, minWidth: Dp = 32.dp) {
    Text(
        text, color = FlowFg, fontFamily = FontFamily.Monospace, fontSize = 9.sp, textAlign = TextAlign.Center,
        modifier = Modifier.defaultMinSize(minWidth = minWidth, minHeight = 30.dp)
            .border(1.dp, FlowBorder, RoundedCornerShape(4.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 6.dp, vertical = 7.dp),
    )
}
