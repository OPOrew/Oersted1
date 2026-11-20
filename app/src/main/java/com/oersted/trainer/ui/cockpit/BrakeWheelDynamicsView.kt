package com.oersted.trainer.ui.cockpit

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.oersted.trainer.sim.Derived
import com.oersted.trainer.sim.SimState
import com.oersted.trainer.ui.panel.BrakeWheelReadout
import kotlin.math.max

/**
 * Port of WheelDynamics / BrakeWheelPanel (components/panel/Overhead.tsx ~1113-1170): four main-gear wheel dials that spin with
 * the wheel speed (period max(0.08, 45 / max(speed, 1)) s, still below 1 kt with the first spoke turned speed * 5 deg), each with
 * its speed and brake pressure, next to the readout rows (BrakeWheelReadout). The web's two-column md layout stacks on a phone.
 * Compose only; verify on a device.
 */

private val WheelRim = Color(0xFF66707A)
private val WheelHub = Color(0xFF121519)
private val WheelFg = Color(0xFFE7E2D6)
private val CardBorder = Color(0xFF2C323D)
private val CardInset = Color(0xFF0E1116)
private val CardPanel = Color(0xFF151A21)
private val Subtle = Color(0xFF8F9AA5)

@Composable
private fun WheelDial(speed: Double) {
    val spd by rememberUpdatedState(speed)
    var spin by remember { mutableFloatStateOf(0f) }
    LaunchedEffect(Unit) {
        var last = 0L
        while (true) {
            androidx.compose.runtime.withFrameNanos { now ->
                if (last != 0L && spd > 1.0) {
                    val dt = (now - last) / 1e9
                    val period = max(0.08, 45.0 / max(spd, 1.0))   // web animationDuration
                    spin = ((spin + (360.0 * dt / period)) % 360.0).toFloat()
                }
                last = now
            }
        }
    }
    Canvas(Modifier.width(44.dp).height(44.dp)) {
        val c = Offset(size.width / 2, size.height / 2)
        val rim = 4.dp.toPx()
        drawCircle(WheelHub, size.width / 2 - rim / 2)
        drawCircle(WheelRim, size.width / 2 - rim / 2, c, style = Stroke(rim))
        val r = 14.dp.toPx()                                   // web size-7 inner ring (28 dp)
        val angle = if (spd > 1.0) spin else 0f
        rotate(angle, c) {
            drawCircle(WheelFg.copy(alpha = 0.3f), r - 0.5f, c, style = Stroke(1.dp.toPx()))
            val half = 6.dp.toPx()                             // web h-3 spoke (12 dp)
            val sw = 2.dp.toPx()
            rotate((spd * 5).toFloat(), c) { drawLine(WheelFg.copy(alpha = 0.7f), Offset(c.x, c.y - half), Offset(c.x, c.y + half), sw, StrokeCap.Round) }
            drawLine(WheelFg.copy(alpha = 0.7f), Offset(c.x - half, c.y), Offset(c.x + half, c.y), sw, StrokeCap.Round)
        }
    }
}

@Composable
internal fun BrakeWheelPanelView(s: SimState, d: Derived) {
    val wheels = listOf(
        Triple("LI", s.wheelSpeeds.li, s.wheelBrakePressures.li), Triple("LO", s.wheelSpeeds.lo, s.wheelBrakePressures.lo),
        Triple("RI", s.wheelSpeeds.ri, s.wheelBrakePressures.ri), Triple("RO", s.wheelSpeeds.ro, s.wheelBrakePressures.ro),
    )
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(Modifier.fillMaxWidth().background(CardInset, RoundedCornerShape(8.dp)).border(1.dp, CardBorder, RoundedCornerShape(8.dp)).padding(12.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("MAIN GEAR WHEELS", color = WheelFg, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.14.em)
                Text("ANTI-SKID / BRAKE", color = Subtle, fontFamily = FontFamily.Monospace, fontSize = 9.sp)
            }
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                for ((label, speed, pressure) in wheels) {
                    Column(
                        Modifier.weight(1f).background(CardPanel, RoundedCornerShape(6.dp)).border(1.dp, CardBorder, RoundedCornerShape(6.dp)).padding(8.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        WheelDial(speed)
                        Text(label, color = WheelFg, fontFamily = FontFamily.Monospace, fontSize = 9.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 4.dp))
                        Text("${Math.round(speed)} KT", color = Subtle, fontFamily = FontFamily.Monospace, fontSize = 8.sp)
                        Text("${Math.round(pressure)} PSI", color = Subtle, fontFamily = FontFamily.Monospace, fontSize = 8.sp)
                    }
                }
            }
        }
        BrakeWheelReadout(d)
        Text("Wheel speeds and pressure modulation are a training visualization of the antiskid/autobrake relationship.", color = Subtle, fontSize = 9.sp)
    }
}
