package com.oersted.trainer.ui.common

import android.graphics.BlurMaskFilter
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * CSS `box-shadow: inset 0 0 <blur> <color>`: a soft dark rim just inside the edge of [shape]. Drawn behind the content (children sit above it, as in CSS), so put it after `background`.
 * The glow is a blurred frame (everything outside the shape) clipped back to the shape, so it never leaks out.
 */
fun Modifier.insetShadow(shape: Shape, blur: Dp, color: Color, dx: Dp = 0.dp, dy: Dp = 0.dp): Modifier = drawBehind {
    val outline = shape.createOutline(size, layoutDirection, this)
    val path = Path().apply {
        when (outline) {
            is Outline.Rectangle -> addRect(outline.rect)
            is Outline.Rounded -> addRoundRect(outline.roundRect)
            is Outline.Generic -> addPath(outline.path)
        }
    }
    drawInsetShadow(path, Rect(0f, 0f, size.width, size.height), blur.toPx(), color, dx.toPx(), dy.toPx())
}

/** Two or more stacked inset shadows (CSS lists them front to back, so the first one paints on top). */
fun Modifier.insetShadows(shape: Shape, vararg layers: InsetLayer): Modifier = drawBehind {
    val outline = shape.createOutline(size, layoutDirection, this)
    val path = Path().apply {
        when (outline) {
            is Outline.Rectangle -> addRect(outline.rect)
            is Outline.Rounded -> addRoundRect(outline.roundRect)
            is Outline.Generic -> addPath(outline.path)
        }
    }
    val box = Rect(0f, 0f, size.width, size.height)
    for (l in layers.reversed()) drawInsetShadow(path, box, l.blur.toPx(), l.color, l.dx.toPx(), l.dy.toPx())
}

/** One `inset <dx> <dy> <blur> <color>` layer. */
class InsetLayer(val color: Color, val blur: Dp, val dx: Dp = 0.dp, val dy: Dp = 0.dp)

/**
 * Draws the inset shadow of [shapePath] clipped to it. [bounds] is the box the frame is built around (the element's box, which
 * may be larger than a clip-path polygon that cuts the shadow, as for the glareshield housing).
 */
fun DrawScope.drawInsetShadow(shapePath: Path, bounds: Rect, blurPx: Float, color: Color, dxPx: Float = 0f, dyPx: Float = 0f) {
    clipPath(shapePath) {
        drawIntoCanvas { canvas ->
            val m = blurPx * 3f + kotlin.math.abs(dxPx) + kotlin.math.abs(dyPx)
            // CSS: the shadow of everything outside the shape, moved by the offset
            val hole = if (dxPx == 0f && dyPx == 0f) shapePath else Path().apply { addPath(shapePath, androidx.compose.ui.geometry.Offset(dxPx, dyPx)) }
            val frame = Path().apply {
                fillType = PathFillType.EvenOdd
                addRect(Rect(bounds.left - m, bounds.top - m, bounds.right + m, bounds.bottom + m))
                addPath(hole)
            }
            val paint = Paint().apply {
                this.color = color
                if (blurPx > 0f) asFrameworkPaint().maskFilter = BlurMaskFilter(blurPx, BlurMaskFilter.Blur.NORMAL)
            }
            canvas.drawPath(frame, paint)
        }
    }
}
