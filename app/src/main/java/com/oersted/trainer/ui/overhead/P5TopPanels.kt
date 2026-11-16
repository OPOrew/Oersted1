package com.oersted.trainer.ui.overhead

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.oersted.trainer.sim.OverheadLocal
import com.oersted.trainer.sim.OverheadP5Rules
import com.oersted.trainer.ui.pedestal.AnnunTone
import com.oersted.trainer.ui.pedestal.Knob
import com.oersted.trainer.ui.pedestal.LegendColor
import com.oersted.trainer.ui.pedestal.Plate
import com.oersted.trainer.ui.pedestal.PlateBorder
import com.oersted.trainer.ui.pedestal.PushButton
import com.oersted.trainer.ui.pedestal.Screws

/* Top row of OverheadP5.tsx: ELT, LE devices, cargo fire block, service interphone, audio, engine, oxygen, recorder, dome white. */

private fun cellColor(on: Boolean, amber: Boolean): Color = if (on) Color(0xFF42D36E) else if (amber) Color(0xFFE9A93A) else Color(0xFF26302A)

@Composable
fun EltPanel(p: P5, modifier: Modifier = Modifier) {
    Plate("ELT", modifier.fillMaxWidth().heightIn(min = 86.dp)) {
        P5Row {
            A("ELT", p.d.eltTransmitting, AnnunTone.AMBER, w = 40, wide = false, modifier = Modifier.padding(top = 8.dp))
            VSwitch(listOf("OFF", "ARM", "ON"), p.s.eltMode, { v -> p.patch("ELT $v") { eltMode = v } }, "ELT", legends = listOf("OFF", "ARM", "ON"))
        }
    }
}

@Composable
fun LeDevices(p: P5, modifier: Modifier = Modifier) {
    var test by remember { mutableStateOf(false) }
    val pw = p.d.dcPower
    val ext = OverheadP5Rules.leExt(pw, p.d.leExtended, test)
    val tr = OverheadP5Rules.leTransit(pw, p.d.leTransit, test)
    @Composable
    fun Side(flip: Boolean) {
        Box(Modifier.size(width = 74.dp, height = 52.dp).graphicsLayer { scaleX = if (flip) -1f else 1f }) {
            Box(Modifier.align(Alignment.CenterStart).fillMaxWidth().height(2.dp).background(Color(0xFF25272A)))
            for (i in 0..4) {
                val x = if (i < 2) 3 else if (i == 2) 33 else 63
                Box(
                    Modifier.offset(x = x.dp, y = (6 + i * 7).dp).size(width = 8.dp, height = 12.dp)
                        .background(cellColor(ext, tr), RoundedCornerShape(1.dp))
                        .border(1.dp, Color.Black.copy(alpha = 0.6f), RoundedCornerShape(1.dp)),
                )
            }
        }
    }
    @Composable
    fun Side3() {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            P5Legend("TRANSIT", 4.5f); P5Legend("EXT", 4.5f); P5Legend("FULL EXT", 4.5f)
        }
    }
    Plate("LE DEVICES", modifier.fillMaxWidth().heightIn(min = 96.dp)) {
        Grid3(align = Alignment.CenterVertically, lead = { Side3() }, mid = {
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) { Side(false); Side(true) }
        }, trail = { Side3() })
        Row(Modifier.fillMaxWidth().padding(top = 4.dp, start = 8.dp, end = 8.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            P5Legend("FLAPS · SLATS", 5f)
            PushButton("TEST", onPress = { test = true }, onRelease = { test = false })
        }
    }
}

@Composable
fun CargoFirePanel(p: P5, modifier: Modifier = Modifier) {
    val s = p.s
    val pw = p.d.dcPower
    var arm by remember { mutableStateOf(false) }
    var lamp by remember { mutableStateOf(false) }
    val lit = pw && lamp
    fun disch(c: String) {
        if (!OverheadP5Rules.cargoCanDischarge(arm, s.cargoFireInstalled, s.cargoBottleDischarged)) return
        p.patch(OverheadP5Rules.cargoDischargeNote(c)) { cargoArmed = c; cargoBottleDischarged = true; cargoAgentTimer = 0.0 }
    }
    Plate(null, modifier.fillMaxWidth().heightIn(min = 190.dp)) {
        Grid(2, gap = 8.dp) {
            item {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        RoundBtn("MX TEST")
                        RoundBtn("LAMP TEST", onPress = { lamp = true }, onRelease = { lamp = false })
                    }
                    RoundBtn("MX SETUP")
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        A("MX", lit, AnnunTone.AMBER, true, w = 32, wide = false)
                        A("SYS OK", pw, AnnunTone.GREEN, true, w = 40, wide = false)
                    }
                    Box(Modifier.fillMaxWidth().height(20.dp).background(Color.Black, RoundedCornerShape(2.dp)).border(1.dp, Color(0xFF111111), RoundedCornerShape(2.dp)))
                    P5Cap("MX DISPLAY")
                }
            }
            item {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    P5Cap("FWD")
                    A("FIRE", lit || (pw && p.d.cargoFwdFireWarn), AnnunTone.RED, true, w = 40, wide = false)
                    RoundBtn("DISCH", onPress = { disch("FWD") })
                    A("BTL1 DISCH", lit || (pw && s.cargoBottleDischarged && s.cargoArmed == "FWD"), AnnunTone.GREEN, true, w = 56, wide = false)
                    OnOff(arm, { arm = it }, "ARM", small = true, guarded = true, legends = listOf("", "ARM"))
                    P5Cap("AFT")
                    A("FIRE", lit || (pw && p.d.cargoAftFireWarn), AnnunTone.RED, true, w = 40, wide = false)
                    RoundBtn("DISCH", onPress = { disch("AFT") })
                    A("BTL2 DISCH", lit || (pw && s.cargoBottleDischarged && s.cargoArmed == "AFT"), AnnunTone.GREEN, true, w = 56, wide = false)
                }
            }
        }
    }
}

@Composable
fun ColumnScope.ServiceInterphone(p: P5, last: Boolean) {
    val shape = RoundedCornerShape(3.dp)
    Box(Modifier.fillMaxWidth().padding(top = 60.dp), contentAlignment = Alignment.TopCenter) { Slot(48) }
    Box(
        Modifier.fillMaxWidth().then(if (last) Modifier.weight(1f) else Modifier)
            .background(Color(0xFF1B1C1F), shape).border(1.dp, PlateBorder, shape),
    ) {
        Screws(2)
        Column(Modifier.fillMaxWidth().padding(start = 4.dp, end = 4.dp, bottom = 4.dp, top = 12.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            P5Legend("SERVICE INTERPHONE", 5f, align = TextAlign.Center)
            VSwitch(listOf("OFF", "ON"), if (p.s.serviceInterphoneOn) "ON" else "OFF", { v -> p.patch("SERVICE INTERPHONE $v") { serviceInterphoneOn = v == "ON" } }, null, small = true, legends = listOf("OFF", "ON"))
            A("CALL", p.d.serviceCallEffective && p.s.serviceInterphoneOn, AnnunTone.BLUE, true, wide = false)
        }
    }
}

@Composable
fun DomeWhite(p: P5, modifier: Modifier = Modifier) {
    Plate("DOME WHITE", modifier.fillMaxWidth()) {
        P5Row {
            VSwitch(listOf("DIM", "OFF", "BRT"), p.s.ltDome, { v -> p.patch { ltDome = v } }, null, small = true, legends = listOf("DIM", "OFF", "BRIGHT"))
        }
    }
}

@Composable
private fun RxToggle(p: P5, k: String) {
    val on = p.o.audioRx[k] == true
    Box(
        Modifier.size(width = 12.dp, height = 26.dp)
            .background(Color(0xFF14161A), RoundedCornerShape(2.dp)).border(1.dp, Color.Black, RoundedCornerShape(2.dp))
            .tap { p.overhead { it.copy(audioRx = it.audioRx + (k to !(it.audioRx[k] == true))) } },
    ) {
        Box(
            Modifier.align(if (on) Alignment.TopCenter else Alignment.BottomCenter).padding(vertical = 2.dp)
                .size(width = 8.dp, height = 9.dp)
                .background(Brush.horizontalGradient(listOf(Color(0xFF9AA0A6), Color(0xFF50555A))), RoundedCornerShape(1.dp)),
        )
        Box(Modifier.align(Alignment.TopCenter).offset(y = (-5).dp).size(3.dp).background(if (on) Color(0xFF42D36E) else Color(0xFF1F3A28), RoundedCornerShape(50)))
    }
}

@Composable
fun AudioPanel(p: P5, modifier: Modifier = Modifier) {
    val pw = p.d.dcPower
    var filter by remember { mutableStateOf(1.0) } // V B R
    Plate(null, modifier.fillMaxWidth().heightIn(min = 162.dp)) {
        Grid(8, gap = 2.dp) {
            OverheadP5Rules.RX.forEach { r -> item { P5Legend(r, 4.5f, align = TextAlign.Center) } }
            OverheadP5Rules.RX.forEach { r ->
                item {
                    val lit = OverheadP5Rules.audioTxLit(p.o.audioTx, r, pw)
                    Box(
                        Modifier.size(width = 15.dp, height = 18.dp)
                            .background(if (lit) Color(0xFFF4EFD8) else Color(0xFF26282B), RoundedCornerShape(2.dp))
                            .border(1.dp, Color.Black, RoundedCornerShape(2.dp))
                            .tap { p.overhead { it.copy(audioTx = OverheadP5Rules.audioTxToggle(it.audioTx, r)) } },
                        contentAlignment = Alignment.Center,
                    ) { Text("C", color = if (lit) Color.Black else LegendColor, fontSize = 7.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold) }
                }
            }
            OverheadP5Rules.RX.forEach { r -> item { Box(Modifier.padding(top = 4.dp)) { RxToggle(p, r) } } }
        }
        Box(Modifier.padding(top = 6.dp, start = 14.dp)) {
            Grid(6, gap = 2.dp) {
                OverheadP5Rules.AUD2.forEach { a -> item { Box(Modifier.padding(top = 4.dp)) { RxToggle(p, a.first) } } }
                OverheadP5Rules.AUD2.forEach { a -> item { P5Legend(a.second, 4.5f, align = TextAlign.Center) } }
            }
        }
        Box(Modifier.padding(top = 4.dp)) {
            Grid(4, gap = 4.dp, align = Alignment.Bottom) {
                item { VSwitch(listOf("R/T", "I/C"), if (p.o.audioRtIc) "R/T" else "I/C", { v -> p.overhead { it.copy(audioRtIc = v == "R/T") } }, "", small = true, legends = listOf("R/T", "I/C")) }
                item {
                    VSwitch(
                        listOf("MASK", "BOOM"), p.o.audioMask.label,
                        { v -> p.overhead { it.copy(audioMask = if (v == "MASK") OverheadLocal.AudioMask.MASK else OverheadLocal.AudioMask.BOOM) } },
                        "", small = true, legends = listOf("MASK", "BOOM"),
                    )
                }
                item { Knob(filter, { filter = it }, size = 22.dp, min = 0.0, max = 2.0, step = 1.0, ticks = listOf("V", "B", "R")) }
                item { VSwitch(listOf("ALT", "NORM"), if (p.o.audioAlt) "ALT" else "NORM", { v -> p.overhead { it.copy(audioAlt = v == "ALT") } }, "", small = true, legends = listOf("ALT", "NORM")) }
            }
        }
    }
}

@Composable
private fun PmcPill(text: String, lit: Boolean, border: Color, fill: Color, ink: Color) {
    Box(
        Modifier.fillMaxWidth()
            .background(if (lit) fill else Color(0xFF1A1C1F), RoundedCornerShape(2.dp))
            .border(1.dp, if (lit) border else Color(0xFF222222), RoundedCornerShape(2.dp))
            .padding(vertical = 1.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text, color = if (lit) ink else Color(0xFF6D6A5E), fontSize = 6.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold) }
}

@Composable
fun EnginePanel(p: P5, modifier: Modifier = Modifier) {
    val pw = p.d.dcPower
    val rt = p.o.reverserTest
    var pmc1 by remember { mutableStateOf(true) }
    var pmc2 by remember { mutableStateOf(true) }
    fun setT(n: Int, v: Boolean) = p.overhead { it.copy(reverserTest = if (n == 1) Pair(v, it.reverserTest.second) else Pair(it.reverserTest.first, v)) }
    val lowIdle = OverheadP5Rules.lowIdleLit(pw, rt.first, rt.second)
    @Composable
    fun Eng(n: Int) {
        val pmc = if (n == 1) pmc1 else pmc2
        val test = if (n == 1) rt.first else rt.second
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
            P5Legend("$n", 6f)
            A("REVERSER", OverheadP5Rules.reverserLit(pw, if (n == 1) p.d.thrustReverser1Active else p.d.thrustReverser2Active, test), AnnunTone.AMBER, true, w = 56, wide = false)
            Column(
                Modifier.width(46.dp)
                    .background(Color(0xFF2C2F33), RoundedCornerShape(3.dp)).border(1.dp, Color(0xFF15171A), RoundedCornerShape(3.dp)).padding(2.dp)
                    .pointerInput(n) {
                        detectTapGestures(
                            onPress = { setT(n, true); tryAwaitRelease(); setT(n, false) },
                            onTap = { if (n == 1) pmc1 = !pmc1 else pmc2 = !pmc2 },
                        )
                    },
                verticalArrangement = Arrangement.spacedBy(1.dp),
            ) {
                PmcPill("ON", OverheadP5Rules.pmcOnLit(pw, pmc), Color(0xFF1D7A45), Color(0xFF38D27A), Color(0xFF03230F))
                PmcPill("INOP", OverheadP5Rules.pmcInopLit(pw, pmc, test), Color(0xFFA8741A), Color(0xFFE9A93A), Color(0xFF2A1B00))
            }
        }
    }
    Plate("ENGINE", modifier.fillMaxWidth().heightIn(min = 96.dp)) {
        GridSides(left = { Eng(1) }, mid = {
            Box(Modifier.padding(top = 26.dp)) { A("LOW IDLE", lowIdle, AnnunTone.AMBER, true, w = 48, wide = false) }
        }, right = { Eng(2) })
    }
}

@Composable
fun OxygenRow(p: P5, modifier: Modifier = Modifier) {
    val s = p.s
    val d = p.d
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Plate("CREW OXYGEN", Modifier.weight(1.45f).fillMaxHeight().heightIn(min = 104.dp)) {
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                Gauge("OXY PRESS PSI ×100", "PSI", if (d.oxygenPressureIndicated) s.crewOxyPsi else 0.0, 0.0, 2000.0, 74.dp, 10)
            }
            Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterHorizontally), verticalAlignment = Alignment.CenterVertically) {
                VSwitch(listOf("NORMAL", "ON"), s.crewOxyMode, { v -> p.patch("CREW OXYGEN $v") { crewOxyMode = v } }, null, small = true, legends = listOf("NORM", "ON"))
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                    MiniCheck(s.crewMaskMic) { v -> p.patch("MASK MICROPHONE ${if (v) "ON" else "OFF"}") { crewMaskMic = v } }
                    P5Legend("MASK MIC", 5f)
                }
            }
            P5Cap(if (s.faults.oxygenSystemFailure) "OXYGEN SYSTEM FAIL" else if (d.oxygenPressureIndicated) "PRESSURE INDICATED" else "INDICATION UNPOWERED", Modifier.fillMaxWidth())
        }
        Plate("PASS OXYGEN", Modifier.weight(1f).fillMaxHeight()) {
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                RedGuarded(s.passOxyMode, listOf("NORMAL", "ON"), { v -> p.patch("PASSENGER OXYGEN $v") { passOxyMode = v } }, null, listOf("NORMAL", "ON"))
                A("PASS OXY\nON", d.passengerOxygenDeployed, AnnunTone.AMBER, true, w = 48, wide = false)
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                    MiniCheck(s.passOxyAutoDeploy) { v -> p.patch { passOxyAutoDeploy = v } }
                    P5Legend("AUTO DROP", 5f)
                }
            }
        }
    }
}

@Composable
fun ColumnScope.RecorderPanel(p: P5) {
    val pw = p.d.dcPower
    val s = p.s
    Blank(84)
    Blank(84)
    P5Plate {
        Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            BlackLabel(Modifier.weight(1f).fillMaxHeight()) {
                P5Legend("FLIGHT RECORDER", 8f, color = Color(0xFFE6E1D2))
                Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    P5Legend("TEST", 6f); P5Legend("NORMAL", 6f)
                }
            }
            BlackLabel(Modifier.width(62.dp).fillMaxHeight()) {
                P5Legend("MACH AIRSPEED WARNING", 6f, align = TextAlign.Center)
                Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.SpaceAround) {
                    P5Legend("NO 1", 5f); P5Legend("NO 2", 5f)
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 4.dp, start = 4.dp, end = 4.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            HSwitch(listOf("TEST", "NORMAL"), s.flightRecorderMode, { v -> p.patch("FLIGHT RECORDER $v") { flightRecorderMode = v; cvrTest = v == "TEST" } })
            A("OFF", p.d.cvrOff, AnnunTone.AMBER, true, w = 36, wide = false)
            for (n in 1..2) {
                RoundBtn(
                    onPress = { p.overhead { it.copy(machWarn = n) }; p.patch("MACH/AIRSPEED WARNING TEST $n") { psMachWarningTest = true } },
                    onRelease = { p.overhead { it.copy(machWarn = 0) }; p.patch { psMachWarningTest = false } },
                )
            }
        }
    }
    P5Plate {
        BlackLabel(Modifier.fillMaxWidth()) {
            P5Legend("STALL WARNING TEST", 8f, align = TextAlign.Center)
            Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.SpaceAround) {
                P5Legend("NO. 1", 6f); P5Legend("NO. 2", 6f)
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.SpaceAround) {
            for (n in 1..2) {
                RoundBtn(
                    onPress = { p.overhead { it.copy(stallTest = n) }; p.patch("STALL WARNING TEST $n") { psStallWarningTest = true } },
                    onRelease = { p.overhead { it.copy(stallTest = 0) }; p.patch { psStallWarningTest = false } },
                )
            }
        }
    }
    Blank(60, Modifier.weight(1f))
}
