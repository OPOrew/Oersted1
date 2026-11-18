package com.oersted.trainer.sim

import com.oersted.trainer.sim.FlightPhases.Phase
import java.math.BigDecimal
import java.math.RoundingMode
import kotlin.math.floor
import kotlin.math.max

/**
 * Display text rules of FlightPhasePanel.tsx (the Flight phases block of the Navigation section): the live configuration
 * line, the plan cells, ETE, and the phase progress for the button colours. The controller logic itself is PhaseController.
 */
object NavigationPhaseText {
    /** Web PHASE_ORDER. */
    val PHASE_ORDER: List<Phase> = listOf(
        Phase.READY, Phase.TAKEOFF, Phase.CLIMB, Phase.CRUISE, Phase.DESCENT, Phase.APPROACH, Phase.LAND, Phase.ROLLOUT, Phase.COMPLETE,
    )

    private fun jsRound(x: Double): Long = floor(x + 0.5).toLong()

    /** Web pad3: heading 000..359, wrapped and rounded. */
    fun pad3(n: Double): String = jsRound(((n % 360) + 360) % 360).toString().padStart(3, '0')

    /** Web fmtFt: Math.round(n).toLocaleString("en-US"). */
    fun fmtFt(n: Double): String = PitotStaticRules.groupedRound(n)

    /** Web toFixed(digits) for non-negative values (round half up on the decimal expansion). */
    private fun toFixed(v: Double, digits: Int): String = BigDecimal(v).setScale(digits, RoundingMode.HALF_UP).toPlainString()

    /** Web gearText from the average of the three gear positions. */
    fun gearText(nose: Double, leftMain: Double, rightMain: Double): String {
        val avg = (nose + leftMain + rightMain) / 3
        return if (avg > 0.98) "DOWN & LOCKED" else if (avg < 0.02) "UP & LOCKED" else "IN TRANSIT"
    }

    /** Web liveConfig line: "DOWN & LOCKED · FLAPS 5 · SPEEDBRAKE ARMED". [flaps] is shown as the sim stores it. */
    fun liveConfig(nose: Double, leftMain: Double, rightMain: Double, flaps: Double, speedBrake: String): String {
        val sb = if (speedBrake == "UP") "UP (DEPLOYED)" else speedBrake.ifEmpty { "-" }
        return "${gearText(nose, leftMain, rightMain)} · FLAPS ${jsNumber(flaps)} · SPEEDBRAKE $sb"
    }

    /** JS number to string for whole or fractional values (5.0 -> "5"). */
    fun jsNumber(v: Double): String = if (v == floor(v) && kotlin.math.abs(v) < 1e15) v.toLong().toString() else v.toString()

    /** Web etaMin: minutes to go, only above 30 kt ground speed, divided by the en-route time compression. */
    fun etaMinutes(distanceToDestinationNm: Double?, groundSpeedKt: Double, timeCompression: Double?): Double? =
        if (distanceToDestinationNm != null && groundSpeedKt > 30) distanceToDestinationNm / groundSpeedKt * 60 / max(1.0, timeCompression ?: 1.0) else null

    /** Web "To destination" cell. */
    fun toDestination(distanceToDestinationNm: Double?, etaMin: Double?): String {
        if (distanceToDestinationNm == null) return "-"
        val ete = if (etaMin != null) " · ETE ${floor(etaMin / 60).toLong()}h${jsRound(etaMin % 60).toString().padStart(2, '0')}" else ""
        return "${toFixed(distanceToDestinationNm, 0)} NM$ete"
    }

    /** Web "Next waypoint" cell. */
    fun nextWaypoint(activeLegName: String?, distanceToNextNm: Double?, bearingToNextDeg: Double?): String {
        if (activeLegName.isNullOrEmpty()) return "-"
        val dist = if (distanceToNextNm != null) toFixed(distanceToNextNm, 1) else "-"
        val brg = if (bearingToNextDeg != null) pad3(bearingToNextDeg) + "°T" else ""
        return "$activeLegName · $dist NM · $brg"
    }

    /** Web "Planned cruise" cell; [capFl] is the sim's maximum flight level, when set. */
    fun plannedCruise(plan: ActiveFlightPlan?, capFl: Int?): String =
        if (plan == null) "-" else "${fmtFt(plan.cruiseAltitudeFt)} ft${if (capFl != null) " · max FL$capFl" else ""}"

    /** Web "Altitude target" cell: what the controller is commanding for the phase. */
    fun altitudeTarget(phase: Phase, plan: ActiveFlightPlan?): String {
        if (plan == null) return if (phase == Phase.CLIMB || phase == Phase.DESCENT || phase == Phase.APPROACH || phase == Phase.CRUISE) "-" else "not commanded"
        return when (phase) {
            Phase.CLIMB, Phase.CRUISE -> "${fmtFt(plan.cruiseAltitudeFt)} ft"
            Phase.DESCENT, Phase.APPROACH -> {
                val first = plan.arrival?.firstFixName
                val alt = if (first != null && first.isNotEmpty()) {
                    val a = plan.waypoints.firstOrNull { it.name == first }?.altitudeFt
                    if (a == null || a == 0.0) 3000.0 else a   // JS `altitudeFt || 3000`
                } else 3000.0
                "${fmtFt(alt)} ft"
            }
            else -> "not commanded"
        }
    }

    /** Web header: "RPLL → WSSS · 35,000 ft", with the callsign first when there is one. */
    fun planHeader(plan: ActiveFlightPlan?): String =
        if (plan == null) "no active plan"
        else "${if (plan.callsign.isNotEmpty()) plan.callsign + " · " else ""}${plan.departure} → ${plan.destination} · ${fmtFt(plan.cruiseAltitudeFt)} ft"

    /** Web button state: "here" (current phase; LAND also covers ROLLOUT and COMPLETE), "done" (an earlier one) or "todo". */
    fun buttonProgress(button: Phase, phase: Phase): String {
        val idx = PHASE_ORDER.indexOf(phase)
        val here = phase == button || (button == Phase.LAND && (phase == Phase.ROLLOUT || phase == Phase.COMPLETE))
        val done = idx > PHASE_ORDER.indexOf(button) && !here
        return if (here) "here" else if (done) "done" else "todo"
    }
}
