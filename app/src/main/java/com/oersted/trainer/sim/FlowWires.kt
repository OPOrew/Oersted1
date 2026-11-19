package com.oersted.trainer.sim

import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sign

/**
 * Port of the web's wire layer and hydraulic wire router (routes/cockpit.tsx: HydTone / HydRect / HydWire / hydArrowHead /
 * buildHydraulicWires / hydPathD). Pure geometry: the UI measures node rectangles (the web's `data-hyd` ids) and this turns them
 * into orthogonal wires. Comments follow the web source.
 */
object FlowWires {
    enum class Tone { A, B, STANDBY, GROUND }

    data class Rect(val l: Double, val r: Double, val t: Double, val b: Double) {
        val cx: Double get() = l + (r - l) / 2
        val cy: Double get() = t + (b - t) / 2
    }

    data class Pt(val x: Double, val y: Double)
    data class Wire(val tone: Tone, val active: Boolean, val pts: List<Pt>, val arrow: Boolean, val dots: List<Pt>)

    data class HydFlags(
        val aLive: Boolean, val bLive: Boolean, val stbyLive: Boolean,
        val bleed1On: Boolean, val bleed2On: Boolean, val resAir: Boolean, val groundAirLive: Boolean,
        val groundServiceLive: Boolean, val groundPowerHydLive: Boolean, val interconnectActual: Boolean,
        val aP1: Boolean, val aP2: Boolean, val bP1: Boolean, val bP2: Boolean, val stbyPump: Boolean, val parkingBrakeSet: Boolean,
    )

    private fun p(x: Double, y: Double) = Pt(x, y)

    /** web hydArrowHead: triangle at the last non-degenerate segment end (three points), or null. */
    fun arrowHead(pts: List<Pt>, size: Double = 4.5): List<Pt>? {
        var i = pts.size - 1
        while (i > 0 && abs(pts[i].x - pts[i - 1].x) < 0.01 && abs(pts[i].y - pts[i - 1].y) < 0.01) i--
        if (i <= 0) return null
        val (x, y) = pts[i]
        val (px, py) = pts[i - 1]
        val len = hypot(x - px, y - py).let { if (it == 0.0) 1.0 else it }
        val ux = (x - px) / len
        val uy = (y - py) / len
        val bx = x - ux * size
        val by = y - uy * size
        val nx = -uy * size * 0.65
        val ny = ux * size * 0.65
        return listOf(Pt(x, y), Pt(bx + nx, by + ny), Pt(bx - nx, by - ny))
    }

    /** Builder helpers shared by the system routers. */
    class Builder(private val geo: Map<String, Rect>) {
        val wires = mutableListOf<Wire>()
        fun n(id: String): Rect? = geo[id]
        fun add(tone: Tone, active: Boolean, pts: List<Pt>?, arrow: Boolean = true, dots: List<Pt> = emptyList()) {
            if (pts != null && pts.size > 1) wires.add(Wire(tone, active, pts, arrow, dots))
        }
        fun vv(a: Rect?, b: Rect?, ym: Double? = null): List<Pt>? {
            if (a == null || b == null) return null
            if (abs(a.cx - b.cx) < 2) return listOf(p(a.cx, a.b), p(a.cx, b.t))
            val y = ym ?: ((a.b + b.t) / 2)
            return listOf(p(a.cx, a.b), p(a.cx, y), p(b.cx, y), p(b.cx, b.t))
        }
        fun hh(a: Rect?, b: Rect?): List<Pt>? {
            if (a == null || b == null) return null
            val rtl = b.cx < a.cx
            val x1 = if (rtl) a.l else a.r
            val x2 = if (rtl) b.r else b.l
            if (abs(a.cy - b.cy) < 2) return listOf(p(x1, a.cy), p(x2, b.cy))
            val xm = (x1 + x2) / 2
            return listOf(p(x1, a.cy), p(xm, a.cy), p(xm, b.cy), p(x2, b.cy))
        }
        /** straight drop from bottom of a to top of b at column x (x lies inside both nodes' widths) */
        fun drop(tone: Tone, live: Boolean, a: Rect, b: Rect, x: Double) = add(tone, live, listOf(p(x, a.b), p(x, b.t)))
    }

    /**
     * Pure wire router. Rules: every segment runs in a clear channel (gap between rows, section side padding, or the inter-column
     * gutter) and never through a node. Lanes: L1/R1 = user return rails, +15 = heat-exchanger return to reservoir.
     */
    fun hydraulic(geo: Map<String, Rect>, f: HydFlags): List<Wire> {
        val bd = Builder(geo)
        val N = bd::n

        // ── Reservoir pressurization air (top box) ──
        run {
            val b1 = N("air-b1"); val b2 = N("air-b2"); val fil = N("air-filter"); val reg = N("air-reg"); val man = N("air-man")
            val relief = N("air-relief"); val bal = N("air-bal"); val cart = N("air-cart")
            if (b1 != null && b2 != null && fil != null && reg != null && man != null && relief != null && bal != null) {
                val gap = man.t - reg.b
                val busY = reg.b + gap * 0.28
                val yReg = reg.b + gap * 0.66
                bd.add(Tone.GROUND, f.bleed1On, listOf(p(b1.cx, b1.b), p(b1.cx, busY), p(fil.cx, busY), p(fil.cx, fil.b)), dots = listOf(p(b2.cx, busY)))
                bd.add(Tone.GROUND, f.bleed2On, listOf(p(b2.cx, b2.b), p(b2.cx, busY)), arrow = false)
                bd.add(Tone.GROUND, f.resAir, bd.hh(fil, reg))
                bd.add(Tone.GROUND, f.resAir, listOf(p(reg.cx, reg.b), p(reg.cx, yReg), p(man.cx, yReg), p(man.cx, man.t)))
                bd.add(Tone.GROUND, f.resAir, bd.hh(man, relief))   // relief sits beside the manifold
                bd.add(Tone.GROUND, f.resAir, bd.vv(man, bal))      // balance port directly below the manifold
                bd.add(Tone.GROUND, f.groundAirLive, bd.hh(cart, man))   // ground air cart → pressurization manifold (alternate to ground N2)
            }
        }

        // ── A / B / Standby circuits ──
        fun usersOf(k: String): List<Rect> {
            val out = mutableListOf<Rect>()
            var i = 0
            while (true) { val r = N("$k-u$i") ?: break; out.add(r); i++ }
            return out
        }

        fun circuit(k: String, tone: Tone, live: Boolean) {
            val res = N("$k-res"); val mod = N("$k-mod"); val grp = N("$k-users")
            if (res == null || mod == null || grp == null) return
            val rf = N("$k-rf"); val hx = N("$k-hx"); val sret = N("s-return")
            val ret = if (k == "s") sret else rf

            // 1) Supply: reservoir → (shutoff) → pump → (filter) → module; short straight drops only.
            val chains: List<List<String>> = when (k) {
                "a" -> listOf(1, 2).map { i -> listOf("a-fs$i", "a-p$i", "a-pf$i") }
                "b" -> listOf(1, 2).map { i -> listOf("b-p$i") }
                else -> listOf(listOf("s-pump"))
            }
            // Each supply branch is lit by its OWN pump (not by whole-system pressure).
            val chainLive = when (k) { "a" -> listOf(f.aP1, f.aP2); "b" -> listOf(f.bP1, f.bP2); else -> listOf(f.stbyPump) }
            chains.forEachIndexed { ci, ids ->
                val ns = ids.map { N(it) }
                if (ns.any { it == null }) return@forEachIndexed
                val r = ns.filterNotNull()
                val cl = chainLive.getOrElse(ci) { live }
                bd.drop(tone, cl, res, r[0], r[0].cx)
                for (j in 1 until r.size) bd.drop(tone, cl, r[j - 1], r[j], r[j].cx)
                bd.drop(tone, cl, r.last(), mod, r.last().cx)
            }

            // 2) Module → users: supply spine in the centre gutter, taps stop at the chip's inner edge.
            val rects = usersOf(k)
            if (rects.isEmpty()) return
            val lefts = rects.filter { it.cx < grp.cx }
            val rights = rects.filter { it.cx >= grp.cx }
            val spineX = if (lefts.isNotEmpty() && rights.isNotEmpty()) (lefts.maxOf { it.r } + rights.minOf { it.l }) / 2 else grp.cx
            val lastY = rects.maxOf { it.cy }
            val entryY = (mod.b + grp.t) / 2
            bd.add(tone, live, listOf(p(mod.cx, mod.b), p(mod.cx, entryY), p(spineX, entryY), p(spineX, lastY)), arrow = false, dots = rects.map { p(spineX, it.cy) })
            rects.forEach { r -> bd.add(tone, live, listOf(p(spineX, r.cy), p(if (r.cx < spineX) r.r else r.l, r.cy))) }

            // 3) User return: rails run in the side padding, OUTSIDE the chips' outer edges.
            val L1 = grp.l - 7
            val R1 = grp.r + 7
            val singleRow = rects.maxOf { it.cy } - rects.minOf { it.cy } < 4
            if (ret != null) {
                if (k == "s" && singleRow) {
                    rects.forEach { r -> bd.drop(tone, live, r, ret, r.cx) }
                } else {
                    val busY = (grp.b + ret.t) / 2
                    rects.forEach { r ->
                        val left = r.cx < grp.cx
                        bd.add(tone, live, listOf(p(if (left) r.l else r.r, r.cy), p(if (left) L1 else R1, r.cy)), arrow = false)
                    }
                    if (lefts.isNotEmpty()) bd.add(tone, live, listOf(p(L1, lefts.minOf { it.cy }), p(L1, busY), p(ret.cx, busY), p(ret.cx, ret.t)), dots = listOf(p(ret.cx, busY)))
                    if (rights.isNotEmpty()) bd.add(tone, live, listOf(p(R1, rights.minOf { it.cy }), p(R1, busY), p(ret.cx, busY)), arrow = false)
                }
            }

            // 4) Return to reservoir — through the side lanes, never through the stack.
            val yRight = res.t + (res.b - res.t) * 0.72
            if (k == "a" && rf != null && hx != null) {
                // AMM 29: main return goes users → return filter → reservoir (filter sits immediately upstream of the reservoir).
                val Lr = grp.l - 15
                bd.add(tone, live, listOf(p(rf.l, rf.cy), p(Lr, rf.cy), p(Lr, res.cy), p(res.l, res.cy)))
                // Case-drain cooling is a separate branch: each EDP case drain → No. 1 tank heat exchanger → reservoir.
                val p1 = N("a-p1"); val p2 = N("a-p2")
                if (p1 != null && p2 != null) {
                    val Lc = grp.l - 23; val Rc = grp.r + 23; val Ro = grp.r + 15; val yBelow = hx.b + 9
                    bd.add(tone, f.aP1, listOf(p(p1.l, p1.cy), p(Lc, p1.cy), p(Lc, yBelow), p(hx.cx, yBelow), p(hx.cx, hx.b)), dots = listOf(p(hx.cx, yBelow)))
                    bd.add(tone, f.aP2, listOf(p(p2.r, p2.cy), p(Rc, p2.cy), p(Rc, yBelow), p(hx.cx, yBelow)), arrow = false)
                    bd.add(tone, f.aP1 || f.aP2, listOf(p(hx.r, hx.cy), p(Ro, hx.cy), p(Ro, yRight), p(res.r, yRight)))
                }
            }
            if (k == "b" && rf != null && hx != null) {
                bd.add(tone, live, bd.hh(rf, hx))
                val RrX = grp.r + 15
                bd.add(tone, live, listOf(p(hx.r, hx.cy), p(RrX, hx.cy), p(RrX, res.cy), p(res.r, res.cy)))
            }
            if (k == "s" && sret != null) {
                val x = grp.l - 10
                bd.add(tone, live, listOf(p(sret.l, sret.cy), p(x, sret.cy), p(x, res.cy), p(res.l, res.cy)))
            }
        }
        circuit("a", Tone.A, f.aLive)
        circuit("b", Tone.B, f.bLive)
        circuit("s", Tone.STANDBY, f.stbyLive)

        // ── Gutter trunks: air on xa, servicing fluid on xf = xa + 14 ──
        // Air stubs enter each reservoir at 20% height, fluid at 40%. The fluid trunk only rises to the 40% line,
        // so the only wire crossing in the gutter is fluid→A over the air trunk (drawn as a hop).
        run {
            val bal = N("air-bal"); val secA = N("a-sec"); val secB = N("b-sec")
            val aRes = N("a-res"); val bRes = N("b-res"); val sRes = N("s-res")
            val fill = N("g-fill"); val pump = N("g-pump"); val pfp = N("g-pfp"); val filt = N("g-filt"); val gbal = N("g-bal")
            bd.add(Tone.STANDBY, f.groundServiceLive, bd.vv(fill, pump))
            if (pump != null && filt != null) bd.drop(Tone.STANDBY, f.groundServiceLive, pump, filt, pump.cx)   // hand pump → filter
            if (pfp != null && filt != null) bd.drop(Tone.STANDBY, f.groundServiceLive, pfp, filt, pfp.cx)      // pressure-fill port → filter
            bd.add(Tone.STANDBY, f.groundServiceLive, bd.vv(filt, gbal))
            if (secA != null && secB != null && aRes != null && bRes != null && sRes != null) {
                val gx0 = (secA.r + secB.l) / 2
                val xa = gx0 - 8
                val xf = gx0 + 1
                fun at(r: Rect, pc: Double) = r.t + (r.b - r.t) * pc
                if (bal != null) {
                    val y0 = bal.b + 10
                    val lastAir = at(sRes, 0.2)
                    bd.add(Tone.GROUND, f.resAir, listOf(p(bal.cx, bal.b), p(bal.cx, y0), p(xa, y0), p(xa, lastAir)), arrow = false, dots = listOf(p(xa, at(aRes, 0.2)), p(xa, lastAir)))
                    bd.add(Tone.GROUND, f.resAir, listOf(p(xa, at(aRes, 0.2)), p(aRes.r, at(aRes, 0.2))))
                    bd.add(Tone.GROUND, f.resAir, listOf(p(xa, at(bRes, 0.2)), p(bRes.l, at(bRes, 0.2))))
                    bd.add(Tone.GROUND, f.resAir, listOf(p(xa, lastAir), p(sRes.r, lastAir)))
                }
                if (gbal != null) {
                    val top = at(aRes, 0.4)
                    bd.add(Tone.STANDBY, f.groundServiceLive, listOf(p(gbal.l, gbal.cy), p(xf, gbal.cy), p(xf, top)), arrow = false, dots = listOf(p(xf, at(sRes, 0.4)), p(xf, top)))
                    bd.add(Tone.STANDBY, f.groundServiceLive, listOf(p(xf, at(aRes, 0.4)), p(aRes.r, at(aRes, 0.4))))
                    bd.add(Tone.STANDBY, f.groundServiceLive, listOf(p(xf, at(bRes, 0.4)), p(bRes.l, at(bRes, 0.4))))
                    bd.add(Tone.STANDBY, f.groundServiceLive, listOf(p(xf, at(sRes, 0.4)), p(sRes.r, at(sRes, 0.4))))
                }
            }
        }

        // ── Ground power + A/B interconnect: wired to the actual B and A modules through the gap between the columns ──
        run {
            val ext = N("i-ext"); val gp = N("i-gp"); val giv = N("i-valve"); val park = N("i-park")
            val aMod = N("a-mod"); val bMod = N("b-mod"); val bRf = N("b-rf"); val secA = N("a-sec"); val secB = N("b-sec")
            bd.add(Tone.GROUND, f.groundPowerHydLive, bd.hh(ext, gp))
            if (park != null && giv != null) bd.add(Tone.GROUND, f.parkingBrakeSet, bd.hh(park, giv))   // parking-brake relay interlock (control)
            if (gp != null && giv != null && aMod != null && bMod != null && secA != null && secB != null) {
                val gx = (secA.r + secB.l) / 2
                val xP = gx - 26; val xR = gx - 17; val xB = gx + 10; val xG = gx + 19
                // Ground power modular unit pressure → System B module.
                bd.add(Tone.GROUND, f.groundPowerHydLive, listOf(p(xP, gp.t), p(xP, bMod.cy - 6), p(bMod.l, bMod.cy - 6)))
                // System B return line → ground power unit return port.
                if (bRf != null) bd.add(Tone.GROUND, f.groundPowerHydLive, listOf(p(bRf.l, bRf.cy), p(xR, bRf.cy), p(xR, gp.t)))
                // B module pressure → ground interconnect valve, then (through its internal check valve, B → A only) → System A module.
                bd.add(Tone.GROUND, f.interconnectActual, listOf(p(bMod.l, bMod.cy + 6), p(xB, bMod.cy + 6), p(xB, giv.t)))
                bd.add(Tone.GROUND, f.interconnectActual, listOf(p(xG, giv.t), p(xG, aMod.cy), p(aMod.r, aMod.cy)))
            }
        }
        return bd.wires
    }

    /** One drawing command of a wire path (web hydPathD output, parsed). */
    sealed class Cmd {
        data class Move(val x: Double, val y: Double) : Cmd()
        data class Line(val x: Double, val y: Double) : Cmd()
        /** Semicircular hop of radius [r] ending at (x, y); [dir] > 0 travels left→right (hops upward either way). */
        data class Hop(val x: Double, val y: Double, val r: Double, val dir: Int) : Cmd()
    }

    /** web hydPathD: horizontal runs hop over other wires' vertical runs so crossings never read as junctions. */
    fun pathCmds(pts: List<Pt>, others: List<List<Pt>>): List<Cmd> {
        val R = 3.0
        data class V(val x: Double, val ya: Double, val yb: Double)
        val verts = mutableListOf<V>()
        for (o in others) for (i in 1 until o.size) {
            val (x1, y1) = o[i - 1]; val (x2, y2) = o[i]
            if (abs(x1 - x2) < 0.01 && abs(y1 - y2) > 0.01) verts.add(V(x1, min(y1, y2), max(y1, y2)))
        }
        val out = mutableListOf<Cmd>(Cmd.Move(pts[0].x, pts[0].y))
        for (i in 1 until pts.size) {
            val (x1, y1) = pts[i - 1]; val (x2, y2) = pts[i]
            if (abs(y1 - y2) < 0.01 && abs(x1 - x2) > 2 * R + 4) {
                val dir = sign(x2 - x1)
                val xs = verts.filter { v -> y1 > v.ya + 1.5 && y1 < v.yb - 1.5 && (v.x - x1) * dir > R + 2 && (x2 - v.x) * dir > R + 2 }
                    .map { it.x }.sortedWith { a, b -> (a - b).times(dir).compareTo(0.0) }
                var last = -1e9
                for (x in xs) {
                    if (abs(x - last) < 2 * R + 2) continue
                    last = x
                    out.add(Cmd.Line(x - dir * R, y1))
                    out.add(Cmd.Hop(x + dir * R, y1, R, if (dir > 0) 1 else -1))
                }
            }
            out.add(Cmd.Line(x2, y2))
        }
        return out
    }
}
