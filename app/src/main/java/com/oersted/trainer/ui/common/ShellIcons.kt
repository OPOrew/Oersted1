package com.oersted.trainer.ui.common

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * The lucide icons AppShell.tsx uses (Plane, LayoutPanelLeft, PlaneTakeoff, Play, BookOpen, Gauge, Sun, Moon), drawn as 24 x 24
 * stroked paths (stroke 2, round caps) so the shell needs no icon library. Shapes follow the lucide outlines.
 */
enum class ShellIconKind { PLANE, PANEL_LEFT, TAKEOFF, PLAY, BOOK_OPEN, GAUGE, SUN, MOON }

@Composable
fun ShellIcon(kind: ShellIconKind, color: Color, size: Dp = 16.dp) {
    androidx.compose.foundation.Canvas(Modifier.size(size)) {
        val sc = this.size.width / 24f
        val st = Stroke(2f, cap = StrokeCap.Round, join = StrokeJoin.Round)
        withTransform({ scale(sc, sc, Offset.Zero) }) {
            fun line(x1: Float, y1: Float, x2: Float, y2: Float) = drawLine(color, Offset(x1, y1), Offset(x2, y2), 2f, StrokeCap.Round)
            fun path(build: Path.() -> Unit) = drawPath(Path().apply(build), color, style = st)
            when (kind) {
                ShellIconKind.PLANE -> path {
                    moveTo(17.8f, 19.2f); lineTo(16f, 11f); lineTo(19.6f, 7.4f)
                    cubicTo(20.5f, 6.5f, 21f, 4.9f, 20.5f, 3.5f); cubicTo(19.1f, 3f, 17.5f, 3.5f, 16.6f, 4.4f)
                    lineTo(13f, 8f); lineTo(4.8f, 6.2f); lineTo(3.8f, 7.2f); lineTo(10f, 11f); lineTo(7f, 14f)
                    lineTo(4f, 13.5f); lineTo(3f, 14.5f); lineTo(6.5f, 17.5f); lineTo(9.5f, 21f); lineTo(10.5f, 20f)
                    lineTo(10f, 17f); lineTo(13f, 14f); lineTo(16.8f, 20.2f); close()
                }
                ShellIconKind.PANEL_LEFT -> {
                    drawRoundRect(color, Offset(3f, 3f), Size(18f, 18f), androidx.compose.ui.geometry.CornerRadius(2f), style = st)
                    line(9f, 3f, 9f, 21f); line(9f, 12f, 21f, 12f)
                }
                ShellIconKind.TAKEOFF -> {
                    line(2f, 22f, 22f, 22f)
                    path {
                        moveTo(6.4f, 12.2f); lineTo(4.2f, 7.3f); lineTo(5.9f, 6.7f); lineTo(9.7f, 9.4f); lineTo(14.8f, 7.6f)
                        lineTo(11f, 3f); lineTo(13f, 2.5f); lineTo(18.6f, 6.3f); lineTo(20.8f, 5.6f)
                        cubicTo(21.9f, 5.2f, 22.4f, 6.4f, 21.7f, 7.4f); lineTo(20.8f, 8.7f); lineTo(6.4f, 12.2f); close()
                    }
                }
                ShellIconKind.PLAY -> path { moveTo(6f, 3f); lineTo(20f, 12f); lineTo(6f, 21f); close() }
                ShellIconKind.BOOK_OPEN -> {
                    path { moveTo(12f, 7f); cubicTo(10.5f, 5.2f, 8f, 4f, 2f, 4f); lineTo(2f, 19f); cubicTo(8f, 19f, 10.5f, 20.2f, 12f, 22f) }
                    path { moveTo(12f, 7f); cubicTo(13.5f, 5.2f, 16f, 4f, 22f, 4f); lineTo(22f, 19f); cubicTo(16f, 19f, 13.5f, 20.2f, 12f, 22f); lineTo(12f, 7f) }
                }
                ShellIconKind.GAUGE -> {
                    path { moveTo(12f, 14f); lineTo(16f, 10f) }
                    path { moveTo(3.34f, 19f); cubicTo(2.5f, 17.7f, 2f, 16f, 2f, 14.3f); cubicTo(2f, 8.9f, 6.5f, 4.5f, 12f, 4.5f); cubicTo(17.5f, 4.5f, 22f, 8.9f, 22f, 14.3f); cubicTo(22f, 16f, 21.5f, 17.7f, 20.66f, 19f) }
                }
                ShellIconKind.SUN -> {
                    drawCircle(color, 4f, Offset(12f, 12f), style = st)
                    line(12f, 2f, 12f, 4f); line(12f, 20f, 12f, 22f); line(4.93f, 4.93f, 6.34f, 6.34f); line(17.66f, 17.66f, 19.07f, 19.07f)
                    line(2f, 12f, 4f, 12f); line(20f, 12f, 22f, 12f); line(6.34f, 17.66f, 4.93f, 19.07f); line(19.07f, 4.93f, 17.66f, 6.34f)
                }
                ShellIconKind.MOON -> path {
                    moveTo(12f, 3f); cubicTo(11.4f, 3.9f, 11f, 5f, 11f, 6.2f); cubicTo(11f, 9.4f, 13.6f, 12f, 16.8f, 12f)
                    cubicTo(18f, 12f, 19.1f, 11.6f, 20f, 11f); cubicTo(19.8f, 16.1f, 16.3f, 21f, 12f, 21f)
                    cubicTo(7f, 21f, 3f, 17f, 3f, 12f); cubicTo(3f, 7.7f, 7.9f, 3.2f, 12f, 3f); close()
                }
            }
        }
    }
}
