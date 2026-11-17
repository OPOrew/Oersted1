package com.oersted.trainer.sim

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/**
 * Geometry and animation rules of EngineCutaway.tsx (animated JT8D cutaway of the Engine Start trainer). Pure.
 * The web builds SVG path strings; here the same numbers come back as plain arrays for the Canvas to draw:
 * a quad is `[x0,y0,x1,y1,x2,y2,x3,y3]`, a line is `[x1,y1,x2,y2]`, an ellipse is `[cx,cy,rx,ry]`.
 * Constants and comments follow the web file; the photo is res/drawable-nodpi/jt8d_cutaway.webp (public/engine/jt8d-cutaway.webp).
 */
object EngineCutawayRules {
    const val W = 1581.0
    const val H = 506.0
    const val TAU = PI * 2

    /** Oblique-view skew: x shift per unit radius at the near side of a ring. */
    const val SKEW = 0.055

    const val COMP_CY = 261.0
    const val TURB_CY = 275.0

    fun clamp01(v: Double): Double = max(0.0, min(1.0, v))

    /** Visual revolutions per second for a given N% (capped to avoid strobing). */
    fun visualRate(pct: Double): Double = if (pct < 0.5) 0.0 else min(0.6, 0.06 + pct * 0.0065)

    class Stage(
        val key: String,
        val spool: Int,
        val x: Double,
        val cy: Double,
        val R: Double,
        val h: Double,
        val c: Double,
        val beta: Double,
        val n: Int,
        val phase: Double,
    )

    val LPC_X = doubleArrayOf(264.0, 298.0, 331.0, 364.0)
    val HPC_X = doubleArrayOf(448.0, 476.0, 503.0, 529.0, 554.0, 578.0, 601.0)
    val TURB_X = doubleArrayOf(1008.0, 1050.0, 1090.0, 1130.0)

    val STAGES: List<Stage> =
        LPC_X.mapIndexed { i, x -> Stage("lpc$i", 1, x, COMP_CY, 80.0, 17.0 - i, 16.0, 38.0, 26, i * 0.37) } +
            HPC_X.mapIndexed { i, x -> Stage("hpc$i", 2, x, COMP_CY, 84.0, 13.0 - i * 0.6, 11.5 - i * 0.35, 42.0, 32 + i * 2, i * 0.29) } +
            listOf(
                Stage("hpt", 2, TURB_X[0], TURB_CY, 104.0, 17.0, 13.0, -34.0, 44, 0.2),
                Stage("lpt1", 1, TURB_X[1], TURB_CY, 106.0, 19.0, 14.0, -34.0, 44, 0.5),
                Stage("lpt2", 1, TURB_X[2], TURB_CY, 107.0, 21.0, 15.5, -34.0, 46, 0.1),
                Stage("lpt3", 1, TURB_X[3], TURB_CY, 108.0, 23.0, 17.0, -34.0, 48, 0.8),
            )

    /** Drum surfaces between stage rings (rotor bodies) with rotating key marks. */
    class Band(val key: String, val spool: Int, val xa: Double, val xb: Double, val cy: Double, val R: Double, val marks: Int, val turbine: Boolean = false)

    val BANDS: List<Band> = listOf(
        Band("lpcDrum", 1, 252.0, 381.0, COMP_CY, 80.0, 9),
        Band("slotRing", 2, 381.0, 434.0, COMP_CY, 88.0, 0),
        Band("hpcDrum", 2, 434.0, 620.0, COMP_CY, 84.0, 11),
        Band("hptDisc", 2, 1014.0, 1030.0, TURB_CY, 104.0, 0, true),
        Band("lptDisc1", 1, 1056.0, 1074.0, TURB_CY, 106.0, 0, true),
        Band("lptDisc2", 1, 1096.0, 1114.0, TURB_CY, 107.0, 0, true),
        Band("lptDisc3", 1, 1136.0, 1160.0, TURB_CY, 108.0, 0, true),
    )

    /** Outline (x, y pairs) of the near-half band between two rings, a curved cylinder strip (web bandPath). */
    fun bandPoints(b: Band): List<DoubleArray> {
        val pts = ArrayList<DoubleArray>()
        val steps = 14
        for (k in 0..steps) {
            val th = -PI / 2 + k * PI / steps
            pts.add(doubleArrayOf(b.xa + SKEW * b.R * cos(th), b.cy + b.R * sin(th)))
        }
        for (k in steps downTo 0) {
            val th = -PI / 2 + k * PI / steps
            pts.add(doubleArrayOf(b.xb + SKEW * b.R * cos(th), b.cy + b.R * sin(th)))
        }
        return pts
    }

    /** Ring (groove) line at axial x and radius R, near half only (web ringPath). */
    fun ringPoints(x: Double, cy: Double, R: Double): List<DoubleArray> =
        (0..16).map { k ->
            val th = -PI / 2 + k * PI / 16
            doubleArrayOf(x + SKEW * R * cos(th), cy + R * sin(th))
        }

    /** Rings drawn on the compressor (web RING_PATHS inputs: x, cy, R). */
    val RINGS: List<DoubleArray> =
        LPC_X.map { doubleArrayOf(it + 14, COMP_CY, 80.0) } +
            HPC_X.map { doubleArrayOf(it + 12, COMP_CY, 84.0) } +
            listOf(doubleArrayOf(381.0, COMP_CY, 88.0), doubleArrayOf(434.0, COMP_CY, 88.0))

    /** Blades of one stage at spool angle [phi]: far side, and near side bucketed by lighting (0 dark, 1 mid, 2 bright). */
    class Blades(val far: List<DoubleArray>, val near: List<List<DoubleArray>>)

    fun bladeQuads(st: Stage, phi: Double): Blades {
        val beta = st.beta * PI / 180
        val hc = st.c / 2
        val dxr = hc * cos(beta)
        val tr = hc * sin(beta)
        val R2 = st.R + st.h
        val far = ArrayList<DoubleArray>()
        val near = listOf(ArrayList<DoubleArray>(), ArrayList<DoubleArray>(), ArrayList<DoubleArray>())
        for (i in 0 until st.n) {
            val th = phi + st.phase + i * TAU / st.n
            val s = sin(th)
            val c = cos(th)
            val rx = st.x + SKEW * st.R * c
            val ry = st.cy + st.R * s
            val tx = st.x + SKEW * R2 * c
            val ty = st.cy + R2 * s
            val t = tr * c
            val q = doubleArrayOf(rx + dxr, ry + t, rx - dxr, ry - t, tx - dxr * 0.75, ty - t * 0.75, tx + dxr * 0.75, ty + t * 0.75)
            if (c <= 0) far.add(q) else {
                val l = 0.5 + 0.5 * cos(th + 0.9)
                near[if (l < 0.34) 0 else if (l < 0.68) 1 else 2].add(q)
            }
        }
        return Blades(far, near)
    }

    /** Rotating key marks (longitudinal lines) on a drum band (web keyPath). */
    fun keyLines(b: Band, phi: Double, lift: Double): List<DoubleArray> {
        val out = ArrayList<DoubleArray>()
        for (k in 0 until b.marks) {
            val th = phi + k * TAU / b.marks
            val c = cos(th)
            if (c < 0.12) continue
            val y = b.cy + b.R * sin(th) + lift
            out.add(doubleArrayOf(b.xa + SKEW * b.R * c, y, b.xb + SKEW * b.R * c, y))
        }
        return out
    }

    /** Slots on the mid compressor ring, foreshortened as they turn away (web slotPath): [cx, cy, rx, ry]. */
    fun slotEllipses(b: Band, phi: Double): List<DoubleArray> {
        val out = ArrayList<DoubleArray>()
        val k8 = 8
        val xm = (b.xa + b.xb) / 2
        val rx = 17.0
        for (k in 0 until k8) {
            val th = phi + k * TAU / k8
            val c = cos(th)
            if (c < 0.05) continue
            out.add(doubleArrayOf(xm + SKEW * b.R * c, b.cy + b.R * sin(th), rx, max(0.6, 3.6 * c)))
        }
        return out
    }

    // ───────────────────────── fan ─────────────────────────
    const val FAN_CX = 104.0
    const val FAN_CY = 240.0
    const val FAN_RX = 84.0
    const val FAN_RY = 190.0
    const val FAN_BLADES = 18

    /** Fan blade triangles `[0,0, x1,y1, x2,y2]` (web fanBlades). */
    fun fanTriangles(): List<DoubleArray> {
        val step = TAU / FAN_BLADES
        val w = step * 0.42
        return (0 until FAN_BLADES).map { i ->
            val a = i * step
            doubleArrayOf(0.0, 0.0, FAN_RY * cos(a), FAN_RY * sin(a), FAN_RY * cos(a + w), FAN_RY * sin(a + w))
        }
    }

    // ───────────────────────── live values ─────────────────────────
    /** web `heat` */
    fun heat(egt: Double): Double = clamp01((egt - 60) / 420)

    /** web `fanOpacity` */
    fun fanOpacity(n1: Double): Double = clamp01(n1 / 12) * 0.55

    /** web `plume` */
    fun plume(fuelOn: Boolean, running: Boolean, egt: Double): Double {
        val h = heat(egt)
        return if (fuelOn || running) clamp01(0.25 + h * 0.9) else clamp01(h * 0.6)
    }

    /** Burner glow opacity at time [nowMs]: heat with a flicker (web loop). */
    fun burnOpacity(egt: Double, nowMs: Double): Double {
        val flick = 0.9 + 0.1 * sin(nowMs / 47) * sin(nowMs / 131 + 1.3)
        return heat(egt) * flick
    }

    /** Igniter spark opacity: only while fuel is on and the engine is still cold (EGT < 200). */
    fun sparkOpacity(fuelOn: Boolean, egt: Double, nowMs: Double): Double =
        if (fuelOn && egt < 200) (if (sin(nowMs / 38) > 0.15) 0.95 else 0.15) else 0.0

    /** web aria-label of the cutaway. */
    fun description(side: Int, n1: Double, n2: Double, egt: Double, running: Boolean): String =
        "Engine $side cutaway: N1 ${Math.floor(n1 + 0.5).toLong()}%, N2 ${Math.floor(n2 + 0.5).toLong()}%, EGT ${Math.floor(egt + 0.5).toLong()} degrees C" +
            if (running) ", running" else ""

    /** The overlay tags: x, y (image px), label, and a value when there is one. */
    class Tag(val x: Double, val y: Double, val label: String, val value: String?, val tone: Int)

    /** Tone: 0 normal, 1 warn, 2 ok, 3 caution, 4 subtle. */
    fun tags(n1: Double, n2: Double, egt: Double, starterOn: Boolean, fuelOn: Boolean): List<Tag> {
        fun r(v: Double) = Math.floor(v + 0.5).toLong()
        return listOf(
            Tag(110.0, 30.0, "FAN", "N1 ${r(n1)}%", 0),
            Tag(320.0, 150.0, "LPC", null, 0),
            Tag(510.0, 150.0, "HPC", "N2 ${r(n2)}%", 0),
            Tag(830.0, 100.0, "BURNERS", "${r(egt)}°C", if (egt > 450) 1 else 0),
            Tag(1080.0, 120.0, "TURB", null, 0),
            Tag(410.0, 410.0, "STARTER", if (starterOn) "AIR ON" else "OFF", if (starterOn) 3 else 4),
            Tag(1335.0, 330.0, if (fuelOn) "FUEL / IGN" else "NO FUEL", null, if (fuelOn) 2 else 4),
        )
    }
}
