package com.oersted.trainer.ui.aircraft

import androidx.compose.foundation.Canvas
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.em
import com.oersted.trainer.data.SystemDef
import com.oersted.trainer.ui.common.Classic737Palette
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.oersted.trainer.data.Part
import com.oersted.trainer.sim.Derived
import com.oersted.trainer.sim.SimState

// Port of components/aircraft/AircraftPlan.tsx. Drawn in the web's 1200 x 520 viewBox, scaled to the available width.
// Animations of styles.css: .flow-active (dash 6 10, offset to -28 over 0.75 s), .glow-ok (opacity 0.55..1, 1.8 s ease-in-out) and
// .spool / .spool-slow (0.8 s / 2.4 s per turn). The web's `transform-origin: center` on the SVG <g> resolves against the whole view box, so
// there the spokes swing round a far point and are never seen turning at the hub; here they turn about the hub, as intended.
// Hover card: a finger held on a hotspot (no mouse hover on a phone); lifting it inside the touch slop selects the part.

private val Line = Color(0xFF3A4150)
private val FuseTop = Color(0xFF3A414C)
private val FuseMid = Color(0xFF2A3038)
private val FuseBottom = Color(0xFF1C2128)
private val WingFill = Color(0xFF3E4553)
private val WingEdge = Color(0xFF6A7382)
private val Dark = Color(0xFF1A1F26)
private val Glass = Color(0xFF9EC4D8)
private val CabinGlass = Color(0xFF8FB4C6)
private val Nacelle = Color(0xFF1B2027)
private val NacelleInner = Color(0xFF11151A)
private val Black = Color(0xFF0A0C0E)
private val Grey = Color(0xFF555555)
private val Pneumatic = Color(0xFFD4A574)
private val HydA = Color(0xFF5B8FD4)
private val HydB = Color(0xFF3DD68C)
private val Elec = Color(0xFF7EC8E3)
private val Fuel = Color(0xFF7DBA6A)
private val Ok = Color(0xFF3DD68C)
private val Caution = Color(0xFFE0A84A)
private val Warn = Color(0xFFE24B4B)
private val Accent = Color(0xFF8BA4B8)
private val Muted = Color(0xFF8D929C)

/** SYS_COLOR from the web component, keyed by system id. */
fun aircraftSystemColor(system: String): Color = when (system) {
    "apu" -> Fuel
    "powerplant" -> Pneumatic
    "hydraulics" -> HydA
    "aircond" -> Elec
    "pneumatic" -> Pneumatic
    "antiice" -> Pneumatic
    "cabin" -> Accent
    "flightcontrols" -> HydB
    "landinggear" -> Ok
    "fuel" -> Fuel
    "fire" -> Warn
    "electrical" -> Elec
    "navigation" -> Color(0xFF71A8FF)
    "lights" -> Color(0xFFE9E2A4)
    "oxygen" -> Color(0xFFD4A5F5)
    else -> Muted
}

@Composable
fun AircraftPlan(
    sim: SimState,
    derived: Derived,
    allParts: List<Part>,
    activeSystem: String?,
    selectedId: String?,
    onSelect: (String) -> Unit,
    compact: Boolean = false,
    systems: List<SystemDef> = emptyList(),
) {
    val parts = if (activeSystem != null) allParts.filter { it.system == activeSystem } else allParts
    val gearY = 18.0 * (1.0 - sim.gearPos)
    val door = sim.apuDoor
    val flap = sim.flaps / 40.0
    val spoil = sim.spoilerPos
    val spoilL = derived.controlSurfaces.spoilerL
    val spoilR = derived.controlSurfaces.spoilerR
    val clock = rememberInfiniteTransition(label = "plan")
    val dashT by clock.animateFloat(0f, 1f, infiniteRepeatable(tween(750, easing = LinearEasing), RepeatMode.Restart), label = "dash")
    val fastT by clock.animateFloat(0f, 1f, infiniteRepeatable(tween(800, easing = LinearEasing), RepeatMode.Restart), label = "spool")
    val slowT by clock.animateFloat(0f, 1f, infiniteRepeatable(tween(2400, easing = LinearEasing), RepeatMode.Restart), label = "spoolSlow")
    val glowT by clock.animateFloat(0f, 1f, infiniteRepeatable(tween(900, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "glow")
    var hoverId by remember { mutableStateOf<String?>(null) }

    BoxWithConstraints(
        Modifier
            .fillMaxWidth()
            .aspectRatio(1200f / 520f)
            .then(if (compact) Modifier.fillMaxWidth(0.8f) else Modifier),
    ) {
        Canvas(
            Modifier
                .matchParentSize()
                .pointerInput(parts) {
                    val slop = viewConfiguration.touchSlop
                    // hotspot under a touch: nearest part within 14 units, as before
                    fun hitAt(pos: Offset): Part? {
                        val k = size.width / 1200f
                        val hit = parts.minByOrNull { p ->
                            val dx = pos.x / k - p.x.toFloat()
                            val dy = pos.y / k - p.y.toFloat()
                            dx * dx + dy * dy
                        } ?: return null
                        val dx = pos.x / k - hit.x.toFloat()
                        val dy = pos.y / k - hit.y.toFloat()
                        return if (dx * dx + dy * dy <= 14f * 14f) hit else null
                    }
                    awaitEachGesture {
                        val down = awaitFirstDown(requireUnconsumed = false)
                        var hit = hitAt(down.position)
                        hoverId = hit?.id                       // web onMouseEnter
                        var tap = true
                        while (true) {
                            val ev = awaitPointerEvent()
                            val ch = ev.changes.firstOrNull { it.id == down.id } ?: break
                            if (ch.isConsumed) { tap = false; break }     // the page started scrolling
                            if ((ch.position - down.position).getDistance() > slop) tap = false
                            if (!ch.pressed) {
                                if (tap && hit != null) onSelect(hit.id)  // web onClick
                                break
                            }
                            hit = hitAt(ch.position)
                            hoverId = hit?.id
                        }
                        hoverId = null                          // web onMouseLeave
                    }
                },
        ) {
            val k = size.width / 1200f
            fun p(x: Double, y: Double) = Offset((x * k).toFloat(), (y * k).toFloat())
            fun w(v: Double) = (v * k).toFloat()

            // Hangar grid
            for (i in 0 until 24) {
                drawLine(Line.copy(alpha = 0.18f), p(i * 50.0, 0.0), p(i * 50.0, 520.0), strokeWidth = w(0.6))
            }
            for (i in 0 until 11) {
                drawLine(Line.copy(alpha = 0.18f), p(0.0, i * 50.0), p(1200.0, i * 50.0), strokeWidth = w(0.6))
            }

            // Bleed manifold and hydraulic lines
            val flowDash = { on: Boolean -> if (on) PathEffect.dashPathEffect(floatArrayOf(w(6.0), w(10.0)), -w(28.0) * dashT) else null }
            drawLine(
                Pneumatic.copy(alpha = if (derived.ductPsi > 8) 0.9f else 0.25f),
                p(430.0, 248.0), p(980.0, 248.0),
                strokeWidth = w(if (derived.ductPsi > 20) 4.0 else 2.0),
                pathEffect = flowDash(derived.ductPsi > 20),
            )
            drawLine(
                HydA.copy(alpha = if (sim.hydAPress > 400) 0.95f else 0.22f),
                p(500.0, 210.0), p(760.0, 210.0),
                strokeWidth = w(if (sim.hydAPress > 1500) 3.5 else 2.0),
                pathEffect = flowDash(sim.hydAPress > 1500),
            )
            drawLine(
                HydB.copy(alpha = if (sim.hydBPress > 400) 0.95f else 0.22f),
                p(500.0, 268.0), p(760.0, 268.0),
                strokeWidth = w(if (sim.hydBPress > 1500) 3.5 else 2.0),
                pathEffect = flowDash(sim.hydBPress > 1500),
            )

            // Wings
            val wing = Path().apply {
                moveTo(p(430.0, 248.0).x, p(430.0, 248.0).y)
                lineTo(p(780.0, 42.0).x, p(780.0, 42.0).y)
                lineTo(p(860.0, 58.0).x, p(860.0, 58.0).y)
                lineTo(p(620.0, 248.0).x, p(620.0, 248.0).y)
                lineTo(p(860.0, 438.0).x, p(860.0, 438.0).y)
                lineTo(p(780.0, 454.0).x, p(780.0, 454.0).y)
                close()
            }
            drawPath(wing, WingFill)
            drawPath(wing, WingEdge, style = Stroke(width = w(1.2)))

            // Trailing-edge flaps (left and right)
            drawPath(
                Path().apply {
                    moveTo(p(640.0, 198.0).x, p(640.0, 198.0).y)
                    lineTo(p(820.0, 78.0).x, p(820.0, 78.0).y)
                    lineTo(p(840.0, 78.0 + flap * 16).x, p(840.0, 78.0 + flap * 16).y)
                    lineTo(p(650.0, 210.0 + flap * 10).x, p(650.0, 210.0 + flap * 10).y)
                    close()
                },
                Dark.copy(alpha = (0.55 + flap * 0.4).toFloat()),
            )
            drawPath(
                Path().apply {
                    moveTo(p(640.0, 298.0).x, p(640.0, 298.0).y)
                    lineTo(p(820.0, 418.0).x, p(820.0, 418.0).y)
                    lineTo(p(840.0, 418.0 - flap * 16).x, p(840.0, 418.0 - flap * 16).y)
                    lineTo(p(650.0, 290.0 - flap * 10).x, p(650.0, 290.0 - flap * 10).y)
                    close()
                },
                Dark.copy(alpha = (0.55 + flap * 0.4).toFloat()),
            )

            // Flight spoilers
            drawRoundRect(
                HydB.copy(alpha = (0.3 + spoilL * 0.6).toFloat()),
                p(680.0, 118.0 - spoilL * 10),
                Size(w(70.0), w(10.0)),
                CornerRadius(w(2.0)),
            )
            drawRoundRect(
                HydB.copy(alpha = (0.3 + spoilR * 0.6).toFloat()),
                p(680.0, 392.0 + spoilR * 10),
                Size(w(70.0), w(10.0)),
                CornerRadius(w(2.0)),
            )

            // Fuselage
            val fuselage = Path().apply {
                moveTo(p(70.0, 248.0).x, p(70.0, 248.0).y)
                cubicTo(p(90.0, 210.0).x, p(90.0, 210.0).y, p(130.0, 196.0).x, p(130.0, 196.0).y, p(180.0, 196.0).x, p(180.0, 196.0).y)
                lineTo(p(980.0, 196.0).x, p(980.0, 196.0).y)
                cubicTo(p(1040.0, 196.0).x, p(1040.0, 196.0).y, p(1100.0, 214.0).x, p(1100.0, 214.0).y, p(1148.0, 248.0).x, p(1148.0, 248.0).y)
                cubicTo(p(1100.0, 282.0).x, p(1100.0, 282.0).y, p(1040.0, 300.0).x, p(1040.0, 300.0).y, p(980.0, 300.0).x, p(980.0, 300.0).y)
                lineTo(p(180.0, 300.0).x, p(180.0, 300.0).y)
                cubicTo(p(130.0, 300.0).x, p(130.0, 300.0).y, p(90.0, 286.0).x, p(90.0, 286.0).y, p(70.0, 248.0).x, p(70.0, 248.0).y)
                close()
            }
            drawPath(
                fuselage,
                Brush.verticalGradient(
                    colors = listOf(FuseTop, FuseMid, FuseBottom),
                    startY = p(0.0, 196.0).y,
                    endY = p(0.0, 300.0).y,
                ),
            )
            drawPath(fuselage, Color(0xFF7A8494), style = Stroke(width = w(1.4)))

            // Cockpit windows
            drawPath(
                Path().apply {
                    moveTo(p(118.0, 232.0).x, p(118.0, 232.0).y)
                    cubicTo(p(130.0, 224.0).x, p(130.0, 224.0).y, p(150.0, 220.0).x, p(150.0, 220.0).y, p(172.0, 222.0).x, p(172.0, 222.0).y)
                    lineTo(p(172.0, 228.0).x, p(172.0, 228.0).y)
                    cubicTo(p(150.0, 226.0).x, p(150.0, 226.0).y, p(132.0, 230.0).x, p(132.0, 230.0).y, p(122.0, 236.0).x, p(122.0, 236.0).y)
                    close()
                },
                Glass.copy(alpha = 0.55f),
            )
            drawPath(
                Path().apply {
                    moveTo(p(118.0, 264.0).x, p(118.0, 264.0).y)
                    cubicTo(p(130.0, 272.0).x, p(130.0, 272.0).y, p(150.0, 276.0).x, p(150.0, 276.0).y, p(172.0, 274.0).x, p(172.0, 274.0).y)
                    lineTo(p(172.0, 268.0).x, p(172.0, 268.0).y)
                    cubicTo(p(150.0, 270.0).x, p(150.0, 270.0).y, p(132.0, 266.0).x, p(132.0, 266.0).y, p(122.0, 260.0).x, p(122.0, 260.0).y)
                    close()
                },
                Glass.copy(alpha = 0.55f),
            )

            // Cabin windows
            for (i in 0 until 18) {
                val x = 210.0 + i * 38.0
                drawRoundRect(CabinGlass.copy(alpha = 0.35f), p(x, 208.0), Size(w(10.0), w(7.0)), CornerRadius(w(2.0)))
                drawRoundRect(CabinGlass.copy(alpha = 0.35f), p(x, 305.0), Size(w(10.0), w(7.0)), CornerRadius(w(2.0)))
            }

            // APU tail cone and inlet door
            drawPath(
                Path().apply {
                    moveTo(p(1088.0, 248.0).x, p(1088.0, 248.0).y)
                    cubicTo(p(1110.0, 236.0).x, p(1110.0, 236.0).y, p(1136.0, 236.0).x, p(1136.0, 236.0).y, p(1156.0, 248.0).x, p(1156.0, 248.0).y)
                    cubicTo(p(1136.0, 260.0).x, p(1136.0, 260.0).y, p(1110.0, 260.0).x, p(1110.0, 260.0).y, p(1088.0, 248.0).x, p(1088.0, 248.0).y)
                    close()
                },
                Color(0xFF252B34),
            )
            drawRoundRect(
                if (door > 0.9) Ok.copy(alpha = (0.5 + door * 0.5).toFloat()) else Dark.copy(alpha = (0.5 + door * 0.5).toFloat()),
                p(1094.0, 240.0 - door * 10),
                Size(w(22.0), w(16.0)),
                CornerRadius(w(2.0)),
            )
            drawRoundRect(
                Fuel.copy(alpha = (0.5 + door * 0.5).toFloat()),
                p(1094.0, 240.0 - door * 10),
                Size(w(22.0), w(16.0)),
                CornerRadius(w(2.0)),
                style = Stroke(width = w(1.0)),
            )

            // JT8D nacelles
            drawNacelle(k, 500.0, 92.0, derived.eng1Running, derived.startValveOpen1, sim.bleed1 && derived.eng1Running,
                if (sim.n2_1 > 40) fastT * 360f else if (sim.n2_1 > 8) slowT * 360f else 0f, if (derived.startValveOpen1) 0.55f + 0.45f * glowT else 1f)
            drawNacelle(k, 500.0, 404.0, derived.eng2Running, derived.startValveOpen2, sim.bleed2 && derived.eng2Running,
                if (sim.n2_2 > 40) fastT * 360f else if (sim.n2_2 > 8) slowT * 360f else 0f, if (derived.startValveOpen2) 0.55f + 0.45f * glowT else 1f)

            // Landing gear
            val gearAlpha = (0.35 + sim.gearPos * 0.65).toFloat()
            drawOvalAt(k, 210.0, 248.0, 10.0, 16.0 - gearY * 0.3, gearAlpha)
            drawOvalAt(k, 620.0, 318.0 + gearY, 18.0, 12.0, gearAlpha)
            drawOvalAt(k, 620.0, 178.0 - gearY, 18.0, 12.0, gearAlpha)

            // Pack bays
            drawRoundRect(
                if (derived.packLFlow) Elec.copy(alpha = 0.85f) else Dark.copy(alpha = 0.4f),
                p(548.0, 228.0), Size(w(36.0), w(14.0)), CornerRadius(w(3.0)),
            )
            drawRoundRect(
                if (derived.packRFlow) Elec.copy(alpha = 0.85f) else Dark.copy(alpha = 0.4f),
                p(548.0, 278.0), Size(w(36.0), w(14.0)), CornerRadius(w(3.0)),
            )

            // Hotspots for the parts of the active system
            for (part in parts) {
                val selected = selectedId == part.id
                val hovered = hoverId == part.id
                val radius = if (selected || hovered) 9.0 else 5.5
                drawCircle(
                    aircraftSystemColor(part.system).copy(alpha = if (selected) 1f else if (hovered) 0.9f else 0.7f),
                    radius = w(radius),
                    center = p(part.x, part.y),
                )
                drawCircle(Black, radius = w(radius), center = p(part.x, part.y), style = Stroke(width = w(1.5)))
            }
        }

        // Labels, placed in the same 1200-unit space as the drawing (y is the text top, roughly baseline minus 11)
        val unit = maxWidth / 1200f
        val labelColor = Muted
        Text("NOSE", color = labelColor, fontSize = 10.sp, modifier = Modifier.offset(x = unit * 86f, y = unit * 177f))
        Text("APU", color = labelColor, fontSize = 10.sp, modifier = Modifier.offset(x = unit * 1088f, y = unit * 177f))
        Text("ENG 1 · JT8D", color = labelColor, fontSize = 10.sp, modifier = Modifier.offset(x = unit * 488f, y = unit * 25f))
        Text("ENG 2 · JT8D", color = labelColor, fontSize = 10.sp, modifier = Modifier.offset(x = unit * 488f, y = unit * 489f))

        val hp = hoverId?.let { id -> allParts.firstOrNull { it.id == id } }
        if (hp != null) HoverCard(hp, systems.firstOrNull { it.id == hp.system }, Modifier.align(Alignment.BottomStart).padding(12.dp))
    }
}

private fun DrawScope.drawOvalAt(k: Float, cx: Double, cy: Double, rx: Double, ry: Double, alpha: Float) {
    val topLeft = Offset(((cx - rx) * k).toFloat(), ((cy - ry) * k).toFloat())
    val ovalSize = Size((2 * rx * k).toFloat(), (2 * ry * k).toFloat())
    drawOval(Color(0xFF111111).copy(alpha = alpha), topLeft = topLeft, size = ovalSize)
    drawOval(Color(0xFF888888).copy(alpha = alpha), topLeft = topLeft, size = ovalSize, style = Stroke(width = k))
}

/** EngineNacelle from the web component, drawn at its centre (cx, cy) in the 1200-unit space. */
/** EngineNacelle: [spokeDeg] is the .spool / .spool-slow turn of the compressor spokes (N2 > 40: 0.8 s a turn, N2 > 8: 2.4 s), [glow] the .glow-ok pulse of the start-valve lamp. */
private fun DrawScope.drawNacelle(k: Float, cx: Double, cy: Double, running: Boolean, start: Boolean, bleed: Boolean, spokeDeg: Float = 0f, glow: Float = 1f) {
    fun q(dx: Double, dy: Double) = Offset(((cx + dx) * k).toFloat(), ((cy + dy) * k).toFloat())
    fun w(v: Double) = (v * k).toFloat()

    drawRoundRect(Nacelle, q(-90.0, -22.0), Size(w(180.0), w(44.0)), CornerRadius(w(18.0)))
    drawRoundRect(Nacelle, q(-90.0, -22.0), Size(w(180.0), w(44.0)), CornerRadius(w(18.0)), style = Stroke(width = w(1.4)))
    drawRoundRect(NacelleInner, q(-70.0, -16.0), Size(w(130.0), w(32.0)), CornerRadius(w(14.0)))
    drawCircle(Black, radius = w(12.0), center = q(-58.0, 0.0))
    drawCircle(if (running) Ok else Grey, radius = w(12.0), center = q(-58.0, 0.0), style = Stroke(width = w(1.0)))
    val spoke = if (running) Ok else Color(0xFF666666)
    rotate(spokeDeg, pivot = q(-58.0, 0.0)) {
        drawLine(spoke, q(-58.0, -8.0), q(-58.0, 8.0), strokeWidth = w(1.2))
        drawLine(spoke, q(-66.0, 0.0), q(-50.0, 0.0), strokeWidth = w(1.2))
    }
    if (start) drawCircle(Caution.copy(alpha = glow), radius = w(6.0), center = q(70.0, 0.0))
    if (bleed) drawCircle(Pneumatic, radius = w(4.0), center = q(40.0, -18.0))
}

/** web HoverCard: `absolute bottom-3 left-3 max-w-sm rounded-lg border border-border bg-raised/95 px-3 py-2`. */
@Composable
private fun HoverCard(part: Part, sys: SystemDef?, modifier: Modifier = Modifier) {
    Column(
        modifier
            .widthIn(max = 384.dp)
            .background(Classic737Palette.Raised.copy(alpha = 0.95f), RoundedCornerShape(8.dp))
            .border(BorderStroke(1.dp, Classic737Palette.Border), RoundedCornerShape(8.dp))
            .padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        Text("ATA ${part.ata} · ${sys?.short ?: ""}".uppercase(), color = Classic737Palette.Subtle, fontSize = 11.sp, letterSpacing = 0.16.em)
        Text(part.name, color = Classic737Palette.Fg, fontSize = 14.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(top = 2.dp))
        Text(part.function, color = Classic737Palette.Muted, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 4.dp))
    }
}
