package com.oersted.trainer.sim

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HydraulicTrainerRulesTest {
    private val rules = HydraulicTrainerRules

    private fun valueOf(s: SimState, k: String): Boolean = when (k) {
        "engHyd1" -> s.engHyd1
        "engHyd2" -> s.engHyd2
        "elecHyd1" -> s.elecHyd1
        "elecHyd2" -> s.elecHyd2
        "groundInterconnect" -> s.groundInterconnect
        "hydServicingConnected" -> s.hydServicingConnected
        else -> s.hydGroundPowerConnected
    }

    @Test fun everyFlipKeyFlipsOnlyItself() {
        val s = initialSimState()
        for (k in rules.FLIP_KEYS) {
            val t = rules.toggle(s, k)
            assertTrue(valueOf(t, k) != valueOf(s, k)) // the named switch changed
            val others = rules.FLIP_KEYS.filter { it != k }
            assertTrue(others.all { valueOf(t, it) == valueOf(s, it) }) // the rest did not
        }
    }

    @Test fun unknownSwitchIsRefused() {
        var refused = false
        try { rules.toggle(initialSimState(), "fuelCrossfeed") } catch (e: IllegalArgumentException) { refused = true }
        assertTrue(refused)
    }

    @Test fun stbyModesSet() {
        assertEquals("AUTO", rules.setStbyHyd(initialSimState(), "AUTO").stbyHyd)
        assertEquals(3, rules.STBY_MODES.size)
    }

    @Test fun elecPumpsFollowTheirTransferBus() {
        val d = Derived()
        d.transferBus2Powered = true
        assertFalse(rules.elecPumpEnabled(d, 1))
        assertTrue(rules.elecPumpEnabled(d, 2))
    }

    @Test fun groundServicingNeedsWeightOnWheels() {
        val s = initialSimState()
        s.wow = false
        assertFalse(rules.groundServicingEnabled(s))
        s.wow = true
        assertTrue(rules.groundServicingEnabled(s))
    }

    @Test fun airCartPressureAndInterconnectLabel() {
        val c = rules.toggleGroundAirCart(initialSimState())
        assertEquals(45.0, c.groundPneumaticPsi, 0.0)
        assertEquals("OPEN", rules.interconnectState(true))
        assertEquals("CLOSED", rules.interconnectState(false))
    }

    @Test fun switchStripTexts() {
        assertEquals("NO AC BUS 2", rules.elecPumpDetail(false, true, 2))
        assertEquals("SYSTEM B · RUNNING", rules.elecPumpDetail(true, true, 1))
        assertEquals("SYSTEM B · NOT RUNNING", rules.elecPumpDetail(true, false, 1))
        assertEquals("B → A LIVE", rules.interconnectDetail(true))
        assertEquals("GROUND", rules.interconnectDetail(false))
        assertEquals("AIRBORNE", rules.servicingDetail(false))
        assertEquals("GPMU · PRESSURE / RETURN", rules.gpmuDetail(true))
        assertEquals("GROUND ONLY", rules.airCartDetail(false))
        assertEquals("DISCONNECTED", rules.connectedState(false))
        assertEquals("A · 3001 PSI", rules.pressureText("A", 3000.5))
    }

    @Test fun switchLiveAndInterconnectActual() {
        assertFalse(rules.switchLive("CLOSED"))
        assertFalse(rules.switchLive("DISCONNECTED"))
        assertTrue(rules.switchLive("OPEN"))
        val s = initialSimState()
        s.groundInterconnect = true; s.hydGroundPowerConnected = true; s.wow = true; s.parkingBrake = false
        assertFalse(rules.interconnectActual(s))
        s.parkingBrake = true
        assertTrue(rules.interconnectActual(s))
    }
}
