package com.oersted.trainer.ui.cockpit

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.oersted.trainer.sim.Derived
import com.oersted.trainer.sim.FlowWires.Tone
import com.oersted.trainer.sim.PneumaticFlowWires
import com.oersted.trainer.sim.SimState
import kotlin.math.floor

/**
 * Port of PneumaticTrainerPanel / PneuEngineSection (routes/cockpit.tsx): two engine bleed sections, the manifold row with the
 * isolation valve, ground cart and APU chain in the centre column, and the user rows with the cabin inflow node. Wires come from
 * [PneumaticFlowWires.wires]. The real P5 bleed panel and buttons live in the section above this drawing. Compose only.
 */

private fun rnd(v: Double) = floor(v + 0.5).toLong()

private class Grid3Scope {
    val cells = mutableListOf<Pair<Int, @Composable (Modifier) -> Unit>>()
    fun cell(span: Int, content: @Composable (Modifier) -> Unit) { cells.add(span to content) }
}

/** web `grid grid-cols-3 gap-x-3`: cells declared with cell(span) { modifier -> ... }; heights stretch to the tallest cell. */
@Composable
private fun Grid3(build: Grid3Scope.() -> Unit) {
    val scope = Grid3Scope().apply(build)
    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        for ((span, content) in scope.cells) content(Modifier.weight(span.toFloat()).fillMaxHeight())
    }
}

private data class PChip(val icon: String, val title: String, val sub: String, val on: Boolean, val liveText: String, val offText: String)

@Composable
private fun PneuEngineSection(
    geo: FlowGeo, k: String, tone: Tone, title: String, run: Boolean, open: Boolean, trip: Boolean, swOn: Boolean,
    turning: Boolean, prvOpen: Boolean, startOn: Boolean, modifier: Modifier,
) {
    val c = tone.color()
    val valveSub = if (!swOn) "SWITCH OFF" else if (trip) "CLOSED · OVERHEAT TRIP" else if (!run) "SWITCH ON · NO ENGINE AIR" else "SWITCH ON · DELIVERING"
    Column(
        modifier.flowId(geo, "e$k-sec").background(Color(0xFF0B1015), RoundedCornerShape(8.dp)).border(1.dp, c.copy(alpha = 0.35f), RoundedCornerShape(8.dp))
            .padding(start = 30.dp, end = 30.dp, top = 8.dp, bottom = 20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Column(Modifier.fillMaxWidth().background(c.copy(alpha = 0.05f), RoundedCornerShape(6.dp)).border(1.dp, c.copy(alpha = 0.4f), RoundedCornerShape(6.dp)).padding(horizontal = 6.dp, vertical = 4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(title, color = c, fontSize = 9.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.12.em)
            Text("ATA 36 · ENGINE BLEED → ${if (k == "1") "LEFT" else "RIGHT"} MANIFOLD", color = FlowSubtle, fontSize = 5.sp, letterSpacing = 0.08.em)
        }
        Grid3 {
            cell(1) { m -> FlowNode(geo, "e$k-8m", "engine", "8TH STAGE · MAIN DUCT", run, tone, "CHECK VALVE", compact = true, liveText = "PRESSURE", offText = "OFF", modifier = m) }
            cell(1) { m -> FlowNode(geo, "e$k-13", "valve", "13TH STAGE MSOV", run, tone, "DEMAND · RELIEF ≈106 PSI", compact = true, liveText = "ON DEMAND", offText = "OFF", modifier = m) }
            cell(1) { m -> FlowNode(geo, "e$k-8b", "engine", "8TH STAGE · BYPASS DUCT", run, tone, "CHECK VALVE · NO PRECOOLER", compact = true, liveText = "PRESSURE", offText = "OFF", modifier = m) }
        }
        Grid3 {
            cell(2) { m -> FlowNode(geo, "e$k-pre", "hx", "PRECOOLER / HEAT EXCHANGER", run, tone, "8TH MAIN DUCT + 13TH STAGE MERGE", compact = true, liveText = "PRESSURE", offText = "OFF", modifier = m) }
            cell(1) { m -> FlowNode(geo, "e$k-fan", "engine", "FAN AIR · PRECOOLER VALVE", run, tone, "EXIT-TEMP CONTROL ≈450°F", compact = true, liveText = "COOLING", offText = "OFF", modifier = m) }
        }
        Grid3 {
            cell(1) { m -> FlowNode(geo, "e$k-ovh", "gauge", "OVERHEAT SWITCH", trip, Tone.STANDBY, "≈490°F · TRIP LIGHT", compact = true, liveText = "TRIPPED", offText = "NORMAL", modifier = m) }
            cell(2) { m -> FlowNode(geo, "e$k-valve", "shutoff", "ENGINE $k BLEED AIR VALVE", open, tone, valveSub, compact = true, liveText = "OPEN", offText = "CLOSED", modifier = m) }
        }
        Grid3 {
            cell(2) { m -> FlowNode(geo, "e$k-ptx", "gauge", "BLEED DUCT · PRESSURE TRANSMITTER", open, tone, if (open) "≈44 PSI" else "0 PSI", compact = true, liveText = "FLOW", offText = "NO FLOW", modifier = m) }
            cell(1) { m -> FlowNode(geo, "e$k-tap", "reservoir", "TO HYD RESERVOIR PRESS", open, tone, "ATA 29 · FILTER → REGULATOR", compact = true, liveText = "SUPPLYING", offText = "NO AIR", modifier = m) }
        }
        // Pressure Ratio Bleed Control — compressor anti-surge bleed (automatic, no cockpit switch)
        Grid3 {
            cell(1) { m -> FlowNode(geo, "e$k-sns", "gauge", "Pt2 · Ps3 PRESSURE SENSE", turning, tone, "FRONT-COMPRESSOR RATIO", compact = true, liveText = "SENSING", offText = "NO SIGNAL", modifier = m) }
            cell(1) { m -> FlowNode(geo, "e$k-prv", "module", "PRESSURE RATIO BLEED CONTROL", prvOpen, Tone.STANDBY, if (prvOpen) (if (startOn) "START-BLEED OVERRIDE · PS4 AIR" else "LOW–MID POWER · COMMANDING BLEED") else "HIGH POWER · BLEED CLOSED", compact = true, liveText = "BLEEDING", offText = "CLOSED", modifier = m) }
            cell(1) { m -> FlowNode(geo, "e$k-srg", "valve", "COMPRESSOR SURGE-BLEED VALVES", prvOpen, tone, "ANTI-STALL · PS4 ACTUATED", compact = true, liveText = "OPEN", offText = "CLOSED", modifier = m) }
        }
        Grid3 {
            cell(1) { m -> FlowNode(geo, "e$k-cmp", "engine", "ENGINE $k COMPRESSOR", turning, tone, "Pt2 INLET · Ps3 / Ps4 TAPS", compact = true, liveText = "TURNING", offText = "STOPPED", modifier = m) }
            cell(1) { m -> FlowNode(geo, "e$k-ovr", "valve", "STARTER VALVE OVERRIDE", startOn, Tone.STANDBY, "OPENS BLEEDS DURING START", compact = true, liveText = "OVERRIDE", offText = "NORMAL", modifier = m) }
            cell(1) { m -> FlowNode(geo, "e$k-dmp", "connection", "FAN DISCHARGE DUCT", prvOpen, tone, "SURGE-BLEED DUMP", compact = true, liveText = "DUMPING", offText = "NO FLOW", modifier = m) }
        }
    }
}

@Composable
private fun UsersCol(geo: FlowGeo, k: String, tone: Tone, chips: List<PChip>, modifier: Modifier) {
    Column(modifier.flowId(geo, "u$k-grp"), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        chips.chunked(2).forEachIndexed { row, pair ->
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                pair.forEachIndexed { j, ch ->
                    FlowNode(geo, "u$k-${row * 2 + j}", ch.icon, ch.title, ch.on, tone, ch.sub, compact = true, liveText = ch.liveText, offText = ch.offText, modifier = Modifier.weight(1f).fillMaxHeight())
                }
            }
        }
    }
}

private val CENTRE_W: Dp = 130.dp

@Composable
internal fun PneumaticFlowDiagram(s: SimState, d: Derived) {
    val run1 = d.eng1Running
    val run2 = d.eng2Running
    val open1 = d.bleed1Available
    val open2 = d.bleed2Available
    val trip1 = s.bleedTrip1
    val trip2 = s.bleedTrip2
    // Derived does not expose the APU bleed state; mirror derive.ts (apuBleedOpen) from the sim state.
    val apuOn = d.apuAvailable && s.apuBleed && s.apuBleedValve > 0.7
    val groundOn = s.groundPneumaticConnected   // same rule as derive.ts (groundBleed): right manifold only
    val leftLive = d.leftManifold
    val rightLive = d.rightManifold
    val isoOpen = d.isolationOpen
    val packL = d.packLFlow
    val packR = d.packRFlow
    val psiL = rnd(d.leftDuctPsi)
    val psiR = rnd(d.rightDuctPsi)
    fun src(parts: List<Pair<Boolean, String>>) = parts.filter { it.first }.joinToString(" · ") { it.second }.ifEmpty { "NO SOURCE" }
    val srcL = src(listOf(open1 to "ENG 1", apuOn to "APU", (isoOpen && (open2 || groundOn)) to "XFEED"))
    val srcR = src(listOf(open2 to "ENG 2", groundOn to "GND", (isoOpen && (open1 || apuOn)) to "XFEED"))
    val purgeOk = s.wow || s.flaps > 0
    // Pressure Ratio Bleed Control (UI-only model): automatic; surge-bleed valves open at low-to-mid power and while the starter valve overrides.
    val start1 = d.startValveOpen1
    val start2 = d.startValveOpen2
    val turn1 = run1 || start1
    val turn2 = run2 || start2
    val prv1 = start1 || (run1 && s.n2_1 < PneumaticFlowWires.PRV_CLOSE_N2)
    val prv2 = start2 || (run2 && s.n2_2 < PneumaticFlowWires.PRV_CLOSE_N2)
    val flags = PneumaticFlowWires.Flags(
        run1, run2, open1, open2, trip1, trip2, d.bleed13Available1, d.bleed13Available2, leftLive, rightLive, isoOpen, apuOn, groundOn,
        packL, packR, turn1, turn2, prv1, prv2, start1, start2,
    )

    fun packSub(sw: Boolean, trip: Boolean, flow: Boolean) = if (flow) "OPEN · SCHEDULED FLOW" else if (!sw) "SWITCH OFF" else if (trip) "TRIPPED" else "SWITCH ON · NO / LOW PRESSURE"
    fun sideChips(left: Boolean): List<PChip> {
        val n = if (left) 1 else 2
        val live = if (left) leftLive else rightLive
        val pack = if (left) packL else packR
        val open = if (left) open1 else open2
        val start = if (left) d.startValveOpen1 else d.startValveOpen2
        val ai = if (left) s.antiIce1 else s.antiIce2
        val packSw = if (left) s.packL else s.packR
        val packTrip = if (left) s.packTripL else s.packTripR
        val startSw = if (left) s.startValve1 else s.startValve2
        val startC = PChip("valve", "ENG $n STARTER VALVE", if (start) "OPEN · STARTER SUPPLIED" else if (!startSw) "CLOSED · START VALVE SWITCH OFF" else if (!d.dcPower) "CLOSED · NO DC POWER" else "CLOSED · NEEDS ≥30 PSI", start, "OPEN", "CLOSED")
        val aiC = PChip("valve", "WING THERMAL ANTI-ICE", "SWITCH ${if (ai) "ON" else "OFF"}", ai && live, "HEATING", "OFF")
        val cleanerC = PChip("filter", "AIR CLEANER · PURGE VALVE", if (pack && open) (if (purgeOk) "PURGING · GND / FLAPS EXT" else "CLEANING · PURGE CLOSED") else "ENGINE BLEED · GND / FLAPS", pack && open, "CLEANING", "OFF")
        val pvC = PChip("valve", "${if (left) "L" else "R"} PACK VALVE", packSub(packSw, packTrip, pack), pack, "OPEN", "CLOSED")
        val tfOpen = (if (left) d.packLTurbofanValve else d.packRTurbofanValve) > 0.12
        val tfC = PChip("valve", "TURBOFAN VALVE", if (tfOpen) "OPEN · ≤~33 PSI / GROUND" else "CLOSED · RAM AIR / FLIGHT", tfOpen, "OPEN", "CLOSED")
        val packC = PChip("hx", "${if (left) "L" else "R"} AIR COND PACK", "ACM · HEAT EXCHANGERS", pack, "COOLING", "OFF")
        return if (left) listOf(startC, aiC, cleanerC, pvC, tfC, packC) else listOf(startC, aiC, pvC, cleanerC, packC, tfC)
    }

    FlowRoot(Modifier.fillMaxWidth(), wires = { PneumaticFlowWires.wires(it, flags) }) { geo ->
        Column(Modifier.fillMaxWidth().padding(horizontal = 4.dp).padding(bottom = 8.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(56.dp)) {
                PneuEngineSection(geo, "1", Tone.A, "ENGINE 1 · LEFT", run1, open1, trip1, s.bleed1, turn1, prv1, start1, Modifier.weight(1f).fillMaxHeight())
                PneuEngineSection(geo, "2", Tone.B, "ENGINE 2 · RIGHT", run2, open2, trip2, s.bleed2, turn2, prv2, start2, Modifier.weight(1f).fillMaxHeight())
            }

            // Manifolds with the isolation valve, ground connector and APU supply in the centre column
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                FlowNode(geo, "pn-lm", "manifold", "LEFT MANIFOLD", leftLive, Tone.A, "$psiL PSI · $srcL", modifier = Modifier.weight(1f).fillMaxHeight())
                Column(Modifier.width(CENTRE_W), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    FlowNode(geo, "pn-iso", "valve", "ISOLATION VALVE", isoOpen, Tone.GROUND, "${s.isolation} SWITCH", compact = true, liveText = "OPEN", offText = "CLOSED", modifier = Modifier.fillMaxWidth())
                    FlowNode(geo, "pn-dual", "gauge", "DUAL BLEED LIGHT", d.dualBleed, Tone.STANDBY, "APU + ENG + ISO OPEN", compact = true, liveText = "ON", offText = "OFF", modifier = Modifier.fillMaxWidth())
                    FlowNode(geo, "pn-gc", "cart", "GROUND AIR CART", groundOn, Tone.GROUND, if (groundOn) "${rnd(s.groundPneumaticPsi)} PSI" else "GROUND ONLY", compact = true, liveText = "CONNECTED", offText = "OFF", modifier = Modifier.fillMaxWidth())
                    FlowNode(geo, "pn-gk", "connection", "GROUND CONNECTOR + CHECK", groundOn, Tone.GROUND, "RIGHT PACK BAY · ≤60 PSIG", compact = true, liveText = "FLOW", offText = "OFF", modifier = Modifier.fillMaxWidth())
                    FlowNode(geo, "pn-av", "valve", "APU BLEED AIR VALVE", apuOn, Tone.STANDBY, "${rnd(s.apuBleedValve * 100)}% OPEN", compact = true, liveText = "OPEN", offText = "CLOSED", modifier = Modifier.fillMaxWidth())
                    FlowNode(geo, "pn-ad", "manifold", "APU SUPPLY DUCT", apuOn, Tone.STANDBY, "RELIEF VALVE ≈80 PSI", compact = true, liveText = "FLOW", offText = "OFF", modifier = Modifier.fillMaxWidth())
                    FlowNode(geo, "pn-ac", "shutoff", "APU CHECK VALVE", apuOn, Tone.STANDBY, "BLOCKS ENG → APU FLOW", compact = true, liveText = "FLOW", offText = "OFF", modifier = Modifier.fillMaxWidth())
                }
                FlowNode(geo, "pn-rm", "manifold", "RIGHT MANIFOLD", rightLive, Tone.B, "$psiR PSI · $srcR", modifier = Modifier.weight(1f).fillMaxHeight())
            }

            // Users
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Bottom) {
                UsersCol(geo, "l", Tone.A, sideChips(true), Modifier.weight(1f))
                FlowNode(geo, "pn-cab", "connection", "CABIN PRESSURIZATION INFLOW", packL || packR, Tone.GROUND, "L + R PACK OUTPUT", compact = true, liveText = "INFLOW", offText = "NO INFLOW", modifier = Modifier.width(CENTRE_W))
                UsersCol(geo, "r", Tone.B, sideChips(false), Modifier.weight(1f))
            }

            // legend
            Column(Modifier.fillMaxWidth().padding(top = 2.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    for ((t, c) in listOf("■ left / eng 1" to FlowHydA, "■ right / eng 2" to FlowHydB, "■ APU · trip control" to FlowHydS, "■ ground / crossfeed" to FlowAccent))
                        Text(t.uppercase(), color = c, fontFamily = FontFamily.Monospace, fontSize = 7.sp, letterSpacing = 0.08.em)
                }
                Text("ANIMATED DASHES = AIRFLOW · DIM = NO FLOW", color = FlowSubtle, fontFamily = FontFamily.Monospace, fontSize = 7.sp, letterSpacing = 0.08.em)
            }
        }
    }
}
