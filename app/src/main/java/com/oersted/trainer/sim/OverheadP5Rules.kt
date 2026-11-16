package com.oersted.trainer.sim

import kotlin.math.PI
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/**
 * Pure rules of components/panel/OverheadP5.tsx (the interactive P5 forward overhead): switch geometry, gauge dial
 * geometry, IRS display text, the meter-panel source selection, window of cabin-pressure readouts and the small
 * state mappings (position lights, start knobs, wipers, press mode labels). The Compose drawing is in ui/overhead/.
 */
object OverheadP5Rules {
    /** web DESIGN_W = columns 972 + gaps 16 + padding 16 + border 4 */
    const val DESIGN_W = 1008

    /** web COLS = grid-cols-[216px_224px_98px_217px_217px] */
    val COLS = intArrayOf(216, 224, 98, 217, 217)

    fun clamp(v: Double, lo: Double, hi: Double): Double = max(lo, min(hi, v))
    fun clampInt(v: Int, lo: Int, hi: Int): Int = max(lo, min(hi, v))

    /** JS Math.round: floor(x + 0.5) (ties toward +infinity). */
    fun jsRound(x: Double): Long = floor(x + 0.5).toLong()

    // ───────────────────────── VSwitch / HSwitch ─────────────────────────

    /** web `Math.max(0, options.indexOf(value))` */
    fun switchIndex(options: List<String>, value: String): Int = max(0, options.indexOf(value))

    /** web VSwitch track height: small 34, three or more positions 54, else 42 */
    fun vSwitchHeight(n: Int, small: Boolean): Int = if (small) 34 else if (n > 2) 54 else 42

    /** web HSwitch track width: three or more positions 66, else 46 */
    fun hSwitchWidth(n: Int): Int = if (n > 2) 66 else 46

    /** web `pick`: position chosen by where along the track the pointer is, `floor(frac * n)` clamped */
    fun switchPick(frac: Double, n: Int): Int = clampInt(floor(frac * n).toInt(), 0, n - 1)

    /** web handle size and offset along a VSwitch track: height h/n - 3, top 2 + idx * ((h - 4) / n) */
    fun vHandleHeight(h: Int, n: Int): Double = h.toDouble() / n - 3
    fun vHandleTop(h: Int, n: Int, idx: Int): Double = 2 + idx * ((h - 4).toDouble() / n)
    fun hHandleWidth(w: Int, n: Int): Double = w.toDouble() / n - 3
    fun hHandleLeft(w: Int, n: Int, idx: Int): Double = 2 + idx * ((w - 4).toDouble() / n)

    // ───────────────────────── Gauge / MixDial ─────────────────────────

    class GaugePreset(val nums: List<String>, val unit: String?)

    val GAUGE_PRESETS: Map<String, GaugePreset> = mapOf(
        "EGT °C" to GaugePreset(listOf("0", "200", "400", "600", "800"), "EGT"),
        "APU EGT" to GaugePreset(listOf("0", "2", "4", "6", "8", "10"), "EGT"),
        "RPM %" to GaugePreset(listOf("0", "20", "40", "60", "80", "100", "110"), "RPM"),
        "AC AMPS" to GaugePreset(listOf("0", "50", "100", "150", "200"), "AC AMPS"),
        "AC VOLTS" to GaugePreset(listOf("100", "110", "120", "130"), "AC VOLTS"),
        "FREQ" to GaugePreset(listOf("380", "400", "420"), "FREQ"),
        "DC AMPS" to GaugePreset(listOf("-50", "0", "50"), "DC AMPS"),
        "DC VOLTS" to GaugePreset(listOf("0", "10", "20", "30", "40"), "DC VOLTS"),
        "DRIVE TEMP" to GaugePreset(listOf("40", "80", "120", "160"), "°C"),
        "FUEL TEMP °C" to GaugePreset(listOf("-40", "-20", "0", "20", "40"), "FUEL TEMP"),
        "DUCT PRESS" to GaugePreset(listOf("0", "20", "40", "60", "80"), "DUCT PRESS"),
        "DUCT TEMP" to GaugePreset(listOf("-20", "0", "20", "40", "60", "80", "100"), "TEMP °C"),
        "CAB ALT / ΔP" to GaugePreset(listOf("0", "2", "4", "6", "8", "10"), "ΔP PSI"),
        "CAB CLIMB" to GaugePreset(listOf("-2", "-1", "0", "1", "2"), "CLIMB"),
        "OXY PRESS PSI ×100" to GaugePreset(listOf("0", "5", "10", "15", "20"), "PSI × 100"),
        "OUTFLOW VALVE" to GaugePreset(listOf("CLOSE", "", "OPEN"), "VALVE"),
    )

    /** web `title`: label with whitespace runs collapsed and trimmed */
    fun gaugeTitle(label: String?): String = (label ?: "").replace(Regex("\\s+"), " ").trim()

    /** web `clamp((value - min) / (max - min || 1), 0, 1)` */
    fun gaugeFraction(value: Double, min: Double, max: Double): Double {
        val span = max - min
        return clamp((value - min) / (if (span == 0.0) 1.0 else span), 0.0, 1.0)
    }

    /** web needle angle `-118 + f * 236` degrees */
    fun gaugeAngle(f: Double): Double = -118 + f * 236

    /** web `pt(deg, r, cy = 54)` on the 100 x 100 face: (50 + sin * r, cy - cos * r) */
    fun gaugePoint(deg: Double, r: Double, cy: Double = 54.0): Pair<Double, Double> {
        val rad = deg * PI / 180.0
        return Pair(50 + sin(rad) * r, cy - cos(rad) * r)
    }

    /** web scale numbers: the preset for the label, else `ticks + 1` evenly spaced values rounded like Math.round. */
    fun gaugeNums(label: String?, min: Double, max: Double, ticks: Int): List<String> {
        val preset = GAUGE_PRESETS[gaugeTitle(label)]
        if (preset != null) return preset.nums
        return (0..ticks).map { i -> jsRound(min + (i.toDouble() / ticks) * (max - min)).let { if (it == 0L) "0" else it.toString() } }
    }

    /** web unit text: the preset's unit, else the `sub` prop (null prints nothing) */
    fun gaugeUnit(label: String?, sub: String?): String = GAUGE_PRESETS[gaugeTitle(label)]?.unit ?: sub ?: ""

    /** web sub text under the unit: only when different from the unit */
    fun gaugeSubLine(label: String?, sub: String?): String {
        val unit = GAUGE_PRESETS[gaugeTitle(label)]?.unit ?: sub
        return if (sub != null && sub != unit) sub else ""
    }

    /** web tick angle `-118 + (i / max(1, n - 1)) * 236` */
    fun gaugeTickAngle(i: Int, n: Int): Double = -118 + (i.toDouble() / max(1, n - 1)) * 236

    /** web tick value `min + (i / scaleTicks) * (max - min)` (for the red zone) */
    fun gaugeTickValue(i: Int, n: Int, min: Double, max: Double): Double = min + (i.toDouble() / max(1, n - 1)) * (max - min)

    /** web MixDial needle angle `-120 + clamp(value, 0, 1) * 240` */
    fun mixDialAngle(value: Double): Double = -120 + clamp(value, 0.0, 1.0) * 240

    // ───────────────────────── IRS ─────────────────────────

    val DSPL_TICKS = listOf("TEST", "TK/GS", "PPOS", "WIND", "HDG/STS")
    val IRS_MODES = listOf("OFF", "ALIGN", "NAV", "ATT")
    const val IRS_LAT = "N 5109.32"
    const val IRS_LON = "W 00315.17"

    /** web key() reducer: CLR empties the entry, ENT keeps it, a digit or letter is appended keeping the last 8 characters. */
    fun irsKey(entry: String, k: String): String = when (k) {
        "CLR" -> ""
        "ENT" -> entry
        else -> (entry + k).takeLast(8)
    }

    /** web IRS DISPLAY left cell */
    fun irsLeft(powered: Boolean, entry: String, sel: String): String =
        if (!powered) "" else if (entry.isNotEmpty() && sel != "TEST") entry else if (sel == "TEST") "888888" else IRS_LAT

    /** web IRS DISPLAY right cell */
    fun irsRight(powered: Boolean, sel: String): String = if (!powered) "" else when (sel) {
        "TEST" -> "888888"
        "PPOS" -> IRS_LON
        "WIND" -> "270/ 35"
        "TK/GS" -> "090/ 000"
        else -> "OK"
    }

    /** web `aligning = pw && cbClosed && mode === "ALIGN" && prog < 1` */
    fun irsAligning(powered: Boolean, cbClosed: Boolean, mode: String, prog: Double): Boolean =
        powered && cbClosed && mode == "ALIGN" && prog < 1

    /** web align percentage text `Math.round(prog * 100)` */
    fun irsAlignPercent(prog: Double): Long = jsRound(prog * 100)

    // ───────────────────────── LE devices ─────────────────────────

    /** web `ext = pw && (leExtended || test)` */
    fun leExt(powered: Boolean, extended: Boolean, test: Boolean): Boolean = powered && (extended || test)

    /** web `tr = pw && !test && leTransit` */
    fun leTransit(powered: Boolean, transit: Boolean, test: Boolean): Boolean = powered && !test && transit

    // ───────────────────────── Meter / standby ─────────────────────────

    val TR_TICKS = listOf("STBY PWR", "BAT BUS", "BAT", "TR1", "TR2", "TR3", "TEST")
    val AC_TICKS = listOf("STBY PWR", "GRD PWR", "GEN1", "APU GEN", "GEN2", "TEST")

    /** web dcSrc of MeterPanel; [trOn] is TR1..TR3 powered. */
    fun meterDcSource(tr: Int, standbyPower: String, battery: Boolean, trOn: List<Boolean>): Boolean =
        if (tr == 0) standbyPower != "OFF" else if (tr == 1 || tr == 2) battery else if (tr == 6) true else trOn.getOrNull(tr - 3) == true

    /** web acSrc of MeterPanel */
    fun meterAcSource(
        ac: Int, standbyPower: String, powered: Boolean, groundPowerOn: Boolean, externalPowerConnected: Boolean,
        gen1BusPowered: Boolean, gen2BusPowered: Boolean, apuGen: Boolean, apuRpm: Double,
    ): Boolean = when (ac) {
        0 -> standbyPower != "OFF" && powered
        1 -> groundPowerOn && externalPowerConnected
        2 -> gen1BusPowered
        3 -> apuGen && apuRpm > 90
        4 -> gen2BusPowered
        else -> true
    }

    fun meterDcAmps(powered: Boolean, dcSrc: Boolean, tr: Int): Double = if (powered && dcSrc && tr >= 3) 18.0 else 0.0
    fun meterDcVolts(dcSrc: Boolean, tr: Int): Double = if (dcSrc) (if (tr >= 3) 28.0 else 24.0) else 0.0
    fun meterFreq(acSrc: Boolean): Double = if (acSrc) 400.0 else 380.0
    fun meterAcVolts(acSrc: Boolean): Double = if (acSrc) 115.0 else 100.0

    /** web `shown`: RISE scale = 40 + max(0, tempC - 85) * 4, IN = the temperature itself */
    fun genDriveShown(tempC: Double, rise: Boolean): Double = if (rise) 40 + max(0.0, tempC - 85) * 4 else tempC

    fun standbyPowerPosition(standbyPower: String): String = if (standbyPower == "BAT") "BAT" else if (standbyPower == "AUTO") "AUTO" else "OFF"

    /** web DriveDisc: reset is blocked in the air or with the engine running. Returns the log note, or null if the toggle is allowed. */
    fun driveResetBlockedNote(n: Int, wasOn: Boolean, wow: Boolean, n2: Double): String? {
        val v = !wasOn
        if (!v && !MaintenanceInterlocks.canResetGeneratorDrive(wow, n2)) {
            val reason = if (!wow) "WEIGHT OFF WHEELS" else "ENGINE N2 ${jsRound(n2)}% — NOT SHUT DOWN"
            return "GEN $n DRIVE RESET INHIBITED — $reason; RESET ONLY ON GROUND AFTER ENGINE SHUTDOWN (AMM 24-11)."
        }
        return null
    }

    fun driveToggleNote(n: Int, nowOn: Boolean): String =
        if (nowOn) "GEN $n DRIVE DISCONNECT SOLENOID ENERGIZED" else "GEN $n DRIVE RESET ON GROUND AFTER ENGINE SHUTDOWN"

    // ───────────────────────── Flight controls ─────────────────────────

    /** web FltCtrl pos(): ON, else STBY RUD when the standby hydraulic is ON, else OFF */
    fun fltCtrlPosition(on: Boolean, stbyHyd: String): String = if (on) "ON" else if (stbyHyd == "ON") "STBY RUD" else "OFF"

    fun stbyLowQuantity(powered: Boolean, hydSQty: Double): Boolean = powered && hydSQty < 20
    fun stbyLowPressure(powered: Boolean, stbyHyd: String, stbyOn: Boolean): Boolean = powered && stbyHyd != "OFF" && !stbyOn

    // ───────────────────────── Fuel ─────────────────────────

    /** web fuel heat counter `Math.ceil(Math.max(0, 60 - elapsed))` */
    fun fuelHeatSeconds(elapsedSec: Double): Long = ceil(max(0.0, 60 - elapsedSec)).toLong()

    // ───────────────────────── Cabin service / air conditioning ─────────────────────────

    val TEMP_MODES = listOf("MANUAL_COOL", "AUTO", "MANUAL_WARM")

    /** web CabinTemp: a stored MANUAL means MANUAL_COOL, a missing mode means AUTO */
    fun tempMode(raw: String?): String {
        val r = raw ?: "AUTO"
        return if (r == "MANUAL") "MANUAL_COOL" else r
    }

    fun tempModeIndex(mode: String): Int = max(0, TEMP_MODES.indexOf(mode))
    fun tempModeLabel(mode: String): String = if (mode == "AUTO") "AUTO" else "MANUAL"
    fun tempSelectOrDefault(v: Double?): Double = v ?: 75.0

    /** web AirCondPanel duct temperature in C: pack on -> (sel - 32) / 1.8, else 15 */
    fun ductTempC(packOn: Boolean, selF: Double): Double = if (packOn) (selF - 32) / 1.8 else 15.0

    /** web wiper knob index: LOW 2, HIGH 3, else the remembered PARK/OFF position */
    fun wiperIndex(wiperL: String, parkOff: Int): Int = if (wiperL == "LOW") 2 else if (wiperL == "HIGH") 3 else parkOff

    /** web wiper knob result for a detent index: (wiper mode, note) */
    fun wiperMode(v: Int): String = if (v < 2) "PARK" else if (v == 2) "LOW" else "HIGH"
    fun wiperNote(v: Int): String = if (v < 2) "WIPERS PARK" else "WIPERS ${wiperMode(v)}"

    /** web pressurization mode label shown on the selector */
    fun pressModeLabel(mode: String): String = if (mode == "MAN_AC") "MAN AC" else if (mode == "MAN_DC") "MAN DC" else mode
    fun pressModeFromLabel(label: String): String = if (label == "MAN AC") "MAN_AC" else if (label == "MAN DC") "MAN_DC" else label
    fun pressManual(mode: String): Boolean = mode == "MAN_AC" || mode == "MAN_DC"

    /** web Readout2 text: five dashes when unpowered */
    fun readout2(value: String, on: Boolean): String = if (on) value else "-----"

    /** web `String(n).padStart(5, "0")` */
    fun pad5(n: Long): String = n.toString().padStart(5, '0')

    /** web standby cabin-rate readout: sign for positive, one decimal (JS toFixed(1) for the usual 0.1 steps) */
    fun cabinRateText(rate: Double): String =
        (if (rate > 0) "+" else "") + java.math.BigDecimal(rate.toString()).setScale(1, java.math.RoundingMode.HALF_UP).toPlainString()

    /** web pressurization bar widths in percent */
    fun cabinBarPercent(powered: Boolean, cabinDiff: Double): Double = if (powered) clamp(cabinDiff * 3, 0.0, 100.0) else 0.0
    fun fltAltBarPercent(powered: Boolean, fltAlt: Double): Double = if (powered) clamp(fltAlt / 410, 0.0, 100.0) else 0.0

    /** web outflow valve gauge value */
    fun outflowValue(open: Boolean): Double = if (open) 8.0 else 2.0

    // ───────────────────────── Bottom strip ─────────────────────────

    val START_KNOB = listOf("GRD", "OFF", "L IGN", "R IGN", "FLT")
    val START_MAP = listOf("GRD", "OFF", "IGN_L", "IGN_R", "FLT")

    /** web StartKnob index: unknown values show OFF */
    fun startIndex(v: String): Int = when (v) {
        "GRD" -> 0
        "OFF" -> 1
        "IGN_L" -> 2
        "IGN_R" -> 3
        "FLT" -> 4
        else -> 1
    }

    fun startValue(i: Double): String = START_MAP[clampInt(jsRound(i).toInt(), 0, 4)]
    fun startNote(n: Int, i: Double): String = "ENG $n START → ${START_KNOB[clampInt(jsRound(i).toInt(), 0, 4)]}"

    /** web setLights: navigation off means OFF, else steady with or without the strobe */
    fun positionLights(strobe: Boolean, nav: Boolean): String = if (nav) (if (strobe) "STROBE_STEADY" else "STEADY") else "OFF"

    // ───────────────────────── Cargo fire test block ─────────────────────────

    /** web `disch`: only when armed, the system is installed and the bottle is still full */
    fun cargoCanDischarge(arm: Boolean, installed: Boolean, discharged: Boolean): Boolean = arm && installed && !discharged
    fun cargoDischargeNote(c: String): String = "CARGO FIRE DISCH — agent released into the $c compartment."

    // ───────────────────────── Audio panel ─────────────────────────

    val RX = listOf("VHF-1", "VHF-2", "VHF-3", "HF-1", "HF-2", "INT", "CABIN", "PA")
    val AUD2 = listOf("NAV-1" to "1", "NAV-2" to "NAV-2", "ADF-1" to "ADF-1", "ADF-2" to "ADF-2", "MKR" to "MKR", "SPKR" to "SPKR")

    /** web transmit select: tapping the lit one clears it */
    fun audioTxToggle(current: String, r: String): String = if (current == r) "" else r
    fun audioTxLit(current: String, r: String, powered: Boolean): Boolean = current == r && powered

    // ───────────────────────── Engine panel (reverser test) ─────────────────────────

    fun reverserLit(powered: Boolean, active: Boolean, test: Boolean): Boolean = powered && (active || test)
    fun pmcOnLit(powered: Boolean, pmc: Boolean): Boolean = powered && pmc
    fun pmcInopLit(powered: Boolean, pmc: Boolean, test: Boolean): Boolean = powered && (!pmc || test)
    fun lowIdleLit(powered: Boolean, rt1: Boolean, rt2: Boolean): Boolean = powered && (rt1 || rt2)

    /** web compass SET HDG knob: heading steps by the sign of the knob value, wrapped to 0..359 */
    fun compassStep(hdg: Double, v: Double): Double = (hdg + Math.signum(v) + 360) % 360

    // ───────────────────────── Ice / hydraulics / doors / CVR ─────────────────────────

    /** web `wh(k)` note: key without the `windowHeat` prefix, e.g. "LSide" */
    fun windowHeatNote(key: String, on: Boolean): String = "WINDOW HEAT ${key.replace("windowHeat", "")} ${if (on) "ON" else "OFF"}"

    /** web door entry note: the door is closed when it was open */
    fun doorNote(label: String, wasOpen: Boolean): String = "$label DOOR ${if (wasOpen) "CLOSED" else "OPEN"}"

    /** web CVR ERASE needs the ground, DC power and an operative CVR */
    fun cvrEraseAllowed(wow: Boolean, powered: Boolean, cvrFailure: Boolean): Boolean = wow && powered && !cvrFailure
    const val CVR_ERASE_INHIBITED = "CVR ERASE INHIBITED — requires ground, DC power, and an operative CVR"

    /** window heat: the ON light also lights during PWR test, never with the overheat for that window */
    fun windowOnLit(ac: Boolean, on: Boolean, ovht: Boolean, test: String): Boolean = ac && ((on && !ovht) || test == "PWR")
    fun windowOvhtLit(pw: Boolean, ovht: Boolean, test: String): Boolean = pw && (ovht || test == "OVHT")

    // ───────────────────────── Equipment cooling ─────────────────────────

    /** web OFF / OVHT light: overheat, or neither supply nor exhaust fan powered */
    fun equipOffOvht(overheat: Boolean, supplyPowered: Boolean, exhaustPowered: Boolean): Boolean = overheat || (!supplyPowered && !exhaustPowered)

    /** web E/E bay readout line */
    fun equipLine(bayTempC: Double, flow: Double): String = "E/E BAY TEMP ${jsRound(bayTempC)}°C · FLOW ${jsRound(flow * 100)}%"

    // ───────────────────────── Scale to fit ─────────────────────────

    /** web `Math.min(1, (w - 18) / DESIGN_W)` for the FIT size */
    fun fitScale(widthDp: Double): Double = min(1.0, (widthDp - 18) / DESIGN_W)
}
