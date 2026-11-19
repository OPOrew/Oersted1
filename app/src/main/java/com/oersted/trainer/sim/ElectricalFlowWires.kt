package com.oersted.trainer.sim

import com.oersted.trainer.sim.FlowWires.Pt
import com.oersted.trainer.sim.FlowWires.Rect

/**
 * Port of the pure parts of components/panel/ElectricalPowerTrainer.tsx: the source / BTB / summary logic, the "how to apply
 * electrical power" modes and the wire router (ElTone / ElWire / the wire construction block). Comments follow the web source.
 */
object ElectricalFlowWires {
    enum class ElTone { SOURCE, AC, DC, STANDBY, BREAKER, ALT }

    data class ElWire(val tone: ElTone, val active: Boolean, val pts: List<Pt>, val arrow: Boolean, val arrowStart: Boolean, val dots: List<Pt>, val diode: Boolean)

    data class Sources(val gpu: Boolean, val apuLeft: Boolean, val apuRight: Boolean, val gen1: Boolean, val gen2: Boolean, val xfer1: Boolean, val xfer2: Boolean) {
        val apuAny: Boolean get() = apuLeft || apuRight
    }

    fun sources(d: Derived) = Sources(
        gpu = d.electricalSource1 == "GPU" || d.electricalSource2 == "GPU",
        apuLeft = d.electricalSource1 == "APU GEN",
        apuRight = d.electricalSource2 == "APU GEN",
        gen1 = d.generator1BusPowered,
        gen2 = d.generator2BusPowered,
        xfer1 = d.electricalSource1 == "GEN 2 XFER",
        xfer2 = d.electricalSource2 == "GEN 1 XFER",
    )

    /**
     * BTB closes only for the external/APU tie path onto a side that is not already held by its own engine generator
     * (matches derive tieSource / BTB). Returns (BTB 1 closed, BTB 2 closed).
     */
    fun btbClosed(s: SimState, src: Sources): Pair<Boolean, Boolean> = Pair(
        (src.gpu || src.apuLeft) && !src.gen1 && !s.faults.btb1Failure,
        (src.gpu || src.apuRight) && !src.gen2 && !s.faults.btb2Failure,
    )

    fun sourceSummary(s: SimState, d: Derived, src: Sources): String =
        if (d.generator1ProtectionTripped || d.generator2ProtectionTripped) "GENERATOR PROTECTION TRIP ACTIVE"
        else if (src.gpu) "EXTERNAL AC SOURCE ON BUS"
        else if (src.apuAny) "APU GENERATOR ON BUS"
        else if (src.gen1 || src.gen2) "ENGINE GENERATOR POWER"
        else if (src.xfer1 || src.xfer2) "TRANSFER RELAY ALTERNATE FEED"
        else if (s.battery) "BATTERY / STANDBY SOURCE"
        else "NO MAIN AC SOURCE"

    data class Mode(val key: String, val title: String, val path: String, val steps: List<String>)

    /** The four "How to apply electrical power" modes, in web order (GPU, APU, ENG, BAT). */
    val MODES: List<Mode> = listOf(
        Mode("GPU", "GROUND POWER CART", "GPU → EPC → TIE BUS → BTB 1 / BTB 2 → LOAD BUSES", listOf(
            "Connect the 3-phase external power cable to the aircraft external-power receptacle.",
            "Confirm external power is connected and GRD POWER AVAILABLE is indicated.",
            "Place BAT switch ON for the required control and indication circuits.",
            "Select GROUND SERVICE ON only when service outlets / lights are required without energizing the whole aircraft.",
            "Select GRD PWR ON; this sends a trip signal to the APU and engine generator breakers, clearing any running generator off the tie bus, then the external power contactor and BTBs close and pick up the load buses from the ground source.",
        )),
        Mode("APU", "APU GENERATOR", "BATTERY → APU START → APU GB → TIE BUS → BTB 1 / 2", listOf(
            "Place BAT switch ON so the APU starting circuit has battery power.",
            "Start the APU and wait until the generator is available.",
            "Select LEFT and/or RIGHT APU GEN as required.",
            "The APU generator connects to the tie bus; the selected BTB supplies its associated load bus when that bus is not already supplied by an engine generator.",
            "If an engine generator is selected and valid, it takes its associated generator/load bus and the APU source is not paralleled onto that bus.",
        )),
        Mode("ENG", "ENGINE GENERATORS", "ENGINE → CSD → GEN → GB → GEN BUS → TRANSFER BUS", listOf(
            "Start the engine using the pneumatic starter system; the starter motor itself is not an AC electrical load.",
            "When generator voltage and frequency are correct, select the applicable GEN switch ON.",
            "With both generators operating, each generator supplies its own generator bus and transfer bus; both BTBs remain tripped.",
            "With one generator unavailable and BUS TRANSFER in AUTO, the failed side's transfer bus is picked up through the opposite transfer relay.",
            "The engine-generator sources are not operated in parallel.",
        )),
        Mode("BAT", "BATTERY / STANDBY", "BATTERY → BATTERY BUS / ESSENTIAL DC + STATIC INVERTER → STANDBY AC", listOf(
            "Place BAT switch ON to energize battery-supported circuits.",
            "In AUTO, normal standby AC follows Transfer Bus 1 and normal standby DC follows DC Bus 1.",
            "If normal standby input is lost and battery power is available, the standby system transfers to the battery bus and static inverter.",
            "In BAT position, the battery/static-inverter branch is selected for the standby system.",
            "Return STANDBY POWER to AUTO when normal electrical power is restored.",
        )),
    )

    data class Flags(
        val gpu: Boolean, val apuAny: Boolean, val g1: Boolean, val g2: Boolean, val alt1: Boolean, val alt2: Boolean,
        val btb1Closed: Boolean, val btb2Closed: Boolean, val transferBus1Powered: Boolean, val transferBus2Powered: Boolean,
        val tr1Powered: Boolean, val tr2Powered: Boolean, val tr3Powered: Boolean, val dcBus1Powered: Boolean, val dcBus2Powered: Boolean,
        val ac28vPowered: Boolean, val groundServiceBusPowered: Boolean, val batteryChargerPowered: Boolean,
        val sb1Live: Boolean, val sb2Live: Boolean, val sb3Live: Boolean, val sb4Live: Boolean, val standbyAcPowered: Boolean, val standbyDcPowered: Boolean,
    )

    fun flags(s: SimState, d: Derived): Flags {
        val src = sources(d)
        val (b1, b2) = btbClosed(s, src)
        return Flags(
            src.gpu, src.apuAny, d.generator1BusPowered, d.generator2BusPowered, d.transferRelay1Alt, d.transferRelay2Alt, b1, b2,
            d.transferBus1Powered, d.transferBus2Powered, d.tr1Powered, d.tr2Powered, d.tr3Powered, d.dcBus1Powered, d.dcBus2Powered,
            d.ac28vPowered, d.groundServiceBusPowered, d.batteryChargerPowered,
            s.standbyPower == "AUTO" && d.standbyAcSource == "TRANSFER BUS 1", d.staticInverterPowered,
            s.standbyPower == "AUTO" && d.standbyDcSource == "DC BUS 1", d.standbyDcSource == "BATTERY BUS",
            d.standbyAcPowered, d.standbyDcPowered,
        )
    }

    fun wires(geo: Map<String, Rect>, f: Flags): List<ElWire> {
        val wires = mutableListOf<ElWire>()
        fun N(id: String): Rect? = geo[id]
        fun add(tone: ElTone, active: Boolean, pts: List<Pt>?, arrow: Boolean = true, arrowStart: Boolean = false, dots: List<Pt> = emptyList(), diode: Boolean = false) {
            if (pts != null && pts.size > 1) wires.add(ElWire(tone, active, pts, arrow, arrowStart, dots, diode))
        }
        /** straight drop from the bottom of a to the top of b, at the x where the two overlap */
        fun drop(a: Rect?, b: Rect?): List<Pt>? {
            if (a == null || b == null) return null
            val x = if (a.r - a.l <= b.r - b.l) a.cx else b.cx
            return listOf(Pt(x, a.b), Pt(x, b.t))
        }
        /** straight horizontal wire between neighbouring nodes on the same row */
        fun side(a: Rect?, b: Rect?, y: Double? = null): List<Pt>? {
            if (a == null || b == null) return null
            val rtl = b.cx < a.cx
            val yy = y ?: a.cy
            return listOf(Pt(if (rtl) a.l else a.r, yy), Pt(if (rtl) b.r else b.l, yy))
        }

        // Sources → breakers → buses
        add(ElTone.SOURCE, f.gpu, drop(N("e-gpu"), N("e-epc")))
        add(ElTone.SOURCE, f.apuAny, drop(N("e-apu"), N("e-apgb")))
        add(ElTone.SOURCE, f.g1, drop(N("e-g1"), N("e-b1")))
        add(ElTone.SOURCE, f.g2, drop(N("e-g2"), N("e-b2")))
        add(ElTone.SOURCE, f.gpu, drop(N("e-epc"), N("e-tie")))
        add(ElTone.SOURCE, f.apuAny, drop(N("e-apgb"), N("e-tie")))
        add(ElTone.AC, f.g1, drop(N("e-b1"), N("e-gb1")))
        add(ElTone.AC, f.g2, drop(N("e-b2"), N("e-gb2")))

        // Tie bus → BTBs → main buses
        add(ElTone.BREAKER, f.btb1Closed, drop(N("e-tie"), N("e-btb1")))
        add(ElTone.BREAKER, f.btb2Closed, drop(N("e-tie"), N("e-btb2")))
        add(ElTone.AC, f.btb1Closed, drop(N("e-btb1"), N("e-main1")))
        add(ElTone.AC, f.btb2Closed, drop(N("e-btb2"), N("e-main2")))

        // Gen buses → transfer relays → transfer buses → AC users (R3 ⇄ R4 cross-feed in orange)
        add(ElTone.AC, f.g1, drop(N("e-gb1"), N("e-r3")))
        add(ElTone.AC, f.g2, drop(N("e-gb2"), N("e-r4")))
        add(if (f.alt1) ElTone.ALT else ElTone.AC, f.g1 || f.alt1, drop(N("e-r3"), N("e-x1")))
        add(if (f.alt2) ElTone.ALT else ElTone.AC, f.g2 || f.alt2, drop(N("e-r4"), N("e-x2")))
        add(ElTone.ALT, f.alt1 || f.alt2, side(N("e-r3"), N("e-r4")), arrowStart = true)
        add(ElTone.AC, f.transferBus1Powered, drop(N("e-x1"), N("e-acu")))
        add(ElTone.AC, f.transferBus2Powered, drop(N("e-x2"), N("e-acu")))

        // Gen buses → TRs → DC buses
        run {
            val grid = N("e-grid"); val gb1 = N("e-gb1"); val gb2 = N("e-gb2"); val acu = N("e-acu")
            val tr1 = N("e-tr1"); val tr2 = N("e-tr2"); val tr3 = N("e-tr3")
            if (grid != null && gb1 != null && gb2 != null && acu != null && tr1 != null && tr2 != null && tr3 != null) {
                val busY = (acu.b + tr1.t) / 2
                val gapX = gb1.l - 8
                val railX = grid.r + 6
                add(ElTone.AC, f.g1, listOf(Pt(gb1.l, gb1.cy), Pt(gapX, gb1.cy), Pt(gapX, busY), Pt(tr1.cx, busY), Pt(tr1.cx, tr1.t)))
                add(ElTone.AC, f.g2, listOf(Pt(gb2.r, gb2.cy), Pt(railX, gb2.cy), Pt(railX, busY), Pt(tr3.cx, busY), Pt(tr3.cx, tr3.t)), dots = listOf(Pt(tr2.cx, busY)))
                add(ElTone.AC, f.g2, listOf(Pt(tr2.cx, busY), Pt(tr2.cx, tr2.t)))
            }
        }
        add(ElTone.DC, f.tr1Powered, drop(N("e-tr1"), N("e-dc1")))
        add(ElTone.DC, f.tr2Powered, drop(N("e-tr2"), N("e-dc2")))
        add(ElTone.DC, f.tr3Powered, drop(N("e-tr3"), N("e-dct")))
        add(ElTone.ALT, f.tr3Powered, side(N("e-dct"), N("e-dc1")), arrow = false, diode = true)
        add(ElTone.ALT, f.tr3Powered, side(N("e-dct"), N("e-dc2")), arrow = false, diode = true)
        run {
            val dc1 = N("e-dc1"); val dc2 = N("e-dc2"); val du = N("e-dcu")
            if (dc1 != null && dc2 != null && du != null) {
                val busY = (dc1.b + du.t) / 2
                add(ElTone.DC, f.dcBus1Powered, listOf(Pt(dc1.cx, dc1.b), Pt(dc1.cx, busY), Pt(du.cx, busY), Pt(du.cx, du.t)))
                add(ElTone.DC, f.dcBus2Powered, listOf(Pt(dc2.cx, dc2.b), Pt(dc2.cx, busY), Pt(du.cx, busY)), arrow = false, dots = listOf(Pt(du.cx, busY)))
            }
        }

        // 28-VAC, ground service, battery charging (vertical chains)
        fun chain(k: String, tone: ElTone, live: Boolean) {
            add(tone, live, drop(N("$k-a"), N("$k-m")))
            add(tone, live, drop(N("$k-m"), N("$k-b")))
        }
        chain("c28", ElTone.AC, f.ac28vPowered)
        chain("csv", ElTone.AC, f.groundServiceBusPowered)
        chain("cch", ElTone.AC, f.batteryChargerPowered)

        // Standby logic: source → relay → standby bus, then both buses → essential / standby users
        run {
            data class Row(val k: String, val tone: ElTone, val live: Boolean, val bus: String)
            val rows = listOf(
                Row("sb1", ElTone.AC, f.sb1Live, "sb-ac"), Row("sb2", ElTone.ALT, f.sb2Live, "sb-ac"),
                Row("sb3", ElTone.DC, f.sb3Live, "sb-dc"), Row("sb4", ElTone.ALT, f.sb4Live, "sb-dc"),
            )
            for (r in rows) {
                val l = N("${r.k}-l"); val m = N("${r.k}-m"); val bb = N(r.bus)
                add(r.tone, r.live, side(l, m))
                if (m != null && bb != null) add(r.tone, r.live, listOf(Pt(m.r, m.cy), Pt(bb.l, m.cy)))
            }
            val grid = N("sb-grid"); val ac = N("sb-ac"); val dc = N("sb-dc"); val ess = N("sb-ess")
            if (grid != null && ac != null && dc != null && ess != null) {
                val busY = ess.t - 10
                val railX = grid.r + 5
                add(ElTone.STANDBY, f.standbyAcPowered, listOf(Pt(ac.r, ac.cy), Pt(railX, ac.cy), Pt(railX, dc.cy)), arrow = false, dots = listOf(Pt(railX, dc.cy)))
                add(ElTone.STANDBY, f.standbyDcPowered || f.standbyAcPowered, listOf(Pt(dc.r, dc.cy), Pt(railX, dc.cy), Pt(railX, busY), Pt(ess.cx, busY), Pt(ess.cx, ess.t)))
            }
        }
        return wires
    }
}
