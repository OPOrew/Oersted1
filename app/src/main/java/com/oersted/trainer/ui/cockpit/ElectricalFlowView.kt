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
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.oersted.trainer.sim.Derived
import com.oersted.trainer.sim.ElectricalFlowWires
import com.oersted.trainer.sim.ElectricalFlowWires.ElTone
import com.oersted.trainer.sim.ElectricalTrainerRules
import com.oersted.trainer.sim.FlowWires
import com.oersted.trainer.sim.SimState
import kotlin.math.hypot

/**
 * Port of components/panel/ElectricalPowerTrainer.tsx (ATA 24): header, "live electrical flow" diagram with the measured wire
 * layer (ElWireLayer incl. the diode symbols), the control buttons, relationships / notes and the "how to apply electrical power"
 * walkthrough. Wire geometry and the source / BTB logic live in [ElectricalFlowWires]; handlers in [ElectricalTrainerRules].
 * Compose only; verify on a device.
 */

private val Cyan4 = Color(0xFF22D3EE); private val Cyan1 = Color(0xFFCFFAFE); private val Cyan3 = Color(0xFF67E8F9)
private val Emer4 = Color(0xFF34D399); private val Emer1 = Color(0xFFD1FAE5); private val Emer3 = Color(0xFF6EE7B7)
private val Sky4 = Color(0xFF38BDF8); private val Sky1 = Color(0xFFE0F2FE); private val Sky3 = Color(0xFF7DD3FC)
private val Amb4 = Color(0xFFFBBF24); private val Amb1 = Color(0xFFFEF3C7); private val Amb3 = Color(0xFFFCD34D)
private val Vio4 = Color(0xFFA78BFA); private val Vio1 = Color(0xFFEDE9FE); private val Vio3 = Color(0xFFC4B5FD)
private val Ora4 = Color(0xFFFB923C); private val Ora1 = Color(0xFFFFEDD5); private val Ora3 = Color(0xFFFDBA74)
private val ElPanelBg = Color(0xFF181813)
private val ElPanelBorder = Color(0xFF5A5139)
private val ElDeep = Color(0xFF0D1013)
private val ElCard = Color(0xFF111419)

private fun ElTone.edge(): Color = when (this) { ElTone.SOURCE -> Cyan4; ElTone.AC -> Emer4; ElTone.DC -> Sky4; ElTone.STANDBY -> Amb4; ElTone.BREAKER -> Vio4; ElTone.ALT -> Ora4 }
private fun ElTone.text(): Color = when (this) { ElTone.SOURCE -> Cyan1; ElTone.AC -> Emer1; ElTone.DC -> Sky1; ElTone.STANDBY -> Amb1; ElTone.BREAKER -> Vio1; ElTone.ALT -> Ora1 }
private fun ElTone.wire(): Color = when (this) { ElTone.SOURCE -> Cyan3; ElTone.AC -> Emer3; ElTone.DC -> Sky3; ElTone.STANDBY -> Amb3; ElTone.BREAKER -> Vio3; ElTone.ALT -> Ora3 }

@Composable
private fun ElIcon(name: String?, color: Color, size: Dp) {
    val paths = remember(name) { (ElectricalIcons.paths[name] ?: emptyList()).map { PathParser().parsePathString(it).toPath() } }
    Canvas(Modifier.width(size).height(size)) {
        val sc = this.size.width / 24f
        withTransform({ scale(sc, sc, Offset.Zero) }) {
            for (p in paths) drawPath(p, color, style = Stroke(1.5f, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
    }
}

/** web `Node`. */
@Composable
private fun ElNode(geo: FlowGeo, id: String, icon: String, title: String, active: Boolean, tone: ElTone = ElTone.AC, subtitle: String? = null, compact: Boolean = false, modifier: Modifier = Modifier) {
    val fg = if (active) tone.text() else FlowSubtle
    val shape = RoundedCornerShape(8.dp)
    val base = modifier.flowId(geo, id)
    Column(
        (if (active) base.background(tone.edge().copy(alpha = 0.10f), shape).border(1.dp, tone.edge().copy(alpha = 0.6f), shape) else base.background(FlowInset, shape).border(1.dp, FlowBorder, shape))
            .padding(horizontal = if (compact) 6.dp else 8.dp, vertical = if (compact) 6.dp else 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
    ) {
        ElIcon(icon, fg, if (compact) 16.dp else 20.dp)
        Text(title.uppercase(), color = fg, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center, fontSize = if (compact) 7.sp else 9.sp, letterSpacing = if (compact) 0.06.em else 0.12.em, lineHeight = if (compact) 9.sp else 11.sp)
        if (subtitle != null) Text(subtitle.uppercase(), color = fg.copy(alpha = 0.8f), textAlign = TextAlign.Center, fontSize = if (compact) 6.sp else 7.sp, lineHeight = if (compact) 8.sp else 9.sp, modifier = Modifier.padding(top = if (compact) 2.dp else 4.dp))
        Text(if (active) "ENERGIZED" else "OFF", color = fg, fontFamily = FontFamily.Monospace, textAlign = TextAlign.Center, fontSize = if (compact) 6.sp else 7.sp, modifier = Modifier.padding(top = if (compact) 2.dp else 4.dp))
    }
}

private class ElRowScope { val cells = mutableListOf<Triple<Int, Int, @Composable (Modifier) -> Unit>>() ; fun cell(col: Int, span: Int = 1, content: @Composable (Modifier) -> Unit) { cells.add(Triple(col, span, content)) } }

/** One row of the web's 4-column grid (gap-x 16): cells are placed by start column and span. */
@Composable
private fun ElRow(colW: Dp, build: ElRowScope.() -> Unit) {
    val sc = ElRowScope().apply(build)
    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
        var x = 0.dp
        for ((col, span, content) in sc.cells) {
            val cx = (colW + 16.dp) * (col - 1)
            if (cx > x) Spacer(Modifier.width(cx - x))
            val w = colW * span + 16.dp * (span - 1)
            content(Modifier.width(w).fillMaxHeight())
            x = cx + w
        }
    }
}

@Composable
private fun ElWireLayer(wires: List<ElectricalFlowWires.ElWire>, modifier: Modifier) {
    val density = LocalDensity.current.density
    val tState = rememberInfiniteTransition(label = "elflow").animateFloat(0f, 10f, infiniteRepeatable(tween(900, easing = LinearEasing), RepeatMode.Restart), label = "dash")
    val paths = remember(wires) {
        wires.map { w -> Path().apply { w.pts.forEachIndexed { n, p -> if (n == 0) moveTo(p.x.toFloat(), p.y.toFloat()) else lineTo(p.x.toFloat(), p.y.toFloat()) } } }
    }
    Canvas(modifier) {
        val t = tState.value   // read in the draw phase only
        withTransform({ scale(density, density, Offset.Zero) }) {
            wires.forEachIndexed { i, w ->
                val col = if (w.active) w.tone.wire() else FlowSubtle
                val ga = if (w.active) 1f else 0.45f
                drawPath(paths[i], col.copy(alpha = (if (w.active) 0.35f else 0.8f) * ga), style = Stroke(1.25f, cap = StrokeCap.Round, join = StrokeJoin.Round))
                if (w.active) drawPath(paths[i], col, style = Stroke(1.5f, cap = StrokeCap.Round, join = StrokeJoin.Round, pathEffect = PathEffect.dashPathEffect(floatArrayOf(4f, 6f), 10f - t)))
                fun head(h: List<FlowWires.Pt>?) {
                    if (h == null) return
                    val hp = Path().apply { moveTo(h[0].x.toFloat(), h[0].y.toFloat()); lineTo(h[1].x.toFloat(), h[1].y.toFloat()); lineTo(h[2].x.toFloat(), h[2].y.toFloat()); close() }
                    drawPath(hp, col.copy(alpha = ga))
                }
                if (w.arrow) head(FlowWires.arrowHead(w.pts))
                if (w.arrowStart) head(FlowWires.arrowHead(w.pts.reversed()))
                if (w.diode) {
                    val a = w.pts.first(); val b = w.pts.last()
                    val mx = ((a.x + b.x) / 2).toFloat(); val my = ((a.y + b.y) / 2).toFloat()
                    val len = hypot(b.x - a.x, b.y - a.y).let { if (it == 0.0) 1.0 else it }
                    val ux = ((b.x - a.x) / len).toFloat(); val uy = ((b.y - a.y) / len).toFloat()
                    drawRect(ElDeep.copy(alpha = ga), Offset(mx - 4.5f, my - 4.5f), androidx.compose.ui.geometry.Size(9f, 9f))
                    val tri = Path().apply {
                        moveTo(mx + ux * 3.5f, my + uy * 3.5f)
                        lineTo(mx - ux * 3.5f - uy * 3.2f, my - uy * 3.5f + ux * 3.2f)
                        lineTo(mx - ux * 3.5f + uy * 3.2f, my - uy * 3.5f - ux * 3.2f)
                        close()
                    }
                    drawPath(tri, col.copy(alpha = ga))
                    drawLine(col.copy(alpha = ga), Offset(mx + ux * 3.5f - uy * 3.4f, my + uy * 3.5f + ux * 3.4f), Offset(mx + ux * 3.5f + uy * 3.4f, my + uy * 3.5f - ux * 3.4f), strokeWidth = 1.4f)
                }
                for (d in w.dots) drawCircle(col.copy(alpha = ga), 1.9f, Offset(d.x.toFloat(), d.y.toFloat()))
            }
        }
    }
}

@Composable
private fun ElControl(label: String, active: Boolean, modifier: Modifier, enabled: Boolean = true, tone: String = "normal", onClick: () -> Unit) {
    val c = if (active && tone == "source") Cyan4 else if (active && tone == "standby") Amb4 else Emer4
    val shape = RoundedCornerShape(6.dp)
    Text(
        label, textAlign = TextAlign.Center, fontSize = 8.sp, letterSpacing = 0.04.em, color = if (active) c.copy(alpha = 0.95f) else FlowFg,
        modifier = modifier.alpha(if (enabled) 1f else 0.4f)
            .background(if (active) c.copy(alpha = 0.10f) else FlowInset, shape).border(1.dp, if (active) c.copy(alpha = 0.6f) else FlowBorder, shape)
            .clickable(enabled = enabled, onClick = onClick).padding(horizontal = 8.dp, vertical = 10.dp),
    )
}

@Composable
private fun ElControlRows(vararg items: @Composable (Modifier) -> Unit) {
    for (pair in items.toList().chunked(2)) {
        Row(Modifier.fillMaxWidth().padding(bottom = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            for (it in pair) it(Modifier.weight(1f))
            if (pair.size == 1) Spacer(Modifier.weight(1f))
        }
    }
}

@Composable
private fun SubLabel(text: String) = Text(text.uppercase(), color = FlowSubtle, fontFamily = FontFamily.Monospace, fontSize = 6.sp, letterSpacing = 0.05.em, modifier = Modifier.padding(bottom = 4.dp))

@Composable
private fun CardTitle(text: String, size: Int = 8, tracking: Float = 0.14f, center: Boolean = false) =
    Text(text.uppercase(), color = FlowSubtle, fontSize = size.sp, letterSpacing = tracking.em, textAlign = if (center) TextAlign.Center else TextAlign.Start, modifier = if (center) Modifier.fillMaxWidth() else Modifier)

@Composable
internal fun ElectricalPowerFlowPanel(s: SimState, d: Derived, cockpit: CockpitModel, change: Change) {
    val src = ElectricalFlowWires.sources(d)
    val f = ElectricalFlowWires.flags(s, d)
    val summary = ElectricalFlowWires.sourceSummary(s, d, src)
    var modeKey by remember { mutableStateOf("GPU") }
    val mode = ElectricalFlowWires.MODES.first { it.key == modeKey }
    val gpuSub = if (s.externalPowerConnected) (if (s.groundPowerOn) (if (src.gpu) "ON BUS" else if (d.externalPowerNotInUse) "NOT IN USE" else "EPC PATH") else "CONNECTED / NOT ON BUS") else "CABLE DISCONNECTED"
    val apuSub = if (!d.apuAvailable) "APU NOT RUNNING" else if (d.apuGenOnBus) "ON BUS · L ${if (src.apuLeft) "ON" else "OFF"} / R ${if (src.apuRight) "ON" else "OFF"}" else if (d.apuGenOffBus) "OFF BUS" else "AVAILABLE"
    fun genSub(trip: Boolean, off: Boolean, bus: Boolean, run: Boolean) = if (trip) "PROTECTION TRIP" else if (off) "OFF BUS" else if (bus) "ON BUS" else if (run) "ENGINE RUNNING" else "ENGINE STOPPED"
    fun brkSub(bus: Boolean, trip: Boolean, off: Boolean) = if (bus) "CLOSED" else if (trip) "TRIPPED · PROTECTION" else if (off) "OPEN · OFF BUS" else "OPEN"
    fun act(o: ElectricalTrainerRules.Outcome) { val m = o.message; if (m == null) cockpit.applySim { o.state } else cockpit.applySimNote(m) { o.state } }

    val density = LocalDensity.current.density
    val geo = remember(density) { FlowGeo(density) }
    Column(Modifier.fillMaxWidth().padding(bottom = 8.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.fillMaxWidth().onGloballyPositioned { geo.root = it; geo.refresh() }) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                // header
                Row(Modifier.fillMaxWidth().background(ElPanelBg, RoundedCornerShape(8.dp)).border(1.dp, ElPanelBorder, RoundedCornerShape(8.dp)).padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        CardTitle("ATA 24 · Training panel", 8, 0.18f)
                        Text("ELECTRICAL POWER APPLICATION", color = FlowFg, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.04.em)
                    }
                    val hc = if (d.acPower) Emer4 else if (s.battery) Amb4 else FlowBorder
                    Text(summary, color = if (d.acPower) Emer1 else if (s.battery) Amb1 else FlowSubtle, fontFamily = FontFamily.Monospace, fontSize = 7.sp, modifier = Modifier.border(1.dp, hc.copy(alpha = if (d.acPower || s.battery) 0.5f else 1f), RoundedCornerShape(4.dp)).padding(horizontal = 8.dp, vertical = 4.dp))
                }

                Column(Modifier.fillMaxWidth().background(ElDeep, RoundedCornerShape(12.dp)).border(1.dp, FlowBorder, RoundedCornerShape(12.dp)).padding(12.dp)) {
                    CardTitle("Live electrical flow", 9, 0.16f)
                    Spacer(Modifier.height(12.dp))
                    BoxWithConstraints(Modifier.fillMaxWidth()) {
                        val colW = (maxWidth - 48.dp) / 4
                        Column(Modifier.flowId(geo, "e-grid"), verticalArrangement = Arrangement.spacedBy(32.dp)) {
                            // 1 · sources
                            ElRow(colW) {
                                cell(1) { m -> ElNode(geo, "e-gpu", "plug", "GROUND POWER", src.gpu, ElTone.SOURCE, gpuSub, modifier = m) }
                                cell(2) { m -> ElNode(geo, "e-apu", "turbine", "APU GENERATOR", src.apuAny, ElTone.SOURCE, apuSub, modifier = m) }
                                cell(3) { m -> ElNode(geo, "e-g1", "gen", "GENERATOR 1", d.generator1BusPowered, ElTone.SOURCE, genSub(d.generator1ProtectionTripped, d.gen1OffBus, d.generator1BusPowered, d.eng1Running), modifier = m) }
                                cell(4) { m -> ElNode(geo, "e-g2", "gen", "GENERATOR 2", d.generator2BusPowered, ElTone.SOURCE, genSub(d.generator2ProtectionTripped, d.gen2OffBus, d.generator2BusPowered, d.eng2Running), modifier = m) }
                            }
                            // 2 · breakers
                            ElRow(colW) {
                                cell(1) { m -> ElNode(geo, "e-epc", "breaker", "EXTERNAL POWER CONTACTOR", src.gpu, ElTone.BREAKER, if (src.gpu) "CLOSED" else "OPEN", modifier = m) }
                                cell(2) { m -> ElNode(geo, "e-apgb", "breaker", "APU GEN BREAKER", src.apuAny, ElTone.BREAKER, if (src.apuAny) "CONNECTED TO TIE BUS" else "OPEN", modifier = m) }
                                cell(3) { m -> ElNode(geo, "e-b1", "breaker", "GEN 1 BREAKER", d.generator1BusPowered, ElTone.BREAKER, brkSub(d.generator1BusPowered, d.generator1ProtectionTripped, d.gen1OffBus), modifier = m) }
                                cell(4) { m -> ElNode(geo, "e-b2", "breaker", "GEN 2 BREAKER", d.generator2BusPowered, ElTone.BREAKER, brkSub(d.generator2BusPowered, d.generator2ProtectionTripped, d.gen2OffBus), modifier = m) }
                            }
                            // 3 · tie bus + generator buses
                            ElRow(colW) {
                                cell(1, 2) { m -> ElNode(geo, "e-tie", "busbar", "TIE BUS", src.gpu || src.apuAny, ElTone.SOURCE, "EXTERNAL / APU SOURCE", modifier = m) }
                                cell(3) { m -> ElNode(geo, "e-gb1", "busbar", "GEN BUS 1", d.generator1BusPowered, ElTone.AC, if (d.generator1BusPowered) "115V AC GENERATOR BUS" else "NO GEN 1 SOURCE", modifier = m) }
                                cell(4) { m -> ElNode(geo, "e-gb2", "busbar", "GEN BUS 2", d.generator2BusPowered, ElTone.AC, if (d.generator2BusPowered) "115V AC GENERATOR BUS" else "NO GEN 2 SOURCE", modifier = m) }
                            }
                            // 4 · BTBs and transfer relays
                            ElRow(colW) {
                                cell(1) { m -> ElNode(geo, "e-btb1", "breaker", "BTB 1", f.btb1Closed, ElTone.BREAKER, "BUS TIE BREAKER", modifier = m) }
                                cell(2) { m -> ElNode(geo, "e-btb2", "breaker", "BTB 2", f.btb2Closed, ElTone.BREAKER, "BUS TIE BREAKER", modifier = m) }
                                cell(3) { m -> ElNode(geo, "e-r3", "relay", if (d.transferRelay1Alt) "R3 · ALTERNATE" else "R3 · NORMAL", d.generator1BusPowered || d.transferRelay1Alt, if (d.transferRelay1Alt) ElTone.ALT else ElTone.BREAKER, "TRANSFER RELAY", modifier = m) }
                                cell(4) { m -> ElNode(geo, "e-r4", "relay", if (d.transferRelay2Alt) "R4 · ALTERNATE" else "R4 · NORMAL", d.generator2BusPowered || d.transferRelay2Alt, if (d.transferRelay2Alt) ElTone.ALT else ElTone.BREAKER, "TRANSFER RELAY", modifier = m) }
                            }
                            // 5 · main buses and transfer buses
                            ElRow(colW) {
                                cell(1) { m -> ElNode(geo, "e-main1", "busbar", "MAIN BUS 1", f.btb1Closed, modifier = m) }
                                cell(2) { m -> ElNode(geo, "e-main2", "busbar", "MAIN BUS 2", f.btb2Closed, modifier = m) }
                                cell(3) { m -> ElNode(geo, "e-x1", "busbar", "TRANSFER BUS 1", d.transferBus1Powered, ElTone.AC, d.electricalSource1, modifier = m) }
                                cell(4) { m -> ElNode(geo, "e-x2", "busbar", "TRANSFER BUS 2", d.transferBus2Powered, ElTone.AC, d.electricalSource2, modifier = m) }
                            }
                            // 6 · AC users — includes System B electric hyd pumps (115V AC from transfer buses)
                            ElRow(colW) {
                                cell(3, 2) { m -> ElNode(geo, "e-acu", "acload", "AC USERS", d.acPower, ElTone.AC, "115V AC · B HYD ELEC 1 ${if (d.hydBPump1On) "ON" else "OFF"} · ELEC 2 ${if (d.hydBPump2On) "ON" else "OFF"}", modifier = m) }
                            }
                            // 7 · transformer-rectifiers
                            ElRow(colW) {
                                cell(1) { m -> ElNode(geo, "e-tr1", "tr", "TR 1", d.tr1Powered, ElTone.DC, "GEN BUS 1 → DC BUS 1", modifier = m) }
                                cell(3) { m -> ElNode(geo, "e-tr3", "tr", "TR 3", d.tr3Powered, ElTone.DC, "GEN BUS 2 · BACKUP", modifier = m) }
                                cell(4) { m -> ElNode(geo, "e-tr2", "tr", "TR 2", d.tr2Powered, ElTone.DC, "GEN BUS 2 → DC BUS 2", modifier = m) }
                            }
                            // 8 · DC buses
                            ElRow(colW) {
                                cell(1) { m -> ElNode(geo, "e-dc1", "busbar", "DC BUS 1", d.dcBus1Powered, ElTone.DC, "28V DC", modifier = m) }
                                cell(2, 2) { m -> ElNode(geo, "e-dct", "busbar", "DC TIE BUS", d.tr3Powered, ElTone.DC, "TR3 OUTPUT · BACKS UP DC BUS 1 & 2", modifier = m) }
                                cell(4) { m -> ElNode(geo, "e-dc2", "busbar", "DC BUS 2", d.dcBus2Powered, ElTone.DC, "28V DC", modifier = m) }
                            }
                            // 9 · DC users
                            ElRow(colW) {
                                cell(2, 2) { m -> ElNode(geo, "e-dcu", "dcload", "DC USERS", d.dcPower, ElTone.DC, "28V DC CONTROL / INDICATION", modifier = m) }
                            }
                        }
                    }

                    // 28-VAC · ground service · battery charging
                    Spacer(Modifier.height(16.dp))
                    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        @Composable fun chainCard(title: String, mod: Modifier, a: @Composable () -> Unit) {
                            Column(mod.fillMaxHeight().background(ElCard, RoundedCornerShape(8.dp)).border(1.dp, FlowBorder, RoundedCornerShape(8.dp)).padding(8.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                                CardTitle(title, 8, 0.14f, center = true); a()
                            }
                        }
                        chainCard("28-VAC distribution", Modifier.weight(1f)) {
                            ElNode(geo, "c28-a", "gen", "115-V AC SYSTEM", d.ac28vPowered, compact = true, modifier = Modifier.fillMaxWidth())
                            ElNode(geo, "c28-m", "xfmr", "28-VAC XFMR", d.ac28vPowered, ElTone.BREAKER, compact = true, modifier = Modifier.fillMaxWidth())
                            ElNode(geo, "c28-b", "acload", "28-VAC LOADS", d.ac28vPowered, compact = true, modifier = Modifier.fillMaxWidth())
                        }
                        chainCard("Ground service", Modifier.weight(1f)) {
                            ElNode(geo, "csv-a", "plug", "AC SOURCE", d.groundServiceBusPowered, ElTone.SOURCE, compact = true, modifier = Modifier.fillMaxWidth())
                            ElNode(geo, "csv-m", "breaker", "GROUND SERVICE", d.groundServiceBusPowered, ElTone.BREAKER, compact = true, modifier = Modifier.fillMaxWidth())
                            ElNode(geo, "csv-b", "busbar", "SERVICE BUS", d.groundServiceBusPowered, compact = true, modifier = Modifier.fillMaxWidth())
                        }
                        chainCard("Battery charging", Modifier.weight(1f)) {
                            ElNode(geo, "cch-a", if (d.groundServiceBusPowered) "busbar" else "gen", if (d.groundServiceBusPowered) "GROUND SERVICE BUS" else "AIRCRAFT AC SOURCE", d.batteryChargerPowered, compact = true, modifier = Modifier.fillMaxWidth())
                            ElNode(geo, "cch-m", "bolt", "BATTERY CHARGER", d.batteryChargerPowered, ElTone.BREAKER, compact = true, modifier = Modifier.fillMaxWidth())
                            ElNode(geo, "cch-b", "battery", "BATTERY", d.batteryChargerPowered, ElTone.STANDBY, compact = true, modifier = Modifier.fillMaxWidth())
                        }
                    }

                    // Standby power logic
                    Spacer(Modifier.height(16.dp))
                    Column(Modifier.fillMaxWidth().background(ElCard, RoundedCornerShape(8.dp)).border(1.dp, FlowBorder, RoundedCornerShape(8.dp)).padding(8.dp)) {
                        CardTitle("Standby power logic", 8, 0.14f, center = true)
                        Spacer(Modifier.height(8.dp))
                        val sb1 = f.sb1Live; val sb3 = f.sb3Live
                        @Composable fun pair(top: @Composable (Modifier) -> Unit, bottom: @Composable (Modifier) -> Unit, tall: @Composable (Modifier) -> Unit) {
                            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                                Column(Modifier.weight(2f), verticalArrangement = Arrangement.spacedBy(8.dp)) { top(Modifier.fillMaxWidth()); bottom(Modifier.fillMaxWidth()) }
                                tall(Modifier.weight(1f).fillMaxHeight())
                            }
                        }
                        Column(Modifier.fillMaxWidth().flowId(geo, "sb-grid"), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            pair(
                                { m -> Row(m, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                                    ElNode(geo, "sb1-l", "busbar", "TRANSFER BUS 1", sb1, compact = true, modifier = Modifier.weight(1f).fillMaxHeight())
                                    ElNode(geo, "sb1-m", "relay", "NORMAL", sb1, ElTone.BREAKER, compact = true, modifier = Modifier.weight(1f).fillMaxHeight()) } },
                                { m -> Row(m, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                                    ElNode(geo, "sb2-l", "battery", "BATTERY BUS", f.sb2Live, ElTone.ALT, compact = true, modifier = Modifier.weight(1f).fillMaxHeight())
                                    ElNode(geo, "sb2-m", "inverter", "STATIC INVERTER", f.sb2Live, ElTone.ALT, compact = true, modifier = Modifier.weight(1f).fillMaxHeight()) } },
                                { m -> ElNode(geo, "sb-ac", "busbar", "STANDBY AC BUS", d.standbyAcPowered, ElTone.STANDBY, d.standbyAcSource, compact = true, modifier = m) },
                            )
                            pair(
                                { m -> Row(m, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                                    ElNode(geo, "sb3-l", "busbar", "DC BUS 1", sb3, ElTone.DC, compact = true, modifier = Modifier.weight(1f).fillMaxHeight())
                                    ElNode(geo, "sb3-m", "relay", "NORMAL", sb3, ElTone.BREAKER, compact = true, modifier = Modifier.weight(1f).fillMaxHeight()) } },
                                { m -> Row(m, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                                    ElNode(geo, "sb4-l", "battery", "BATTERY BUS", f.sb4Live, ElTone.ALT, compact = true, modifier = Modifier.weight(1f).fillMaxHeight())
                                    ElNode(geo, "sb4-m", "relay", "TRANSFER", f.sb4Live, ElTone.ALT, compact = true, modifier = Modifier.weight(1f).fillMaxHeight()) } },
                                { m -> ElNode(geo, "sb-dc", "busbar", "STANDBY DC BUS", d.standbyDcPowered, ElTone.STANDBY, d.standbyDcSource, compact = true, modifier = m) },
                            )
                        }
                        Spacer(Modifier.height(24.dp))
                        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                            ElNode(geo, "sb-ess", "standby", "ESSENTIAL / STANDBY", d.standbyAcPowered || d.standbyDcPowered, ElTone.STANDBY, if (d.standbyAcPowered || d.standbyDcPowered) "STANDBY SOURCE AVAILABLE" else "NO STANDBY POWER", compact = true, modifier = Modifier.fillMaxWidth(0.667f))
                        }
                    }

                    // Controls — P5 forward overhead arrangement (AMM 24-54-0 Fig. 2)
                    Spacer(Modifier.height(16.dp))
                    Column(Modifier.fillMaxWidth().background(ElPanelBg, RoundedCornerShape(8.dp)).border(1.dp, ElPanelBorder, RoundedCornerShape(8.dp)).padding(8.dp)) {
                        Text("CONTROLS — P5 FORWARD OVERHEAD ARRANGEMENT (AMM 24-54-0 FIG. 2)", color = FlowSubtle, fontSize = 8.sp, letterSpacing = 0.14.em, modifier = Modifier.padding(bottom = 8.dp))
                        SubLabel("Ramp — external power cart (not a P5 switch)")
                        ElControlRows({ m -> ElControl("GROUND CART", s.externalPowerConnected, m, tone = "source") { change { ElectricalTrainerRules.toggleGroundCart(it) } } })
                        SubLabel("DC metering panel")
                        ElControlRows({ m -> ElControl("BATTERY", s.battery, m, tone = "standby") { change { ElectricalTrainerRules.toggleBattery(it) } } })
                        SubLabel("Electrical power panel — controls")
                        ElControlRows(
                            { m -> ElControl("GRD PWR ON", s.groundPowerOn, m, ElectricalTrainerRules.groundPowerEnabled(s), "source") { act(ElectricalTrainerRules.toggleGroundPower(s)) } },
                            { m -> ElControl("BUS TRANS AUTO", s.busTie, m) { change { ElectricalTrainerRules.toggleBusTie(it) } } },
                            { m -> ElControl("GEN 1", s.gen1, m, ElectricalTrainerRules.genEnabled(d, 1), "source") { change { ElectricalTrainerRules.toggleGen(it, d, 1) } } },
                            { m -> ElControl("APU CONTROL LEFT", s.apuLeftControl, m, d.apuAvailable, "source") { change { ElectricalTrainerRules.toggleApuControl(it, d, true) } } },
                            { m -> ElControl("APU CONTROL RIGHT", s.apuRightControl, m, d.apuAvailable, "source") { change { ElectricalTrainerRules.toggleApuControl(it, d, false) } } },
                            { m -> ElControl("GEN 2", s.gen2, m, ElectricalTrainerRules.genEnabled(d, 2), "source") { change { ElectricalTrainerRules.toggleGen(it, d, 2) } } },
                        )
                        SubLabel("Standby power panel")
                        ElControlRows(
                            { m -> ElControl("STBY OFF", s.standbyPower == "OFF", m) { change { ElectricalTrainerRules.setStandbyPower(it, "OFF") } } },
                            { m -> ElControl("STBY AUTO", s.standbyPower == "AUTO", m, tone = "standby") { change { ElectricalTrainerRules.setStandbyPower(it, "AUTO") } } },
                            { m -> ElControl("STBY BAT", s.standbyPower == "BAT", m, tone = "standby") { change { ElectricalTrainerRules.setStandbyPower(it, "BAT") } } },
                        )
                        SubLabel("APU control and monitor panel")
                        ElControlRows({ m -> ElControl("APU MASTER ${s.apuMaster}", s.apuMaster != "OFF", m) { act(ElectricalTrainerRules.toggleApuMaster(s, d)) } })
                        SubLabel("Ground service — fwd attendant panel (not P5; AMM 24-41-0)")
                        ElControlRows({ m -> ElControl("GROUND SERVICE", s.groundServiceOn, m, d.groundPowerAvailable || d.acPower) { change { ElectricalTrainerRules.toggleGroundService(it, d) } } })
                        val status = listOf(
                            "GPU: " + (if (src.gpu) "ON BUS" else if (d.externalPowerNotInUse) "NOT IN USE" else if (s.externalPowerConnected) "CONNECTED / NOT ON BUS" else "DISCONNECTED"),
                            "SERVICE: " + (if (d.groundServiceBusPowered) "BUS POWERED" else "OFF"),
                            "APU: " + (if (d.apuGenOnBus) "GEN ON BUS" else if (d.apuGenOffBus) "OFF BUS" else if (d.apuAvailable) "AVAILABLE" else "NOT RUNNING"),
                            "ENG 1: " + (if (d.generator1ProtectionTripped) "PROTECTION TRIP" else if (d.gen1OffBus) "OFF BUS" else if (d.eng1Running) "RUNNING" else "STOPPED"),
                            "ENG 2: " + (if (d.generator2ProtectionTripped) "PROTECTION TRIP" else if (d.gen2OffBus) "OFF BUS" else if (d.eng2Running) "RUNNING" else "STOPPED"),
                            "XFER 1: " + (if (d.transferRelay1Alt) "R3 ALT · GEN 2" else if (d.transferBus1Powered) d.electricalSource1 else "OFF"),
                            "XFER 2: " + (if (d.transferRelay2Alt) "R4 ALT · GEN 1" else if (d.transferBus2Powered) d.electricalSource2 else "OFF"),
                            "B HYD ELEC: " + (if (d.hydBPump1On || d.hydBPump2On) "1 ${if (d.hydBPump1On) "ON" else "OFF"} · 2 ${if (d.hydBPump2On) "ON" else "OFF"}" else "OFF"),
                            "STBY HYD AC: " + (if (d.standbyAcPowered) d.standbyAcSource else "NO STANDBY AC"),
                        )
                        Column(Modifier.padding(top = 2.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            for (pair in status.chunked(2)) Row(Modifier.fillMaxWidth()) { for (t in pair) Text(t, color = FlowSubtle, fontSize = 7.sp, modifier = Modifier.weight(1f)) }
                        }
                    }

                    Spacer(Modifier.height(8.dp))
                    Column(Modifier.fillMaxWidth().background(Color(0xFF0A0D10), RoundedCornerShape(4.dp)).border(1.dp, FlowBorder, RoundedCornerShape(4.dp)).padding(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        CardTitle("System relationships", 8, 0.14f)
                        for (t in listOf(
                            "GEN 1 FAIL → R3 ALT → GEN 2 PICKS UP XFER BUS 1", "GEN 2 FAIL → R4 ALT → GEN 1 PICKS UP XFER BUS 2",
                            "GPU / APU → EPC / APU GB → TIE BUS → BTB 1 / 2 (ONLY WHERE NEEDED)",
                            "BTBs CLOSE FOR THE EXTERNAL / APU SOURCE PATH; THEY ARE NOT THE ENGINE-GENERATOR CROSS-TRANSFER RELAYS",
                            "TRANSFER BUS 1 / 2 → SYSTEM B ELEC HYD PUMPS (115V AC) · GPU OR APU CAN POWER B ON THE GROUND",
                            "STANDBY AC (TB1 OR STATIC INVERTER) → STANDBY HYDRAULIC PUMP WHEN DEMANDED",
                            "GROUND SERVICE → SERVICE BUS · BATTERY CHARGER → BATTERY", "115V AC → 28V AC TRANSFORMERS → 28V AC LOADS",
                            "TR1 ← GEN BUS 1 · TR2 ← GEN BUS 2 · TR3 ← GEN BUS 2 (BACKUP)",
                            "TR3 → DC TIE BUS → (DIODES M8/M113) → BACKS UP DC BUS 1 & 2 IF TR1/TR2 FAILS",
                            "GEN PROTECTION → OV/UV · OF/UF · OVERCURRENT · DIFFERENTIAL → BREAKER TRIP AFTER PROTECTION DELAY",
                        )) Text(t, color = FlowSubtle, fontSize = 7.sp, lineHeight = 10.sp)
                    }
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "STANDBY AUTO REQUIRES BATTERY ON. WITH NORMAL POWER AVAILABLE, STANDBY FOLLOWS TRANSFER BUS 1 / DC BUS 1; WHEN THAT NORMAL INPUT IS LOST, THE BATTERY/STATIC-INVERTER BRANCH SUPPLIES STANDBY POWER. BAT SELECTS THAT BATTERY-BACKED STANDBY BRANCH. THE ENGINE-GENERATOR CROSS-TRANSFER IS SHOWN THROUGH R3/R4, NOT THROUGH THE BTBS.",
                        color = Amb1.copy(alpha = 0.8f), fontFamily = FontFamily.Monospace, fontSize = 7.sp, lineHeight = 10.sp,
                        modifier = Modifier.fillMaxWidth().background(Amb4.copy(alpha = 0.05f), RoundedCornerShape(4.dp)).border(1.dp, Amb4.copy(alpha = 0.25f), RoundedCornerShape(4.dp)).padding(8.dp),
                    )
                }

                // How to apply electrical power
                Column(Modifier.fillMaxWidth().background(ElPanelBg, RoundedCornerShape(12.dp)).border(1.dp, ElPanelBorder, RoundedCornerShape(12.dp)).padding(12.dp)) {
                    CardTitle("How to apply electrical power", 9, 0.16f)
                    Spacer(Modifier.height(8.dp))
                    for (row in ElectricalFlowWires.MODES.chunked(2)) {
                        Row(Modifier.fillMaxWidth().padding(bottom = 4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            for (m in row) {
                                val on = modeKey == m.key
                                Text(m.title, textAlign = TextAlign.Center, fontSize = 8.sp, color = if (on) Emer1 else FlowSubtle, letterSpacing = 0.04.em,
                                    modifier = Modifier.weight(1f).background(if (on) Emer4.copy(alpha = 0.10f) else Color(0xFF16191F), RoundedCornerShape(4.dp)).border(1.dp, if (on) Emer4.copy(alpha = 0.6f) else FlowBorder, RoundedCornerShape(4.dp))
                                        .clickable { modeKey = m.key }.padding(horizontal = 8.dp, vertical = 10.dp))
                            }
                        }
                    }
                    Text("PATH: ${mode.path}", color = Cyan1, fontFamily = FontFamily.Monospace, fontSize = 7.sp, modifier = Modifier.fillMaxWidth().padding(top = 4.dp).background(Cyan4.copy(alpha = 0.05f), RoundedCornerShape(4.dp)).border(1.dp, Cyan4.copy(alpha = 0.2f), RoundedCornerShape(4.dp)).padding(8.dp))
                    Column(Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        mode.steps.forEachIndexed { i, step ->
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Box(Modifier.width(16.dp).height(16.dp).background(Color(0xFF16191F), CircleShape).border(1.dp, FlowBorder, CircleShape), contentAlignment = Alignment.Center) {
                                    Text("${i + 1}", color = FlowSubtle, fontFamily = FontFamily.Monospace, fontSize = 7.sp)
                                }
                                Text(step, color = FlowFg, fontSize = 8.sp, lineHeight = 12.sp, modifier = Modifier.weight(1f))
                            }
                        }
                    }
                    Text(
                        "TRAINING NOTE: External power, APU generator and engine generators are not paralleled. TR1 ← Transfer Bus 1, TR2 ← Transfer Bus 2, TR3 ← Generator Bus 2 / valid No. 2 source path (backup to DC Bus 1 & 2). Standby AUTO follows Transfer Bus 1 / DC Bus 1; on loss the battery/static-inverter branch supplies standby AC/DC. System B electric hydraulic pumps take 115V AC from the transfer buses — GPU or APU can power them on the ground. The standby hydraulic pump uses standby AC, not the main AC aggregate alone.",
                        color = Amb1.copy(alpha = 0.8f), fontSize = 7.sp, lineHeight = 10.sp,
                        modifier = Modifier.fillMaxWidth().padding(top = 12.dp).background(Amb4.copy(alpha = 0.05f), RoundedCornerShape(4.dp)).border(1.dp, Amb4.copy(alpha = 0.3f), RoundedCornerShape(4.dp)).padding(8.dp),
                    )
                }
            }
            ElWireLayer(ElectricalFlowWires.wires(geo.rects, f), Modifier.matchParentSize())
        }
    }
}
