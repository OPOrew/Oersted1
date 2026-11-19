package com.oersted.trainer.sim

import com.oersted.trainer.sim.FlowWires.Pt
import com.oersted.trainer.sim.FlowWires.Rect
import com.oersted.trainer.sim.FlowWires.Tone
import com.oersted.trainer.sim.FlowWires.Wire
import kotlin.math.abs

/**
 * Port of the web's buildPneumaticWires (routes/cockpit.tsx) and the PneuFlags shape. Pure geometry over measured node
 * rectangles; comments follow the web source.
 */
object PneumaticFlowWires {
    /** Web UI-only Pressure Ratio Bleed Control model: surge-bleed valves close above this N2 (cockpit.tsx PRV_CLOSE_N2). */
    const val PRV_CLOSE_N2 = 80.0

    data class Flags(
        val run1: Boolean, val run2: Boolean, val open1: Boolean, val open2: Boolean, val trip1: Boolean, val trip2: Boolean,
        val bleed13_1: Boolean, val bleed13_2: Boolean, val leftLive: Boolean, val rightLive: Boolean, val isoOpen: Boolean,
        val apuOn: Boolean, val groundOn: Boolean, val packL: Boolean, val packR: Boolean,
        val turn1: Boolean, val turn2: Boolean, val prv1: Boolean, val prv2: Boolean, val ovr1: Boolean, val ovr2: Boolean,
    )

    fun wires(geo: Map<String, Rect>, f: Flags): List<Wire> {
        val bd = FlowWires.Builder(geo)
        val N = bd::n
        fun dropAt(tone: Tone, live: Boolean, a: Rect?, b: Rect?, x: Double? = null) {
            if (a != null && b != null) { val xx = x ?: a.cx; bd.add(tone, live, listOf(Pt(xx, a.b), Pt(xx, b.t))) }
        }
        val lm = N("pn-lm"); val rm = N("pn-rm"); val iso = N("pn-iso")

        // ── Engine bleed chains: 8th-stage main duct (+13th merge) → precooler → bleed valve; bypass duct → bleed valve ──
        for (k in listOf("1", "2")) {
            val tone = if (k == "1") Tone.A else Tone.B
            val run = if (k == "1") f.run1 else f.run2
            val open = if (k == "1") f.open1 else f.open2
            val trip = if (k == "1") f.trip1 else f.trip2
            val bleed13 = if (k == "1") f.bleed13_1 else f.bleed13_2
            val m8 = N("e$k-8m"); val s13 = N("e$k-13"); val b8 = N("e$k-8b"); val pre = N("e$k-pre"); val fan = N("e$k-fan")
            val ovh = N("e$k-ovh"); val valve = N("e$k-valve"); val ptx = N("e$k-ptx"); val tap = N("e$k-tap")
            val man = if (k == "1") lm else rm
            dropAt(tone, open, m8, pre, m8?.cx)
            dropAt(tone, bleed13, s13, pre, s13?.cx)
            if (fan != null && pre != null) bd.add(tone, run, listOf(Pt(fan.l, fan.cy), Pt(pre.r, pre.cy)))   // engine fan air through the precooler
            if (b8 != null && valve != null) {                                  // bypass duct skips the precooler and enters the bleed valve
                val rb = b8.r + 12
                bd.add(tone, open, listOf(Pt(b8.r, b8.cy), Pt(rb, b8.cy), Pt(rb, valve.cy), Pt(valve.r, valve.cy)))
            }
            if (pre != null && valve != null) { val x = (valve.l + pre.r) / 2; bd.add(tone, open, listOf(Pt(x, pre.b), Pt(x, valve.t))) }
            if (ovh != null && valve != null) bd.add(Tone.STANDBY, trip, listOf(Pt(ovh.r, ovh.cy), Pt(valve.l, valve.cy)))   // overheat switch closes the valve (control)
            dropAt(tone, open, valve, ptx, valve?.cx)
            if (ptx != null && tap != null) bd.add(tone, open, listOf(Pt(ptx.r, ptx.cy), Pt(tap.l, tap.cy)))               // reservoir-pressurization tap (upstream of the manifold)
            dropAt(tone, open, ptx, man, ptx?.cx)

            // Pressure Ratio Bleed Control (PRV): Pt2 / Ps3 sense → PRV → Ps4 air commands surge-bleed valves → dump to fan stream.
            // The starter valve's start-bleed override also drives the PRV during start.
            val turn = if (k == "1") f.turn1 else f.turn2
            val prv = if (k == "1") f.prv1 else f.prv2
            val ovr = if (k == "1") f.ovr1 else f.ovr2
            val sns = N("e$k-sns"); val pv = N("e$k-prv"); val srg = N("e$k-srg"); val ovn = N("e$k-ovr"); val dmp = N("e$k-dmp")
            fun hz(t: Tone, act: Boolean, a: Rect?, b: Rect?) {
                if (a == null || b == null) return
                if (abs(a.cy - b.cy) < 2) { bd.add(t, act, listOf(Pt(a.r, a.cy), Pt(b.l, b.cy))); return }
                val xm = (a.r + b.l) / 2
                bd.add(t, act, listOf(Pt(a.r, a.cy), Pt(xm, a.cy), Pt(xm, b.cy), Pt(b.l, b.cy)))
            }
            val cmp = N("e$k-cmp")
            if (cmp != null && sns != null) bd.add(tone, turn, listOf(Pt(sns.cx, cmp.t), Pt(sns.cx, sns.b)))   // engine compressor supplies the Pt2 / Ps3 signals
            hz(tone, turn, sns, pv)                                  // compressor pressure signals into the PRV
            hz(Tone.STANDBY, prv, pv, srg)                           // PRV command (Ps4 air) to the surge-bleed valves
            if (srg != null && dmp != null) bd.add(tone, prv, listOf(Pt(srg.cx, srg.b), Pt(srg.cx, dmp.t)))   // surge bleed dumps into the fan discharge
            if (ovn != null && pv != null) bd.add(Tone.STANDBY, ovr, listOf(Pt(pv.cx, ovn.t), Pt(pv.cx, pv.b)))   // start-bleed override from the starter valve
        }

        // ── Isolation valve between the manifolds (direction follows where the air actually originates) ──
        if (lm != null && rm != null && iso != null) {
            val y = iso.cy
            val leftLocal = f.open1 || f.apuOn
            val rightLocal = f.open2 || f.groundOn
            val cross = f.isoOpen && (leftLocal || rightLocal)
            val lr = cross && leftLocal && !rightLocal
            val rl = cross && rightLocal && !leftLocal
            val tone = if (lr) Tone.A else if (rl) (if (f.groundOn && !f.open2) Tone.GROUND else Tone.B) else Tone.GROUND
            if (lr) { bd.add(tone, true, listOf(Pt(lm.r, y), Pt(iso.l, y))); bd.add(tone, true, listOf(Pt(iso.r, y), Pt(rm.l, y))) }
            else if (rl) { bd.add(tone, true, listOf(Pt(rm.l, y), Pt(iso.r, y))); bd.add(tone, true, listOf(Pt(iso.l, y), Pt(lm.r, y))) }
            else { bd.add(tone, cross, listOf(Pt(lm.r, y), Pt(iso.l, y)), arrow = false); bd.add(tone, cross, listOf(Pt(iso.r, y), Pt(rm.l, y)), arrow = false) }
        }

        // ── Ground cart → connector + check valve (right pack bay) → RIGHT manifold only; APU → bleed valve → duct/relief → check valve → left manifold ──
        val gc = N("pn-gc"); val gk = N("pn-gk"); val av = N("pn-av"); val ad = N("pn-ad"); val ac = N("pn-ac")
        dropAt(Tone.GROUND, f.groundOn, gc, gk)
        if (gk != null && rm != null) bd.add(Tone.GROUND, f.groundOn, listOf(Pt(gk.r, gk.cy), Pt(rm.l, gk.cy)))
        dropAt(Tone.STANDBY, f.apuOn, av, ad)
        dropAt(Tone.STANDBY, f.apuOn, ad, ac)
        if (ac != null && lm != null) bd.add(Tone.STANDBY, f.apuOn, listOf(Pt(ac.l, ac.cy), Pt(lm.r, ac.cy)))

        // ── Manifold → users (supply spine in the centre gutter, taps to each chip); pack valve → pack → cabin inflow ──
        val cab = N("pn-cab")
        for (k in listOf("l", "r")) {
            val man = if (k == "l") lm else rm
            if (man == null) continue
            val tone = if (k == "l") Tone.A else Tone.B
            val live = if (k == "l") f.leftLive else f.rightLive
            val packLive = if (k == "l") f.packL else f.packR
            val chips = (0..5).map { N("u$k-$it") }
            if (chips.any { it == null }) continue
            val c = chips.filterNotNull()
            // Position order (row-major). left: START, ANTI-ICE, CLEANER, PACK VALVE, TURBOFAN, PACK; right: START, ANTI-ICE, PACK VALVE, CLEANER, PACK, TURBOFAN.
            val valveIdx = if (k == "l") 3 else 2
            val packIdx = if (k == "l") 5 else 4
            val taps = (0..5).filter { it != packIdx }.map { c[it] }
            val lefts = c.filterIndexed { i, _ -> i % 2 == 0 }
            val rights = c.filterIndexed { i, _ -> i % 2 == 1 }
            val spineX = (lefts.maxOf { it.r } + rights.minOf { it.l }) / 2
            val lastY = taps.maxOf { it.cy }
            bd.add(tone, live, listOf(Pt(spineX, man.b), Pt(spineX, lastY)), arrow = false, dots = taps.map { Pt(spineX, it.cy) })
            taps.forEach { r -> bd.add(tone, live, listOf(Pt(spineX, r.cy), Pt(if (r.cx < spineX) r.r else r.l, r.cy))) }
            dropAt(tone, packLive, c[valveIdx], c[packIdx], c[valveIdx].cx)
            if (cab != null) {
                val pk = c[packIdx]
                val fromX = if (k == "l") pk.r else pk.l
                val toX = if (k == "l") cab.l else cab.r
                val mx = (fromX + toX) / 2
                bd.add(tone, packLive, listOf(Pt(fromX, pk.cy), Pt(mx, pk.cy), Pt(mx, cab.cy), Pt(toX, cab.cy)))   // orthogonal elbow into the cabin inflow node
            }
        }
        return bd.wires
    }
}
