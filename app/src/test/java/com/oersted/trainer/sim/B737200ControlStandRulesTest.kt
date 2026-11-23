package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class B737200ControlStandRulesTest {
    private val R = B737200ControlStandRules

    @Test fun hydGateNeedsPressureAndAvailability() {
        assertTrue(R.hydOk(3000.0, true))
        assertFalse(R.hydOk(1500.0, true))
        assertFalse(R.hydOk(3000.0, false))
    }

    @Test fun pedestalLabelRoundsHalfUp() {
        assertEquals("0 / 0%", R.pedestalLabel(0.0, 0.0))
        assertEquals("50 / 100%", R.pedestalLabel(0.5, 1.0))
        assertEquals("13 / 7%", R.pedestalLabel(0.125, 0.065))
    }

    @Test fun reverserDeployNeedsEveryInterlock() {
        val ok = R.reverser(1, false, wow = true, running = true, throttle = 0.05, firePulled = false, hydA = 3000.0)
        assertTrue(ok.allowed); assertEquals("ENG 1 REVERSER DEPLOY", ok.note)
        for (r in listOf(
            R.reverser(2, false, wow = false, running = true, throttle = 0.0, firePulled = false, hydA = 3000.0),
            R.reverser(2, false, wow = true, running = false, throttle = 0.0, firePulled = false, hydA = 3000.0),
            R.reverser(2, false, wow = true, running = true, throttle = 0.06, firePulled = false, hydA = 3000.0),
            R.reverser(2, false, wow = true, running = true, throttle = 0.0, firePulled = true, hydA = 3000.0),
            R.reverser(2, false, wow = true, running = true, throttle = 0.0, firePulled = false, hydA = 1500.0),
        )) {
            assertFalse(r.allowed)
            assertEquals("ENG 2 REVERSER DEPLOY INHIBITED — ground/engine/fire/hydraulic interlock not satisfied.", r.note)
        }
    }

    @Test fun reverserStowIsAlwaysAllowed() {
        val r = R.reverser(2, true, wow = false, running = false, throttle = 1.0, firePulled = true, hydA = 0.0)
        assertTrue(r.allowed); assertEquals("ENG 2 REVERSER STOW", r.note)
    }

    @Test fun cutoutNotes() {
        assertEquals("STAB TRIM CUTOUT A → CUTOUT", R.cutoutNote("A", true))
        assertEquals("STAB TRIM CUTOUT B → NORMAL", R.cutoutNote("B", false))
    }

    @Test fun leverGeometry() {
        assertEquals(0.0, R.thumbTop(1.0), 1e-9)
        assertEquals(144.0, R.thumbTop(0.0), 1e-9)
        assertEquals(72.0, R.thumbTop(0.5), 1e-9)
        assertEquals(1.0, R.valueAt(0.0), 1e-9)
        assertEquals(1.0, R.valueAt(18.0), 1e-9)
        assertEquals(0.0, R.valueAt(162.0), 1e-9)
        assertEquals(0.0, R.valueAt(500.0), 1e-9)
        assertEquals(0.5, R.valueAt(90.0), 1e-9)
    }

    @Test fun scaleToFit() {
        assertEquals(0.5, R.scale(2000.0), 1e-9)
        assertEquals(0.3, R.scale(0.0), 1e-9)
        assertEquals(360.0 / 1040.0, R.scale(360.0), 1e-9)
    }
}
