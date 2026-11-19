package com.oersted.trainer.sim

import com.oersted.trainer.sim.ElectricalFlowWires.ElTone
import com.oersted.trainer.sim.FlowWires.Pt
import com.oersted.trainer.sim.FlowWires.Rect
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ElectricalFlowWiresTest {
    private val none = ElectricalFlowWires.flags(initialSimState(), Derived())

    private fun find(w: List<ElectricalFlowWires.ElWire>, first: Pt) = w.first { it.pts.first() == first }

    @Test fun sourcesReadTheElectricalSourceStrings() {
        val d = Derived().apply { electricalSource1 = "APU GEN"; electricalSource2 = "GEN 1 XFER"; generator1BusPowered = true }
        val src = ElectricalFlowWires.sources(d)
        assertTrue(src.apuLeft); assertFalse(src.apuRight); assertTrue(src.apuAny)
        assertTrue(src.xfer2); assertFalse(src.xfer1); assertTrue(src.gen1); assertFalse(src.gpu)
        assertTrue(ElectricalFlowWires.sources(Derived().apply { electricalSource2 = "GPU" }).gpu)
    }

    @Test fun btbClosesOnlyForTieSourceOnASideWithoutItsOwnGeneratorAndNoFailure() {
        val s = initialSimState()
        val gpu = ElectricalFlowWires.Sources(true, false, false, false, false, false, false)
        assertEquals(Pair(true, true), ElectricalFlowWires.btbClosed(s, gpu))
        assertEquals(Pair(false, true), ElectricalFlowWires.btbClosed(s, gpu.copy(gen1 = true)))
        s.faults.btb2Failure = true
        assertEquals(Pair(true, false), ElectricalFlowWires.btbClosed(s, gpu))
        assertEquals(Pair(true, false), ElectricalFlowWires.btbClosed(s, ElectricalFlowWires.Sources(false, true, false, false, false, false, false)))
        assertEquals(Pair(false, false), ElectricalFlowWires.btbClosed(s, ElectricalFlowWires.Sources(false, false, true, false, false, false, false)))
    }

    @Test fun sourceSummaryFollowsTheWebPriorityOrder() {
        val s = initialSimState()
        val d = Derived()
        fun sum(src: ElectricalFlowWires.Sources) = ElectricalFlowWires.sourceSummary(s, d, src)
        val z = ElectricalFlowWires.Sources(false, false, false, false, false, false, false)
        assertEquals("NO MAIN AC SOURCE", sum(z))
        s.battery = true
        assertEquals("BATTERY / STANDBY SOURCE", sum(z))
        assertEquals("TRANSFER RELAY ALTERNATE FEED", sum(z.copy(xfer1 = true)))
        assertEquals("ENGINE GENERATOR POWER", sum(z.copy(gen2 = true, xfer1 = true)))
        assertEquals("APU GENERATOR ON BUS", sum(z.copy(apuRight = true, gen1 = true)))
        assertEquals("EXTERNAL AC SOURCE ON BUS", sum(z.copy(gpu = true, apuLeft = true)))
        d.generator2ProtectionTripped = true
        assertEquals("GENERATOR PROTECTION TRIP ACTIVE", sum(z.copy(gpu = true)))
    }

    @Test fun modesAreTheFourWebApplyPaths() {
        assertEquals(listOf("GPU", "APU", "ENG", "BAT"), ElectricalFlowWires.MODES.map { it.key })
        assertTrue(ElectricalFlowWires.MODES.all { it.steps.size == 5 })
        assertEquals("GPU → EPC → TIE BUS → BTB 1 / BTB 2 → LOAD BUSES", ElectricalFlowWires.MODES[0].path)
    }

    @Test fun standbyLegsFollowSelectorAndSourceStrings() {
        val s = initialSimState()   // standbyPower AUTO
        val d = Derived().apply { standbyAcSource = "TRANSFER BUS 1"; standbyDcSource = "BATTERY BUS"; staticInverterPowered = true }
        val f = ElectricalFlowWires.flags(s, d)
        assertTrue(f.sb1Live); assertTrue(f.sb2Live); assertFalse(f.sb3Live); assertTrue(f.sb4Live)
        s.standbyPower = "BAT"
        assertFalse(ElectricalFlowWires.flags(s, d).sb1Live)
    }

    @Test fun emptyGeometryGivesNoWires() {
        assertTrue(ElectricalFlowWires.wires(emptyMap(), none).isEmpty())
    }

    @Test fun dropUsesTheNarrowerNodesCentre() {
        val g = mapOf("e-gpu" to Rect(0.0, 100.0, 0.0, 10.0), "e-epc" to Rect(40.0, 60.0, 20.0, 30.0))
        val w = ElectricalFlowWires.wires(g, none.copy(gpu = true))
        assertEquals(1, w.size)
        assertEquals(listOf(Pt(50.0, 10.0), Pt(50.0, 20.0)), w[0].pts)
        assertEquals(ElTone.SOURCE, w[0].tone)
        assertTrue(w[0].active)
        val g2 = mapOf("e-gpu" to Rect(0.0, 20.0, 0.0, 10.0), "e-epc" to Rect(0.0, 100.0, 20.0, 30.0))
        assertEquals(Pt(10.0, 10.0), ElectricalFlowWires.wires(g2, none)[0].pts.first())
    }

    @Test fun transferRelayCrossFeedIsOrangeWithAnArrowAtBothEnds() {
        val g = mapOf("e-r3" to Rect(0.0, 40.0, 0.0, 10.0), "e-r4" to Rect(60.0, 100.0, 0.0, 10.0))
        val w = ElectricalFlowWires.wires(g, none.copy(alt1 = true))
        assertEquals(1, w.size)
        assertEquals(listOf(Pt(40.0, 5.0), Pt(60.0, 5.0)), w[0].pts)
        assertEquals(ElTone.ALT, w[0].tone)
        assertTrue(w[0].active && w[0].arrow && w[0].arrowStart)
    }

    @Test fun dcTieBusDiodesHaveNoArrowAndFaceTheirDcBus() {
        val g = mapOf("e-dct" to Rect(40.0, 60.0, 0.0, 10.0), "e-dc1" to Rect(0.0, 20.0, 0.0, 10.0), "e-dc2" to Rect(80.0, 100.0, 0.0, 10.0))
        val w = ElectricalFlowWires.wires(g, none.copy(tr3Powered = true))
        assertEquals(2, w.size)
        assertEquals(listOf(Pt(40.0, 5.0), Pt(20.0, 5.0)), w[0].pts)   // right-to-left to DC bus 1
        assertEquals(listOf(Pt(60.0, 5.0), Pt(80.0, 5.0)), w[1].pts)
        assertTrue(w.all { it.diode && !it.arrow && it.tone == ElTone.ALT && it.active })
    }

    @Test fun transformerRectifierFeedsRunInTheGapAndRail() {
        val g = mapOf(
            "e-grid" to Rect(0.0, 200.0, 0.0, 300.0), "e-gb1" to Rect(100.0, 140.0, 50.0, 60.0), "e-gb2" to Rect(150.0, 190.0, 50.0, 60.0),
            "e-acu" to Rect(100.0, 190.0, 100.0, 110.0), "e-tr1" to Rect(0.0, 40.0, 150.0, 160.0),
            "e-tr2" to Rect(150.0, 190.0, 150.0, 160.0), "e-tr3" to Rect(100.0, 140.0, 150.0, 160.0),
        )
        val w = ElectricalFlowWires.wires(g, none.copy(g1 = true, g2 = true))
        assertEquals(listOf(Pt(100.0, 55.0), Pt(92.0, 55.0), Pt(92.0, 130.0), Pt(20.0, 130.0), Pt(20.0, 150.0)), find(w, Pt(100.0, 55.0)).pts)
        val g2 = find(w, Pt(190.0, 55.0))
        assertEquals(listOf(Pt(190.0, 55.0), Pt(206.0, 55.0), Pt(206.0, 130.0), Pt(120.0, 130.0), Pt(120.0, 150.0)), g2.pts)
        assertEquals(listOf(Pt(170.0, 130.0)), g2.dots)
        assertEquals(listOf(Pt(170.0, 130.0), Pt(170.0, 150.0)), find(w, Pt(170.0, 130.0)).pts)
    }

    @Test fun standbyRowsAndEssentialFeedUseTheRail() {
        val g = mapOf(
            "sb-grid" to Rect(0.0, 190.0, 0.0, 100.0), "sb1-l" to Rect(0.0, 40.0, 0.0, 10.0), "sb1-m" to Rect(60.0, 100.0, 0.0, 10.0),
            "sb-ac" to Rect(120.0, 180.0, 10.0, 30.0), "sb-dc" to Rect(120.0, 180.0, 50.0, 70.0), "sb-ess" to Rect(50.0, 150.0, 90.0, 110.0),
        )
        val w = ElectricalFlowWires.wires(g, none.copy(sb1Live = true, standbyAcPowered = true))
        assertEquals(listOf(Pt(40.0, 5.0), Pt(60.0, 5.0)), find(w, Pt(40.0, 5.0)).pts)
        val toBus = find(w, Pt(100.0, 5.0))
        assertEquals(listOf(Pt(100.0, 5.0), Pt(120.0, 5.0)), toBus.pts)
        assertEquals(ElTone.AC, toBus.tone)
        val ac = find(w, Pt(180.0, 20.0))
        assertEquals(listOf(Pt(180.0, 20.0), Pt(195.0, 20.0), Pt(195.0, 60.0)), ac.pts)
        assertFalse(ac.arrow)
        val dc = find(w, Pt(180.0, 60.0))
        assertEquals(listOf(Pt(180.0, 60.0), Pt(195.0, 60.0), Pt(195.0, 80.0), Pt(100.0, 80.0), Pt(100.0, 90.0)), dc.pts)
        assertTrue(dc.active)   // standby DC leg is live when standby AC is powered
    }
}
