package com.oersted.trainer.sim

import java.util.Locale
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin

/**
 * Pure parts of WxrScope in components/panel/PrimusWxr.tsx (Sperry Primus 90, AMM 34-41-01): mode field text, live / variable
 * flags, sweep period, target-alert test, noise specks, cell contour levels and the polar projection into the 200 x 150 view box.
 * The drawing is ui/pedestal/WxrScopeView.kt.
 */
object WxrScopeModel {
    val WXR_MODES = listOf("PUSH", "STBY", "WX", "CYC", "MAP")
    val WXR_RANGES = listOf("TEST", "10", "25", "50", "100", "200", "300")
    const val WARMUP_MS = 70_000.0
    const val CX = 100.0
    const val CY = 146.0
    const val R = 130.0

    /** web `pt`: the view-box point at radius [r] and [deg] clockwise from dead ahead. */
    fun pt(r: Double, deg: Double): Pair<Double, Double> = Pair(CX + r * sin(deg * PI / 180), CY - r * cos(deg * PI / 180))

    /** web `fmt` */
    fun fmt(v: Double): String = if (v == Math.floor(v) && !v.isInfinite()) v.toLong().toString() else String.format(Locale.ROOT, "%.1f", v)

    /** web warm flag: on once the radar has been out of PUSH for 70 s with power on. */
    fun warm(stbyAt: Double, nowMs: Double): Boolean = stbyAt != 0.0 && nowMs - stbyAt >= WARMUP_MS

    /** Range shown by the range marks: the TEST position (0) reads as 100 NM. */
    fun rangeNm(radarRange: Int): Double = if (radarRange == 0) 100.0 else WXR_RANGES[radarRange].toDouble()

    /** web sector half-angle: 40 with SEC SCAN, else 80. */
    fun halfAngle(sector: Boolean): Double = if (sector) 40.0 else 80.0

    /** web `inten` (whole-picture opacity). */
    fun intensity(radarInt: Double): Double = 0.35 + radarInt * 0.65

    /** web mode field: PUSH / WAIT / STBY override TEST (AMM 34-41-01). */
    fun field(mode: String, warm: Boolean, test: Boolean): String {
        var f = mode
        if (mode != "PUSH" && !warm) f = "WAIT"
        else if (mode == "STBY") f = "STBY"
        else if (test && mode != "PUSH") f = "TEST"
        return f
    }

    fun live(power: Boolean, warm: Boolean, mode: String): Boolean = power && warm && (mode == "WX" || mode == "CYC" || mode == "MAP")

    fun variable(gain: Double, mode: String, test: Boolean): Boolean = gain > 0.02 && (mode == "WX" || mode == "MAP") && !test

    /** web sweep period in seconds. */
    fun period(sector: Boolean): Double = if (sector) 2.1 else 4.3

    /** Bearing of a point (nm frame) relative to the heading, -180..180 (web `rel`). */
    fun rel(dx: Double, dy: Double, hdg: Double): Double = ((atan2(dx, dy) * 180 / PI - hdg + 540) % 360) - 180

    /** Contour levels shown (0 = none, 1 green, 2 yellow, 3 red) for a beam factor [f] (web thresholds). */
    fun shown(f: Double): Int = if (f > 0.85) 3 else if (f > 0.55) 2 else if (f > 0.2) 1 else 0

    /** web target alert: a red-level target 75-150 NM, within 15 degrees of dead ahead (not in MAP). */
    fun targetHit(live: Boolean, tgt: Boolean, map: Boolean, cells: List<WxrWorld.WxCell>, nav: WxrWorld.WxrNav, tilt: Double, altFt: Double): Boolean {
        if (!(live && tgt && !map)) return false
        return cells.any { c ->
            val dx = c.x - nav.x
            val dy = c.y - nav.y
            val rng = hypot(dx, dy)
            val rl = rel(dx, dy, nav.hdg)
            rng >= 75 && rng <= 150 && abs(rl) <= 15 && WxrWorld.beamFactor(rng, tilt, altFt) > 0.85
        }
    }

    /** web noise specks as (azimuth, radius) before the drawing scale; only those inside the sector. */
    fun noise(h: Double, map: Boolean, gain: Double): List<Pair<Double, Double>> =
        (0 until 70).map { i ->
            val a = ((i * 137.5) % 160) - 80
            val r = 4 + ((i * 53) % 100) / 100.0 * (if (map) 26 else 10) * (1 + gain * 2)
            Pair(a, r)
        }.filter { abs(it.first) <= h }

    /** One storm cell ready to draw: centre in the view box, outer radii, rotation and contour levels. */
    data class CellDraw(val px: Double, val py: Double, val rx: Double, val ry: Double, val rot: Double, val shown: Int)

    /** web cell loop: skips cells beyond 1.3 x range or not seen by the tilted beam. */
    fun cellDraws(cells: List<WxrWorld.WxCell>, nav: WxrWorld.WxrNav, rangeNm: Double, tilt: Double, altFt: Double, gain: Double, mode: String): List<CellDraw> =
        cells.mapNotNull { c ->
            val dx = c.x - nav.x
            val dy = c.y - nav.y
            val rng = hypot(dx, dy)
            if (rng > rangeNm * 1.3) return@mapNotNull null
            val f = WxrWorld.beamFactor(rng, tilt, altFt) * (1 + (if (mode == "WX") gain * 0.4 else 0.0))
            val s = shown(f)
            if (s == 0) return@mapNotNull null
            val p = pt((rng / rangeNm) * R, rel(dx, dy, nav.hdg))
            val rr = (c.r / rangeNm) * R
            CellDraw(p.first, p.second, rr * c.asp, rr / c.asp, c.ang - nav.hdg, s)
        }

    /** web MAP projection of a ground point (coast vertex or city). */
    fun mapPoint(x: Double, y: Double, nav: WxrWorld.WxrNav, rangeNm: Double): Pair<Double, Double> {
        val dx = x - nav.x
        val dy = y - nav.y
        return pt((hypot(dx, dy) / rangeNm) * R, rel(dx, dy, nav.hdg))
    }

    /** web level colours (ARGB hex without alpha): WX / CYC green, yellow, red; MAP cyan, yellow, magenta. */
    fun levelColors(map: Boolean): List<Long> = if (map) listOf(0x35D0E0, 0xF2D84A, 0xE040C8) else listOf(0x3DDC84, 0xF2D84A, 0xFF3B30)
}
