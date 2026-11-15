package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assert.assertNull
import org.junit.Test

/** Fire handle lock, pull, discharge and lamp rules (CenterPedestal.tsx FirePanel). */
class FirePanelRulesTest {
    private fun applyTo(s: SimState, a: FirePanelRules.Action): SimState = s.copy().also { a.edit.invoke(it) }

    @Test
    fun lockedHandleOnlyLogs() {
        val s = SimState()
        assertTrue(FirePanelRules.engineLocked(s, 1, false))
        val a = FirePanelRules.pullEngine(s, 1, false)
        assertEquals("ENG 1 FIRE handle LOCKED — no fire warning. Use FIRE SWITCHES LOCK OVERRIDE.", a.note)
        assertFalse(applyTo(s, a).engine1FirePulled)
    }

    @Test
    fun fireWarningOrOverrideUnlocksAndTheHandleToggles() {
        val s = SimState().also { it.faults.engineFire2 = true }
        assertFalse(FirePanelRules.engineLocked(s, 2, false))
        val pulled = applyTo(s, FirePanelRules.pullEngine(s, 2, false))
        assertTrue(pulled.engine2FirePulled)
        assertEquals("ENG 2 FIRE handle pulled — engine fuel, bleed, generator and engine hydraulic pump isolated.",
            FirePanelRules.pullEngine(s, 2, false).note)
        // pulled handle resets even with no fire and no override
        val reset = FirePanelRules.pullEngine(pulled.also { it.faults.engineFire2 = false }, 2, false)
        assertEquals("ENG 2 FIRE handle reset.", reset.note)
        assertFalse(applyTo(pulled, reset).engine2FirePulled)
        // override unlocks a quiet engine
        assertTrue(applyTo(SimState(), FirePanelRules.pullEngine(SimState(), 1, true)).engine1FirePulled)
    }

    @Test
    fun bottleDischargeNeedsAPulledHandleAndAFreshBottleAndClearsTheFire() {
        val s = SimState().also { it.faults.engineFire1 = true }
        assertNull(FirePanelRules.dischargeEngine(s, 1, 'L'))
        val pulled = s.copy().also { it.engine1FirePulled = true }
        val a = FirePanelRules.dischargeEngine(pulled, 1, 'R')
        assertNotNull(a)
        assertEquals("ENG 1 fire handle rotated RIGHT — bottle R discharged.", a!!.note)
        val after = applyTo(pulled, a)
        assertTrue(after.fireBottleRDischarged)
        assertFalse(after.fireBottleLDischarged)
        assertFalse(after.faults.engineFire1)
        // a spent bottle cannot fire again
        assertNull(FirePanelRules.dischargeEngine(after, 1, 'R'))
        assertEquals("ENG 1 fire handle rotated LEFT — bottle L discharged.", FirePanelRules.dischargeEngine(after, 1, 'L')!!.note)
    }

    @Test
    fun apuHandleAndBottle() {
        val s = SimState()
        assertTrue(FirePanelRules.apuLocked(s, false))
        assertEquals("APU FIRE handle LOCKED — no fire warning. Use FIRE SWITCHES LOCK OVERRIDE.", FirePanelRules.pullApu(s, false).note)
        val fire = s.copy().also { it.faults.apuFireDetected = true }
        val pulled = applyTo(fire, FirePanelRules.pullApu(fire, false))
        assertTrue(pulled.apuFirePulled)
        assertEquals("APU fire handle reset.", FirePanelRules.pullApu(pulled, false).note)
        assertNull(FirePanelRules.dischargeApu(fire))
        val a = FirePanelRules.dischargeApu(pulled)
        assertNotNull(a)
        val after = applyTo(pulled, a!!)
        assertTrue(after.apuBottleFired)
        assertFalse(after.faults.apuFireDetected)
        assertNull(FirePanelRules.dischargeApu(after))
    }

    @Test
    fun editsDoNotTouchTheOriginalState() {
        val s = SimState().also { it.engine1FirePulled = true; it.faults.engineFire1 = true }
        val copy = s.copy()
        FirePanelRules.dischargeEngine(s, 1, 'L')!!.let { it.edit.invoke(copy) }
        assertTrue(s.faults.engineFire1)
        assertFalse(copy.faults.engineFire1)
    }

    @Test
    fun lamps() {
        val s = SimState().also { it.faults.bleedOverheat2 = true }
        assertTrue(FirePanelRules.overheatLit(true, false, s, 2))
        assertFalse(FirePanelRules.overheatLit(true, false, s, 1))
        assertTrue(FirePanelRules.overheatLit(true, true, s, 1))
        assertFalse(FirePanelRules.overheatLit(false, true, s, 1))
        assertTrue(FirePanelRules.extLampLit(true, true, true))
        assertFalse(FirePanelRules.extLampLit(true, true, false))
        assertFalse(FirePanelRules.extLampLit(true, false, true))
        assertFalse(FirePanelRules.extLampLit(false, true, true))
    }

    @Test
    fun bellLatchResetsOnlyWhenTheWarningsClear() {
        assertTrue(FirePanelRules.bellShouldReset(false, true))
        assertFalse(FirePanelRules.bellShouldReset(true, true))
        assertFalse(FirePanelRules.bellShouldReset(false, false))
        val d = Derived()
        assertFalse(FirePanelRules.anyWarn(d))
        d.cargoAftFireWarn = true
        assertTrue(FirePanelRules.anyWarn(d))
    }

    @Test
    fun rotateLabels() {
        assertEquals(listOf("L", "R"), FirePanelRules.rotateLabels(true))
        assertEquals(listOf("DISCH"), FirePanelRules.rotateLabels(false))
    }
}
