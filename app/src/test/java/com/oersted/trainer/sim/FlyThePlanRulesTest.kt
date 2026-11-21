package com.oersted.trainer.sim

import com.oersted.trainer.sim.FlightPhases.Phase
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FlyThePlanRulesTest {
    @Test fun disabledWithoutPlan() {
        assertEquals("Activate a flight plan first", FlyThePlanRules.disabledReason(false)); assertEquals("", FlyThePlanRules.disabledReason(true))
    }

    @Test fun loadsFirstOnlyOnTheGroundOutsideReady() {
        assertTrue(FlyThePlanRules.needsLoad(true, true, Phase.NO_PLAN)); assertTrue(FlyThePlanRules.needsLoad(true, true, Phase.TAKEOFF))
        assertFalse(FlyThePlanRules.needsLoad(true, true, Phase.READY)); assertFalse(FlyThePlanRules.needsLoad(true, false, Phase.CLIMB)); assertFalse(FlyThePlanRules.needsLoad(false, true, Phase.NO_PLAN))
    }
}
