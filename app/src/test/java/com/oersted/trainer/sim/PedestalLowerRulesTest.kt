package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Lower pedestal rules: lower plate, aileron drum, cargo fire, mic panels, printer, trim plate. */
class PedestalLowerRulesTest {
    private val R = PedestalLowerRules
    private fun applyTo(s: SimState, a: FirePanelRules.Action): SimState = s.copy().also { a.edit.invoke(it) }

    @Test
    fun knobValuesRoundLikeToFixed() {
        assertEquals(0.67, R.panelBright(0.6666), 0.0)
        assertEquals(0.333, R.rudderValue(1.0 / 3.0), 0.0)
    }

    @Test
    fun rudderReadout() {
        assertEquals("0", R.rudderLabel(0.0))
        assertEquals("R 7.5", R.rudderLabel(0.5))
        assertEquals("L 15.0", R.rudderLabel(-1.0))
    }

    @Test
    fun aileronDragClampsAndRounds() {
        assertEquals(0.04, R.aileronDrag(0.0, 10.0), 1e-12)
        assertEquals(1.0, R.aileronDrag(0.99, 100.0), 0.0)
        assertEquals(-1.0, R.aileronDrag(-0.99, -100.0), 0.0)
        assertEquals(75.0, R.aileronStripeShift(0.5), 0.0)
        assertEquals("L WING DN ← 7.5 U → R WING DN", R.aileronLabel(0.5))
        assertEquals("L WING DN ← -3.0 U → R WING DN", R.aileronLabel(-0.2))
    }

    @Test
    fun lockOverrideLastsTwelveSeconds() {
        assertEquals(13000.0, R.lockOverrideUntil(1000L), 0.0)
    }

    @Test
    fun stabTrimPressHonoursCutoutsAndOverride() {
        val s = SimState().also { it.stabTrimUnits = 5.0 }
        assertEquals(5.1, R.stabTrimPress(s, 1)!!, 1e-12)
        assertEquals(4.9, R.stabTrimPress(s, -1)!!, 1e-12)
        s.stabTrimCutoutA = true
        assertNull(R.stabTrimPress(s, 1))
        s.stabTrimOverride = true
        assertNotNull(R.stabTrimPress(s, 1))
        assertEquals(15.0, R.stabTrimPress(SimState().also { it.stabTrimUnits = 15.0 }, 1)!!, 0.0)
        assertEquals("STAB TRIM CUTOUT A ACTIVE", R.cutoutNote('A', true))
        assertEquals("STAB TRIM OVERRIDE OFF", R.stabOverrideNote(false))
    }

    @Test
    fun cargoDetectorFaultFollowsTheLoops() {
        val s = SimState().also { it.cargoFireInstalled = true; it.cargoLoopA = true; it.cargoLoopB = true }
        val p = Pedestal.PedestalState()
        assertFalse(R.cargoFault(true, s, p))
        s.cargoLoopA = false
        assertFalse(R.cargoFault(true, s, p)) // NORM needs both loops bad
        assertTrue(R.cargoFault(true, s, p.copy(cargoDetFwd = Pedestal.CargoDet.A)))
        assertFalse(R.cargoFault(true, s, p.copy(cargoDetFwd = Pedestal.CargoDet.B)))
        assertTrue(R.cargoFault(true, s, p.copy(fireTest = Pedestal.FireTest.FAULT)))
        assertFalse(R.cargoFault(false, s, p.copy(fireTest = Pedestal.FireTest.FAULT)))
        s.cargoFireInstalled = false
        assertFalse(R.cargoFault(true, s, p.copy(fireTest = Pedestal.FireTest.FAULT)))
    }

    @Test
    fun cargoArmAndDischarge() {
        val s = SimState()
        val a0 = R.cargoArm(s, "FWD")
        assertEquals("CARGO FIRE system not installed (pre-SB 26A1081).", a0.note)
        assertEquals(s.cargoArmed, applyTo(s, a0).cargoArmed)
        s.cargoFireInstalled = true
        assertNull(R.cargoDischarge(s.also { it.cargoArmed = "NONE" }))
        val armed = applyTo(s, R.cargoArm(s, "AFT"))
        assertEquals("AFT", armed.cargoArmed)
        assertEquals("CARGO FIRE ARM — AFT compartment selected.", R.cargoArm(s, "AFT").note)
        val off = R.cargoArm(armed, "AFT")
        assertEquals("CARGO FIRE ARM selector OFF.", off.note)
        assertEquals("NONE", applyTo(armed, off).cargoArmed)
        val d = R.cargoDischarge(armed)!!
        assertEquals("CARGO FIRE DISCH — agent released into the AFT compartment.", d.note)
        val fired = applyTo(armed, d)
        assertTrue(fired.cargoBottleDischarged)
        assertNull(R.cargoDischarge(fired))
        assertTrue(R.cargoExtLit(true, armed, false))
        assertFalse(R.cargoExtLit(true, fired, false))
        assertTrue(R.cargoExtLit(true, fired, true))
    }

    @Test
    fun micTransmitSelectionIsExclusivePerSide() {
        var mic: Map<String, Boolean> = Pedestal.MIC_DEFAULT
        assertNull(R.transmitting(mic, "L"))
        mic = R.selectTx(mic, "L", "HF-1")
        assertEquals("HF-1", R.transmitting(mic, "L"))
        assertNull(R.transmitting(mic, "R"))
        mic = R.selectTx(mic, "L", "PA")
        assertEquals("PA", R.transmitting(mic, "L"))
        assertFalse(mic["L:tx:HF-1"]!!)
        mic = R.selectTx(mic, "L", "PA") // pressing again clears it
        assertNull(R.transmitting(mic, "L"))
        // untouched keys survive
        assertTrue(mic["L:rx:ADF-1"]!!)
    }

    @Test
    fun flipTogglesOneEntry() {
        val mic = R.flip(Pedestal.MIC_DEFAULT, "L:rx:MKR")
        assertFalse(mic["L:rx:MKR"]!!)
        assertTrue(R.flip(mic, "L:rx:MKR")["L:rx:MKR"]!!)
        assertTrue(R.flip(emptyMap(), "x")["x"]!!)
    }

    @Test
    fun micStatusLine() {
        assertEquals("NO DC POWER", R.micStatus(false, true, "PA"))
        assertEquals("TX ▸ PA", R.micStatus(true, true, "PA"))
        assertEquals("PTT · NO TX RADIO SELECTED", R.micStatus(true, true, null))
        assertEquals("ARMED ▸ HF-2", R.micStatus(true, false, "HF-2"))
        assertEquals("—", R.micStatus(true, false, null))
        assertTrue(R.pttActive(true, true, "PA"))
        assertFalse(R.pttActive(true, true, null))
    }

    @Test
    fun printerLamps() {
        assertTrue(R.printerMsgLit(true, true))
        assertFalse(R.printerMsgLit(false, true))
        assertTrue(R.printerPaperLit(true, false, false))
        assertFalse(R.printerPaperLit(true, false, true))
        assertEquals("PAPER EMPTY", R.paperText(false))
    }
}
