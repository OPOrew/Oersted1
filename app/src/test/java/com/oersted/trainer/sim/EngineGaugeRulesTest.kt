package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class EngineGaugeRulesTest {
    private val R = EngineGaugeRules

    @Test fun lowOilNeedsARunningEngineAndUnderThirteenPsi() {
        assertTrue(R.lowOilLit(running = true, oilPressure = 12.9))
        assertFalse(R.lowOilLit(running = true, oilPressure = 13.0))
        assertFalse(R.lowOilLit(running = false, oilPressure = 0.0))
    }

    @Test fun oilTemperatureFollowsN2AndTheIdleValue() {
        assertEquals(20.0, R.oilTemperature(dcPower = false, running = false, n2 = 50.0), 0.0)
        assertEquals(30.0, R.oilTemperature(dcPower = true, running = false, n2 = 0.0), 1e-9)
        assertEquals(125.0, R.oilTemperature(dcPower = true, running = true, n2 = 100.0), 1e-9)
        assertEquals(125.0, R.oilTemperature(dcPower = true, running = true, n2 = 150.0), 1e-9)
    }

    @Test fun oilQuantityTestReadsFourGallons() {
        assertEquals(4.0, R.oilQuantityGallons(test = true, qty = 0.0), 0.0)
        assertEquals(5.0, R.oilQuantityGallons(test = false, qty = 100.0), 1e-9)
    }

    @Test fun fuelFlowIsClampedThenConverted() {
        assertEquals(0.0, R.fuelFlowLbPerHour(-5.0, 2.2046), 0.0)
        assertEquals(2.2046 * 100.0, R.fuelFlowLbPerHour(100.0, 2.2046), 1e-9)
    }

    @Test fun bandsIncludeTheLowerLimitAndExcludeTheUpper() {
        assertEquals("green", R.bandFor(619.9, R.EGT_BANDS)?.tone)
        assertEquals("amber", R.bandFor(620.0, R.EGT_BANDS)?.tone)
        assertEquals("red", R.bandFor(900.0 - 1, R.EGT_BANDS)?.tone)
        assertTrue(R.bandFor(900.0, R.EGT_BANDS) == null)
        assertEquals("blue", R.bandFor(10.0, R.OIL_TEMP_BANDS)?.tone)
        assertTrue(R.bandFor(20.0, R.OIL_PRESSURE_BANDS) == null)
    }
}
