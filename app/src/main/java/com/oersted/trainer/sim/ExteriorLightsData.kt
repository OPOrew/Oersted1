package com.oersted.trainer.sim

import kotlin.math.hypot
import kotlin.math.max

/**
 * Data and pure logic of components/panel/ExteriorLightsDiagram.tsx: the marker tables of the four views (AMM 33-40-0 fig. 1),
 * the number -> name / note legend, the lens footprint per light type, the leader-line geometry, and the legend row status.
 * Marker x / y are pixels of the 1168 px wide base art; dx / dy place the number badge next to the marker.
 */
object ExteriorLightsData {
    data class Mk(val n: Int, val id: String, val x: Double, val y: Double, val dx: Double, val dy: Double, val hidden: Boolean = false)
    data class ViewDef(val key: String, val label: String, val w: Double, val h: Double, val marks: List<Mk>)
    data class Name(val name: String, val note: String)

    val COLORS: Map<String, Long> = mapOf("white" to 0xFFF6F1DFL, "red" to 0xFFFF4D4DL, "green" to 0xFF35E08CL, "amber" to 0xFFFFB340L)
    const val K = 1.35   // label offset scale (the offsets were drawn for a full-size image)

    val NAMES: Map<Int, Name> = mapOf(
        1 to Name("Upper anti-collision (beacon) light", "red, flashing"),
        2 to Name("Lower anti-collision (beacon) light", "red, flashing"),
        3 to Name("Wing tip position light, red", "left wing"),
        4 to Name("Wing tip position light, green", "right wing"),
        5 to Name("Wing tip strobe light", "white, L & R"),
        6 to Name("Wing tip tail light", "white, L & R, trailing edge"),
        7 to Name("Logo light", "L & R, if installed"),
        8 to Name("Tail strobe light", "white, tail cone"),
        9 to Name("Wing illumination light", "L & R, fuselage fwd of wing"),
        10 to Name("Runway turnoff light", "L & R, wing leading edge"),
        11 to Name("Inboard landing light", "L & R, wing leading edge"),
        12 to Name("Outboard landing light", "L & R, retractable, flap track"),
        13 to Name("Nose gear taxi light", "on nose gear strut"),
        14 to Name("Overwing emergency light", "L & R, over inboard wing"),
        15 to Name("Escape slide light", "L & R, fuselage by doors"),
    )

    private fun m(n: Int, id: String, x: Int, y: Int, dx: Int, dy: Int, hidden: Boolean = false) = Mk(n, id, x.toDouble(), y.toDouble(), dx.toDouble(), dy.toDouble(), hidden)

    val VIEW_ORDER = listOf("aerial", "side", "front", "rear")

    val VIEWS: Map<String, ViewDef> = mapOf(
        "aerial" to ViewDef("aerial", "Top", 1168.0, 728.0, listOf(
            m(1, "beacon-top", 583, 339, 14, -12), m(2, "beacon-bot", 583, 384, 16, 12, true),
            m(3, "pos-l", 253, 438, -12, 10), m(4, "pos-r", 913, 438, 12, 10),
            m(5, "strobe-l", 263, 429, -12, -8), m(5, "strobe-r", 903, 429, 12, -8),
            m(6, "pos-t", 284, 419, 2, -14), m(6, "pos-t", 882, 419, -2, -14),
            m(7, "logo", 274, 424, -4, -1), m(8, "strobe-t", 583, 679, 16, 0),
            m(9, "wing", 541, 242, -14, -4), m(9, "wing", 625, 242, 14, -4),
            m(10, "rwy-l", 527, 265, -14, -6), m(10, "rwy-r", 639, 265, 14, -6),
            m(11, "ldg-fix-l", 512, 275, -15, 6), m(11, "ldg-fix-r", 654, 275, 15, 6),
            m(12, "ldg-ret-l", 393, 402, -14, 8, true), m(12, "ldg-ret-r", 773, 402, 14, 8, true),
            m(14, "overwing-path-l", 520, 316, -14, 0), m(14, "overwing-path-r", 646, 316, 14, 0),
            m(15, "emer-exit", 544, 182, -14, 0), m(15, "emer-exit", 622, 182, 14, 0),
            m(15, "emer-exit", 546, 496, -14, 0), m(15, "emer-exit", 620, 496, 14, 0),
        )),
        "side" to ViewDef("side", "Side (L)", 1168.0, 562.0, listOf(
            m(1, "beacon-top", 600, 253, 0, -14), m(2, "beacon-bot", 668, 373, 14, 10, true),
            m(3, "pos-l", 934, 515, 14, -6), m(4, "pos-r", 203, 168, -14, -4),
            m(5, "strobe-l", 925, 505, -4, -15), m(5, "strobe-r", 214, 163, 10, -12),
            m(6, "pos-t", 905, 513, -6, 14), m(7, "logo", 893, 514, -14, 2), m(8, "strobe-t", 943, 257, 14, 4),
            m(9, "wing", 350, 372, -14, -4), m(10, "rwy-l", 408, 384, -14, 8), m(11, "ldg-fix-l", 428, 377, -12, -14),
            m(12, "ldg-ret-l", 800, 453, 14, 8, true), m(13, "taxi", 140, 397, -14, 8, true),
            m(14, "overwing-path-l", 590, 395, 0, -14),
            m(15, "emer-exit", 255, 357, 14, 12), m(15, "emer-exit", 830, 321, 14, -8),
        )),
        "front" to ViewDef("front", "Front", 1168.0, 447.0, listOf(
            m(1, "beacon-top", 583, 194, 16, -8), m(2, "beacon-bot", 583, 389, 16, 10, true),
            m(4, "pos-r", 40, 283, -14, 6), m(3, "pos-l", 1125, 284, 14, 6),
            m(5, "strobe-r", 48, 273, -12, -12), m(5, "strobe-l", 1117, 273, 12, -12),
            m(9, "wing", 503, 313, -14, -8), m(9, "wing", 664, 313, 14, -8),
            m(10, "rwy-r", 492, 338, -14, 12), m(10, "rwy-l", 674, 338, 14, 12),
            m(11, "ldg-fix-r", 476, 331, -16, -4), m(11, "ldg-fix-l", 690, 331, 16, -4),
            m(12, "ldg-ret-r", 218, 317, -17, -14, true), m(12, "ldg-ret-l", 944, 317, 17, -14, true),
            m(13, "taxi", 583, 364, -17, -2, true),
        )),
        "rear" to ViewDef("rear", "Rear", 1168.0, 605.0, listOf(
            m(1, "beacon-top", 583, 324, 16, -10), m(8, "strobe-t", 583, 350, 16, 2), m(2, "beacon-bot", 583, 526, 0, 18, true),
            m(6, "pos-t", 27, 431, -4, -14), m(6, "pos-t", 1138, 431, 4, -14),
            m(7, "logo", 38, 434, 4, 14), m(7, "logo", 1127, 433, -4, 14),
            m(15, "emer-exit", 505, 410, -14, 0), m(15, "emer-exit", 659, 410, 14, 0),
        )),
    )

    /** Lens footprint (image pixels) by light type. */
    data class Lens(val shape: String, val w: Double, val h: Double)
    fun lensFor(id: String): Lens =
        if (id.startsWith("beacon")) Lens("dome", 9.0, 6.0)
        else if (id.startsWith("ldg") || id.startsWith("rwy") || id == "taxi") Lens("rect", 11.0, 6.0)
        else if (id == "wing" || id == "logo") Lens("oval", 8.0, 5.0)
        else if (id.startsWith("overwing") || id == "emer-exit") Lens("oval", 5.0, 8.0)
        else Lens("round", 5.5, 5.5)

    /** Badge centre, leader start (lens edge + 2) and leader end (9 short of the badge). */
    data class Leader(val lx: Double, val ly: Double, val sx: Double, val sy: Double, val ex: Double, val ey: Double)
    fun leader(mk: Mk): Leader {
        val ln = lensFor(mk.id)
        val rx = ln.w / 2; val ry = ln.h / 2
        val lx = mk.x + mk.dx * K; val ly = mk.y + mk.dy * K
        val len = hypot(lx - mk.x, ly - mk.y).let { if (it == 0.0) 1.0 else it }
        val ux = (lx - mk.x) / len; val uy = (ly - mk.y) / len
        val reach = max(rx, ry) + 2
        return Leader(lx, ly, mk.x + ux * reach, mk.y + uy * reach, lx - ux * 9, ly - uy * 9)
    }

    /** One legend row per light number used in a view, ascending. */
    fun numbers(view: ViewDef): List<Int> = view.marks.map { it.n }.distinct().sorted()

    data class RowStatus(val ls: List<LightStatus>, val lit: Int, val reason: String?)
    fun rowStatus(view: ViewDef, n: Int, lights: List<LightStatus>): RowStatus {
        val ids = view.marks.filter { it.n == n }.map { it.id }.distinct()
        val ls = ids.mapNotNull { id -> lights.firstOrNull { it.id == id } }
        val lit = ls.count { it.lit }
        val reason = ls.firstOrNull { !it.lit && it.reason.isNotEmpty() && it.commanded > 0.02 }?.reason
        return RowStatus(ls, lit, reason)
    }

    /** Legend status text (web: reason || "OFF" when none lit, else "lit/total LIT", a percentage below 99 %, or "LIT"). */
    fun statusText(rs: RowStatus): String {
        val first = rs.ls.firstOrNull()
        return if (rs.lit == 0) (if (rs.reason.isNullOrEmpty()) "OFF" else rs.reason)
        else if (rs.ls.size > 1) "${rs.lit}/${rs.ls.size} LIT"
        else if (first != null && first.level < 0.99) "${Math.floor(first.level * 100 + 0.5).toLong()}%"
        else "LIT"
    }

    /** Dim-lit lens opacity of a lit lamp: 0.45 + 0.55 * level (glow); the lens spill radius is 10 + 20 * level. */
    fun glowAlpha(level: Double): Double = 0.45 + 0.55 * level
    fun glowRadius(level: Double): Double = 10 + 20 * level

    /**
     * Tap target: the web gives every marker a 16-unit transparent circle and the number badge (r 9.5) is part of the same group.
     * Later markers are drawn on top, so the last one hit wins. Returns the light number, or null.
     */
    fun hitNumber(view: ViewDef, x: Double, y: Double): Int? {
        for (mk in view.marks.asReversed()) {
            val l = leader(mk)
            if (hypot(x - mk.x, y - mk.y) <= 16.0 || hypot(x - l.lx, y - l.ly) <= 9.5) return mk.n
        }
        return null
    }
}
