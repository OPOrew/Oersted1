package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Test

class InstrumentReadoutsTest {
    @Test fun roundingIsJsHalfUp() {
        assertEquals(3L, InstrumentReadouts.jsRound(2.5))
        assertEquals(-2L, InstrumentReadouts.jsRound(-2.5))
    }

    @Test fun padZeroRoundsAndNeverTruncates() {
        assertEquals("007", InstrumentReadouts.padZero(7.4, 3))
        assertEquals("1234", InstrumentReadouts.padZero(1234.0, 3))
    }

    @Test fun yawNeedleFollowsTheTestKey() {
        assertEquals(-32.0, InstrumentReadouts.yawNeedleDeg(1), 0.0)
        assertEquals(32.0, InstrumentReadouts.yawNeedleDeg(2), 0.0)
        assertEquals(0.0, InstrumentReadouts.yawNeedleDeg(0), 0.0)
    }

    @Test fun fuelLedIsBlankWithoutPowerAndReadsEightEightEightOnTest() {
        assertEquals("", InstrumentReadouts.qtyLedText(dcPower = false, value = 500.0, testing = false))
        assertEquals("888", InstrumentReadouts.qtyLedText(dcPower = true, value = 500.0, testing = true))
        assertEquals(" 45", InstrumentReadouts.qtyLedText(dcPower = true, value = 45.0, testing = false))
    }

    @Test fun iasStripClampsWhenPoweredAndShowsSixtyWhenNot() {
        assertEquals("060", InstrumentReadouts.iasStripText(250.0, powered = false))
        assertEquals("250", InstrumentReadouts.iasStripText(250.4, powered = true))
        assertEquals("999", InstrumentReadouts.iasStripText(1500.0, powered = true))
        assertEquals("000", InstrumentReadouts.iasStripText(-3.0, powered = true))
    }
}
