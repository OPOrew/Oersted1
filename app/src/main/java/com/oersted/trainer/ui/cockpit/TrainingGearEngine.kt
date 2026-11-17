package com.oersted.trainer.ui.cockpit

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.oersted.trainer.sim.Derived
import com.oersted.trainer.sim.EngineStartTrainerRules
import com.oersted.trainer.sim.FuelAndGroundRules
import com.oersted.trainer.sim.SimActions
import com.oersted.trainer.sim.SimState
import com.oersted.trainer.sim.TrainerGearRules
import com.oersted.trainer.sim.TrainingConsoleRules
import com.oersted.trainer.ui.instruments.GearLever
import com.oersted.trainer.ui.panel.LightTone
import com.oersted.trainer.ui.panel.PanelCaptionLight
import com.oersted.trainer.ui.panel.MipEngineGauges
import com.oersted.trainer.ui.overhead.P5EngineStartKnobs
import com.oersted.trainer.ui.overhead.rememberP5
import com.oersted.trainer.ui.pedestal.PedestalThrustLevers
import com.oersted.trainer.ui.pedestal.ThrustLinkButton
import kotlin.math.PI
import kotlin.math.cos

/**
 * Landing Gear and Engine Start sections of the Training Console (routes/cockpit.tsx TrainingConsole,
 * LandingGearComponentView / LandingGearMechanismSvg in components/panel/Overhead.tsx, EngineStartTrainerPanel).
 * Rules are in [TrainerGearRules] and [EngineStartTrainerRules]. Not compiled in the sandbox; verify on CI.
 *
 * Deferred (documented in docs/HANDOFF.md): EngineCutaway and CompactEngineParams.
 */

private val CardBg = Color(0xFF090B0E)
private val CardLine = Color(0xFF39414B)
private val Subtle = Color(0xFF8F9AA5)
private val OkGreen = Color(0xFF65C798)
private val Red = Color(0xFFE24B4B)
private val Grey = Color(0xFF8995A1)

internal typealias Change = ((SimState) -> SimState) -> Unit
private typealias Note = (String, SimState.() -> Unit) -> Unit

@Composable
internal fun ActionButton(text: String, enabled: Boolean = true, onClick: () -> Unit, modifier: Modifier = Modifier.fillMaxWidth()) {
    OutlinedButton(onClick = onClick, enabled = enabled, modifier = modifier) {
        Text(text, style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
internal fun Chip(text: String, ok: Boolean, modifier: Modifier = Modifier) {
    Text(
        text,
        color = if (ok) OkGreen else Subtle,
        fontFamily = FontFamily.Monospace,
        fontSize = 9.sp,
        modifier = modifier
            .border(1.dp, if (ok) OkGreen.copy(alpha = 0.4f) else CardLine, RoundedCornerShape(4.dp))
            .padding(horizontal = 8.dp, vertical = 8.dp),
    )
}

/** web ComponentReadout: a small label over a mono value. */
@Composable
private fun Readout(label: String, value: String, modifier: Modifier = Modifier) {
    Column(
        modifier
            .border(1.dp, CardLine, RoundedCornerShape(4.dp))
            .padding(horizontal = 6.dp, vertical = 4.dp),
    ) {
        Text(label, color = Subtle, fontFamily = FontFamily.Monospace, fontSize = 8.sp)
        Text(value, color = Color(0xFFE6E1D2), fontFamily = FontFamily.Monospace, fontSize = 9.sp)
    }
}

// ───────────────────────────── Landing Gear ─────────────────────────────

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun LandingGearTrainerSection(s: SimState, d: Derived, change: Change, note: Note) {
    Text("Landing Gear", style = MaterialTheme.typography.titleMedium)
    val steering = TrainerGearRules.steering(d.noseWheelSteeringAngle)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Chip(TrainerGearRules.angleChip(d.noseWheelSteeringAngle), true)
        Chip(TrainerGearRules.sourceChip(d.noseWheelSteeringAvailable), d.noseWheelSteeringAvailable)
    }
    Spacer(Modifier.height(8.dp))
    GearComponentView(s, d, steering, change, note)
    Spacer(Modifier.height(8.dp))
    ActionButton("PARKING BRAKE · ${TrainingConsoleRules.onOff(s.parkingBrake)}", onClick = { change(TrainingConsoleRules::toggleParkingBrake) })
    Text("Servicing / Test", style = MaterialTheme.typography.labelLarge)
    ActionButton("Ground hydraulic servicing · ${TrainingConsoleRules.onOff(s.hydServicingConnected)}", onClick = { change(TrainingConsoleRules::toggleHydServicingConnected) })
    ActionButton("Ground-sensing test override · ${TrainingConsoleRules.onOff(s.groundSenseTest)}", onClick = { change(TrainingConsoleRules::toggleGroundSenseTest) })
    ActionButton("Airborne test override · ${TrainingConsoleRules.onOff(s.airborneTest)}", onClick = { change(TrainingConsoleRules::toggleAirborneTest) })
    ActionButton("Ground power cart (GPU) · ${TrainingConsoleRules.onOff(s.externalPowerConnected)}", onClick = { change(TrainingConsoleRules::toggleExternalPowerConnected) })
    ActionButton("Center tiller & pedals", onClick = { change(TrainingConsoleRules::centerTillerAndPedals) })
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun GearComponentView(s: SimState, d: Derived, steering: Double, change: Change, note: Note) {
    val pos = TrainerGearRules.clamp01(s.gearPos)
    val powered = TrainerGearRules.hydraulicAvailable(d.hydA)
    Column(Modifier.fillMaxWidth().background(CardBg, RoundedCornerShape(8.dp)).border(1.dp, CardLine, RoundedCornerShape(8.dp)).padding(10.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Column(Modifier.weight(1f)) {
                Text("LANDING GEAR — COMPONENT VIEW", color = Color(0xFFE6E1D2), fontSize = 10.sp)
                Text("Selector → hydraulic actuators → struts / locks → steering → brakes · TRANSIT = RED", color = Subtle, fontSize = 9.sp)
            }
            Chip(TrainerGearRules.hydLabel(powered), powered)
        }
        Spacer(Modifier.height(8.dp))
        GearMechanism(
            gearPos = pos,
            nose = d.gearPositions.nose,
            leftMain = d.gearPositions.leftMain,
            rightMain = d.gearPositions.rightMain,
            selector = s.gear,
            steeringAngle = steering,
            hydraulicAvailable = powered,
        )
        Spacer(Modifier.height(8.dp))
        // GearLeverP2: three lamp pairs and the real lever
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                GearLampRow("NOSE", d.gearLights.nose.red, d.gearLights.nose.green)
                GearLampRow("LEFT", d.gearLights.leftMain.red, d.gearLights.leftMain.green)
                GearLampRow("RIGHT", d.gearLights.rightMain.red, d.gearLights.rightMain.green)
            }
            Spacer(Modifier.padding(horizontal = 8.dp))
            GearLever(
                gear = s.gear,
                wow = s.wow,
                gearLeverOverride = s.gearLeverOverride,
                onRequest = { sel ->
                    val g = sel.gear
                    if (sel.locked) note(sel.message ?: "") { gear = g } else change { st -> st.copy().apply { gear = g } }
                },
            )
        }
        Spacer(Modifier.height(8.dp))
        ManualExtension(s, note)
        Spacer(Modifier.height(8.dp))
        val gl = d.gearLights
        val gp = d.gearPositions
        val rows = listOf(
            "GEAR POSITION" to TrainerGearRules.gearState(d.gearTransit, s.gear, d.gearDown, d.gearUp),
            "SELECTOR" to s.gear,
            "SELECTOR OVERRIDE" to TrainerGearRules.overrideText(s.gearLeverOverride),
            "GEAR WARNING" to TrainerGearRules.hornText(d.gearWarningHorn),
            "LEFT MAIN" to TrainerGearRules.legReadout(gp.leftMain, gl.leftMain.green, gl.leftMain.red),
            "NOSE" to TrainerGearRules.legReadout(gp.nose, gl.nose.green, gl.nose.red),
            "RIGHT MAIN" to TrainerGearRules.legReadout(gp.rightMain, gl.rightMain.green, gl.rightMain.red),
            "NOSE STEERING" to "${TrainerGearRules.toFixed0(steering)}°",
            "STEERING SOURCE" to TrainerGearRules.steeringSource(d.noseWheelSteeringAvailable),
        )
        rows.chunked(2).forEach { pair ->
            Row(Modifier.fillMaxWidth().padding(bottom = 4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                pair.forEach { (l, v) -> Readout(l, v, Modifier.weight(1f)) }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
        Text(
            "Use the actual LANDING GEAR selector. UP commands retraction and DN commands extension; OFF stops commanding movement and the " +
                "mechanism holds its current position. Each strut's shock strut is fixed on a pivot at its uppermost end: the main gear fans up " +
                "and inboard about a wing-root pivot into the wheel well, while the nose gear pivots forward about its own fuselage-mounted " +
                "pivot until it sits flush with the fuselage underside.",
            color = Subtle,
            fontSize = 9.sp,
        )
    }
}

@Composable
private fun GearLampRow(label: String, red: Boolean, green: Boolean) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, color = Subtle, fontSize = 8.sp, modifier = Modifier.padding(end = 2.dp))
        PanelCaptionLight("RED", red, LightTone.WARN)
        PanelCaptionLight("GRN", green, LightTone.OK)
    }
}

@Composable
private fun ManualExtension(s: SimState, note: Note) {
    val allowed = TrainerGearRules.manualAllowed(s.gear)
    Column(
        Modifier.fillMaxWidth().background(Color(0xFF11130F), RoundedCornerShape(6.dp)).border(1.dp, Color(0xFF45402F), RoundedCornerShape(6.dp)).padding(8.dp),
    ) {
        Text("CABIN FLOOR — MANUAL EXTENSION", color = Color(0xFFB7AB87), fontSize = 8.sp)
        Text(
            "Three red T-handles, aft/right of the aisle stand, in LEFT / NOSE / RIGHT order. Set the landing-gear lever to OFF/NEUTRAL or DN " +
                "before pulling and releasing the respective T-handle. The handle returns to stow; only the released gear free-falls to " +
                "down-and-locked; the other two gears do not move. Do not hold a T-handle extended during hydraulic gear operation.",
            color = Subtle,
            fontSize = 8.sp,
            modifier = Modifier.padding(bottom = 8.dp),
        )
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            TrainerGearRules.MANUAL_HANDLES.forEach { (label, key) ->
                val released = when (key) {
                    "nose" -> s.manualReleasedNose
                    "leftMain" -> s.manualReleasedLeftMain
                    else -> s.manualReleasedRightMain
                }
                val alpha = if (allowed) 1f else 0.45f
                Box(
                    Modifier
                        .weight(1f)
                        .height(80.dp)
                        .background(if (allowed) Color(0xFF170D0D) else Color(0xFF101318), RoundedCornerShape(4.dp))
                        .border(1.dp, if (allowed) Color(0xFF5A2525) else CardLine, RoundedCornerShape(4.dp))
                        .clickable(enabled = allowed) { pullHandle(s, key, note) },
                ) {
                    // red T-handle: a crossbar over a short stem
                    Box(Modifier.align(Alignment.TopCenter).padding(top = 8.dp).size(width = 48.dp, height = 8.dp).background(Color(0xFFB72F2F).copy(alpha = alpha), RoundedCornerShape(4.dp)))
                    Box(Modifier.align(Alignment.TopCenter).padding(top = 12.dp).size(width = 8.dp, height = 40.dp).background(Color(0xFFA92727).copy(alpha = alpha), RoundedCornerShape(bottomStart = 2.dp, bottomEnd = 2.dp)))
                    Column(Modifier.align(Alignment.BottomCenter).padding(bottom = 6.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(label, color = if (allowed) Color(0xFFE6E1D2) else Subtle, fontSize = 8.sp)
                        Text(TrainerGearRules.manualStatus(allowed, released), color = Subtle, fontFamily = FontFamily.Monospace, fontSize = 7.sp)
                    }
                }
            }
        }
    }
}

private fun pullHandle(s: SimState, key: String, note: Note) {
    if (!TrainerGearRules.manualAllowed(s.gear)) {
        val g = s.gear
        note(TrainerGearRules.MANUAL_INHIBITED_NOTE) { gear = g }
        return
    }
    note(TrainerGearRules.manualNote(key)) {
        when (key) {
            "nose" -> manualReleasedNose = true
            "leftMain" -> manualReleasedLeftMain = true
            else -> manualReleasedRightMain = true
        }
    }
}

// Colour for a lock lamp state from [TrainerGearRules.lockLamp] (0 green, 1 grey, 2 red).
private fun lampColor(state: Int): Color = when (state) {
    0 -> Color(0xFF55B98A)
    1 -> Color(0xFF6B7480)
    else -> Red
}

private fun DrawScope.txt(text: String, x: Float, y: Float, size: Float, color: Color, center: Boolean = false, mono: Boolean = false) {
    val paint = android.graphics.Paint().apply {
        isAntiAlias = true
        this.color = android.graphics.Color.argb((color.alpha * 255).toInt(), (color.red * 255).toInt(), (color.green * 255).toInt(), (color.blue * 255).toInt())
        textSize = size
        textAlign = if (center) android.graphics.Paint.Align.CENTER else android.graphics.Paint.Align.LEFT
        if (mono) typeface = android.graphics.Typeface.MONOSPACE
    }
    drawContext.canvas.nativeCanvas.drawText(text, x, y, paint)
}

/** web pivotArc: the dashed fan guide, drawn as an arc about (cx, cy). 0 deg is straight down, positive is clockwise. */
private fun DrawScope.pivotArc(cx: Float, cy: Float, r: Float, fromDeg: Float, toDeg: Float) {
    val path = Path()
    val (x0, y0) = TrainerGearRules.arcPoint(cx.toDouble(), cy.toDouble(), r.toDouble(), fromDeg.toDouble())
    path.moveTo(x0.toFloat(), y0.toFloat())
    path.arcTo(Rect(cx - r, cy - r, cx + r, cy + r), 90f + fromDeg, toDeg - fromDeg, false)
    drawPath(path, Color(0xFF4E5964).copy(alpha = 0.5f), style = Stroke(width = 2f, pathEffect = androidx.compose.ui.graphics.PathEffect.dashPathEffect(floatArrayOf(4f, 5f))))
}

private fun DrawScope.wheel(cx: Float, cy: Float, w: Float, h: Float, r: Float, stroke: Float, edge: Color, ribs: List<Float>, ribLen: Float) {
    drawRoundRect(Color(0xFF11151A), Offset(cx - w / 2, cy - h / 2), Size(w, h), CornerRadius(r))
    drawRoundRect(edge, Offset(cx - w / 2, cy - h / 2), Size(w, h), CornerRadius(r), style = Stroke(stroke))
    for (rx in ribs) drawLine(Color(0xFF343D46), Offset(cx + rx, cy - ribLen), Offset(cx + rx, cy + ribLen), strokeWidth = stroke * 0.6f)
}

/** Canvas port of LandingGearMechanismSvg (640 x 350 design units). */
@Composable
private fun GearMechanism(
    gearPos: Double,
    nose: Double,
    leftMain: Double,
    rightMain: Double,
    selector: String,
    steeringAngle: Double,
    hydraulicAvailable: Boolean,
) {
    val pos = TrainerGearRules.clamp01(gearPos).toFloat()
    val mains = listOf(TrainerGearRules.clamp01(leftMain), TrainerGearRules.clamp01(rightMain))
    val nosePos = TrainerGearRules.clamp01(nose)
    val moving = mains.any { TrainerGearRules.moving(it) } || TrainerGearRules.moving(nosePos)
    val extending = moving && selector == "DN"
    val retracting = moving && selector == "UP"
    val active = hydraulicAvailable && (moving || selector != "OFF")
    val wheelAngle = TrainerGearRules.steering(steeringAngle)
    Box(
        Modifier.fillMaxWidth().background(Color(0xFF14181D), RoundedCornerShape(6.dp)).border(1.dp, Color(0xFF39414B), RoundedCornerShape(6.dp)).padding(4.dp),
    ) {
        Canvas(Modifier.fillMaxWidth().aspectRatio(640f / 350f)) {
            val sc = this.size.width / 640f
            scale(sc, sc, pivot = Offset.Zero) {
                val line = Color(0xFF65717C)
                // aircraft support / wing
                val wing = Path().apply { moveTo(55f, 74f); quadraticTo(320f, 18f, 585f, 74f) }
                drawPath(wing, line, style = Stroke(18f, cap = StrokeCap.Round))
                drawLine(Color(0xFF87929E), Offset(55f, 74f), Offset(55f, 118f), 8f)
                drawLine(Color(0xFF87929E), Offset(585f, 74f), Offset(585f, 118f), 8f)
                for ((a, b) in listOf(Offset(120f, 65f) to Offset(75f, 132f), Offset(200f, 51f) to Offset(235f, 126f), Offset(440f, 51f) to Offset(405f, 126f), Offset(520f, 65f) to Offset(565f, 132f))) {
                    drawLine(Color(0xFF687581), a, b, 7f)
                }
                drawLine(Color(0xFF4F5964), Offset(120f, 65f), Offset(200f, 51f), 4f)
                drawLine(Color(0xFF4F5964), Offset(440f, 51f), Offset(520f, 65f), 4f)
                txt("AIRCRAFT GEAR SUPPORT / WING", 320f, 31f, 11f, Color(0xFFAEB7C0), center = true)
                // hydraulic feed / center manifold
                drawLine(if (active) Color(0xFF7C9BB4) else Color(0xFF46515C), Offset(320f, 45f), Offset(320f, 101f), 5f,
                    pathEffect = androidx.compose.ui.graphics.PathEffect.dashPathEffect(floatArrayOf(8f, 5f)))
                drawRoundRect(Color(0xFF303943), Offset(309f, 88f), Size(22f, 31f), CornerRadius(4f))
                drawRoundRect(Color(0xFF8B96A1), Offset(309f, 88f), Size(22f, 31f), CornerRadius(4f), style = Stroke(2f))
                txt("SELECTOR / ACTUATOR MANIFOLD", 342f, 106f, 9f, Color(0xFF8F9AA5))

                // main gear legs
                for (i in 0..1) {
                    val x = TrainerGearRules.MAIN_X[i].toFloat()
                    val p = mains[i]
                    val pivotY = TrainerGearRules.MAIN_PIVOT_Y.toFloat()
                    val angle = TrainerGearRules.mainAngle(i, p).toFloat()
                    pivotArc(x, pivotY, TrainerGearRules.GUIDE_RADIUS.toFloat(), 0f, angle)
                    rotate(angle, pivot = Offset(x, pivotY)) {
                        // actuator cylinder and piston
                        drawRoundRect(Color(0xFF4A5560), Offset(x - 16f, 92f), Size(32f, 72f), CornerRadius(8f))
                        drawRoundRect(Color(0xFF9AA5AF), Offset(x - 16f, 92f), Size(32f, 72f), CornerRadius(8f), style = Stroke(2f))
                        drawRoundRect(
                            Brush.horizontalGradient(listOf(Color(0xFF4F5B66), Color(0xFFD0D6DB), Color(0xFF4F5B66)), startX = x - 7f, endX = x + 7f),
                            Offset(x - 7f, 112f), Size(14f, 96f), CornerRadius(6f),
                        )
                        val hose = if (active) Color(0xFF6E8BA2) else Color(0xFF4C5761)
                        drawLine(hose, Offset(x - 30f, 111f), Offset(x - 30f, 151f), 3f)
                        drawLine(hose, Offset(x + 30f, 111f), Offset(x + 30f, 151f), 3f)
                        // main strut
                        drawLine(
                            Brush.verticalGradient(0f to Color(0xFFAEB8C2), 0.45f to Color(0xFF66727E), 1f to Color(0xFF252C33), startY = 184f, endY = 251f),
                            Offset(x, 184f), Offset(x, 251f), 18f, StrokeCap.Round,
                        )
                        drawLine(Color(0xFF78848F), Offset(x - 38f, 157f), Offset(x - 5f, 196f), 8f, StrokeCap.Round)
                        drawLine(Color(0xFF78848F), Offset(x + 38f, 157f), Offset(x + 5f, 196f), 8f, StrokeCap.Round)
                        // downlock / uplock mechanism
                        drawLine(Color(0xFFA1ABB4), Offset(x - 24f, 196f), Offset(x - 7f, 184f), 5f)
                        drawLine(Color(0xFFA1ABB4), Offset(x + 24f, 196f), Offset(x + 7f, 184f), 5f)
                        drawCircle(lampColor(TrainerGearRules.lockLamp(p)), 8f, Offset(x, 184f))
                        drawCircle(Color(0xFFC2C9CF), 8f, Offset(x, 184f), style = Stroke(2f))
                        // axle and twin wheels
                        drawLine(Color(0xFFA1ABB4), Offset(x - 52f, 252f), Offset(x + 52f, 252f), 13f, StrokeCap.Round)
                        val edge = if (p > 0.04) Color(0xFF9AA5B0) else Color(0xFF5B6570)
                        wheel(x - 39f, 273f, 46f, 62f, 16f, 5f, edge, listOf(-11f, 0f, 11f), 26f)
                        wheel(x + 39f, 273f, 46f, 62f, 16f, 5f, edge, listOf(-11f, 0f, 11f), 26f)
                    }
                    txt(if (i == 0) "LEFT MAIN GEAR" else "RIGHT MAIN GEAR", x, 311f, 9f, Color(0xFFAEB7C0), center = true)
                }

                // nose gear: fixed hinge, scales toward it as it retracts
                val nx = TrainerGearRules.NOSE_PIVOT_X.toFloat()
                val ny = TrainerGearRules.NOSE_PIVOT_Y.toFloat()
                drawCircle(Color(0xFF56616B), 7f, Offset(nx, ny))
                drawCircle(Color(0xFFCFD5DA), 7f, Offset(nx, ny), style = Stroke(2f))
                txt("FIXED HINGE", nx + 16f, ny - 8f, 9f, Color(0xFF8F9AA5))
                val cue = Color(0xFF3D4650).copy(alpha = 0.6f)
                drawLine(cue, Offset(nx + 90f, ny - 6f), Offset(nx + 90f, ny + 58f), 2f,
                    pathEffect = androidx.compose.ui.graphics.PathEffect.dashPathEffect(floatArrayOf(3f, 4f)))
                val head = Path().apply { moveTo(nx + 84f, ny + 50f); lineTo(nx + 90f, ny + 62f); lineTo(nx + 96f, ny + 50f) }
                drawPath(head, cue, style = Stroke(2f))
                txt("AWAY FROM", nx + 100f, ny + 16f, 8f, Color(0xFF8F9AA5))
                txt("VIEWER", nx + 100f, ny + 27f, 8f, Color(0xFF8F9AA5))
                scale(nosePos.toFloat(), nosePos.toFloat(), pivot = Offset(nx, ny)) {
                    drawRoundRect(Color(0xFF4A5560), Offset(310f, 98f), Size(20f, 65f), CornerRadius(6f))
                    drawRoundRect(Color(0xFF9AA5AF), Offset(310f, 98f), Size(20f, 65f), CornerRadius(6f), style = Stroke(2f))
                    drawRoundRect(
                        Brush.horizontalGradient(listOf(Color(0xFF4F5B66), Color(0xFFD0D6DB), Color(0xFF4F5B66)), startX = 315f, endX = 325f),
                        Offset(315f, 118f), Size(10f, 82f), CornerRadius(5f),
                    )
                    drawLine(
                        Brush.verticalGradient(0f to Color(0xFFAEB8C2), 0.45f to Color(0xFF66727E), 1f to Color(0xFF252C33), startY = 184f, endY = 226f),
                        Offset(320f, 184f), Offset(320f, 226f), 13f, StrokeCap.Round,
                    )
                    drawLine(Color(0xFF7D8994), Offset(320f, 211f), Offset(300f, 236f), 6f, StrokeCap.Round)
                    drawLine(Color(0xFF7D8994), Offset(320f, 211f), Offset(340f, 236f), 6f, StrokeCap.Round)
                    drawCircle(lampColor(TrainerGearRules.lockLamp(nosePos)), 7f, Offset(320f, 184f))
                    drawCircle(Color(0xFFC2C9CF), 7f, Offset(320f, 184f), style = Stroke(2f))
                    // steering assembly: the web's perspective rotateY is shown as a horizontal foreshortening about x = 320
                    val squeeze = cos(wheelAngle * PI / 180.0).toFloat()
                    scale(squeeze, 1f, pivot = Offset(320f, 184f)) {
                        drawLine(Color(0xFFA1ABB4), Offset(287f, 241f), Offset(353f, 241f), 10f, StrokeCap.Round)
                        drawLine(Color(0xFF7D8994), Offset(320f, 225f), Offset(320f, 252f), 7f, StrokeCap.Round)
                        val edge = if (nosePos > 0.04) Color(0xFF9AA5B0) else Color(0xFF5B6570)
                        wheel(300f, 259f, 26f, 50f, 9f, 4f, edge, listOf(-6f, 0f, 6f), 22f)
                        wheel(340f, 259f, 26f, 50f, 9f, 4f, edge, listOf(-6f, 0f, 6f), 22f)
                    }
                }
                txt("NOSE GEAR — ROTATES IN DEPTH ABOUT A FIXED PIVOT", 320f, 299f, 9f, Color(0xFFAEB7C0), center = true)

                // labels and motion state
                val lab = Color(0xFF9FAAB5)
                txt("MAIN GEAR ACTUATOR", 12f, 145f, 9f, lab)
                drawLine(Color(0xFF687581), Offset(105f, 142f), Offset(137f, 142f), 1f)
                txt("UPLOCK / DOWNLOCK", 438f, 145f, 9f, lab)
                drawLine(Color(0xFF687581), Offset(438f, 149f), Offset(505f, 180f), 1f)
                txt("HYDRAULIC EXTEND / RETRACT", 12f, 185f, 9f, lab)
                txt("NOSE STEERING LINKAGE", 438f, 185f, 9f, lab)
                drawLine(Color(0xFF687581), Offset(438f, 190f), Offset(346f, 232f), 1f)
                drawRoundRect(Color(0xFF101419), Offset(228f, 318f), Size(184f, 20f), CornerRadius(5f))
                drawRoundRect(Color(0xFF3E4852), Offset(228f, 318f), Size(184f, 20f), CornerRadius(5f), style = Stroke(1f))
                val tone = when (TrainerGearRules.labelTone(extending, retracting, pos.toDouble())) {
                    0 -> OkGreen
                    1 -> Grey
                    else -> Red
                }
                txt(TrainerGearRules.mechanismLabel(extending, retracting, pos.toDouble()), 320f, 332f, 10f, tone, center = true, mono = true)
            }
        }
    }
}

// ───────────────────────────── Engine Start ─────────────────────────────

@Composable
internal fun SubTitle(title: String, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(vertical = 4.dp).border(1.dp, CardLine, RoundedCornerShape(6.dp)).padding(8.dp)) {
        Text(title, color = Color(0xFFB7AB87), fontSize = 10.sp, modifier = Modifier.padding(bottom = 6.dp))
        content()
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun EngineStartTrainerSection(s: SimState, d: Derived, change: Change, cockpit: CockpitModel) {
    Text("Engine Start", style = MaterialTheme.typography.titleMedium)
    val nowMs = System.currentTimeMillis().toDouble()
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Chip(EngineStartTrainerRules.dcChip(d.dcPower), d.dcPower, Modifier.weight(1f))
        Chip(EngineStartTrainerRules.ductChip("L", d.leftDuctPsi), EngineStartTrainerRules.ductOk(d.leftDuctPsi), Modifier.weight(1f))
        Chip(EngineStartTrainerRules.ductChip("R", d.rightDuctPsi), EngineStartTrainerRules.ductOk(d.rightDuctPsi), Modifier.weight(1f))
    }
    // the real P5 ENGINE START knobs
    SubTitle("Engine start switches · P5") {
        P5EngineStartKnobs(rememberP5(cockpit))
        Spacer(Modifier.height(6.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            PanelCaptionLight("START VLV 1", d.startValveOpen1)
            PanelCaptionLight("IGN 1", d.ignition1On)
            PanelCaptionLight("START VLV 2", d.startValveOpen2)
            PanelCaptionLight("IGN 2", d.ignition2On)
        }
    }
    // the real main instrument panel engine gauges (EPR, N1, N2, fuel flow, oil, EGT, hydraulics)
    SubTitle("Engine gauges · main instrument panel") {
        BoxWithConstraints(Modifier.fillMaxWidth()) { MipEngineGauges(cockpit, maxWidth) }
    }
    // the real thrust levers cut out of the centre pedestal
    SubTitle("Thrust levers · center pedestal") {
        BoxWithConstraints(Modifier.fillMaxWidth()) { PedestalThrustLevers(cockpit, maxWidth) }
        Spacer(Modifier.height(6.dp))
        ThrustLinkButton(cockpit)
    }
    EngineBlock(1, s, d, change, nowMs)
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        ActionButton(EngineStartTrainerRules.batteryLabel(s.battery), onClick = { change(com.oersted.trainer.sim.ElectricalTrainerRules::toggleBattery) }, modifier = Modifier.weight(1f))
        ActionButton(EngineStartTrainerRules.groundAirLabel(s.groundPneumaticConnected), s.wow, { change(FuelAndGroundRules::toggleGroundAirCart) }, Modifier.weight(1f))
    }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        ActionButton(EngineStartTrainerRules.groundPowerLabel(s.externalPowerConnected), onClick = { change(FuelAndGroundRules::toggleGroundPowerCart) }, modifier = Modifier.weight(1f))
        ActionButton(EngineStartTrainerRules.apuLabel(s.apuMaster == "OFF", d.apuAvailable), onClick = { change(FuelAndGroundRules::toggleApuAndBleed) }, modifier = Modifier.weight(1f))
    }
    EngineBlock(2, s, d, change, nowMs)
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun EngineBlock(side: Int, s: SimState, d: Derived, change: Change, nowMs: Double) {
    val one = side == 1
    val n2 = if (one) s.n2_1 else s.n2_2
    val ff = if (one) s.ff1 else s.ff2
    val oil = if (one) s.oilPsi1 else s.oilPsi2
    val sw = if (one) s.start1 else s.start2
    val lever = if (one) s.lever1 else s.lever2
    val auto = if (one) s.autoStart1 else s.autoStart2
    val running = if (one) d.eng1Running else d.eng2Running
    val valve = if (one) d.startValveOpen1 else d.startValveOpen2
    val psi = if (one) d.leftDuctPsi else d.rightDuctPsi
    val fire = if (one) s.engine1FirePulled else s.engine2FirePulled
    val status = EngineStartTrainerRules.status(running, fire, auto, n2)
    SubTitle(EngineStartTrainerRules.subTitle(side, status)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ActionButton("START ENG $side", FuelAndGroundRules.startEnabled(running, auto, fire), { change { SimActions.startEngine(it, side, nowMs) } }, Modifier.weight(1f))
            ActionButton(
                "${FuelAndGroundRules.shutdownLabel(running, auto)} ENG $side",
                FuelAndGroundRules.shutdownEnabled(running, auto, n2),
                { change { SimActions.shutdownEngine(it, side, nowMs) } },
                Modifier.weight(1f),
            )
        }
        Spacer(Modifier.height(6.dp))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            PanelCaptionLight("START VLV $side", valve)
            PanelCaptionLight("START SW GRD", sw == "GRD")
            PanelCaptionLight("IDLE", lever)
            PanelCaptionLight("RUNNING", running, LightTone.ELEC)
        }
        Text(EngineStartTrainerRules.readoutLine(ff, oil, psi), color = Subtle, fontFamily = FontFamily.Monospace, fontSize = 8.sp, modifier = Modifier.padding(top = 6.dp))
        if (side == 2) Text(EngineStartTrainerRules.START_HINT, color = Subtle, fontSize = 10.sp, modifier = Modifier.padding(top = 6.dp))
    }
}
