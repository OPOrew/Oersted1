package com.oersted.trainer.ui.pedestal

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.oersted.trainer.ui.cockpit.CockpitModel

/**
 * A cut-out of the centre pedestal's control stand with only the two thrust levers (the real [ThrustLever]: drag, A/T
 * DISENGAGE switch, reverse fork), for the Training Console. It uses the pedestal stage coordinates and scales the window
 * [CROP_W] x [CROP_H] (stage px, origin [CROP_X], [CROP_Y]) to [width]. Compose only; verify on CI.
 */
private const val CROP_X = 400
private const val CROP_Y = 315
private const val CROP_W = 280
private const val CROP_H = 305

@Composable
fun PedestalThrustLevers(cockpit: CockpitModel, width: Dp) {
    val k = width.value / CROP_W
    Box(
        Modifier
            .width(width)
            .height((CROP_H * k).dp)
            .clipToBounds()
            .background(Color(0xFF111316)),
    ) {
        Box(
            Modifier
                .wrapContentSize(Alignment.TopStart, unbounded = true)
                .size(PEDESTAL_STAGE_W.dp, PEDESTAL_STAGE_H.dp)
                .graphicsLayer {
                    scaleX = k
                    scaleY = k
                    transformOrigin = TransformOrigin(0f, 0f)
                    translationX = -((CROP_X - PEDESTAL_OX) * k).dp.toPx()
                    translationY = -(CROP_Y * k).dp.toPx()
                },
        ) {
            // throttle quadrant body, as in PedestalControlStand
            val body = RoundedCornerShape(10.dp)
            Box(Modifier.stageAt(398, 333, 350, 437).background(PanelPaint, body).border(1.dp, Color(0xFF141A17), body))
            ThrustLever(cockpit, 1, 475)
            ThrustLever(cockpit, 2, 600)
        }
    }
}
