package com.oersted.trainer.ui.overhead

import com.oersted.trainer.ui.common.insetShadow
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.oersted.trainer.sim.OverheadP5Rules
import com.oersted.trainer.sim.PedestalLowerRules
import com.oersted.trainer.sim.SimState
import com.oersted.trainer.ui.pedestal.AnnunTone
import com.oersted.trainer.ui.pedestal.Knob
import com.oersted.trainer.ui.pedestal.Plate

/* Main row of OverheadP5.tsx, columns A to C: compass, flight controls, fuel, electrical meters, standby power, generators, cabin service. */

private val R = OverheadP5Rules

@Composable
fun CompassPanel(p: P5, modifier: Modifier = Modifier) {
    Plate(null, modifier.fillMaxWidth().heightIn(min = 48.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceAround, verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(28.dp).background(Color.Black, CircleShape).border(1.dp, Color(0xFF111111), CircleShape), contentAlignment = Alignment.Center) {
                Box(Modifier.size(width = 4.dp, height = 16.dp).background(if (p.d.dcPower) Color(0xFFE8E8E8) else Color(0xFF333333), RoundedCornerShape(1.dp)))
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                P5Cap("COMPASS")
                HSwitch(listOf("DG", "SLAVED"), if (p.o.compassDg) "DG" else "SLAVED", { v -> p.overhead { it.copy(compassDg = v == "DG") } }, legends = listOf("DG", "SLAVED"))
            }
            Knob(0.0, { v -> p.overhead { it.copy(compassHdg = R.compassStep(it.compassHdg, v)) } }, size = 30.dp, min = -2.0, max = 2.0, step = 1.0, ticks = listOf("", "", "SET HDG", "", ""))
        }
    }
}

@Composable
private fun YawDamper(p: P5) {
    Row(Modifier.fillMaxWidth().mt(4), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
            P5Cap("YAW DAMPER")
            A("YAW\nDAMPER", p.d.dcPower && p.s.yawDamper && !p.d.yawDamperEffective, AnnunTone.AMBER, false, w = 48, wide = false)
        }
        OffOn(p.s.yawDamper, { v -> p.patch(if (v) "YAW DAMPER ON" else "YAW DAMPER OFF") { yawDamper = v } }, "", small = true)
    }
}

@Composable
fun FltCtrlPanel(p: P5, modifier: Modifier = Modifier) {
    val s = p.s
    val d = p.d
    val pw = d.dcPower
    val opts = listOf("STBY RUD", "OFF", "ON")
    fun set(side: String, v: String) {
        if (v == "STBY RUD") {
            p.patch("FLT CONTROL $side → STBY RUD (standby hydraulic to rudder)") { if (side == "A") fltCtrlA = false else fltCtrlB = false; stbyHyd = "ON" }
        } else {
            p.patch { if (side == "A") fltCtrlA = v == "ON" else fltCtrlB = v == "ON" }
        }
    }
    Plate("FLT CONTROL", modifier.fillMaxWidth().heightIn(min = 300.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.Top) {
            VSwitch(opts, R.fltCtrlPosition(s.fltCtrlA, s.stbyHyd), { set("A", it) }, "A", guarded = true, legends = opts)
            VSwitch(opts, R.fltCtrlPosition(s.fltCtrlB, s.stbyHyd), { set("B", it) }, "B", guarded = true, legends = opts)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                P5Cap("STANDBY HYD", Modifier.fillMaxWidth())
                A("LOW\nQUANTITY", R.stbyLowQuantity(pw, s.hydSQty), AnnunTone.AMBER)
                A("LOW\nPRESSURE", R.stbyLowPressure(pw, s.stbyHyd, d.stbyOn), AnnunTone.AMBER)
            }
        }
        Row(Modifier.fillMaxWidth().mt(4), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.Top) {
            A("LOW\nPRESSURE", d.hydALow, w = 52, wide = false)
            A("LOW\nPRESSURE", d.hydBLow, w = 52, wide = false)
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                P5Cap("ALTERNATE FLAPS")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Top) {
                    RedGuarded(
                        if (s.altFlapsArm) "ARM" else "OFF", listOf("OFF", "ARM"),
                        { v -> p.patch { altFlapsArm = v == "ARM"; altFlapsControl = if (v == "ARM") altFlapsControl else "OFF" } },
                        null, listOf("OFF", "ARM"),
                    )
                    VSwitch(
                        listOf("UP", "OFF", "DN"), s.altFlapsControl,
                        { v ->
                            if (!s.altFlapsArm && v != "OFF") p.patch("ALTERNATE FLAPS control inhibited — ARM switch first.") {}
                            else p.patch("ALT FLAPS position $v") { altFlapsControl = v }
                        },
                        legends = listOf("UP", "OFF", "DOWN"),
                    )
                }
            }
        }
        Row(Modifier.fillMaxWidth().mt(8), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.Top) {
            OffOn(s.spoilerA, { v -> p.patch { spoilerA = v } }, "A")
            OffOn(s.spoilerB, { v -> p.patch { spoilerB = v } }, "B")
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                P5Cap("SPOILER", Modifier.fillMaxWidth())
                A("FEEL DIFF\nPRESS", pw && d.feelDiff, AnnunTone.AMBER)
            }
        }
        Row(Modifier.fillMaxWidth().mt(4), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            A("MACH TRIM\nFAIL", pw && p.o.machTrimTest, w = 64, wide = false)
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                P5Cap("MACH TRIM")
                RoundBtn("TEST", onPress = { p.overhead { it.copy(machTrimTest = true) } }, onRelease = { p.overhead { it.copy(machTrimTest = false) } })
            }
        }
        YawDamper(p)
    }
}

private fun SimState.fuelPump(k: String): Boolean = when (k) {
    "fuelPump1Fwd" -> fuelPump1Fwd
    "fuelPump1Aft" -> fuelPump1Aft
    "fuelPump2Fwd" -> fuelPump2Fwd
    "fuelPump2Aft" -> fuelPump2Aft
    "fuelPumpCenter1" -> fuelPumpCenter1
    else -> fuelPumpCenter2
}

private fun SimState.setFuelPump(k: String, v: Boolean) {
    when (k) {
        "fuelPump1Fwd" -> fuelPump1Fwd = v
        "fuelPump1Aft" -> fuelPump1Aft = v
        "fuelPump2Fwd" -> fuelPump2Fwd = v
        "fuelPump2Aft" -> fuelPump2Aft = v
        "fuelPumpCenter1" -> fuelPumpCenter1 = v
        else -> fuelPumpCenter2 = v
    }
}

@Composable
private fun FuelPump(p: P5, label: String, k: String) {
    OffOn(p.s.fuelPump(k), { v -> p.patch { setFuelPump(k, v) } }, label, small = true, legends = listOf("OFF", "ON"))
}

@Composable
fun ColumnScope.FuelPanel(p: P5, last: Boolean) {
    val s = p.s
    val d = p.d
    val pw = d.dcPower
    Plate(null, Modifier.fillMaxWidth().heightIn(min = 124.dp)) {
        GridSides(align = Alignment.CenterVertically, left = { A("ENG VALVE\nCLOSED", pw && !d.fuelShutoff1Open, AnnunTone.BLUE, true) }, mid = {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Gauge("TANK 1 FUEL °C", null, if (d.fuelTempIndicationPowered) s.fuelTempC else -56.0, -40.0, 40.0, 66.dp, 4)
                A("≤ 0°C", d.fuelTempLow, AnnunTone.AMBER, true, wide = false)
                A("HEAT 1", d.fuelHeatValveOpen, AnnunTone.BLUE, true, wide = false)
                A("HEAT 2", d.fuelHeatValve2Open, AnnunTone.BLUE, true, wide = false)
                A("NO AC", !d.fuelTempIndicationPowered, AnnunTone.AMBER, true, wide = false)
            }
        }, right = { A("ENG VALVE\nCLOSED", pw && !d.fuelShutoff2Open, AnnunTone.BLUE, true) })
        Box(Modifier.mt(4)) {
            GridSides(align = Alignment.CenterVertically, left = { A("FILTER\nICING 1", d.fuelFilterIcing1, AnnunTone.AMBER, true) }, mid = {
                A("CROSSFEED\nOPEN", pw && s.fuelCrossfeed, AnnunTone.BLUE, true, w = 48)
            }, right = { A("FILTER\nICING 2", d.fuelFilterIcing2, AnnunTone.AMBER, true) })
        }
    }
    Plate(null, (if (last) Modifier.weight(1f) else Modifier).fillMaxWidth().heightIn(min = 226.dp), P5LightPlate) {
        Grid3(align = Alignment.CenterVertically, gap = 4.dp, lead = {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                P5Cap("1 HEAT", color = P5Ink)
                OffOn(s.fuelHeat, { v -> p.patch("ENG 1 FUEL HEAT ${if (v) "ON" else "OFF"}") { fuelHeat = v; if (v) fuelHeatElapsedSec = 0.0 } }, null, small = true)
                A("VALVE", d.fuelHeatValveOpen, AnnunTone.BLUE, true, wide = false)
                Text("${R.fuelHeatSeconds(s.fuelHeatElapsedSec)} SEC", color = P5Ink, fontSize = 7.sp)
            }
        }, mid = {
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                P5Legend("CROSS", 7f, color = P5Ink)
                Knob(
                    if (s.fuelCrossfeed) 1.0 else 0.0,
                    { v -> p.patch(if (v >= 0.5) "FUEL CROSSFEED OPEN" else "FUEL CROSSFEED CLOSED") { fuelCrossfeed = v >= 0.5 } },
                    size = 40.dp, min = 0.0, max = 1.0, step = 1.0,
                )
                P5Legend("FEED", 7f, color = P5Ink)
            }
        }, trail = {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                P5Cap("2 HEAT", color = P5Ink)
                OffOn(s.fuelHeat2, { v -> p.patch("ENG 2 FUEL HEAT ${if (v) "ON" else "OFF"}") { fuelHeat2 = v; if (v) fuelHeat2ElapsedSec = 0.0 } }, null, small = true)
                A("VALVE", d.fuelHeatValve2Open, AnnunTone.BLUE, true, wide = false)
                Text("${R.fuelHeatSeconds(s.fuelHeat2ElapsedSec)} SEC", color = P5Ink, fontSize = 7.sp)
            }
        })
        Box(Modifier.mt(4)) {
            Grid(2, gap = 4.dp) {
                item { A("LOW\nPRESSURE", pw && d.fuelCenterPump1LowPressure, AnnunTone.AMBER, true) }
                item { A("LOW\nPRESSURE", pw && d.fuelCenterPump2LowPressure, AnnunTone.AMBER, true) }
            }
        }
        Row(Modifier.fillMaxWidth().mt(2), horizontalArrangement = Arrangement.SpaceAround, verticalAlignment = Alignment.CenterVertically) {
            P5Legend("L", 8f, color = P5Ink)
            FuelPump(p, "CTR", "fuelPumpCenter1")
            P5Legend("FUEL PUMPS", 7f, color = P5Ink)
            FuelPump(p, "", "fuelPumpCenter2")
            P5Legend("R", 8f, color = P5Ink)
        }
        Box(Modifier.mt(4)) {
            Grid(4, gap = 4.dp) {
                item { A("LOW\nPRESSURE", pw && d.fuelPump1AftLowPressure, AnnunTone.AMBER, true) }
                item { A("LOW\nPRESSURE", pw && d.fuelPump1FwdLowPressure, AnnunTone.AMBER, true) }
                item { A("LOW\nPRESSURE", pw && d.fuelPump2FwdLowPressure, AnnunTone.AMBER, true) }
                item { A("LOW\nPRESSURE", pw && d.fuelPump2AftLowPressure, AnnunTone.AMBER, true) }
            }
        }
        Box(Modifier.mt(2)) {
            Grid(4, gap = 4.dp) {
                item { FuelPump(p, "AFT", "fuelPump1Aft") }
                item { FuelPump(p, "FWD", "fuelPump1Fwd") }
                item { FuelPump(p, "FWD", "fuelPump2Fwd") }
                item { FuelPump(p, "AFT", "fuelPump2Aft") }
            }
        }
        Row(Modifier.fillMaxWidth().mt(2), horizontalArrangement = Arrangement.SpaceAround) {
            P5Legend("1", 8f, color = P5Ink)
            P5Legend("2", 8f, color = P5Ink)
        }
    }
}

// ───────────────────────── column B: electrical ─────────────────────────

@Composable
fun MeterPanel(p: P5, modifier: Modifier = Modifier) {
    val s = p.s
    val d = p.d
    val pw = d.dcPower
    var tr by remember { mutableStateOf(3) }
    var ac by remember { mutableStateOf(2) }
    var galley by remember { mutableStateOf(true) }
    val dcSrc = R.meterDcSource(tr, s.standbyPower, s.battery, listOf(d.tr1Powered, d.tr2Powered, d.tr3Powered))
    val acSrc = R.meterAcSource(ac, s.standbyPower, pw, s.groundPowerOn, s.externalPowerConnected, d.generator1BusPowered, d.generator2BusPowered, s.apuGen, s.apuRpm)
    Plate(null, modifier.fillMaxWidth().heightIn(min = 250.dp)) {
        Grid(2, rowGap = 4.dp, gap = 0.dp) {
            item { Gauge("DC AMPS", null, R.meterDcAmps(pw, dcSrc, tr), -50.0, 50.0, 62.dp) }
            item { Gauge("FREQ", null, R.meterFreq(acSrc), 380.0, 420.0, 62.dp) }
            item { Gauge("DC VOLTS", null, R.meterDcVolts(dcSrc, tr), 0.0, 40.0, 62.dp) }
            item { Gauge("AC VOLTS", null, R.meterAcVolts(acSrc), 100.0, 130.0, 62.dp) }
        }
        Box(Modifier.mt(4)) {
            Grid(2, gap = 4.dp) {
                item {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Knob(tr.toDouble(), { tr = Math.round(it).toInt() }, size = 32.dp, min = 0.0, max = 6.0, step = 1.0, ticks = R.TR_TICKS)
                        Row(Modifier.mt(2), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                            P5Cap("BAT")
                            OffOn(s.battery, { v -> p.patch { battery = v } }, null, small = true)
                        }
                        P5Cap("DC")
                    }
                }
                item {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Knob(ac.toDouble(), { ac = Math.round(it).toInt() }, size = 32.dp, min = 0.0, max = 5.0, step = 1.0, ticks = R.AC_TICKS)
                        Row(Modifier.mt(2), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Top) {
                            OffOn(galley, { galley = it }, "GALLEY", small = true)
                            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                P5Cap("RESID VOLTS")
                                RoundBtn()
                            }
                        }
                        P5Cap("AC")
                    }
                }
            }
        }
    }
}

@Composable
private fun DriveDisc(p: P5, n: Int) {
    val s = p.s
    val on = if (n == 1) s.gen1Disc else s.gen2Disc
    val shape = RoundedCornerShape(3.dp)
    Box(
        Modifier.size(width = 26.dp, height = 44.dp)
            .background(if (on) Color(0xFFE83A2A) else Color(0xFFB51F1F), shape)
            .insetShadow(shape, 8.dp, Color.Black.copy(alpha = 0.5f))
            .border(2.dp, if (on) Color(0xFFFFB0A0) else Color(0xFF7B1515), shape)
            .tap {
                val n2 = if (n == 1) s.n2_1 else s.n2_2
                val blocked = R.driveResetBlockedNote(n, on, s.wow, n2)
                if (blocked != null) p.patch(blocked) {}
                else p.patch(R.driveToggleNote(n, !on)) { if (n == 1) gen1Disc = !on else gen2Disc = !on }
            },
    )
}

@Composable
fun StandbyPanel(p: P5, modifier: Modifier = Modifier) {
    val s = p.s
    val d = p.d
    val pw = d.dcPower
    var rise by remember { mutableStateOf(true) }
    val t1 = R.genDriveShown(s.genDriveOilTemp1C, rise)
    val t2 = R.genDriveShown(s.genDriveOilTemp2C, rise)
    Plate(null, modifier.fillMaxWidth().heightIn(min = 216.dp)) {
        Grid3(gap = 4.dp, lead = {
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                A("LOW OIL\nPRESS", pw && d.generatorDrive1LowOilPressure, AnnunTone.AMBER, true, w = 44)
                A("HIGH OIL\nTEMP", pw && d.generatorDrive1HighOilTemp, AnnunTone.AMBER, true, w = 44)
            }
        }, mid = { Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) { P5Cap("STANDBY POWER") } }, trail = {
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                A("LOW OIL\nPRESS", pw && d.generatorDrive2LowOilPressure, AnnunTone.AMBER, true, w = 44)
                A("HIGH OIL\nTEMP", pw && d.generatorDrive2HighOilTemp, AnnunTone.AMBER, true, w = 44)
            }
        })
        Box(Modifier.mt(4)) {
            Grid3(align = Alignment.CenterVertically, gap = 4.dp, lead = {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) { P5Cap("DISCONNECT"); DriveDisc(p, 1) }
            }, mid = {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    HSwitch(listOf("BAT", "OFF", "AUTO"), R.standbyPowerPosition(s.standbyPower), { v -> p.patch { standbyPower = v } }, legends = listOf("BAT", "OFF", "AUTO"))
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        P5Cap("DRIVE TEMP")
                        VSwitch(listOf("RISE", "IN"), if (rise) "RISE" else "IN", { rise = it == "RISE" }, null, small = true, legends = listOf("RISE", "IN"))
                    }
                }
            }, trail = {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) { P5Cap("DISCONNECT"); DriveDisc(p, 2) }
            })
        }
        P5Legend("DRIVE CAN BE RECONNECTED ONLY ON GRD", 4.5f, Modifier.fillMaxWidth().mt(2).alpha(0.8f), align = TextAlign.Center)
        Row(Modifier.fillMaxWidth().mt(4), horizontalArrangement = Arrangement.SpaceAround) {
            Gauge("GEN DRIVE OIL TEMP °C", "RISE 0–30 · IN 40–160", if (pw) t1 else 40.0, 40.0, 160.0, 70.dp, redFrom = 120.0)
            Gauge("GEN DRIVE OIL TEMP °C", "RISE 0–30 · IN 40–160", if (pw) t2 else 40.0, 40.0, 160.0, 70.dp, redFrom = 120.0)
        }
    }
}

@Composable
fun ColumnScope.GenPanel(p: P5, last: Boolean) {
    val s = p.s
    val d = p.d
    val pw = d.dcPower
    val gpu = s.externalPowerConnected
    Plate(null, Modifier.fillMaxWidth().heightIn(min = 116.dp)) {
        GridSides(align = Alignment.CenterVertically, left = { Gauge("AC AMPS", null, if (d.generator1BusPowered) 90.0 else 0.0, 0.0, 200.0, 62.dp) }, mid = {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                A("GRD POWER\nAVAILABLE", d.groundPowerAvailable, AnnunTone.BLUE, true, w = 56)
                VSwitch(
                    listOf("OFF", "ON"), if (s.groundPowerOn) "ON" else "OFF",
                    { v ->
                        if (v == "ON" && !gpu) p.patch("GRD PWR inhibited — connect the external ground power cart first.") {}
                        else p.patch { groundPowerOn = v == "ON" }
                    },
                    null, small = true, legends = listOf("OFF", "ON"),
                )
                P5Cap("GRD PWR")
            }
        }, right = { Gauge("AC AMPS", null, if (d.generator2BusPowered) 90.0 else 0.0, 0.0, 200.0, 62.dp) })
    }
    Plate(null, Modifier.fillMaxWidth().heightIn(min = 150.dp), P5LightPlate) {
        Grid(2, gap = 4.dp) {
            item { A("TRANSFER\nBUS OFF", pw && !d.transferBus1Powered, AnnunTone.AMBER, true) }
            item { A("TRANSFER\nBUS OFF", pw && !d.transferBus2Powered, AnnunTone.AMBER, true) }
            item { A("BUS\nOFF", pw && !d.generator1BusPowered, AnnunTone.AMBER, true) }
            item { A("BUS\nOFF", pw && !d.generator2BusPowered, AnnunTone.AMBER, true) }
        }
        Box(Modifier.mt(4)) {
            GridSides(align = Alignment.CenterVertically, left = { A("GEN OFF\nBUS", d.gen1OffBus, AnnunTone.BLUE, true) }, mid = {
                A("APU GEN\nOFF BUS", d.apuGenOffBus, AnnunTone.BLUE, true, w = 48)
            }, right = { A("GEN OFF\nBUS", d.gen2OffBus, AnnunTone.BLUE, true) })
        }
        Row(Modifier.fillMaxWidth().mt(4), horizontalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterHorizontally), verticalAlignment = Alignment.CenterVertically) {
            P5Cap("BUS TRANS", color = P5Ink)
            HSwitch(listOf("OFF", "AUTO"), if (s.busTie) "AUTO" else "OFF", { v -> p.patch { busTie = v == "AUTO" } }, legends = listOf("OFF", "AUTO"))
        }
        Box(Modifier.mt(4)) {
            Grid(4, gap = 4.dp) {
                item { OffOn(s.gen1, { v -> p.patch { gen1 = v } }, "GEN 1", small = true) }
                item { OffOn(s.apuGen, { v -> p.patch { apuGen = v } }, "APU GEN", small = true) }
                item { OffOn(s.apuGen, { v -> p.patch { apuGen = v } }, "APU GEN", small = true) }
                item { OffOn(s.gen2, { v -> p.patch { gen2 = v } }, "GEN 2", small = true) }
            }
        }
    }
    Plate("APU", (if (last) Modifier.weight(1f) else Modifier).fillMaxWidth().heightIn(min = 126.dp)) {
        Grid(4, gap = 2.dp) {
            item { A("LOW OIL\nQUANTITY", false, AnnunTone.BLUE, true) }
            item { A("LOW OIL\nPRESSURE", pw && d.apuLowOil, AnnunTone.AMBER, true) }
            item { A("HIGH OIL\nTEMP", pw && s.faults.apuHighOilTemperature, AnnunTone.AMBER, true) }
            item { A("OVER\nSPEED", pw && s.faults.apuOverspeed, AnnunTone.AMBER, true) }
        }
        P5Row(Modifier.mt(4)) {
            Gauge("APU EGT", null, s.apuEgt / 80, 0.0, 10.0, 70.dp)
            Gauge("AC AMPS", null, if (s.apuGen && s.apuRpm > 90) 60.0 else 0.0, 0.0, 200.0, 70.dp)
        }
    }
}

// ───────────────────────── column C: cabin service ─────────────────────────

@Composable
fun CabinServicePanel(p: P5, modifier: Modifier = Modifier) {
    val s = p.s
    val d = p.d
    val pw = d.dcPower
    var parkOff by remember { mutableStateOf(0) }
    val wiperIdx = R.wiperIndex(s.wiperL, parkOff)
    P5Plate(modifier, pad = 6.dp, gap = 6.dp) {
        Box(Modifier.fillMaxWidth().padding(top = 12.dp), contentAlignment = Alignment.TopCenter) {
            Canvas(Modifier.size(width = 44.dp, height = 96.dp)) {
                val w = size.width
                val h = size.height
                val path = Path().apply {
                    moveTo(w * 0.18f, 0f); lineTo(w * 0.82f, 0f); lineTo(w, h); lineTo(0f, h); close()
                }
                drawPath(path, Color(0xFF16171A))
            }
        }
        SepBlock {
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Knob(p.o.cbBright, { v -> p.overhead { it.copy(cbBright = v) } }, size = 36.dp, ticks = listOf("OFF", "", "BRIGHT"))
                    P5Cap("CIRCUIT BREAKER")
                }
            }
        }
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Knob(s.ltPanelOvhd, { v -> p.patch { ltPanelOvhd = PedestalLowerRules.panelBright(v) } }, size = 36.dp, ticks = listOf("OFF", "", "BRIGHT"))
                P5Cap("PANEL")
            }
        }
        Box(Modifier.height(24.dp))
        SepBlock {
            P5Cap("EQUIP COOLING", Modifier.fillMaxWidth())
            P5Row {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    VSwitch(listOf("NORMAL", "ALTERNATE"), s.equipSupply, { v -> p.patch("EQUIP COOLING SUPPLY $v") { equipSupply = v } }, null, small = true, legends = listOf("NORM", "ALT"))
                    P5Cap("SUPPLY")
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    VSwitch(listOf("NORMAL", "ALTERNATE"), s.equipExhaust, { v -> p.patch("EQUIP COOLING EXHAUST $v") { equipExhaust = v } }, null, small = true, legends = listOf("NORM", "ALT"))
                    P5Cap("EXHAUST")
                }
            }
            P5Row(Modifier.mt(4)) {
                A("OFF / OVHT", d.equipmentCoolingOverheat || (!d.equipmentCoolingSupplyPowered && !d.equipmentCoolingExhaustPowered), AnnunTone.AMBER, true, w = 48, wide = false)
                A("SUPPLY", d.equipmentCoolingSupplyPowered, AnnunTone.BLUE, true, w = 44, wide = false)
                A("EXHAUST", d.equipmentCoolingExhaustPowered, AnnunTone.BLUE, true, w = 44, wide = false)
            }
            P5Legend(
                "E/E BAY TEMP ${R.jsRound(s.equipmentBayTempC)}°C · FLOW ${R.jsRound(d.equipmentCoolingFlow * 100)}%",
                6f, Modifier.fillMaxWidth().mt(2), align = TextAlign.Center,
            )
        }
        SepBlock {
            P5Cap("EMER EXIT LIGHTS", Modifier.fillMaxWidth())
            P5Row {
                A("NOT\nARMED", pw && s.ltEmergency == "OFF", AnnunTone.AMBER, true, w = 36, wide = false, modifier = Modifier.mt(12))
                RedGuarded(s.ltEmergency, listOf("OFF", "ARMED", "ON"), { v -> p.patch { ltEmergency = v } })
            }
        }
        SepBlock {
            P5Row {
                VSwitch(listOf("OFF", "AUTO", "ON"), s.ltNoSmoking, { v -> p.patch { ltNoSmoking = v } }, "NO SMOKING", legends = listOf("OFF", "AUTO", "ON"))
                VSwitch(listOf("OFF", "AUTO", "ON"), s.ltSeatBelt, { v -> p.patch { ltSeatBelt = v } }, "FASTEN BELTS", legends = listOf("OFF", "AUTO", "ON"))
            }
        }
        SepBlock {
            GridSides(align = Alignment.Bottom, left = {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    P5Cap("ATTEND")
                    RoundBtn(onPress = { p.patch("CABIN ATTEND CALL") { cabinCallActive = true } }, onRelease = { p.patch { cabinCallActive = false } })
                }
            }, mid = {
                Box(Modifier.size(width = 8.dp, height = 34.dp).background(Brush.verticalGradient(listOf(Color(0xFF111111), Color(0xFF2A2A2A))), RoundedCornerShape(2.dp)).border(1.dp, Color.Black, RoundedCornerShape(2.dp)))
            }, right = {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    P5Cap("GRD CALL")
                    RoundBtn(onPress = { p.patch("GROUND CREW CALL") { groundCrewCallActive = true } }, onRelease = { p.patch { groundCrewCallActive = false } })
                }
            })
            Box(Modifier.fillMaxWidth().mt(4), contentAlignment = Alignment.Center) {
                A(
                    "CALL", pw && (s.cabinCallActive || s.groundCrewCallActive), AnnunTone.BLUE, false, w = 56, wide = false,
                    onClick = { p.patch("CALL INDICATION RESET") { cabinCallActive = false; groundCrewCallActive = false } },
                )
            }
        }
        SepBlock {
            P5Cap("RAIN REPELLENT", Modifier.fillMaxWidth())
            P5Row {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    RoundBtn(onPress = { p.patch("LEFT RAIN REPELLENT SPRAY — TIMED PULSE") { rainRepelTimerL = 8.0; rainRepelPulseL = rainRepelPulseL + 1 } })
                    P5Cap("L")
                    A("SPRAY", d.rainRepellentLActive, AnnunTone.AMBER, true, wide = false)
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    RoundBtn(onPress = { p.patch("RIGHT RAIN REPELLENT SPRAY — TIMED PULSE") { rainRepelTimerR = 8.0; rainRepelPulseR = rainRepelPulseR + 1 } })
                    P5Cap("R")
                    A("SPRAY", d.rainRepellentRActive, AnnunTone.AMBER, true, wide = false)
                }
            }
        }
        SepBlock {
            P5Cap("WIPER", Modifier.fillMaxWidth())
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
                Knob(
                    wiperIdx.toDouble(),
                    { raw ->
                        val v = Math.round(raw).toInt()
                        if (v < 2) parkOff = v
                        p.patch(R.wiperNote(v)) { wiperL = R.wiperMode(v); wiperR = R.wiperMode(v) }
                    },
                    size = 40.dp, min = 0.0, max = 3.0, step = 1.0, ticks = listOf("PARK", "OFF", "LOW", "HIGH"),
                )
            }
        }
    }
}
