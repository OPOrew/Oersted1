package com.oersted.trainer.sim

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/**
 * Pure logic of components/panel/PitotStaticDiagram.tsx (PitotStaticSchematic): probe state, line colours and flow modes,
 * the miniature ASI / altimeter / VSI needle and fault flag, and the flag chip colours. The Compose view draws from these.
 * Colours are the web's hex values (GREEN, BLUE, AMBER, RED, ICE, GREY).
 */
object PitotSchematicRules {
    const val GREEN = 0xFF3DD68CL
    const val BLUE = 0xFF5AA9FFL
    const val AMBER = 0xFFE0A84AL
    const val RED = 0xFFE24B4BL
    const val ICE = 0xFFBFE8FFL
    const val GREY = 0xFF4A5560L

    enum class PState { OK, COVER, BLOCKED, ICE }
    enum class Flow { NONE, FAST, SLOW }

    fun pState(cover: Boolean, blocked: Boolean, iced: Boolean): PState =
        if (cover) PState.COVER else if (blocked) PState.BLOCKED else if (iced) PState.ICE else PState.OK

    /** Pitot line and probe-centre colour. */
    fun pitotColor(st: PState): Long = if (st == PState.OK) GREEN else if (st == PState.ICE) ICE else RED

    /** Pitot line flows only with a healthy probe and ram air (psFlightCasKt > 0). */
    fun pitotFlow(st: PState, ram: Boolean): Flow = if (st == PState.OK && ram) Flow.FAST else Flow.NONE

    fun mainColor(a: Boolean, b: Boolean, alt: Boolean): Long = if (alt) GREY else if (a && b) RED else BLUE
    fun portColor(blocked: Boolean, alt: Boolean): Long = if (alt) GREY else if (blocked) RED else BLUE
    fun outColor(alt: Boolean, trapped: Boolean): Long = if (alt) AMBER else if (trapped) RED else BLUE

    /** A side's static line is trapped when both normal ports are blocked and NORMAL is selected. */
    fun trapped(portL: Boolean, portR: Boolean, alt: Boolean): Boolean = portL && portR && !alt

    /** Static port line flow: slow while the port is open and NORMAL is selected. */
    fun portFlow(blocked: Boolean, alt: Boolean): Flow = if (!blocked && !alt) Flow.SLOW else Flow.NONE

    /** Valve output flow: slow unless trapped. */
    fun outFlow(trapped: Boolean): Flow = if (!trapped) Flow.SLOW else Flow.NONE

    /** Air data as the instruments show it: zero IAS / altitude / VSI without DC power. */
    fun shown(a: PitotStatic.SideAirData, dc: Boolean): PitotStatic.SideAirData = if (dc) a else a.copy(iasKt = 0.0, altFt = 0.0, vsiFpm = 0.0)

    enum class Kind { ASI, ALT, VSI }

    /** A miniature gauge: needle angle in degrees (SVG convention, 0 = +x, clockwise), readout text, and whether it shows a FLAG. */
    data class Mini(val angleDeg: Double, val readout: String, val fault: Boolean)

    private fun jsRound(v: Double): Long = Math.floor(v + 0.5).toLong()

    fun mini(kind: Kind, data: PitotStatic.SideAirData): Mini = when (kind) {
        Kind.ASI -> Mini(135 + 270 * (min(320.0, max(0.0, data.iasKt)) / 320), "${jsRound(data.iasKt)} KT", !data.pitotOk || !data.staticOk)
        Kind.ALT -> {
            val a = max(-1000.0, data.altFt)
            Mini(-90 + (((a % 1000) + 1000) % 1000) * 0.36, "${PitotStaticRules.groupedRound(a)} FT", !data.staticOk)
        }
        Kind.VSI -> Mini(180 + (min(4000.0, max(-4000.0, data.vsiFpm)) / 4000) * 150, "${if (data.vsiFpm > 0) "+" else ""}${jsRound(data.vsiFpm)}", !data.staticOk)
    }

    /** Tick angles (degrees) of the 10 dial ticks: altimeter every 36 from -90, the others every 30 from 135. */
    fun tickAngles(kind: Kind): List<Double> = List(10) { i -> if (kind == Kind.ALT) -90.0 + i * 36 else 135.0 + i * 30 }

    fun rad(deg: Double): Double = deg * PI / 180

    /** Needle tip offset from the dial centre for radius R - 6 (R = 24). */
    fun needleTip(angleDeg: Double, r: Double = 24.0): Pair<Double, Double> = Pair(cos(rad(angleDeg)) * (r - 6), sin(rad(angleDeg)) * (r - 6))

    /** Flag chips under each cluster: NORMAL when there are none; ALT STATIC / ONE PORT BLOCKED are amber, the rest red, all green when normal. */
    data class FlagChip(val text: String, val color: Long, val width: Double)

    fun flagChips(flags: List<String>): List<FlagChip> {
        val list = if (flags.isEmpty()) listOf("NORMAL") else flags
        val bad = flags.isNotEmpty()
        return list.map { f ->
            val caution = f == "ALT STATIC" || f == "ONE PORT BLOCKED"
            FlagChip(f, if (!bad) GREEN else if (caution) AMBER else RED, f.length * 4.6 + 12)
        }
    }
}
