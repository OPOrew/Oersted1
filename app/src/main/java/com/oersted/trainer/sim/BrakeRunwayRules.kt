package com.oersted.trainer.sim

import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/**
 * Pure rules behind the live landing / rollout trainer (components/panel/BrakeRunwayTrainer.tsx): wheel status, hints,
 * pedal ramps, scene geometry helpers and the scenario start / reset state patches. Physics stays in StepPart3 (derive.ts).
 */
object BrakeRunwayRules {
    val KEYS = listOf("li", "lo", "ri", "ro")

    // scene scale (web constants)
    const val W = 400.0
    const val H = 440.0
    const val CX = 200.0
    const val AC_Y = 320.0
    const val SX = 5.0 // px per metre across the runway
    const val SY = 3.2 // px per metre along the runway
    const val K = 0.36 // aircraft icon scale
    const val PIVOT_Y = 180.0 // icon y of the main gear
    val WHEEL_X = mapOf("lo" to -47.0, "li" to -36.0, "ri" to 36.0, "ro" to 47.0)

    fun clamp(v: Double, a: Double, b: Double): Double = min(b, max(a, v))

    /** web approachF: move v toward t by at most step. */
    fun approachF(v: Double, t: Double, step: Double): Double = if (v < t) min(t, v + step) else max(t, v - step)

    private fun jsRound(x: Double): Long = floor(x + 0.5).toLong()

    fun wheelSpeed(s: SimState, k: String): Double = when (k) { "li" -> s.wheelSpeeds.li; "lo" -> s.wheelSpeeds.lo; "ri" -> s.wheelSpeeds.ri; else -> s.wheelSpeeds.ro }
    fun brakePsi(s: SimState, k: String): Double = when (k) { "li" -> s.wheelBrakePressures.li; "lo" -> s.wheelBrakePressures.lo; "ri" -> s.wheelBrakePressures.ri; else -> s.wheelBrakePressures.ro }
    fun wear(s: SimState, k: String): Double = when (k) { "li" -> s.tireWear.li; "lo" -> s.tireWear.lo; "ri" -> s.tireWear.ri; else -> s.tireWear.ro }

    /** web slip(k). */
    fun slip(s: SimState, k: String): Double {
        val gs = s.groundSpeedKt
        return if (gs > 8 && s.wow) max(0.0, 1 - wheelSpeed(s, k) / gs) else 0.0
    }

    /** web status(k): label, tone ("subtle" / "warn" / "caution" / "ok") and hot level (0..3). */
    data class WheelStatus(val text: String, val tone: String, val hot: Int)

    fun status(s: SimState, d: Derived, k: String): WheelStatus {
        val gs = s.groundSpeedKt
        val p = brakePsi(s, k)
        val sl = slip(s, k)
        if (!s.wow || s.rwyPhase == "IDLE") return WheelStatus("—", "subtle", 0)
        if (gs > 20 && sl > 0.5 && p > 150) return WheelStatus("SKID", "warn", 3)
        if (gs > 8 && sl > 0.5) return WheelStatus("SPIN-UP", "subtle", 0)
        if (sl > 0.12 && p > 100 && d.antiskidOperational) return WheelStatus("A/S MOD", "caution", 2)
        if (p > 100) return WheelStatus("BRAKING", "ok", 1)
        return WheelStatus("ROLLING", "subtle", 0)
    }

    fun isLive(phase: String) = phase == "APPROACH" || phase == "ROLLOUT" || phase == "OVERRUN"
    fun isRolling(phase: String) = phase == "ROLLOUT" || phase == "OVERRUN"

    /** web veering. */
    fun veering(s: SimState): Boolean = isRolling(s.rwyPhase) && s.groundSpeedKt > 3 && (abs(s.rwyHdgDeg) > 2.5 || abs(s.rwyLatM) > 4)
    fun veerDir(hdg: Double): String = if (hdg < -0.8) "LEFT" else if (hdg > 0.8) "RIGHT" else ""
    fun driftDir(lat: Double): String = if (lat < -1) "LEFT" else if (lat > 1) "RIGHT" else ""
    fun severe(s: SimState): Boolean = abs(s.rwyLatM) > 15 || abs(s.rwyHdgDeg) > 9
    /** Side to correct toward (web `fix`). */
    fun fix(s: SimState): String = if (s.rwyHdgDeg > 0 || (s.rwyHdgDeg == 0.0 && s.rwyLatM > 0)) "LEFT" else "RIGHT"

    /** web hints list, in order. */
    fun hints(s: SimState, d: Derived): List<String> {
        val out = mutableListOf<String>()
        val phase = s.rwyPhase
        val gs = s.groundSpeedKt
        val pedalV = max(s.leftBrakePedal, s.rightBrakePedal)
        val rolling = isRolling(phase)
        if (phase == "ROLLOUT" || phase == "APPROACH") {
            if (s.autobrake > 0 && (!s.antiskidInbd || !s.antiskidOutbd)) out += "AUTOBRAKE unavailable — either antiskid channel OFF removes automatic braking."
            else if (s.autobrake > 0 && s.speedBrake != "ARMED" && phase == "APPROACH") out += "Autobrake needs the speedbrake ARMED to arm for landing."
            if (phase == "ROLLOUT" && s.autobrake == 0.0 && pedalV < 0.05 && gs > 30) out += "No braking applied — hold a TOE BRAKE or select an autobrake mode before touchdown."
            if (phase == "ROLLOUT" && !d.antiskidOperational && pedalV > 0.3 && gs > 30) out += "Antiskid OFF — nothing releases pressure, so wheels lock on a low-friction surface."
            if (phase == "ROLLOUT" && d.antiskidModulating && KEYS.any { slip(s, it) > 0.12 }) out += "Antiskid modulating: pressure is released on any wheel that slows relative to ground speed."
        }
        if (veering(s)) {
            val dir = veerDir(s.rwyHdgDeg).ifEmpty { driftDir(s.rwyLatM) }
            val fx = fix(s)
            out += "Veering $dir: less braking on the ${if (dir == "RIGHT") "left" else "right"} side. Apply $fx rudder (or $fx toe brake) to bring the nose back to the centreline."
        }
        if (s.rwyPatch != "NONE" && rolling && gs > 20) out += "Icy patch on the ${s.rwyPatch.lowercase()} half: those wheels skid, the other side keeps braking, so the aircraft pulls toward the ${if (s.rwyPatch == "LEFT") "right" else "left"}."
        if (KEYS.any { wear(s, it) > 0.9 }) out += "FLAT SPOT / TIRE BURST RISK — wheel skidded while locked."
        if (rolling && gs > 20 && gs < 60 && d.noseWheelSteeringAvailable) out += "Below ~60 kt the rudder loses effect — nose-wheel steering (pedals, ±7°) and toe brakes take over."
        return out
    }

    /** web bannerTone ("warn" / "ok" / "caution"). */
    fun bannerTone(s: SimState, d: Derived): String {
        val skidding = KEYS.any { status(s, d, it).text == "SKID" }
        return if (s.rwyPhase == "OVERRUN" || Regex("BEYOND|EXCURSION|OFF THE").containsMatchIn(s.rwyNote)) "warn"
        else if (s.rwyPhase == "STOPPED") "ok" else if (skidding) "warn" else "caution"
    }

    /** One 33 ms tick of the pedal ramp. Returns the new (rudderPedal, left, right) and the updated "owned" flags. */
    data class Hold(val pushL: Boolean = false, val pushR: Boolean = false, val toeL: Boolean = false, val toeR: Boolean = false)
    data class Own(val rud: Boolean = false, val l: Boolean = false, val r: Boolean = false)
    data class PedalTick(val rudder: Double, val left: Double, val right: Double, val own: Own)

    fun pedalTick(h: Hold, o: Own, rudder: Double, left: Double, right: Double, dt: Double): PedalTick {
        var rud = o.rud; var l = o.l; var r = o.r
        var nr = rudder; var nl = left; var nrt = right
        val tgt = (if (h.pushR) 1.0 else 0.0) - (if (h.pushL) 1.0 else 0.0)
        if (h.pushL || h.pushR) rud = true
        if (rud) {
            nr = approachF(rudder, tgt, (if (tgt != 0.0) 2.4 else 8.0) * dt)
            if (tgt == 0.0 && nr == 0.0) rud = false
        }
        if (h.toeL) l = true
        if (h.toeR) r = true
        if (l) {
            nl = approachF(left, if (h.toeL) 1.0 else 0.0, (if (h.toeL) 2.2 else 7.0) * dt)
            if (!h.toeL && nl == 0.0) l = false
        }
        if (r) {
            nrt = approachF(right, if (h.toeR) 1.0 else 0.0, (if (h.toeR) 2.2 else 7.0) * dt)
            if (!h.toeR && nrt == 0.0) r = false
        }
        return PedalTick(nr, nl, nrt, Own(rud, l, r))
    }

    /** web start(): state patch for a landing scenario. */
    fun start(s: SimState, runway: String? = null, patch: String? = null, autobrake: Int? = null, asOn: Boolean? = null): SimState {
        val c = s.copy()
        val ab = autobrake?.toDouble() ?: s.autobrake
        c.battery = true; c.gen1 = true; c.gen2 = true; c.bleed1 = true; c.bleed2 = true
        c.lever1 = true; c.lever2 = true; c.throttle1 = 0.0; c.throttle2 = 0.0
        c.n2_1 = 62.0; c.n2_2 = 62.0; c.n1_1 = 35.0; c.n1_2 = 35.0; c.start1 = "OFF"; c.start2 = "OFF"
        c.engHyd1 = true; c.engHyd2 = true; c.elecHyd1 = true; c.elecHyd2 = true
        c.hydAPress = 3000.0; c.hydBPress = 3000.0
        c.gear = "DN"; c.gearPos = 1.0; c.noseGearPos = 1.0; c.leftMainGearPos = 1.0; c.rightMainGearPos = 1.0
        c.parkingBrake = false; c.groundSenseTest = false; c.airborneTest = true; c.wow = false
        c.runway = runway ?: s.runway; c.rwyPatch = patch ?: s.rwyPatch
        c.autobrake = ab
        c.antiskidInbd = asOn ?: s.antiskidInbd; c.antiskidOutbd = asOn ?: s.antiskidOutbd
        c.speedBrake = if (ab > 0) "ARMED" else s.speedBrake
        c.autobrakeTestTimer = 0.0; c.autobrakeRtoArmed = false
        c.leftBrakePedal = 0.0; c.rightBrakePedal = 0.0; c.rudderPedal = 0.0; c.tiller = 0.0
        c.groundSpeedKt = 138.0; c.rwyPosM = -1800.0; c.rwyAltFt = 361.0; c.rwyPhase = "APPROACH"
        c.rwyLatM = 0.0; c.rwyHdgDeg = 0.0; c.rwyTrackDeg = 0.0; c.rwyYawRate = 0.0
        c.wheelSpeeds = SimStateWheelSpeeds(); c.wheelBrakePressures = SimStateWheelBrakePressures()
        c.actualDecel = 0.0; c.tireWear = SimStateTireWear(); c.rwyNote = "ON FINAL — 138 KT"
        c.timeScale = 1.0
        return c
    }

    /** web reset(). */
    fun reset(s: SimState): SimState {
        val c = s.copy()
        c.rwyPhase = "IDLE"; c.rwyPosM = -1800.0; c.rwyAltFt = 0.0; c.groundSpeedKt = 0.0; c.airborneTest = false; c.wow = true; c.parkingBrake = true
        c.wheelSpeeds = SimStateWheelSpeeds(); c.wheelBrakePressures = SimStateWheelBrakePressures()
        c.actualDecel = 0.0; c.tireWear = SimStateTireWear(); c.rwyNote = ""
        c.leftBrakePedal = 0.0; c.rightBrakePedal = 0.0; c.rudderPedal = 0.0
        c.rwyLatM = 0.0; c.rwyHdgDeg = 0.0; c.rwyTrackDeg = 0.0; c.rwyYawRate = 0.0
        return c
    }

    /** Readout text helpers (JS toFixed(0) / Math.round semantics). */
    fun rwyLeft(s: SimState): String = if (s.rwyPhase == "IDLE") "—" else "${max(0L, jsRound(RUNWAY_LENGTH_M - s.rwyPosM))} m"
    fun offsetText(s: SimState): String =
        if (isRolling(s.rwyPhase) || s.rwyPhase == "STOPPED") "${jsRound(abs(s.rwyLatM))} m ${if (s.rwyLatM < -0.5) "L" else if (s.rwyLatM > 0.5) "R" else ""}" else "—"
    fun hdgText(s: SimState): String =
        if (isRolling(s.rwyPhase)) "${jsRound(abs(s.rwyHdgDeg))}° ${if (s.rwyHdgDeg < -0.5) "L" else if (s.rwyHdgDeg > 0.5) "R" else ""}" else "—"
}
