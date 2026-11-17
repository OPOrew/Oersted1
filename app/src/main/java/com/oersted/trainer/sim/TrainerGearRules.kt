package com.oersted.trainer.sim

import java.math.BigDecimal
import java.math.RoundingMode
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/**
 * Rules of the Landing Gear training section: LandingGearComponentView and LandingGearMechanismSvg in
 * components/panel/Overhead.tsx, plus the nose wheel steering chips of routes/cockpit.tsx. Pure.
 */
object TrainerGearRules {
    /** web MAIN_MAX_ANGLE: the main gear fans up and inboard through 90 degrees. */
    const val MAIN_MAX_ANGLE = 90.0
    const val NOSE_PIVOT_X = 320.0
    const val NOSE_PIVOT_Y = 98.0

    /** web `Math.max(-78, Math.min(78, angle))` */
    const val STEER_LIMIT = 78.0

    /** Main gear leg x positions on the 640 x 350 drawing (web `mainX`). */
    val MAIN_X = doubleArrayOf(145.0, 495.0)

    /** Hinge height of the main legs (web `pivotY`) and the radius of the dashed guide arc. */
    const val MAIN_PIVOT_Y = 93.0
    const val GUIDE_RADIUS = 168.0

    fun clamp01(v: Double): Double = max(0.0, min(1.0, v))
    fun steering(angle: Double): Double = max(-STEER_LIMIT, min(STEER_LIMIT, angle))

    /** web `powered = d.hydA > 1500` */
    fun hydraulicAvailable(hydA: Double): Boolean = hydA > 1500
    fun hydLabel(powered: Boolean): String = if (powered) "HYD A AVAILABLE" else "HYD A LOW / OFF"

    /** web gearState text of the readout grid. */
    fun gearState(transit: Boolean, selector: String, gearDown: Boolean, gearUp: Boolean): String =
        if (transit) {
            if (selector == "DN") "EXTENDING" else if (selector == "UP") "RETRACTING" else "TRANSIT / HOLD"
        } else if (gearDown) "DOWN / LOCKED" else if (gearUp) "UP / LOCKED" else "TRANSIT"

    /** web lockState (computed by the web but not displayed; kept for the same names). */
    fun lockState(gearDown: Boolean, gearUp: Boolean): String = if (gearDown) "DOWNLOCK" else if (gearUp) "UPLOCK" else "MOVING"

    /** A leg is moving between 2 % and 98 % of travel. */
    fun moving(pos: Double): Boolean = pos > 0.02 && pos < 0.98

    /** Label in the box under the drawing. */
    fun mechanismLabel(extending: Boolean, retracting: Boolean, pos: Double): String =
        if (extending) "EXTENDING" else if (retracting) "RETRACTING" else if (pos >= .98) "DOWN / LOCKED" else if (pos <= .02) "UP / LOCKED" else "TRANSIT / HOLD"

    /** Drawing colours as the three states the web paints: 0 = down and locked (green), 1 = up (grey), 2 = moving (red). */
    fun lockLamp(pos: Double): Int = if (pos >= .98) 0 else if (pos <= .02) 1 else 2

    /** The label colour: red while extending, retracting or in between, green when down, grey when up. */
    fun labelTone(extending: Boolean, retracting: Boolean, pos: Double): Int =
        if (extending || retracting) 2 else if (pos >= .98) 0 else if (pos <= .02) 1 else 2

    /** web leg rotation about the fixed upper pivot: left (index 0) fans toward the right, right toward the left. */
    fun mainAngle(index: Int, pos: Double): Double {
        val side = if (index == 0) -1 else 1
        return side * (1 - pos) * MAIN_MAX_ANGLE
    }

    /** web pivotArc end points: 0 degrees points straight down, positive is clockwise. */
    fun arcPoint(cx: Double, cy: Double, r: Double, deg: Double): Pair<Double, Double> {
        val rad = deg * PI / 180.0
        return Pair(cx - r * sin(rad), cy + r * cos(rad))
    }

    /** web SVG sweep flag: 1 when going to a larger angle. */
    fun arcSweep(fromDeg: Double, toDeg: Double): Boolean = toDeg >= fromDeg

    // ───────────────────────── manual extension ─────────────────────────

    /** web `allowed = s.gear !== "UP"` */
    fun manualAllowed(selector: String): Boolean = selector != "UP"

    const val MANUAL_INHIBITED_NOTE = "MANUAL EXTENSION INHIBITED — SELECT LANDING GEAR LEVER TO OFF/NEUTRAL OR DN FIRST."

    val MANUAL_HANDLES: List<Pair<String, String>> = listOf("LEFT MAIN" to "leftMain", "NOSE" to "nose", "RIGHT MAIN" to "rightMain")

    fun manualGearLabel(key: String): String = if (key == "nose") "NOSE GEAR" else if (key == "leftMain") "LEFT MAIN GEAR" else "RIGHT MAIN GEAR"
    fun manualNote(key: String): String = "MANUAL EXTENSION — ${manualGearLabel(key)} uplock released; T-handle returned."

    fun manualStatus(allowed: Boolean, released: Boolean): String = if (!allowed) "LEVER OFF" else if (released) "UPLOCK RELEASED" else "PULL / RELEASE"

    // ───────────────────────── readouts ─────────────────────────

    /** web `${Math.round(pos * 100)}% ${green ? "DOWN/LOCKED" : red ? "RED/UNSAFE" : "UP"}` */
    fun legReadout(pos: Double, green: Boolean, red: Boolean): String =
        "${floor(pos * 100 + 0.5).toLong()}% ${if (green) "DOWN/LOCKED" else if (red) "RED/UNSAFE" else "UP"}"

    fun overrideText(override: Boolean): String = if (override) "ENABLED" else "NORMAL / GROUND LOCK"
    fun hornText(active: Boolean): String = if (active) "HORN ACTIVE" else "SILENT"
    fun steeringSource(available: Boolean): String = if (available) "SYSTEM A" else "OFF"

    /** JS `Number.toFixed(0)`: ties away from zero, and a negative value that rounds to zero prints "-0". */
    fun toFixed0(v: Double): String {
        val sign = if (v < 0) "-" else ""
        return sign + BigDecimal(Math.abs(v)).setScale(0, RoundingMode.HALF_UP).toPlainString()
    }

    /** Nose wheel steering chips of the section: `ANGLE n°` and `SOURCE ...`. */
    fun angleChip(angle: Double): String = "ANGLE ${toFixed0(angle)}°"
    fun sourceChip(available: Boolean): String = "SOURCE ${steeringSource(available)}"
}
