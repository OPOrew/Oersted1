package com.oersted.trainer.ui.cockpit

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.oersted.trainer.sim.AirCondFlowWires
import com.oersted.trainer.sim.CabinFlowWires
import com.oersted.trainer.sim.Derived
import com.oersted.trainer.sim.FlowWires.Tone
import com.oersted.trainer.sim.SimState
import java.math.BigDecimal
import java.math.RoundingMode
import kotlin.math.floor

/**
 * Port of AirConditioningTrainerPanel / AcPackSection and CabinPressurizationTrainerPanel drawings (routes/cockpit.tsx, ATA 21).
 * Wires come from [AirCondFlowWires] / [CabinFlowWires]. The real P5 panels and the control buttons live in the sections above
 * the drawings. Compose only.
 */

private fun rnd(v: Double) = floor(v + 0.5).toLong()
private fun fix1(v: Double) = BigDecimal(v).setScale(1, RoundingMode.HALF_UP).toPlainString()
private val RedC = Color(0xFFFCA5A5)
private val AmberC = Color(0xFFFCD34D)

private data class AcSide(
    val left: Boolean, val tone: Tone, val title: String, val manLive: Boolean, val psi: Long, val src: String,
    val flowRate: Double, val coldTempF: Double, val sensorTempF: Double, val hotBypassRate: Double, val warmAirTempF: Double,
    val coldAirFlow: Double, val warmAirFlow: Double, val mixedAirFlow: Double, val airMixValve: Double, val mixTempF: Double,
    val compressorDischargeTempF: Double, val turbineInletTempF: Double, val compressorOverheat: Boolean, val turbineOverheat: Boolean,
    val packOverheatRelay: Boolean, val ductOverheat: Boolean, val ductLimitDemand: Boolean, val mixValveHotLimit: Boolean,
    val mixValveColdLimit: Boolean, val f35SensorFailure: Boolean, val f35ValveFailure: Boolean, val packTrip250: Boolean,
    val turbofanValve: Double, val sw: Boolean, val trip: Boolean, val flow: Boolean, val engBleed: Boolean, val purgeOk: Boolean,
)

@Composable
private fun StatCell(text: String, state: Int, modifier: Modifier) {   // 0 normal, 1 amber, 2 red
    val (border, bg, fg) = when (state) {
        2 -> Triple(RedC.copy(alpha = 0.7f), RedC.copy(alpha = 0.1f), RedC)
        1 -> Triple(AmberC.copy(alpha = 0.6f), AmberC.copy(alpha = 0.1f), AmberC)
        else -> Triple(FlowBorder.copy(alpha = 0.6f), Color.Transparent, FlowSubtle)
    }
    Text(text, color = fg, fontFamily = FontFamily.Monospace, fontSize = 7.sp, lineHeight = 9.sp, modifier = modifier.background(bg, RoundedCornerShape(4.dp)).border(1.dp, border, RoundedCornerShape(4.dp)).padding(horizontal = 6.dp, vertical = 4.dp))
}

@Composable
private fun TintCell(text: String, c: Color, modifier: Modifier) =
    Text(text, color = c, fontFamily = FontFamily.Monospace, fontSize = 7.sp, lineHeight = 9.sp, modifier = modifier.background(c.copy(alpha = 0.05f), RoundedCornerShape(4.dp)).border(1.dp, c.copy(alpha = 0.3f), RoundedCornerShape(4.dp)).padding(horizontal = 6.dp, vertical = 4.dp))

/** One grid row of the pack's 3-column layout: HOT column is the outer side, COOL the inner side (mirrored per pack). */
@Composable
private fun PackRow(left: Boolean, hot: (@Composable (Modifier) -> Unit)?, mid: (@Composable (Modifier) -> Unit)?, cool: (@Composable (Modifier) -> Unit)?) {
    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(20.dp)) {
        val cells = if (left) listOf(hot, mid, cool) else listOf(cool, mid, hot)
        for (c in cells) {
            val m = Modifier.weight(1f).fillMaxHeight()
            if (c != null) c(m) else Spacer(m)
        }
    }
}

@Composable
private fun AcPackSection(geo: FlowGeo, p: AcSide, modifier: Modifier) {
    val k = if (p.left) "l" else "r"
    val L = p.left
    val c = p.tone.color()
    val pvSub = if (p.flow) "OPEN · SCHEDULED FLOW" else if (!p.sw) "SWITCH OFF" else if (p.trip) "TRIPPED" else "SWITCH ON · NO / LOW PRESSURE"
    // ATA 21: Turbofan Valve modulates open below ~27–33 psi regulating range / on ground; closes with ram air.
    val tfOn = p.turbofanValve > 0.12
    val tfPct = rnd(p.turbofanValve * 100)
    val purging = p.flow && p.engBleed && p.purgeOk
    val hotPct = rnd(p.hotBypassRate * 100)
    fun nd(id: String, icon: String, title: String, sub: String, active: Boolean, tone: Tone, live: String, off: String): @Composable (Modifier) -> Unit =
        { m -> FlowNode(geo, "ac$k-$id", icon, title, active, tone, sub, compact = true, minimal = true, liveText = live, offText = off, modifier = m) }
    val t = p.tone
    Column(
        modifier.flowId(geo, "ac$k-sec").background(Color(0xFF0B1015), RoundedCornerShape(8.dp)).border(1.dp, c.copy(alpha = 0.35f), RoundedCornerShape(8.dp))
            .padding(start = 30.dp, end = 30.dp, top = 8.dp, bottom = 20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Column(Modifier.fillMaxWidth().background(c.copy(alpha = 0.05f), RoundedCornerShape(6.dp)).border(1.dp, c.copy(alpha = 0.4f), RoundedCornerShape(6.dp)).padding(horizontal = 6.dp, vertical = 4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(p.title, color = c, fontSize = 9.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.12.em)
            Text("AMM 21 · HOT BLEED + COLD AIR CYCLE → MIXING", color = FlowSubtle, fontSize = 5.sp, letterSpacing = 0.08.em)
        }
        Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            StatCell("COMP DISCH ${rnd(p.compressorDischargeTempF)}°F", if (p.compressorOverheat) 2 else 0, Modifier.weight(1f).fillMaxHeight())
            StatCell("TURB IN ${rnd(p.turbineInletTempF)}°F", if (p.turbineOverheat) 2 else 0, Modifier.weight(1f).fillMaxHeight())
            StatCell("DUCT ${if (p.ductOverheat) "OVERHEAT" else if (p.ductLimitDemand) "LIMIT" else "NORMAL"}", if (p.ductOverheat) 2 else if (p.ductLimitDemand) 1 else 0, Modifier.weight(1f).fillMaxHeight())
            val trip = p.packOverheatRelay || p.packTrip250
            StatCell("PACK PROTECTION ${if (trip) "TRIP" else "NORMAL"}", if (trip) 2 else 0, Modifier.weight(1f).fillMaxHeight())
        }
        Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            TintCell("WARM / SEMI-CONDITIONED · ${rnd(p.warmAirTempF)}°F · ${rnd(p.warmAirFlow * 100)}%", FlowHydS, Modifier.weight(1f).fillMaxHeight())
            TintCell("COLD CORE · ${rnd(p.coldTempF)}°F · ${rnd(p.coldAirFlow * 100)}%", FlowAccent, Modifier.weight(1f).fillMaxHeight())
        }
        // 3-column pack grid. MID = bleed/cold chain; HOT column = outer side; COOL column = inner side. Wires: AirCondFlowWires.
        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            nd("man", "manifold", "${if (L) "LEFT" else "RIGHT"} MANIFOLD AIR", "${p.psi} PSI · ${p.src} · ≈40–46 PSI NORMAL", p.manLive, t, "PRESSURIZED", "NO PRESSURE")(Modifier.fillMaxWidth())
            PackRow(L, null, nd("cln", "filter", "INERTIAL AIR CLEANER", "DOWNSTREAM OF PRECOOLER · DUST / SAND COLLECTS IN RING", p.manLive, t, "CLEANING", "NO AIR"),
                nd("purge", "valve", "AIR CLEANER PURGE VALVE", if (purging) "OPEN · VENTING DEBRIS TO RAM EXHAUST" else "CLOSED · GROUND / FLAPS LOGIC", purging, Tone.STANDBY, "PURGING", "CLOSED"))
            PackRow(L, nd("hot", "manifold", "HOT-AIR BYPASS DUCT", "MIX VALVE HOT ${rnd(p.airMixValve * 100)}% · TO MIXING CHAMBER", p.warmAirFlow > 0.01, Tone.STANDBY, "HOT AIR", "NO HOT FLOW"),
                nd("pv", "valve", "${if (L) "L" else "R"} PACK VALVE", if (p.flow) "$pvSub · FLOW ${rnd(p.flowRate * 100)}%" else pvSub, p.flow, t, "OPEN", "CLOSED"), null)
            // rows 4–6: primary HX, ACM compressor, secondary HX in the MID column; the ram-air exhaust node spans all three in the COOL column
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                @Composable fun hotCol() { Spacer(Modifier.weight(1f).fillMaxHeight()) }
                @Composable fun midCol() {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        nd("phx", "hx", "PRIMARY HEAT EXCHANGER", "COOLS HOT BLEED WITH RAM / TURBOFAN AIR", p.flow, Tone.GROUND, "COOLING", "OFF")(Modifier.fillMaxWidth())
                        nd("acm", "module", "ACM COMPRESSOR", "COMMON-SHAFT AIR CYCLE MACHINE", p.flow, t, "COMPRESSING", "OFF")(Modifier.fillMaxWidth())
                        nd("shx", "hx", "SECONDARY HEAT EXCHANGER", "REMOVES ACM COMPRESSION HEAT", p.flow, Tone.GROUND, "COOLING", "OFF")(Modifier.fillMaxWidth())
                    }
                }
                @Composable fun coolCol() {
                    Column(Modifier.weight(1f).fillMaxHeight(), verticalArrangement = Arrangement.Center) {
                        nd("ram", "connection", "RAM-AIR EXHAUST DUCT", "HEAT-EXCHANGER / TURBOFAN AIR OVERBOARD", tfOn || p.flow, Tone.GROUND, "EXHAUSTING", "NO FLOW")(Modifier.fillMaxWidth())
                    }
                }
                if (L) { hotCol(); midCol(); coolCol() } else { coolCol(); midCol(); hotCol() }
            }
            PackRow(L, null, nd("turb", "module", "ACM EXPANSION TURBINE", if (p.flow) "RAPID EXPANSION · ${rnd(p.coldTempF)}°F COLD CORE" else "RAPID EXPANSION", p.flow, Tone.GROUND, "EXPANDING / COLD", "OFF"),
                nd("tf", "engine", "TURBOFAN", if (tfOn) "SPINNING · $tfPct% DRIVE AIR" else "STOPPED · NO DRIVE AIR", tfOn, Tone.GROUND, "SPINNING", "STOPPED"))
            PackRow(L, nd("f35", "valve", "35°F CONTROL VALVE", "$hotPct% WARM BYPASS → SEPARATOR INTAKE · ANTI-ICE ~35°F", p.hotBypassRate > 0.02 && !p.f35ValveFailure, Tone.STANDBY, "MODULATING", if (p.f35ValveFailure) "FAILED CLOSED" else "CLOSED"),
                nd("sep", "filter", "WATER SEPARATOR + COALESCER", "REMOVES CONDENSED MOISTURE · DRAINS OVERBOARD", p.flow, Tone.GROUND, "SEPARATING", "OFF"),
                nd("tfv", "valve", "TURBOFAN VALVE", if (tfOn) "OPEN $tfPct% · ≤~33 PSI / GROUND" else "CLOSED · RAM AIR / FLIGHT", tfOn, t, "OPEN", "CLOSED"))
            PackRow(L, nd("f35s", "gauge", "35°F SENSOR", if (p.flow) "${fix1(p.sensorTempF)}°F · AT SEPARATOR DISCHARGE" else "NO TEMPERATURE", p.flow && !p.f35SensorFailure, Tone.STANDBY, "SENSING", if (p.f35SensorFailure) "FAILED" else "OFF"),
                nd("bag", "filter", "SEPARATOR COALESCER BAG", "INSIDE SEPARATOR HOUSING · COALESCES FINE DROPLETS", p.flow, Tone.GROUND, "FILTERING", "OFF"), null)
            PackRow(L, null, nd("cchk", "valve", "COLD-AIR CHECK VALVE", "${rnd(p.coldAirFlow * 100)}% FLOW → MIXING", p.coldAirFlow > 0.01, Tone.GROUND, "OPEN / FLOW", "NO FLOW"), null)
            PackRow(L, nd("hchk", "valve", "HOT-AIR CHECK VALVE", "${rnd(p.warmAirFlow * 100)}% FLOW → MIXING", p.warmAirFlow > 0.01, Tone.STANDBY, "OPEN / FLOW", "NO FLOW"),
                nd("mix", "valve", "${if (L) "L" else "R"} AIR-MIX VALVE", "${rnd(p.airMixValve * 100)}% HOT · ${rnd((1 - p.airMixValve) * 100)}% COLD · ${if (p.mixValveHotLimit) "FULL HOT" else if (p.mixValveColdLimit) "FULL COLD (PACK CLOSED / OFF)" else "MODULATING"}", p.flow && p.airMixValve > 0.001, Tone.GROUND, "POSITIONED", "FULL COLD / OFF"), null)
            nd("out", "connection", "${if (L) "L" else "R"} PACK CONDITIONED-AIR OUTLET", if (p.flow) "${rnd(p.mixTempF)}°F MIXED · ${rnd(p.mixedAirFlow * 100)}% → MIXING CHAMBER" else "NO CONDITIONED AIR", p.flow, Tone.GROUND, "MIXED AIR", "NO OUTPUT")(Modifier.fillMaxWidth())
        }
    }
}

@Composable
internal fun AirCondFlowDiagram(s: SimState, d: Derived) {
    val wow = s.wow
    val purgeOk = wow || s.flaps > 0
    val flowL = d.packLFlow
    val flowR = d.packRFlow
    val any = flowL || flowR
    val open1 = d.bleed1Available
    val open2 = d.bleed2Available
    val apuOn = d.apuAvailable && s.apuBleed && s.apuBleedValve > 0.7
    val groundOn = s.groundPneumaticConnected
    val isoOpen = d.isolationOpen
    fun src(parts: List<Pair<Boolean, String>>) = parts.filter { it.first }.joinToString(" · ") { it.second }.ifEmpty { "NO SOURCE" }
    val srcL = src(listOf(open1 to "ENG 1", apuOn to "APU", (isoOpen && (open2 || groundOn)) to "XFEED"))
    val srcR = src(listOf(open2 to "ENG 2", groundOn to "GND", (isoOpen && (open1 || apuOn)) to "XFEED"))
    val left = AcSide(
        true, Tone.A, "LEFT PACK", d.leftManifold, rnd(d.leftDuctPsi), srcL, d.packLFlowRate, d.packLColdTempF, d.packL35SensorTempF, d.packLHotBypassRate,
        d.packLWarmAirTempF, d.packLColdAirFlow, d.packLWarmAirFlow, d.packLMixedAirFlow, d.packLAirMixValve, d.packLMixTempF,
        d.packLCompressorDischargeTempF, d.packLTurbineInletTempF, d.packLCompressorOverheat, d.packLTurbineOverheat, d.packLPackOverheatRelay,
        d.packLDuctOverheat, d.packLDuctLimitDemand, d.packLMixValveHotLimit, d.packLMixValveColdLimit, d.packLF35SensorFailure, d.packLF35ValveFailure,
        d.packLPackTrip250, d.packLTurbofanValve, s.packL, s.packTripL, flowL, open1, purgeOk,
    )
    val right = AcSide(
        false, Tone.B, "RIGHT PACK", d.rightManifold, rnd(d.rightDuctPsi), srcR, d.packRFlowRate, d.packRColdTempF, d.packR35SensorTempF, d.packRHotBypassRate,
        d.packRWarmAirTempF, d.packRColdAirFlow, d.packRWarmAirFlow, d.packRMixedAirFlow, d.packRAirMixValve, d.packRMixTempF,
        d.packRCompressorDischargeTempF, d.packRTurbineInletTempF, d.packRCompressorOverheat, d.packRTurbineOverheat, d.packRPackOverheatRelay,
        d.packRDuctOverheat, d.packRDuctLimitDemand, d.packRMixValveHotLimit, d.packRMixValveColdLimit, d.packRF35SensorFailure, d.packRF35ValveFailure,
        d.packRPackTrip250, d.packRTurbofanValve, s.packR, s.packTripR, flowR, open2, purgeOk,
    )
    val flags = AirCondFlowWires.Flags(
        flowL, flowR, left.turbofanValve > 0.12, right.turbofanValve > 0.12, flowL && open1 && purgeOk, flowR && open2 && purgeOk,
        left.warmAirFlow > 0.001, right.warmAirFlow > 0.001, left.airMixValve, right.airMixValve, left.manLive, right.manLive,
        left.hotBypassRate > 0.02 && !left.f35ValveFailure, right.hotBypassRate > 0.02 && !right.f35ValveFailure,
        flowL && !left.f35SensorFailure, flowR && !right.f35SensorFailure, any,
    )

    FlowRoot(Modifier.fillMaxWidth(), wires = { AirCondFlowWires.wires(it, flags) }) { geo ->
        Column(Modifier.fillMaxWidth().padding(horizontal = 4.dp).padding(bottom = 8.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(56.dp)) {
                AcPackSection(geo, left, Modifier.weight(1f).fillMaxHeight())
                AcPackSection(geo, right, Modifier.weight(1f).fillMaxHeight())
            }
            Column(Modifier.fillMaxWidth().background(Color(0xFF0D1013), RoundedCornerShape(8.dp)).border(1.dp, FlowAccent.copy(alpha = 0.35f), RoundedCornerShape(8.dp)).padding(10.dp)) {
                // Cold air and hot bypass side by side per pack (hot on the outside, cold on the inside — same as the packs above).
                Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(56.dp)) {
                    Row(Modifier.weight(1f).fillMaxHeight(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        FlowNode(geo, "ac-lhot", "manifold", "L HOT BYPASS", flowL && left.warmAirFlow > 0.01, Tone.STANDBY, "", compact = true, minimal = true, modifier = Modifier.weight(1f).fillMaxHeight())
                        FlowNode(geo, "ac-lcold", "connection", "L COLD AIR", flowL, Tone.A, "", compact = true, minimal = true, modifier = Modifier.weight(1f).fillMaxHeight())
                    }
                    Row(Modifier.weight(1f).fillMaxHeight(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        FlowNode(geo, "ac-rcold", "connection", "R COLD AIR", flowR, Tone.B, "", compact = true, minimal = true, modifier = Modifier.weight(1f).fillMaxHeight())
                        FlowNode(geo, "ac-rhot", "manifold", "R HOT BYPASS", flowR && right.warmAirFlow > 0.01, Tone.STANDBY, "", compact = true, minimal = true, modifier = Modifier.weight(1f).fillMaxHeight())
                    }
                }
                Spacer(Modifier.height(16.dp))
                Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(56.dp)) {
                    FlowNode(geo, "ac-mixf", "valve", "MIX VALVE · CONT CABIN", any, Tone.GROUND, "", compact = true, minimal = true, modifier = Modifier.weight(1f).fillMaxHeight())
                    FlowNode(geo, "ac-mixp", "valve", "MIX VALVE · PASS CABIN", any, Tone.GROUND, "", compact = true, minimal = true, modifier = Modifier.weight(1f).fillMaxHeight())
                }
                Spacer(Modifier.height(16.dp))
                FlowNode(geo, "ac-chamber", "manifold", "MIXING CHAMBER", any, Tone.GROUND, "", compact = true, minimal = true, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(16.dp))
                FlowNode(geo, "ac-maindist", "manifold", "MAIN DISTRIBUTION MANIFOLD", any, Tone.GROUND, "", compact = true, minimal = true, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(16.dp))
                Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(56.dp)) {
                    FlowNode(geo, "ac-distf", "connection", "CONT CABIN DISTRIBUTION", any, Tone.GROUND, "", compact = true, minimal = true, modifier = Modifier.weight(1f).fillMaxHeight())
                    FlowNode(geo, "ac-distp", "connection", "PASS CABIN DISTRIBUTION", any, Tone.GROUND, "", compact = true, minimal = true, modifier = Modifier.weight(1f).fillMaxHeight())
                }
                Spacer(Modifier.height(16.dp))
                FlowNode(geo, "ac-cabin", "connection", "TO OUTFLOW VALVE / PRESSURIZATION", any, Tone.GROUND, "", compact = true, minimal = true, modifier = Modifier.fillMaxWidth())
            }
            Column(Modifier.fillMaxWidth().padding(top = 2.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    for ((t, c) in listOf("■ left pack" to FlowHydA, "■ right pack" to FlowHydB, "■ hot-air bypass" to FlowHydS, "■ cooling / mixed air" to FlowAccent))
                        Text(t.uppercase(), color = c, fontFamily = FontFamily.Monospace, fontSize = 7.sp, letterSpacing = 0.08.em)
                }
                Text("ANIMATED DASHES = AIRFLOW · DIM = NO FLOW", color = FlowSubtle, fontFamily = FontFamily.Monospace, fontSize = 7.sp, letterSpacing = 0.08.em)
            }
        }
    }
}

@Composable
internal fun CabinFlowDiagram(s: SimState, d: Derived) {
    val flowL = d.packLFlow
    val flowR = d.packRFlow
    val inflow = flowL || flowR
    val supplyFlow = d.cabinSupplyFlow
    val exhaustFlow = d.cabinExhaustFlow   // web: Number(d.cabinExhaustFlow ?? s.outflow ?? 0) — Derived always carries a value here
    val diff = s.cabinDiff
    val outPct = rnd(s.outflow * 100)
    val dc = d.dcPower
    val mode = s.pressMode
    val modeLabel = mapOf("AUTO" to "AUTO", "STBY" to "STANDBY", "MAN_AC" to "MANUAL AC", "MAN_DC" to "MANUAL DC")
    val outOpen = s.outflow > 0.05
    val relOpen = diff > 8.0
    val pressurized = diff > 0.5
    FlowRoot(Modifier.fillMaxWidth(), wires = { CabinFlowWires.wires(it, CabinFlowWires.Flags(inflow, outOpen, relOpen, dc)) }) { geo ->
        Column(Modifier.fillMaxWidth().padding(horizontal = 4.dp).padding(bottom = 8.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            FlowNode(geo, "cp-in", "connection", "PACK AIR INFLOW · FROM AIR CONDITIONING", inflow, Tone.GROUND, "${if (flowL) "L PACK FLOW" else "L PACK OFF"} · ${if (flowR) "R PACK FLOW" else "R PACK OFF"} · SUPPLY ${rnd(supplyFlow * 100)}% · AIR MIX VALVES → CABIN", compact = true, liveText = "INFLOW", offText = "NO INFLOW", modifier = Modifier.fillMaxWidth())
            FlowNode(geo, "cp-cab", "reservoir", "PRESSURIZED CABIN · PRESSURE VESSEL", pressurized, Tone.GROUND, if (s.wow) "ON GROUND · NOT PRESSURIZED" else "DIFFERENTIAL ${fix1(diff)} PSI · WINDOWS CONTAIN FULL DIFF", compact = true, liveText = "PRESSURIZED", offText = "UNPRESSURIZED", modifier = Modifier.fillMaxWidth())
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                FlowNode(geo, "cp-ctl", "module", "PRESSURIZATION CONTROLLER", dc, Tone.STANDBY, "P5-6 · MODE ${modeLabel[mode] ?: mode} · COMPARES TO SCHEDULE", compact = true, liveText = "CONTROLLING", offText = "NO DC POWER", modifier = Modifier.weight(1f).fillMaxHeight())
                FlowNode(geo, "cp-out", "valve", "CABIN OUTFLOW VALVE", outOpen, Tone.GROUND, "$outPct % OPEN · EXHAUST ${rnd(exhaustFlow * 100)}% · 28V DC TORQUE MOTOR", compact = true, liveText = "METERING", offText = "CLOSED", modifier = Modifier.weight(1f).fillMaxHeight())
                FlowNode(geo, "cp-rel", "shutoff", "SAFETY RELIEF VALVE", relOpen, Tone.GROUND, "MECHANICAL · OPENS ≈8–8.5 PSI DIFF", compact = true, liveText = "RELIEVING", offText = "CLOSED", modifier = Modifier.weight(1f).fillMaxHeight())
            }
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                FlowNode(geo, "cp-ind", "gauge", "P5-6 INDICATIONS", dc, Tone.STANDBY, "DIFF ${fix1(diff)} PSI · VALVE $outPct % · HORN >≈10,000 FT CAB ALT", compact = true, liveText = "INDICATING", offText = "NO POWER", modifier = Modifier.weight(1f).fillMaxHeight())
                FlowNode(geo, "cp-ovb", "connection", "OVERBOARD · AMBIENT", outOpen || relOpen, Tone.GROUND, "OUTFLOW VALVE + RELIEF VALVE EXHAUST", compact = true, liveText = "EXHAUSTING", offText = "NO FLOW", modifier = Modifier.weight(2f).fillMaxHeight())
            }
            Column(Modifier.fillMaxWidth().padding(top = 2.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    for ((t, c) in listOf("■ cabin air" to FlowAccent, "■ control / sensing" to FlowHydS))
                        Text(t.uppercase(), color = c, fontFamily = FontFamily.Monospace, fontSize = 7.sp, letterSpacing = 0.08.em)
                }
                Text("ANIMATED DASHES = FLOW · DIM = NO FLOW", color = FlowSubtle, fontFamily = FontFamily.Monospace, fontSize = 7.sp, letterSpacing = 0.08.em)
            }
        }
    }
}
