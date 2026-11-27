package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PitotStaticRulesTest {
    private val rules = PitotStaticRules

    @Test fun flipInvertsOnlyItsFlag() {
        val s = initialSimState()
        val (c, on) = rules.flip(s, "psIcing")
        assertTrue(on)
        assertTrue(c.psIcing)
        assertFalse(s.psIcing)
        assertFalse(c.psPitotCaptCover)
        val (back, off) = rules.flip(c, "psIcing")
        assertFalse(off)
        assertFalse(back.psIcing)
    }

    @Test fun everyBreakerStartsClosedAndFlipsOpen() {
        val s = initialSimState()
        for (key in listOf("psCbCaptUpperL", "psCbFoUpperR", "psCadc1Cb", "psCbTemp")) {
            assertFalse(rules.flip(s, key).second) // breakers start closed; one press opens them
        }
    }

    @Test fun unknownFlagIsRefused() {
        var refused = false
        try { rules.flip(initialSimState(), "psNope") } catch (e: IllegalArgumentException) { refused = true }
        assertTrue(refused)
    }

    @Test fun cadcTestCyclesThroughFourStates() {
        val s = initialSimState()
        s.psCadc1Test = "OFF"
        val a = rules.cycleCadcTest(s, 1)
        assertEquals("FUNCTION", a.psCadc1Test)
        val b = rules.cycleCadcTest(a, 1)
        assertEquals("SLEW", b.psCadc1Test)
        val c = rules.cycleCadcTest(b, 1)
        assertEquals("FAIL", c.psCadc1Test)
        assertEquals("OFF", rules.cycleCadcTest(c, 1).psCadc1Test)
        assertEquals("FUNCTION", rules.cycleCadcTest(s, 2).psCadc2Test) // channel 2 is independent
    }

    @Test fun blockingAPortFreezesAltitudeOnlyWhenItsPartnerIsBlocked() {
        val s = initialSimState()
        s.psFlightAltFt = 5000.0
        val (first, _) = rules.togglePort(s, "psStaticFoL")
        assertTrue(first.psStaticFoL)
        assertEquals(0.0, first.psStaticFoFrozenAltFt, 0.0) // partner not blocked yet
        val (both, _) = rules.togglePort(first, "psStaticFoR")
        assertEquals(5000.0, both.psStaticFoFrozenAltFt, 0.0)
        val (capt, _) = rules.togglePort(s, "psStaticCaptL")
        assertTrue(capt.psStaticCaptL)
        assertEquals(0.0, capt.psStaticCaptFrozenAltFt, 0.0)
    }

    @Test fun clearFaultsResetsBreakersAndSwitches() {
        val s = initialSimState()
        s.psPitotCaptBlocked = true
        s.psCbCaptUpperL = false
        s.psIcing = true
        s.psFlightAltFt = 4000.0
        val c = rules.clearFaults(s)
        assertFalse(c.psPitotCaptBlocked)
        assertTrue(c.psCbCaptUpperL)
        assertFalse(c.psIcing)
        assertEquals(4000.0, c.psFlightAltFt, 0.0) // flight condition is not a fault
    }

    @Test fun conditionsSetTheirProfiles() {
        val s = initialSimState()
        val g = rules.ground(s)
        assertEquals(0.0, g.psFlightVsFpm, 0.0)
        val cr = rules.cruiseTest(s)
        assertEquals(10000.0, cr.psFlightTargetAltFt, 0.0)
        assertEquals(180.0, cr.psFlightTargetCasKt, 0.0)
        assertEquals(1500.0, rules.climbTest(s).psFlightVsFpm, 0.0)
    }

    @Test fun testSourcesAreExclusiveAndRestartTheClock() {
        val s = initialSimState()
        s.psTestClockSec = 9.0
        val p = rules.togglePressureTest(s)
        assertTrue(p.psTestPressureSource)
        assertEquals(0.0, p.psTestClockSec, 0.0)
        val v = rules.toggleVacuumTest(p)
        assertTrue(v.psTestVacuumSource)
        assertFalse(v.psTestPressureSource)
    }

    @Test fun scenariosSetTheirFaults() {
        val s = initialSimState()
        assertTrue(rules.scenarioCaptPitotBlocked(s).psPitotCaptBlocked)
        val trapped = rules.scenarioFoStaticTrapped(s)
        assertTrue(trapped.psStaticFoL && trapped.psStaticFoR)
        assertTrue(rules.scenarioCaptAltStatic(s).psAltStaticCapt)
        val covers = rules.scenarioCoversOnTakeoffRoll(s)
        assertTrue(covers.psPitotCaptCover && covers.psPitotAux2Cover)
        assertEquals(80.0, covers.psFlightCasKt, 0.0)
    }

    /** The view's port buttons call isSet() with the four static-port keys; it used to throw, which crashed the Pitot / Static section on open. */
    @Test fun isSetReadsTheFourNormalStaticPorts() {
        val s = initialSimState()
        for (k in listOf("psStaticCaptL", "psStaticCaptR", "psStaticFoL", "psStaticFoR")) assertFalse(k, rules.isSet(s, k))
        val blocked = rules.togglePort(s, "psStaticFoL").first
        assertTrue(rules.isSet(blocked, "psStaticFoL"))
        assertFalse(rules.isSet(blocked, "psStaticFoR"))
    }

    @Test fun isSetResolvesEveryFlipFlag() {
        val s = initialSimState()
        for (k in rules.FLAG_NAMES) rules.isSet(s, k)
    }
}
