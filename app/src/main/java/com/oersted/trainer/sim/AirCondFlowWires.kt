package com.oersted.trainer.sim

import com.oersted.trainer.sim.FlowWires.Pt
import com.oersted.trainer.sim.FlowWires.Rect
import com.oersted.trainer.sim.FlowWires.Tone
import com.oersted.trainer.sim.FlowWires.Wire
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * Port of the web's buildAirCondWires (AcFlags) and buildCabinWires (CpFlags) from routes/cockpit.tsx. Pure geometry over the
 * measured node rectangles; comments follow the web source.
 */
object AirCondFlowWires {
    data class Flags(
        val lFlow: Boolean, val rFlow: Boolean, val lTf: Boolean, val rTf: Boolean, val lPurge: Boolean, val rPurge: Boolean,
        val lHot: Boolean, val rHot: Boolean, val lMix: Double, val rMix: Double, val lMan: Boolean, val rMan: Boolean,
        val lF35: Boolean, val rF35: Boolean, val lSens: Boolean, val rSens: Boolean, val any: Boolean,
    )

    fun wires(geo: Map<String, Rect>, f: Flags): List<Wire> {
        // Hydraulics-style routing: exclusive vertical spines + short horizontal taps.
        // Parallel families never share an X column, so lines cannot overlap.
        val bd = FlowWires.Builder(geo)
        val N = bd::n

        /* ── Per-pack wiring ─────────────────────────────────────────────────────────
           Pack layout is a fixed 3-column grid (see AcPackSection):
             MID column  = the bleed/cold-air chain, top → bottom, every hop is a straight vertical wire between vertically adjacent nodes.
             HOT column  = outer side of the pack (L pack: left, R pack: right): hot-air duct, 35°F valve, 35°F sensor, hot check valve.
             COOL column = inner side (L pack: right, R pack: left): purge valve, ram-air exhaust (tall node beside the two heat
                           exchangers), turbofan, turbofan valve.
           Rules that keep lines from overlapping:
             • same-row links are one straight horizontal between facing edges
             • same-column links are one straight vertical between facing edges (the cells in between are empty, so nothing is crossed)
             • the only two "lane" wires (man → turbofan valve, hot duct → hot check valve) run in their own outside lane, one per
               side, never shared with another wire. */
        fun side(k: String, flow: Boolean, tfOn: Boolean, hotActive: Boolean, manLive: Boolean, f35On: Boolean, sensOn: Boolean, purgeOn: Boolean) {
            fun g(n: String) = N("ac$k-$n")
            val man = g("man"); val cln = g("cln"); val purge = g("purge"); val pv = g("pv")
            val hot = g("hot"); val phx = g("phx"); val ram = g("ram"); val acm = g("acm"); val shx = g("shx")
            val turb = g("turb"); val tf = g("tf"); val sep = g("sep"); val tfv = g("tfv"); val f35 = g("f35")
            val bag = g("bag"); val sens = g("f35s"); val cchk = g("cchk"); val mix = g("mix"); val hchk = g("hchk"); val out = g("out")
            val left = k == "l"

            /** straight vertical between two nodes in the same column (edge to facing edge). */
            fun vl(tone: Tone, act: Boolean, a: Rect?, b: Rect?) {
                if (a == null || b == null) return
                val down = b.cy > a.cy
                bd.add(tone, act, listOf(Pt(a.cx, if (down) a.b else a.t), Pt(a.cx, if (down) b.t else b.b)))
            }
            /** straight horizontal between two nodes; y lets a tall node (ram) be met at a heat-exchanger's row. */
            fun hl(tone: Tone, act: Boolean, a: Rect?, b: Rect?, y: Double? = null) {
                if (a == null || b == null) return
                val ltr = b.cx > a.cx
                val yy = y ?: a.cy
                bd.add(tone, act, listOf(Pt(if (ltr) a.r else a.l, yy), Pt(if (ltr) b.l else b.r, y ?: b.cy)))
            }

            val nodes = listOfNotNull(man, cln, purge, pv, hot, phx, ram, acm, shx, turb, tf, sep, tfv, f35, bag, sens, cchk, mix, hchk, out)
            if (nodes.isEmpty()) return
            val packL = nodes.minOf { it.l }
            val packR = nodes.maxOf { it.r }
            // outside edge of the HOT column / COOL column for this pack
            fun hotEdge(n: Rect) = if (left) n.l else n.r
            fun coolEdge(n: Rect) = if (left) n.r else n.l
            val xHotLane = if (left) packL - 10 else packR + 10
            val xCoolLane = if (left) packR + 10 else packL - 10

            // ── Bleed inlet: manifold → air cleaner → pack valve ──
            vl(Tone.GROUND, manLive, man, cln)
            vl(Tone.GROUND, manLive, cln, pv)
            // Air cleaner purge: cleaner → purge valve (same row) → ram-air exhaust (straight down)
            hl(Tone.STANDBY, purgeOn, cln, purge)
            vl(Tone.GROUND, purgeOn, purge, ram)

            // ── COLD chain (all straight verticals): pv → phx → acm → shx → turb → sep → coalescer → cold check → mix → out ──
            val cold = listOf(pv, phx, acm, shx, turb, sep, bag, cchk, mix, out)
            for (i in 0 until cold.size - 1) vl(Tone.GROUND, flow, cold[i], cold[i + 1])

            // ── HOT branch: pv → hot duct (same row) → hot check valve (own lane) → mix valve (same row) ──
            hl(Tone.STANDBY, hotActive, pv, hot)
            if (hot != null && hchk != null) {
                val y1 = hot.cy + 4
                bd.add(Tone.STANDBY, hotActive, listOf(Pt(hotEdge(hot), y1), Pt(xHotLane, y1), Pt(xHotLane, hchk.cy), Pt(hotEdge(hchk), hchk.cy)))
            }
            hl(Tone.STANDBY, hotActive, hchk, mix)

            // ── 35°F system: hot duct → 35°F valve (straight down the HOT column) → separator intake (same row);
            //    sensor at separator discharge (coalescer row) → 35°F valve ──
            vl(Tone.STANDBY, f35On, hot, f35)
            hl(Tone.STANDBY, f35On, f35, sep)
            hl(Tone.STANDBY, sensOn, bag, sens)
            vl(Tone.STANDBY, sensOn, sens, f35)

            // ── Cooling-air family: manifold → turbofan valve (own lane) → turbofan → ram exhaust;
            //    primary + secondary HX cooling air exit into the tall ram-air exhaust node on their own rows ──
            if (man != null && tfv != null) {
                bd.add(Tone.STANDBY, tfOn, listOf(Pt(coolEdge(man), man.cy), Pt(xCoolLane, man.cy), Pt(xCoolLane, tfv.cy), Pt(coolEdge(tfv), tfv.cy)))
            }
            vl(Tone.STANDBY, tfOn, tfv, tf)
            vl(Tone.GROUND, tfOn, tf, ram)
            if (phx != null && ram != null) hl(Tone.GROUND, flow, phx, ram, phx.cy)
            if (shx != null && ram != null) hl(Tone.GROUND, flow, shx, ram, shx.cy)
        }

        side("l", f.lFlow, f.lTf, f.lHot, f.lMan, f.lF35, f.lSens, f.lPurge)
        side("r", f.rFlow, f.rTf, f.rHot, f.rMan, f.rF35, f.rSens, f.rPurge)

        // ── Distribution: every hop is a straight vertical drop between full-width / half-width rows ──
        val lout = N("acl-out"); val rout = N("acr-out")
        val lcold = N("ac-lcold"); val rcold = N("ac-rcold"); val lhotD = N("ac-lhot"); val rhotD = N("ac-rhot")
        val mf = N("ac-mixf"); val mp = N("ac-mixp"); val chamber = N("ac-chamber"); val main = N("ac-maindist")
        val df = N("ac-distf"); val dp = N("ac-distp")
        val cab = N("ac-cabin")
        fun clamp(x: Double, lo: Double, hi: Double) = max(lo, min(hi, x))
        /** Vertical drop from a's bottom edge to b's top edge at x (clamped inside both nodes; jogs only if it must). */
        fun drop(tone: Tone, act: Boolean, a: Rect?, b: Rect?, x: Double) {
            if (a == null || b == null) return
            val x1 = clamp(x, a.l + 6, a.r - 6)
            val x2 = clamp(x, b.l + 6, b.r - 6)
            if (abs(x1 - x2) < 0.5) bd.add(tone, act, listOf(Pt(x1, a.b), Pt(x1, b.t)))
            else { val y = (a.b + b.t) / 2; bd.add(tone, act, listOf(Pt(x1, a.b), Pt(x1, y), Pt(x2, y), Pt(x2, b.t))) }
        }

        // Pack outlet (cold, mixed-air side) drops straight into the cold-air node under it.
        drop(Tone.GROUND, f.lFlow, lout, lcold, lcold?.cx ?: 0.0)
        drop(Tone.GROUND, f.rFlow, rout, rcold, rcold?.cx ?: 0.0)

        // Hot duct (outer side of each pack) leaves its outer edge into an outer rail and enters the hot-bypass node's outer edge.
        fun hotFeed(act: Boolean, hot: Rect?, to: Rect?, xRail: Double, outerLeft: Boolean) {
            if (hot == null || to == null) return
            val y0 = hot.cy - 4
            bd.add(Tone.STANDBY, act, listOf(Pt(if (outerLeft) hot.l else hot.r, y0), Pt(xRail, y0), Pt(xRail, to.cy), Pt(if (outerLeft) to.l else to.r, to.cy)))
        }
        val lhotN = N("acl-hot"); val rhotN = N("acr-hot")
        if (lhotN != null) hotFeed(f.lHot, lhotN, lhotD, lhotN.l - 26, true)
        if (rhotN != null) hotFeed(f.rHot, rhotN, rhotD, rhotN.r + 26, false)

        // Cold + hot → mix valve (two separate drops), mix valves → one mixing chamber → main manifold → ducts → cabin.
        drop(Tone.GROUND, f.lFlow, lcold, mf, lcold?.cx ?: 0.0)
        drop(Tone.STANDBY, f.lHot, lhotD, mf, lhotD?.cx ?: 0.0)
        drop(Tone.GROUND, f.rFlow, rcold, mp, rcold?.cx ?: 0.0)
        drop(Tone.STANDBY, f.rHot, rhotD, mp, rhotD?.cx ?: 0.0)
        drop(Tone.GROUND, f.any, mf, chamber, mf?.cx ?: 0.0)
        drop(Tone.GROUND, f.any, mp, chamber, mp?.cx ?: 0.0)
        drop(Tone.GROUND, f.any, chamber, main, main?.cx ?: 0.0)
        drop(Tone.GROUND, f.any, main, df, df?.cx ?: 0.0)
        drop(Tone.GROUND, f.any, main, dp, dp?.cx ?: 0.0)
        drop(Tone.GROUND, f.any, df, cab, df?.cx ?: 0.0)
        drop(Tone.GROUND, f.any, dp, cab, dp?.cx ?: 0.0)
        return bd.wires
    }
}

object CabinFlowWires {
    data class Flags(val inflow: Boolean, val outOpen: Boolean, val relOpen: Boolean, val ctlOn: Boolean)

    fun wires(geo: Map<String, Rect>, f: Flags): List<Wire> {
        val bd = FlowWires.Builder(geo)
        val N = bd::n
        fun drop(tone: Tone, act: Boolean, a: Rect?, b: Rect?, x: Double? = null) {
            if (a != null && b != null) { val xx = x ?: a.cx; bd.add(tone, act, listOf(Pt(xx, a.b), Pt(xx, b.t))) }
        }
        val inn = N("cp-in"); val cab = N("cp-cab"); val ctl = N("cp-ctl"); val out = N("cp-out"); val rel = N("cp-rel"); val ind = N("cp-ind"); val ovb = N("cp-ovb")
        drop(Tone.GROUND, f.inflow, inn, cab)                        // pack air in
        drop(Tone.STANDBY, f.ctlOn, cab, ctl, ctl?.cx)               // cabin pressure sensed by the controller
        drop(Tone.GROUND, f.outOpen, cab, out, out?.cx)              // controlled outflow
        drop(Tone.GROUND, f.relOpen, cab, rel, rel?.cx)              // backup relief (only when over limit)
        if (ctl != null && out != null) bd.add(Tone.STANDBY, f.ctlOn, listOf(Pt(ctl.r, ctl.cy), Pt(out.l, out.cy)))   // controller drives the outflow valve motor
        drop(Tone.STANDBY, f.ctlOn, ctl, ind)                        // controller → P5-6 indications
        drop(Tone.GROUND, f.outOpen, out, ovb, out?.cx)
        drop(Tone.GROUND, f.relOpen, rel, ovb, rel?.cx)
        return bd.wires
    }
}
