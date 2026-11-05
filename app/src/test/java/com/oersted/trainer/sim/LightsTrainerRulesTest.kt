package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LightsTrainerRulesTest {
    private val rules = LightsTrainerRules

    @Test fun toggleInListAddsThenRemoves() {
        assertEquals("a", rules.toggleInList("", "a", ","))
        assertEquals("a,b", rules.toggleInList("a", "b", ","))
        assertEquals("b", rules.toggleInList("a,b", "a", ","))
        assertEquals("", rules.toggleInList("a", "a", ","))
    }

    @Test fun bulbFailureAndBreakerUseTheirSeparators() {
        val s = initialSimState()
        val f = rules.toggleBulbFailure(rules.toggleBulbFailure(s, "logo"), "taxi")
        assertEquals("logo,taxi", f.ltFail)
        val c = rules.toggleBreaker(rules.toggleBreaker(s, "cbA"), "cbB")
        assertEquals("cbA|cbB", c.ltCb)
        assertEquals("cbB", rules.toggleBreaker(c, "cbA").ltCb)
        assertEquals("", s.ltFail) // original untouched
    }

    @Test fun resetBreakersAndBulbsClearsOnlyFaults() {
        val s = rules.toggleBreaker(rules.toggleBulbFailure(initialSimState(), "logo"), "cbA")
        s.ltTaxi = true
        val r = rules.resetBreakersAndBulbs(s)
        assertEquals("", r.ltFail)
        assertEquals("", r.ltCb)
        assertTrue(r.ltTaxi)
    }

    @Test fun resetSwitchesKeepsFaultsAndRestoresSwitches() {
        val s = rules.toggleBreaker(rules.toggleBulbFailure(initialSimState(), "logo"), "cbA")
        s.ltTaxi = true
        s.ltLogo = true
        s.ltPanelCapt = 0.8
        val r = rules.resetSwitches(s)
        assertEquals("logo", r.ltFail)
        assertEquals("cbA", r.ltCb)
        assertEquals(false, r.ltTaxi)
        assertEquals(false, r.ltLogo)
        assertEquals(0.0, r.ltPanelCapt, 0.0)
        assertEquals("BRT", r.ltMasterDim)
    }

    @Test fun presetsKeepFaultsAndSetTheirSwitches() {
        val s = rules.toggleBreaker(rules.toggleBulbFailure(initialSimState(), "logo"), "cbA")
        val taxi = rules.applyPreset(s, "Taxi")
        assertEquals("logo", taxi.ltFail)
        assertEquals("cbA", taxi.ltCb)
        assertTrue(taxi.ltTaxi)
        assertTrue(taxi.ltTurnoffL && taxi.ltTurnoffR)
        assertEquals("STEADY", taxi.ltPosition)
        assertEquals("DIM", taxi.ltCabin)
        assertEquals("ARMED", taxi.ltEmergency)
        val takeoff = rules.applyPreset(s, "Takeoff")
        assertEquals("ON", takeoff.ltRetL)
        assertEquals("STROBE_STEADY", takeoff.ltPosition)
        val cruise = rules.applyPreset(s, "Cruise")
        assertEquals("AUTO", cruise.ltNoSmoking)
        assertTrue(cruise.ltGalley)
    }

    @Test fun emergencyTestOnlyTouchesEmergencyLights() {
        val s = rules.applyPreset(initialSimState(), "Taxi")
        val e = rules.applyPreset(s, "Emer lts test")
        assertEquals("ON", e.ltEmergency)
        assertTrue(e.ltTaxi) // not reset
        assertEquals(7, rules.PRESET_NAMES.size)
    }

    @Test fun unknownPresetIsRefused() {
        var refused = false
        try { rules.applyPreset(initialSimState(), "Nope") } catch (e: IllegalArgumentException) { refused = true }
        assertTrue(refused)
    }
}
