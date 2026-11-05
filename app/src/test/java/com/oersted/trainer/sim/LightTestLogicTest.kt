package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LightTestLogicTest {
    @Test fun gearLampsTestOnlyWithPowerAndAKeyOrSwitch() {
        assertTrue(LightTestLogic.gearTest(dcPower = true, ltTest = true, lightKey = 0))
        assertTrue(LightTestLogic.gearTest(dcPower = true, ltTest = false, lightKey = 2))
        assertFalse(LightTestLogic.gearTest(dcPower = true, ltTest = false, lightKey = 0))
        assertFalse(LightTestLogic.gearTest(dcPower = false, ltTest = true, lightKey = 2))
    }

    @Test fun comparatorLitsOnTheCompTestToo() {
        assertTrue(LightTestLogic.comparatorLit(dcPower = true, ltTest = false, compTest = true, lightKey = 1))
        assertTrue(LightTestLogic.comparatorLit(dcPower = true, ltTest = false, compTest = false, lightKey = 2))
        assertFalse(LightTestLogic.comparatorLit(dcPower = true, ltTest = false, compTest = false, lightKey = 1))
        assertFalse(LightTestLogic.comparatorLit(dcPower = false, ltTest = true, compTest = true, lightKey = 2))
    }

    @Test fun keyPointsToItsPosition() {
        assertEquals(90.0, LightTestLogic.keyAngleDeg(0), 0.0)
        assertEquals(180.0, LightTestLogic.keyAngleDeg(1), 0.0)
        assertEquals(0.0, LightTestLogic.keyAngleDeg(2), 0.0)
    }

    @Test fun pressCyclesBrightDimTest() {
        assertEquals(1, LightTestLogic.nextLightKey(0))
        assertEquals(2, LightTestLogic.nextLightKey(1))
        assertEquals(0, LightTestLogic.nextLightKey(2))
    }
}
