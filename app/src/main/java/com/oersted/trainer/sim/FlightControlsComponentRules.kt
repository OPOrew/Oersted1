package com.oersted.trainer.sim

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/**
 * Port of the pure parts of FlightControlComponentView in components/panel/Overhead.tsx (routes/cockpit.tsx mounts it
 * as FlightControlsModule): hydraulic availability gates, per-spoiler deployment, ground-spoiler interlock, flap gauge
 * geometry and the readout texts. The Compose drawing is ui/panel/FlightControlsModuleView.kt.
 */
object FlightControlsComponentRules {
    const val ELEV_AMP = 13.0
    const val G_CX = 555.0
    const val G_CY = 300.0
    const val G_R = 46.0
    val FLAP_TICKS = listOf(0, 1, 2, 5, 10, 15, 25, 30, 40)

    data class Model(
        val a: Boolean, val b: Boolean, val rud: Boolean,
        val spoiler2: Double, val spoiler3: Double, val spoiler6: Double, val spoiler7: Double,
        val gndSpoilerLocked: Boolean, val gndDeploy: Double, val teFlapFrac: Double,
    )

    /** Same expressions as the web (a / b / rud, flight spoilers 3/6 System A, 2/7 System B, ground spoilers 1/4/5/8 System A + WOW). */
    fun model(s: SimState, d: Derived): Model {
        val surface = d.controlSurfaces
        val a = d.hydA > 1500 && d.flightControlAAvailable
        val b = d.hydB > 1500 && d.flightControlBAvailable
        val rud = d.standbyRudderPowered || (a && b)
        val flightSpoilerA = a && s.spoilerA
        val flightSpoilerB = b && s.spoilerB
        val gndLocked = !(s.wow && d.hydA > 1500)
        return Model(
            a, b, rud,
            spoiler2 = surface.spoilerL * (if (flightSpoilerB) 1 else 0),
            spoiler3 = surface.spoilerL * (if (flightSpoilerA) 1 else 0),
            spoiler6 = surface.spoilerR * (if (flightSpoilerA) 1 else 0),
            spoiler7 = surface.spoilerR * (if (flightSpoilerB) 1 else 0),
            gndSpoilerLocked = gndLocked,
            gndDeploy = if (gndLocked) 0.0 else surface.spoiler,
            teFlapFrac = s.flapPos / 40,
        )
    }

    /** Needle sweep: 150° (UP) to 30° (40 units) across a 120° fan; labels are flap-unit detents, not degrees. */
    fun flapAngle(value: Double): Double = 150 - (min(max(value, 0.0), 40.0) / 40) * 120

    /** web polar(): y axis points up. */
    fun polar(cx: Double, cy: Double, r: Double, deg: Double): Pair<Double, Double> {
        val rad = deg * PI / 180
        return Pair(cx + r * cos(rad), cy - r * sin(rad))
    }

    fun dirWord(v: Double): String = if (v > 0.04) " (TE UP)" else if (v < -0.04) " (TE DN)" else ""

    /** JS (v * 100).toFixed(0) */
    fun pct0(v: Double): String {
        val t = java.math.BigDecimal(v * 100).setScale(0, java.math.RoundingMode.HALF_UP).toPlainString()
        return if (t == "-0") "0" else t
    }

    fun rudderReadout(rudder: Double): String =
        "${pct0(rudder)}% ${if (rudder > 0.04) "(RIGHT)" else if (rudder < -0.04) "(LEFT)" else ""}"

    fun aileronReadout(l: Double, r: Double): String = "${pct0(l)}${dirWord(l)} / ${pct0(r)}${dirWord(r)}"

    fun gndSpoilerReadout(m: Model, wow: Boolean): String =
        if (m.gndSpoilerLocked) (if (wow) "LOCKED (NO HYD A)" else "LOCKED (AIRBORNE)")
        else if (m.gndDeploy > 0.04) "${pct0(m.gndDeploy)}% DEPLOYED" else "STOWED"

    /** web readout cards in order: (label, value). */
    fun readouts(s: SimState, d: Derived): List<Pair<String, String>> {
        val m = model(s, d); val sf = d.controlSurfaces
        return listOf(
            "ELEVATOR" to "${pct0(sf.elevator)}%${dirWord(sf.elevator)}",
            "RUDDER" to rudderReadout(sf.rudder),
            "AILERON L / R" to aileronReadout(sf.aileronL, sf.aileronR),
            "FLT SPOILERS" to "${pct0(max(m.spoiler2, m.spoiler3))}%",
            "GND SPOILERS" to gndSpoilerReadout(m, s.wow),
            "HYD A" to (if (m.a) "PCUs PRESSURIZED" else "LOW / OFF"),
            "HYD B" to (if (m.b) "PCUs PRESSURIZED" else "LOW / OFF"),
        )
    }
}
