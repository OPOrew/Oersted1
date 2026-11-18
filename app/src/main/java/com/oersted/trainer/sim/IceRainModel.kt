package com.oersted.trainer.sim

import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/**
 * Thermal / ice model of the Ice & Rain Protection trainer (ATA 30), ported from components/panel/IceRainDiagrams.tsx
 * (`step`, `initialState`, the wiper phase part of `useIceRainAnim`) plus the derived switch logic at the top of
 * IceRainTrainer.tsx (window enables, overheat, probe heat, wing valve command, valve light, chips).
 *
 * Sources (737 AMM, rev 108): 56-10-0 windows; 30-41-0 window heat (No.1/2 held at 107 +/-7 F, power ramps 0 to full in about
 * 3 min, overheat cutoff about 145 F; No.4/5 regulated 80-120 F by the No.5 thermal switch opening at 110 F and closing at
 * 90 F; left gen feeds L No.1/4/5 + R No.2, right gen feeds R No.1/4/5 + L No.2); 30-11-0 wing TAI (slats only, 115 V ac motor
 * valves, inhibited on the ground by the landing-gear safety relay, TEST bypasses it); 30-42-0 wipers (arc 84 +/-4 deg, HIGH at
 * least 250 strokes/min, PARK drives home at high speed).
 */
object IceRainModel {
    val WIN_IDS = listOf("L1", "L2", "L4", "L5", "R1", "R2", "R4", "R5")
    val PROBE_IDS = listOf("capt", "fo", "elevL", "elevR", "temp", "alphaL", "alphaR")

    /** Web WIPER_SPM (PARK 0, INT 190, LOW 120, HIGH 250 strokes per minute). */
    val WIPER_SPM = mapOf("PARK" to 0.0, "INT" to 190.0, "LOW" to 120.0, "HIGH" to 250.0)
    const val WIPER_ARC = 84.0

    data class WinState(
        /** glass temperature, F */
        val t: Double,
        /** controller power ramp 0..1 (3 min to full) */
        val ramp: Double,
        /** seconds (sim) since power was removed */
        val offT: Double,
        /** delivered power fraction 0..1 */
        val p: Double,
        /** No.4/5 thermal-switch contact state */
        val heat: Boolean,
        /** temperature overheat trip (over 145 F while powered) */
        val trip: Boolean,
        val ice: Double,
        val wet: Double,
    )

    /** Side keys are "L"/"R"; cowl keys are 1/2. */
    data class IceState(
        val win: Map<String, WinState>,
        val probe: Map<String, Double>,
        val slat: Map<String, Double>,
        val cowl: Map<Int, Double>,
        val valve: Map<String, Double>,
        val repel: Map<String, Double>,
    )

    data class IceInputs(
        /** time compression for thermal / ice processes (1 = real time) */
        val speed: Double,
        val icing: Boolean,
        val rain: Boolean,
        val oatF: Double,
        val winEnabled: Map<String, Boolean>,
        val testPwr: Boolean,
        val probeHeated: Map<String, Boolean>,
        val valveCmd: Map<String, Boolean>,
        val hotAir: Map<String, Boolean>,
        val cowlHeated: Map<Int, Boolean>,
    )

    private fun clamp(v: Double, lo: Double = 0.0, hi: Double = 1.0) = min(hi, max(lo, v))

    /** JS Math.round. */
    fun jsRound(x: Double): Long = floor(x + 0.5).toLong()

    fun initialState(oat: Double): IceState = IceState(
        win = WIN_IDS.associateWith { WinState(t = oat, ramp = 0.0, offT = 99.0, p = 0.0, heat = true, trip = false, ice = 0.0, wet = 0.0) },
        probe = PROBE_IDS.associateWith { 0.0 },
        slat = mapOf("L" to 0.0, "R" to 0.0),
        cowl = mapOf(1 to 0.0, 2 to 0.0),
        valve = mapOf("L" to 0.0, "R" to 0.0),
        repel = mapOf("L" to 0.0, "R" to 0.0),
    )

    /** Web step(prev, inp, dt, strokesPerSec). */
    fun step(prev: IceState, inp: IceInputs, dt: Double, strokesPerSec: Map<String, Double>): IceState {
        val ds = dt * inp.speed
        val oat = if (inp.icing) min(inp.oatF, 25.0) else inp.oatF
        val win = HashMap<String, WinState>()
        for (id in WIN_IDS) {
            val w = prev.win.getValue(id)
            val major = id[1] == '1' || id[1] == '2'
            val en = inp.winEnabled[id] == true
            var t = w.t; var ramp = w.ramp; var offT = w.offT; var heat = w.heat; var trip = w.trip; var ice = w.ice; var wet = w.wet
            var p = 0.0
            if (en) {
                offT = 0.0
                if (major) {
                    ramp = min(1.0, ramp + ds / 180)
                    p = min(ramp, clamp((114 - t) / 14))
                    if (inp.testPwr) p = 1.0
                    if (t > 145) trip = true
                } else {
                    if (t >= 110) heat = false
                    else if (t <= 90) heat = true
                    p = if (heat) 1.0 else 0.0
                }
            } else {
                offT += ds
                if (offT >= 5) ramp = 0.0
                trip = false
            }
            if (trip) p = 0.0
            val teq = oat + (if (major) 100 else 70) * p
            val tau = if (major) 50.0 else 40.0
            t += (teq - t) * (1 - exp(-ds / tau))
            if (t < 38) {
                if (inp.icing) ice += ds / 30
            } else ice -= ds * (0.02 + (t - 38) / 1500)
            ice = clamp(ice)
            if (id[1] == '1') {
                val side = id.substring(0, 1)
                val rainRate = if (inp.rain) 0.25 * (1 - 0.8 * prev.repel.getValue(side)) else 0.0
                wet = clamp(wet + rainRate * dt - (strokesPerSec[side] ?: 0.0) * 0.35 * dt - 0.015 * dt)
            }
            win[id] = WinState(t, ramp, offT, p, heat, trip, ice, wet)
        }

        val probe = HashMap<String, Double>()
        for (id in PROBE_IDS) {
            var v = prev.probe.getValue(id)
            if (inp.probeHeated[id] == true) v -= ds / 7
            else if (inp.icing) v += ds / 50
            probe[id] = clamp(v)
        }

        val valve = HashMap<String, Double>()
        val slat = HashMap<String, Double>()
        for (sd in listOf("L", "R")) {
            val target = if (inp.valveCmd[sd] == true) 1.0 else 0.0
            val dv = clamp(target - prev.valve.getValue(sd), -dt / 3, dt / 3)
            valve[sd] = clamp(prev.valve.getValue(sd) + dv)
            val heated = valve.getValue(sd) > 0.5 && inp.hotAir[sd] == true
            var v = prev.slat.getValue(sd)
            if (heated) v -= ds / 20
            else if (inp.icing) v += ds / 60
            slat[sd] = clamp(v)
        }
        val cowl = HashMap<Int, Double>()
        for (n in listOf(1, 2)) {
            var v = prev.cowl.getValue(n)
            if (inp.cowlHeated[n] == true) v -= ds / 15
            else if (inp.icing) v += ds / 50
            cowl[n] = clamp(v)
        }
        val repel = mapOf(
            "L" to clamp(prev.repel.getValue("L") - dt / 45),
            "R" to clamp(prev.repel.getValue("R") - dt / 45),
        )
        return IceState(win, probe, slat, cowl, valve, repel)
    }

    /** Web spray(side): the rain-repellent pulse sets that side's repellent level to 1. */
    fun spray(st: IceState, side: String): IceState = st.copy(repel = st.repel + (side to 1.0))

    /** Result of one wiper phase update: the new phase (0..1) and the strokes per second it produces. */
    data class WiperStep(val phase: Double, val strokesPerSec: Double)

    /** The per-side wiper part of the web animation loop. PARK keeps driving at high speed until the blades are home. */
    fun wiperStep(phase: Double, mode: String, dt: Double): WiperStep {
        var ph = phase
        var sps = 0.0
        if (mode != "PARK") {
            val spm = WIPER_SPM[mode] ?: 0.0
            ph += (spm / 120) * dt
            if (ph >= 1) ph -= 1
            sps = spm / 60
        } else if (ph > 0) {
            ph += (250.0 / 120) * dt
            sps = 250.0 / 60
            if (ph >= 1) ph = 0.0
        }
        return WiperStep(ph, sps)
    }

    /** Blade angle in degrees for a wiper phase (the web arm rotation). */
    fun wiperAngle(phase: Double): Double = WIPER_ARC * (1 - abs(2 * phase - 1))

    // ---- derived switch logic from IceRainTrainer.tsx ----

    /** Web ovhtOf: latched, or the OVHT test held with that window's switch on. */
    fun overheat(s: SimState): Map<String, Boolean> {
        fun ovhtOf(latched: Boolean, sw: Boolean) = latched || (s.windowHeatTest == "OVHT" && sw)
        return mapOf(
            "L1" to ovhtOf(s.windowHeatOvhtLFwd, s.windowHeatLFwd),
            "L2" to ovhtOf(s.windowHeatOvhtLSide, s.windowHeatLSide),
            "R1" to ovhtOf(s.windowHeatOvhtRFwd, s.windowHeatRFwd),
            "R2" to ovhtOf(s.windowHeatOvhtRSide, s.windowHeatRSide),
            "L4" to false, "L5" to false, "R4" to false, "R5" to false,
        )
    }

    /** Web winEnabled (AMM 30-41-0 generator feed pattern); [ac1]/[ac2] = electricalSource1/2 not "NONE". */
    fun winEnabled(s: SimState, ac1: Boolean, ac2: Boolean, ovht: Map<String, Boolean>): Map<String, Boolean> {
        val cbL = s.circuitBreakers["window-heat-left"] == true
        val cbR = s.circuitBreakers["window-heat-right"] == true
        val fL = s.faults.windowHeatFailureL
        val fR = s.faults.windowHeatFailureR
        return mapOf(
            "L1" to (s.windowHeatLFwd && cbL && ac1 && ovht["L1"] != true && !fL),
            "L2" to (s.windowHeatLSide && cbL && ac2 && ovht["L2"] != true && !fL),
            "L4" to (s.windowHeatLSide && cbL && ac1 && !fL),
            "L5" to (s.windowHeatLSide && cbL && ac1 && !fL),
            "R1" to (s.windowHeatRFwd && cbR && ac2 && ovht["R1"] != true && !fR),
            "R2" to (s.windowHeatRSide && cbR && ac1 && ovht["R2"] != true && !fR),
            "R4" to (s.windowHeatRSide && cbR && ac2 && !fR),
            "R5" to (s.windowHeatRSide && cbR && ac2 && !fR),
        )
    }

    /** Web probeHeated: AC and DC up, switch on and breaker in; alpha vanes come from the derived heater flags. */
    fun probeHeated(s: SimState, ac: Boolean, dc: Boolean, alphaVaneHeatedL: Boolean, alphaVaneHeatedR: Boolean): Map<String, Boolean> {
        val sw = mapOf(
            "capt" to s.probeHeatCaptPitot, "fo" to s.probeHeatFoPitot, "elevL" to s.probeHeatElevL, "elevR" to s.probeHeatElevR,
            "temp" to s.probeHeatTemp, "alphaL" to s.probeHeatAlphaL, "alphaR" to s.probeHeatAlphaR,
        )
        val out = HashMap<String, Boolean>()
        for ((k, v) in sw) {
            val cbOk = when (k) {
                "capt" -> s.psCbCaptUpperL
                "fo" -> s.psCbFoUpperR
                "elevL" -> s.psCbElevL
                "elevR" -> s.psCbElevR
                "temp" -> s.psCbTempL && s.psCbTempR
                "alphaL" -> s.circuitBreakers["alpha-vane-left"] == true
                "alphaR" -> s.circuitBreakers["alpha-vane-right"] == true
                else -> true
            }
            out[k] = when (k) {
                "alphaL" -> alphaVaneHeatedL
                "alphaR" -> alphaVaneHeatedR
                else -> ac && dc && v && cbOk
            }
        }
        return out
    }

    /** Web valveCmd: 115 V ac motor valve opens when the switch is on and the airplane is airborne, or while TEST is held. */
    fun valveCmd(s: SimState, ac: Boolean, wow: Boolean, wingTest: Boolean): Map<String, Boolean> = mapOf(
        "L" to (ac && ((s.wingAntiIceL && !wow) || wingTest)),
        "R" to (ac && ((s.wingAntiIceR && !wow) || wingTest)),
    )

    /** Web hotAir: duct pressure above 8 psi. */
    fun hotAir(leftDuctPsi: Double, rightDuctPsi: Double): Map<String, Boolean> =
        mapOf("L" to (leftDuctPsi > 8), "R" to (rightDuctPsi > 8))

    /** Web cowlOpen (switch on with ac) and cowlHeated (open and bleed available). */
    fun cowlOpen(s: SimState, ac: Boolean): Map<Int, Boolean> = mapOf(1 to (ac && s.antiIce1), 2 to (ac && s.antiIce2))
    fun cowlHeated(open: Map<Int, Boolean>, bleed1Available: Boolean, bleed2Available: Boolean): Map<Int, Boolean> =
        mapOf(1 to (open[1] == true && bleed1Available), 2 to (open[2] == true && bleed2Available))

    /** Web lightFor: the blue VALVE OPEN light. dim = open and agrees, bright = in transit or disagrees. */
    fun valveLight(valvePos: Double, switchOn: Boolean, wingTest: Boolean, dc: Boolean): String {
        val sw = switchOn || wingTest
        val open = valvePos >= 0.97
        val transit = valvePos > 0.03 && valvePos < 0.97
        if (!dc) return "off"
        if (transit || (sw && !open) || (!sw && open)) return "bright"
        return if (open) "dim" else "off"
    }

    /** Web iceTotal: the largest ice fraction on the airplane. */
    fun iceTotal(st: IceState): Double {
        var m = 0.0
        for (v in st.probe.values) m = max(m, v)
        for (v in st.slat.values) m = max(m, v)
        for (v in st.cowl.values) m = max(m, v)
        for (w in st.win.values) m = max(m, w.ice)
        return m
    }

    /** Web winChip value text: "75°F · 0%" for one window, or the mean temperature and larger power of a group. */
    fun winChipValue(w: WinState, group: WinState? = null): String {
        val t = if (group != null) (w.t + group.t) / 2 else w.t
        val p = if (group != null) max(w.p, group.p) else w.p
        return "${jsRound(t)}°F · ${jsRound(p * 100)}%"
    }

    /** Web OAT chip: icing conditions hold the outside air at 25 F or below. */
    fun oatShown(icing: Boolean, ambientTempF: Double?): Long {
        val amb = ambientTempF ?: 75.0
        return jsRound(if (icing) min(amb, 25.0) else amb)
    }
}
