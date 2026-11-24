package com.oersted.trainer.ui.common

import android.graphics.BlurMaskFilter
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
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

/**
 * CSS `box-shadow: inset 0 0 <blur> <color>`: a soft dark rim just inside the edge of [shape], drawn over the content.
 * The glow is a blurred frame (everything outside the shape) clipped back to the shape, so it never leaks out.
 */
fun Modifier.insetShadow(shape: Shape, blur: Dp, color: Color): Modifier = drawWithContent {
    drawContent()
    val outline = shape.createOutline(size, layoutDirection, this)
    val path = Path().apply {
        when (outline) {
            is Outline.Rectangle -> addRect(outline.rect)
            is Outline.Rounded -> addRoundRect(outline.roundRect)
            is Outline.Generic -> addPath(outline.path)
        }
    }
    drawInsetShadow(path, Rect(0f, 0f, size.width, size.height), blur.toPx(), color)
}

/**
 * Draws the inset shadow of [shapePath] clipped to it. [bounds] is the box the frame is built around (the element's box, which
 * may be larger than a clip-path polygon that cuts the shadow, as for the glareshield housing).
 */
fun DrawScope.drawInsetShadow(shapePath: Path, bounds: Rect, blurPx: Float, color: Color) {
    if (blurPx <= 0f) return
    clipPath(shapePath) {
        drawIntoCanvas { canvas ->
            val m = blurPx * 3f
            val frame = Path().apply {
                fillType = PathFillType.EvenOdd
                addRect(Rect(bounds.left - m, bounds.top - m, bounds.right + m, bounds.bottom + m))
                addPath(shapePath)
            }
            val paint = Paint().apply {
                this.color = color
                asFrameworkPaint().maskFilter = BlurMaskFilter(blurPx, BlurMaskFilter.Blur.NORMAL)
            }
            canvas.drawPath(frame, paint)
        }
    }
}
