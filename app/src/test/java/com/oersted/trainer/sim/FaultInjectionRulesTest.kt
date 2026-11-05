package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FaultInjectionRulesTest {
    private val rules = FaultInjectionRules

    @Test fun centerPumpToggleClearsRelayTripsAndTimers() {
        val s = initialSimState()
        s.fuelCenterPump1RelayTripped = true
        s.fuelCenterPump2RelayTripped = true
        s.fuelCenterPump1LowPressureTimer = 7.0
        val c = rules.toggleCenterPumpAutoShutoff(s)
        assertFalse(c.fuelCenterPumpAutoShutoffInstalled) // the initial state is POST-SB (true), so one press makes it PRE-SB
        assertFalse(c.fuelCenterPump1RelayTripped)
        assertFalse(c.fuelCenterPump2RelayTripped)
        assertEquals(0.0, c.fuelCenterPump1LowPressureTimer, 0.0)
        assertTrue(s.fuelCenterPump1RelayTripped) // original untouched
    }

    @Test fun centerPumpLabelsMatchTheWeb() {
        assertEquals("POST-SB 28A1228", rules.centerPumpLabel(true))
        assertEquals("PRE-SB", rules.centerPumpLabel(false))
    }

    @Test fun adverseYawCueRoundsLikeJavaScript() {
        assertEquals("OFF", rules.adverseYawCueLine(false, 0.9, "LEFT"))
        assertEquals("50% LEFT", rules.adverseYawCueLine(true, 0.5, "LEFT"))
        assertEquals("73% RIGHT", rules.adverseYawCueLine(true, 0.725, "RIGHT"))
    }

    @Test fun adviceOnlyWithTheScenarioOn() {
        assertEquals(null, rules.adverseYawAdvice(false, false))
        assertEquals("ADD RUDDER IN TURN DIRECTION", rules.adverseYawAdvice(true, false))
        assertEquals("COORDINATED \u2014 CUE REDUCED", rules.adverseYawAdvice(true, true))
    }
}
