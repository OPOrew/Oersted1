package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class IceRainRulesTest {
    private val rules = IceRainRules

    @Test fun icingSetsTheFlagAndItsMessage() {
        val o = rules.setIcing(initialSimState(), true)
        assertTrue(o.state.icingConditions)
        assertEquals("ICING CONDITIONS ON", o.message)
    }

    @Test fun switchingWindowHeatOffClearsItsLatch() {
        val s = initialSimState()
        s.windowHeatLFwd = true
        s.windowHeatOvhtLFwd = true
        val o = rules.setWindowHeat(s, "windowHeatLFwd", on = false)
        assertFalse(o.state.windowHeatLFwd)
        assertFalse(o.state.windowHeatOvhtLFwd)
        assertEquals("WINDOW HEAT LFwd OFF", o.message)
    }

    @Test fun windowHeatTestHoldAndRelease() {
        val s = initialSimState()
        assertEquals("PWR", rules.setWindowHeatTest(s, "PWR").state.windowHeatTest)
        assertEquals("Window heat test released.", rules.setWindowHeatTest(s, "OFF").message)
    }

    @Test fun overheatLatchOnlyWhenATripHappens() {
        val s = initialSimState()
        assertTrue(rules.latchWindowOverheat(s, false, false, false, false) == null)
        val o = rules.latchWindowOverheat(s, false, true, false, false)!!
        assertTrue(o.state.windowHeatOvhtLSide)
        assertFalse(o.state.windowHeatOvhtLFwd)
    }

    @Test fun wipersParkOrSetTheMode() {
        val p = rules.setWipers(initialSimState(), "PARK")
        assertEquals("PARK", p.state.wiperL)
        assertEquals("WIPERS \u2014 PARK (drive to park position)", p.message)
        assertEquals("WIPERS HIGH", rules.setWipers(initialSimState(), "HIGH").message)
    }

    @Test fun alphaVaneMessagesOthersAreSilent() {
        val s = initialSimState()
        assertEquals("LEFT ALPHA VANE HEAT ON", rules.setProbeHeat(s, "probeHeatAlphaL", true).message)
        assertEquals("RIGHT ALPHA VANE HEAT OFF", rules.setProbeHeat(s, "probeHeatAlphaR", false).message)
        assertEquals(null, rules.setProbeHeat(s, "probeHeatTemp", true).message)
        assertTrue(rules.setProbeHeat(s, "probeHeatTemp", true).state.probeHeatTemp)
    }

    @Test fun wingAntiIceMessageDependsOnWeightOnWheels() {
        val s = initialSimState()
        s.wow = true
        assertEquals("LEFT WING ANTI-ICE SELECTED \u2014 valve inhibited on ground.", rules.setWingAntiIce(s, true, true).message)
        s.wow = false
        assertEquals("RIGHT WING ANTI-ICE ON.", rules.setWingAntiIce(s, false, true).message)
        assertEquals("RIGHT WING ANTI-ICE OFF.", rules.setWingAntiIce(s, false, false).message)
    }

    @Test fun fuelHeatOnRestartsItsTimer() {
        val s = initialSimState()
        s.fuelHeatElapsedSec = 40.0
        val on = rules.setFuelHeat(s, 1, true)
        assertTrue(on.fuelHeat)
        assertEquals(0.0, on.fuelHeatElapsedSec, 0.0)
        assertEquals(40.0, rules.setFuelHeat(s, 1, false).fuelHeatElapsedSec, 0.0)
    }

    @Test fun quickSetupsSetTheirSwitches() {
        val s = initialSimState()
        assertTrue(rules.allWindowHeatOn(s).state.windowHeatRSide)
        assertTrue(rules.allProbeHeatOn(s).state.probeHeatAlphaR)
        assertTrue(rules.engineAndWingAntiIceOn(s).state.wingAntiIceR)
        assertEquals("OVHT", rules.overheatTestForward(s).state.windowHeatTest)
        val off = rules.allOffPark(rules.allWindowHeatOn(s).state).state
        assertFalse(off.windowHeatLFwd)
        assertEquals("PARK", off.wiperR)
    }

    @Test fun wingAntiIceMessageFollowsThePanelGroundFlag() {
        val s = initialSimState()
        s.wow = true
        assertEquals("LEFT WING ANTI-ICE SELECTED \u2014 valve inhibited on ground.", rules.setWingAntiIce(s, true, true).message)
        // trainer "Airborne logic" override: the panel treats the airplane as airborne
        assertEquals("RIGHT WING ANTI-ICE ON.", rules.setWingAntiIce(s, false, true, wow = false).message)
        assertTrue(rules.setWingAntiIce(s, false, true, wow = false).state.wingAntiIceR)
    }
}
