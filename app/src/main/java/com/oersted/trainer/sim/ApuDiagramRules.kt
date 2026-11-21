package com.oersted.trainer.sim

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/**
 * Geometry and derived flags of components/panel/ApuDiagram.tsx (the animated APU cutaway). Coordinates are the ORIGINAL diagram's
 * pixel space (viewBox starts at 20,12, 975 x 622). Rotor blades are quads that sweep up / down across the axis as the spool turns;
 * a blade whose cos(theta) <= 0.02 is behind the hub and not drawn.
 */
object ApuDiagramRules {
    const val IMG_X = 20.0
    const val IMG_Y = 12.0
    const val IMG_W = 975.0
    const val IMG_H = 622.0
    const val AXIS_Y = 294.0
    const val TAU = PI * 2

    fun clamp01(v: Double) = max(0.0, min(1.0, v))

    /** Visual revolutions per second (capped so blades never strobe). */
    fun visualRate(pct: Double): Double = if (pct < 0.5) 0.0 else min(0.6, 0.05 + pct * 0.0065)

    class Rotor(val key: String, val x: Double, val R: Double, val h: Double, val c: Double, val beta: Double, val n: Int, val phase: Double, val fill: Long)

    /** Section-view rotors: load compressor, engine compressor, two turbine wheels. */
    val ROTORS = listOf(
        Rotor("lc", 468.0, 26.0, 52.0, 22.0, 28.0, 16, 0.1, 0xFFE9F3FB),
        Rotor("ec", 672.0, 30.0, 56.0, 26.0, 28.0, 16, 0.4, 0xFFE9F3FB),
        Rotor("t1", 753.0, 36.0, 48.0, 15.0, -30.0, 30, 0.2, 0xFFF4EFE6),
        Rotor("t2", 797.0, 36.0, 48.0, 15.0, -30.0, 32, 0.7, 0xFFF4EFE6),
    )

    /** One blade: four corners (x0,y0 .. x3,y3), drawn M p0 L p1 L p2 L p3 Z. */
    fun bladeQuads(r: Rotor, phi: Double): List<DoubleArray> {
        val beta = r.beta * PI / 180
        val hc = r.c / 2
        val dx = hc * cos(beta)
        val tr = hc * sin(beta)
        val r2 = r.R + r.h
        val out = ArrayList<DoubleArray>()
        for (i in 0 until r.n) {
            val th = phi + r.phase + i * TAU / r.n
            val c = cos(th)
            if (c <= 0.02) continue
            val s = sin(th)
            val ry = AXIS_Y + r.R * s
            val ty = AXIS_Y + r2 * s
            val t = tr * c
            out.add(doubleArrayOf(r.x + dx, ry + t, r.x - dx, ry - t, r.x - dx * 0.7, ty - t * 0.7, r.x + dx * 0.7, ty + t * 0.7))
        }
        return out
    }

    /** Shaft: y of the longitudinal key marks (each runs x 402 -> 880) that slide across its diameter as it turns. */
    fun shaftLines(phi: Double, lift: Double): List<Double> {
        val out = ArrayList<Double>()
        val R = 8.0
        for (k in 0 until 6) {
            val th = phi + k * TAU / 6
            if (cos(th) < 0.15) continue
            out.add(AXIS_Y + R * sin(th) + lift)
        }
        return out
    }

    /** Small gear / fan glyph: spoke end points at angle phi around (cx,cy). */
    fun spokes(cx: Double, cy: Double, r: Double, n: Int, phi: Double): List<DoubleArray> =
        List(n) { i -> val a = phi + i * TAU / n; doubleArrayOf(cx + r * cos(a), cy + r * sin(a)) }

    /** Flow paths: 4 numbers = line (x0 y0 x1 y1), 8 numbers = cubic (x0 y0 c1x c1y c2x c2y x1 y1). */
    val AIR_PATHS = listOf(
        doubleArrayOf(598.0, 418.0, 598.0, 350.0, 625.0, 306.0, 668.0, 298.0),   // plenum -> engine compressor eye
        doubleArrayOf(580.0, 418.0, 580.0, 350.0, 540.0, 306.0, 500.0, 298.0),   // plenum -> load compressor eye
        doubleArrayOf(692.0, 230.0, 700.0, 205.0, 708.0, 190.0, 730.0, 178.0),   // compressor discharge -> combustor (top)
        doubleArrayOf(692.0, 358.0, 700.0, 383.0, 708.0, 398.0, 730.0, 410.0),   // compressor discharge -> combustor (bottom)
    )
    val GAS_PATHS = listOf(
        doubleArrayOf(830.0, 236.0, 976.0, 232.0),                                  // turbine exhaust, upper
        doubleArrayOf(830.0, 352.0, 976.0, 356.0),                                  // turbine exhaust, lower
        doubleArrayOf(720.0, 178.0, 760.0, 165.0, 805.0, 175.0, 828.0, 215.0),     // combustor gas -> turbine (top)
        doubleArrayOf(720.0, 410.0, 760.0, 423.0, 805.0, 413.0, 828.0, 373.0),     // combustor gas -> turbine (bottom)
    )
    /** Fuel line polyline M106 334 L106 524 L705 524 L705 440. */
    val FUEL_PATH = doubleArrayOf(106.0, 334.0, 106.0, 524.0, 705.0, 524.0, 705.0, 440.0)

    val EXH_TOP = doubleArrayOf(811.0, 222.0, 977.0, 207.0, 977.0, 262.0, 900.0, 262.0, 811.0, 250.0)
    val EXH_BOT = doubleArrayOf(811.0, 362.0, 977.0, 377.0, 977.0, 322.0, 900.0, 322.0, 811.0, 334.0)
    /** HOT_REGION "M690 130 H990 V470 H690 Z" as left, top, right, bottom. */
    val HOT_REGION = doubleArrayOf(690.0, 130.0, 990.0, 470.0)

    const val GREEN = 0xFF2EA86AL
    const val AMBER = 0xFFF0A020L
    const val RED = 0xFFE5483AL

    /** Derived flags and colours the web computes at the top of the component. */
    class View(
        val heat: Double, val doorOpen: Boolean, val fuelOpen: Boolean, val fuelMoving: Boolean, val lightOff: Boolean,
        val airOn: Boolean, val gasOn: Boolean, val oil: Double, val doorTone: Long,
    )

    fun view(door: Double, fuel: Double, rpm: Double, egt: Double, oilPsi: Double, masterOff: Boolean, jam: Boolean): View {
        val heat = clamp01((egt - 60) / 260)
        val doorOpen = door > 0.98
        return View(
            heat = heat, doorOpen = doorOpen, fuelOpen = fuel > 0.95, fuelMoving = fuel > 0.02 && fuel <= 0.95,
            lightOff = !masterOff && rpm >= 25 && egt < 260, airOn = rpm > 0.5 && door > 0.5, gasOn = heat > 0.15,
            oil = clamp01(oilPsi / 100), doorTone = if (doorOpen) GREEN else if (jam) RED else AMBER,
        )
    }

    /** Louvre height for the 9 slats over the air-inlet plenum (0 or less than 0.6 = not drawn). */
    fun louvreHeight(door: Double) = 30 * (1 - door)
    fun louvreCentre(i: Int) = 141.0 + i * 35

    /** Combustor glow opacity: heat * flicker (flicker = 0.85 + 0.15 sin(t/53) sin(t/137 + 1.1), t in ms). */
    fun glowOpacity(heat: Double, nowMs: Double): Double = heat * (0.85 + 0.15 * sin(nowMs / 53) * sin(nowMs / 137 + 1.1))
}

/** Frame-by-frame animation state of the web's requestAnimationFrame loop. */
class ApuAnimState {
    var phi = 0.0; var gear = 0.0; var dash = 0.0; var flame = 0.0

    fun step(dt: Double, rpm: Double) {
        val rate = ApuDiagramRules.visualRate(rpm)
        val tau = ApuDiagramRules.TAU
        phi = (phi + rate * tau * dt) % tau
        gear = (gear - rate * tau * 1.6 * dt) % tau
        dash = (dash + (18 + rpm * 1.4) * (if (rpm > 0.5) 1 else 0) * dt) % 1000
        flame = (flame + (30 + rpm * 2.2) * dt) % 1000
    }
}
