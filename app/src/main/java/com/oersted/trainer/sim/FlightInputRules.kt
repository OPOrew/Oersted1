package com.oersted.trainer.sim

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sign

/**
 * Pure logic behind the Flight Controls trainer inputs: FlightModeControl.tsx (GROUND button patch), FlightControlInputs.tsx
 * (yoke drag + self-centering) and SteeringControls.tsx (rudder pedals, toe brakes, tiller). The Compose views only gather
 * pointer events and call these; the web files keep the same math inline in their handlers / rAF loops.
 */
object FlightInputRules {
    fun clamp(v: Double, lo: Double, hi: Double): Double = max(lo, min(hi, v))

    /** Web goGround() patch. Note the web writes gear: "DOWN" (not "DN"); kept as is, gear positions are set explicitly. */
    fun groundModePatch(): Map<String, Any?> = mapOf(
        "airborneTest" to false,
        "groundSenseTest" to false,
        "wow" to true,
        "gear" to "DOWN",
        "noseGearPos" to 1.0,
        "leftMainGearPos" to 1.0,
        "rightMainGearPos" to 1.0,
        "groundSpeedKt" to 0.0,
        "psFlightCasKt" to 0.0,
        "psFlightTargetCasKt" to 0.0,
        "psFlightAltFt" to 0.0,
        "psFlightTargetAltFt" to 0.0,
        "psFlightVsFpm" to 0.0,
        "speedBrake" to "DOWN",
        "yokePitch" to 0.0,
        "yokeRoll" to 0.0,
        "rudderPedal" to 0.0,
    )

    const val GROUND_NOTE = "GROUND MODE — weight on wheels, gear down, airplane stopped."
    const val FLIGHT_NOTE = "FLIGHT MODE — airborne, gear up, hydraulics A/B pressurized; flight controls live."

    /** Airspeed slider patch (web: psFlightCasKt, psFlightTargetCasKt and groundSpeedKt together). */
    fun airspeedPatch(v: Double): Map<String, Any?> = mapOf("psFlightCasKt" to v, "psFlightTargetCasKt" to v, "groundSpeedKt" to v)

    /** Altitude slider patch. */
    fun altitudePatch(v: Double): Map<String, Any?> = mapOf("psFlightAltFt" to v, "psFlightTargetAltFt" to v)

    /** Spring return toward 0 at [rate] per second; snaps to 0 inside 0.01 (yoke rate 3.0, rudder 3.0, tiller 2.2). */
    fun springReturn(v: Double, dt: Double, rate: Double): Double {
        if (abs(v) < 0.01) return 0.0
        return v - sign(v) * min(abs(v), rate * dt)
    }

    const val YOKE_RATE = 3.0
    const val RUDDER_RATE = 3.0
    const val TILLER_RATE = 2.2

    /** Toe brake ramp: 2.2/s while held, back at 4/s when released. */
    fun toeBrake(cur: Double, down: Boolean, dt: Double): Double =
        if (down) min(1.0, cur + 2.2 * dt) else max(0.0, cur - 4.0 * dt)

    /** Yoke drag scale: sx = sy = 2.8 / max(scale, 0.2), where scale = min(width / 320, height / 300) of the drawn pad (web). */
    fun yokeDragGain(scale: Double): Double = 2.8 / max(scale, 0.2)

    /** Roll from the horizontal drag distance in pixels. */
    fun yokeRollFromDrag(roll0: Double, dxPx: Double, gain: Double): Double = clamp(roll0 + dxPx * gain / 100.0, -1.0, 1.0)

    /** Pitch from the vertical drag distance in pixels (drag up = pull back = positive pitch). */
    fun yokePitchFromDrag(pitch0: Double, dyPx: Double, gain: Double): Double = clamp(pitch0 - dyPx * gain / 100.0, -1.0, 1.0)

    /** Rudder from a pedal drag: forward travel in svg units over TRAVEL (20); the left pedal pushes the rudder negative. */
    const val PEDAL_TRAVEL = 20.0
    fun rudderFromPedalDrag(leftSide: Boolean, r0: Double, forwardSvgUnits: Double): Double {
        val fwd = forwardSvgUnits / PEDAL_TRAVEL
        return clamp(if (leftSide) r0 - fwd else r0 + fwd, -1.0, 1.0)
    }

    const val TILLER_MAX_DEG = 78.0

    /** Tiller angle in degrees about the pivot, 0 = straight up, clockwise positive (web angleAt). */
    fun tillerAngleDeg(dx: Double, dy: Double): Double = Math.atan2(dx, -dy) * 180.0 / Math.PI

    /** Tiller value (-1..1) from the start angle, the start tiller value and the current pointer angle, wrapping the delta to +-180. */
    fun tillerFromDrag(startAngleDeg: Double, startTiller: Double, nowAngleDeg: Double): Double {
        var delta = nowAngleDeg - startAngleDeg
        if (delta > 180) delta -= 360
        if (delta < -180) delta += 360
        return clamp((startTiller * TILLER_MAX_DEG + delta) / TILLER_MAX_DEG, -1.0, 1.0)
    }
}
