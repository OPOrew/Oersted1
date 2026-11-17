package com.oersted.trainer.ui.overhead

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
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.oersted.trainer.sim.OverheadP5Rules
import com.oersted.trainer.sim.SimStateDoorPositions
import com.oersted.trainer.ui.pedestal.AnnunTone
import com.oersted.trainer.ui.pedestal.Knob
import com.oersted.trainer.ui.pedestal.LegendColor
import com.oersted.trainer.ui.pedestal.Plate
import com.oersted.trainer.ui.pedestal.Selector3

/* Main row of OverheadP5.tsx, columns D and E, and the bottom strip: ice protection, hydraulics, doors, CVR, cabin altitude,
 * air conditioning, bleed, pressurization, landing and taxi lights, APU master and engine start. */

private val R = OverheadP5Rules

private fun SimStateDoorPositions.get(key: String): Boolean = when (key) {
    "fwdEntry" -> fwdEntry
    "cargo" -> cargo
    "fwdCargo" -> fwdCargo
    "fwdService" -> fwdService
    "aftEntry" -> aftEntry
    "equip" -> equip
    "aftCargo" -> aftCargo
    else -> aftService
}

private fun SimStateDoorPositions.set(key: String, v: Boolean) {
    when (key) {
        "fwdEntry" -> fwdEntry = v
        "cargo" -> cargo = v
        "fwdCargo" -> fwdCargo = v
        "fwdService" -> fwdService = v
        "aftEntry" -> aftEntry = v
        "equip" -> equip = v
        "aftCargo" -> aftCargo = v
        else -> aftService = v
    }
}

@Composable
fun ColumnScope.IcePanel(p: P5) {
    val s = p.s
    val d = p.d
    val pw = d.dcPower
    val ac = d.acPower
    val ovht = listOf(s.windowHeatOvhtLSide, s.windowHeatOvhtLFwd, s.windowHeatOvhtRFwd, s.windowHeatOvhtRSide)
    val on = listOf(s.windowHeatLSide, s.windowHeatLFwd, s.windowHeatRFwd, s.windowHeatRSide)
    val test = s.windowHeatTest
    fun wh(key: String, v: Boolean) = p.patch(R.windowHeatNote(key, v)) {
        when (key) {
            "windowHeatLSide" -> windowHeatLSide = v
            "windowHeatLFwd" -> windowHeatLFwd = v
            "windowHeatRFwd" -> windowHeatRFwd = v
            else -> windowHeatRSide = v
        }
    }
    Plate(null, Modifier.fillMaxWidth().heightIn(min = 132.dp)) {
        Grid(4, gap = 2.dp) {
            ovht.forEach { o -> item { A("OVERHEAT", R.windowOvhtLit(pw, o, test), AnnunTone.AMBER, true) } }
            on.forEachIndexed { i, o -> item { A("ON", R.windowOnLit(ac, o, ovht[i], test), AnnunTone.GREEN, false) } }
        }
        Row(Modifier.fillMaxWidth().mt(4).padding(horizontal = 4.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            P5Cap("L"); P5Cap("WINDOW HEAT"); P5Cap("R")
        }
        Grid(5, gap = 2.dp) {
            item { OffOn(s.windowHeatLSide, { wh("windowHeatLSide", it) }, null, small = true) }
            item { OffOn(s.windowHeatLFwd, { wh("windowHeatLFwd", it) }, null, small = true) }
            item {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    VSwitch(listOf("OVHT", "OFF", "PWR"), test, { v -> p.patch { windowHeatTest = v } }, null, spring = "OFF", small = true, legends = listOf("", "", ""))
                    P5Cap("PWR TEST")
                }
            }
            item { OffOn(s.windowHeatRFwd, { wh("windowHeatRFwd", it) }, null, small = true) }
            item { OffOn(s.windowHeatRSide, { wh("windowHeatRSide", it) }, null, small = true) }
        }
    }
    Plate(null, Modifier.fillMaxWidth().heightIn(min = 170.dp)) {
        GridSides(
            gap = 4.dp,
            left = {
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    A("CAPT\nPITOT", pw && !s.psPitotStaticA, AnnunTone.AMBER, true)
                    A("F/O\nPITOT", pw && !s.psPitotStaticB, AnnunTone.AMBER, true)
                    A("L ELEV\nPITOT", pw && !s.probeHeatElevL, AnnunTone.AMBER, true)
                }
            },
            mid = {
                Column(Modifier.padding(horizontal = 4.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    P5Cap("PITOT STATIC")
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        VSwitch(listOf("OFF", "ON"), if (s.psPitotStaticA) "ON" else "OFF", { v -> p.patch { psPitotStaticA = v == "ON" } }, "A", small = true, legends = listOf("OFF", "ON"))
                        VSwitch(listOf("OFF", "ON"), if (s.psPitotStaticB) "ON" else "OFF", { v -> p.patch { psPitotStaticB = v == "ON" } }, "B", small = true, legends = listOf("OFF", "ON"))
                    }
                    P5Cap("HEAT")
                }
            },
            right = {
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    A("STANDBY\nPWR OFF", pw && s.standbyPower == "OFF", AnnunTone.AMBER, true)
                    A("L ALPHA\nVANE", pw && !s.probeHeatAlphaL, AnnunTone.AMBER, true)
                    A("R ELEV\nPITOT", pw && !s.probeHeatElevR, AnnunTone.AMBER, true)
                    A("TEMP\nPROBE", pw && !s.probeHeatTemp, AnnunTone.AMBER, true)
                }
            },
        )
    }
    Plate(null, Modifier.fillMaxWidth().heightIn(min = 118.dp)) {
        Grid(4, gap = 2.dp) {
            item { A("", false, AnnunTone.AMBER, true) }
            item { A("OVERHEAT", false, AnnunTone.AMBER, true) }
            item { A("COWL\nANTI-ICE", false, AnnunTone.AMBER, true) }
            item { A("COWL\nANTI-ICE", false, AnnunTone.AMBER, true) }
            item { A("LEFT VALVE\nOPEN", pw && s.wingAntiIceL, AnnunTone.BLUE, true) }
            item { A("RIGHT VALVE\nOPEN", pw && s.wingAntiIceR, AnnunTone.BLUE, true) }
            item { A("COWL VALVE\nOPEN", pw && s.antiIce1, AnnunTone.BLUE, true) }
            item { A("COWL VALVE\nOPEN", pw && s.antiIce2, AnnunTone.BLUE, true) }
        }
        Row(Modifier.fillMaxWidth().mt(4), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                P5Cap("WING ANTI-ICE\nGRD TEST")
                OffOn(s.wingAntiIceL || s.wingAntiIceR, { v -> p.patch { wingAntiIceL = v; wingAntiIceR = v } }, null, small = true)
            }
            Column(Modifier.weight(2f), horizontalAlignment = Alignment.CenterHorizontally) {
                P5Cap("ENG ANTI ICE")
                Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    OffOn(s.antiIce1, { v -> p.patch { antiIce1 = v } }, "1", small = true)
                    OffOn(s.antiIce2, { v -> p.patch { antiIce2 = v } }, "2", small = true)
                }
            }
        }
    }
}

private val DoorEntries = listOf(
    "FWD ENTRY" to "fwdEntry", "CARGO" to "cargo", "FWD CARGO" to "fwdCargo", "FWD SERVICE" to "fwdService",
    "AFT ENTRY" to "aftEntry", "EQUIP" to "equip", "AFT CARGO" to "aftCargo", "AFT SERVICE" to "aftService",
)

@Composable
fun ColumnScope.HydDoorsCvr(p: P5, last: Boolean) {
    val s = p.s
    val d = p.d
    val pw = d.dcPower
    var interconnect by remember { mutableStateOf(false) }
    Plate(null, Modifier.fillMaxWidth().heightIn(min = 112.dp)) {
        Box(Modifier.padding(horizontal = 32.dp)) {
            Grid(2, gap = 2.dp) {
                item { A("OVERHEAT", false, AnnunTone.AMBER, true) }
                item { A("OVERHEAT", false, AnnunTone.AMBER, true) }
            }
        }
        Box(Modifier.mt(2)) {
            Grid(4, gap = 2.dp) {
                item { A("LOW\nPRESSURE", d.hydALow, AnnunTone.AMBER, true) }
                item { A("LOW\nPRESSURE", d.hydALow, AnnunTone.AMBER, true) }
                item { A("LOW\nPRESSURE", d.hydBPump1Low, AnnunTone.AMBER, true) }
                item { A("LOW\nPRESSURE", d.hydBPump2Low, AnnunTone.AMBER, true) }
            }
        }
        Row(
            Modifier.fillMaxWidth().mt(4).background(P5LightPlate, RoundedCornerShape(2.dp)).padding(4.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally), verticalAlignment = Alignment.CenterVertically,
        ) {
            P5Cap("GRD INTERCONNECT", color = P5Ink)
            HSwitch(listOf("CLOSE", "OPEN"), if (interconnect) "OPEN" else "CLOSE", { interconnect = it == "OPEN" }, legends = listOf("CLOSE", "OPEN"))
        }
        Column(Modifier.fillMaxWidth().mt(4).background(P5LightPlate, RoundedCornerShape(2.dp)).padding(4.dp)) {
            Grid(4, gap = 2.dp) {
                item { OnOff(s.engHyd1, { v -> p.patch { engHyd1 = v } }, null, small = true, legends = listOf("", "")) }
                item { OnOff(s.elecHyd2, { v -> p.patch { elecHyd2 = v } }, null, small = true, legends = listOf("", "")) }
                item { OnOff(s.elecHyd1, { v -> p.patch { elecHyd1 = v } }, null, small = true, legends = listOf("", "")) }
                item { OnOff(s.engHyd2, { v -> p.patch { engHyd2 = v } }, null, small = true, legends = listOf("", "")) }
            }
            Box(Modifier.mt(2)) {
                Grid(4, gap = 0.dp) {
                    listOf("ENG 1", "ELEC 2", "ELEC 1", "ENG 2").forEach { t -> item { P5Cap(t, color = P5Ink) } }
                }
            }
            GridSides(gap = 0.dp, left = { P5Cap("A", size = 7f, color = P5Ink) }, mid = { P5Cap("HYD PUMPS", size = 7f, color = P5Ink) }, right = { P5Cap("B", size = 7f, color = P5Ink) })
        }
    }
    Plate(null, Modifier.fillMaxWidth().heightIn(min = 56.dp)) {
        Box(Modifier.fillMaxWidth().padding(bottom = 4.dp), contentAlignment = Alignment.Center) {
            A("DOOR WARN", d.doorWarning, AnnunTone.AMBER, true, w = 64, wide = false)
        }
        Grid(4, gap = 2.dp) {
            DoorEntries.forEach { (label, key) ->
                item {
                    val open = s.doorPositions.get(key)
                    A(
                        label, pw && open, AnnunTone.AMBER, true,
                        onClick = { p.patch(R.doorNote(label, open)) { doorPositions = doorPositions.copy().also { it.set(key, !open) } } },
                    )
                }
            }
        }
    }
    Plate(null, Modifier.fillMaxWidth().heightIn(min = 96.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceAround, verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(34.dp).background(Brush.radialGradient(listOf(Color(0xFF3A3D41), Color(0xFF17181A))), CircleShape).border(2.dp, P5Ink, CircleShape))
            Canvas(Modifier.size(width = 34.dp, height = 22.dp)) {
                val k = size.width / 40f
                val path = Path().apply {
                    moveTo(2 * k, 22 * k)
                    arcTo(androidx.compose.ui.geometry.Rect(2 * k, 4 * k, 38 * k, 40 * k), 180f, 180f, false)
                    close()
                }
                drawPath(path, Color(0xFFD9D6C9))
                drawPath(path, Color(0xFF222222), style = Stroke(width = k))
                drawLine(Color(0xFF222222), Offset(20 * k, 22 * k), Offset(12 * k, 9 * k), strokeWidth = 1.2f * k)
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Dot(d.cvrPowered && s.cvrTest, Color(0xFF42D36E), Color(0xFF2A2E2C))
                P5Cap("TEST")
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Dot(s.cvrErase, Color(0xFFFF3B30), Color(0xFF6B1A16))
                P5Cap("ERASE")
            }
        }
        Row(Modifier.fillMaxWidth().mt(4), horizontalArrangement = Arrangement.SpaceAround, verticalAlignment = Alignment.CenterVertically) {
            RoundBtn("TEST", onPress = { p.patch("CVR TEST") { cvrTest = true } }, onRelease = { p.patch { cvrTest = false } })
            RoundBtn(
                "ERASE",
                onPress = {
                    if (!R.cvrEraseAllowed(s.wow, d.dcPower, s.faults.cvrFailure)) p.patch(R.CVR_ERASE_INHIBITED) {}
                    else p.patch("CVR ERASE HELD") { cvrErase = true; cvrMemoryErased = false }
                },
                onRelease = { p.patch { cvrErase = false } },
            )
            RoundBtn("HEADPHONE")
        }
        P5Cap("COCKPIT VOICE RECORDER", Modifier.fillMaxWidth().mt(2))
    }
    Plate(null, (if (last) Modifier.weight(1f) else Modifier).fillMaxWidth().heightIn(min = 196.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Gauge("DIFF PRESS PSI", "CABIN ALT ×1000 FT", s.cabinDiff, 0.0, 10.0, 92.dp)
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.background(Color.Black, RoundedCornerShape(2.dp)).border(1.dp, Color.Black, RoundedCornerShape(2.dp)).padding(horizontal = 4.dp, vertical = 2.dp)) {
                        P5Legend("PRESS DIFF\nLIMIT: TAKE-\nOFF & LDG\n.125 PSI", 5f, align = TextAlign.Center)
                    }
                    Gauge("CABIN CLIMB", "1000 FT/MIN", 0.0, -4.0, 4.0, 56.dp, 8)
                }
            }
            Column(Modifier.padding(horizontal = 4.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                P5Cap("ALT HORN\nCUTOUT")
                RoundBtn(onPress = { p.overhead { it.copy(hornCutout = !it.hornCutout) } })
            }
        }
    }
}

// ───────────────────────── column E ─────────────────────────

@Composable
private fun CabinTemp(p: P5, left: Boolean) {
    val s = p.s
    val d = p.d
    val pw = d.dcPower
    val mode = R.tempMode(if (left) s.tempModeL else s.tempModeR)
    val mIdx = R.tempModeIndex(mode)
    val sel = R.tempSelectOrDefault(if (left) s.tempSelectL else s.tempSelectR)
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Knob(sel, { v -> p.patch { if (left) tempSelectL = v else tempSelectR = v } }, size = 30.dp, min = 65.0, max = 85.0, step = 1.0, ticks = listOf("COLD", "HOT"), compact = true)
        A("DUCT\nOVERHEAT", pw && (if (left) d.packLDuctOverheat else d.packRDuctOverheat), AnnunTone.AMBER, true, w = 52, wide = false)
        Knob(
            mIdx.toDouble(),
            { v -> p.patch { val m = R.TEMP_MODES[Math.round(v).toInt().coerceIn(0, 2)]; if (left) tempModeL = m else tempModeR = m } },
            size = 30.dp, min = 0.0, max = 2.0, step = 1.0, ticks = listOf("COOL", "AUTO", "WARM"), compact = true,
        )
        P5Cap(R.tempModeLabel(mode))
    }
}

@Composable
fun AirCondPanel(p: P5, modifier: Modifier = Modifier) {
    val s = p.s
    val pw = p.d.dcPower
    var airTemp by remember { mutableStateOf(0) } // 0 supply duct, 1 pass cabin
    val sel = R.tempSelectOrDefault(if (airTemp == 0) s.tempSelectL else s.tempSelectR)
    val packOn = s.packL || s.packR
    val ductC = R.ductTempC(packOn, sel)
    Plate(null, modifier.fillMaxWidth().heightIn(min = 250.dp)) {
        Grid(3, gap = 0.dp) {
            item { P5Cap("CONT CABIN") }
            item { P5Cap("AIR TEMP") }
            item { P5Cap("PASS CABIN") }
        }
        GridSides(
            gap = 4.dp,
            left = {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    MixDial(s.mixCabin, onChange = { v -> p.patch("LEFT AIR MIX VALVE MANUAL POSITION") { mixCabin = v; tempModeL = "MANUAL" } }, disabled = s.faults.mixValveJamL)
                    CabinTemp(p, true)
                }
            },
            mid = {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Knob(airTemp.toDouble(), { airTemp = Math.round(it).toInt() }, size = 26.dp, min = 0.0, max = 1.0, step = 1.0, ticks = listOf("SUPPLY\nDUCT", "PASS\nCABIN"), compact = true)
                    Gauge("DUCT TEMP", null, if (pw) ductC else -20.0, -20.0, 100.0, 64.dp)
                }
            },
            right = {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    MixDial(s.mixPass, onChange = { v -> p.patch("RIGHT AIR MIX VALVE MANUAL POSITION") { mixPass = v; tempModeR = "MANUAL" } }, disabled = s.faults.mixValveJamR)
                    CabinTemp(p, false)
                }
            },
        )
    }
}

@Composable
private fun PackSwitch(p: P5, left: Boolean) {
    val current = if (left) p.s.packL else p.s.packR
    // This simulator state stores pack selection as a boolean: ON maps to AUTO.
    VSwitch(
        listOf("OFF", "AUTO"), if (current) "AUTO" else "OFF",
        { v ->
            p.patch {
                if (left) { packL = v != "OFF"; packTripL = if (v == "OFF") false else packTripL }
                else { packR = v != "OFF"; packTripR = if (v == "OFF") false else packTripR }
            }
        },
        if (left) "L PACK" else "R PACK", small = true, legends = listOf("OFF", "AUTO"),
    )
}

@Composable
fun ColumnScope.BleedPanel(p: P5) {
    val s = p.s
    val d = p.d
    val pw = d.dcPower
    var testOvht by remember { mutableStateOf(false) }
    Plate(null, Modifier.fillMaxWidth().heightIn(min = 40.dp)) {
        Grid(3, gap = 4.dp) {
            item { A("DUAL\nBLEED", pw && d.dualBleed, AnnunTone.AMBER, true) }
            item { A("", false, AnnunTone.BLUE, true) }
            item { A("", false, AnnunTone.BLUE, true) }
        }
    }
    Plate(null, Modifier.fillMaxWidth().heightIn(min = 300.dp), P5LightPlate) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.Top) {
            Box(Modifier.weight(1f), contentAlignment = Alignment.TopCenter) { Gauge("DUCT PRESS", null, d.ductPsi, 0.0, 80.0, 86.dp) }
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                P5Cap("GASPER FAN", color = P5Ink)
                OffOn(s.recirc, { v -> p.patch { recirc = v } }, null, small = true, legends = listOf("OFF", "ON"))
                A("OVHT", pw && testOvht, AnnunTone.AMBER, true, w = 36, wide = false)
                RoundBtn("TEST", onPress = { testOvht = true }, onRelease = { testOvht = false })
            }
        }
        Row(Modifier.fillMaxWidth().mt(4), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.Top) {
            PackSwitch(p, true)
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                P5Cap("ISOLATION VALVE", color = P5Ink)
                VSwitch(listOf("CLOSE", "AUTO", "OPEN"), s.isolation, { v -> p.patch { isolation = v } }, null, small = true, legends = listOf("CLOSE", "AUTO", "OPEN"))
                RoundBtn("TRIP RESET", onPress = { p.patch("TRIP RESET — pack and bleed trips reset.") { packTripL = false; packTripR = false; bleedTrip1 = false; bleedTrip2 = false } })
            }
            PackSwitch(p, false)
        }
        Row(Modifier.fillMaxWidth().mt(4), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                A("PACK\nTRIP OFF", pw && s.packTripL, AnnunTone.AMBER, true)
                A("WING-BODY\nOVERHEAT", pw && d.packLDuctOverheat, AnnunTone.AMBER, true)
                A("BLEED\nTRIP OFF", pw && s.bleedTrip1, AnnunTone.AMBER, true)
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                A("PACK\nTRIP OFF", pw && s.packTripR, AnnunTone.AMBER, true)
                A("WING-BODY\nOVERHEAT", pw && d.packRDuctOverheat, AnnunTone.AMBER, true)
                A("BLEED\nTRIP OFF", pw && s.bleedTrip2, AnnunTone.AMBER, true)
            }
        }
        Box(Modifier.mt(4)) {
            Grid(3, gap = 0.dp) {
                item { OffOn(s.bleed1, { v -> p.patch { bleed1 = v; bleedTrip1 = if (v) bleedTrip1 else false } }, "1", small = true) }
                item { OffOn(s.apuBleed, { v -> p.patch { apuBleed = v } }, "APU", small = true) }
                item { OffOn(s.bleed2, { v -> p.patch { bleed2 = v; bleedTrip2 = if (v) bleedTrip2 else false } }, "2", small = true) }
            }
        }
        P5Cap("BLEED", Modifier.fillMaxWidth(), color = P5Ink)
    }
}

@Composable
fun ColumnScope.PressPanel(p: P5, last: Boolean) {
    val s = p.s
    val pw = p.d.dcPower
    var fltAlt by remember { mutableStateOf(39000.0) }
    var landAlt by remember { mutableStateOf(200.0) }
    var standbyCabAlt by remember { mutableStateOf(200.0) }
    var standbyCabRate by remember { mutableStateOf(0.0) }
    var manValve by remember { mutableStateOf("CLOSE") }
    var fgt by remember { mutableStateOf("F") }
    val modeLabel = R.pressModeLabel(s.pressMode)
    Plate(null, Modifier.fillMaxWidth().heightIn(min = 290.dp), P5LightPlate) {
        Grid(4, gap = 2.dp) {
            item { A("AUTO\nFAIL", false, AnnunTone.AMBER, true) }
            item { A("OFF SCHED\nDESCENT", false, AnnunTone.AMBER, true) }
            item { A("", false, AnnunTone.AMBER, true) }
            item { A("MANUAL", pw && R.pressManual(s.pressMode), AnnunTone.GREEN, true) }
        }
        Box(Modifier.mt(4)) {
            Grid(3, gap = 4.dp) {
                item {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        P5Cap("AUTO", color = P5Ink)
                        Readout2(R.pad5(fltAlt.toLong()), pw)
                        Knob(fltAlt, { fltAlt = it }, size = 28.dp, min = 0.0, max = 41000.0, step = 500.0)
                        P5Cap("FLT ALT", color = P5Ink)
                        Readout2(R.pad5(landAlt.toLong()), pw)
                        Knob(landAlt, { landAlt = it }, size = 28.dp, min = -1000.0, max = 14000.0, step = 100.0)
                        P5Cap("LAND ALT", color = P5Ink)
                    }
                }
                item {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        P5Cap("STANDBY", color = P5Ink)
                        Knob(standbyCabRate, { standbyCabRate = it }, size = 34.dp, min = -1.0, max = 1.0, step = 0.1, ticks = listOf("DECR", "INCR"))
                        Readout2(R.cabinRateText(standbyCabRate), pw)
                        P5Cap("CABIN RATE", color = P5Ink)
                        Readout2(R.pad5(R.jsRound(standbyCabAlt)), pw)
                        Knob(standbyCabAlt, { standbyCabAlt = it }, size = 28.dp, min = 0.0, max = 50000.0, step = 100.0)
                        P5Cap("CAB ALT", color = P5Ink)
                    }
                }
                item {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        P5Cap("MANUAL", color = P5Ink)
                        Gauge("OUTFLOW VALVE", null, R.outflowValue(manValve == "OPEN"), 0.0, 10.0, 56.dp)
                        VSwitch(listOf("OPEN", "CLOSE"), manValve, { manValve = it }, null, small = true, legends = listOf("OPEN", "CLOSE"))
                    }
                }
            }
        }
        Box(Modifier.fillMaxWidth().mt(4).height(1.dp).background(Color(0xFF2C2F33).copy(alpha = 0.6f)))
        Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            VSwitch(listOf("F", "GRD", "T"), fgt, { fgt = it }, null, small = true, legends = listOf("F", "GRD", "T"))
            Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                Selector3(listOf("AUTO", "STBY", "MAN AC", "MAN DC"), modeLabel, { v -> p.patch { pressMode = R.pressModeFromLabel(v) } }, label = modeLabel)
            }
        }
    }
    Plate(null, (if (last) Modifier.weight(1f) else Modifier).fillMaxWidth().heightIn(min = 48.dp)) {
        Row(
            Modifier.fillMaxWidth().background(Color.Black, RoundedCornerShape(2.dp)).border(1.dp, Color.Black, RoundedCornerShape(2.dp)).padding(4.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                P5Legend("CAB ALT", 6f)
                P5Legend("FLT ALT", 6f)
            }
            val cabPct = R.cabinBarPercent(pw, s.cabinDiff)
            val fltPct = R.fltAltBarPercent(pw, fltAlt)
            Canvas(Modifier.weight(1f).height(22.dp)) {
                val cream = LegendColor
                val w = size.width
                val h = size.height
                drawLine(cream, Offset(0f, 0f), Offset(0f, h), strokeWidth = 1.dp.toPx())
                for (i in 0..4) drawLine(cream.copy(alpha = 0.7f), Offset(w * i * 0.25f, 0f), Offset(w * i * 0.25f, h), strokeWidth = 1.dp.toPx())
                drawRect(cream, Offset(0f, 2.dp.toPx()), androidx.compose.ui.geometry.Size((w * (cabPct / 100.0)).toFloat(), 6.dp.toPx()))
                drawRect(cream, Offset(0f, 13.dp.toPx()), androidx.compose.ui.geometry.Size((w * (fltPct / 100.0)).toFloat(), 6.dp.toPx()))
            }
        }
    }
}

// ───────────────────────── bottom strip ─────────────────────────

@Composable
private fun StartKnob(p: P5, n: Int) {
    val v = if (n == 1) p.s.start1 else p.s.start2
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Knob(
            R.startIndex(v).toDouble(),
            { i -> p.patch(R.startNote(n, i)) { if (n == 1) start1 = R.startValue(i) else start2 = R.startValue(i) } },
            size = 46.dp, min = 0.0, max = 4.0, step = 1.0, ticks = R.START_KNOB,
        )
        P5Cap("$n")
    }
}

/** The real ENGINE START knobs of the P5 bottom strip (same Knob, same patch + log note), on their own plate, for the Training Console. */
@Composable
fun P5EngineStartKnobs(p: P5, modifier: Modifier = Modifier) {
    P5Plate(modifier, pad = 8.dp) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterHorizontally), verticalAlignment = Alignment.Bottom) {
            P5Cap("ENGINE START", Modifier.align(Alignment.Top))
            StartKnob(p, 1)
            StartKnob(p, 2)
        }
    }
}

@Composable
fun BottomStrip(p: P5, modifier: Modifier = Modifier) {
    val s = p.s
    var strobe by remember { mutableStateOf(s.ltPosition == "STROBE_STEADY") }
    var nav by remember { mutableStateOf(s.ltPosition != "OFF") }
    fun setLights(st: Boolean, nv: Boolean) {
        strobe = st
        nav = nv
        p.patch { ltPosition = R.positionLights(st, nv) }
    }
    P5Plate(modifier, pad = 8.dp) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.Top) {
                IndexLock()
                Column {
                    Row(Modifier.padding(horizontal = 16.dp)) { P5Cap("LANDING") }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Top) {
                        Box(Modifier.height(54.dp).width(8.dp), contentAlignment = Alignment.Center) {
                            P5Legend("EXTEND", 5f, Modifier.wrapContentSizeUnbounded().rotate(90f))
                        }
                        VSwitch(listOf("RETRACT", "EXT", "ON"), s.ltRetL, { v -> p.patch { ltRetL = v } }, "OUTBD L", small = true, legends = listOf("RETRACT", "", "ON"))
                        VSwitch(listOf("RETRACT", "EXT", "ON"), s.ltRetR, { v -> p.patch { ltRetR = v } }, "OUTBD R", small = true, legends = listOf("", "", "ON"))
                        OffOn(s.ltFixedL, { v -> p.patch { ltFixedL = v } }, "INBD L", small = true, legends = listOf("OFF", "ON"))
                        OffOn(s.ltFixedR, { v -> p.patch { ltFixedR = v } }, "INBD R", small = true, legends = listOf("", "ON"))
                    }
                }
            }
            Column {
                P5Cap("TAXI · RUNWAY TURNOFF")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Top) {
                    OffOn(s.ltTaxi, { v -> p.patch { ltTaxi = v } }, "TAXI", small = true)
                    OffOn(s.ltTurnoffL, { v -> p.patch { ltTurnoffL = v } }, "L", small = true)
                    OffOn(s.ltTurnoffR, { v -> p.patch { ltTurnoffR = v } }, "R", small = true)
                }
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                P5Cap("APU")
                VSwitch(listOf("OFF", "ON", "START"), s.apuMaster, { v -> p.patch("APU MASTER → $v") { apuMaster = v } }, null, small = true, legends = listOf("OFF", "ON", "START"))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Bottom) {
                P5Cap("ENGINE START", Modifier.align(Alignment.Top))
                StartKnob(p, 1)
                StartKnob(p, 2)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.Top) {
                OffOn(strobe, { setLights(it, nav) }, "STROBE", small = true)
                OffOn(nav, { setLights(strobe, it) }, "NAVIGATION", small = true)
                OffOn(s.ltAntiCol, { v -> p.patch { ltAntiCol = v } }, "ANTI COLL", small = true)
                OffOn(s.ltWing, { v -> p.patch { ltWing = v } }, "WING", small = true)
                OffOn(s.ltWheelWell, { v -> p.patch { ltWheelWell = v } }, "WHEEL WELL", small = true)
                IndexLock()
            }
        }
    }
}

private fun Modifier.wrapContentSizeUnbounded(): Modifier = this.then(Modifier.wrapContentSize(Alignment.Center, unbounded = true))
