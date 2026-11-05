package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GearLeverLogicTest {
    @Test fun upIsInhibitedOnTheGroundUnlessOverridden() {
        val locked = GearLeverLogic.select("UP", wow = true, override = false)
        assertEquals("OFF", locked.gear)
        assertTrue(locked.locked)
        assertEquals("GEAR SELECTOR LOCKED — UP inhibited on ground.", locked.message)
        val over = GearLeverLogic.select("UP", wow = true, override = true)
        assertEquals("UP", over.gear)
        assertFalse(over.locked)
        assertTrue(over.message == null)
    }

    @Test fun upIsAllowedInTheAir() {
        val s = GearLeverLogic.select("UP", wow = false, override = false)
        assertEquals("UP", s.gear)
        assertFalse(s.locked)
    }

    @Test fun downAndOffAreNeverInhibited() {
        assertEquals("DN", GearLeverLogic.select("DN", wow = true, override = false).gear)
        assertEquals("OFF", GearLeverLogic.select("OFF", wow = true, override = false).gear)
    }

    @Test fun tapCyclesThroughTheDetents() {
        assertEquals("OFF", GearLeverLogic.nextFrom("UP"))
        assertEquals("DN", GearLeverLogic.nextFrom("OFF"))
        assertEquals("UP", GearLeverLogic.nextFrom("DN"))
        assertEquals("OFF", GearLeverLogic.nextFrom("nonsense"))
    }

    @Test fun slotHeightsAndLockTag() {
        assertEquals(50, GearLeverLogic.SLOT_TOP_PERCENT[GearLeverLogic.index("OFF")])
        assertEquals(0, GearLeverLogic.index("bogus"))
        assertTrue(GearLeverLogic.showLockOutTag(true))
        assertFalse(GearLeverLogic.showLockOutTag(false))
    }
}
