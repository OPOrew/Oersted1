package com.oersted.trainer.sim

import com.oersted.trainer.sim.FlightPhases.Phase
import com.oersted.trainer.sim.MarkerBeacons.MarkerId
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sign
import kotlin.math.sin

/**
 * Port of the logic in RunwayScene.tsx (side elevation of the takeoff roll, climb-out, ILS final and landing roll).
 * The React component keeps the machine in a `useRef` and runs it from a 20 Hz rAF loop; here it is [RunwaySceneModel], stepped by the
 * Compose frame loop with an explicit `nowMs`. It is a VISUALISATION of the live simulation only: nothing here feeds back into the sim.
 * Horizontal and vertical scales differ (schematic, not to scale).
 */
object RunwaySceneRules {
    const val NM_FT = 6076.12
    const val KT_FPS = 1.6878
    /** RPLL 06/24 (3,737 m): runway length used for the drawing. */
    const val RWY_FT = 12260.0
    const val VBW = 640.0
    const val VBH = 214.0
    /** ground line */
    const val GY = 150.0
    const val ZOOM_WIDE = 0.034
    const val ZOOM_ROLL = 0.2

    enum class Mode { TAKEOFF, FLIGHT, APPROACH, ROLLOUT }

    /** The live-sim inputs the web loop reads each tick (useSim / useMip / useSituation / usePhase). */
    data class Inputs(
        val wow: Boolean,
        val altFt: Double,
        val casKt: Double,
        val gsKt: Double,
        val flaps: Double,
        val flapPos: Double,
        /** the gear LEVER: "DN" or otherwise up */
        val gearLever: String,
        val vsCmdFpm: Double,
        /** situation: NM east / north of the RPLL 06 threshold */
        val sitX: Double,
        val sitY: Double,
        val sitFlying: Boolean,
        val navOn: Boolean,
        val navTuned: String,
        val navSceneIsRpll06: Boolean,
        val phase: Phase,
        val attPitchDeg: Double,
        val markerOm: Boolean,
        val markerMm: Boolean,
        val markerIm: Boolean,
    )

    data class View(
        val mode: Mode = Mode.TAKEOFF,
        val xFt: Double = 400.0,
        val dist: Double = 99.0,
        val agl: Double = 0.0,
        val pitch: Double = 0.0,
        val gear: Double = 1.0,
        val gs: Double = 0.0,
        val cas: Double = 0.0,
        val flaps: Double = 1.0,
        val flapPos: Double = 1.0,
        val spin: Double = 0.0,
        val phase: Phase = Phase.NO_PLAN,
        val banner: String = "",
        val keyedOm: Boolean = false,
        val keyedMm: Boolean = false,
        val keyedIm: Boolean = false,
        val recvOm: Boolean = false,
        val recvMm: Boolean = false,
        val recvIm: Boolean = false,
        val flying: Boolean = false,
        val alt: Double = 0.0,
        val vsFpm: Double = 0.0,
        val fromRoll: Boolean = false,
        val zoom: Double = ZOOM_WIDE,
    ) {
        fun keyed(id: MarkerId) = when (id) { MarkerId.OM -> keyedOm; MarkerId.MM -> keyedMm; MarkerId.IM -> keyedIm }
        fun recv(id: MarkerId) = when (id) { MarkerId.OM -> recvOm; MarkerId.MM -> recvMm; MarkerId.IM -> recvIm }
    }

    /** JS Math.round for the banner text (floor(x + 0.5)). */
    fun jsRound(x: Double): Long = floor(x + 0.5).toLong()

    /** TS fmt: Math.round(n).toLocaleString("en-US"). */
    fun fmt(n: Double): String {
        val r = jsRound(n)
        val s = abs(r).toString().reversed().chunked(3).joinToString(",").reversed()
        return if (r < 0) "-$s" else s
    }

    fun lerp(a: Double, b: Double, k: Double) = a + (b - a) * max(0.0, min(1.0, k))

    /** TS mod: always non-negative. */
    fun mod(n: Double, m: Double) = ((n % m) + m) % m

    /** TS title in the section header. */
    fun title(v: View): String = when {
        v.mode == Mode.APPROACH -> "ILS final"
        v.mode == Mode.ROLLOUT -> "landing roll"
        v.mode == Mode.TAKEOFF -> "takeoff"
        v.phase == Phase.CLIMB -> "climb"
        v.phase == Phase.CRUISE -> "cruise"
        v.phase == Phase.DESCENT -> "descent"
        else -> "airborne"
    }

    /** The banner chips that are drawn amber (V1 / ROTATE / POSITIVE RATE / TOUCHDOWN). */
    fun bannerIsAmber(b: String) = b.startsWith("V1") || b.startsWith("ROTATE") || b.startsWith("POSITIVE") || b == "TOUCHDOWN"

    /** Flight-path angle shown in the "PITCH x° · PATH y°" caption. */
    fun pathDeg(vsFpm: Double, casKt: Double): Double =
        asin(max(-0.3, min(0.3, vsFpm / 60 / max(60.0, casKt * 1.688)))) * 180 / PI

    /**
     * The mutable machine behind the web `st` ref. [step] reproduces the body of the rAF loop (50 ms throttle included) and returns the new
     * [View], or null when the tick was skipped by the throttle. [markerKeyed] is injected so tests do not depend on the clock.
     */
    class RunwaySceneModel(
        private val markerKeyed: (MarkerId, Double) -> Boolean = MarkerBeacons::markerKeyed,
    ) {
        var mode = Mode.TAKEOFF; private set
        var xFt = 400.0; private set
        var agl = 0.0; private set
        var pitch = 0.0; private set
        var gear = 1.0; private set
        private var groundAlt = 0.0
        private var last = 0.0
        private var vrAt = 0.0
        private var v1At = 0.0
        private var gearUpAt = 0.0
        private var tdAt = 0.0
        private var prevGear = "DN"
        private var prevAlt = 0.0
        private var vs = 0.0
        var fromRoll = false; private set
        var zoom = ZOOM_WIDE; private set
        private var spin = 0.0
        private var spinRate = 0.0

        fun step(i: Inputs, nowMs: Double): View? {
            if (nowMs - last < 50) return null
            val dt = if (last != 0.0) min(1.5, (nowMs - last) / 1000) else 0.05
            last = nowMs
            val wow = i.wow
            val alt = i.altFt
            val cas = i.casKt
            val gs = max(0.0, i.gsKt)
            val crs = RadioNav.RWY_CRS * PI / 180
            val along = i.sitX * sin(crs) + i.sitY * cos(crs) // NM past the RPLL 06 threshold
            val dist = -along
            if (wow) groundAlt = alt
            val aglNow = max(0.0, alt - groundAlt)
            val onIls = i.navOn && i.navTuned == "ILS" && i.navSceneIsRpll06 && i.sitFlying
            val phase = i.phase

            /* mode machine */
            val prev = mode
            if (!wow && onIls && dist > -0.4 && dist < 14) mode = Mode.APPROACH
            else if (wow && (prev == Mode.APPROACH || prev == Mode.ROLLOUT || phase == Phase.LAND || phase == Phase.ROLLOUT)) {
                if (prev != Mode.ROLLOUT) { mode = Mode.ROLLOUT; xFt = max(0.0, along * NM_FT) + 600; tdAt = nowMs }
            } else if (wow) {
                if (prev != Mode.TAKEOFF) { mode = Mode.TAKEOFF; xFt = 400.0; fromRoll = false; vs = 0.0 }
            } else {
                if (prev == Mode.TAKEOFF) fromRoll = true // lifted off from this runway
                if (prev == Mode.ROLLOUT) fromRoll = false // go-around
                mode = Mode.FLIGHT
            }

            /* distance flown = integral of the simulated ground speed (cruise uses true speed, so the sky really moves) */
            when (mode) {
                Mode.TAKEOFF -> if (phase == Phase.READY || phase == Phase.NO_PLAN) xFt = 400.0 else xFt += gs * KT_FPS * dt
                Mode.ROLLOUT -> xFt += gs * KT_FPS * dt
                Mode.FLIGHT -> xFt += max(gs, cas) * KT_FPS * dt
                Mode.APPROACH -> {}
            }

            /* One continuous attitude with a limited pitch rate (rotation ~3 deg/s), so nothing snaps or swings back at lift-off. */
            val climbOut = !wow && fromRoll && (phase == Phase.TAKEOFF || phase == Phase.CLIMB) && aglNow < 3000
            val pitchGoal: Double = if (wow) {
                if (mode == Mode.TAKEOFF && gs >= FlightPhases.VR_KT) 7.0 else 0.0
            } else if (climbOut) {
                val vsCmd = max(0.0, i.vsCmdFpm)
                val gammaDeg = asin(min(0.3, vsCmd / 60 / max(60.0, cas * 1.688))) * 180 / PI
                val aoaDeg = max(1.5, min(10.0, 2.5 + (250 - cas) / 25))
                max(7.0, min(15.0, gammaDeg + aoaDeg))
            } else max(-6.0, min(15.0, i.attPitchDeg))
            val pitchRate = if (pitchGoal > pitch) 1.6 else 1.2 // deg/s nose up / nose down
            pitch += max(-pitchRate * dt, min(pitchRate * dt, pitchGoal - pitch))
            /* wheel spin: follows ground speed on the runway, then runs down after lift-off until the gear retracts */
            val onGround = wow || aglNow < 3
            val spinTarget = if (onGround) gs * 5 else 0.0
            spinRate += (spinTarget - spinRate) * min(1.0, dt * (if (onGround) 8.0 else 0.7))
            spin = (spin + spinRate * dt) % 360
            agl += (aglNow - agl) * min(1.0, dt * 6)
            val gearTarget = if (i.gearLever == "DN") 1.0 else 0.0
            gear += sign(gearTarget - gear) * min(abs(gearTarget - gear), dt * 0.6)
            if (!wow) { val inst = ((alt - prevAlt) / max(dt, 0.02)) * 60; vs += (inst - vs) * min(1.0, dt * 1.5) } else vs = 0.0
            prevAlt = alt

            /* event banners */
            if (mode == Mode.TAKEOFF && wow && gs >= FlightPhases.V1_KT && v1At == 0.0) v1At = nowMs
            if (mode == Mode.TAKEOFF && wow && gs >= FlightPhases.VR_KT && vrAt == 0.0) vrAt = nowMs
            if (wow && gs < 5) { v1At = 0.0; vrAt = 0.0; gearUpAt = 0.0 }
            if (mode == Mode.FLIGHT && prevGear == "DN" && i.gearLever != "DN") gearUpAt = nowMs
            prevGear = i.gearLever
            val vsTxt = "${if (vs >= 0) "+" else "−"}${fmt(abs(vs))} FPM"
            val banner = when (mode) {
                Mode.TAKEOFF -> when {
                    v1At != 0.0 && nowMs - v1At < 3500 && vrAt == 0.0 -> "V1 ${jsRound(FlightPhases.V1_KT)}"
                    vrAt != 0.0 && nowMs - vrAt < 4500 -> "ROTATE · VR ${jsRound(FlightPhases.VR_KT)}"
                    wow && gs < 1 -> if (phase == Phase.READY) "LINED UP · PRESS TAKEOFF" else "ON THE RUNWAY"
                    else -> "TAKEOFF ROLL · ${jsRound(gs)} KT"
                }
                Mode.FLIGHT ->
                    if (gearUpAt != 0.0 && nowMs - gearUpAt < 4000) "POSITIVE RATE · GEAR UP"
                    else "${if (phase == Phase.NO_PLAN || phase == Phase.READY) "AIRBORNE" else phase.label} · ${fmt(alt)} FT · ${jsRound(cas)} KT · $vsTxt"
                Mode.APPROACH ->
                    if (dist > 10) "FINAL · ${"%.1f".format(java.util.Locale.ROOT, dist)} NM · G/S SIGNAL FROM 10 NM"
                    else "ILS · ${"%.1f".format(java.util.Locale.ROOT, dist)} NM · ${jsRound(aglNow)} FT"
                Mode.ROLLOUT ->
                    if (nowMs - tdAt < 3000) "TOUCHDOWN" else if (gs > 1) "ROLLOUT · ${jsRound(gs)} KT" else "STOPPED"
            }

            /* Zoom: on the runway we zoom in ~3.5x so ground speed is visibly in proportion; once airborne the view eases back out. */
            val zoomTarget = if (mode == Mode.TAKEOFF || mode == Mode.ROLLOUT || (mode == Mode.FLIGHT && fromRoll)) ZOOM_ROLL else ZOOM_WIDE
            zoom += (zoomTarget - zoom) * min(1.0, dt * 2.5)

            val now = nowMs / 1000
            return View(
                mode = mode, xFt = xFt, dist = dist, agl = agl, pitch = pitch, gear = gear, gs = gs, cas = cas, flaps = i.flaps, flapPos = i.flapPos,
                spin = spin, phase = phase, banner = banner, alt = alt, vsFpm = vs, fromRoll = fromRoll, zoom = zoom,
                recvOm = i.markerOm, recvMm = i.markerMm, recvIm = i.markerIm,
                keyedOm = i.markerOm && markerKeyed(MarkerId.OM, now), keyedMm = i.markerMm && markerKeyed(MarkerId.MM, now),
                keyedIm = i.markerIm && markerKeyed(MarkerId.IM, now), flying = !wow,
            )
        }
    }
}
