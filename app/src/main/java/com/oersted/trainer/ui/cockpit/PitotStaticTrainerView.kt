package com.oersted.trainer.ui.cockpit

import com.oersted.trainer.ui.overhead.P5Cutout
import com.oersted.trainer.ui.overhead.IcePanel
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.oersted.trainer.sim.Derived
import com.oersted.trainer.sim.PitotStatic
import com.oersted.trainer.sim.PitotSchematicRules
import com.oersted.trainer.sim.PitotStaticRules
import com.oersted.trainer.sim.SimState
import com.oersted.trainer.sim.TrainerGearRules
import com.oersted.trainer.ui.panel.PanelControlSlider

/**
 * Port of PitotStaticTrainer.tsx (ATA 34). All the logic is in [PitotStaticRules] (already ported and tested); this file is the
 * layout. NOT ported yet: PitotStaticSchematic (the probe -> instrument plumbing drawing); the six-pack is the existing [SixPackView]
 * (a simplified instrument set), not the web's SixPack. Compose only; verify on CI.
 */

private val OkColor = Color(0xFF65C798)
private val WarnColor = Color(0xFFE24B4B)
private val CautionColor = Color(0xFFE0A42E)
private val SubtleColor = Color(0xFF8F9AA5)
private val LineColor = Color(0xFF39414B)

/** Card tone: 0 ok, 1 warn, 2 caution. */
@Composable
private fun TCard(title: String, state: String, tone: Int, content: @Composable () -> Unit) {
    val c = when (tone) { 1 -> WarnColor; 2 -> CautionColor; else -> OkColor }
    Column(Modifier.fillMaxWidth().padding(vertical = 4.dp).background(Color(0xFF14171B), RoundedCornerShape(10.dp)).border(1.dp, LineColor, RoundedCornerShape(10.dp)).padding(10.dp)) {
        Row(Modifier.fillMaxWidth().padding(bottom = 6.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text(title.uppercase(), color = Color(0xFFE6E1D2), fontSize = 10.sp, modifier = Modifier.weight(1f))
            Text(state, color = c, fontFamily = FontFamily.Monospace, fontSize = 8.sp, modifier = Modifier.border(1.dp, c.copy(alpha = 0.4f), RoundedCornerShape(4.dp)).padding(horizontal = 6.dp, vertical = 2.dp))
        }
        content()
    }
}

private class TBtn(val text: String, val mode: Int, val onClick: () -> Unit)

/** Button look: 0 plain, 1 on (accent border), 2 warn (red border). */
@Composable
private fun TButton(b: TBtn, modifier: Modifier) {
    val border = when (b.mode) { 1 -> Color(0xFFD6A845); 2 -> WarnColor.copy(alpha = 0.6f); else -> LineColor }
    val bg = if (b.mode == 2) Color(0x1AE24B4B) else Color(0xFF0E1013)
    Box(modifier.background(bg, RoundedCornerShape(4.dp)).border(1.dp, border, RoundedCornerShape(4.dp)).clickable(onClick = b.onClick).padding(horizontal = 6.dp, vertical = 8.dp)) {
        Text(b.text.uppercase(), color = Color(0xFFE6E1D2), fontSize = 9.sp)
    }
}

@Composable
private fun BtnGrid(buttons: List<TBtn>, cols: Int = 2) {
    buttons.chunked(cols).forEach { row ->
        Row(Modifier.fillMaxWidth().padding(bottom = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            row.forEach { TButton(it, Modifier.weight(1f)) }
            repeat(cols - row.size) { Spacer(Modifier.weight(1f)) }
        }
    }
}

@Composable
private fun Note(text: String) = Text(text, color = SubtleColor, fontSize = 9.sp, modifier = Modifier.padding(top = 4.dp, bottom = 2.dp))

@Composable
private fun Readout(label: String, value: String, unit: String, bad: Boolean, modifier: Modifier) {
    Column(modifier.background(Color(0xFF0B0D10), RoundedCornerShape(4.dp)).border(1.dp, LineColor, RoundedCornerShape(4.dp)).padding(vertical = 6.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label, color = SubtleColor, fontSize = 8.sp)
        Text(value, color = if (bad) WarnColor else OkColor, fontFamily = FontFamily.Monospace, fontSize = 15.sp)
        Text(unit, color = SubtleColor, fontFamily = FontFamily.Monospace, fontSize = 8.sp)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SidePanel(title: String, a: PitotStatic.SideAirData, baro: Double) {
    val hard = PitotStaticRules.hardFault(a.flags)
    Column(Modifier.fillMaxWidth().padding(vertical = 4.dp).background(Color(0xFF101318), RoundedCornerShape(8.dp)).border(1.dp, LineColor, RoundedCornerShape(8.dp)).padding(8.dp)) {
        Row(Modifier.fillMaxWidth().padding(bottom = 6.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(title.uppercase(), color = Color(0xFFB7AB87), fontSize = 10.sp)
            Text(if (hard) "FAULT" else "NORMAL", color = if (hard) WarnColor else OkColor, fontFamily = FontFamily.Monospace, fontSize = 8.sp)
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Readout("IAS", TrainerGearRules.toFixed0(a.iasKt), "KT", !a.pitotOk, Modifier.weight(1f))
            Readout("ALT", PitotStaticRules.groupedRound(a.altFt), "FT · ${TrainerGearRules.toFixed0(baro)} HPA", !a.staticOk, Modifier.weight(1f))
            Readout("VSI", PitotStaticRules.groupedRound(a.vsiFpm).replace(",", ""), "FPM", !a.staticOk, Modifier.weight(1f))
        }
        if (a.flags.isNotEmpty()) {
            Spacer(Modifier.height(6.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                for (f in a.flags) {
                    val c = if (PitotStaticRules.flagIsCaution(f)) CautionColor else WarnColor
                    Text(f, color = c, fontFamily = FontFamily.Monospace, fontSize = 8.sp, modifier = Modifier.border(1.dp, c.copy(alpha = 0.4f), RoundedCornerShape(4.dp)).padding(horizontal = 6.dp, vertical = 2.dp))
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun PitotStaticTrainerSection(s: SimState, d: Derived, cockpit: CockpitModel) {
    // the web enables the trainer clock while the view is open
    DisposableEffect(Unit) {
        cockpit.patchSimNote("PITOT/STATIC TRAINER ENABLED") { psTrainerEnabled = true }
        onDispose { cockpit.patchSimNote("PITOT/STATIC TRAINER DISABLED") { psTrainerEnabled = false } }
    }
    val air by cockpit.air.collectAsState()
    val dc = d.dcPower
    val anyFault = PitotStaticRules.anyFault(air)

    fun flag(label: String, key: String, text: (Boolean) -> String, mode: (Boolean) -> Int): TBtn {
        val on = PitotStaticRules.isSet(s, key)
        return TBtn(text(on), mode(on)) {
            cockpit.applySimNote("$label → ${if (!on) "ON" else "OFF"}") { PitotStaticRules.flip(it, key).first }
        }
    }
    fun onOffBtn(name: String, label: String, key: String, warn: Boolean = false) =
        flag(label, key, { "$name · ${PitotStaticRules.onOff(it)}" }, { if (it) (if (warn) 2 else 1) else 0 })
    fun stateBtn(name: String, label: String, key: String, onText: String, offText: String, warnWhenOn: Boolean) =
        flag(label, key, { "$name · ${if (it) onText else offText}" }, { if (it) (if (warnWhenOn) 2 else 1) else 0 })
    fun cbBtn(name: String, label: String, key: String, onText: String = "CLOSED", offText: String = "OPEN") =
        flag(label, key, { "$name · ${if (it) onText else offText}" }, { if (it) 1 else 2 })
    fun port(name: String, label: String, key: String): TBtn {
        val blocked = PitotStaticRules.isSet(s, key)
        return TBtn("$name · ${if (blocked) "BLOCKED" else "CLEAR"}", if (blocked) 2 else 0) {
            cockpit.applySimNote("$label → ${if (!blocked) "BLOCKED" else "CLEAR"}") { PitotStaticRules.togglePort(it, key).first }
        }
    }
    fun cadc(channel: Int): TBtn {
        val v = if (channel == 1) s.psCadc1Test else s.psCadc2Test
        val next = when (v) { "OFF" -> "FUNCTION"; "FUNCTION" -> "SLEW"; "SLEW" -> "FAIL"; else -> "OFF" }
        return TBtn("CADC $channel TEST · $v", if (v == "OFF") 0 else if (v == "FAIL") 2 else 1) {
            cockpit.applySimNote("CADC $channel TEST → $next") { PitotStaticRules.cycleCadcTest(it, channel) }
        }
    }
    fun act(text: String, mode: Int, note: String, f: (SimState) -> SimState) = TBtn(text, mode) { cockpit.applySimNote(note, f) }

    Column(Modifier.fillMaxWidth().padding(vertical = 4.dp).background(Color(0xFF14171B), RoundedCornerShape(10.dp)).border(1.dp, LineColor, RoundedCornerShape(10.dp)).padding(10.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("ATA 34 · PITOT / STATIC / AIR DATA", color = SubtleColor, fontSize = 10.sp, modifier = Modifier.weight(1f))
            Text(PitotStaticRules.dcChip(dc), color = if (dc) OkColor else CautionColor, fontFamily = FontFamily.Monospace, fontSize = 8.sp)
        }
        Note(
            "Four combined pitot/static probes are represented in their manual-defined positions. The CAPT and F/O normal static systems are " +
                "cross-connected; the two station-406 alternate static ports feed the corresponding selector valves.",
        )
    }

    TCard("Flight condition", PitotStaticRules.flightConditionState(air), if (air.coverOnInMotion || anyFault) 1 else 0) {
        PanelControlSlider("Target altitude (ft) · now ${PitotStaticRules.groupedRound(s.psFlightAltFt)}", s.psFlightTargetAltFt, { v ->
            cockpit.patchSim { psFlightTargetAltFt = PitotStaticRules.stepSnap(v, 500.0); psFlightProgressive = true }
        }, 0.0, 41000.0)
        PanelControlSlider("Target CAS (kt) · now ${TrainerGearRules.toFixed0(s.psFlightCasKt)}", s.psFlightTargetCasKt, { v ->
            cockpit.patchSim { psFlightTargetCasKt = PitotStaticRules.stepSnap(v, 5.0); psFlightProgressive = true }
        }, 0.0, 350.0)
        PanelControlSlider("Vertical speed (fpm)", s.psFlightVsFpm, { v -> cockpit.patchSim { psFlightVsFpm = PitotStaticRules.stepSnap(v, 100.0) } }, -3000.0, 3000.0)
        PanelControlSlider("CAPT baro (hPa)", s.psBaroCaptHpa, { v -> cockpit.patchSim { psBaroCaptHpa = PitotStaticRules.stepSnap(v, 0.5) } }, 950.0, 1050.0)
        PanelControlSlider("F/O baro (hPa)", s.psBaroFoHpa, { v -> cockpit.patchSim { psBaroFoHpa = PitotStaticRules.stepSnap(v, 0.5) } }, 950.0, 1050.0)
        Spacer(Modifier.height(6.dp))
        BtnGrid(
            listOf(
                act("Ground", 0, "PITOT/STATIC CONDITION → GROUND", PitotStaticRules::ground),
                act("Cruise test", 0, "PITOT/STATIC CONDITION → CRUISE TEST", PitotStaticRules::cruiseTest),
                act("Climb test", 0, "PITOT/STATIC CONDITION → CLIMB TEST (progressive)", PitotStaticRules::climbTest),
            ),
            3,
        )
        Note(
            "Progressive profile: altitude climbs/descends at the selected VSI toward the target altitude. CAS transitions at ~3 kt/s. " +
                "When the target altitude is reached the VSI automatically levels off.",
        )
        BtnGrid(
            listOf(
                flag("PITOT/STATIC ICING CONDITION", "psIcing", { "Icing conditions · ${PitotStaticRules.onOff(it)}" }, { if (it) 2 else 0 }),
                act("Clear all faults", 0, "PITOT/STATIC faults cleared", PitotStaticRules::clearFaults),
            ),
        )
        Text("QUICK FAULT SCENARIOS (SET A FLIGHT CONDITION FIRST)", color = SubtleColor, fontFamily = FontFamily.Monospace, fontSize = 8.sp)
        Spacer(Modifier.height(4.dp))
        BtnGrid(
            listOf(
                act("CAPT pitot blocked", 0, "SCENARIO — CAPT pitot blocked", PitotStaticRules::scenarioCaptPitotBlocked),
                act("F/O static trapped", 0, "SCENARIO — F/O static trapped at current altitude", PitotStaticRules::scenarioFoStaticTrapped),
                act("CAPT alt static", 0, "SCENARIO — CAPT static on ALTERNATE", PitotStaticRules::scenarioCaptAltStatic),
                act("Covers on · 80 kt", 2, "SCENARIO — probe covers left on, takeoff roll", PitotStaticRules::scenarioCoversOnTakeoffRoll),
            ),
        )
    }

    TCard("Probe → instrument plumbing", PitotStaticRules.plumbingState(air), if (anyFault) 1 else 0) {
        PitotStaticSchematicView(air, s, dc, PitotSchematicRules.shown(air.capt, dc), PitotSchematicRules.shown(air.fo, dc))
        Note(
            "Pitot (green) runs from the CAPT upper-left and F/O upper-right probes to their airspeed indicators. Static (blue) is cross-connected: " +
                "CAPT = upper-left + lower-right, F/O = upper-right + lower-left, each through its source selector to the airspeed indicator, altimeter and VSI. " +
                "Block a probe, ice a pitot, trap a static line or select ALTERNATE and the line colour and the instrument at its end change. " +
                "Orange halo = P5-9 heat on; red RBF tag = cover fitted. AUX and elevator pitots show health only; the manual excerpt does not define their downstream users.",
        )
    }

    SidePanel("Captain air data", air.capt, s.psBaroCaptHpa)
    SidePanel("First officer air data", air.fo, s.psBaroFoHpa)
    if (air.disagree) {
        Text(
            "CAPT / F/O AIR-DATA DISAGREEMENT — INSPECT PITOT/STATIC SOURCE PATHS.",
            color = WarnColor, fontFamily = FontFamily.Monospace, fontSize = 9.sp,
            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).background(Color(0x1AE24B4B), RoundedCornerShape(8.dp)).border(1.dp, WarnColor.copy(alpha = 0.4f), RoundedCornerShape(8.dp)).padding(8.dp),
        )
    }

    TCard("Primary flight instruments · six-pack", PitotStaticRules.sixPackCardState(dc), if (dc) 0 else 2) {
        SixPackView(cockpit, hideNote = true)
        Note(
            "Airspeed, altimeter and vertical speed on each side read the same air-data line: fail the CAPT pitot and only the CAPT airspeed " +
                "indicator goes to a FLAG; trap the F/O static line and the F/O altimeter freezes and its VSI goes to zero.",
        )
    }

    TCard("P5-9 probe heating relationship", PitotStaticRules.heatCardState(dc), if (dc) 0 else 2) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            HeatGroup("LEFT P5-9 GROUP", "UPPER LEFT / CAPT", air.capt.probe.heaterOn, "LOWER LEFT / AUX 2", Modifier.weight(1f))
            HeatGroup("RIGHT P5-9 GROUP", "UPPER RIGHT / F/O", air.fo.probe.heaterOn, "LOWER RIGHT / AUX 1", Modifier.weight(1f))
        }
        Spacer(Modifier.height(6.dp))
        // the real P5 module: PITOT STATIC HEAT A / B switches with the CAPT / F/O / ELEV / TEMP / ALPHA lamps
        P5Cutout(cockpit, 3) { pp -> IcePanel(pp) }
        Spacer(Modifier.height(6.dp))
        BtnGrid(
            listOf(
                cbBtn("CAPT UPPER-L CB", "P18 CAPT UPPER-L HEATER CB", "psCbCaptUpperL"),
                cbBtn("F/O UPPER-R CB", "P18 F/O UPPER-R HEATER CB", "psCbFoUpperR"),
                cbBtn("CAPT LOWER-L CB", "P18 CAPT LOWER-L HEATER CB", "psCbCaptLowerL"),
                cbBtn("F/O LOWER-R CB", "P18 F/O LOWER-R HEATER CB", "psCbFoLowerR"),
                cbBtn("ELEV L CB", "P18 ELEVATOR PITOT L HEATER CB", "psCbElevL"),
                cbBtn("ELEV R CB", "P18 ELEVATOR PITOT R HEATER CB", "psCbElevR"),
                cbBtn("TEMP L CB", "P18 TEMP PROBE L HEATER CB", "psCbTempL"),
                cbBtn("TEMP R CB", "P18 TEMP PROBE R HEATER CB", "psCbTempR"),
                cbBtn("CADC 1 CB", "P18 CADC NO.1 CB", "psCadc1Cb"),
                cbBtn("CADC 2 CB", "P18 CADC NO.2 CB", "psCadc2Cb"),
                cbBtn("CADC 1 115V", "CADC 1 115-V AC", "psCadc1Ac115", "OK", "FAIL"),
                cbBtn("CADC 1 26V", "CADC 1 26-V AC", "psCadc1Ac26", "OK", "FAIL"),
                cbBtn("CADC 2 115V", "CADC 2 115-V AC", "psCadc2Ac115", "OK", "FAIL"),
                cbBtn("CADC 2 26V", "CADC 2 26-V AC", "psCadc2Ac26", "OK", "FAIL"),
                cadc(1),
                cadc(2),
                cbBtn("TEMP MASTER CB", "LEGACY TEMP PROBE CB", "psCbTemp"),
            ),
        )
        Note(
            "CADC test cycles OFF → FUNCTION → SLEW → FAIL. FUNCTION uses fixed air-data values, SLEW commands a 600-fpm test rate, and FAIL " +
                "asserts the CADC failure path. Each CADC requires its P18 CB plus both 115-V AC and 26-V AC inputs to remain valid.",
        )
        Note(
            "ATA 30-31 specifies 115-V AC probe heaters and separate indication circuits. Heater operation requires the applicable 115-V AC " +
                "supply and its individual P18 circuit breaker. The separate 28-V DC side is treated as indication/control power.",
        )
    }

    TCard("Ground covers & probe faults", "MAINTENANCE / FAULT INJECTION", 2) {
        BtnGrid(
            listOf(
                onOffBtn("CAPT UL cover", "CAPT UPPER-LEFT PROBE COVER", "psPitotCaptCover"),
                onOffBtn("F/O UR cover", "F/O UPPER-RIGHT PROBE COVER", "psPitotFoCover"),
                onOffBtn("AUX 1 LR cover", "AUX 1 LOWER-RIGHT PROBE COVER", "psPitotAux1Cover"),
                onOffBtn("AUX 2 LL cover", "AUX 2 LOWER-LEFT PROBE COVER", "psPitotAux2Cover"),
                stateBtn("CAPT UL pitot", "CAPT UPPER-LEFT PITOT", "psPitotCaptBlocked", "BLOCKED", "CLEAR", true),
                stateBtn("F/O UR pitot", "F/O UPPER-RIGHT PITOT", "psPitotFoBlocked", "BLOCKED", "CLEAR", true),
                stateBtn("AUX 1 LR pitot", "AUX 1 LOWER-RIGHT PITOT", "psPitotAux1Blocked", "BLOCKED", "CLEAR", true),
                stateBtn("AUX 2 LL pitot", "AUX 2 LOWER-LEFT PITOT", "psPitotAux2Blocked", "BLOCKED", "CLEAR", true),
                stateBtn("Elevator pitot L", "ELEVATOR PITOT L", "psElevPitotLBlocked", "BLOCKED", "CLEAR", true),
                stateBtn("Elevator pitot R", "ELEVATOR PITOT R", "psElevPitotRBlocked", "BLOCKED", "CLEAR", true),
            ),
        )
    }

    TCard("Normal static sources", PitotStaticRules.staticSourcesState(s), if (PitotStaticRules.oneStaticPortBlocked(s)) 2 else 0) {
        BtnGrid(
            listOf(
                port("CAPT UL static", "CAPT STATIC · UPPER LEFT", "psStaticCaptL"),
                port("CAPT LR static", "CAPT STATIC · LOWER RIGHT", "psStaticCaptR"),
                port("F/O LL static", "F/O STATIC · LOWER LEFT", "psStaticFoL"),
                port("F/O UR static", "F/O STATIC · UPPER RIGHT", "psStaticFoR"),
            ),
        )
        Note(
            "The manual describes the static ports as cross-connected to the opposite side. For this trainer, blocking one normal source leaves " +
                "the other connected source available; blocking both traps the static line at the altitude when the second source was blocked.",
        )
    }

    TCard("Alternate static source selectors", PitotStaticRules.alternateState(s), if (s.psAltStaticCapt || s.psAltStaticFo) 2 else 0) {
        BtnGrid(
            listOf(
                stateBtn("CAPT selector", "CAPT STATIC SOURCE SELECTOR", "psAltStaticCapt", "ALTERNATE", "NORMAL", false),
                stateBtn("F/O selector", "F/O STATIC SOURCE SELECTOR", "psAltStaticFo", "ALTERNATE", "NORMAL", false),
            ),
        )
        Note(
            "ALTERNATE selects the corresponding station-406 alternate static source. The supplied manual excerpt does not specify a numeric " +
                "position-error value, so none is artificially added here.",
        )
    }

    TCard("Maintenance test network", PitotStaticRules.testNetworkState(s), if (s.psTestPressureSource || s.psTestVacuumSource) 2 else 0) {
        BtnGrid(
            listOf(
                TBtn("Pitot pressure test · ${if (s.psTestPressureSource) "CONNECTED" else "OFF"}", if (s.psTestPressureSource) 1 else 0) {
                    cockpit.applySimNote("PITOT TEST PRESSURE SOURCE → ${if (!s.psTestPressureSource) "CONNECTED" else "DISCONNECTED"}", PitotStaticRules::togglePressureTest)
                },
                TBtn("Static vacuum test · ${if (s.psTestVacuumSource) "CONNECTED" else "OFF"}", if (s.psTestVacuumSource) 1 else 0) {
                    cockpit.applySimNote("STATIC VACUUM TEST SOURCE → ${if (!s.psTestVacuumSource) "CONNECTED" else "DISCONNECTED"}", PitotStaticRules::toggleVacuumTest)
                },
                stateBtn("Mach warning test", "MACH/AIRSPEED WARNING TEST", "psMachWarningTest", "TEST", "NORMAL", true),
                stateBtn("Warning inhibit", "AIRSPEED WARNING INHIBIT", "psAirspeedWarningInhibit", "INHIBIT", "NORMAL", true),
            ),
        )
        BtnGrid(
            listOf(
                onOffBtn("CAPT pitot leak", "CAPT PITOT LEAK", "psPitotCaptLeak", true),
                onOffBtn("F/O pitot leak", "F/O PITOT LEAK", "psPitotFoLeak", true),
                onOffBtn("CAPT static leak", "CAPT STATIC LEAK", "psStaticCaptLeak", true),
                onOffBtn("F/O static leak", "F/O STATIC LEAK", "psStaticFoLeak", true),
                onOffBtn("CAPT alt-static leak", "CAPT ALTERNATE STATIC LEAK", "psAltStaticCaptLeak", true),
                onOffBtn("F/O alt-static leak", "F/O ALTERNATE STATIC LEAK", "psAltStaticFoLeak", true),
                onOffBtn("CAPT selector leak", "CAPT STATIC SELECTOR VALVE LEAK", "psStaticSelectorCaptLeak", true),
                onOffBtn("F/O selector leak", "F/O STATIC SELECTOR VALVE LEAK", "psStaticSelectorFoLeak", true),
                onOffBtn("AUX 1 pitot leak", "AUX 1 PITOT LEAK", "psAux1PitotLeak", true),
                onOffBtn("AUX 2 pitot leak", "AUX 2 PITOT LEAK", "psAux2PitotLeak", true),
                onOffBtn("AUX 1 static leak", "AUX 1 STATIC LEAK", "psAux1StaticLeak", true),
                onOffBtn("AUX 2 static leak", "AUX 2 STATIC LEAK", "psAux2StaticLeak", true),
                onOffBtn("Standby pitot leak", "STANDBY PITOT LEAK", "psStandbyPitotLeak", true),
                onOffBtn("Standby static leak", "STANDBY STATIC LEAK", "psStandbyStaticLeak", true),
            ),
        )
        Note(
            "Test pressure is modeled at 300 kt equivalent pitot pressure; static vacuum is modeled at 22,500 ft equivalent altitude. " +
                "The maintenance clock advances only while the trainer is enabled.",
        )
    }

    BtnGrid(
        listOf(
            act("Clear all Pitot/Static faults", 0, "PITOT/STATIC faults cleared", PitotStaticRules::clearFaults),
            TBtn("Icing · P5-9 heat OFF", 2) {
                cockpit.patchSimNote("PITOT/STATIC ICE CONDITION — P5-9 HEAT OFF") {
                    psIcing = true; probeHeatCaptPitot = false; probeHeatFoPitot = false; probeHeatElevL = false; probeHeatElevR = false
                }
            },
        ),
    )
}

@Composable
private fun HeatGroup(title: String, upper: String, upperOn: Boolean, lower: String, modifier: Modifier) {
    Column(modifier.background(Color(0xFF101318), RoundedCornerShape(4.dp)).border(1.dp, LineColor, RoundedCornerShape(4.dp)).padding(8.dp)) {
        Text(title, color = Color(0xFFB7AB87), fontSize = 9.sp)
        Spacer(Modifier.height(4.dp))
        val c = if (upperOn) OkColor else WarnColor
        Text(upper, color = c, fontFamily = FontFamily.Monospace, fontSize = 8.sp)
        Text(lower, color = c, fontFamily = FontFamily.Monospace, fontSize = 8.sp)
    }
}
